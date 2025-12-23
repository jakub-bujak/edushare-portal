from pydantic import BaseModel
from typing import Optional, List
from datetime import datetime
from typing import Optional


class ItemOut(BaseModel):
    id: int
    parent_id: Optional[int]
    name: str
    type: str
    owner_user_id: int

    class Config:
        from_attributes = True

class CreateFolderIn(BaseModel):
    parent_id: Optional[int] = None
    name: str

class RenameIn(BaseModel):
    new_name: str

class MoveIn(BaseModel):
    new_parent_id: int | None


class CreateShareLinkIn(BaseModel):
    role: str = "viewer"               # viewer/editor
    expires_in_hours: Optional[int] = None  # e.g. 24, 168
