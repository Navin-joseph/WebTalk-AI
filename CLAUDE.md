# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**WebTalk AI** is a multi-tenant SaaS platform where businesses deploy AI voice and text agents trained on their own website content via RAG (Retrieval-Augmented Generation). Clients embed a widget on their site; end-users interact with it via text or voice in real time.

This repository is in the initial setup phase. The authoritative PRD is `Updated_PRD_AI_Voice_Agent_Supabase.docx`.

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | Next.js |
| Backend API | FastAPI (Python) |
| Auth & Database | Supabase (PostgreSQL) |
| Cache | Redis |
| Vector DB | Qdrant |
| LLM | Groq API |
| Web Crawler | Playwright + BeautifulSoup |
| Speech-to-Text | Deepgram |
| Text-to-Speech | ElevenLabs |
| Real-time | WebSockets |
| Deployment | Docker |

## System Architecture

```
Client Website
  └─ Embeddable Widget (JS SDK)
       └─ WebSocket
            └─ FastAPI Backend
                 ├─ Groq API (LLM)
                 ├─ RAG Engine → Qdrant (vector search)
                 ├─ Deepgram (STT) / ElevenLabs (TTS)
                 └─ Supabase (auth, PostgreSQL, analytics)
```

Multi-tenancy is enforced via `client_id` on all database rows and vector collections. Each client's knowledge is isolated in Qdrant.

## Database Schema (Supabase PostgreSQL)

Tables: `clients`, `conversations`, `analytics`, `training_jobs`, `api_keys`

## Development Phases

1. Git + GitHub repository setup  
2. FastAPI backend scaffolding  
3. Supabase schema + authentication  
4. Groq API integration  
5. Website crawler (Playwright + BeautifulSoup → embeddings → Qdrant)  
6. RAG pipeline (query → embed → Qdrant search → Groq completion)  
7. Voice AI (Deepgram STT + ElevenLabs TTS over WebSocket)  
8. Embeddable widget SDK  
9. Analytics dashboard (Next.js)  
10. Docker deployment  

## Key Conventions to Follow

- All backend routes must scope queries by `client_id` — never return cross-tenant data.
- WebSocket sessions handle the full voice pipeline: receive audio chunks → STT → RAG retrieval → LLM → TTS → stream back audio.
- Training jobs (crawl + embed) run asynchronously; track status in the `training_jobs` table.
- Use Supabase Row Level Security (RLS) as a second line of defense for multi-tenant isolation.
