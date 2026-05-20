"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";
import { Sparkles, Mail, Lock, Building2, ArrowRight } from "lucide-react";

export default function RegisterPage() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleRegister(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");

    try {
      await api.post("/auth/register", { email, password, name });
      router.push("/auth/login?registered=1");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Registration failed");
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex bg-mesh">
      <div className="hidden lg:flex flex-1 relative overflow-hidden bg-gradient-to-br from-brand-600 via-violet-600 to-fuchsia-600">
        <div className="absolute inset-0 bg-grid opacity-10" />
        <div className="relative z-10 p-12 flex flex-col justify-between text-white">
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-xl bg-white/20 backdrop-blur flex items-center justify-center">
              <Sparkles size={20} />
            </div>
            <span className="text-xl font-bold tracking-tight">WebTalk AI</span>
          </div>

          <div>
            <h1 className="text-4xl xl:text-5xl font-extrabold leading-tight mb-4">
              Start building<br />in 60 seconds.
            </h1>
            <p className="text-white/80 text-lg leading-relaxed max-w-md">
              No credit card. Crawl your first website and deploy a working AI agent right away.
            </p>
          </div>

          <p className="text-white/60 text-sm">© WebTalk AI</p>
        </div>
      </div>

      <div className="flex-1 flex items-center justify-center p-6">
        <div className="w-full max-w-md fade-in">
          <div className="lg:hidden flex items-center gap-2.5 mb-8 justify-center">
            <div className="w-10 h-10 rounded-xl bg-gradient-brand flex items-center justify-center">
              <Sparkles size={20} className="text-white" />
            </div>
            <span className="text-xl font-bold">WebTalk AI</span>
          </div>

          <h2 className="text-3xl font-bold text-slate-900 mb-2">Create account</h2>
          <p className="text-slate-500 mb-8">Start deploying AI agents on your site</p>

          <form onSubmit={handleRegister} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wide mb-2">Company name</label>
              <div className="relative">
                <Building2 size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required
                  className="w-full border border-slate-200 rounded-xl pl-10 pr-3.5 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent transition"
                  placeholder="Acme Inc."
                />
              </div>
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wide mb-2">Email</label>
              <div className="relative">
                <Mail size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  className="w-full border border-slate-200 rounded-xl pl-10 pr-3.5 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent transition"
                  placeholder="you@company.com"
                />
              </div>
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wide mb-2">Password</label>
              <div className="relative">
                <Lock size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  minLength={8}
                  className="w-full border border-slate-200 rounded-xl pl-10 pr-3.5 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent transition"
                  placeholder="At least 8 characters"
                />
              </div>
            </div>

            {error && (
              <div className="bg-red-50 border border-red-200 text-red-700 rounded-xl px-4 py-2.5 text-sm">{error}</div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-gradient-brand hover:opacity-90 text-white font-semibold py-3 rounded-xl transition flex items-center justify-center gap-2 disabled:opacity-50 shadow-soft"
            >
              {loading ? "Creating account…" : (<>Create account <ArrowRight size={16} /></>)}
            </button>
          </form>

          <p className="mt-6 text-sm text-center text-slate-500">
            Already have an account?{" "}
            <a href="/auth/login" className="text-brand-600 hover:text-brand-700 font-semibold">Sign in</a>
          </p>
        </div>
      </div>
    </div>
  );
}
