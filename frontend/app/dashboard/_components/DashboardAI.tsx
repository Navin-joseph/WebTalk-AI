"use client";
import { useState, useEffect, useRef, useCallback } from "react";
import { createClient } from "@/lib/supabase";
import { Mic, MicOff, X, Send, Loader2, Volume2, VolumeX, RotateCcw, MessageSquare } from "lucide-react";
// Avatar photo — place your photo at frontend/public/avatar.jpg

interface Message {
  role: "user" | "assistant";
  content: string;
  streaming?: boolean;
}

type AvatarState = "idle" | "thinking" | "listening" | "speaking";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

const AVATAR_URL = "/avatar.jpg";
const NUM_WAVE_BARS = 12;

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

  // Waveform bar refs (for lip sync visualiser)
  const waveBarRefs     = useRef<(HTMLSpanElement | null)[]>(Array(NUM_WAVE_BARS).fill(null));
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

  // ── Lip-sync helpers — drive waveform bars from audio analyser ──────────────
  const startLipSync = useCallback((audioEl: HTMLAudioElement) => {
    stopLipSync();
    try {
      if (!lipCtxRef.current) lipCtxRef.current = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
      const analyser = lipCtxRef.current.createAnalyser();
      analyser.fftSize = 256;
      analyser.smoothingTimeConstant = 0.55;
      const src = lipCtxRef.current.createMediaElementSource(audioEl);
      src.connect(analyser);
      analyser.connect(lipCtxRef.current.destination);
      lipSrcRef.current = src;
      const data = new Uint8Array(analyser.frequencyBinCount);
      const tick = () => {
        lipAnimRef.current = requestAnimationFrame(tick);
        analyser.getByteFrequencyData(data);
        waveBarRefs.current.forEach((bar, i) => {
          if (!bar) return;
          const bin = Math.floor(2 + i * 4);
          const h = Math.max(3, Math.round((data[bin] / 255) * 24));
          bar.style.height = h + "px";
        });
      };
      tick();
    } catch { /* AudioContext blocked — degrade gracefully */ }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function stopLipSync() {
    if (lipAnimRef.current) { cancelAnimationFrame(lipAnimRef.current); lipAnimRef.current = null; }
    try { if (lipSrcRef.current) { lipSrcRef.current.disconnect(); lipSrcRef.current = null; } } catch {}
    waveBarRefs.current.forEach(bar => { if (bar) bar.style.height = "3px"; });
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

  const statusLabel = speaking ? "Speaking…" : listening ? "Listening…" : streaming ? "Thinking…" : "Ask about your AI agent";

  return (
    <div className="fixed bottom-6 right-6 z-50 flex flex-col items-end gap-3 pointer-events-none">

      {/* ── Chat panel ── */}
      {open && (
        <div
          className="pointer-events-auto w-[380px] rounded-3xl shadow-2xl border border-white/60 flex flex-col overflow-hidden"
          style={{ height: 600, background: "rgba(255,255,255,0.97)", backdropFilter: "blur(24px)", WebkitBackdropFilter: "blur(24px)" }}
        >
          {/* ── Grace-style photo header ── */}
          <div className="relative flex-shrink-0 overflow-hidden" style={{ height: 230, background: "#111827" }}>
            {/* Photo */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={AVATAR_URL} alt="AI Assistant" draggable={false}
              className="w-full h-full object-cover"
              style={{
                objectPosition: "center 8%",
                animation: avatarState === "speaking"
                  ? "dash-speak-bob 0.38s ease-in-out infinite alternate"
                  : "dash-breathe 5s ease-in-out infinite",
              }}
            />
            {/* State glow border */}
            <div className="absolute inset-0 pointer-events-none transition-all duration-300" style={{
              border: "3px solid transparent",
              ...(avatarState === "thinking"  ? { borderColor: "rgba(59,130,246,.55)",  boxShadow: "inset 0 0 30px rgba(59,130,246,.25)" } : {}),
              ...(avatarState === "listening" ? { borderColor: "rgba(16,185,129,.6)",   boxShadow: "inset 0 0 30px rgba(16,185,129,.25)" } : {}),
              ...(avatarState === "speaking"  ? { borderColor: "rgba(124,58,237,.75)",  boxShadow: "inset 0 0 30px rgba(124,58,237,.3), 0 0 0 2px rgba(124,58,237,.4)" } : {}),
            }} />
            {/* Top gradient bar — name + controls */}
            <div className="absolute top-0 left-0 right-0 flex items-start justify-between px-3 pt-2.5 pb-8"
              style={{ background: "linear-gradient(to bottom,rgba(0,0,0,.65),transparent)" }}>
              <div>
                <p className="text-sm font-bold text-white leading-tight" style={{ textShadow: "0 1px 4px rgba(0,0,0,.5)" }}>Dashboard Assistant</p>
                <p className="text-[10.5px] text-white/75">AI Assistant</p>
              </div>
              <div className="flex items-center gap-1">
                {speaking && (
                  <button onClick={stopTTS} title="Stop speaking"
                    className="w-7 h-7 rounded-lg flex items-center justify-center text-white/85 hover:bg-black/40 transition"
                    style={{ background: "rgba(0,0,0,.3)", backdropFilter: "blur(4px)" }}>
                    <VolumeX size={13} />
                  </button>
                )}
                <button onClick={() => { setTtsEnabled(v => !v); if (speaking) stopTTS(); }} title={ttsEnabled ? "Mute" : "Unmute"}
                  className="w-7 h-7 rounded-lg flex items-center justify-center text-white/85 hover:bg-black/40 transition"
                  style={{ background: "rgba(0,0,0,.3)", backdropFilter: "blur(4px)" }}>
                  {ttsEnabled ? <Volume2 size={13} /> : <VolumeX size={13} />}
                </button>
                {messages.length > 0 && (
                  <button onClick={clearChat} title="Clear"
                    className="w-7 h-7 rounded-lg flex items-center justify-center text-white/85 hover:bg-black/40 transition"
                    style={{ background: "rgba(0,0,0,.3)", backdropFilter: "blur(4px)" }}>
                    <RotateCcw size={12} />
                  </button>
                )}
                <button onClick={() => setOpen(false)}
                  className="w-7 h-7 rounded-lg flex items-center justify-center text-white/85 hover:bg-black/40 transition"
                  style={{ background: "rgba(0,0,0,.3)", backdropFilter: "blur(4px)" }}>
                  <X size={13} />
                </button>
              </div>
            </div>
            {/* Bottom bar — status pill + waveform + mic */}
            <div className="absolute bottom-0 left-0 right-0 flex items-end gap-2 px-3 pb-2.5 pt-8"
              style={{ background: "linear-gradient(to top,rgba(0,0,0,.65),transparent)" }}>
              <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full flex-shrink-0"
                style={{ background: "rgba(0,0,0,.4)", backdropFilter: "blur(4px)" }}>
                <span className="w-2 h-2 rounded-full flex-shrink-0 transition-all duration-300" style={{
                  background: avatarState === "thinking" ? "#60a5fa" : avatarState === "listening" ? "#34d399" : avatarState === "speaking" ? "#e879f9" : "#64748b",
                  animation: avatarState !== "idle" ? "dash-dot-pulse 0.7s ease-in-out infinite" : "none",
                }} />
                <span className="text-[10.5px] font-semibold text-white/90 whitespace-nowrap">{statusLabel}</span>
              </div>
              {/* Waveform bars */}
              <div className="flex items-end gap-[2.5px] h-6 flex-1 transition-opacity duration-300"
                style={{ opacity: avatarState === "speaking" || avatarState === "listening" ? 1 : 0 }}>
                {Array.from({ length: NUM_WAVE_BARS }, (_, i) => (
                  <span key={i} ref={el => { waveBarRefs.current[i] = el; }}
                    className="flex-shrink-0 rounded-sm"
                    style={{ width: 3, height: 3, background: "rgba(255,255,255,.85)", transition: "height 0.04s linear" }} />
                ))}
              </div>
              <button onClick={startVoice} title={listening ? "Stop" : "Voice input"}
                className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 text-white transition"
                style={{
                  background: listening ? "rgba(239,68,68,.5)" : "rgba(255,255,255,.15)",
                  backdropFilter: "blur(4px)",
                  animation: listening ? "dash-dot-pulse 1.2s ease-in-out infinite" : "none",
                }}>
                {listening ? <MicOff size={14} /> : <Mic size={14} />}
              </button>
            </div>
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
        @keyframes dash-breathe   { 0%,100%{transform:scale(1) translateY(0)} 50%{transform:scale(1.008) translateY(-1.5px)} }
        @keyframes dash-speak-bob { from{transform:scale(1) translateY(0)} to{transform:scale(1.013) translateY(-3px)} }
        @keyframes dash-dot-pulse { 0%,100%{transform:scale(1)} 50%{transform:scale(1.5)} }
      `}</style>
    </div>
  );
}
