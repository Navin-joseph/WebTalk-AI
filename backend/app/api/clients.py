import secrets
import hashlib
from fastapi import APIRouter, Depends, HTTPException
from supabase import Client
from ..database import get_supabase
from ..auth.dependencies import get_current_user
from ..models import ClientCreate, ClientUpdate, ClientResponse, ApiKeyCreate, ApiKeyResponse, TokenPayload

router = APIRouter(prefix="/clients", tags=["clients"])


@router.get("/me", response_model=ClientResponse)
async def get_my_client(
    user: TokenPayload = Depends(get_current_user),
    db: Client = Depends(get_supabase),
):
    # Try to fetch existing client record
    result = db.table("clients").select("*").eq("owner_user_id", user.sub).execute()

    if result.data:
        return result.data[0]

    # Auto-create on first access (handles users who signed up via Supabase auth
    # directly, or whose client row failed to create during registration)
    auth_user = db.auth.admin.get_user_by_id(user.sub)
    email = auth_user.user.email if auth_user and auth_user.user else ""
    name = (auth_user.user.user_metadata or {}).get("name", email.split("@")[0]) if auth_user and auth_user.user else "Untitled"

    created = db.table("clients").insert({
        "owner_user_id": user.sub,
        "name": name,
        "email": email,
        "website_url": "",
    }).execute()
    return created.data[0]


@router.put("/me", response_model=ClientResponse)
async def update_my_client(
    payload: ClientUpdate,
    user: TokenPayload = Depends(get_current_user),
    db: Client = Depends(get_supabase),
):
    updates = payload.model_dump(exclude_none=True)
    if "website_url" in updates:
        updates["website_url"] = str(updates["website_url"])

    result = db.table("clients").update(updates).eq("owner_user_id", user.sub).execute()
    return result.data[0]


# --- API Keys ---

@router.get("/me/api-keys", response_model=list[ApiKeyResponse])
async def list_api_keys(
    user: TokenPayload = Depends(get_current_user),
    db: Client = Depends(get_supabase),
):
    client = db.table("clients").select("id").eq("owner_user_id", user.sub).single().execute()
    result = db.table("api_keys").select("*").eq("client_id", client.data["id"]).execute()
    return result.data


@router.post("/me/api-keys", response_model=dict)
async def create_api_key(
    payload: ApiKeyCreate,
    user: TokenPayload = Depends(get_current_user),
    db: Client = Depends(get_supabase),
):
    client = db.table("clients").select("id").eq("owner_user_id", user.sub).single().execute()
    client_id = client.data["id"]

    raw_key = f"wtk_{secrets.token_urlsafe(32)}"
    key_hash = hashlib.sha256(raw_key.encode()).hexdigest()

    db.table("api_keys").insert({
        "client_id": client_id,
        "name": payload.name,
        "key_hash": key_hash,
        "key_prefix": raw_key[:8],
    }).execute()

    # Return raw key ONCE — not stored
    return {"key": raw_key, "prefix": raw_key[:8], "name": payload.name}


@router.delete("/me/api-keys/{key_id}")
async def revoke_api_key(
    key_id: str,
    user: TokenPayload = Depends(get_current_user),
    db: Client = Depends(get_supabase),
):
    client = db.table("clients").select("id").eq("owner_user_id", user.sub).single().execute()
    db.table("api_keys").update({"is_active": False}).eq("id", key_id).eq("client_id", client.data["id"]).execute()
    return {"message": "API key revoked"}
