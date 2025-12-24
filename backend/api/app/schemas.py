from datetime import datetime
from pydantic import BaseModel
from typing import Optional


class ItemOut(BaseModel):
    id: int
    type: str
    name: str
    parent_id: Optional[int] = None

    mime_type: Optional[str] = None
    size_bytes: int = 0

    modified_at: Optional[datetime] = None
    modified_by: Optional[str] = None  # friendly name (we’ll fill this in main.py)

    class Config:
        from_attributes = True


class CreateFolderIn(BaseModel):
    name: str
    parent_id: Optional[int] = None


class RenameIn(BaseModel):
    new_name: str


class MoveIn(BaseModel):
    new_parent_id: Optional[int] = None


class CreateShareLinkIn(BaseModel):
    role: str                  # "viewer" | "editor"
    expires_in_hours: Optional[int] = None
