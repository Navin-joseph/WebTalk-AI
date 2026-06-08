/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";
/**
 * DashboardAI  —  HeyGen Interactive Avatar Chat
 * ──────────────────────────────────────────────────────────────────────────
 * Pipeline:
 *   1. Panel mounts → POST /heygen/session → get WebRTC stream URL
 *   2. Frontend renders <HeyGenAvatar peerConnection={pc} />
 *   3. User sends message → LLM generates response
 *   4. Text tokens arrive → buffer in ttsPendingRef
 *   5. Text flushed at sentence boundaries → POST /heygen/chat
 *   6. HeyGen synthesizes + animates in real-time
 *   7. WebRTC stream updates with speaking avatar
 *   8. When response ends, avatar idle state
 *
 * HeyGen handles:
 *   - Text-to-speech (TTS)
 *   - Mouth lip-sync animation
 *   - Natural avatar expressions
 *
 * All in one native pipeline — no separate TTS provider, no separate lip-sync.
 */

import { useState, useEffect, useRef, useCallback } from "react";
import { createClient } from "@/lib/supabase";
import {
  Mic, MicOff, X, Send, Volume2, VolumeX, RotateCcw, MessageSquare,
} from "lucide-react";
import { HeyGenAvatar, type HeyGenAvatarHandle } from "./HeyGenAvatar";

// ── Speech Recognition Type Declarations ──────────────────────────────────
interface ISpeechRecognitionAlternative {
  transcript: string;
  confidence: number;
}

interface ISpeechRecognitionResult {
  length: number;
  isFinal: boolean;
  [index: number]: ISpeechRecognitionAlternative;
  item(index: number): ISpeechRecognitionAlternative;
}

interface ISpeechRecognitionResultList {
  length: number;
  [index: number]: ISpeechRecognitionResult;
  item(index: number): ISpeechRecognitionResult;
}

interface ISpeechRecognitionEvent extends Event {
  results: ISpeechRecognitionResultList;
  resultIndex: number;
}

interface ISpeechRecognition extends EventTarget {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onstart: ((this: ISpeechRecognition, ev: Event) => void) | null;
  onend: ((this: ISpeechRecognition, ev: Event) => void) | null;
  onerror: ((this: ISpeechRecognition, ev: Event) => void) | null;
  onresult: ((this: ISpeechRecognition, ev: ISpeechRecognitionEvent) => void) | null;
  start(): void;
  stop(): void;
  abort(): void;
}

// ── Config ────────────────────────────────────────────────────────────────────
const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

// ── Types ─────────────────────────────────────────────────────────────────────
interface Message {
  role: "user" | "assistant";
  content: string;
  streaming?: boolean;
}

type AvatarState = "idle" | "thinking" | "listening" | "speaking";

interface HeyGenSessionData {
  session_id: string;
  access_token: string;
  video_stream_url: string;
}

interface HeyGenSDPResponse {
  sdp_answer: string;
}

interface AssistantStreamEvent {
  type: "token" | "done";
  text?: string;
  answer?: string;
}

