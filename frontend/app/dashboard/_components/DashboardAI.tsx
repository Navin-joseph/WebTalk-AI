"use client";
/**
 * DashboardAI  —  AI assistant with MuseTalk lip-sync avatar
 * ────────────────────────────────────────────────────────────────────────────
 * Pipeline (per TTS chunk):
 *   1. LLM text token arrives → buffered in ttsPendingRef
 *   2. Text flushed to TTS queue at sentence / punctuation boundaries
 *   3. drainTTS() picks up queue items:
 *      a. PRIMARY: POST /api/v1/conversations/musetalk  (text → lip-sync video)
 *         Backend: text → Cartesia PCM → fal-ai/musetalk → returns {video_url}
 *         Frontend: set musetalkUrl → SimliAvatar loads & plays video (audio baked in)
 *         Spinner shows while backend processes; hides on video onCanPlay.
 *      b. FALLBACK: POST /api/v1/conversations/tts  (text → MP3 blob)
 *         Used when MuseTalk is disabled or the endpoint is unavailable.
 *         Audio-only with waveform bars; avatar loops its idle video.
 *
 * Spinner states:
 *   isBaseLoading   — true until idle video fires onCanPlay (initial only)
 *   isGenerating    — true while MuseTalk backend is processing a segment
 *   Combined: show spinner when either is true
 *
 * Env vars:
 *   NEXT_PUBLIC_API_URL            — backend origin
 *   NEXT_PUBLIC_AVATAR_VIDEO_URL   — override base idle video
 *   NEXT_PUBLIC_MUSETALK_ENABLED   — "true" to activate MuseTalk path
 */

import { useState, useEffect, useRef, useCallback } from "react";
import { createClient } from "@/lib/supabase";
import {
  Mic, MicOff, X, Send, Volume2, VolumeX, RotateCcw, MessageSquare,
} from "lucide-react";
import { useAudioLipSync }                        from "@/hooks/useAudioLipSync";
import { SimliAvatar, type SimliAvatarHandle, BASE_VIDEO_URL } from "./SimliAvatar";

// ── Config ────────────────────────────────────────────────────────────────────

const API_URL          = process.env.NEXT_PUBLIC_API_URL          ?? "http://localhost:8000";
const MUSETALK_ENABLED = process.env.NEXT_PUBLIC_MUSETALK_ENABLED === "true";
const NUM_WAVE_BARS    = 12;

// ── Types ─────────────────────────────────────────────────────────────────────

interface Message { role: "user" | "assistant"; content: string; streaming?: boolean; }
type AvatarState = "idle" | "thinking" | "listening" | "speaking";

// ── Component ─────────────────────────────────────────────────────────────────

