from pathlib import Path
import mimetypes
from fastapi import APIRouter, Request, HTTPException, Query
from fastapi.responses import HTMLResponse, FileResponse
from fastapi.templating import Jinja2Templates
from app.services.storage import get_abs_path

router = APIRouter()
templates = Jinja2Templates(directory=str(Path(__file__).parent.parent / "templates"))

MIME_CATEGORIES = {
    "image": {"image/jpeg", "image/png", "image/gif", "image/webp", "image/svg+xml", "image/bmp"},
    "video": {"video/mp4", "video/webm", "video/ogg", "video/quicktime"},
    "audio": {"audio/mpeg", "audio/wav", "audio/ogg", "audio/flac", "audio/aac", "audio/webm"},
    "pdf": {"application/pdf"},
}

SOURCE_EXTS = {
    ".py", ".js", ".ts", ".jsx", ".tsx", ".go", ".rs", ".java", ".c", ".cpp",
    ".h", ".hpp", ".css", ".scss", ".less", ".html", ".htm", ".xml", ".json",
    ".yaml", ".yml", ".toml", ".ini", ".cfg", ".sh", ".bash", ".sql", ".rb",
    ".php", ".swift", ".kt", ".scala", ".lua", ".r", ".pl", ".dart", ".vue",
    ".svelte", ".txt", ".log", ".env", ".gitignore", ".makefile",
}

MARKDOWN_EXTS = {".md", ".markdown"}


def classify(mime: str, filename: str) -> str:
    for cat, mimes in MIME_CATEGORIES.items():
        if mime in mimes:
            return cat
    ext = filename.lower().rsplit(".", 1)
    ext = "." + ext[-1] if len(ext) > 1 else ""
    if ext in MARKDOWN_EXTS:
        return "markdown"
    if ext in SOURCE_EXTS:
        return "code"
    if mime and mime.startswith("text/"):
        return "text"
    return "other"


@router.get("/preview", response_class=HTMLResponse)
async def preview(request: Request, path: str = Query(...)):
    abs_path = get_abs_path(path)
    if not abs_path.exists() or abs_path.is_dir():
        raise HTTPException(404, "not found")

    mime, _ = mimetypes.guess_type(abs_path.name)
    mime = mime or "application/octet-stream"
    category = classify(mime, abs_path.name)

    return templates.TemplateResponse("preview.html", {
        "request": request,
        "filename": abs_path.name,
        "path": path,
        "mime": mime,
        "category": category,
        "size": abs_path.stat().st_size,
    })


@router.get("/raw")
async def raw(path: str = Query(...)):
    abs_path = get_abs_path(path)
    if not abs_path.exists() or abs_path.is_dir():
        raise HTTPException(404, "not found")
    mime, _ = mimetypes.guess_type(abs_path.name)
    return FileResponse(abs_path, media_type=mime or "application/octet-stream")
