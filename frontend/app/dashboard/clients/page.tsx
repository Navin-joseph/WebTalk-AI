"use client";
import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase";
import { api } from "@/lib/api";
import { Copy, Trash2, Plus, Key, Code2, CheckCircle2, Sparkles } from "lucide-react";
import ConfirmModal from "@/components/ConfirmModal";

interface ApiKey { id: string; name: string; key_prefix: string; created_at: string; last_used_at?: string; }

/** Build the ready-to-paste embed snippet for a given API key. */
function buildSnippet(apiKey: string): string {
  const lines = [
    '<script defer src="https://web-talk-ai.vercel.app/widget.js"></script>',
    '<script>',
    'document.addEventListener("DOMContentLoaded", function () {',
    '  WebTalkAI.init({',
    `    apiKey: "${apiKey}",`,
    '    simliApiKey: "zxvcgjq9ijl9rjot3rfjoo",',
    '    simliFaceId: "dd10cb5a-d31d-4f12-b69f-6db3383c006e",',
    '    theme: "light",',
    '    position: "bottom-right",',
    '    voiceEnabled: true,',
    '    ttsAutoPlay: true',
    '  });',
    '});',
    '</script>'
  ];
  return lines.join('\n');
}

export default function ApiKeysPage() {
  const [keys, setKeys] = useState<ApiKey[]>([]);
  const [newKeyName, setNewKeyName] = useState("");
  const [createdKey, setCreatedKey] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [snippetCopied, setSnippetCopied] = useState(false);
  const [token, setToken] = useState("");

  // Delete-key modal state
  const [deleteTarget, setDeleteTarget] = useState<ApiKey | null>(null);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getSession().then(async ({ data }) => {
      if (!data.session) return;
      setToken(data.session.access_token);
      try {
        const keysData = await api.get<ApiKey[]>("/clients/me/api-keys", data.session.access_token);
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

  async function confirmRevoke() {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await api.delete(`/clients/me/api-keys/${deleteTarget.id}`, token);
      setKeys((prev) => prev.filter((k) => k.id !== deleteTarget.id));
      setDeleteTarget(null);
    } catch {
      // keep modal open on error so user sees it didn't work
    } finally {
      setDeleting(false);
    }
  }

  // Snippet shown in the embed section — uses real key when freshly created
  const snippet = buildSnippet(createdKey ?? "YOUR_API_KEY");

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold text-slate-900 tracking-tight">Install & API Keys</h1>
        <p className="text-slate-600 mt-1">Embed the AI widget on any website — neural lip-sync, voice & text out of the box</p>
      </div>

      {/* ── Newly-created key banner ───────────────────────────────────────────── */}
      {createdKey && (
        <div className="bg-gradient-to-r from-emerald-50 to-teal-50 border border-emerald-200 rounded-2xl p-5 shadow-soft fade-in">
          <div className="flex items-center gap-2 mb-3">
            <CheckCircle2 size={18} className="text-emerald-600" />
            <p className="font-semibold text-emerald-900">New API key created — embed code below is ready to paste!</p>
          </div>
          <p className="text-sm text-emerald-700 mb-3">
            Copy this key now — for security, it won&apos;t be shown again.
            The embed snippet below has already been updated with your key.
          </p>
          <div className="flex items-center gap-2 font-mono text-sm bg-white border border-emerald-200 rounded-xl px-4 py-3">
            <span className="flex-1 break-all text-slate-700">{createdKey}</span>
            <button
              onClick={() => { navigator.clipboard.writeText(createdKey); setCopied(true); setTimeout(() => setCopied(false), 2000); }}
              className="flex items-center gap-1.5 text-emerald-700 hover:text-emerald-800 font-medium text-xs bg-emerald-100 hover:bg-emerald-200 transition px-2.5 py-1.5 rounded-lg"
            >
              {copied ? <><CheckCircle2 size={13} /> Copied</> : <><Copy size={13} /> Copy key</>}
            </button>
          </div>
          <button onClick={() => setCreatedKey(null)} className="mt-3 text-xs text-emerald-700 hover:underline font-medium">Dismiss</button>
        </div>
      )}

      {/* ── Create new key ─────────────────────────────────────────────────────── */}
      <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-soft">
        <div className="flex items-center gap-3 mb-5">
          <div className="w-10 h-10 rounded-xl bg-gradient-brand flex items-center justify-center">
            <Key size={18} className="text-white" />
          </div>
          <div>
            <h2 className="font-semibold text-slate-900">Create a new key</h2>
            <p className="text-xs text-slate-600">Give your key a descriptive name for easy tracking</p>
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

      {/* ── Keys list ─────────────────────────────────────────────────────────── */}
      <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-soft">
        <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between">
          <h2 className="font-semibold text-slate-900">Active keys</h2>
          <span className="text-xs text-slate-600">{keys.length} total</span>
        </div>
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-slate-600 text-xs uppercase tracking-wider">
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
                <p className="text-slate-600 text-sm">No API keys yet</p>
                <p className="text-slate-500 text-xs mt-1">Create one above to embed the widget</p>
              </td></tr>
            )}
            {keys.map((k) => (
              <tr key={k.id} className="hover:bg-slate-50 transition group">
                <td className="px-6 py-3.5 font-medium text-slate-900">{k.name}</td>
                <td className="px-6 py-3.5">
                  <code className="text-xs bg-slate-100 text-slate-700 px-2 py-1 rounded">{k.key_prefix}…</code>
                </td>
                <td className="px-6 py-3.5 text-slate-600 text-xs">{new Date(k.created_at).toLocaleDateString()}</td>
                <td className="px-6 py-3.5 text-slate-600 text-xs">{k.last_used_at ? new Date(k.last_used_at).toLocaleDateString() : "Never"}</td>
                <td className="px-6 py-3.5 text-right">
                  <button
                    onClick={() => setDeleteTarget(k)}
                    className="opacity-0 group-hover:opacity-100 text-slate-500 hover:text-red-500 transition p-1.5 rounded-lg hover:bg-red-950/30"
                    title="Revoke key"
                  >
                    <Trash2 size={14} />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* ── Embed snippet ─────────────────────────────────────────────────────── */}
      <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-soft">
        <div className="flex items-center gap-3 mb-2">
          <div className="w-10 h-10 rounded-xl bg-slate-100 flex items-center justify-center">
            <Code2 size={18} className="text-slate-700" />
          </div>
          <div>
            <h2 className="font-semibold text-slate-900">Embed the widget</h2>
            <p className="text-xs text-slate-600">
              Paste this just before <code className="bg-slate-200 px-1 rounded text-slate-800">&lt;/body&gt;</code> on your site
              {!createdKey && <span className="text-violet-700 font-medium"> — replace YOUR_API_KEY with a key from the table above</span>}
            </p>
          </div>
        </div>

        {/* Features notice */}
        <div className="flex items-start gap-2.5 bg-violet-50 border border-violet-200 rounded-xl p-3.5 mb-4 mt-3">
          <Sparkles size={15} className="text-violet-600 mt-0.5 flex-shrink-0" />
          <p className="text-xs text-violet-900 leading-relaxed">
            <strong>Low-latency AI with real-time lip-sync</strong> — <strong>Groq Llama-3.1-8B</strong> for instant responses (sub-50ms latency), <strong>Deepgram Nova-3</strong> for speech-to-text, <strong>Cartesia Sonic-3.5</strong> for 80–150ms streaming TTS.
            Real-time mouth animation with <100ms lip-sync. <strong>Optional:</strong> Simli.ai WebRTC for realistic talking avatar with perfect lip-sync.
          </p>
        </div>

        <div className="relative">
          <pre className="bg-slate-900 text-slate-100 rounded-xl p-4 text-xs font-mono overflow-x-auto leading-relaxed whitespace-pre">{snippet}</pre>
          <button
            onClick={() => { navigator.clipboard.writeText(snippet); setSnippetCopied(true); setTimeout(() => setSnippetCopied(false), 2000); }}
            className="absolute top-3 right-3 bg-slate-200 hover:bg-slate-300 text-slate-900 text-xs font-medium px-2.5 py-1.5 rounded-lg flex items-center gap-1.5 transition"
          >
            {snippetCopied ? <><CheckCircle2 size={12} /> Copied</> : <><Copy size={12} /> Copy</>}
          </button>
        </div>
      </div>

      {/* ── Delete confirmation modal ──────────────────────────────────────────── */}
      <ConfirmModal
        open={!!deleteTarget}
        title="Revoke API key?"
        message={`"${deleteTarget?.name}" will be permanently revoked. Any widgets currently using this key will stop working immediately.`}
        confirmLabel="Revoke key"
        danger
        loading={deleting}
        onConfirm={confirmRevoke}
        onCancel={() => { if (!deleting) setDeleteTarget(null); }}
      />
    </div>
  );
}
