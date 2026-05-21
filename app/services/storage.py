import os
from pathlib import Path
from config import DATA_DIR

Path(DATA_DIR).mkdir(parents=True, exist_ok=True)


def get_abs_path(relative_path: str) -> Path:
    """Resolve a relative path safely within DATA_DIR, blocking traversal."""
    if relative_path.startswith("/"):
        relative_path = relative_path[1:]
    resolved = (Path(DATA_DIR) / relative_path).resolve()
    root = Path(DATA_DIR).resolve()
    if not str(resolved).startswith(str(root)):
        raise ValueError("path traversal blocked")
    return resolved


def get_tree(base: str = "") -> list:
    """Return a recursive tree of files and directories under base."""
    dir_path = Path(DATA_DIR) / base if base else Path(DATA_DIR)
    items = []
    try:
        entries = sorted(
            dir_path.iterdir(), key=lambda e: (not e.is_dir(), e.name.lower())
        )
        for entry in entries:
            stat = entry.stat()
            rel = str(entry.relative_to(DATA_DIR))
            item = {
                "name": entry.name,
                "path": rel,
                "is_dir": entry.is_dir(),
                "size": stat.st_size if entry.is_file() else 0,
                "modified": stat.st_mtime,
            }
            if entry.is_dir():
                item["children"] = get_tree(rel)
            items.append(item)
    except FileNotFoundError:
        pass
    return items


def get_total_size() -> int:
    total = 0
    for dirpath, _, filenames in os.walk(DATA_DIR):
        for f in filenames:
            try:
                total += os.path.getsize(os.path.join(dirpath, f))
            except OSError:
                pass
    return total


def format_size(byte_count: int) -> str:
    for unit in ("B", "KB", "MB", "GB", "TB"):
        if byte_count < 1024:
            return f"{byte_count:.1f} {unit}"
        byte_count /= 1024
    return f"{byte_count:.1f} PB"
