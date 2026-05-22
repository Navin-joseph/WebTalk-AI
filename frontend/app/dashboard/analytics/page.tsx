"use client";
import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase";
import { api } from "@/lib/api";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Cell,
  LineChart, Line, Legend, Area, AreaChart,
} from "recharts";
import { MessageSquare, Cpu, Clock, BarChart2, Mic, TrendingUp } from "lucide-react";

interface AnalyticsResponse {
  total_conversations: number;
  total_messages: number;
  avg_response_time_ms: number;
  voice_sessions: number;
  text_sessions: number;
}

interface DailyPoint {
  date: string;
  text: number;
  voice: number;
  total: number;
}

// Custom tooltip used by both charts
function ChartTooltip({ active, payload, label }: { active?: boolean; payload?: {color: string; name: string; value: number}[]; label?: string }) {
  if (!active || !payload?.length) return null;
  const dateStr = label
    ? new Date(label + "T00:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" })
    : "";
  return (
    <div className="bg-white border border-slate-200 rounded-xl shadow-lg px-4 py-3 text-xs">
      <p className="font-semibold text-slate-700 mb-2">{dateStr}</p>
      {payload.map(p => (
        <div key={p.name} className="flex items-center gap-2 mb-1">
          <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: p.color }} />
          <span className="text-slate-500 capitalize">{p.name}:</span>
          <span className="font-semibold text-slate-800">{p.value}</span>
        </div>
      ))}
    </div>
  );
}

