"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase";
import { api } from "@/lib/api";
import {
  MessageSquare, Cpu, Mic, Clock, ArrowUpRight, Rocket, Globe, Key, Code2
} from "lucide-react";

interface Analytics {
  total_conversations: number;
  total_messages: number;
  avg_response_time_ms: number;
  voice_sessions: number;
  text_sessions: number;
}

function StatCard({
  label, value, icon: Icon, accent,
}: { label: string; value: string | number; icon: React.ElementType; accent: string }) {
  return (
    <div className="bg-white rounded-2xl border border-slate-200/70 p-5 shadow-soft card-hover">
      <div className="flex items-start justify-between mb-4">
        <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${accent}`}>
          <Icon size={18} className="text-white" />
        </div>
        <ArrowUpRight size={16} className="text-slate-300" />
      </div>
      <p className="text-3xl font-bold text-slate-900 tracking-tight">{value}</p>
      <p className="text-sm text-slate-500 mt-1">{label}</p>
    </div>
  );
}

const quickStart = [
  { href: "/dashboard/training", icon: Globe, title: "1. Crawl your website", desc: "Train the AI on your site content" },
  { href: "/dashboard/clients", icon: Key, title: "2. Create an API key", desc: "Authenticate the embedded widget" },
  { href: "/dashboard/clients", icon: Code2, title: "3. Paste the snippet", desc: "Drop it into your site's HTML" },
];

export default function DashboardPage() {
  const [analytics, setAnalytics] = useState<Analytics | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getSession().then(async ({ data }) => {
      if (!data.session) return;
      try {
        const res = await api.get<Analytics>("/analytics/", data.session.access_token);
        setAnalytics(res);
      } catch {
        // no analytics yet
      } finally {
        setLoading(false);
      }
    });
  }, []);

  return (
    <div className="space-y-8">
      <div className="flex items-end justify-between">
        <div>
          <h1 className="text-3xl font-bold text-slate-900 tracking-tight">Overview</h1>
          <p className="text-slate-500 mt-1">Last 30 days · Real-time</p>
        </div>
        <div className="hidden md:flex items-center gap-2 text-xs text-slate-500 bg-white border border-slate-200 rounded-full px-3 py-1.5 shadow-soft">
          <span className="w-2 h-2 rounded-full bg-emerald-500 pulse-slow" />
          All systems operational
        </div>
      </div>

      <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-brand-600 via-violet-600 to-fuchsia-600 p-8 text-white shadow-lift">
        <div className="absolute inset-0 bg-grid opacity-10" />
        <div className="relative max-w-2xl">
          <div className="inline-flex items-center gap-2 bg-white/15 backdrop-blur rounded-full px-3 py-1 text-xs font-semibold mb-4">
            <Rocket size={12} /> Quick start
          </div>
          <h2 className="text-2xl md:text-3xl font-bold mb-2">Get your AI agent live</h2>
          <p className="text-white/80 mb-5 max-w-lg">
            Three steps: crawl your site, generate an API key, paste the widget snippet.
          </p>
          <Link
            href="/dashboard/training"
            className="inline-flex items-center gap-2 bg-white text-brand-700 font-semibold rounded-xl px-4 py-2.5 text-sm hover:opacity-90 transition shadow-soft"
          >
            Start training <ArrowUpRight size={15} />
          </Link>
        </div>
      </div>

      <div>
        <h2 className="text-sm font-bold text-slate-700 mb-3 uppercase tracking-wider">Metrics</h2>
        {loading ? (
          <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="bg-white rounded-2xl border border-slate-200/70 p-5 shadow-soft">
                <div className="w-10 h-10 rounded-xl bg-slate-100 animate-pulse mb-4" />
                <div className="h-8 w-16 bg-slate-100 rounded animate-pulse mb-2" />
                <div className="h-3 w-24 bg-slate-100 rounded animate-pulse" />
              </div>
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
            <StatCard label="Conversations" value={analytics?.total_conversations ?? 0}
              icon={MessageSquare} accent="bg-gradient-to-br from-blue-500 to-blue-600" />
            <StatCard label="Total messages" value={analytics?.total_messages ?? 0}
              icon={Cpu} accent="bg-gradient-to-br from-violet-500 to-violet-600" />
            <StatCard label="Voice sessions" value={analytics?.voice_sessions ?? 0}
              icon={Mic} accent="bg-gradient-to-br from-emerald-500 to-emerald-600" />
            <StatCard label="Avg response (ms)" value={Math.round(analytics?.avg_response_time_ms ?? 0)}
              icon={Clock} accent="bg-gradient-to-br from-amber-500 to-orange-500" />
          </div>
        )}
      </div>

      <div>
        <h2 className="text-sm font-bold text-slate-700 mb-3 uppercase tracking-wider">Next steps</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {quickStart.map(({ href, icon: Icon, title, desc }, i) => (
            <Link key={href} href={href}
              className="group bg-white rounded-2xl border border-slate-200/70 p-5 shadow-soft card-hover">
              <div className="flex items-center justify-between mb-4">
                <div className="w-9 h-9 rounded-xl bg-slate-100 flex items-center justify-center group-hover:bg-brand-50 transition">
                  <Icon size={17} className="text-slate-600 group-hover:text-brand-600 transition" />
                </div>
                <span className="text-xs font-semibold text-slate-400">{i + 1}</span>
              </div>
              <h3 className="font-semibold text-slate-900 mb-1">{title}</h3>
              <p className="text-sm text-slate-500">{desc}</p>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
