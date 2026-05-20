"use client";
import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase";
import { api } from "@/lib/api";
import { Loader2, CheckCircle2, XCircle, Clock, Globe, Play, FileText } from "lucide-react";

interface Job {
  id: string;
  website_url: string;
  status: "pending" | "running" | "completed" | "failed";
  pages_crawled: number;
  pages_total: number;
  error_message?: string;
  created_at: string;
}

const statusBadge = (s: Job["status"]) => {
  const map = {
    pending:   { Icon: Clock,       cls: "bg-amber-50 text-amber-700 border-amber-200" },
    running:   { Icon: Loader2,     cls: "bg-blue-50 text-blue-700 border-blue-200",   spin: true },
    completed: { Icon: CheckCircle2,cls: "bg-emerald-50 text-emerald-700 border-emerald-200" },
    failed:    { Icon: XCircle,     cls: "bg-red-50 text-red-700 border-red-200" },
  } as const;
  const { Icon, cls, spin } = map[s] as { Icon: React.ElementType; cls: string; spin?: boolean };
  return (
    <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full border text-xs font-semibold capitalize ${cls}`}>
      <Icon size={12} className={spin ? "animate-spin" : ""} />
      {s}
    </span>
  );
};

export default function TrainingPage() {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [url, setUrl] = useState("");
  const [maxPages, setMaxPages] = useState(50);
  const [submitting, setSubmitting] = useState(false);
  const [token, setToken] = useState("");

  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getSession().then(({ data }) => {
      if (!data.session) return;
      setToken(data.session.access_token);
      api.get<Job[]>("/training/jobs", data.session.access_token).then(setJobs).catch(() => {});
    });
  }, []);

  useEffect(() => {
    if (!token || !jobs.some((j) => j.status === "running" || j.status === "pending")) return;
    const id = setInterval(() => {
      api.get<Job[]>("/training/jobs", token).then(setJobs).catch(() => {});
    }, 3000);
    return () => clearInterval(id);
  }, [token, jobs]);

  async function startJob(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    try {
      const job = await api.post<Job>("/training/jobs", { website_url: url, max_pages: maxPages }, token);
      setJobs((prev) => [job, ...prev]);
      setUrl("");
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : "Failed to start job");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold text-slate-900 tracking-tight">Training</h1>
        <p className="text-slate-500 mt-1">Crawl your website to build the AI knowledge base</p>
      </div>

      {/* Start form */}
      <div className="bg-white rounded-2xl border border-slate-200/70 p-6 shadow-soft">
        <div className="flex items-center gap-3 mb-5">
          <div className="w-10 h-10 rounded-xl bg-gradient-brand flex items-center justify-center">
            <Globe size={18} className="text-white" />
          </div>
          <div>
            <h2 className="font-semibold text-slate-900">Start a new training job</h2>
            <p className="text-xs text-slate-500">Fetches pages, extracts text, embeds into Qdrant</p>
          </div>
        </div>
        <form onSubmit={startJob} className="flex flex-wrap gap-3 items-end">
          <div className="flex-1 min-w-64">
            <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wide mb-2">Website URL</label>
            <input
              type="url"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              required
              placeholder="https://yourwebsite.com"
              className="w-full border border-slate-200 rounded-xl px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent transition"
            />
          </div>
          <div className="w-32">
            <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wide mb-2">Max pages</label>
            <input
              type="number"
              value={maxPages}
              onChange={(e) => setMaxPages(parseInt(e.target.value))}
              min={1}
              max={500}
              className="w-full border border-slate-200 rounded-xl px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent transition"
            />
          </div>
          <button
            type="submit"
            disabled={submitting}
            className="bg-gradient-brand hover:opacity-90 text-white font-semibold px-5 py-2.5 rounded-xl text-sm transition disabled:opacity-50 flex items-center gap-2 shadow-soft"
          >
            <Play size={14} /> {submitting ? "Starting…" : "Start crawl"}
          </button>
        </form>
      </div>

      {/* Job list */}
      <div className="bg-white rounded-2xl border border-slate-200/70 overflow-hidden shadow-soft">
        <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
          <h2 className="font-semibold text-slate-900">Job history</h2>
          <span className="text-xs text-slate-400">{jobs.length} total</span>
        </div>
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-slate-500 text-xs uppercase tracking-wider">
            <tr>
              <th className="px-6 py-3 text-left font-semibold">URL</th>
              <th className="px-6 py-3 text-left font-semibold">Status</th>
              <th className="px-6 py-3 text-left font-semibold">Progress</th>
              <th className="px-6 py-3 text-left font-semibold">Started</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {jobs.length === 0 && (
              <tr><td colSpan={4} className="px-6 py-16 text-center">
                <FileText size={36} className="mx-auto text-slate-300 mb-3" />
                <p className="text-slate-500 text-sm">No training jobs yet</p>
                <p className="text-slate-400 text-xs mt-1">Start one above to crawl your first site</p>
              </td></tr>
            )}
            {jobs.map((job) => (
              <tr key={job.id} className="hover:bg-slate-50/60 transition">
                <td className="px-6 py-3.5 font-medium text-slate-700 truncate max-w-xs">{job.website_url}</td>
                <td className="px-6 py-3.5">{statusBadge(job.status)}</td>
                <td className="px-6 py-3.5">
                  {job.pages_total > 0 ? (
                    <div>
                      <div className="text-xs text-slate-600 mb-1">{job.pages_crawled} / {job.pages_total} pages</div>
                      <div className="w-32 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                        <div className="h-full bg-gradient-brand rounded-full transition-all"
                          style={{ width: `${(job.pages_crawled / job.pages_total) * 100}%` }} />
                      </div>
                    </div>
                  ) : <span className="text-slate-300">—</span>}
                </td>
                <td className="px-6 py-3.5 text-slate-400 text-xs">{new Date(job.created_at).toLocaleString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