export default function AnalyticsPage() {
  const [data, setData] = useState<AnalyticsResponse | null>(null);
  const [daily, setDaily] = useState<DailyPoint[]>([]);
  const [days, setDays] = useState(30);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getSession().then(async ({ data: s }) => {
      if (!s.session) return;
      setLoading(true);
      try {
        const [summary, dailyData] = await Promise.all([
          api.get<AnalyticsResponse>(`/analytics/?days=${days}`, s.session.access_token),
          api.get<DailyPoint[]>(`/analytics/daily?days=${days}`, s.session.access_token),
        ]);
        setData(summary);
        setDaily(dailyData);
      } finally {
        setLoading(false);
      }
    });
  }, [days]);

  // Summary bar chart (text vs voice totals)
  const summaryChart = data
    ? [
        { name: "Text", sessions: data.text_sessions, fill: "#3b82f6" },
        { name: "Voice", sessions: data.voice_sessions, fill: "#a855f7" },
      ]
    : [];

  // Thin out X-axis labels so they don't overlap
  const tickInterval = days <= 7 ? 0 : days <= 30 ? 4 : 9;

  const Stat = ({
    label, value, sub, icon: Icon, accent,
  }: { label: string; value: string | number; sub?: string; icon: React.ElementType; accent: string }) => (
    <div className="bg-white rounded-2xl border border-slate-200/70 p-5 shadow-soft card-hover">
      <div className={`w-10 h-10 rounded-xl flex items-center justify-center mb-4 ${accent}`}>
        <Icon size={18} className="text-white" />
      </div>
      <p className="text-3xl font-bold text-slate-900 tracking-tight">{value}</p>
      {sub && <p className="text-xs text-slate-400 mt-0.5">{sub}</p>}
      <p className="text-sm text-slate-500 mt-1">{label}</p>
    </div>
  );

  return (
    <div className="space-y-8">
      {/* Header */}
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
        <div className="flex items-center gap-3 text-slate-400 text-sm py-10">
          <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
          </svg>
          Loading analytics…
        </div>
      ) : (
        <>
          {/* ── Stat cards ── */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <Stat
              label="Total conversations"
              value={data?.total_conversations ?? 0}
              icon={MessageSquare}
              accent="bg-gradient-to-br from-blue-500 to-blue-600"
            />
            <Stat
              label="Total messages"
              value={data?.total_messages ?? 0}
              icon={Cpu}
              accent="bg-gradient-to-br from-violet-500 to-violet-600"
            />
            <Stat
              label="Voice sessions"
              value={data?.voice_sessions ?? 0}
              sub={`${data && data.total_conversations > 0 ? Math.round((data.voice_sessions / data.total_conversations) * 100) : 0}% of total`}
              icon={Mic}
              accent="bg-gradient-to-br from-fuchsia-500 to-pink-500"
            />
            <Stat
              label="Avg response time"
              value={`${Math.round(data?.avg_response_time_ms ?? 0)} ms`}
              icon={Clock}
              accent="bg-gradient-to-br from-amber-500 to-orange-500"
            />
          </div>

          {/* ── Daily trend — Area chart ── */}
          <div className="bg-white rounded-2xl border border-slate-200/70 p-6 shadow-soft">
            <div className="flex items-center gap-3 mb-6">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-500 to-violet-500 flex items-center justify-center">
                <TrendingUp size={18} className="text-white" />
              </div>
              <div>
                <h2 className="font-semibold text-slate-900">Daily conversations</h2>
                <p className="text-xs text-slate-500">Text &amp; voice sessions over time</p>
              </div>
            </div>
            {daily.length > 0 && daily.every(d => d.total === 0) ? (
              <div className="h-64 flex items-center justify-center text-slate-400 text-sm">
                No conversations yet in this period
              </div>
            ) : (
              <ResponsiveContainer width="100%" height={260}>
                <AreaChart data={daily} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
                  <defs>
                    <linearGradient id="gradText" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.18} />
                      <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                    </linearGradient>
                    <linearGradient id="gradVoice" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#a855f7" stopOpacity={0.18} />
                      <stop offset="95%" stopColor="#a855f7" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                  <XAxis
                    dataKey="date"
                    tick={{ fontSize: 11, fill: "#94a3b8" }}
                    axisLine={false}
                    tickLine={false}
                    interval={tickInterval}
                    tickFormatter={d => new Date(d + "T00:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                  />
                  <YAxis
                    allowDecimals={false}
                    tick={{ fontSize: 11, fill: "#94a3b8" }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <Tooltip content={<ChartTooltip />} />
                  <Legend
                    iconType="circle"
                    iconSize={8}
                    wrapperStyle={{ fontSize: 12, color: "#64748b", paddingTop: 12 }}
                  />
                  <Area
                    type="monotone"
                    dataKey="text"
                    name="Text"
                    stroke="#3b82f6"
                    strokeWidth={2.5}
                    fill="url(#gradText)"
                    dot={false}
                    activeDot={{ r: 4, strokeWidth: 0 }}
                  />
                  <Area
                    type="monotone"
                    dataKey="voice"
                    name="Voice"
                    stroke="#a855f7"
                    strokeWidth={2.5}
                    fill="url(#gradVoice)"
                    dot={false}
                    activeDot={{ r: 4, strokeWidth: 0 }}
                  />
                </AreaChart>
              </ResponsiveContainer>
            )}
          </div>

          {/* ── Text vs Voice comparison ── */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Bar chart — total text vs voice */}
            <div className="bg-white rounded-2xl border border-slate-200/70 p-6 shadow-soft">
              <div className="flex items-center gap-3 mb-5">
                <div className="w-10 h-10 rounded-xl bg-gradient-brand flex items-center justify-center">
                  <BarChart2 size={18} className="text-white" />
                </div>
                <div>
                  <h2 className="font-semibold text-slate-900">Sessions by channel</h2>
                  <p className="text-xs text-slate-500">Total text vs. voice for period</p>
                </div>
              </div>
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={summaryChart} barSize={52}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                  <XAxis dataKey="name" tick={{ fontSize: 12, fill: "#64748b" }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 12, fill: "#64748b" }} axisLine={false} tickLine={false} allowDecimals={false} />
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
                    {summaryChart.map((entry, i) => (<Cell key={i} fill={entry.fill} />))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>

            {/* Voice share donut-style stat + line sparkline */}
            <div className="bg-white rounded-2xl border border-slate-200/70 p-6 shadow-soft flex flex-col gap-4">
              <div className="flex items-center gap-3 mb-1">
                <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-fuchsia-500 to-pink-500 flex items-center justify-center">
                  <Mic size={18} className="text-white" />
                </div>
                <div>
                  <h2 className="font-semibold text-slate-900">Voice adoption</h2>
                  <p className="text-xs text-slate-500">Share of voice vs. text sessions</p>
                </div>
              </div>

              {/* Share bar */}
              {data && data.total_conversations > 0 ? (
                <>
                  <div>
                    <div className="flex justify-between text-xs text-slate-500 mb-1.5">
                      <span>Text — {data.text_sessions}</span>
                      <span>Voice — {data.voice_sessions}</span>
                    </div>
                    <div className="h-3 rounded-full bg-blue-100 overflow-hidden">
                      <div
                        className="h-full rounded-full bg-gradient-to-r from-fuchsia-500 to-purple-500 transition-all duration-700"
                        style={{ width: `${Math.round((data.voice_sessions / data.total_conversations) * 100)}%` }}
                      />
                    </div>
                    <p className="text-xs text-slate-400 mt-1.5 text-right">
                      {Math.round((data.voice_sessions / data.total_conversations) * 100)}% voice
                    </p>
                  </div>

                  {/* Mini line chart — total per day */}
                  <div className="mt-1">
                    <p className="text-xs text-slate-400 mb-2">Daily total (last {days}d)</p>
                    <ResponsiveContainer width="100%" height={100}>
                      <LineChart data={daily} margin={{ top: 2, right: 2, left: -30, bottom: 0 }}>
                        <Line
                          type="monotone"
                          dataKey="total"
                          stroke="#7c3aed"
                          strokeWidth={2}
                          dot={false}
                          activeDot={{ r: 3, strokeWidth: 0 }}
                        />
                        <XAxis dataKey="date" hide />
                        <YAxis hide allowDecimals={false} />
                        <Tooltip
                          content={({ active, payload, label }) => {
                            if (!active || !payload?.length) return null;
                            return (
                              <div className="bg-white border border-slate-200 rounded-lg px-3 py-2 text-xs shadow">
                                <span className="text-slate-500">{label ? new Date(label + "T00:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" }) : ""}: </span>
                                <span className="font-semibold text-slate-800">{payload[0].value}</span>
                              </div>
                            );
                          }}
                        />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                </>
              ) : (
                <div className="flex-1 flex items-center justify-center text-slate-400 text-sm">
                  No conversations yet
                </div>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
