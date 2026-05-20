"use client";
import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase";
import { api } from "@/lib/api";
import { Copy, Trash2, Plus, Key, Code2, CheckCircle2 } from "lucide-react";

interface ApiKey { id: string; name: string; key_prefix: string; created_at: string; last_used_at?: string; }

export default function ApiKeysPage() {
  const [keys, setKeys] = useState<ApiKey[]>([]);
  const [newKeyName, setNewKeyName] = useState("");
  const [createdKey, setCreatedKey] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [snippetCopied, setSnippetCopied] = useState(false);
  const [token, setToken] = useState("");
  const [clientId, setClientId] = useState("");

  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getSession().then(async ({ data }) => {
      if (!data.session) return;
      setToken(data.session.access_token);
      try {
        const [clientData, keysData] = await Promise.all([
          api.get<{ id: string }>("/clients/me", data.session.access_token),
          api.get<ApiKey[]>("/clients/me/api-keys", data.session.access_token),
        ]);
        setClientId(clientData.id);
        setKeys(keysData);
      } catch {}
    });
  }, []);

  async function createKey(e: React.FormEvent) {
    e.preventDefault();
    const result = await api.post<{ key: string; prefix: string; name: string }>("/clients/me/api-keys", { name: newKeyName }, token);
    setCreatedKey(result.key);
    setKeys((prev) => [...prev, {
      id: crypto.randomUUID(),
      name: result.name,
      key_prefix: result.prefix,
      created_at: new Date().toISOString(),
    }]);
    setNewKeyName("");
  }

  async function revokeKey(id: string) {
    if (!confirm("Revoke this API key? Widgets using it will stop working.")) return;
    await api.delete(`/clients/me/api-keys/${id}`, token);
    setKeys((prev) => prev.filter((k) => k.id !== id));
  }

  const snippet = `<script src="https://web-talk-ai.vercel.app/widget.js?v=2.1.3"></script>
<script>
  WebTalkAI.init({
    apiKey: "YOUR_API_KEY",
    position: "bottom-right",
    theme: "purple"
  });
</script>`;

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold text-slate-900 tracking-tight">Install & API Keys</h1>
        <p className="text-slate-500 mt-1">Embed the AI on any website you own — voice + text out of the box</p>
      </div>

      {createdKey && (
        <div className="bg-gradient-to-r from-emerald-50 to-teal-50 border border-emerald-200 rounded-2xl p-5 shadow-soft fade-in">
          <div className="flex items-center gap-2 mb-3">
            <CheckCircle2 size={18} className="text-emerald-600" />
            <p className="font-semibold text-emerald-900">New API key created</p>
          </div>
          <p className="text-sm text-emerald-800 mb-3">Copy this key now — for security, it won&apos;t be shown again.</p>
          <div className="flex items-center gap-2 font-mono text-sm bg-white border border-emerald-200 rounded-xl px-4 py-3">
            <span className="flex-1 break-all text-slate-700">{createdKey}</span>
            <button
              onClick={() => { navigator.clipboard.writeText(createdKey); setCopied(true); setTimeout(() => setCopied(false), 2000); }}
              className="flex items-center gap-1.5 text-emerald-700 hover:text-emerald-900 font-medium text-xs bg-emerald-100 hover:bg-emerald-200 transition px-2.5 py-1.5 rounded-lg"
            >
              {copied ? <><CheckCircle2 size={13} /> Copied</> : <><Copy size={13} /> Copy</>}
            </button>
          </div>
          <button onClick={() => setCreatedKey(null)} className="mt-3 text-xs text-emerald-600 hover:underline font-medium">Dismiss</button>
        </div>
      )}

      {/* Create new key */}
      <div className="bg-white rounded-2xl border border-slate-200/70 p-6 shadow-soft">
        <div className="flex items-center gap-3 mb-5">
          <div className="w-10 h-10 rounded-xl bg-gradient-brand flex items-center justify-center">
            <Key size={18} className="text-white" />
          </div>
          <div>
            <h2 className="font-semibold text-slate-900">Create a new key</h2>
            <p className="text-xs text-slate-500">Give your key a descriptive name for easy tracking</p>
          </div>
        </div>
        <form onSubmit={createKey} className="flex gap-3">
          <input
            type="text"
            value={newKeyName}
            onChange={(e) => setNewKeyName(e.target.value)}
            required
            placeholder="e.g. Production widget"
            className="flex-1 border border-slate-200 rounded-xl px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent transition"
          />
          <button type="submit" className="flex items-center gap-1.5 bg-gradient-brand hover:opacity-90 text-white font-semibold px-4 py-2.5 rounded-xl text-sm transition shadow-soft">
            <Plus size={14} /> Create
          </button>
        </form>
      </div>

      {/* Keys list */}
      <div className="bg-white rounded-2xl border border-slate-200/70 overflow-hidden shadow-soft">
        <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
          <h2 className="font-semibold text-slate-900">Active keys</h2>
          <span className="text-xs text-slate-400">{keys.length} total</span>
        </div>
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-slate-500 text-xs uppercase tracking-wider">
            <tr>
              <th className="px-6 py-3 text-left font-semibold">Name</th>
              <th className="px-6 py-3 text-left font-semibold">Prefix</th>
              <th className="px-6 py-3 text-left font-semibold">Created</th>
              <th className="px-6 py-3 text-left font-semibold">Last used</th>
              <th className="px-6 py-3" />
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {keys.length === 0 && (
              <tr><td colSpan={5} className="px-6 py-16 text-center">
                <Key size={36} className="mx-auto text-slate-300 mb-3" />
                <p className="text-slate-500 text-sm">No API keys yet</p>
                <p className="text-slate-400 text-xs mt-1">Create one above to embed the widget</p>
              </td></tr>
            )}
            {keys.map((k) => (
              <tr key={k.id} className="hover:bg-slate-50/60 transition">
                <td className="px-6 py-3.5 font-medium text-slate-700">{k.name}</td>
                <td className="px-6 py-3.5">
                  <code className="text-xs bg-slate-100 text-slate-700 px-2 py-1 rounded">{k.key_prefix}…</code>
                </td>
                <td className="px-6 py-3.5 text-slate-400 text-xs">{new Date(k.created_at).toLocaleDateString()}</td>
                <td className="px-6 py-3.5 text-slate-400 text-xs">{k.last_used_at ? new Date(k.last_used_at).toLocaleDateString() : "Never"}</td>
                <td className="px-6 py-3.5 text-right">
                  <button onClick={() => revokeKey(k.id)} className="text-slate-400 hover:text-red-500 transition p-1.5 rounded-lg hover:bg-red-50">
                    <Trash2 size={14} />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Embed snippet */}
      <div className="bg-white rounded-2xl border border-slate-200/70 p-6 shadow-soft">
        <div className="flex items-center gap-3 mb-5">
          <div className="w-10 h-10 rounded-xl bg-slate-900 flex items-center justify-center">
            <Code2 size={18} className="text-white" />
          </div>
          <div>
            <h2 className="font-semibold text-slate-900">Embed the widget</h2>
            <p className="text-xs text-slate-500">Paste this just before <code className="bg-slate-100 px-1 rounded">&lt;/body&gt;</code> on your site</p>
          </div>
        </div>
        <div className="relative">
          <pre className="bg-slate-900 text-slate-100 rounded-xl p-4 text-xs font-mono overflow-x-auto leading-relaxed">{snippet}</pre>
          <button
            onClick={() => { navigator.clipboard.writeText(snippet); setSnippetCopied(true); setTimeout(() => setSnippetCopied(false), 2000); }}
            className="absolute top-3 right-3 bg-white/10 hover:bg-white/20 text-white text-xs font-medium px-2.5 py-1.5 rounded-lg flex items-center gap-1.5 backdrop-blur transition"
          >
            {snippetCopied ? <><CheckCircle2 size={12} /> Copied</> : <><Copy size={12} /> Copy</>}
          </button>
        </div>
      </div>
    </div>
  );
}
