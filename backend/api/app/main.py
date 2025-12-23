from fastapi import FastAPI, Depends, HTTPException, UploadFile, File
from fastapi.responses import FileResponse
import os
import uuid

from sqlalchemy.orm import Session
from .db import Base, engine, get_db
from .models import User, Item, ItemPermission
from .schemas import ItemOut, CreateFolderIn
from .auth import get_current_user_stub
from .permissions import get_effective_role, ROLE_ORDER

from .schemas import RenameIn, MoveIn  # make sure these are imported
from datetime import datetime, timedelta
from .models import ShareLink
from .schemas import CreateShareLinkIn

from fastapi.middleware.cors import CORSMiddleware

app = FastAPI(title="EduShare API (Local Dev)")

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5500",  # VS Code Live Server default
        "http://127.0.0.1:5500",
        "http://localhost:5173",  # Vite default
        "http://127.0.0.1:5173",
        "http://localhost:3000",  # React dev default
        "http://127.0.0.1:3000",
        "http://localhost:8080",  # some dev servers
        "http://127.0.0.1:8080",
    ],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)


STORAGE_DIR = os.path.join(os.path.dirname(__file__), "..", "storage")
os.makedirs(STORAGE_DIR, exist_ok=True)

Base.metadata.create_all(bind=engine)


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


@app.get("/health")
def health():
    return {"ok": True}


@app.get("/me")
def me(db: Session = Depends(get_db), identity: dict = Depends(get_current_user_stub)):
    u = upsert_user(db, identity)
    return {"id": u.id, "display_name": u.display_name}


@app.post("/folders", response_model=ItemOut)
def create_folder(
    body: CreateFolderIn,
    db: Session = Depends(get_db),
    identity: dict = Depends(get_current_user_stub),
):
    user = upsert_user(db, identity)

    if body.parent_id is not None:
        parent = (
            db.query(Item)
            .filter(Item.id == body.parent_id, Item.type == "folder")
            .first()
        )
        if not parent:
            raise HTTPException(404, "Parent folder not found")
        role = get_effective_role(db, user.id, parent)
        if ROLE_ORDER[role] < ROLE_ORDER["editor"]:
            raise HTTPException(403, "No permission to create folder here")

    folder = Item(
        parent_id=body.parent_id,
        name=body.name,
        type="folder",
        owner_user_id=user.id,
    )
    db.add(folder)
    db.commit()
    db.refresh(folder)
    return folder


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
    return items


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

    item = Item(
        parent_id=folder_id,
        name=file.filename,
        type="file",
        owner_user_id=user.id,
        storage_path=stored_path,
        mime_type=file.content_type,
        size_bytes=len(contents),
    )
    db.add(item)
    db.commit()
    db.refresh(item)

    return {
        "id": item.id,
        "name": item.name,
        "type": item.type,
        "parent_id": item.parent_id,
        "mime_type": item.mime_type,
        "size_bytes": item.size_bytes,
    }


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


@app.post("/share/{item_id}")
def share_item(
    item_id: int,
    target_user: str,
    role: str,
    db: Session = Depends(get_db),
    identity: dict = Depends(get_current_user_stub),
):
    """
    Local dev: target_user is the X-User value ("bob")
    role: viewer/editor
    """
    if role not in ("viewer", "editor"):
        raise HTTPException(400, "role must be viewer or editor")

    current = upsert_user(db, identity)
    item = db.query(Item).filter(Item.id == item_id).first()
    if not item:
        raise HTTPException(404, "Item not found")

    if item.owner_user_id != current.id:
        raise HTTPException(403, "Only owner can share")

    target_identity = {
        "provider": "local",
        "provider_user_id": target_user,
        "display_name": target_user,
        "email": None,
    }
    target = upsert_user(db, target_identity)

    existing = (
        db.query(ItemPermission)
        .filter(ItemPermission.item_id == item_id, ItemPermission.user_id == target.id)
        .first()
    )
    if existing:
        existing.role = role
    else:
        db.add(ItemPermission(item_id=item_id, user_id=target.id, role=role))

    db.commit()
    return {"ok": True}