// ── Component ─────────────────────────────────────────────────────────────────
export default function DashboardAI(): React.ReactElement {
  // ── UI state ──────────────────────────────────────────────────────────────
  const [open, setOpen] = useState<boolean>(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState<string>("");
  const [streaming, setStreaming] = useState<boolean>(false);
  const [listening, setListening] = useState<boolean>(false);
  const [speaking, setSpeaking] = useState<boolean>(false);
  const [avatarState, setAvatarState] = useState<AvatarState>("idle");
  const [token, setToken] = useState<string>("");
  const [ttsEnabled, setTtsEnabled] = useState<boolean>(true);

  // ── HeyGen WebRTC state ──────────────────────────────────────────────────
  const [heygenSessionId, setHeygenSessionId] = useState<string | null>(null);
  const [heygenPeerConnection, setHeygenPeerConnection] = useState<RTCPeerConnection | null>(null);

  // ── Refs ──────────────────────────────────────────────────────────────────
  const sessionId = useRef<string>(`dash_${Date.now()}_${Math.random().toString(36).slice(2)}`);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const recognitionRef = useRef<ISpeechRecognition | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const avatarRef = useRef<HeyGenAvatarHandle>(null);

  // Stable refs that closures can read without stale values
  const tokenRef = useRef<string>(token);
  const ttsEnabledRef = useRef<boolean>(ttsEnabled);
  const streamingRef = useRef<boolean>(false);

  useEffect(() => { tokenRef.current = token; }, [token]);
  useEffect(() => { ttsEnabledRef.current = ttsEnabled; }, [ttsEnabled]);
  useEffect(() => { streamingRef.current = streaming; }, [streaming]);

  // ── TTS queue refs ────────────────────────────────────────────────────────
  const ttsAbortRef = useRef<boolean>(false);
  const ttsQRef = useRef<string[]>([]);
  const ttsRunRef = useRef<boolean>(false);
  const ttsPendingRef = useRef<string>("");

  // ── Auth ──────────────────────────────────────────────────────────────────
  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) setToken(data.session.access_token);
    });
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (_event, session) => {
        if (session) setToken(session.access_token);
      },
    );
    return () => subscription.unsubscribe();
  }, []);

  // ── Panel open: create HeyGen session & WebRTC peer connection ──────────
  useEffect(() => {
    if (!open || !tokenRef.current) return;

    let isMounted = true;
    let pc: RTCPeerConnection | null = null;

    (async (): Promise<void> => {
      try {
        // Step 1: Create HeyGen session
        console.log("[HeyGen] Creating session...");
        const sessionRes = await fetch(
          `${API_URL}/api/v1/conversations/heygen/session`,
          {
            method: "POST",
            headers: { Authorization: `Bearer ${tokenRef.current}` },
          },
        );

        if (!sessionRes.ok) {
          const errorText = await sessionRes.text();
          console.error(
            `[HeyGen] Session creation failed HTTP ${sessionRes.status}:`,
            errorText.substring(0, 300),
          );
          return;
        }

        const sessionData = await sessionRes.json() as HeyGenSessionData;

        if (!isMounted) return;

        console.log("[HeyGen] Session created:", sessionData.session_id);
        setHeygenSessionId(sessionData.session_id);

        // Step 2: Create RTCPeerConnection
        console.log("[HeyGen] Creating RTCPeerConnection...");
        pc = new RTCPeerConnection({
          iceServers: [
            { urls: ["stun:stun.l.google.com:19302"] },
            { urls: ["stun:stun1.l.google.com:19302"] },
          ],
        });

        if (!isMounted) {
          pc.close();
          return;
        }

        // Step 3: Generate SDP offer
        console.log("[HeyGen] Generating SDP offer...");
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);

        if (!isMounted) {
          pc.close();
          return;
        }

        // Step 4: Send SDP offer to backend, get answer from HeyGen
        console.log("[HeyGen] Sending SDP offer to backend...");
        const sdfRes = await fetch(
          `${API_URL}/api/v1/conversations/heygen/webrtc`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${tokenRef.current}`,
            },
            body: JSON.stringify({
              session_id: sessionData.session_id,
              access_token: sessionData.access_token,
              sdp_offer: offer.sdp,
            }),
          },
        );

        if (!sdfRes.ok) {
          const errorText = await sdfRes.text();
          console.error(
            `[HeyGen] SDP exchange failed HTTP ${sdfRes.status}:`,
            errorText.substring(0, 300),
          );
          pc.close();
          return;
        }

        const sdfData = await sdfRes.json() as HeyGenSDPResponse;

        if (!isMounted) {
          pc.close();
          return;
        }

        // Step 5: Set remote description (SDP answer from HeyGen)
        console.log("[HeyGen] Setting remote SDP answer...");
        const answer = new RTCSessionDescription({
          type: "answer",
          sdp: sdfData.sdp_answer,
        });
        await pc.setRemoteDescription(answer);

        if (!isMounted) {
          pc.close();
          return;
        }

        console.log("[HeyGen] WebRTC handshake complete, waiting for remote tracks...");
        setHeygenPeerConnection(pc);
      } catch (error: unknown) {
        console.error("[HeyGen] WebRTC setup error:", error);
        if (pc) pc.close();
      }
    })();

    // Cleanup: close peer connection when panel closes
    return () => {
      isMounted = false;
      if (pc && pc.connectionState !== "closed") {
        console.log("[HeyGen] Closing peer connection");
        pc.close();
      }
      setHeygenPeerConnection(null);
      setHeygenSessionId(null);
    };
  }, [open]);

  // ── Focus input on panel open ──────────────────────────────────────────────
  useEffect(() => {
    if (!open) return;
    setTimeout(() => inputRef.current?.focus(), 100);
  }, [open]);

  // ── Scroll to latest message ──────────────────────────────────────────────
  useEffect(() => {
    if (!open) return;
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [open, messages]);

  // ── Send text to HeyGen for TTS + animation ───────────────────────────────
  const sendToHeyGen = useCallback(
    async (text: string): Promise<void> => {
      if (!ttsEnabledRef.current || !text.trim() || !heygenSessionId || !tokenRef.current) {
        return;
      }

      try {
        const r = await fetch(
          `${API_URL}/api/v1/conversations/heygen/chat`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${tokenRef.current}`,
            },
            body: JSON.stringify({
              session_id: heygenSessionId,
              text: text.trim(),
            }),
          },
        );

        if (!r.ok) {
          console.error("HeyGen chat failed:", r.status);
        }
      } catch (error: unknown) {
        console.error("HeyGen send error:", error);
      }
    },
    [heygenSessionId],
  );

  const enqueueTTS = useCallback((text: string): void => {
    if (!ttsEnabledRef.current || !text.trim()) return;
    ttsAbortRef.current = false;
    ttsQRef.current.push(text.trim());
    drainTTS();
  }, [drainTTS]);

  const drainTTS = useCallback(async (): Promise<void> => {
    if (ttsRunRef.current) return;
    ttsRunRef.current = true;

    while (ttsQRef.current.length > 0 && !ttsAbortRef.current) {
      const text = ttsQRef.current.shift();
      if (text && text.trim()) {
        setSpeaking(true);
        setAvatarState("speaking");
        // Send to HeyGen — it handles TTS + animation
        await sendToHeyGen(text);
        // Brief delay before next chunk for natural pacing
        await new Promise((resolve) => setTimeout(resolve, 500));
      }
    }

    ttsRunRef.current = false;
    if (ttsQRef.current.length === 0) {
      setSpeaking(false);
      setAvatarState(streamingRef.current ? "thinking" : "idle");
    }
  }, [sendToHeyGen]);

  // ── Stop all TTS immediately ──────────────────────────────────────────────
  const stopTTS = useCallback((): void => {
    ttsAbortRef.current = true;
    ttsQRef.current = [];
    ttsRunRef.current = false;
    ttsPendingRef.current = "";
    setSpeaking(false);
    setAvatarState(streamingRef.current ? "thinking" : "idle");
  }, []);

  // ── Chat stream ───────────────────────────────────────────────────────────
  const sendMessage = useCallback(
    async (text: string): Promise<void> => {
      if (!text.trim() || !token) return;
      abortRef.current?.abort();
      abortRef.current = new AbortController();
      stopTTS();
      ttsAbortRef.current = false;
      ttsPendingRef.current = "";

      if (streamingRef.current) {
        setMessages((prev) => {
          const next = [...prev];
          const last = next[next.length - 1];
          if (last?.streaming) {
            if (last.content.trim()) {
              return [...next.slice(0, -1), { ...last, streaming: false }];
            }
            return next.slice(0, -1);
          }
          return next;
        });
        setStreaming(false);
      }

      setMessages((prev) => [
        ...prev,
        { role: "user", content: text },
        { role: "assistant", content: "", streaming: true },
      ]);
      setInput("");
      setStreaming(true);
      setAvatarState("thinking");

      let fullAnswer = "";
      const history = messages.map((m) => ({
        role: m.role,
        content: m.content,
      }));

      try {
        const res = await fetch(
          `${API_URL}/api/v1/conversations/assistant/stream`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${token}`,
            },
            body: JSON.stringify({
              message: text,
              session_id: sessionId.current,
              history,
            }),
            signal: abortRef.current.signal,
          },
        );
        if (!res.ok || !res.body) throw new Error(`HTTP ${res.status}`);

        const reader = res.body.getReader();
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
              const evt = JSON.parse(raw) as AssistantStreamEvent;
              if (evt.type === "token" && evt.text) {
                fullAnswer += evt.text;
                ttsPendingRef.current += evt.text;
                setMessages((prev) => {
                  const next = [...prev];
                  next[next.length - 1] = {
                    role: "assistant",
                    content: fullAnswer,
                    streaming: true,
                  };
                  return next;
                });

                // ── Flush text to HeyGen (aggressive for low latency) ────
                let m: RegExpMatchArray | null;

                // 1. Sentence-ending punctuation — flush immediately
                while (
                  (m = /^([\s\S]+?[.!?])\s/.exec(ttsPendingRef.current)) !==
                  null
                ) {
                  enqueueTTS(m[1]);
                  ttsPendingRef.current = ttsPendingRef.current.slice(m[0].length);
                }
                // 2. Comma / semicolon / colon after 12+ chars
                while (
                  (m = /^([\s\S]{12,}?[,;:])\s/.exec(ttsPendingRef.current)) !==
                  null
                ) {
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
            } catch {
              /* skip malformed SSE events */
            }
          }
        }
      } catch (err: unknown) {
        if (err instanceof Error && err.name === "AbortError") return;
        fullAnswer =
          fullAnswer ||
          "Sorry, something went wrong. Please try again.";
      } finally {
        const final =
          fullAnswer || "I couldn't generate a response. Please try again.";
        setMessages((prev) => {
          const next = [...prev];
          next[next.length - 1] = {
            role: "assistant",
            content: final,
            streaming: false,
          };
          return next;
        });
        setStreaming(false);
        if (ttsPendingRef.current.trim()) {
          enqueueTTS(ttsPendingRef.current.trim());
          ttsPendingRef.current = "";
        }
        if (ttsQRef.current.length === 0 && !ttsRunRef.current) {
          setAvatarState("idle");
        }
      }
    },
    [token, messages, stopTTS, enqueueTTS],
  );

  // ── UI handlers ───────────────────────────────────────────────────────────
  const handleSubmit = (e: React.FormEvent<HTMLFormElement>): void => {
    e.preventDefault();
    if (input.trim()) sendMessage(input);
  };

  const startVoice = (): void => {
    if (listening) {
      recognitionRef.current?.stop();
      setListening(false);
      setAvatarState(streamingRef.current ? "thinking" : "idle");
      return;
    }
    // Access SpeechRecognition from window (both standard and webkit variants)
    const w = window as Window & {
      SpeechRecognition?: new () => ISpeechRecognition;
      webkitSpeechRecognition?: new () => ISpeechRecognition;
    };
    const SR = w.SpeechRecognition ?? w.webkitSpeechRecognition;
    if (!SR) {
      alert("Speech recognition requires Chrome or Edge.");
      return;
    }
    setListening(true);
    setAvatarState("listening");
    const recognition = new SR();
    recognition.continuous = false;
    recognition.interimResults = false;
    recognition.lang = "en-US";
    recognition.onstart = (): void => {
      setListening(true);
      setAvatarState("listening");
    };
    recognition.onend = (): void => {
      setListening(false);
      setAvatarState(streamingRef.current ? "thinking" : "idle");
    };
    recognition.onerror = (): void => {
      setListening(false);
      setAvatarState("idle");
    };
    recognition.onresult = (e: ISpeechRecognitionEvent): void => {
      const t = e.results[0]?.[0]?.transcript;
      if (t) sendMessage(t);
    };
    recognitionRef.current = recognition;
    try {
      recognition.start();
    } catch {
      setListening(false);
      setAvatarState("idle");
    }
  };

  const clearChat = (): void => {
    abortRef.current?.abort();
    stopTTS();
    setMessages([]);
    sessionId.current = `dash_${Date.now()}_${Math.random().toString(36).slice(2)}`;
    setStreaming(false);
    setAvatarState("idle");
  };

  const statusLabel: string = speaking
    ? "Speaking…"
    : listening
      ? "Listening…"
      : streaming
        ? "Thinking…"
        : "Ask about your AI agent";

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="fixed bottom-6 right-6 z-50 flex flex-col items-end gap-3 pointer-events-none">
      {open && (
        <div
          className="pointer-events-auto w-[380px] rounded-3xl shadow-2xl border border-slate-300 flex flex-col overflow-hidden"
          style={{
            height: 600,
            background: "rgba(255,255,255,0.98)",
            backdropFilter: "blur(24px)",
            WebkitBackdropFilter: "blur(24px)",
          }}
        >
          {/* ── Avatar header ─────────────────────────────────────────────── */}
          <div
            className="relative flex-shrink-0 overflow-hidden"
            style={{ height: 230, background: "#f8fafc" }}
          >
            {/* ── HeyGen WebRTC video stream (with audio) ── */}
            <HeyGenAvatar
              ref={avatarRef}
              peerConnection={heygenPeerConnection}
              className="absolute inset-0"
              style={{ zIndex: 2 }}
            />

            {/* State glow border */}
            <div
              className="absolute inset-0 pointer-events-none transition-all duration-300"
              style={{
                zIndex: 10,
                border: "3px solid transparent",
                ...(avatarState === "thinking"
                  ? {
                      borderColor: "rgba(59,130,246,.55)",
                      boxShadow: "inset 0 0 30px rgba(59,130,246,.25)",
                    }
                  : {}),
                ...(avatarState === "listening"
                  ? {
                      borderColor: "rgba(16,185,129,.6)",
                      boxShadow: "inset 0 0 30px rgba(16,185,129,.25)",
                    }
                  : {}),
                ...(avatarState === "speaking"
                  ? {
                      borderColor: "rgba(124,58,237,.75)",
                      boxShadow:
                        "inset 0 0 30px rgba(124,58,237,.3), 0 0 0 2px rgba(124,58,237,.4)",
                    }
                  : {}),
              }}
            />

            {/* Top bar */}
            <div
              className="absolute top-0 left-0 right-0 flex items-start justify-between px-3 pt-2.5 pb-8"
              style={{
                background: "linear-gradient(to bottom,rgba(255,255,255,.7),transparent)",
                zIndex: 11,
              }}
            >
              <div>
                <p
                  className="text-sm font-bold text-slate-800 leading-tight"
                  style={{ textShadow: "0 1px 2px rgba(255,255,255,.8)" }}
                >
                  Dashboard Assistant
                </p>
                <p className="text-[10.5px] text-slate-600">HeyGen Avatar</p>
              </div>
              <div className="flex items-center gap-1">
                {speaking && (
                  <button
                    onClick={stopTTS}
                    title="Stop speaking"
                    className="w-7 h-7 rounded-lg flex items-center justify-center text-slate-700 hover:bg-white/40 transition"
                    style={{
                      background: "rgba(255,255,255,.4)",
                      backdropFilter: "blur(4px)",
                    }}
                  >
                    <VolumeX size={13} />
                  </button>
                )}
                <button
                  onClick={() => {
                    setTtsEnabled((v) => !v);
                    if (speaking) stopTTS();
                  }}
                  title={ttsEnabled ? "Mute" : "Unmute"}
                  className="w-7 h-7 rounded-lg flex items-center justify-center text-slate-700 hover:bg-white/40 transition"
                  style={{
                    background: "rgba(255,255,255,.4)",
                    backdropFilter: "blur(4px)",
                  }}
                >
                  {ttsEnabled ? (
                    <Volume2 size={13} />
                  ) : (
                    <VolumeX size={13} />
                  )}
                </button>
                {messages.length > 0 && (
                  <button
                    onClick={clearChat}
                    title="Clear"
                    className="w-7 h-7 rounded-lg flex items-center justify-center text-slate-700 hover:bg-white/40 transition"
                    style={{
                      background: "rgba(255,255,255,.4)",
                      backdropFilter: "blur(4px)",
                    }}
                  >
                    <RotateCcw size={12} />
                  </button>
                )}
                <button
                  onClick={() => setOpen(false)}
                  className="w-7 h-7 rounded-lg flex items-center justify-center text-slate-700 hover:bg-white/40 transition"
                  style={{
                    background: "rgba(255,255,255,.4)",
                    backdropFilter: "blur(4px)",
                  }}
                >
                  <X size={13} />
                </button>
              </div>
            </div>

            {/* Bottom bar */}
            <div
              className="absolute bottom-0 left-0 right-0 flex items-end gap-2 px-3 pb-2.5 pt-8"
              style={{
                background:
                  "linear-gradient(to top,rgba(255,255,255,.7),transparent)",
                zIndex: 11,
              }}
            >
              <div
                className="flex items-center gap-1.5 px-2.5 py-1 rounded-full flex-shrink-0"
                style={{
                  background: "rgba(255,255,255,.5)",
                  backdropFilter: "blur(4px)",
                }}
              >
                <span
                  className="w-2 h-2 rounded-full flex-shrink-0 transition-all duration-300"
                  style={{
                    background:
                      avatarState === "thinking"
                        ? "#3b82f6"
                        : avatarState === "listening"
                          ? "#10b981"
                          : avatarState === "speaking"
                            ? "#a855f7"
                            : "#94a3b8",
                    animation:
                      avatarState !== "idle"
                        ? "dash-dot-pulse 0.7s ease-in-out infinite"
                        : "none",
                  }}
                />
                <span className="text-[10.5px] font-semibold text-slate-700 whitespace-nowrap">
                  {statusLabel}
                </span>
              </div>
              <button
                onClick={startVoice}
                title={listening ? "Stop" : "Voice input"}
                className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 text-white transition"
                style={{
                  background: listening
                    ? "rgba(239,68,68,.6)"
                    : "rgba(168,85,247,.5)",
                  backdropFilter: "blur(4px)",
                  animation: listening
                    ? "dash-dot-pulse 1.2s ease-in-out infinite"
                    : "none",
                }}
              >
                {listening ? (
                  <MicOff size={14} />
                ) : (
                  <Mic size={14} />
                )}
              </button>
            </div>
          </div>

          {/* Messages */}
          <div className="flex-1 overflow-y-auto p-4 space-y-3 bg-white">
            {messages.length === 0 && (
              <div className="h-full flex items-center justify-center">
                <div className="text-center px-4">
                  <p className="text-sm font-semibold text-slate-900 mb-1">
                    Your AI Agent Assistant
                  </p>
                  <p className="text-xs text-slate-500 leading-relaxed mb-4">
                    Ask about training status, conversation quality, API setup,
                    or how to improve your agent.
                  </p>
                  <div className="flex flex-col gap-2">
                    {[
                      "How do I train my AI on a new site?",
                      "Why isn't my widget responding?",
                      "How do I embed the widget?",
                    ].map((q) => (
                      <button
                        key={q}
                        onClick={() => sendMessage(q)}
                        className="text-xs text-left px-3 py-2 rounded-xl bg-violet-50 hover:bg-violet-100 hover:text-violet-800 text-slate-700 border border-violet-200 hover:border-violet-300 transition"
                      >
                        {q}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )}
            {messages.map((m, i) => (
              <div
                key={i}
                className={`flex ${
                  m.role === "user" ? "justify-end" : "justify-start"
                }`}
              >
                <div
                  className={`max-w-[86%] px-3.5 py-2.5 rounded-2xl text-sm leading-relaxed ${
                    m.role === "user"
                      ? "text-white rounded-br-sm"
                      : "bg-slate-100 text-slate-900 rounded-bl-sm"
                  }`}
                  style={
                    m.role === "user"
                      ? { background: "linear-gradient(135deg,#7c3aed,#a855f7)" }
                      : {}
                  }
                >
                  {m.content ||
                    (m.streaming && (
                      <span className="flex gap-1 items-center h-4 py-0.5">
                        {[0, 150, 300].map((d) => (
                          <span
                            key={d}
                            className="w-1.5 h-1.5 rounded-full bg-slate-400 animate-bounce"
                            style={{ animationDelay: `${d}ms` }}
                          />
                        ))}
                      </span>
                    ))}
                  {m.streaming && m.content && (
                    <span className="inline-block w-0.5 h-3.5 bg-slate-400 ml-0.5 animate-pulse align-middle" />
                  )}
                </div>
              </div>
            ))}
            <div ref={messagesEndRef} />
          </div>

          {/* Input */}
          <div className="p-3 border-t border-slate-200 flex-shrink-0 bg-white">
            <form
              onSubmit={handleSubmit}
              className="flex items-center gap-2 bg-slate-50 rounded-2xl px-3 py-1.5 border border-slate-300 focus-within:border-violet-400 focus-within:ring-2 focus-within:ring-violet-200 transition"
            >
              <input
                ref={inputRef}
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder={
                  listening
                    ? "Listening…"
                    : streaming && !input
                      ? "Responding… (type to interrupt)"
                      : "Type or speak…"
                }
                className="flex-1 bg-transparent text-sm text-slate-900 placeholder:text-slate-500 focus:outline-none py-1 min-w-0"
              />
              <button
                type="button"
                onClick={startVoice}
                title={listening ? "Stop listening" : "Voice input"}
                className="p-1.5 rounded-xl flex-shrink-0 transition-all"
                style={{
                  background: listening ? "#fee2e2" : "#e8e8f8",
                  color: listening ? "#ef4444" : "#6366f1",
                  animation: listening
                    ? "dash-dot-pulse 1.2s ease-in-out infinite"
                    : "none",
                }}
              >
                {listening ? (
                  <MicOff size={15} />
                ) : (
                  <Mic size={15} />
                )}
              </button>
              {streaming && !input.trim() ? (
                <button
                  type="button"
                  onClick={() => {
                    abortRef.current?.abort();
                    stopTTS();
                    setMessages((prev) => {
                      const next = [...prev];
                      const last = next[next.length - 1];
                      if (last?.streaming) {
                        if (last.content.trim()) {
                          return [
                            ...next.slice(0, -1),
                            { ...last, streaming: false },
                          ];
                        }
                        return next.slice(0, -1);
                      }
                      return next;
                    });
                    setStreaming(false);
                    setAvatarState("idle");
                  }}
                  className="p-1.5 rounded-xl flex-shrink-0 text-white hover:opacity-90 transition shadow-sm"
                  style={{
                    background: "linear-gradient(135deg,#ef4444,#dc2626)",
                  }}
                  title="Stop"
                >
                  <X size={15} />
                </button>
              ) : (
                <button
                  type="submit"
                  disabled={!input.trim()}
                  className="p-1.5 rounded-xl flex-shrink-0 text-white disabled:opacity-40 hover:opacity-90 transition shadow-sm"
                  style={{
                    background: "linear-gradient(135deg,#7c3aed,#a855f7)",
                  }}
                  title="Send"
                >
                  <Send size={15} />
                </button>
              )}
            </form>
            <p className="text-[10px] text-slate-400 text-center mt-1.5">
              Powered by WebTalk AI
              {messages.length > 0 &&
                ` · ${Math.ceil(messages.length / 2)} turn${
                  messages.length > 2 ? "s" : ""
                }`}
            </p>
          </div>
        </div>
      )}

      {/* Launch button */}
      <button
        onClick={() => setOpen((v) => !v)}
        className="pointer-events-auto w-14 h-14 rounded-2xl shadow-xl flex items-center justify-center transition-all duration-200 hover:scale-105 active:scale-95"
        style={{
          background: open
            ? "#334155"
            : "linear-gradient(135deg,#7c3aed,#a855f7)",
          boxShadow: open
            ? "0 10px 25px rgba(0,0,0,.2)"
            : "0 10px 30px rgba(124,58,237,.4)",
        }}
        title="Dashboard AI Assistant"
      >
        {open ? (
          <X size={20} className="text-white" />
        ) : (
          <div className="relative">
            <MessageSquare size={20} className="text-white" />
            {(speaking || listening || streaming) && (
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
