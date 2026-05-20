"use client";
import { useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase";
import { api } from "@/lib/api";
import { MessageSquare, X, Send, Sparkles, Bot } from "lucide-react";

interface Msg { role: "user" | "assistant"; content: string; }
interface ChatResponse { answer: string; sources: string[]; session_id: string; }

const newSession = () => `pg_${Math.random().toString(36).slice(2, 11)}_${Date.now()}`;

export default function FloatingChat() {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<Msg[]>([
    { role: "assistant", content: "Hi! Ask me anything about your trained website content." },
  ]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [token, setToken] = useState("");
  const [sessionId] = useState(() => newSession());
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) setToken(data.session.access_token);
    });
  }, []);

  useEffect(() => {
    if (open) bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading, open]);

  async function send() {
    const text = input.trim();
    if (!text || loading || !token) return;
    setInput("");
    setMessages((prev) => [...prev, { role: "user", content: text }]);
    setLoading(true);

    try {
      const res = await api.post<ChatResponse>(
        "/conversations/playground",
        { message: text, session_id: sessionId, client_id: "ignored" },
        token,
      );
      setMessages((prev) => [...prev, { role: "assistant", content: res.answer }]);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Something went wrong";
      setMessages((prev) => [...prev, { role: "assistant", content: `⚠️ ${msg}` }]);
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      {/* Floating launcher */}
      <button
        onClick={() => setOpen((o) => !o)}
        aria-label={open ? "Close chat" : "Open chat"}
        className="fixed bottom-6 right-6 z-40 w-14 h-14 rounded-full bg-gradient-brand shadow-lift hover:scale-110 active:scale-95 transition-all flex items-center justify-center text-white"
      >
        {open ? <X size={22} /> : <MessageSquare size={22} />}
      </button>

      {/* Panel */}
      {open && (
        <div className="fixed bottom-24 right-6 z-40 w-[380px] max-w-[calc(100vw-2rem)] h-[560px] max-h-[calc(100vh-8rem)] bg-white rounded-2xl shadow-lift border border-slate-200/70 flex flex-col overflow-hidden fade-in">
          {/* Header */}
          <div className="bg-gradient-brand text-white px-5 py-4 flex items-center gap-3">
            <div className="w-9 h-9 rounded-full bg-white/20 backdrop-blur flex items-center justify-center">
              <Sparkles size={16} />
            </div>
            <div className="flex-1">
              <p className="font-semibold text-sm">AI Assistant</p>
              <p className="text-xs text-white/80 flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-300 pulse-slow" />
                Trained on your content
              </p>
            </div>
            <button onClick={() => setOpen(false)} className="text-white/80 hover:text-white">
              <X size={18} />
            </button>
          </div>

          {/* Messages */}
          <div className="flex-1 overflow-y-auto p-4 space-y-3 bg-slate-50/30">
            {messages.map((m, i) => (
              <div key={i} className={`flex gap-2 ${m.role === "user" ? "justify-end" : "justify-start"}`}>
                {m.role === "assistant" && (
                  <div className="w-7 h-7 rounded-full bg-gradient-brand flex items-center justify-center flex-shrink-0">
                    <Bot size={13} className="text-white" />
                  </div>
                )}
                <div className={`max-w-[78%] px-3.5 py-2.5 rounded-2xl text-sm leading-relaxed ${
                  m.role === "user"
                    ? "bg-gradient-brand text-white rounded-br-sm"
                    : "bg-white border border-slate-200 text-slate-800 rounded-bl-sm"
                }`}>
                  {m.content}
                </div>
              </div>
            ))}
            {loading && (
              <div className="flex gap-2">
                <div className="w-7 h-7 rounded-full bg-gradient-brand flex items-center justify-center flex-shrink-0">
                  <Bot size={13} className="text-white" />
                </div>
                <div className="bg-white border border-slate-200 rounded-2xl rounded-bl-sm px-3.5 py-2.5 flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-slate-400 animate-bounce" style={{ animationDelay: "0ms" }} />
                  <span className="w-1.5 h-1.5 rounded-full bg-slate-400 animate-bounce" style={{ animationDelay: "150ms" }} />
                  <span className="w-1.5 h-1.5 rounded-full bg-slate-400 animate-bounce" style={{ animationDelay: "300ms" }} />
                </div>
              </div>
            )}
            <div ref={bottomRef} />
          </div>

          {/* Input */}
          <div className="border-t border-slate-100 p-3 bg-white">
            <form
              onSubmit={(e) => { e.preventDefault(); send(); }}
              className="flex gap-2"
            >
              <input
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder={loading ? "Thinking…" : "Type a message…"}
                disabled={loading}
                className="flex-1 bg-slate-50 border border-slate-200 rounded-full px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent transition disabled:opacity-60"
              />
              <button
                type="submit"
                disabled={loading || !input.trim()}
                className="bg-gradient-brand hover:opacity-90 disabled:opacity-40 text-white rounded-full w-10 h-10 flex items-center justify-center transition"
                aria-label="Send"
              >
                <Send size={15} />
              </button>
            </form>
            <p className="text-[10px] text-slate-400 text-center mt-1.5">Powered by WebTalk AI</p>
          </div>
        </div>
      )}
    </>
  );
}
