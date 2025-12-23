from sqlalchemy.orm import Session
from .models import Item, ItemPermission

ROLE_ORDER = {"none": 0, "viewer": 1, "editor": 2, "owner": 3}

def max_role(a: str, b: str) -> str:
    return a if ROLE_ORDER[a] >= ROLE_ORDER[b] else b

def get_effective_role(db: Session, user_id: int, item: Item) -> str:
    if item.owner_user_id == user_id:
        return "owner"

    role = "none"
    cur = item
    while cur is not None:
        perm = (
            db.query(ItemPermission)
            .filter(ItemPermission.item_id == cur.id, ItemPermission.user_id == user_id)
            .first()
        )
        if perm:
            role = max_role(role, perm.role)
        if cur.parent_id is None:
            break
        cur = db.query(Item).filter(Item.id == cur.parent_id).first()

    return role
