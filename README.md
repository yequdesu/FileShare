# FileShare

Self-hosted file sharing and management web app with a VS Code-style interface.

Built with FastAPI (Python) and vanilla HTML / CSS / JavaScript.

## Features

- **File tree explorer** -- expand/collapse folders, codicon icons
- **New File / New Folder / Upload** -- toolbar buttons and right-click context menu
- **Drag-and-drop upload** -- sidebar bottom drop zone with per-file progress bar, or drop onto any folder in the tree. Auto-detects target: selected folder, parent of selected file, or root
- **Internal drag-and-drop** -- reorganize files by dragging into folders or root
- **Inline create and rename** -- placeholder row enters rename mode immediately; press F2 or select Rename to edit in-place (file extension preserved by default)
- **Click-away deselect** -- clicking outside the tree clears selection highlight
- **File preview** -- images, video, audio, PDF, Markdown (rendered), and syntax-highlighted code
- **Real-time sync** -- WebSocket broadcasts file changes and online user count
- **Storage meter** -- visual bar with numeric usage display

## Quick start

### Local

```bash
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --host 0.0.0.0 --port 8080 --reload
```

Open http://localhost:8080.

### Docker

```bash
docker compose up --build
```

Data persists in `./data`.

## Configuration

All via environment variables:

| Variable | Default | Description |
|----------|---------|-------------|
| `DATA_DIR` | `./data` | File storage root |
| `MAX_TOTAL_SIZE_GB` | `10` | Total storage quota |
| `MAX_FILE_SIZE_MB` | `2048` | Per-file upload limit |
| `HOST` | `0.0.0.0` | Server bind address |
| `PORT` | `8080` | Server listen port |

## API

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/tree` | Recursive file tree |
| `GET` | `/api/storage` | Storage usage stats |
| `POST` | `/api/upload?dir=` | Upload file(s) |
| `DELETE` | `/api/delete?path=` | Delete file or folder |
| `GET` | `/api/download?path=` | Download file |
| `POST` | `/api/mkdir?path=` | Create directory |
| `POST` | `/api/move?src=&dst=` | Move / rename |
| `POST` | `/api/rename?path=&name=` | Rename in-place |
| `GET` | `/api/preview?path=` | HTML preview page |
| `GET` | `/api/raw?path=` | Raw file bytes |
| `WS` | `/ws` | Real-time events |

## Keyboard shortcuts

| Key | Action |
|-----|--------|
| `Del` | Delete selected item |
| `F2` | Inline rename |
| `Ctrl+Shift+C` | Copy absolute path |

## Project structure

```
file-share/
  app/
    main.py              FastAPI entry point
    ws.py                 WebSocket manager
    routes/
      files.py            CRUD endpoints
      preview.py          File preview
    services/
      storage.py          Path resolution, tree builder, size calc
    templates/
      preview.html        Preview template
    static/
      index.html          Main layout
      app.js              Frontend logic
      style.css           VS Code dark theme
      codicon.css/.ttf    VS Code icons
  config.py               Env-based config
  requirements.txt
  Dockerfile
  docker-compose.yml
  data/                   File storage (gitignored)
```

## License

MIT
