"use client";
import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase";
import { api } from "@/lib/api";
import { MessageSquare, Mic, Inbox } from "lucide-react";

interface Conversation {
  id: string;
  session_id: string;
  messages: { role: string; content: string }[];
  channel: "text" | "voice";
  created_at: string;
}

export default function ConversationsPage() {
  const [convos, setConvos] = useState<Conversation[]>([]);
  const [selected, setSelected] = useState<Conversation | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getSession().then(async ({ data }) => {
      if (!data.session) return;
      try {
        const res = await api.get<Conversation[]>("/conversations/", data.session.access_token);
        setConvos(res);
      } finally {
        setLoading(false);
      }
    });
  }, []);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-slate-900 tracking-tight">Conversations</h1>
        <p className="text-slate-500 mt-1">All user sessions with your AI agent</p>
      </div>

      <div className="flex gap-4 h-[calc(100vh-220px)]">
        {/* List */}
        <div className="w-80 bg-white rounded-2xl border border-slate-200/70 overflow-hidden flex-shrink-0 shadow-soft flex flex-col">
          <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between">
            <p className="text-xs font-bold uppercase tracking-wider text-slate-500">Sessions</p>
            <span className="text-xs text-slate-400">{convos.length}</span>
          </div>
          <div className="flex-1 overflow-y-auto">
            {loading && <p className="p-6 text-sm text-slate-400">Loading…</p>}
            {!loading && convos.length === 0 && (
              <div className="p-8 text-center">
                <Inbox size={32} className="mx-auto text-slate-300 mb-2" />
                <p className="text-sm text-slate-500">No conversations yet</p>
              </div>
            )}
            {convos.map((c) => (
              <button
                key={c.id}
                onClick={() => setSelected(c)}
                className={`w-full text-left px-4 py-3 border-b border-slate-50 hover:bg-slate-50 transition ${selected?.id === c.id ? "bg-brand-50 border-l-2 border-l-brand-500" : ""}`}
              >
                <div className="flex items-center gap-2 mb-1">
                  {c.channel === "voice"
                    ? <span className="flex items-center gap-1 text-[10px] bg-violet-100 text-violet-700 font-semibold px-1.5 py-0.5 rounded uppercase tracking-wide"><Mic size={10} /> Voice</span>
                    : <span className="flex items-center gap-1 text-[10px] bg-blue-100 text-blue-700 font-semibold px-1.5 py-0.5 rounded uppercase tracking-wide"><MessageSquare size={10} /> Text</span>
                  }
                  <span className="text-[10px] font-mono text-slate-400 truncate">{c.session_id.slice(0, 10)}…</span>
                </div>
                <p className="text-sm text-slate-700 truncate font-medium">{c.messages[0]?.content ?? "—"}</p>
                <p className="text-xs text-slate-400 mt-0.5">{new Date(c.created_at).toLocaleString()}</p>
              </button>
            ))}
          </div>
        </div>

        {/* Detail */}
        <div className="flex-1 bg-white rounded-2xl border border-slate-200/70 shadow-soft flex flex-col overflow-hidden">
          {!selected ? (
            <div className="h-full flex items-center justify-center text-slate-400 text-sm">
              <div className="text-center">
                <MessageSquare size={36} className="mx-auto text-slate-300 mb-3" />
                <p className="text-slate-500">Select a conversation to view</p>
              </div>
            </div>
          ) : (
            <>
              <div className="px-6 py-4 border-b border-slate-100">
                <div className="flex items-center gap-2 mb-1">
                  {selected.channel === "voice"
                    ? <Mic size={14} className="text-violet-500" />
                    : <MessageSquare size={14} className="text-blue-500" />}
                  <p className="text-sm font-semibold text-slate-700 capitalize">{selected.channel} session</p>
                </div>
                <p className="text-xs text-slate-400 font-mono">{selected.session_id}</p>
              </div>
              <div className="flex-1 overflow-y-auto p-6 space-y-3">
                {selected.messages.map((m, i) => (
                  <div key={i} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
                    <div className={`max-w-lg px-4 py-2.5 rounded-2xl text-sm leading-relaxed ${
                      m.role === "user"
                        ? "bg-gradient-brand text-white rounded-br-sm shadow-soft"
                        : "bg-slate-100 text-slate-700 rounded-bl-sm"
                    }`}>
                      {m.content}
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
