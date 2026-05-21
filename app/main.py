from pathlib import Path
from fastapi import FastAPI
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from app.routes import files, preview
from app.ws import router as ws_router

app = FastAPI(title="FileShare", docs_url=None, redoc_url=None)

app.include_router(files.router, prefix="/api")
app.include_router(preview.router, prefix="/api")
app.include_router(ws_router)

_static = Path(__file__).parent / "static"
_static.mkdir(exist_ok=True)
app.mount("/static", StaticFiles(directory=str(_static)), name="static")


@app.get("/")
async def root():
    return FileResponse(_static / "index.html")
