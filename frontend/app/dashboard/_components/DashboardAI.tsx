"use client";
import { useState, useEffect, useRef, useCallback } from "react";
import { createClient } from "@/lib/supabase";
import { Mic, MicOff, X, Send, Loader2, Volume2, VolumeX, RotateCcw, MessageSquare } from "lucide-react";

interface Message {
  role: "user" | "assistant";
  content: string;
  streaming?: boolean;
}

type AvatarState = "idle" | "thinking" | "listening" | "speaking";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

// ── Human face SVG (same design as the embedded widget) ──────────────────────
function FaceSVG({ jawRef, teethRef }: {
  jawRef: React.RefObject<SVGGElement | null>;
  teethRef: React.RefObject<SVGRectElement | null>;
}) {
  return (
    <svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg" style={{ width: "100%", height: "100%", display: "block" }}>
      <defs>
        <clipPath id="dash-fc"><circle cx="50" cy="50" r="50" /></clipPath>
        <radialGradient id="dash-sg" cx="45%" cy="35%">
          <stop offset="0%" stopColor="#e8a87c" />
          <stop offset="100%" stopColor="#c8704a" />
        </radialGradient>
        <radialGradient id="dash-hg" cx="50%" cy="0%">
          <stop offset="0%" stopColor="#4a2c0a" />
          <stop offset="100%" stopColor="#1e0d00" />
        </radialGradient>
      </defs>
      <g clipPath="url(#dash-fc)">
        <rect width="100" height="100" fill="#f0e6d8" />
        <g style={{ transformBox: "fill-box", transformOrigin: "center bottom", animation: "dash-sway 5s ease-in-out infinite" }}>
          {/* Neck */}
          <rect x="37" y="82" width="26" height="24" rx="6" fill="url(#dash-sg)" />
          {/* Shirt */}
          <path d="M0 100 Q20 85 37 88 L63 88 Q80 85 100 100Z" fill="#c0392b" />
          {/* Collar */}
          <path d="M37 88 L50 96 L63 88" fill="none" stroke="#fff" strokeWidth="2.5" />
          {/* Face base */}
          <ellipse cx="50" cy="52" rx="29" ry="32" fill="url(#dash-sg)" />
          {/* Hair */}
          <ellipse cx="50" cy="24" rx="30" ry="20" fill="url(#dash-hg)" />
          <rect x="20" y="20" width="60" height="22" fill="url(#dash-hg)" />
          {/* Ears */}
          <ellipse cx="21" cy="52" rx="5" ry="7" fill="#c8704a" />
          <ellipse cx="79" cy="52" rx="5" ry="7" fill="#c8704a" />
          {/* Eyebrows */}
          <path d="M31 38 Q37 35 43 37" stroke="#2d1a0e" strokeWidth="2.2" strokeLinecap="round" fill="none" />
          <path d="M57 37 Q63 35 69 38" stroke="#2d1a0e" strokeWidth="2.2" strokeLinecap="round" fill="none" />
          {/* Left eye */}
          <ellipse cx="37" cy="45" rx="7" ry="5.5" fill="#fff" />
          <ellipse cx="37" cy="45" rx="4" ry="4" fill="#3d2007" />
          <ellipse cx="37" cy="45" rx="2" ry="2" fill="#0d0500" />
          <ellipse cx="38.5" cy="43.5" rx=".9" ry=".9" fill="#fff" opacity=".7" />
          {/* Left eyelid */}
          <ellipse cx="37" cy="45" rx="7" ry="5.5" fill="url(#dash-sg)"
            style={{ transformBox: "fill-box", transformOrigin: "center top", animation: "dash-blink 3.8s ease-in-out infinite" }} />
          {/* Right eye */}
          <ellipse cx="63" cy="45" rx="7" ry="5.5" fill="#fff" />
          <ellipse cx="63" cy="45" rx="4" ry="4" fill="#3d2007" />
          <ellipse cx="63" cy="45" rx="2" ry="2" fill="#0d0500" />
          <ellipse cx="64.5" cy="43.5" rx=".9" ry=".9" fill="#fff" opacity=".7" />
          {/* Right eyelid */}
          <ellipse cx="63" cy="45" rx="7" ry="5.5" fill="url(#dash-sg)"
            style={{ transformBox: "fill-box", transformOrigin: "center top", animation: "dash-blink 3.8s ease-in-out infinite", animationDelay: "0.06s" }} />
          {/* Nose */}
          <path d="M48 50 L46 60 Q50 62 54 60 L52 50" fill="#c26040" opacity=".5" />
          <ellipse cx="46.5" cy="60" rx="3" ry="2" fill="#b8583a" opacity=".6" />
          <ellipse cx="53.5" cy="60" rx="3" ry="2" fill="#b8583a" opacity=".6" />
          {/* Mouth — upper lip fixed, lower jaw animated by JS */}
          <path d="M40 68 Q45 66 50 67 Q55 66 60 68 Q55 70 50 70 Q45 70 40 68Z" fill="#a0402a" />
          <g ref={jawRef} style={{ transition: "transform 0.04s linear" }}>
            <path d="M40 70 Q50 75 60 70 Q55 74 50 75 Q45 74 40 70Z" fill="#b8503a" />
            <rect ref={teethRef} x="43" y="70" width="14" height="3" rx="1.5" fill="#f0ede8" opacity="0" />
          </g>
          {/* Beard */}
          <path d="M32 70 Q34 80 50 84 Q66 80 68 70 Q60 75 50 76 Q40 75 32 70Z" fill="#1e0d00" opacity=".55" />
          {/* Cheek blush */}
          <ellipse cx="28" cy="58" rx="6" ry="4" fill="#e07050" opacity=".18" />
          <ellipse cx="72" cy="58" rx="6" ry="4" fill="#e07050" opacity=".18" />
          {/* Smile lines */}
          <path d="M41 65 Q39 68 38 72" stroke="#b86040" strokeWidth=".8" fill="none" opacity=".4" />
          <path d="M59 65 Q61 68 62 72" stroke="#b86040" strokeWidth=".8" fill="none" opacity=".4" />
        </g>
      </g>
    </svg>
  );
}

