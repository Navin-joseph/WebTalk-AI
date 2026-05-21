from pydantic import BaseModel, HttpUrl, EmailStr
from typing import Optional
from datetime import datetime
from uuid import UUID


# --- Auth ---

class TokenPayload(BaseModel):
    sub: str  # user id (Supabase uid)
    client_id: Optional[str] = None
    role: str = "client"


# --- Clients ---

class ClientCreate(BaseModel):
    name: str
    website_url: HttpUrl
    email: EmailStr


class ClientUpdate(BaseModel):
    name: Optional[str] = None
    website_url: Optional[HttpUrl] = None


class ClientResponse(BaseModel):
    id: UUID
    name: str
    website_url: str
    email: str
    created_at: datetime
    is_active: bool


# --- Training Jobs ---

class TrainingJobCreate(BaseModel):
    website_url: HttpUrl
    max_pages: int = 50


class TrainingJobResponse(BaseModel):
    id: UUID
    client_id: UUID
    website_url: str
    status: str  # pending | running | completed | failed
    pages_crawled: int
    pages_total: int
    error_message: Optional[str] = None
    created_at: datetime
    completed_at: Optional[datetime] = None


# --- Conversations ---

class MessageCreate(BaseModel):
    content: str
    role: str = "user"


class ConversationResponse(BaseModel):
    id: UUID
    client_id: UUID
    session_id: str
    messages: list[dict]
    created_at: datetime


# --- Analytics ---

class AnalyticsResponse(BaseModel):
    client_id: UUID
    total_conversations: int
    total_messages: int
    avg_response_time_ms: float
    voice_sessions: int
    text_sessions: int
    period_start: datetime
    period_end: datetime


# --- RAG Chat ---

class ChatRequest(BaseModel):
    message: str
    session_id: str
    client_id: str | None = None  # resolved server-side from JWT or API key
    use_voice: bool = False


class ChatResponse(BaseModel):
    answer: str
    sources: list[str]
    session_id: str


# --- API Keys ---

class ApiKeyCreate(BaseModel):
    name: str


class ApiKeyResponse(BaseModel):
    id: UUID
    client_id: UUID
    name: str
    key_prefix: str  # first 8 chars only
    created_at: datetime
    last_used_at: Optional[datetime] = None
