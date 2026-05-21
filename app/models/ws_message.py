"""WebSocket message types for real-time synchronization."""

from enum import StrEnum

from pydantic import BaseModel, Field


class WsMessageType(StrEnum):
    FILE_ADDED = "file_added"
    FILE_DELETED = "file_deleted"
    FILE_MOVED = "file_moved"
    FILE_RENAMED = "file_renamed"
    USER_COUNT = "user_count"


class WsMessage(BaseModel):
    """Outgoing WebSocket message, discriminated by type."""

    type: WsMessageType
    path: str | None = None
    name: str | None = None
    is_dir: bool | None = Field(default=None, alias="is_dir")
    size: int | None = None
    src: str | None = None  # for move/rename
    dst: str | None = None  # for move/rename
    count: int | None = None  # for user_count
