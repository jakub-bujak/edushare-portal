from fastapi import FastAPI, Depends, HTTPException, UploadFile, File, Query
from fastapi.responses import FileResponse
import os
import uuid
from datetime import datetime, timedelta

from sqlalchemy.orm import Session

from .db import Base, engine, get_db
from .models import User, Item, ItemPermission, ShareLink
from .schemas import ItemOut, CreateFolderIn, RenameIn, MoveIn, CreateShareLinkIn
from .auth import get_current_user_stub
from .permissions import get_effective_role, ROLE_ORDER

from fastapi.middleware.cors import CORSMiddleware

app = FastAPI(title="EduShare API (Local Dev)")

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5500",
        "http://127.0.0.1:5500",
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "http://localhost:3000",
        "http://127.0.0.1:3000",
        "http://localhost:8080",
        "http://127.0.0.1:8080",
    ],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

STORAGE_DIR = os.path.join(os.path.dirname(__file__), ".", "storage")
os.makedirs(STORAGE_DIR, exist_ok=True)

try:
    Base.metadata.create_all(bind=engine)
except Exception as e:
    # Don't crash the whole API if DB isn't ready yet (cloud startup)
    print("DB init skipped:", e)



from fastapi.middleware.cors import CORSMiddleware

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "https://jakub-bujak.github.io",
        "http://127.0.0.1:5500",
        "http://localhost:5500",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)



# ----------------- HELPERS -----------------
def upsert_user(db: Session, identity: dict) -> User:
    u = (
        db.query(User)
        .filter(
            User.provider == identity["provider"],
            User.provider_user_id == identity["provider_user_id"],
        )
        .first()
    )
    if not u:
        u = User(
            provider=identity["provider"],
            provider_user_id=identity["provider_user_id"],
            display_name=identity.get("display_name"),
            email=identity.get("email"),
        )
        db.add(u)
        db.commit()
        db.refresh(u)
    return u


def item_to_out(db: Session, item: Item) -> ItemOut:
    modified_by_name = None
    if getattr(item, "modified_by_user_id", None):
        u = db.query(User).filter(User.id == item.modified_by_user_id).first()
        if u:
            modified_by_name = u.display_name or u.provider_user_id

    return ItemOut(
        id=item.id,
        type=item.type,
        name=item.name,
        parent_id=item.parent_id,
        mime_type=item.mime_type,
        size_bytes=item.size_bytes or 0,
        modified_at=getattr(item, "modified_at", None),
        modified_by=modified_by_name,
    )


def touch_modified(item: Item, user: User):
    now = datetime.utcnow()
    if hasattr(item, "modified_at"):
        item.modified_at = now
    if hasattr(item, "modified_by_user_id"):
        item.modified_by_user_id = user.id


def get_valid_share_link(db: Session, token: str) -> ShareLink:
    link = db.query(ShareLink).filter(ShareLink.token == token).first()
    if link is None:
        raise HTTPException(status_code=404, detail="Share link not found")
    if link.expires_at and link.expires_at < datetime.utcnow():
        raise HTTPException(status_code=410, detail="Share link expired")
    return link


def is_descendant(db: Session, child_id: int, root_id: int) -> bool:
    """True if child_id is root_id OR inside root_id (walk parent chain)."""
    cur = db.query(Item).filter(Item.id == child_id).first()
    while cur:
        if cur.id == root_id:
            return True
        if cur.parent_id is None:
            return False
        cur = db.query(Item).filter(Item.id == cur.parent_id).first()
    return False


def share_root_item(db: Session, token: str) -> Item:
    link = get_valid_share_link(db, token)
    root = db.query(Item).filter(Item.id == link.item_id).first()
    if not root:
        raise HTTPException(404, "Item missing")
    return root


def require_share_role(db: Session, token: str, needed: str) -> ShareLink:
    link = get_valid_share_link(db, token)
    if ROLE_ORDER[link.role] < ROLE_ORDER[needed]:
        raise HTTPException(403, f"Share link does not allow {needed}")
    return link


# ----------------- BASICS -----------------
@app.get("/health")
def health():
    return {"ok": True}


@app.get("/me")
def me(db: Session = Depends(get_db), identity: dict = Depends(get_current_user_stub)):
    u = upsert_user(db, identity)
    return {"id": u.id, "display_name": u.display_name}


