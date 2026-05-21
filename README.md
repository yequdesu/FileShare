# FileShare

A self-hosted file sharing and management web application with a VS Code–style IDE interface.

Built with **FastAPI** (Python) and vanilla HTML / CSS / JavaScript.

---

## Features

- 📁 **File tree explorer** with VS Code codicons and folder expansion
- 📤 **Drag & drop** uploads — external files onto the drop zone or any folder in the tree
- 🔄 **Internal drag & drop** — reorganize files by dragging them into folders or to root
- 🖱️ **Right-click context menu** — New File, New Folder, Rename, Delete, Download, Copy Path
- ✏️ **Inline rename** — press `F2` or choose *Rename* to edit the filename in-place (extension is preserved by default)
- ➕ **Inline create** — *New File* / *New Folder* creates a placeholder row and immediately enters rename mode
- 📋 **Clipboard** — copy absolute or relative paths
- 👁️ **File preview** — images, videos, audio, PDF, Markdown (rendered), and syntax-highlighted code
- 🌐 **Real-time sync** — WebSocket broadcasts file changes and online user count to all connected clients
- 💾 **Storage meter** — visual bar and numeric usage display

---

## Quick start

### Local development

```bash
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --host 0.0.0.0 --port 8080 --reload
```

Open **http://localhost:8080**.

> `--reload` enables hot-reload for Python files. Static assets (CSS / JS) are served live — just refresh your browser.

### Docker

```bash
docker compose up --build
```

Uses port `8080` by default. Data is persisted in `./data` on the host.

---

## Configuration

All settings are read from environment variables:

| Variable | Default | Description |
|----------|---------|-------------|
| `DATA_DIR` | `./data` | File storage root directory |
| `MAX_TOTAL_SIZE_GB` | `10` | Total storage quota in GB |
| `MAX_FILE_SIZE_MB` | `2048` | Per-file upload limit in MB |
| `HOST` | `0.0.0.0` | Server bind address |
| `PORT` | `8080` | Server listen port |

---

## Project structure

```
file-share/
├── app/
│   ├── main.py              # FastAPI app entry point
│   ├── ws.py                # WebSocket connection manager
│   ├── routes/
│   │   ├── files.py         # CRUD endpoints (tree, upload, delete, move, rename, mkdir)
│   │   └── preview.py       # File preview with MIME-driven templates
│   ├── services/
│   │   └── storage.py       # Path resolution, tree builder, size calculation
│   ├── templates/
│   │   └── preview.html     # Jinja2 template for file preview
│   └── static/
│       ├── index.html       # Main SPA layout
│       ├── app.js           # Frontend logic (tree, drag-drop, context menu, inline edit)
│       ├── style.css        # VS Code dark-theme stylesheet
│       ├── codicon.css      # VS Code codicon font styles (vendored)
│       └── codicon.ttf      # VS Code codicon font
├── config.py                # Environment-based configuration
├── requirements.txt
├── Dockerfile
├── docker-compose.yml
└── data/                    # File storage (gitignored)
```

---

## API overview

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/tree` | Recursive file tree JSON |
| `GET` | `/api/storage` | Storage usage statistics |
| `POST` | `/api/upload?dir=` | Upload file(s) |
| `DELETE` | `/api/delete?path=` | Delete file or folder |
| `GET` | `/api/download?path=` | Download file |
| `POST` | `/api/mkdir?path=` | Create directory |
| `POST` | `/api/move?src=&dst=` | Move / rename |
| `POST` | `/api/rename?path=&name=` | Rename in-place |
| `GET` | `/api/preview?path=` | HTML preview page |
| `GET` | `/api/raw?path=` | Raw file bytes |
| `WS` | `/ws` | WebSocket for real-time events |

---

## Keyboard shortcuts

| Key | Action |
|-----|--------|
| `Del` | Delete selected file/folder |
| `F2` | Inline rename selected item |
| `Ctrl+Shift+C` | Copy absolute path |

---

## License

MIT