export default function DashboardAI() {

  // ── UI state ──────────────────────────────────────────────────────────────
  const [open, setOpen]               = useState(false);
  const [messages, setMessages]       = useState<Message[]>([]);
  const [input, setInput]             = useState("");
  const [streaming, setStreaming]     = useState(false);
  const [listening, setListening]     = useState(false);
  const [speaking, setSpeaking]       = useState(false);
  const [avatarState, setAvatarState] = useState<AvatarState>("idle");
  const [token, setToken]             = useState("");
  const [ttsEnabled, setTtsEnabled]   = useState(true);

  // ── Spinner states ────────────────────────────────────────────────────────
  /**
   * isGenerating — true ONLY while the MuseTalk backend is processing a
   *                segment.  Shows "Generating Avatar Sync..." and hides
   *                the avatar area until the lip-sync video is ready.
   *
   * isBaseLoading has been intentionally removed.  The idle character video
   * (SimliAvatar Layer 1) has autoPlay + loop + muted, so the browser starts
   * playing it the moment the panel mounts — no loading gate is needed.
   * The old isBaseLoading gate delayed the video by the onCanPlay event and
   * made the panel look frozen / stuck to the user.
   */
  const [isGenerating, setIsGenerating] = useState(false);

  // ── MuseTalk state ────────────────────────────────────────────────────────
  /**
   * musetalkUrl — when set, SimliAvatar loads and plays this video URL.
   * The video contains Cartesia audio baked in by the backend (perfect sync).
   * Cleared to null once the video's onEnded fires.
   */
  const [musetalkUrl, setMusetalkUrl] = useState<string | null>(null);

  // Resolve function for the promise that blocks drainTTS until the video ends
  const speakEndResolveRef = useRef<(() => void) | null>(null);

  // ── Refs ──────────────────────────────────────────────────────────────────
  const sessionId      = useRef(`dash_${Date.now()}_${Math.random().toString(36).slice(2)}`);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const recognitionRef = useRef<any>(null);
  const abortRef       = useRef<AbortController | null>(null);
  const inputRef       = useRef<HTMLInputElement>(null);
  const avatarRef      = useRef<SimliAvatarHandle>(null);

  // Stable refs that closures can read without stale values
  const tokenRef      = useRef(token);
  const ttsEnabledRef = useRef(ttsEnabled);
  const streamingRef  = useRef(false);

  useEffect(() => { tokenRef.current      = token;      }, [token]);
  useEffect(() => { ttsEnabledRef.current  = ttsEnabled; }, [ttsEnabled]);
  useEffect(() => { streamingRef.current   = streaming;  }, [streaming]);

  // ── TTS queue refs ────────────────────────────────────────────────────────
  const audioRef      = useRef<HTMLAudioElement | null>(null);
  const audioUrlRef   = useRef<string | null>(null);
  const ttsAbortRef   = useRef(false);
  const ttsQRef       = useRef<string[]>([]);
  const ttsRunRef     = useRef(false);
  const ttsPendingRef = useRef("");

  // ── Waveform bars (used by audio-fallback path) ───────────────────────────
  const waveBarRefs = useRef<(HTMLSpanElement | null)[]>(Array(NUM_WAVE_BARS).fill(null));
  const { start: startLipSyncAudio, stop: stopLipSyncAudio } = useAudioLipSync();

  const stopLipSync = useCallback(() => {
    stopLipSyncAudio();
    waveBarRefs.current.forEach(b => { if (b) b.style.height = "3px"; });
  }, [stopLipSyncAudio]);

  const startLipSync = useCallback((audioEl: HTMLAudioElement) => {
    stopLipSync();
    startLipSyncAudio(audioEl, frame => {
      frame.bars.forEach((h, i) => {
        const bar = waveBarRefs.current[i];
        if (bar) bar.style.height = h + "px";
      });
    });
  }, [stopLipSync, startLipSyncAudio]);

  // ── Auth ──────────────────────────────────────────────────────────────────
  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) setToken(data.session.access_token);
    });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_e, s) => {
      if (s) setToken(s.access_token);
    });
    return () => subscription.unsubscribe();
  }, []);

  // ── Panel open: focus + scroll ───────────────────────────────────────────
  // No spinner reset on open — the idle video plays immediately on mount.
  useEffect(() => {
    if (!open) return;
    setTimeout(() => inputRef.current?.focus(), 100);
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [open, messages]);

  // ── Audio fallback helper ─────────────────────────────────────────────────
  /**
   * Creates an HTMLAudioElement for the given text.
   *
   * Priority:
   *   1. /tts/stream  — backend collects all Cartesia PCM chunks and prepends
   *                     a 44-byte RIFF/WAV header (16000 Hz · mono · s16le).
   *                     The browser receives a well-formed WAV blob and decodes
   *                     it at the correct sample rate — no more slow/robotic
   *                     playback caused by the browser guessing 44100 Hz.
   *
   *   2. /tts         — one-shot MP3 blob from Cartesia /tts/bytes (44100 Hz).
   *                     Used if the WAV stream endpoint fails or is unavailable.
   *
   * Why NOT MediaSource Extensions for WAV:
   *   MSE does not support audio/wav as a MIME type in any browser.  We use
   *   the fetch-as-blob → createObjectURL → new Audio() path instead, which
   *   works for both WAV and MP3 without any MSE SourceBuffer complexity.
   */
  const createAudio = useCallback(async (
    text: string,
  ): Promise<HTMLAudioElement | null> => {
    const tok = tokenRef.current;
    if (!text.trim() || !tok || ttsAbortRef.current) return null;

    const headers = { "Content-Type": "application/json", Authorization: `Bearer ${tok}` };
    const body    = JSON.stringify({ text });

    // ── Primary: WAV stream (correct sample rate → no robotic distortion) ────
    try {
      const r = await fetch(`${API_URL}/api/v1/conversations/tts/stream`, {
        method: "POST", headers, body,
      });

      if (r.ok && !ttsAbortRef.current) {
        const raw = await r.blob();

        // Force audio/wav MIME type regardless of what the server declares.
        // The /tts/stream endpoint now yields a valid WAV file (44-byte RIFF
        // header + s16le PCM at 16000 Hz).  Without explicit type="audio/wav"
        // some browsers fall back to MIME sniffing and may still misidentify
        // the blob as raw binary data.
        const blob = new Blob([await raw.arrayBuffer()], { type: "audio/wav" });

        // Minimum viable WAV: 44 bytes header + at least one audio sample.
        // Anything smaller is likely an upstream error response body.
        if (blob.size > 44) {
          const url = URL.createObjectURL(blob);
          audioUrlRef.current = url;
          return new Audio(url);
        }
      }
    } catch { /* fall through to MP3 fallback */ }

    // ── Fallback: MP3 blob from /tts (44100 Hz) ──────────────────────────────
    try {
      const r = await fetch(`${API_URL}/api/v1/conversations/tts`, {
        method: "POST", headers, body,
      });
      if (!r.ok || ttsAbortRef.current) return null;

      const raw  = await r.blob();
      // Force audio/mpeg if the server returns application/octet-stream
      const blob = raw.type.startsWith("audio")
        ? raw
        : new Blob([await raw.arrayBuffer()], { type: "audio/mpeg" });
      if (blob.size < 500) return null; // reject obvious error-JSON responses

      const url = URL.createObjectURL(blob);
      audioUrlRef.current = url;
      return new Audio(url);
    } catch { return null; }

  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Stop all TTS / MuseTalk immediately ──────────────────────────────────
  const stopTTS = useCallback(() => {
    ttsAbortRef.current    = true;
    ttsQRef.current        = [];
    ttsRunRef.current      = false;
    ttsPendingRef.current  = "";
    stopLipSync();
    setIsGenerating(false);
    setMusetalkUrl(null);
    speakEndResolveRef.current?.();
    speakEndResolveRef.current = null;
    if (audioRef.current)  { audioRef.current.pause(); audioRef.current = null; }
    if (audioUrlRef.current) { URL.revokeObjectURL(audioUrlRef.current); audioUrlRef.current = null; }
    setSpeaking(false);
    setAvatarState(streamingRef.current ? "thinking" : "idle");
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stopLipSync]);

  // ── TTS drain loop ────────────────────────────────────────────────────────
  const drainTTS = useCallback(async () => {
    if (ttsRunRef.current) return;
    ttsRunRef.current = true;

    while (ttsQRef.current.length > 0 && !ttsAbortRef.current) {
      const text = ttsQRef.current.shift()!;
      if (!text.trim()) continue;

      setSpeaking(true);
      setAvatarState("speaking");

      let handled = false;

      // ── PRIMARY: MuseTalk pipeline ───────────────────────────────────────
      if (MUSETALK_ENABLED && !ttsAbortRef.current) {
        setIsGenerating(true); // show "Generating Avatar Sync..." spinner

        try {
          const tok = tokenRef.current;
          const res = await fetch(`${API_URL}/api/v1/conversations/musetalk`, {
            method:  "POST",
            headers: { "Content-Type": "application/json", Authorization: `Bearer ${tok}` },
            body:    JSON.stringify({
              text,
              base_video_url: BASE_VIDEO_URL,
            }),
          });

          if (res.ok && !ttsAbortRef.current) {
            const data = await res.json() as { video_url?: string };

            if (data.video_url && !ttsAbortRef.current) {
              // Hand off to SimliAvatar layer 2.
              // onSpeakVideoReady will hide the spinner (setIsGenerating(false)).
              // onSpeakVideoEnd will resolve this promise so we advance the queue.
              setMusetalkUrl(data.video_url);

              await new Promise<void>(resolve => {
                speakEndResolveRef.current = resolve;
              });

              setMusetalkUrl(null);
              handled = true;
            }
          }
        } catch { /* fall through to audio fallback */ }

        setIsGenerating(false);
      }

      // ── FALLBACK: audio blob + waveform bars ─────────────────────────────
      if (!handled && !ttsAbortRef.current) {
        const audio = await createAudio(text);
        if (audio && !ttsAbortRef.current) {
          audioRef.current = audio;

          await new Promise<void>(resolve => {
            audio.oncanplay = () => startLipSync(audio);
            audio.play().catch(() => { /* autoplay policy — ok */ });
            audio.onended = () => {
              stopLipSync();
              if (audioUrlRef.current) {
                URL.revokeObjectURL(audioUrlRef.current);
                audioUrlRef.current = null;
              }
              audioRef.current = null;
              resolve();
            };
            audio.onerror = () => { stopLipSync(); resolve(); };
          });
        }
      }
    }

    ttsRunRef.current = false;
    if (ttsQRef.current.length === 0) {
      setSpeaking(false);
      setAvatarState(streamingRef.current ? "thinking" : "idle");
      setIsGenerating(false);
    }
  }, [createAudio, startLipSync, stopLipSync]);

  const enqueueTTS = useCallback((text: string) => {
    if (!ttsEnabledRef.current || !text.trim()) return;
    ttsAbortRef.current = false;
    ttsQRef.current.push(text.trim());
    drainTTS();
  }, [drainTTS]);

  // ── Chat stream ───────────────────────────────────────────────────────────
  const sendMessage = useCallback(async (text: string) => {
    if (!text.trim() || !token) return;
    abortRef.current?.abort();
    abortRef.current       = new AbortController();
    stopTTS();
    ttsAbortRef.current    = false;
    ttsPendingRef.current  = "";

    if (streamingRef.current) {
      setMessages(prev => {
        const next = [...prev];
        const last = next[next.length - 1];
        if (last?.streaming) {
          if (last.content.trim()) return [...next.slice(0, -1), { ...last, streaming: false }];
          return next.slice(0, -1);
        }
        return next;
      });
      setStreaming(false);
    }

    setMessages(prev => [
      ...prev,
      { role: "user",      content: text },
      { role: "assistant", content: "", streaming: true },
    ]);
    setInput("");
    setStreaming(true);
    setAvatarState("thinking");

    let fullAnswer = "";
    const history  = messages.map(m => ({ role: m.role, content: m.content }));

    try {
      const res = await fetch(`${API_URL}/api/v1/conversations/assistant/stream`, {
        method:  "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body:    JSON.stringify({ message: text, session_id: sessionId.current, history }),
        signal:  abortRef.current.signal,
      });
      if (!res.ok || !res.body) throw new Error(`HTTP ${res.status}`);

      const reader  = res.body.getReader();
      const decoder = new TextDecoder();
      let buf = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        const lines = buf.split("\n");
        buf = lines.pop() ?? "";

        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          const raw = line.slice(6).trim();
          if (raw === "[DONE]") break;
          try {
            const evt = JSON.parse(raw);
            if (evt.type === "token" && evt.text) {
              fullAnswer            += evt.text;
              ttsPendingRef.current += evt.text;
              setMessages(prev => {
                const next = [...prev];
                next[next.length - 1] = { role: "assistant", content: fullAnswer, streaming: true };
                return next;
              });

              // ── Flush text to TTS queue (aggressive for low latency) ────
              let m: RegExpMatchArray | null;

              // 1. Sentence-ending punctuation — flush immediately
              while ((m = /^([\s\S]+?[.!?])\s/.exec(ttsPendingRef.current)) !== null) {
                enqueueTTS(m[1]);
                ttsPendingRef.current = ttsPendingRef.current.slice(m[0].length);
              }
              // 2. Comma / semicolon / colon after 12+ chars
              while ((m = /^([\s\S]{12,}?[,;:])\s/.exec(ttsPendingRef.current)) !== null) {
                enqueueTTS(m[1]);
                ttsPendingRef.current = ttsPendingRef.current.slice(m[0].length);
              }
              // 3. Force-flush at word boundary after 18 chars
              if (ttsPendingRef.current.length > 18) {
                const cut = ttsPendingRef.current.lastIndexOf(" ", 15);
                if (cut > 3) {
                  enqueueTTS(ttsPendingRef.current.slice(0, cut));
                  ttsPendingRef.current = ttsPendingRef.current.slice(cut + 1);
                }
              }
            } else if (evt.type === "done") {
              fullAnswer = evt.answer || fullAnswer;
            }
          } catch { /* skip malformed SSE events */ }
        }
      }
    } catch (err: unknown) {
      if (err instanceof Error && err.name === "AbortError") return;
      fullAnswer = fullAnswer || "Sorry, something went wrong. Please try again.";
    } finally {
      const final = fullAnswer || "I couldn't generate a response. Please try again.";
      setMessages(prev => {
        const next = [...prev];
        next[next.length - 1] = { role: "assistant", content: final, streaming: false };
        return next;
      });
      setStreaming(false);
      if (ttsPendingRef.current.trim()) {
        enqueueTTS(ttsPendingRef.current.trim());
        ttsPendingRef.current = "";
      }
      if (ttsQRef.current.length === 0 && !ttsRunRef.current) setAvatarState("idle");
    }
  }, [token, messages, stopTTS, enqueueTTS]);

  // ── UI handlers ───────────────────────────────────────────────────────────
  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (input.trim()) sendMessage(input);
  }

  function startVoice() {
    if (listening) {
      recognitionRef.current?.stop();
      setListening(false);
      setAvatarState(streamingRef.current ? "thinking" : "idle");
      return;
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const w  = window as any;
    const SR = w.SpeechRecognition ?? w.webkitSpeechRecognition;
    if (!SR) { alert("Speech recognition requires Chrome or Edge."); return; }
    setListening(true);
    setAvatarState("listening");
    const recognition = new SR();
    recognition.continuous     = false;
    recognition.interimResults = false;
    recognition.lang           = "en-US";
    recognition.onstart  = () => { setListening(true);  setAvatarState("listening"); };
    recognition.onend    = () => { setListening(false); setAvatarState(streamingRef.current ? "thinking" : "idle"); };
    recognition.onerror  = () => { setListening(false); setAvatarState("idle"); };
    recognition.onresult = (e: { results: { [k: number]: { [k: number]: { transcript: string } } } }) => {
      const t = e.results[0]?.[0]?.transcript;
      if (t) sendMessage(t);
    };
    recognitionRef.current = recognition;
    try { recognition.start(); } catch { setListening(false); setAvatarState("idle"); }
  }

  function clearChat() {
    abortRef.current?.abort();
    stopTTS();
    setMessages([]);
    sessionId.current = `dash_${Date.now()}_${Math.random().toString(36).slice(2)}`;
    setStreaming(false);
    setAvatarState("idle");
  }

  const statusLabel = speaking  ? "Speaking…"
    : listening                 ? "Listening…"
    : streaming                 ? "Thinking…"
    :                             "Ask about your AI agent";

  // Spinner only during MuseTalk processing — never on idle video load
  const showSpinner = isGenerating;

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="fixed bottom-6 right-6 z-50 flex flex-col items-end gap-3 pointer-events-none">

      {open && (
        <div
          className="pointer-events-auto w-[380px] rounded-3xl shadow-2xl border border-slate-300 flex flex-col overflow-hidden"
          style={{ height: 600, background: "rgba(255,255,255,0.98)", backdropFilter: "blur(24px)", WebkitBackdropFilter: "blur(24px)" }}
        >
          {/* ── Avatar header ─────────────────────────────────────────────── */}
          <div className="relative flex-shrink-0 overflow-hidden" style={{ height: 230, background: "#f8fafc" }}>

            {/*
              Two-layer avatar:
                Layer 1 (idleRef):  base Replicate mp4 — muted, autoPlay, loop.
                                    Plays the instant the panel mounts; no loading
                                    gate, no spinner.  Character is live immediately.
                Layer 2 (speakRef): MuseTalk lip-sync video — NOT muted, no loop.
                                    Shown (opacity 1) only when musetalkUrl is set.
                                    Dismissed on onEnded; Layer 1 reappears.
            */}
            <SimliAvatar
              ref={avatarRef}
              avatarState={avatarState}
              musetalkVideoUrl={musetalkUrl}
              onSpeakVideoReady={() => {
                // MuseTalk video buffered → dismiss "Generating Avatar Sync..." spinner
                setIsGenerating(false);
              }}
              onSpeakVideoEnd={() => {
                // MuseTalk video finished → advance the TTS queue
                speakEndResolveRef.current?.();
                speakEndResolveRef.current = null;
              }}
              className="absolute inset-0"
              style={{ zIndex: 2 }}
            />

            {/* ── Spinner overlay ────────────────────────────────────────────
                Shown ONLY while MuseTalk backend is processing a segment.
                The idle video (Layer 1) is always visible — no loading gate.
            ── */}
            {showSpinner && (
              <div
                className="absolute inset-0 flex flex-col items-center justify-center gap-3 pointer-events-none"
                style={{
                  background: "linear-gradient(160deg,#f0f4f8 0%,#e8eef7 60%,#dfe9f3 100%)",
                  zIndex: 3,
                }}
              >
                <div className="relative w-14 h-14">
                  <div className="absolute inset-0 rounded-full border-2 border-violet-300" />
                  <div
                    className="absolute inset-0 rounded-full border-2 border-transparent border-t-violet-600"
                    style={{ animation: "dash-spin 1s linear infinite" }}
                  />
                  <div
                    className="absolute inset-2 rounded-full"
                    style={{ background: "radial-gradient(circle,rgba(124,58,237,0.1) 0%,transparent 70%)" }}
                  />
                </div>
                <p className="text-[11px] font-semibold text-slate-500 tracking-wide uppercase">
                  {isGenerating ? "Generating Avatar Sync..." : "Loading Avatar..."}
                </p>
              </div>
            )}

            {/* State glow border */}
            <div className="absolute inset-0 pointer-events-none transition-all duration-300" style={{
              zIndex: 10,
              border: "3px solid transparent",
              ...(avatarState === "thinking"  ? { borderColor:"rgba(59,130,246,.55)",  boxShadow:"inset 0 0 30px rgba(59,130,246,.25)" } : {}),
              ...(avatarState === "listening" ? { borderColor:"rgba(16,185,129,.6)",   boxShadow:"inset 0 0 30px rgba(16,185,129,.25)" } : {}),
              ...(avatarState === "speaking"  ? { borderColor:"rgba(124,58,237,.75)",  boxShadow:"inset 0 0 30px rgba(124,58,237,.3), 0 0 0 2px rgba(124,58,237,.4)" } : {}),
            }} />

            {/* Top bar */}
            <div className="absolute top-0 left-0 right-0 flex items-start justify-between px-3 pt-2.5 pb-8"
              style={{ background:"linear-gradient(to bottom,rgba(255,255,255,.7),transparent)", zIndex:11 }}>
              <div>
                <p className="text-sm font-bold text-slate-800 leading-tight" style={{ textShadow:"0 1px 2px rgba(255,255,255,.8)" }}>Dashboard Assistant</p>
                <p className="text-[10.5px] text-slate-600">AI Assistant</p>
              </div>
              <div className="flex items-center gap-1">
                {speaking && (
                  <button onClick={stopTTS} title="Stop speaking"
                    className="w-7 h-7 rounded-lg flex items-center justify-center text-slate-700 hover:bg-white/40 transition"
                    style={{ background:"rgba(255,255,255,.4)", backdropFilter:"blur(4px)" }}>
                    <VolumeX size={13} />
                  </button>
                )}
                <button onClick={() => { setTtsEnabled(v => !v); if (speaking) stopTTS(); }}
                  title={ttsEnabled ? "Mute" : "Unmute"}
                  className="w-7 h-7 rounded-lg flex items-center justify-center text-slate-700 hover:bg-white/40 transition"
                  style={{ background:"rgba(255,255,255,.4)", backdropFilter:"blur(4px)" }}>
                  {ttsEnabled ? <Volume2 size={13} /> : <VolumeX size={13} />}
                </button>
                {messages.length > 0 && (
                  <button onClick={clearChat} title="Clear"
                    className="w-7 h-7 rounded-lg flex items-center justify-center text-slate-700 hover:bg-white/40 transition"
                    style={{ background:"rgba(255,255,255,.4)", backdropFilter:"blur(4px)" }}>
                    <RotateCcw size={12} />
                  </button>
                )}
                <button onClick={() => setOpen(false)}
                  className="w-7 h-7 rounded-lg flex items-center justify-center text-slate-700 hover:bg-white/40 transition"
                  style={{ background:"rgba(255,255,255,.4)", backdropFilter:"blur(4px)" }}>
                  <X size={13} />
                </button>
              </div>
            </div>

            {/* Bottom bar */}
            <div className="absolute bottom-0 left-0 right-0 flex items-end gap-2 px-3 pb-2.5 pt-8"
              style={{ background:"linear-gradient(to top,rgba(255,255,255,.7),transparent)", zIndex:11 }}>
              <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full flex-shrink-0"
                style={{ background:"rgba(255,255,255,.5)", backdropFilter:"blur(4px)" }}>
                <span className="w-2 h-2 rounded-full flex-shrink-0 transition-all duration-300" style={{
                  background: avatarState==="thinking"  ? "#3b82f6"
                            : avatarState==="listening" ? "#10b981"
                            : avatarState==="speaking"  ? "#a855f7"
                            : "#94a3b8",
                  animation: avatarState !== "idle" ? "dash-dot-pulse 0.7s ease-in-out infinite" : "none",
                }} />
                <span className="text-[10.5px] font-semibold text-slate-700 whitespace-nowrap">{statusLabel}</span>
              </div>
              <div className="flex items-end gap-[2.5px] h-6 flex-1 transition-opacity duration-300"
                style={{ opacity: avatarState==="speaking" || avatarState==="listening" ? 1 : 0 }}>
                {Array.from({ length: NUM_WAVE_BARS }, (_, i) => (
                  <span key={i} ref={el => { waveBarRefs.current[i] = el; }}
                    className="flex-shrink-0 rounded-sm"
                    style={{ width:3, height:3, background:"rgba(168,85,247,.75)", transition:"height 0.04s linear" }} />
                ))}
              </div>
              <button onClick={startVoice} title={listening ? "Stop" : "Voice input"}
                className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 text-white transition"
                style={{
                  background:    listening ? "rgba(239,68,68,.6)" : "rgba(168,85,247,.5)",
                  backdropFilter:"blur(4px)",
                  animation:     listening ? "dash-dot-pulse 1.2s ease-in-out infinite" : "none",
                }}>
                {listening ? <MicOff size={14} /> : <Mic size={14} />}
              </button>
            </div>
          </div>

          {/* Messages */}
          <div className="flex-1 overflow-y-auto p-4 space-y-3 bg-white">
            {messages.length === 0 && (
              <div className="h-full flex items-center justify-center">
                <div className="text-center px-4">
                  <p className="text-sm font-semibold text-slate-900 mb-1">Your AI Agent Assistant</p>
                  <p className="text-xs text-slate-500 leading-relaxed mb-4">Ask about training status, conversation quality, API setup, or how to improve your agent.</p>
                  <div className="flex flex-col gap-2">
                    {["How do I train my AI on a new site?","Why isn't my widget responding?","How do I embed the widget?"].map(q => (
                      <button key={q} onClick={() => sendMessage(q)}
                        className="text-xs text-left px-3 py-2 rounded-xl bg-violet-50 hover:bg-violet-100 hover:text-violet-800 text-slate-700 border border-violet-200 hover:border-violet-300 transition">{q}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )}
            {messages.map((m, i) => (
              <div key={i} className={`flex ${m.role==="user" ? "justify-end" : "justify-start"}`}>
                <div
                  className={`max-w-[86%] px-3.5 py-2.5 rounded-2xl text-sm leading-relaxed ${m.role==="user" ? "text-white rounded-br-sm" : "bg-slate-100 text-slate-900 rounded-bl-sm"}`}
                  style={m.role==="user" ? { background:"linear-gradient(135deg,#7c3aed,#a855f7)" } : {}}
                >
                  {m.content || (m.streaming && (
                    <span className="flex gap-1 items-center h-4 py-0.5">
                      {[0,150,300].map(d => <span key={d} className="w-1.5 h-1.5 rounded-full bg-slate-400 animate-bounce" style={{ animationDelay:`${d}ms` }} />)}
                    </span>
                  ))}
                  {m.streaming && m.content && <span className="inline-block w-0.5 h-3.5 bg-slate-400 ml-0.5 animate-pulse align-middle" />}
                </div>
              </div>
            ))}
            <div ref={messagesEndRef} />
          </div>

          {/* Input */}
          <div className="p-3 border-t border-slate-200 flex-shrink-0 bg-white">
            <form onSubmit={handleSubmit} className="flex items-center gap-2 bg-slate-50 rounded-2xl px-3 py-1.5 border border-slate-300 focus-within:border-violet-400 focus-within:ring-2 focus-within:ring-violet-200 transition">
              <input
                ref={inputRef} type="text" value={input}
                onChange={e => setInput(e.target.value)}
                placeholder={listening ? "Listening…" : streaming && !input ? "Responding… (type to interrupt)" : "Type or speak…"}
                className="flex-1 bg-transparent text-sm text-slate-900 placeholder:text-slate-500 focus:outline-none py-1 min-w-0"
              />
              <button type="button" onClick={startVoice}
                title={listening ? "Stop listening" : "Voice input"}
                className="p-1.5 rounded-xl flex-shrink-0 transition-all"
                style={{ background: listening ? "#fee2e2" : "#e8e8f8", color: listening ? "#ef4444" : "#6366f1", animation: listening ? "dash-dot-pulse 1.2s ease-in-out infinite" : "none" }}>
                {listening ? <MicOff size={15} /> : <Mic size={15} />}
              </button>
              {streaming && !input.trim() ? (
                <button type="button" onClick={() => {
                  abortRef.current?.abort(); stopTTS();
                  setMessages(prev => {
                    const next = [...prev];
                    const last = next[next.length - 1];
                    if (last?.streaming) {
                      if (last.content.trim()) return [...next.slice(0,-1),{...last,streaming:false}];
                      return next.slice(0,-1);
                    }
                    return next;
                  });
                  setStreaming(false); setAvatarState("idle");
                }}
                  className="p-1.5 rounded-xl flex-shrink-0 text-white hover:opacity-90 transition shadow-sm"
                  style={{ background:"linear-gradient(135deg,#ef4444,#dc2626)" }} title="Stop">
                  <X size={15} />
                </button>
              ) : (
                <button type="submit" disabled={!input.trim()}
                  className="p-1.5 rounded-xl flex-shrink-0 text-white disabled:opacity-40 hover:opacity-90 transition shadow-sm"
                  style={{ background:"linear-gradient(135deg,#7c3aed,#a855f7)" }} title="Send">
                  <Send size={15} />
                </button>
              )}
            </form>
            <p className="text-[10px] text-slate-400 text-center mt-1.5">
              Powered by WebTalk AI{messages.length > 0 && ` · ${Math.ceil(messages.length/2)} turn${messages.length>2?"s":""}`}
            </p>
          </div>
        </div>
      )}

      {/* Launch button */}
      <button
        onClick={() => setOpen(v => !v)}
        className="pointer-events-auto w-14 h-14 rounded-2xl shadow-xl flex items-center justify-center transition-all duration-200 hover:scale-105 active:scale-95"
        style={{ background: open ? "#334155" : "linear-gradient(135deg,#7c3aed,#a855f7)", boxShadow: open ? "0 10px 25px rgba(0,0,0,.2)" : "0 10px 30px rgba(124,58,237,.4)" }}
        title="Dashboard AI Assistant"
      >
        {open ? <X size={20} className="text-white" /> : (
          <div className="relative">
            <MessageSquare size={20} className="text-white" />
            {(speaking||listening||streaming) && (
              <span className="absolute -top-1.5 -right-1.5 w-3 h-3 rounded-full bg-emerald-400 border-2 border-white" />
            )}
          </div>
        )}
      </button>

      <style>{`
        @keyframes dash-dot-pulse { 0%,100%{transform:scale(1)} 50%{transform:scale(1.5)} }
        @keyframes dash-spin      { to{transform:rotate(360deg)} }
      `}</style>
    </div>
  );
}
