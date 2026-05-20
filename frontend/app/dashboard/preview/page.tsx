"use client";
import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase";
import { api } from "@/lib/api";
import FloatingChat from "@/components/FloatingChat";
import { Eye, ExternalLink, AlertCircle, RefreshCw } from "lucide-react";

interface Job {
  id: string;
  website_url: string;
  status: string;
  created_at: string;
}

export default function PreviewPage() {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [selectedUrl, setSelectedUrl] = useState("");
  const [loading, setLoading] = useState(true);
  const [iframeKey, setIframeKey] = useState(0); // force iframe reload

  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getSession().then(async ({ data }) => {
      if (!data.session) return;
      try {
        const j = await api.get<Job[]>("/training/jobs", data.session.access_token);
        const completed = j.filter((job) => job.status === "completed");
        setJobs(completed);
        if (completed.length > 0) setSelectedUrl(completed[0].website_url);
      } finally {
        setLoading(false);
      }
    });
  }, []);

  return (
    <div className="h-screen flex flex-col">
      {/* Top bar */}
      <div className="flex-shrink-0 bg-white border-b border-slate-200 px-6 py-3 flex items-center gap-4">
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-xl bg-gradient-brand flex items-center justify-center">
            <Eye size={16} className="text-white" />
          </div>
          <div>
            <h1 className="text-sm font-semibold text-slate-900">Live Preview</h1>
            <p className="text-[11px] text-slate-500">See your AI on a crawled website</p>
          </div>
        </div>

        <div className="flex-1" />

        {jobs.length > 0 && (
          <>
            <select
              value={selectedUrl}
              onChange={(e) => { setSelectedUrl(e.target.value); setIframeKey((k) => k + 1); }}
              className="bg-white border border-slate-200 rounded-lg px-3 py-1.5 text-xs font-medium text-slate-700 max-w-md truncate focus:outline-none focus:ring-2 focus:ring-brand-500"
            >
              {jobs.map((j) => (
                <option key={j.id} value={j.website_url}>{j.website_url}</option>
              ))}
            </select>

            <button
              onClick={() => setIframeKey((k) => k + 1)}
              className="p-1.5 rounded-lg text-slate-500 hover:bg-slate-100 transition"
              title="Reload preview"
              aria-label="Reload"
            >
              <RefreshCw size={14} />
            </button>

            <a
              href={selectedUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1.5 text-xs font-medium text-brand-600 hover:text-brand-700 bg-brand-50 hover:bg-brand-100 px-3 py-1.5 rounded-lg transition"
            >
              Open <ExternalLink size={12} />
            </a>
          </>
        )}
      </div>

      {/* Iframe area */}
      <div className="flex-1 relative bg-slate-100 overflow-hidden">
        {loading ? (
          <div className="h-full flex items-center justify-center text-slate-400 text-sm">Loading…</div>
        ) : jobs.length === 0 ? (
          <div className="h-full flex items-center justify-center">
            <div className="text-center max-w-md">
              <div className="w-14 h-14 rounded-2xl bg-amber-100 flex items-center justify-center mx-auto mb-4">
                <AlertCircle size={26} className="text-amber-600" />
              </div>
              <h2 className="text-lg font-semibold text-slate-900 mb-1">No trained sites yet</h2>
              <p className="text-sm text-slate-500 mb-4">
                Crawl a website first, then come back here to preview the AI on it.
              </p>
              <a
                href="/dashboard/training"
                className="inline-flex items-center gap-1.5 bg-gradient-brand text-white text-sm font-semibold px-4 py-2 rounded-xl shadow-soft hover:opacity-90 transition"
              >
                Go to Training
              </a>
            </div>
          </div>
        ) : (
          <>
            <iframe
              key={iframeKey}
              src={selectedUrl}
              className="w-full h-full border-0 bg-white"
              title="Website preview"
              sandbox="allow-same-origin allow-scripts allow-forms allow-popups allow-popups-to-escape-sandbox"
              referrerPolicy="no-referrer"
            />

            {/* Floating hint banner */}
            <div className="absolute top-4 left-1/2 -translate-x-1/2 bg-slate-900/90 backdrop-blur text-white text-xs px-4 py-2 rounded-full shadow-lift flex items-center gap-2 pointer-events-none">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 pulse-slow" />
              Your AI is live in the bottom-right →
            </div>

            {/* The floating AI bubble — overlays the iframe, exactly how it would on a real customer site */}
            <FloatingChat />
          </>
        )}
      </div>
    </div>
  );
}
