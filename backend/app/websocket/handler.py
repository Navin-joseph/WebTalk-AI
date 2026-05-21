import json
import time
import base64
from fastapi import WebSocket, WebSocketDisconnect, Query
from supabase import Client
from ..rag.pipeline import RAGPipeline
from ..voice.stt import DeepgramSTT
from ..voice.tts import get_tts
from ..database import get_supabase


async def voice_websocket_handler(
    websocket: WebSocket,
    client_id: str,
    session_id: str,
    api_key: str,
):
    """
    Full voice pipeline over WebSocket.

    Message protocol (JSON):
      Client → Server:
        { "type": "audio_chunk", "data": "<base64 audio bytes>" }
        { "type": "audio_end" }          # signals end of utterance
        { "type": "text", "content": "..." }  # text fallback

      Server → Client:
        { "type": "transcript", "text": "..." }
        { "type": "answer_text", "text": "..." }
        { "type": "audio_chunk", "data": "<base64 mp3 bytes>" }
        { "type": "audio_end" }
        { "type": "error", "message": "..." }
    """
    db: Client = get_supabase()

    # Validate API key
    key_result = db.table("api_keys").select("client_id, is_active").eq("key_hash", _hash_key(api_key)).single().execute()
    if not key_result.data or not key_result.data["is_active"] or key_result.data["client_id"] != client_id:
        await websocket.close(code=4001, reason="Invalid API key")
        return

    await websocket.accept()

    rag = RAGPipeline()
    stt = DeepgramSTT()
    tts = get_tts()
    conversation_history: list[dict] = []
    audio_buffer = bytearray()

    try:
        while True:
            raw = await websocket.receive_text()
            message = json.loads(raw)
            msg_type = message.get("type")

            if msg_type == "audio_chunk":
                chunk = base64.b64decode(message["data"])
                audio_buffer.extend(chunk)

            elif msg_type == "audio_end":
                if not audio_buffer:
                    continue

                start = time.monotonic()

                # STT
                transcript = await stt.transcribe(bytes(audio_buffer))
                audio_buffer.clear()

                if not transcript.strip():
                    await _send(websocket, {"type": "transcript", "text": ""})
                    continue

                await _send(websocket, {"type": "transcript", "text": transcript})

                # RAG
                result = await rag.query(
                    client_id=client_id,
                    question=transcript,
                    session_id=session_id,
                    conversation_history=conversation_history,
                )
                answer = result["answer"]
                await _send(websocket, {"type": "answer_text", "text": answer})

                # TTS — stream audio back
                async for audio_chunk in tts.synthesize_stream(answer):
                    await _send(websocket, {
                        "type": "audio_chunk",
                        "data": base64.b64encode(audio_chunk).decode(),
                    })
                await _send(websocket, {"type": "audio_end"})

                # Track conversation
                conversation_history.extend([
                    {"role": "user", "content": transcript},
                    {"role": "assistant", "content": answer},
                ])

                elapsed_ms = int((time.monotonic() - start) * 1000)
                _log_analytics(db, client_id, session_id, transcript, answer, elapsed_ms, "voice")

            elif msg_type == "text":
                content = message.get("content", "")
                if not content.strip():
                    continue

                result = await rag.query(
                    client_id=client_id,
                    question=content,
                    session_id=session_id,
                    conversation_history=conversation_history,
                )
                answer = result["answer"]
                await _send(websocket, {"type": "answer_text", "text": answer})

                conversation_history.extend([
                    {"role": "user", "content": content},
                    {"role": "assistant", "content": answer},
                ])

    except WebSocketDisconnect:
        pass
    except Exception as e:
        try:
            await _send(websocket, {"type": "error", "message": str(e)})
        except Exception:
            pass


async def _send(ws: WebSocket, data: dict):
    await ws.send_text(json.dumps(data))


def _hash_key(key: str) -> str:
    import hashlib
    return hashlib.sha256(key.encode()).hexdigest()


def _log_analytics(db: Client, client_id: str, session_id: str, user_msg: str, ai_msg: str, response_time_ms: int, channel: str):
    try:
        db.table("analytics").insert({
            "client_id": client_id,
            "session_id": session_id,
            "event_type": "message",
            "channel": channel,
            "response_time_ms": response_time_ms,
            "metadata": {"user_message_len": len(user_msg), "ai_message_len": len(ai_msg)},
        }).execute()
    except Exception:
        pass
