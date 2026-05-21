from pathlib import Path
import mimetypes
import asyncio
import urllib.request
import urllib.error
from fastapi import APIRouter, Request, HTTPException, Query
from fastapi.responses import HTMLResponse, FileResponse, Response
from fastapi.templating import Jinja2Templates
from app.services.storage import get_abs_path
from config import KROKI_URL

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
    ".h", ".hpp", ".css", ".scss", ".less", ".xml", ".json",
    ".yaml", ".yml", ".toml", ".ini", ".cfg", ".sh", ".bash", ".sql", ".rb",
    ".php", ".swift", ".kt", ".scala", ".lua", ".r", ".pl", ".dart", ".vue",
    ".svelte", ".txt", ".log", ".env", ".gitignore", ".makefile",
}

HTML_EXTS = {".html", ".htm"}

MARKDOWN_EXTS = {".md", ".markdown"}

# Kroki diagram extensions -> diagram type
DIAGRAM_EXTS = {
    ".puml": "plantuml",
    ".pu": "plantuml",
    ".plantuml": "plantuml",
    ".mmd": "mermaid",
    ".mermaid": "mermaid",
    ".dot": "graphviz",
    ".gv": "graphviz",
    ".d2": "d2",
    ".erd": "erd",
    ".excalidraw": "excalidraw",
    ".blockdiag": "blockdiag",
    ".seqdiag": "seqdiag",
    ".actdiag": "actdiag",
    ".nwdiag": "nwdiag",
    ".c4plantuml": "c4plantuml",
    ".svgbob": "svgbob",
    ".vega": "vega",
    ".vegalite": "vegalite",
    ".wavedrom": "wavedrom",
}


def classify(mime: str, filename: str) -> str:
    for cat, mimes in MIME_CATEGORIES.items():
        if mime in mimes:
            return cat
    ext = filename.lower().rsplit(".", 1)
    ext = "." + ext[-1] if len(ext) > 1 else ""
    if ext in DIAGRAM_EXTS:
        return "diagram"
    if ext in MARKDOWN_EXTS:
        return "markdown"
    if ext in HTML_EXTS:
        return "html"
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


@router.get("/kroki")
async def kroki_render(path: str = Query(...)):
    """Render a diagram file via Kroki and return the image."""
    abs_path = get_abs_path(path)
    if not abs_path.exists() or abs_path.is_dir():
        raise HTTPException(404, "not found")

    ext = abs_path.name.lower().rsplit(".", 1)
    ext = "." + ext[-1] if len(ext) > 1 else ""
    diagram_type = DIAGRAM_EXTS.get(ext)
    if not diagram_type:
        raise HTTPException(400, f"unsupported diagram extension: {ext}")

    source = abs_path.read_text(encoding="utf-8")

    def _call_kroki():
        url = f"{KROKI_URL}/{diagram_type}/svg"
        data = source.encode("utf-8")
        req = urllib.request.Request(url, data=data, method="POST")
        req.add_header("Content-Type", "text/plain")
        req.add_header("User-Agent", "FileShare/1.0")
        try:
            with urllib.request.urlopen(req, timeout=15) as resp:
                return resp.read(), resp.headers.get_content_type()
        except urllib.error.HTTPError as e:
            body = e.read()
            # some diagram types (e.g. D2) return 4xx with valid SVG in body
            # body may be prefixed with "Error NNN: " — strip it
            if body:
                stripped = body
                if body.startswith(b"Error "):
                    idx = body.find(b": ")
                    if idx != -1:
                        stripped = body[idx + 2:]
                if stripped.startswith((b"<?xml", b"<svg", b"<?plantuml")):
                    return stripped, "image/svg+xml"
            return None, None

    body, content_type = await asyncio.to_thread(_call_kroki)

    if body is None:
        # fallback: return source as plain text
        return Response(source, media_type="text/plain")

    return Response(body, media_type=content_type or "image/svg+xml")
