import shutil
import asyncio
import aiofiles
from fastapi import APIRouter, UploadFile, File, HTTPException, Query
from fastapi.responses import FileResponse
from config import DATA_DIR, MAX_TOTAL_SIZE_GB, MAX_FILE_SIZE_MB
from app.services.storage import get_abs_path, get_tree, get_total_size, get_storage_info
from app.ws import manager
from app.models.ws_message import WsMessage, WsMessageType

router = APIRouter()
_upload_lock = asyncio.Lock()  # 串行化上传，防止 TOCTOU 配额绕过


@router.get("/tree")
async def list_tree():
    return get_tree()


@router.get("/storage")
async def storage_info():
    return get_storage_info()


@router.post("/upload")
async def upload(file: UploadFile = File(...), dir: str = Query("")):
    max_bytes = int(MAX_TOTAL_SIZE_GB * 1024**3)

    async with _upload_lock:
        used = get_total_size()

        if used >= max_bytes:
            raise HTTPException(413, "storage limit reached")

        # 流式读取 + 流式写入，避免大文件撑爆内存
        CHUNK_SIZE = 1024 * 1024  # 1 MB
        target_dir = get_abs_path(dir)
        target_dir.mkdir(parents=True, exist_ok=True)
        dest = target_dir / file.filename

        file_size = 0
        async with aiofiles.open(dest, "wb") as f:
            while chunk := await file.read(CHUNK_SIZE):
                file_size += len(chunk)
                if file_size > MAX_FILE_SIZE_MB * 1024 * 1024:
                    raise HTTPException(413, f"file exceeds {MAX_FILE_SIZE_MB:.0f} MB limit")
                if used + file_size > max_bytes:
                    raise HTTPException(413, "upload would exceed storage limit")
                await f.write(chunk)

        if file_size == 0:
            raise HTTPException(400, "empty file")

        rel = str(dest.relative_to(DATA_DIR))
        await manager.broadcast(WsMessage(
            type=WsMessageType.FILE_ADDED,
            path=rel,
            name=file.filename,
            is_dir=False,
            size=file_size,
        ))
        return {"ok": True, "path": rel}


@router.delete("/delete")
async def delete_item(path: str = Query(...)):
    abs_path = get_abs_path(path)
    if not abs_path.exists():
        raise HTTPException(404, "not found")

    if abs_path.is_dir():
        shutil.rmtree(abs_path)
    else:
        abs_path.unlink()

    await manager.broadcast(WsMessage(type=WsMessageType.FILE_DELETED, path=path))
    return {"ok": True}


@router.get("/download")
async def download(path: str = Query(...)):
    abs_path = get_abs_path(path)
    if not abs_path.exists() or abs_path.is_dir():
        raise HTTPException(404, "not found")
    return FileResponse(abs_path, filename=abs_path.name)


@router.post("/mkdir")
async def create_directory(path: str = Query(...)):
    abs_path = get_abs_path(path)
    abs_path.mkdir(parents=True, exist_ok=True)
    rel = str(abs_path.relative_to(DATA_DIR))
    await manager.broadcast(WsMessage(
        type=WsMessageType.FILE_ADDED,
        path=rel,
        name=abs_path.name,
        is_dir=True,
        size=0,
    ))
    return {"ok": True, "path": rel}


@router.post("/move")
async def move_item(src: str = Query(...), dst: str = Query(...)):
    """Move/rename a file or folder.  dst is the new relative path."""
    src_path = get_abs_path(src)
    dst_path = get_abs_path(dst)

    if not src_path.exists():
        raise HTTPException(404, "source not found")
    if dst_path.exists():
        raise HTTPException(409, "destination already exists")

    dst_path.parent.mkdir(parents=True, exist_ok=True)
    shutil.move(str(src_path), str(dst_path))

    dst_rel = str(dst_path.relative_to(DATA_DIR))
    await manager.broadcast(WsMessage(type=WsMessageType.FILE_MOVED, src=src, dst=dst_rel))
    return {"ok": True, "path": dst_rel}


@router.post("/rename")
async def rename_item(path: str = Query(...), name: str = Query(...)):
    """Rename a file or folder in-place."""
    abs_path = get_abs_path(path)
    if not abs_path.exists():
        raise HTTPException(404, "not found")
    if "/" in name or name.strip() == "":
        raise HTTPException(400, "invalid name")

    new_path = abs_path.parent / name
    if new_path.exists():
        raise HTTPException(409, "name already exists")

    abs_path.rename(new_path)
    dst_rel = str(new_path.relative_to(DATA_DIR))
    await manager.broadcast(WsMessage(type=WsMessageType.FILE_RENAMED, src=path, dst=dst_rel))
    return {"ok": True, "path": dst_rel}
