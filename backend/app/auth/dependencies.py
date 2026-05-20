from fastapi import Depends, HTTPException, Security, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials, APIKeyHeader
from supabase import Client
from ..config import get_settings
from ..database import get_supabase
from ..models import TokenPayload

settings = get_settings()
bearer_scheme = HTTPBearer(auto_error=False)
api_key_header = APIKeyHeader(name="X-API-Key", auto_error=False)


async def get_current_user(
    credentials: HTTPAuthorizationCredentials = Security(bearer_scheme),
    db: Client = Depends(get_supabase),
) -> TokenPayload:
    """
    Validate the Supabase access token by calling Supabase's `auth.get_user(jwt)`.
    Works with both legacy HS256 JWT secrets and the newer asymmetric key system.
    """
    if not credentials:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Not authenticated")

    try:
        resp = db.auth.get_user(credentials.credentials)
        if not resp or not resp.user:
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token")

        return TokenPayload(
            sub=str(resp.user.id),
            client_id=(resp.user.user_metadata or {}).get("client_id"),
            role=resp.user.role or "authenticated",
        )
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=f"Invalid token: {e.__class__.__name__}",
        )


async def get_client_from_api_key(
    api_key: str = Security(api_key_header),
    db: Client = Depends(get_supabase),
) -> dict:
    """Validate widget API key and return client record."""
    if not api_key:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="API key required")

    try:
        result = (
            db.table("api_keys")
            .select("*, clients(*)")
            .eq("key_hash", _hash_key(api_key))
            .eq("is_active", True)
            .maybe_single()
            .execute()
        )
    except Exception:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid API key")

    if not result or not result.data:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid API key")

    # Update last_used_at (best-effort)
    try:
        db.table("api_keys").update({"last_used_at": "now()"}).eq("id", result.data["id"]).execute()
    except Exception:
        pass

    return result.data["clients"]


def _hash_key(key: str) -> str:
    import hashlib
    return hashlib.sha256(key.encode()).hexdigest()
