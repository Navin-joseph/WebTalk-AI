"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase";
import { api } from "@/lib/api";
import {
  MessageSquare, X, Send, Sparkles, Bot, RotateCcw, AlertCircle
} from "lucide-react";

interface Msg {
  role: "user" | "assistant";
  content: string;
  sources?: string[];
  streaming?: boolean;
  error?: boolean;
}

const STORAGE_KEY = "wtai_session_id_v1";
const SUGGESTIONS = [
  "What is this site about?",
  "What products are offered?",
  "How do I contact you?",
];

function getOrCreateSession(): string {
  if (typeof window === "undefined") return "";
  let s = localStorage.getItem(STORAGE_KEY);
  if (!s) {
    s = `pg_${Math.random().toString(36).slice(2, 11)}_${Date.now()}`;
    localStorage.setItem(STORAGE_KEY, s);
  }
  return s;
}

export default function FloatingChat() {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<Msg[]>([
    { role: "assistant", content: "Hi! Ask me anything about your trained website content." },
  ]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [token, setToken] = useState("");
  const [sessionId, setSessionId] = useState("");
  const [lastUserMessage, setLastUserMessage] = useState<string>("");
  const bottomRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    setSessionId(getOrCreateSession());
    const supabase = createClient();
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) setToken(data.session.access_token);
    });
  }, []);

  useEffect(() => {
    if (open) bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading, open]);

  const send = useCallback(async (rawText?: string) => {
    const text = (rawText ?? input).trim();
    if (!text || loading || !token) return;

    setInput("");
    setLastUserMessage(text);
    setMessages(prev => [...prev, { role: "user", content: text }]);
    setLoading(true);

    // Add empty assistant message that we'll fill via streaming
    setMessages(prev => [...prev, { role: "assistant", content: "", streaming: true }]);

    let buffer = "";
    let receivedAny = false;
    let sources: string[] = [];

    try {
      await api.stream(
        "/conversations/playground/stream",
        { message: text, session_id: sessionId, client_id: "ignored" },
        token,
        (event) => {
          receivedAny = true;
          if (event.type === "sources") {
            sources = (event.sources as string[]) ?? [];
          } else if (event.type === "token") {
            buffer += event.text as string;
            setMessages(prev => {
              const next = [...prev];
              const last = next[next.length - 1];
              if (last && last.role === "assistant") {
                next[next.length - 1] = { ...last, content: buffer, sources };
              }
              return next;
            });
          } else if (event.type === "done") {
            setMessages(prev => {
              const next = [...prev];
              const last = next[next.length - 1];
              if (last && last.role === "assistant") {
                next[next.length - 1] = {
                  role: "assistant",
                  content: (event.answer as string) || buffer,
                  sources,
                };
              }
              return next;
            });
          } else if (event.type === "error") {
            throw new Error((event.message as string) ?? "Stream error");
          }
        },
      );

      if (!receivedAny) {
        throw new Error("No response received");
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : "Something went wrong";
      setMessages(prev => {
        const next = [...prev];
        // Replace the placeholder with an error message
        if (next[next.length - 1]?.role === "assistant" && next[next.length - 1]?.streaming) {
          next[next.length - 1] = { role: "assistant", content: message, error: true };
        } else {
          next.push({ role: "assistant", content: message, error: true });
        }
        return next;
      });
    } finally {
      setLoading(false);
    }
  }, [input, loading, token, sessionId]);

  function retry() {
    if (!lastUserMessage) return;
    // Remove the last error message before retrying
    setMessages(prev => prev.filter((m, i) => !(i === prev.length - 1 && m.error)));
    send(lastUserMessage);
  }

  function reset() {
    const newSession = `pg_${Math.random().toString(36).slice(2, 11)}_${Date.now()}`;
    localStorage.setItem(STORAGE_KEY, newSession);
    setSessionId(newSession);
    setMessages([{ role: "assistant", content: "Hi! Ask me anything about your trained website content." }]);
  }

  return (
    <>
      {/* Launcher bubble */}
      <button
        onClick={() => setOpen(o => !o)}
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
            <button onClick={reset} title="New conversation"
              className="p-1.5 rounded-lg text-white/80 hover:text-white hover:bg-white/10 transition">
              <RotateCcw size={14} />
            </button>
            <button onClick={() => setOpen(false)} className="text-white/80 hover:text-white">
              <X size={18} />
            </button>
          </div>

          {/* Messages */}
          <div className="flex-1 overflow-y-auto p-4 space-y-3 bg-slate-50/30">
            {messages.map((m, i) => (
              <div key={i} className={`flex gap-2 ${m.role === "user" ? "justify-end" : "justify-start"}`}>
                {m.role === "assistant" && (
                  <div className={`w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 ${m.error ? "bg-amber-100" : "bg-gradient-brand"}`}>
                    {m.error
                      ? <AlertCircle size={13} className="text-amber-700" />
                      : <Bot size={13} className="text-white" />}
                  </div>
                )}
                <div className={m.role === "user" ? "max-w-[78%]" : "max-w-[82%]"}>
                  <div className={`px-3.5 py-2.5 rounded-2xl text-sm leading-relaxed whitespace-pre-wrap ${
                    m.role === "user"
                      ? "bg-gradient-brand text-white rounded-br-sm"
                      : m.error
                      ? "bg-amber-50 border border-amber-200 text-amber-900 rounded-bl-sm"
                      : "bg-white border border-slate-200 text-slate-800 rounded-bl-sm"
                  }`}>
                    {m.content || (m.streaming && <span className="text-slate-400">…</span>)}
                    {m.streaming && m.content && (
                      <span className="inline-block w-1.5 h-3.5 ml-0.5 align-middle bg-slate-400 animate-pulse" />
                    )}
                  </div>
                  {m.sources && m.sources.length > 0 && !m.streaming && (
                    <div className="mt-1.5 flex flex-wrap gap-1">
                      {m.sources.slice(0, 4).map(s => (
                        <a key={s} href={s} target="_blank" rel="noopener noreferrer"
                          className="text-[10px] text-slate-500 hover:text-brand-600 bg-white border border-slate-200 hover:border-brand-200 rounded px-1.5 py-0.5 transition">
                          {(() => { try { return new URL(s).hostname.replace(/^www\./, "") + new URL(s).pathname.slice(0, 24); } catch { return s.slice(0, 30); } })()}
                        </a>
                      ))}
                    </div>
                  )}
                  {m.error && (
                    <button onClick={retry}
                      className="mt-1.5 text-[11px] font-medium text-amber-700 hover:text-amber-900 underline">
                      Try again
                    </button>
                  )}
                </div>
              </div>
            ))}

            {loading && !messages[messages.length - 1]?.streaming && (
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

          {/* Suggestions */}
          {messages.length <= 1 && !loading && (
            <div className="px-4 pb-2 flex flex-wrap gap-1.5">
              {SUGGESTIONS.map(s => (
                <button key={s} onClick={() => send(s)}
                  className="text-[11px] px-2.5 py-1 rounded-full bg-white border border-slate-200 text-slate-600 hover:border-brand-300 hover:text-brand-700 hover:bg-brand-50 transition">
                  {s}
                </button>
              ))}
            </div>
          )}

          {/* Input */}
          <div className="border-t border-slate-100 p-3 bg-white">
            <form onSubmit={(e) => { e.preventDefault(); send(); }} className="flex gap-2">
              <input
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder={loading ? "Thinking…" : "Type a message…"}
                disabled={loading}
                className="flex-1 bg-slate-50 border border-slate-200 rounded-full px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent transition disabled:opacity-60"
              />
              <button type="submit" disabled={loading || !input.trim()}
                className="bg-gradient-brand hover:opacity-90 disabled:opacity-40 text-white rounded-full w-10 h-10 flex items-center justify-center transition"
                aria-label="Send">
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