# ----------------- NORMAL (LOGGED-IN) API -----------------
@app.post("/folders", response_model=ItemOut)
def create_folder(
    body: CreateFolderIn,
    db: Session = Depends(get_db),
    identity: dict = Depends(get_current_user_stub),
):
    user = upsert_user(db, identity)

    if body.parent_id is not None:
        parent = db.query(Item).filter(Item.id == body.parent_id, Item.type == "folder").first()
        if not parent:
            raise HTTPException(404, "Parent folder not found")

        role = get_effective_role(db, user.id, parent)
        if ROLE_ORDER[role] < ROLE_ORDER["editor"]:
            raise HTTPException(403, "No permission to create folder here")

    now = datetime.utcnow()

    folder = Item(
        parent_id=body.parent_id,
        name=body.name,
        type="folder",
        owner_user_id=user.id,
        size_bytes=0,
        created_at=now,
        modified_at=now,
        modified_by_user_id=user.id,
    )
    db.add(folder)
    db.commit()
    db.refresh(folder)
    return item_to_out(db, folder)


@app.get("/root", response_model=list[ItemOut])
def list_root(db: Session = Depends(get_db), identity: dict = Depends(get_current_user_stub)):
    user = upsert_user(db, identity)
    items = db.query(Item).filter(Item.parent_id == None, Item.owner_user_id == user.id).all()
    return [item_to_out(db, it) for it in items]


@app.get("/folders/{folder_id}/children", response_model=list[ItemOut])
def list_children(
    folder_id: int,
    db: Session = Depends(get_db),
    identity: dict = Depends(get_current_user_stub),
):
    user = upsert_user(db, identity)

    folder = db.query(Item).filter(Item.id == folder_id, Item.type == "folder").first()
    if not folder:
        raise HTTPException(404, "Folder not found")

    role = get_effective_role(db, user.id, folder)
    if ROLE_ORDER[role] < ROLE_ORDER["viewer"]:
        raise HTTPException(403, "No permission to view this folder")

    items = db.query(Item).filter(Item.parent_id == folder_id).all()
    return [item_to_out(db, it) for it in items]


@app.post("/upload")
def upload_file(
    folder_id: int,
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    identity: dict = Depends(get_current_user_stub),
):
    user = upsert_user(db, identity)

    folder = db.query(Item).filter(Item.id == folder_id, Item.type == "folder").first()
    if not folder:
        raise HTTPException(404, "Folder not found")

    role = get_effective_role(db, user.id, folder)
    if ROLE_ORDER[role] < ROLE_ORDER["editor"]:
        raise HTTPException(403, "No permission to upload to this folder")

    ext = os.path.splitext(file.filename)[1]
    stored_name = f"{uuid.uuid4().hex}{ext}"
    stored_path = os.path.join(STORAGE_DIR, stored_name)

    contents = file.file.read()
    with open(stored_path, "wb") as f:
        f.write(contents)

    now = datetime.utcnow()

    item = Item(
        parent_id=folder_id,
        name=file.filename,
        type="file",
        owner_user_id=user.id,
        storage_path=stored_path,
        mime_type=file.content_type,
        size_bytes=len(contents),
        created_at=now,
        modified_at=now,
        modified_by_user_id=user.id,
    )
    db.add(item)
    touch_modified(folder, user)
    db.commit()
    db.refresh(item)

    return item_to_out(db, item)


@app.get("/download/{file_id}")
def download_file(
    file_id: int,
    db: Session = Depends(get_db),
    identity: dict = Depends(get_current_user_stub),
):
    user = upsert_user(db, identity)

    item = db.query(Item).filter(Item.id == file_id, Item.type == "file").first()
    if not item:
        raise HTTPException(404, "File not found")

    role = get_effective_role(db, user.id, item)
    if ROLE_ORDER[role] < ROLE_ORDER["viewer"]:
        raise HTTPException(403, "No permission to download this file")

    if not item.storage_path or not os.path.exists(item.storage_path):
        raise HTTPException(500, "Stored file missing on server")

    return FileResponse(
        path=item.storage_path,
        filename=item.name,
        media_type=item.mime_type or "application/octet-stream",
    )


@app.post("/items/{item_id}/rename")
def rename_item(
    item_id: int,
    body: RenameIn,
    db: Session = Depends(get_db),
    identity: dict = Depends(get_current_user_stub),
):
    user = upsert_user(db, identity)

    item = db.query(Item).filter(Item.id == item_id).first()
    if not item:
        raise HTTPException(404, "Item not found")

    role = get_effective_role(db, user.id, item)
    if ROLE_ORDER[role] < ROLE_ORDER["editor"]:
        raise HTTPException(403, "No permission to rename")

    item.name = body.new_name
    touch_modified(item, user)
    db.commit()
    return {"ok": True}


