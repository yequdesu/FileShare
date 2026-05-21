"""Storage backend protocol and registry."""

from pathlib import Path
from typing import Protocol, runtime_checkable

from app.models.file import FileNode, StorageInfo


@runtime_checkable
class StorageBackend(Protocol):
    """Protocol that all storage backends must implement."""

    def get_abs_path(self, relative_path: str) -> Path:
        """Resolve a relative path safely within the storage root."""
        ...

    def get_tree(self, base: str = "") -> list[FileNode]:
        """Return a recursive tree of files and directories under base."""
        ...

    def get_total_size(self) -> int:
        """Return total size of all files in bytes."""
        ...

    def get_storage_info(self) -> StorageInfo:
        """Return typed storage quota and usage information."""
        ...


# Single backend instance, set at startup
_backend: StorageBackend | None = None


def set_backend(backend: StorageBackend) -> None:
    """Configure the active storage backend."""
    global _backend
    _backend = backend


def get_backend() -> StorageBackend:
    """Get the current storage backend."""
    if _backend is None:
        raise RuntimeError("Storage backend not configured. Call set_backend() at startup.")
    return _backend
