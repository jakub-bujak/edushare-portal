from sqlalchemy import Column, Integer, String, DateTime, ForeignKey
from sqlalchemy.orm import relationship
from datetime import datetime
from .db import Base

class User(Base):
    __tablename__ = "users"
    id = Column(Integer, primary_key=True)
    provider = Column(String, nullable=False)
    provider_user_id = Column(String, nullable=False, index=True)
    display_name = Column(String, nullable=True)
    email = Column(String, nullable=True)

class Item(Base):
    __tablename__ = "items"
    id = Column(Integer, primary_key=True)
    parent_id = Column(Integer, ForeignKey("items.id"), nullable=True)
    name = Column(String, nullable=False)
    type = Column(String, nullable=False)  # "folder" | "file"
    owner_user_id = Column(Integer, ForeignKey("users.id"), nullable=False)

    created_at = Column(DateTime, default=datetime.utcnow)
    modified_at = Column(DateTime, default=datetime.utcnow)
    modified_by_user_id = Column(Integer, ForeignKey("users.id"), nullable=True)

    storage_path = Column(String, nullable=True)
    mime_type = Column(String, nullable=True)
    size_bytes = Column(Integer, nullable=True)

    parent = relationship("Item", remote_side=[id])

class ItemPermission(Base):
    __tablename__ = "item_permissions"
    id = Column(Integer, primary_key=True)
    item_id = Column(Integer, ForeignKey("items.id"), nullable=False)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    role = Column(String, nullable=False)  # viewer/editor

class ShareLink(Base):
    __tablename__ = "share_links"
    id = Column(Integer, primary_key=True)
    item_id = Column(Integer, ForeignKey("items.id"), nullable=False)
    token = Column(String, nullable=False, unique=True, index=True)
    role = Column(String, nullable=False)  # "viewer" or "editor"
    expires_at = Column(DateTime, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
