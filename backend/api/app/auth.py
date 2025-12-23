from fastapi import Header, HTTPException

def get_current_user_stub(x_user: str | None = Header(default=None)):
    """
    Local dev only:
    Send header: X-User: alice   (or bob)
    """
    if not x_user:
        raise HTTPException(status_code=401, detail="Missing X-User header (local dev auth)")
    return {"provider": "local", "provider_user_id": x_user, "display_name": x_user, "email": None}