@app.get("/root", response_model=list[ItemOut])
def list_root(
    db: Session = Depends(get_db),
    identity: dict = Depends(get_current_user_stub),
):
    user = upsert_user(db, identity)
    items = db.query(Item).filter(Item.parent_id == None, Item.owner_user_id == user.id).all()
    return items

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

    # must be able to edit the item itself
    role_item = get_effective_role(db, user.id, item)
    if ROLE_ORDER[role_item] < ROLE_ORDER["editor"]:
        raise HTTPException(403, "No permission to move this item")

    # destination folder checks (unless moving to root)
    if body.new_parent_id is not None:
        dest = db.query(Item).filter(Item.id == body.new_parent_id, Item.type == "folder").first()
        if not dest:
            raise HTTPException(404, "Destination folder not found")

        role_dest = get_effective_role(db, user.id, dest)
        if ROLE_ORDER[role_dest] < ROLE_ORDER["editor"]:
            raise HTTPException(403, "No permission to move into that folder")

        # prevent moving folder into itself
        if item.id == dest.id:
            raise HTTPException(400, "Cannot move item into itself")

    item.parent_id = body.new_parent_id
    db.commit()
    return {"ok": True}

def delete_item_recursive(db: Session, item: Item):
    # delete children first
    children = db.query(Item).filter(Item.parent_id == item.id).all()
    for child in children:
        delete_item_recursive(db, child)

    # delete file from disk
    if item.type == "file" and item.storage_path:
        try:
            if os.path.exists(item.storage_path):
                os.remove(item.storage_path)
        except Exception:
            pass

    # delete permissions on this item
    db.query(ItemPermission).filter(ItemPermission.item_id == item.id).delete()

    # delete item row
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

    # Only owner can create share links
    if item.owner_user_id != user.id:
        raise HTTPException(403, "Only owner can create share links")

    if body.role not in ("viewer", "editor"):
        raise HTTPException(400, "role must be viewer or editor")

    token = uuid.uuid4().hex
    expires_at = None

    if body.expires_in_hours is not None:
        expires_at = datetime.utcnow() + timedelta(hours=body.expires_in_hours)

    link = ShareLink(
        item_id=item_id,
        token=token,
        role=body.role,
        expires_at=expires_at,
    )

    db.add(link)
    db.commit()
    db.refresh(link)

    return {
        "token": link.token,
        "role": link.role,
        "expires_at": link.expires_at,
    }

def get_valid_share_link(db: Session, token: str):
    link = (
        db.query(ShareLink)
        .filter(ShareLink.token == token)
        .first()
    )

    if link is None:
        raise HTTPException(status_code=404, detail="Share link not found")

    if link.expires_at and link.expires_at < datetime.utcnow():
        raise HTTPException(status_code=410, detail="Share link expired")

    return link

@app.get("/s/{token}/children", response_model=list[ItemOut])
def list_children_via_link(token: str, db: Session = Depends(get_db)):
    link = get_valid_share_link(db, token)
    item = db.query(Item).filter(Item.id == link.item_id).first()
    if not item:
        raise HTTPException(404, "Item missing")

    if item.type != "folder":
        raise HTTPException(400, "Link is not for a folder")

    # viewer+ can list
    if ROLE_ORDER[link.role] < ROLE_ORDER["viewer"]:
        raise HTTPException(403, "Link does not allow viewing")

    return db.query(Item).filter(Item.parent_id == item.id).all()

@app.get("/s/{token}/download")
def download_via_link(token: str, db: Session = Depends(get_db)):
    link = get_valid_share_link(db, token)
    item = db.query(Item).filter(Item.id == link.item_id).first()
    if not item:
        raise HTTPException(404, "Item missing")

    if item.type != "file":
        raise HTTPException(400, "Link is not for a file")

    if ROLE_ORDER[link.role] < ROLE_ORDER["viewer"]:
        raise HTTPException(403, "Link does not allow downloading")

    if not item.storage_path or not os.path.exists(item.storage_path):
        raise HTTPException(500, "Stored file missing on server")

    response = FileResponse(
        path=item.storage_path,
        filename=item.name,
        media_type=item.mime_type or "application/octet-stream",
    )
    response.headers["Cache-Control"] = "no-store"
    return response

@app.delete("/share-links/{token}")
def revoke_share_link(
    token: str,
    db: Session = Depends(get_db),
    identity: dict = Depends(get_current_user_stub),
):
    user = upsert_user(db, identity)
    link = db.query(ShareLink).filter(ShareLink.token == token).first()
    if not link:
        raise HTTPException(404, "Share link not found")

    item = db.query(Item).filter(Item.id == link.item_id).first()
    if not item:
        raise HTTPException(404, "Item missing")

    if item.owner_user_id != user.id:
        raise HTTPException(403, "Only owner can revoke share links")

    db.delete(link)
    db.commit()
    return {"ok": True}