@app.post("/items/{item_id}/move")
def move_item(
    item_id: int,
    body: MoveIn,
    db: Session = Depends(get_db),
    identity: dict = Depends(get_current_user_stub),
):
    user = upsert_user(db, identity)

    item = db.query(Item).filter(Item.id == item_id).first()
    if not item:
        raise HTTPException(404, "Item not found")

    role_item = get_effective_role(db, user.id, item)
    if ROLE_ORDER[role_item] < ROLE_ORDER["editor"]:
        raise HTTPException(403, "No permission to move this item")

    if body.new_parent_id is not None:
        dest = db.query(Item).filter(Item.id == body.new_parent_id, Item.type == "folder").first()
        if not dest:
            raise HTTPException(404, "Destination folder not found")

        role_dest = get_effective_role(db, user.id, dest)
        if ROLE_ORDER[role_dest] < ROLE_ORDER["editor"]:
            raise HTTPException(403, "No permission to move into that folder")

        if item.id == dest.id:
            raise HTTPException(400, "Cannot move item into itself")

    item.parent_id = body.new_parent_id
    touch_modified(item, user)
    db.commit()
    return {"ok": True}


def delete_item_recursive(db: Session, item: Item):
    children = db.query(Item).filter(Item.parent_id == item.id).all()
    for child in children:
        delete_item_recursive(db, child)

    if item.type == "file" and item.storage_path:
        try:
            if os.path.exists(item.storage_path):
                os.remove(item.storage_path)
        except Exception:
            pass

    db.query(ItemPermission).filter(ItemPermission.item_id == item.id).delete()
    db.delete(item)


@app.delete("/items/{item_id}")
def delete_item(
    item_id: int,
    db: Session = Depends(get_db),
    identity: dict = Depends(get_current_user_stub),
):
    user = upsert_user(db, identity)

    item = db.query(Item).filter(Item.id == item_id).first()
    if not item:
        raise HTTPException(404, "Item not found")

    role = get_effective_role(db, user.id, item)
    if ROLE_ORDER[role] < ROLE_ORDER["editor"]:
        raise HTTPException(403, "No permission to delete")

    delete_item_recursive(db, item)
    db.commit()
    return {"ok": True}


# ----------------- SHARE LINK CREATION -----------------
@app.post("/share-links/{item_id}")
def create_share_link(
    item_id: int,
    body: CreateShareLinkIn,
    db: Session = Depends(get_db),
    identity: dict = Depends(get_current_user_stub),
):
    user = upsert_user(db, identity)

    item = db.query(Item).filter(Item.id == item_id).first()
    if not item:
        raise HTTPException(404, "Item not found")

    if item.owner_user_id != user.id:
        raise HTTPException(403, "Only owner can create share links")

    if body.role not in ("viewer", "editor"):
        raise HTTPException(400, "role must be viewer or editor")

    token = uuid.uuid4().hex
    expires_at = None
    if body.expires_in_hours is not None:
        expires_at = datetime.utcnow() + timedelta(hours=body.expires_in_hours)

    link = ShareLink(item_id=item_id, token=token, role=body.role, expires_at=expires_at)
    db.add(link)
    db.commit()
    db.refresh(link)

    return {"token": link.token, "role": link.role, "expires_at": link.expires_at}


# ----------------- SHARE LINK ACCESS (LOGIN REQUIRED) -----------------
@app.get("/s/{token}/meta")
def share_meta(
    token: str,
    db: Session = Depends(get_db),
    identity: dict = Depends(get_current_user_stub),
):
    # Login required, but the token defines access.
    upsert_user(db, identity)

    link = get_valid_share_link(db, token)
    root = db.query(Item).filter(Item.id == link.item_id).first()
    if not root:
        raise HTTPException(404, "Item missing")

    return {
        "token": link.token,
        "role": link.role,
        "root": item_to_out(db, root),
    }


@app.get("/s/{token}/children", response_model=list[ItemOut])
def share_children(
    token: str,
    folder_id: int | None = Query(default=None),
    db: Session = Depends(get_db),
    identity: dict = Depends(get_current_user_stub),
):
    # Login required
    upsert_user(db, identity)

    link = require_share_role(db, token, "viewer")
    root = share_root_item(db, token)

    if root.type != "folder":
        raise HTTPException(400, "Link is not for a folder")

    # If no folder_id provided, list root's children
    target_folder_id = folder_id or root.id

    # Must stay inside shared subtree
    if not is_descendant(db, target_folder_id, root.id):
        raise HTTPException(403, "Folder is outside shared subtree")

    folder = db.query(Item).filter(Item.id == target_folder_id, Item.type == "folder").first()
    if not folder:
        raise HTTPException(404, "Folder not found")

    kids = db.query(Item).filter(Item.parent_id == folder.id).all()
    return [item_to_out(db, it) for it in kids]


