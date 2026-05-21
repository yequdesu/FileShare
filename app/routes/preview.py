from dataclasses import dataclass, field
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

# ------------------------------------------------------------------ #
#  Preview category registry                                          #
# ------------------------------------------------------------------ #

@dataclass
class PreviewCategory:
    """A registered preview category matching files by MIME type or extension."""
    name: str
    mimes: set[str] = field(default_factory=set)
    exts: set[str] = field(default_factory=set)
    fallback_text: bool = False  # catch-all for text/* MIME
    priority: int = 10  # lower = checked first


_preview_categories: list[PreviewCategory] = []


def register_preview(category: PreviewCategory) -> None:
    """Register a preview category. Earlier registrations checked first."""
    _preview_categories.append(category)


# Register built-in categories in priority order
register_preview(PreviewCategory(name="image", mimes={
    "image/jpeg", "image/png", "image/gif", "image/webp", "image/svg+xml", "image/bmp",
}))
register_preview(PreviewCategory(name="video", mimes={
    "video/mp4", "video/webm", "video/ogg", "video/quicktime",
}))
register_preview(PreviewCategory(name="audio", mimes={
    "audio/mpeg", "audio/wav", "audio/ogg", "audio/flac", "audio/aac", "audio/webm",
}))
register_preview(PreviewCategory(name="pdf", mimes={"application/pdf"}))
register_preview(PreviewCategory(name="diagram", exts={
    ".puml", ".pu", ".plantuml", ".mmd", ".mermaid",
    ".dot", ".gv", ".d2", ".erd", ".excalidraw",
    ".blockdiag", ".seqdiag", ".actdiag", ".nwdiag",
    ".c4plantuml", ".svgbob", ".vega", ".vegalite", ".wavedrom",
}))
register_preview(PreviewCategory(name="markdown", exts={".md", ".markdown"}))
register_preview(PreviewCategory(name="html", exts={".html", ".htm"}))
register_preview(PreviewCategory(name="code", exts={
    ".py", ".js", ".ts", ".jsx", ".tsx", ".go", ".rs", ".java", ".c", ".cpp",
    ".h", ".hpp", ".css", ".scss", ".less", ".xml", ".json",
    ".yaml", ".yml", ".toml", ".ini", ".cfg", ".sh", ".bash", ".sql", ".rb",
    ".php", ".swift", ".kt", ".scala", ".lua", ".r", ".pl", ".dart", ".vue",
    ".svelte", ".txt", ".log", ".env", ".gitignore", ".makefile",
}))
register_preview(PreviewCategory(name="text", fallback_text=True, priority=50))


# Kroki diagram extensions -> diagram type
DIAGRAM_MAP = {
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
    """Determine the preview category for a file using the registry."""
    ext = filename.lower().rsplit(".", 1)
    ext = "." + ext[-1] if len(ext) > 1 else ""

    for cat in _preview_categories:
        if cat.mimes and mime in cat.mimes:
            return cat.name
        if cat.exts and ext in cat.exts:
            return cat.name
        if cat.fallback_text and mime.startswith("text/"):
            return cat.name

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
    diagram_type = DIAGRAM_MAP.get(ext)
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
