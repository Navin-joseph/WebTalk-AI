from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, EmailStr
from supabase import Client
from ..database import get_supabase
from ..config import get_settings

router = APIRouter(prefix="/auth", tags=["auth"])
settings = get_settings()


# --- Request bodies ---

class RegisterRequest(BaseModel):
    email: EmailStr
    password: str
    name: str


class LoginRequest(BaseModel):
    email: EmailStr
    password: str


class RefreshRequest(BaseModel):
    refresh_token: str


# --- Routes ---

@router.post("/register")
async def register(payload: RegisterRequest, db: Client = Depends(get_supabase)):
    try:
        result = db.auth.sign_up({
            "email": payload.email,
            "password": payload.password,
            "options": {"data": {"name": payload.name}},
        })
        if result.user is None:
            raise HTTPException(status_code=400, detail="Registration failed")

        # Create client record tied to this user
        db.table("clients").insert({
            "owner_user_id": str(result.user.id),
            "name": payload.name,
            "email": payload.email,
            "website_url": "",
        }).execute()

        return {
            "message": "Registered successfully. Check email to confirm if confirmation is enabled.",
            "user_id": str(result.user.id),
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/login")
async def login(payload: LoginRequest, db: Client = Depends(get_supabase)):
    try:
        result = db.auth.sign_in_with_password({
            "email": payload.email,
            "password": payload.password,
        })
        return {
            "access_token": result.session.access_token,
            "refresh_token": result.session.refresh_token,
            "token_type": "bearer",
        }
    except Exception:
        raise HTTPException(status_code=401, detail="Invalid credentials")


@router.post("/refresh")
async def refresh_token(payload: RefreshRequest, db: Client = Depends(get_supabase)):
    try:
        result = db.auth.refresh_session(payload.refresh_token)
        return {
            "access_token": result.session.access_token,
            "refresh_token": result.session.refresh_token,
        }
    except Exception:
        raise HTTPException(status_code=401, detail="Invalid refresh token")
