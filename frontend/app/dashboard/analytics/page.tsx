"use client";
import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase";
import { api } from "@/lib/api";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Cell } from "recharts";
import { MessageSquare, Cpu, Clock, BarChart2 } from "lucide-react";

interface AnalyticsResponse {
  total_conversations: number;
  total_messages: number;
  avg_response_time_ms: number;
  voice_sessions: number;
  text_sessions: number;
}

export default function AnalyticsPage() {
  const [data, setData] = useState<AnalyticsResponse | null>(null);
  const [days, setDays] = useState(30);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getSession().then(async ({ data: s }) => {
      if (!s.session) return;
      setLoading(true);
      try {
        const res = await api.get<AnalyticsResponse>(`/analytics/?days=${days}`, s.session.access_token);
        setData(res);
      } finally {
        setLoading(false);
      }
    });
  }, [days]);

  const chartData = data
    ? [
        { name: "Text", sessions: data.text_sessions, fill: "#3b82f6" },
        { name: "Voice", sessions: data.voice_sessions, fill: "#a855f7" },
      ]
    : [];

  const Stat = ({ label, value, icon: Icon, accent }: { label: string; value: number; icon: React.ElementType; accent: string }) => (
    <div className="bg-white rounded-2xl border border-slate-200/70 p-5 shadow-soft card-hover">
      <div className={`w-10 h-10 rounded-xl flex items-center justify-center mb-4 ${accent}`}>
        <Icon size={18} className="text-white" />
      </div>
      <p className="text-3xl font-bold text-slate-900 tracking-tight">{value}</p>
      <p className="text-sm text-slate-500 mt-1">{label}</p>
    </div>
  );

  return (
    <div className="space-y-8">
      <div className="flex items-end justify-between">
        <div>
          <h1 className="text-3xl font-bold text-slate-900 tracking-tight">Analytics</h1>
          <p className="text-slate-500 mt-1">Conversation insights and engagement</p>
        </div>
        <select
          value={days}
          onChange={(e) => setDays(parseInt(e.target.value))}
          className="bg-white border border-slate-200 rounded-xl px-3.5 py-2 text-sm font-medium shadow-soft focus:outline-none focus:ring-2 focus:ring-brand-500"
        >
          <option value={7}>Last 7 days</option>
          <option value={30}>Last 30 days</option>
          <option value={90}>Last 90 days</option>
        </select>
      </div>

      {loading ? (
        <div className="text-slate-400 text-sm">Loading…</div>
      ) : (
        <>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Stat label="Total conversations" value={data?.total_conversations ?? 0}
              icon={MessageSquare} accent="bg-gradient-to-br from-blue-500 to-blue-600" />
            <Stat label="Total messages" value={data?.total_messages ?? 0}
              icon={Cpu} accent="bg-gradient-to-br from-violet-500 to-violet-600" />
            <Stat label="Avg response (ms)" value={Math.round(data?.avg_response_time_ms ?? 0)}
              icon={Clock} accent="bg-gradient-to-br from-amber-500 to-orange-500" />
          </div>

          <div className="bg-white rounded-2xl border border-slate-200/70 p-6 shadow-soft">
            <div className="flex items-center gap-3 mb-5">
              <div className="w-10 h-10 rounded-xl bg-gradient-brand flex items-center justify-center">
                <BarChart2 size={18} className="text-white" />
              </div>
              <div>
                <h2 className="font-semibold text-slate-900">Sessions by channel</h2>
                <p className="text-xs text-slate-500">Text vs. voice usage</p>
              </div>
            </div>
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                <XAxis dataKey="name" tick={{ fontSize: 12, fill: "#64748b" }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 12, fill: "#64748b" }} axisLine={false} tickLine={false} />
                <Tooltip
                  cursor={{ fill: "rgba(99,102,241,0.05)" }}
                  contentStyle={{
                    background: "white",
                    border: "1px solid #e2e8f0",
                    borderRadius: 12,
                    boxShadow: "0 4px 14px rgba(15,23,42,0.08)",
                    fontSize: 13,
                  }}
                />
                <Bar dataKey="sessions" radius={[8, 8, 0, 0]}>
                  {chartData.map((entry, i) => (<Cell key={i} fill={entry.fill} />))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </>
      )}
    </div>
  );
}
