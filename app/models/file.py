"""Data models for files, directories, and storage info."""

from pydantic import BaseModel, Field


class FileNode(BaseModel):
    """A single file or directory node in the tree."""

    name: str
    path: str
    is_dir: bool = Field(alias="is_dir", serialization_alias="is_dir")
    size: int = 0
    modified: float = 0.0
    children: list["FileNode"] = Field(default_factory=list, alias="children")


class Tree(BaseModel):
    """Root tree wrapper."""

    root: list[FileNode] = Field(default_factory=list, alias="root")


class StorageInfo(BaseModel):
    """Storage quota and usage information."""

    used: int
    used_human: str
    max: int
    max_human: str
    percent: float