@app.get("/s/{token}/download/{file_id}")
def share_download_file(
    token: str,
    file_id: int,
    db: Session = Depends(get_db),
    identity: dict = Depends(get_current_user_stub),
):
    # Login required
    upsert_user(db, identity)

    require_share_role(db, token, "viewer")
    root = share_root_item(db, token)

    item = db.query(Item).filter(Item.id == file_id, Item.type == "file").first()
    if not item:
        raise HTTPException(404, "File not found")

    # Must be inside shared subtree (root itself can be a folder OR file)
    if root.type == "folder":
        if not is_descendant(db, item.parent_id or -1, root.id):
            raise HTTPException(403, "File is outside shared subtree")
    else:
        if item.id != root.id:
            raise HTTPException(403, "This link does not grant access to that file")

    if not item.storage_path or not os.path.exists(item.storage_path):
        raise HTTPException(500, "Stored file missing on server")

    resp = FileResponse(
        path=item.storage_path,
        filename=item.name,
        media_type=item.mime_type or "application/octet-stream",
    )
    resp.headers["Cache-Control"] = "no-store"
    return resp


# ----------------- SHARE LINK EDITOR ACTIONS -----------------
@app.post("/s/{token}/items/{item_id}/rename")
def share_rename_item(
    token: str,
    item_id: int,
    body: RenameIn,
    db: Session = Depends(get_db),
    identity: dict = Depends(get_current_user_stub),
):
    user = upsert_user(db, identity)
    require_share_role(db, token, "editor")

    root = share_root_item(db, token)
    item = db.query(Item).filter(Item.id == item_id).first()
    if not item:
        raise HTTPException(404, "Item not found")

    if root.type == "folder":
        if not is_descendant(db, item.id, root.id):
            raise HTTPException(403, "Item is outside shared subtree")
    else:
        if item.id != root.id:
            raise HTTPException(403, "This link does not allow editing that item")

    item.name = body.new_name
    touch_modified(item, user)
    db.commit()
    return {"ok": True}


@app.delete("/s/{token}/items/{item_id}")
def share_delete_item(
    token: str,
    item_id: int,
    db: Session = Depends(get_db),
    identity: dict = Depends(get_current_user_stub),
):
    user = upsert_user(db, identity)
    require_share_role(db, token, "editor")

    root = share_root_item(db, token)
    item = db.query(Item).filter(Item.id == item_id).first()
    if not item:
        raise HTTPException(404, "Item not found")

    # Do not allow deleting the root itself via share link (safety)
    if item.id == root.id:
        raise HTTPException(403, "Cannot delete the root shared item")

    if root.type == "folder":
        if not is_descendant(db, item.id, root.id):
            raise HTTPException(403, "Item is outside shared subtree")
    else:
        raise HTTPException(403, "This link does not allow deleting items")

    delete_item_recursive(db, item)
    db.commit()
    return {"ok": True}


@app.post("/s/{token}/upload")
def share_upload_file(
    token: str,
    folder_id: int,
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    identity: dict = Depends(get_current_user_stub),
):
    user = upsert_user(db, identity)
    require_share_role(db, token, "editor")

    root = share_root_item(db, token)
    if root.type != "folder":
        raise HTTPException(400, "Link is not for a folder")

    if not is_descendant(db, folder_id, root.id):
        raise HTTPException(403, "Folder is outside shared subtree")

    folder = db.query(Item).filter(Item.id == folder_id, Item.type == "folder").first()
    if not folder:
        raise HTTPException(404, "Folder not found")

    ext = os.path.splitext(file.filename)[1]
    stored_name = f"{uuid.uuid4().hex}{ext}"
    stored_path = os.path.join(STORAGE_DIR, stored_name)

    contents = file.file.read()
    with open(stored_path, "wb") as f:
        f.write(contents)

    now = datetime.utcnow()
    item = Item(
        parent_id=folder_id,
        name=file.filename,
        type="file",
        owner_user_id=user.id,  # local dev: uploader is "owner" in this simple model
        storage_path=stored_path,
        mime_type=file.content_type,
        size_bytes=len(contents),
        created_at=now,
        modified_at=now,
        modified_by_user_id=user.id,
    )
    db.add(item)
    touch_modified(folder, user)
    db.commit()
    db.refresh(item)

    return item_to_out(db, item)
