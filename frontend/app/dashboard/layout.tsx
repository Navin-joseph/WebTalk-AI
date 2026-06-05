"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase";
import {
  LayoutDashboard, MessageSquare, Cpu, BarChart2, Key, LogOut, Sparkles
} from "lucide-react";
import DashboardAI from "./_components/DashboardAI";

const nav = [
  { href: "/dashboard",               label: "Overview",        icon: LayoutDashboard, exact: true },
  { href: "/dashboard/training",      label: "Training",        icon: Cpu },
  { href: "/dashboard/conversations", label: "Conversations",   icon: MessageSquare },
  { href: "/dashboard/analytics",     label: "Analytics",       icon: BarChart2 },
  { href: "/dashboard/clients",       label: "Install & API Keys", icon: Key },
];

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [user, setUser] = useState<{ email?: string } | null>(null);

  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getUser().then(({ data }) => {
      if (!data.user) router.push("/auth/login");
      else setUser(data.user);
    });
  }, [router]);

  async function handleLogout() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/auth/login");
  }

  const initials = user?.email?.[0]?.toUpperCase() ?? "?";

  return (
    <div className="flex h-screen bg-slate-950">
      <aside className="w-64 bg-slate-900 border-r border-slate-800 flex flex-col flex-shrink-0">
        <div className="px-6 py-5 border-b border-slate-800">
          <Link href="/dashboard" className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-gradient-brand flex items-center justify-center shadow-soft">
              <Sparkles size={16} className="text-white" />
            </div>
            <span className="text-base font-bold tracking-tight text-white">WebTalk AI</span>
          </Link>
        </div>

        <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
          <p className="px-3 py-2 text-[10px] font-bold tracking-widest uppercase text-slate-500">Workspace</p>
          {nav.map(({ href, label, icon: Icon, exact }) => {
            const active = exact ? pathname === href : pathname.startsWith(href);
            return (
              <Link
                key={href}
                href={href}
                className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition ${
                  active
                    ? "bg-slate-800 text-violet-400 shadow-sm"
                    : "text-slate-400 hover:bg-slate-800/50 hover:text-slate-200"
                }`}
              >
                <Icon size={17} className={active ? "text-violet-400" : "text-slate-500"} />
                {label}
                {active && <span className="ml-auto w-1.5 h-1.5 rounded-full bg-violet-500" />}
              </Link>
            );
          })}
        </nav>

        <div className="p-3 border-t border-slate-800">
          <div className="flex items-center gap-3 px-2 py-2 rounded-xl hover:bg-slate-800/50 transition cursor-pointer">
            <div className="w-9 h-9 rounded-full bg-gradient-brand text-white font-semibold flex items-center justify-center text-sm flex-shrink-0">
              {initials}
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-sm font-medium text-white truncate">{user?.email ?? "Loading…"}</div>
              <div className="text-xs text-slate-500">Owner</div>
            </div>
            <button
              onClick={handleLogout}
              className="p-1.5 rounded-lg text-slate-500 hover:text-red-400 hover:bg-red-950/30 transition"
              aria-label="Sign out"
              title="Sign out"
            >
              <LogOut size={15} />
            </button>
          </div>
        </div>
      </aside>

      <main className="flex-1 overflow-auto bg-slate-950">
        <div className="fade-in px-10 py-8 max-w-7xl mx-auto text-slate-100">{children}</div>
      </main>

      {/* Floating AI assistant — available on every dashboard page */}
      <DashboardAI />
    </div>
  );
}
