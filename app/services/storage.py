"""Storage facade — delegates to the configured backend."""

from pathlib import Path

from app.models.file import FileNode, StorageInfo
from app.services.storage_backend import get_backend


def get_abs_path(relative_path: str) -> Path:
    return get_backend().get_abs_path(relative_path)


def get_tree(base: str = "") -> list[FileNode]:
    return get_backend().get_tree(base)


def get_total_size() -> int:
    return get_backend().get_total_size()


def format_size(byte_count: int) -> str:
    for unit in ("B", "KB", "MB", "GB", "TB"):
        if byte_count < 1024:
            return f"{byte_count:.1f} {unit}"
        byte_count /= 1024
    return f"{byte_count:.1f} PB"


def get_storage_info() -> StorageInfo:
    return get_backend().get_storage_info()
