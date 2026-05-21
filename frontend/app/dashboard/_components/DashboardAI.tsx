"use client";
import { useState, useEffect, useRef, useCallback } from "react";
import { createClient } from "@/lib/supabase";
import { MessageSquare, Mic, MicOff, X, Send, Bot, Loader2, Volume2, VolumeX, RotateCcw } from "lucide-react";

interface Message {
  role: "user" | "assistant";
  content: string;
  streaming?: boolean;
}

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

export default function DashboardAI() {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [listening, setListening] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const [token, setToken] = useState("");
  const [ttsEnabled, setTtsEnabled] = useState(true);

  const sessionId = useRef(`dash_${Date.now()}_${Math.random().toString(36).slice(2)}`);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const recognitionRef = useRef<any>(null);
  const abortRef = useRef<AbortController | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) setToken(data.session.access_token);
    });
    // Refresh token before it expires
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
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

  const speak = useCallback((text: string) => {
    if (!ttsEnabled || typeof window === "undefined" || !window.speechSynthesis) return;
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text.slice(0, 500));
    utterance.rate = 1.05;
    utterance.onstart = () => setSpeaking(true);
    utterance.onend = () => setSpeaking(false);
    utterance.onerror = () => setSpeaking(false);
    window.speechSynthesis.speak(utterance);
  }, [ttsEnabled]);

  const sendMessage = useCallback(async (text: string) => {
    if (!text.trim() || !token || streaming) return;

    setMessages(prev => [
      ...prev,
      { role: "user", content: text },
      { role: "assistant", content: "", streaming: true },
    ]);
    setInput("");
    setStreaming(true);

    abortRef.current?.abort();
    abortRef.current = new AbortController();
    let fullAnswer = "";

    // Build history from current messages (exclude the placeholder we just added)
    const history = messages.map(m => ({ role: m.role, content: m.content }));

    try {
      const res = await fetch(`${API_URL}/api/v1/conversations/assistant/stream`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ message: text, session_id: sessionId.current, history }),
        signal: abortRef.current.signal,
      });

      if (!res.ok || !res.body) {
        throw new Error(`HTTP ${res.status}`);
      }

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
            const evt = JSON.parse(raw);
            if (evt.type === "token") {
              fullAnswer += evt.text;
              setMessages(prev => {
                const next = [...prev];
                next[next.length - 1] = { role: "assistant", content: fullAnswer, streaming: true };
                return next;
              });
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
      speak(final);
    }
  }, [token, streaming, speak]);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    sendMessage(input);
  }

  function startVoice() {
    if (listening) {
      recognitionRef.current?.stop();
      return;
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const w = window as any;
    const SR = w.SpeechRecognition ?? w.webkitSpeechRecognition;
    if (!SR) {
      alert("Speech recognition is not supported in this browser. Try Chrome or Edge.");
      return;
    }
    const recognition = new SR();
    recognition.continuous = false;
    recognition.interimResults = false;
    recognition.lang = "en-US";
    recognition.onstart = () => setListening(true);
    recognition.onend = () => setListening(false);
    recognition.onerror = () => setListening(false);
    recognition.onresult = (e: any) => {
      const transcript = e.results[0]?.[0]?.transcript;
      if (transcript) sendMessage(transcript);
    };
    recognitionRef.current = recognition;
    recognition.start();
  }

  function stopSpeaking() {
    window.speechSynthesis?.cancel();
    setSpeaking(false);
  }

  function clearChat() {
    abortRef.current?.abort();
    setMessages([]);
    sessionId.current = `dash_${Date.now()}_${Math.random().toString(36).slice(2)}`;
    setStreaming(false);
  }

  const isActive = streaming || listening || speaking;

  return (
    <div className="fixed bottom-6 right-6 z-50 flex flex-col items-end gap-3 pointer-events-none">
      {/* ── Chat panel ── */}
      {open && (
        <div
          className="pointer-events-auto w-[380px] rounded-3xl shadow-2xl border border-white/60 flex flex-col overflow-hidden"
          style={{
            height: 580,
            background: "rgba(255,255,255,0.97)",
            backdropFilter: "blur(24px)",
            WebkitBackdropFilter: "blur(24px)",
          }}
        >
          {/* Header */}
          <div
            className="px-4 py-3.5 flex items-center gap-3 border-b border-slate-100/80 flex-shrink-0"
            style={{ background: "linear-gradient(135deg,rgba(109,40,217,.07),rgba(139,92,246,.07))" }}
          >
            {/* Orb */}
            <div
              className={`w-9 h-9 rounded-xl flex-shrink-0 flex items-center justify-center transition-all duration-300 ${
                isActive
                  ? "shadow-lg shadow-violet-300"
                  : ""
              }`}
              style={{
                background: isActive
                  ? "linear-gradient(135deg,#7c3aed,#a855f7)"
                  : "linear-gradient(135deg,#8b5cf6,#7c3aed)",
                animation: isActive ? "pulse 1.5s ease-in-out infinite" : "none",
              }}
            >
              <Bot size={16} className="text-white" />
            </div>

            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-slate-800 leading-none mb-0.5">
                Dashboard Assistant
              </p>
              <p className="text-[11px] text-slate-400 leading-none">
                {listening ? "🎙 Listening…"
                  : speaking  ? "🔊 Speaking…"
                  : streaming ? "Thinking…"
                  : "Ask about your AI agent"}
              </p>
            </div>

            <div className="flex items-center gap-1">
              {speaking && (
                <button
                  onClick={stopSpeaking}
                  title="Stop speaking"
                  className="p-1.5 rounded-lg text-violet-500 hover:bg-violet-50 transition"
                >
                  <VolumeX size={14} />
                </button>
              )}
              <button
                onClick={() => setTtsEnabled(v => !v)}
                title={ttsEnabled ? "Mute voice" : "Unmute voice"}
                className={`p-1.5 rounded-lg transition ${ttsEnabled ? "text-slate-400 hover:text-violet-500 hover:bg-violet-50" : "text-slate-300 hover:text-slate-500 hover:bg-slate-50"}`}
              >
                {ttsEnabled ? <Volume2 size={14} /> : <VolumeX size={14} />}
              </button>
              {messages.length > 0 && (
                <button
                  onClick={clearChat}
                  title="Clear chat"
                  className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition"
                >
                  <RotateCcw size={13} />
                </button>
              )}
              <button
                onClick={() => setOpen(false)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition"
              >
                <X size={15} />
              </button>
            </div>
          </div>

          {/* Messages */}
          <div className="flex-1 overflow-y-auto p-4 space-y-3">
            {messages.length === 0 && (
              <div className="h-full flex items-center justify-center">
                <div className="text-center px-6">
                  <div
                    className="w-16 h-16 rounded-2xl mx-auto mb-4 flex items-center justify-center"
                    style={{ background: "linear-gradient(135deg,#ede9fe,#ddd6fe)" }}
                  >
                    <Bot size={28} className="text-violet-500" />
                  </div>
                  <p className="text-sm font-semibold text-slate-700 mb-1">
                    Your AI Agent Assistant
                  </p>
                  <p className="text-xs text-slate-400 leading-relaxed">
                    Ask about training status, conversation quality, API setup, or how to improve your agent.
                  </p>
                  <div className="mt-4 flex flex-col gap-2">
                    {[
                      "How do I train my AI on a new site?",
                      "Why isn't my widget responding?",
                      "How do I embed the widget?",
                    ].map((q) => (
                      <button
                        key={q}
                        onClick={() => sendMessage(q)}
                        className="text-xs text-left px-3 py-2 rounded-xl bg-slate-50 hover:bg-violet-50 hover:text-violet-700 text-slate-500 border border-slate-100 hover:border-violet-200 transition"
                      >
                        {q}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {messages.map((m, i) => (
              <div key={i} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
                <div
                  className={`max-w-[86%] px-3.5 py-2.5 rounded-2xl text-sm leading-relaxed ${
                    m.role === "user"
                      ? "text-white rounded-br-sm"
                      : "bg-slate-100 text-slate-700 rounded-bl-sm"
                  }`}
                  style={
                    m.role === "user"
                      ? { background: "linear-gradient(135deg,#7c3aed,#a855f7)" }
                      : {}
                  }
                >
                  {m.content || (m.streaming && (
                    <span className="flex gap-1 items-center h-4 py-0.5">
                      {[0, 150, 300].map(d => (
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
          <div className="p-3 border-t border-slate-100 flex-shrink-0">
            <form
              onSubmit={handleSubmit}
              className="flex items-center gap-2 bg-slate-50 rounded-2xl px-3 py-1.5 border border-slate-200 focus-within:border-violet-300 focus-within:ring-2 focus-within:ring-violet-100 transition"
            >
              <input
                ref={inputRef}
                type="text"
                value={input}
                onChange={e => setInput(e.target.value)}
                disabled={streaming}
                placeholder={streaming ? "Thinking…" : listening ? "Listening…" : "Type or speak…"}
                className="flex-1 bg-transparent text-sm text-slate-700 placeholder:text-slate-400 focus:outline-none py-1 min-w-0"
              />
              <button
                type="button"
                onClick={startVoice}
                className={`p-1.5 rounded-xl flex-shrink-0 transition ${
                  listening
                    ? "bg-red-100 text-red-500 hover:bg-red-200"
                    : "text-slate-400 hover:text-violet-600 hover:bg-violet-50"
                }`}
                title={listening ? "Stop" : "Voice input"}
              >
                {listening ? <MicOff size={15} /> : <Mic size={15} />}
              </button>
              <button
                type="submit"
                disabled={!input.trim() || streaming}
                className="p-1.5 rounded-xl flex-shrink-0 text-white disabled:opacity-40 hover:opacity-90 transition shadow-sm"
                style={{ background: "linear-gradient(135deg,#7c3aed,#a855f7)" }}
              >
                {streaming
                  ? <Loader2 size={15} className="animate-spin" />
                  : <Send size={15} />}
              </button>
            </form>
            <p className="text-[10px] text-slate-400 text-center mt-1.5">
              Powered by WebTalk AI
              {messages.length > 0 && ` · ${Math.ceil(messages.length / 2)} turn${messages.length > 2 ? "s" : ""}`}
            </p>
          </div>
        </div>
      )}

      {/* ── Launch button ── */}
      <button
        onClick={() => setOpen(v => !v)}
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
            {isActive && (
              <span className="absolute -top-1.5 -right-1.5 w-3 h-3 rounded-full bg-emerald-400 border-2 border-white" />
            )}
          </div>
        )}
      </button>

      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 1; transform: scale(1); }
          50%       { opacity: .85; transform: scale(1.05); }
        }
      `}</style>
    </div>
  );
}