const RING_STYLES: Record<AvatarState, React.CSSProperties> = {
  idle:      { background: "rgba(148,163,184,.25)", animation: "none" },
  thinking:  { background: "conic-gradient(#3b82f6,#06b6d4,#3b82f6)", animation: "dash-ring-spin 2s linear infinite" },
  listening: { background: "conic-gradient(#10b981,#34d399,#10b981)", animation: "dash-ring-spin 1.2s linear infinite" },
  speaking:  { background: "conic-gradient(#7c3aed,#a855f7,#7c3aed)", animation: "dash-ring-spin 0.8s linear infinite" },
};
const DOT_COLORS: Record<AvatarState, string> = {
  idle: "#94a3b8", thinking: "#3b82f6", listening: "#10b981", speaking: "#7c3aed",
};
const STATUS_LABELS: Record<AvatarState, string> = {
  idle: "Ask about your AI agent",
  thinking: "Thinking…",
  listening: "Listening…",
  speaking: "Speaking…",
};

export default function DashboardAI() {
  const [open, setOpen]               = useState(false);
  const [messages, setMessages]       = useState<Message[]>([]);
  const [input, setInput]             = useState("");
  const [streaming, setStreaming]     = useState(false);
  const [listening, setListening]     = useState(false);
  const [speaking, setSpeaking]       = useState(false);
  const [avatarState, setAvatarState] = useState<AvatarState>("idle");
  const [token, setToken]             = useState("");
  const [ttsEnabled, setTtsEnabled]   = useState(true);

  const sessionId      = useRef(`dash_${Date.now()}_${Math.random().toString(36).slice(2)}`);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const recognitionRef = useRef<any>(null);
  const abortRef       = useRef<AbortController | null>(null);
  const inputRef       = useRef<HTMLInputElement>(null);

  // TTS refs
  const audioRef        = useRef<HTMLAudioElement | null>(null);
  const audioUrlRef     = useRef<string | null>(null);
  const ttsAbortRef     = useRef(false);
  const ttsQRef         = useRef<string[]>([]);
  const ttsRunRef       = useRef(false);
  const ttsPendingRef   = useRef("");
  const tokenRef        = useRef(token);
  const ttsEnabledRef   = useRef(ttsEnabled);
  const streamingRef    = useRef(false);   // mirror for async callbacks

  // Lip-sync refs
  const jawRef          = useRef<SVGGElement | null>(null);
  const teethRef        = useRef<SVGRectElement | null>(null);
  const lipCtxRef       = useRef<AudioContext | null>(null);
  const lipAnimRef      = useRef<number | null>(null);
  const lipSrcRef       = useRef<MediaElementAudioSourceNode | null>(null);

  useEffect(() => { tokenRef.current = token; }, [token]);
  useEffect(() => { ttsEnabledRef.current = ttsEnabled; }, [ttsEnabled]);
  useEffect(() => { streamingRef.current = streaming; }, [streaming]);

  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) setToken(data.session.access_token);
    });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_e, session) => {
      if (session) setToken(session.access_token);
    });
    return () => subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (open) {
      setTimeout(() => inputRef.current?.focus(), 100);
      messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [open, messages]);

  // ── Lip-sync helpers ─────────────────────────────────────────────────────────
  const startLipSync = useCallback((audioEl: HTMLAudioElement) => {
    stopLipSync();
    try {
      if (!lipCtxRef.current) lipCtxRef.current = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
      const analyser = lipCtxRef.current.createAnalyser();
      analyser.fftSize = 256;
      analyser.smoothingTimeConstant = 0.6;
      const src = lipCtxRef.current.createMediaElementSource(audioEl);
      src.connect(analyser);
      analyser.connect(lipCtxRef.current.destination);
      lipSrcRef.current = src;
      const data = new Uint8Array(analyser.frequencyBinCount);
      const tick = () => {
        lipAnimRef.current = requestAnimationFrame(tick);
        analyser.getByteFrequencyData(data);
        let sum = 0;
        for (let i = 2; i < 30; i++) sum += data[i];
        const lip = Math.min(1, (sum / 28) / 90);
        if (jawRef.current)   jawRef.current.style.transform   = `translateY(${(lip * 8).toFixed(1)}px)`;
        if (teethRef.current) teethRef.current.style.opacity   = Math.min(1, lip * 1.4).toFixed(2);
      };
      tick();
    } catch { /* AudioContext blocked — degrade gracefully */ }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function stopLipSync() {
    if (lipAnimRef.current) { cancelAnimationFrame(lipAnimRef.current); lipAnimRef.current = null; }
    try { if (lipSrcRef.current) { lipSrcRef.current.disconnect(); lipSrcRef.current = null; } } catch {}
    if (jawRef.current)   jawRef.current.style.transform = "";
    if (teethRef.current) teethRef.current.style.opacity  = "0";
  }

  // ── TTS helpers ──────────────────────────────────────────────────────────────
  const fetchAudioUrl = useCallback(async (text: string): Promise<string | null> => {
    const tok = tokenRef.current;
    if (!text.trim() || !tok || ttsAbortRef.current) return null;
    try {
      const r = await fetch(`${API_URL}/api/v1/conversations/tts`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${tok}` },
        body: JSON.stringify({ text }),
      });
      if (!r.ok || ttsAbortRef.current) return null;
      return URL.createObjectURL(await r.blob());
    } catch { return null; }
  }, []);

  const stopTTS = useCallback(() => {
    ttsAbortRef.current = true;
    ttsQRef.current     = [];
    ttsRunRef.current   = false;
    ttsPendingRef.current = "";
    stopLipSync();
    if (audioRef.current)   { audioRef.current.pause(); audioRef.current = null; }
    if (audioUrlRef.current){ URL.revokeObjectURL(audioUrlRef.current); audioUrlRef.current = null; }
    setSpeaking(false);
    setAvatarState(streamingRef.current ? "thinking" : "idle");
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const drainTTS = useCallback(async () => {
    if (ttsRunRef.current) return;
    ttsRunRef.current = true;
    let prefetch: Promise<string | null> | null = null;

    while (ttsQRef.current.length > 0 && !ttsAbortRef.current) {
      const text = ttsQRef.current.shift()!;
      const url  = await (prefetch || fetchAudioUrl(text));
      prefetch   = null;
      if (!url || ttsAbortRef.current) continue;

      if (ttsQRef.current.length > 0 && !ttsAbortRef.current)
        prefetch = fetchAudioUrl(ttsQRef.current[0]);

      setSpeaking(true);
      setAvatarState("speaking");
      audioRef.current    = new Audio(url);
      audioUrlRef.current = url;

      await new Promise<void>(resolve => {
        audioRef.current!.oncanplay = () => startLipSync(audioRef.current!);
        audioRef.current!.onended = () => {
          stopLipSync();
          URL.revokeObjectURL(url);
          audioRef.current = null; audioUrlRef.current = null;
          resolve();
        };
        audioRef.current!.onerror = () => { stopLipSync(); resolve(); };
        audioRef.current!.play().catch(resolve);
      });
    }

    if (prefetch) prefetch.then(u => u && URL.revokeObjectURL(u)).catch(() => {});
    ttsRunRef.current = false;
    if (ttsQRef.current.length === 0) {
      setSpeaking(false);
      setAvatarState(streamingRef.current ? "thinking" : "idle");
    }
  }, [fetchAudioUrl, startLipSync]);

  const enqueueTTS = useCallback((text: string) => {
    if (!ttsEnabledRef.current || !text.trim()) return;
    ttsAbortRef.current = false;
    ttsQRef.current.push(text.trim());
    drainTTS();
  }, [drainTTS]);

  // ── Chat ─────────────────────────────────────────────────────────────────────
  const sendMessage = useCallback(async (text: string) => {
    if (!text.trim() || !token || streaming) return;
    stopTTS();
    ttsAbortRef.current = false;
    ttsPendingRef.current = "";

    setMessages(prev => [
      ...prev,
      { role: "user", content: text },
      { role: "assistant", content: "", streaming: true },
    ]);
    setInput("");
    setStreaming(true);
    setAvatarState("thinking");

    abortRef.current?.abort();
    abortRef.current = new AbortController();
    let fullAnswer = "";
    const history = messages.map(m => ({ role: m.role, content: m.content }));

    try {
      const res = await fetch(`${API_URL}/api/v1/conversations/assistant/stream`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ message: text, session_id: sessionId.current, history }),
        signal: abortRef.current.signal,
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
              let m: RegExpMatchArray | null;
              while ((m = /^([\s\S]{8,}?[.!?])\s+/.exec(ttsPendingRef.current)) !== null) {
                enqueueTTS(m[1]);
                ttsPendingRef.current = ttsPendingRef.current.slice(m[0].length);
              }
              if (ttsPendingRef.current.length > 80) {
                const cut = ttsPendingRef.current.lastIndexOf(" ", 70);
                if (cut > 20) {
                  enqueueTTS(ttsPendingRef.current.slice(0, cut));
                  ttsPendingRef.current = ttsPendingRef.current.slice(cut + 1);
                }
              }
            } else if (evt.type === "done") {
              fullAnswer = evt.answer || fullAnswer;
            }
          } catch { /* ignore parse errors */ }
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
      // If TTS queue is empty (voice off), return to idle
      if (ttsQRef.current.length === 0 && !ttsRunRef.current) {
        setAvatarState("idle");
      }
    }
  }, [token, streaming, messages, stopTTS, enqueueTTS]);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    sendMessage(input);
  }

  function startVoice() {
    if (listening) { recognitionRef.current?.stop(); return; }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const w = window as any;
    const SR = w.SpeechRecognition ?? w.webkitSpeechRecognition;
    if (!SR) { alert("Speech recognition requires Chrome or Edge."); return; }
    const recognition = new SR();
    recognition.continuous     = false;
    recognition.interimResults = false;
    recognition.lang           = "en-US";
    recognition.onstart  = () => { setListening(true);  setAvatarState("listening"); };
    recognition.onend    = () => { setListening(false); setAvatarState(streamingRef.current ? "thinking" : "idle"); };
    recognition.onerror  = () => { setListening(false); setAvatarState("idle"); };
    recognition.onresult = (e: { results: { [key: number]: { [key: number]: { transcript: string } } } }) => {
      const transcript = e.results[0]?.[0]?.transcript;
      if (transcript) sendMessage(transcript);
    };
    recognitionRef.current = recognition;
    recognition.start();
  }

  function clearChat() {
    abortRef.current?.abort();
    stopTTS();
    setMessages([]);
    sessionId.current = `dash_${Date.now()}_${Math.random().toString(36).slice(2)}`;
    setStreaming(false);
    setAvatarState("idle");
  }

  const ringStyle = RING_STYLES[avatarState];
  const dotColor  = DOT_COLORS[avatarState];
  const statusLabel = speaking ? "Speaking…" : listening ? "Listening…" : streaming ? "Thinking…" : STATUS_LABELS[avatarState];

  return (
    <div className="fixed bottom-6 right-6 z-50 flex flex-col items-end gap-3 pointer-events-none">

      {/* ── Chat panel ── */}
      {open && (
        <div
          className="pointer-events-auto w-[380px] rounded-3xl shadow-2xl border border-white/60 flex flex-col overflow-hidden"
          style={{ height: 600, background: "rgba(255,255,255,0.97)", backdropFilter: "blur(24px)", WebkitBackdropFilter: "blur(24px)" }}
        >
          {/* ── Avatar header ── */}
          <div
            className="flex flex-col items-center px-4 pt-5 pb-4 flex-shrink-0 relative"
            style={{ background: "linear-gradient(160deg,rgba(124,58,237,.08) 0%,rgba(168,85,247,.05) 100%)", borderBottom: "1px solid rgba(148,163,184,.12)" }}
          >
            {/* Top-right controls */}
            <div className="absolute top-3 right-3 flex items-center gap-1">
              {speaking && (
                <button onClick={stopTTS} title="Stop speaking" className="p-1.5 rounded-lg text-violet-500 hover:bg-violet-50 transition">
                  <VolumeX size={14} />
                </button>
              )}
              <button
                onClick={() => { setTtsEnabled(v => !v); if (speaking) stopTTS(); }}
                title={ttsEnabled ? "Mute voice" : "Unmute voice"}
                className={`p-1.5 rounded-lg transition ${ttsEnabled ? "text-slate-400 hover:text-violet-500 hover:bg-violet-50" : "text-violet-400 hover:bg-violet-50"}`}
              >
                {ttsEnabled ? <Volume2 size={14} /> : <VolumeX size={14} />}
              </button>
              {messages.length > 0 && (
                <button onClick={clearChat} title="Clear chat" className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition">
                  <RotateCcw size={13} />
                </button>
              )}
              <button onClick={() => setOpen(false)} className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition">
                <X size={15} />
              </button>
            </div>

            {/* Avatar ring */}
            <div style={{ position: "relative", display: "inline-block" }}>
              <div
                style={{
                  width: 90, height: 90, borderRadius: "50%", padding: 3,
                  ...ringStyle,
                  transition: "background 0.4s",
                  flexShrink: 0,
                }}
              >
                <div style={{ width: "100%", height: "100%", borderRadius: "50%", overflow: "hidden", background: "#fff" }}>
                  <FaceSVG jawRef={jawRef} teethRef={teethRef} />
                </div>
              </div>
              {/* State dot */}
              <div style={{
                position: "absolute", bottom: 2, right: 2,
                width: 13, height: 13, borderRadius: "50%",
                border: "2.5px solid #fff",
                background: dotColor,
                transition: "background 0.3s",
                animation: avatarState !== "idle" ? "dash-dot-pulse 0.8s ease-in-out infinite" : "none",
              }} />
            </div>

            <p className="text-sm font-bold text-slate-800 mt-2 tracking-tight">Dashboard Assistant</p>
            <p className={`text-[11px] mt-0.5 font-medium transition-colors ${
              avatarState === "speaking"  ? "text-violet-500" :
              avatarState === "listening" ? "text-emerald-500" :
              avatarState === "thinking"  ? "text-blue-500"   : "text-slate-400"
            }`}>
              {statusLabel}
            </p>
          </div>

          {/* Messages */}
          <div className="flex-1 overflow-y-auto p-4 space-y-3">
            {messages.length === 0 && (
              <div className="h-full flex items-center justify-center">
                <div className="text-center px-4">
                  <p className="text-sm font-semibold text-slate-700 mb-1">Your AI Agent Assistant</p>
                  <p className="text-xs text-slate-400 leading-relaxed mb-4">Ask about training status, conversation quality, API setup, or how to improve your agent.</p>
                  <div className="flex flex-col gap-2">
                    {["How do I train my AI on a new site?", "Why isn't my widget responding?", "How do I embed the widget?"].map(q => (
                      <button key={q} onClick={() => sendMessage(q)}
                        className="text-xs text-left px-3 py-2 rounded-xl bg-slate-50 hover:bg-violet-50 hover:text-violet-700 text-slate-500 border border-slate-100 hover:border-violet-200 transition">{q}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )}
            {messages.map((m, i) => (
              <div key={i} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
                <div
                  className={`max-w-[86%] px-3.5 py-2.5 rounded-2xl text-sm leading-relaxed ${m.role === "user" ? "text-white rounded-br-sm" : "bg-slate-100 text-slate-700 rounded-bl-sm"}`}
                  style={m.role === "user" ? { background: "linear-gradient(135deg,#7c3aed,#a855f7)" } : {}}
                >
                  {m.content || (m.streaming && (
                    <span className="flex gap-1 items-center h-4 py-0.5">
                      {[0, 150, 300].map(d => <span key={d} className="w-1.5 h-1.5 rounded-full bg-slate-400 animate-bounce" style={{ animationDelay: `${d}ms` }} />)}
                    </span>
                  ))}
                  {m.streaming && m.content && <span className="inline-block w-0.5 h-3.5 bg-slate-400 ml-0.5 animate-pulse align-middle" />}
                </div>
              </div>
            ))}
            <div ref={messagesEndRef} />
          </div>

          {/* Input */}
          <div className="p-3 border-t border-slate-100 flex-shrink-0">
            <form onSubmit={handleSubmit} className="flex items-center gap-2 bg-slate-50 rounded-2xl px-3 py-1.5 border border-slate-200 focus-within:border-violet-300 focus-within:ring-2 focus-within:ring-violet-100 transition">
              <input
                ref={inputRef}
                type="text"
                value={input}
                onChange={e => setInput(e.target.value)}
                disabled={streaming}
                placeholder={streaming ? "Thinking…" : listening ? "Listening…" : "Type or speak…"}
                className="flex-1 bg-transparent text-sm text-slate-700 placeholder:text-slate-400 focus:outline-none py-1 min-w-0"
              />
              <button type="button" onClick={startVoice}
                className={`p-1.5 rounded-xl flex-shrink-0 transition ${listening ? "bg-red-100 text-red-500 hover:bg-red-200" : "text-slate-400 hover:text-violet-600 hover:bg-violet-50"}`}
                title={listening ? "Stop" : "Voice input"}>
                {listening ? <MicOff size={15} /> : <Mic size={15} />}
              </button>
              <button type="submit" disabled={!input.trim() || streaming}
                className="p-1.5 rounded-xl flex-shrink-0 text-white disabled:opacity-40 hover:opacity-90 transition shadow-sm"
                style={{ background: "linear-gradient(135deg,#7c3aed,#a855f7)" }}>
                {streaming ? <Loader2 size={15} className="animate-spin" /> : <Send size={15} />}
              </button>
            </form>
            <p className="text-[10px] text-slate-400 text-center mt-1.5">
              Powered by WebTalk AI{messages.length > 0 && ` · ${Math.ceil(messages.length / 2)} turn${messages.length > 2 ? "s" : ""}`}
            </p>
          </div>
        </div>
      )}

      {/* ── Launch button ── */}
      <button
        onClick={() => setOpen(v => !v)}
        className="pointer-events-auto w-14 h-14 rounded-2xl shadow-xl flex items-center justify-center transition-all duration-200 hover:scale-105 active:scale-95"
        style={{
          background: open ? "#334155" : "linear-gradient(135deg,#7c3aed,#a855f7)",
          boxShadow: open ? "0 10px 25px rgba(0,0,0,.2)" : "0 10px 30px rgba(124,58,237,.4)",
        }}
        title="Dashboard AI Assistant"
      >
        {open ? <X size={20} className="text-white" /> : (
          <div className="relative">
            <MessageSquare size={20} className="text-white" />
            {(speaking || listening || streaming) && (
              <span className="absolute -top-1.5 -right-1.5 w-3 h-3 rounded-full bg-emerald-400 border-2 border-white" />
            )}
          </div>
        )}
      </button>

      <style>{`
        @keyframes dash-ring-spin { to { transform: rotate(360deg); } }
        @keyframes dash-dot-pulse  { 0%,100%{transform:scale(1)} 50%{transform:scale(1.45)} }
        @keyframes dash-blink      { 0%,88%,100%{transform:scaleY(0)} 92%,96%{transform:scaleY(1)} }
        @keyframes dash-sway       { 0%,100%{transform:rotate(0deg)} 30%{transform:rotate(.7deg)} 70%{transform:rotate(-.7deg)} }
      `}</style>
    </div>
  );
}
