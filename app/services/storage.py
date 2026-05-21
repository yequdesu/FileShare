from pathlib import Path

from config import DATA_DIR
from app.models.file import FileNode, StorageInfo

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


def get_tree(base: str = "") -> list[FileNode]:
    """Return a recursive tree of files and directories under base."""
    dir_path = Path(DATA_DIR) / base if base else Path(DATA_DIR)
    items: list[FileNode] = []
    try:
        entries = sorted(
            dir_path.iterdir(), key=lambda e: (not e.is_dir(), e.name.lower())
        )
        for entry in entries:
            stat = entry.stat()
            rel = str(entry.relative_to(DATA_DIR))
            children = get_tree(rel) if entry.is_dir() else []
            items.append(FileNode(
                name=entry.name,
                path=rel,
                is_dir=entry.is_dir(),
                size=stat.st_size if entry.is_file() else 0,
                modified=stat.st_mtime,
                children=children,
            ))
    except FileNotFoundError:
        pass
    return items


def get_total_size() -> int:
    total = 0
    for f in Path(DATA_DIR).rglob("*"):
        if f.is_file():
            try:
                total += f.stat().st_size
            except OSError:
                pass
    return total


def format_size(byte_count: int) -> str:
    for unit in ("B", "KB", "MB", "GB", "TB"):
        if byte_count < 1024:
            return f"{byte_count:.1f} {unit}"
        byte_count /= 1024
    return f"{byte_count:.1f} PB"


def get_storage_info() -> StorageInfo:
    """Return typed storage info."""
    from config import MAX_TOTAL_SIZE_GB

    used = get_total_size()
    max_bytes = int(MAX_TOTAL_SIZE_GB * 1024**3)
    return StorageInfo(
        used=used,
        used_human=format_size(used),
        max=max_bytes,
        max_human=format_size(max_bytes),
        percent=round(used / max_bytes * 100, 1) if max_bytes > 0 else 0,
    )
