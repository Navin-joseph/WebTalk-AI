"use client";
/**
 * DashboardAI  —  Real-time lip-sync AI assistant widget (dashboard edition)
 *
 * Avatar system (pick one via AVATAR_MODE):
 *   "vrm"   → Three.js + @pixiv/three-vrm  with audio-driven viseme blending
 *             Requires  /public/avatar.vrm   (VRoid Studio export recommended)
 *   "photo" → Static photo + canvas bezier mouth overlay (fallback / legacy)
 *
 * VRM is tried first; if  /avatar.vrm  is missing the component silently
 * falls back to the photo mode so the widget always works.
 */

import { useState, useEffect, useRef, useCallback } from "react";
import { createClient } from "@/lib/supabase";
import {
  Mic, MicOff, X, Send, Volume2, VolumeX, RotateCcw, MessageSquare,
} from "lucide-react";
import { useAudioLipSync, type VisemeFrame } from "@/hooks/useAudioLipSync";
import { VRMAvatarCanvas, type VRMAvatarHandle } from "./VRMAvatarCanvas";

// ── Config ────────────────────────────────────────────────────────────────────

const API_URL    = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";
const AVATAR_URL = "/avatar.jpg";
const VRM_URL    = process.env.NEXT_PUBLIC_AVATAR_VRM_URL ?? "/avatar.vrm";
const NUM_WAVE_BARS = 12;

// ── Types ─────────────────────────────────────────────────────────────────────

interface Message {
  role: "user" | "assistant";
  content: string;
  streaming?: boolean;
}

type AvatarState = "idle" | "thinking" | "listening" | "speaking";

// ── Component ─────────────────────────────────────────────────────────────────

export default function DashboardAI() {
  const [open, setOpen]               = useState(false);
  const [messages, setMessages]       = useState<Message[]>([]);
  const [input, setInput]             = useState("");
  const [streaming, setStreaming]     = useState(false);
  const [listening, setListening]     = useState(false);
  const [speaking, setSpeaking]       = useState(false);
  const [avatarState, setAvatarState] = useState<AvatarState>("idle");
  const [token, setToken]             = useState("");
  const [ttsEnabled, setTtsEnabled]   = useState(true);
  const [useVRM, setUseVRM]           = useState(true);   // flips false if VRM fails to load

  const sessionId      = useRef(`dash_${Date.now()}_${Math.random().toString(36).slice(2)}`);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const recognitionRef = useRef<any>(null);
  const abortRef       = useRef<AbortController | null>(null);
  const inputRef       = useRef<HTMLInputElement>(null);

  // Stable refs (avoid stale closures)
  const tokenRef      = useRef(token);
  const ttsEnabledRef = useRef(ttsEnabled);
  const streamingRef  = useRef(false);

  // TTS sentence-pipeline refs
  const audioRef       = useRef<HTMLAudioElement | null>(null);
  const audioUrlRef    = useRef<string | null>(null);
  const ttsAbortRef    = useRef(false);
  const ttsQRef        = useRef<string[]>([]);
  const ttsRunRef      = useRef(false);
  const ttsPendingRef  = useRef("");

  // Waveform bars
  const waveBarRefs = useRef<(HTMLSpanElement | null)[]>(Array(NUM_WAVE_BARS).fill(null));

  // Photo + canvas fallback (used when VRM is unavailable)
  const mouthCanvasRef = useRef<HTMLCanvasElement>(null);
  const smoothAmpRef   = useRef(0);
  const skinColorRef   = useRef({ r: 188, g: 150, b: 128 });

  // VRM avatar handle
  const vrmRef = useRef<VRMAvatarHandle>(null);

  // Audio lip-sync hook
  const { start: startLipSyncAudio, stop: stopLipSyncAudio } = useAudioLipSync();

  useEffect(() => { tokenRef.current = token; }, [token]);
  useEffect(() => { ttsEnabledRef.current = ttsEnabled; }, [ttsEnabled]);
  useEffect(() => { streamingRef.current = streaming; }, [streaming]);

  // ── Auth ─────────────────────────────────────────────────────────────────────
  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) setToken(data.session.access_token);
    });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_e, session) => {
      if (session) setToken(session.access_token);
    });
    return () => subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (open) {
      setTimeout(() => inputRef.current?.focus(), 100);
      messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [open, messages]);

  // ── Skin colour sampling for canvas fallback ──────────────────────────────────
  const sampleSkinColor = useCallback((el: HTMLImageElement | HTMLVideoElement) => {
    try {
      const W = (el as HTMLImageElement).offsetWidth  || 380;
      const H = (el as HTMLImageElement).offsetHeight || 230;
      const tmp = document.createElement("canvas");
      tmp.width = W; tmp.height = H;
      const tc = tmp.getContext("2d"); if (!tc) return;
      tc.drawImage(el, 0, 0, W, H);
      let r=0, g=0, b=0, n=0;
      for (const [x,y] of [[W*0.31,H*0.64],[W*0.69,H*0.64],[W*0.28,H*0.59],[W*0.72,H*0.59]] as [number,number][]) {
        try { const px=tc.getImageData(~~x,~~y,1,1).data; if(px[3]>80){r+=px[0];g+=px[1];b+=px[2];n++;} } catch { /* CORS */ }
      }
      if (n>0) skinColorRef.current = { r:r/n, g:g/n, b:b/n };
    } catch { /* keep default */ }
  }, []);

  useEffect(() => {
    if (useVRM) return;
    const img = document.getElementById("dash-avatar-img") as HTMLImageElement | null;
    if (!img) return;
    if (img.complete) sampleSkinColor(img);
    else img.addEventListener("load", () => sampleSkinColor(img), { once: true });
  }, [useVRM, sampleSkinColor]);

  // ── Canvas mouth draw (photo fallback) ────────────────────────────────────────
  const drawMouth = useCallback((openAmt: number) => {
    const canvas = mouthCanvasRef.current; if (!canvas) return;
    const ctx = canvas.getContext("2d");   if (!ctx) return;
    const W=canvas.width, H=canvas.height;
    ctx.clearRect(0,0,W,H);
    if (openAmt < 0.02) return;

    const cx=W*0.50, cy=H*0.80, mw=W*0.26, mh=H*0.068;
    const {r,g,b} = skinColorRef.current;
    const gap = openAmt * mh * 4;

    // Skin-tone base (blends over photo lip area)
    const sg = ctx.createRadialGradient(cx,cy,0,cx,cy,mw*0.65);
    sg.addColorStop(0,`rgba(${~~r},${~~g},${~~b},1)`);
    sg.addColorStop(0.6,`rgba(${~~r},${~~g},${~~b},0.9)`);
    sg.addColorStop(1,`rgba(${~~r},${~~g},${~~b},0)`);
    ctx.fillStyle=sg; ctx.beginPath();
    ctx.ellipse(cx,cy,mw*0.65,mh*0.52+gap*0.58,0,0,Math.PI*2); ctx.fill();

    if (gap > 0.5) {
      const mg = ctx.createRadialGradient(cx,cy+gap*0.12,0,cx,cy+gap*0.12,mw*0.44);
      mg.addColorStop(0,"rgba(16,6,6,1)"); mg.addColorStop(0.7,"rgba(32,10,10,0.97)"); mg.addColorStop(1,"rgba(52,16,16,0.18)");
      ctx.fillStyle=mg; ctx.beginPath(); ctx.ellipse(cx,cy+gap*0.12,mw*0.37,gap*0.52+0.5,0,0,Math.PI*2); ctx.fill();
      if (openAmt > 0.22) {
        const tw=mw*0.52, th=Math.min(gap*0.36,mh*0.88), ty=cy-th*0.52;
        const tg=ctx.createLinearGradient(cx,ty,cx,ty+th);
        tg.addColorStop(0,"rgba(253,250,246,0.94)"); tg.addColorStop(1,"rgba(238,232,222,0.86)");
        ctx.fillStyle=tg; ctx.beginPath(); ctx.rect(cx-tw/2,ty,tw,th); ctx.fill();
        ctx.strokeStyle="rgba(195,188,174,0.3)"; ctx.lineWidth=0.7;
        for(let i=1;i<=3;i++){const tx=cx-tw/2+(tw/4)*i;ctx.beginPath();ctx.moveTo(tx,ty+th*0.06);ctx.lineTo(tx,ty+th*0.88);ctx.stroke();}
      }
    }
    const ulr=~~(r*0.70),ulg=~~(g*0.56),ulb=~~(b*0.54);
    const topY=cy-mh*0.5-gap*0.44, ucY=cy-gap*0.38;
    ctx.fillStyle=`rgba(${ulr},${ulg},${ulb},0.94)`;
    ctx.beginPath();
    ctx.moveTo(cx-mw*0.47,ucY+mh*0.1);
    ctx.bezierCurveTo(cx-mw*0.38,ucY-mh*0.06,cx-mw*0.21,topY+mh*0.03,cx-mw*0.09,topY+mh*0.14);
    ctx.bezierCurveTo(cx-mw*0.04,topY+mh*0.2,cx+mw*0.04,topY+mh*0.2,cx+mw*0.09,topY+mh*0.14);
    ctx.bezierCurveTo(cx+mw*0.21,topY+mh*0.03,cx+mw*0.38,ucY-mh*0.06,cx+mw*0.47,ucY+mh*0.1);
    ctx.bezierCurveTo(cx+mw*0.34,ucY+mh*0.22,cx-mw*0.34,ucY+mh*0.22,cx-mw*0.47,ucY+mh*0.1);
    ctx.closePath(); ctx.fill();
    ctx.fillStyle=`rgba(${Math.min(255,ulr+30)},${Math.min(255,ulg+22)},${Math.min(255,ulb+22)},0.30)`;
    ctx.beginPath(); ctx.ellipse(cx,topY+mh*0.22,mw*0.09,mh*0.045,0,0,Math.PI*2); ctx.fill();
    const llr=~~(r*0.74),llg=~~(g*0.60),llb=~~(b*0.58);
    const lcY=cy+gap*0.40, btmY=cy+mh*0.5+gap*0.74;
    ctx.fillStyle=`rgba(${llr},${llg},${llb},0.94)`;
    ctx.beginPath();
    ctx.moveTo(cx-mw*0.47,lcY-mh*0.08);
    ctx.bezierCurveTo(cx-mw*0.41,lcY+mh*0.11,cx-mw*0.19,btmY-mh*0.04,cx,btmY);
    ctx.bezierCurveTo(cx+mw*0.19,btmY-mh*0.04,cx+mw*0.41,lcY+mh*0.11,cx+mw*0.47,lcY-mh*0.08);
    ctx.bezierCurveTo(cx+mw*0.35,lcY-mh*0.13,cx-mw*0.35,lcY-mh*0.13,cx-mw*0.47,lcY-mh*0.08);
    ctx.closePath(); ctx.fill();
    ctx.fillStyle=`rgba(${Math.min(255,llr+45)},${Math.min(255,llg+32)},${Math.min(255,llb+32)},0.36)`;
    ctx.beginPath(); ctx.ellipse(cx,btmY-mh*0.22,mw*0.17,mh*0.065,0,0,Math.PI*2); ctx.fill();
  }, []);

  // ── Waveform bar updater (shared between VRM + photo modes) ──────────────────
  const updateWaveBars = useCallback((bars: number[]) => {
    bars.forEach((h, i) => {
      const bar = waveBarRefs.current[i];
      if (bar) bar.style.height = h + "px";
    });
  }, []);

  // ── Lip sync: handles both VRM visemes and canvas fallback ────────────────────
  const onVisemeFrame = useCallback((frame: VisemeFrame) => {
    updateWaveBars(frame.bars);

    if (useVRM && vrmRef.current) {
      // Apply all 5 viseme weights to the VRM model
      vrmRef.current.setViseme("aa", frame.weights.aa);
      vrmRef.current.setViseme("ih", frame.weights.ih);
      vrmRef.current.setViseme("ou", frame.weights.ou);
      vrmRef.current.setViseme("ee", frame.weights.ee);
      vrmRef.current.setViseme("oh", frame.weights.oh);
    } else {
      // Photo mode: use overall amplitude for canvas mouth
      const mc = mouthCanvasRef.current;
      if (mc && mc.width === 0) {
        const wrap = mc.parentElement;
        if (wrap) { mc.width = wrap.offsetWidth || 380; mc.height = wrap.offsetHeight || 230; }
      }
      smoothAmpRef.current = frame.amplitude;
      drawMouth(Math.min(1, frame.amplitude));
    }
  }, [useVRM, drawMouth, updateWaveBars]);

  // ── Stop lip-sync (both modes) ────────────────────────────────────────────────
  const stopLipSync = useCallback(() => {
    stopLipSyncAudio();
    // Clear VRM visemes
    if (vrmRef.current) {
      for (const name of ["aa","ih","ou","ee","oh"]) vrmRef.current.setViseme(name, 0);
    }
    // Clear canvas
    const mc = mouthCanvasRef.current;
    if (mc) { const c = mc.getContext("2d"); if (c) c.clearRect(0, 0, mc.width, mc.height); }
    // Reset waveform bars
    waveBarRefs.current.forEach(bar => { if (bar) bar.style.height = "3px"; });
    smoothAmpRef.current = 0;
  }, [stopLipSyncAudio]);

  // ── Start lip-sync from an audio element ─────────────────────────────────────
  const startLipSync = useCallback((audioEl: HTMLAudioElement) => {
    stopLipSync();
    startLipSyncAudio(audioEl, onVisemeFrame);
  }, [stopLipSync, startLipSyncAudio, onVisemeFrame]);

  // ── TTS helpers ───────────────────────────────────────────────────────────────
  const fetchAudioUrl = useCallback(async (text: string): Promise<string | null> => {
    const tok = tokenRef.current;
    if (!text.trim() || !tok || ttsAbortRef.current) return null;
    try {
      const r = await fetch(`${API_URL}/api/v1/conversations/tts`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${tok}` },
        body: JSON.stringify({ text }),
      });
      if (!r.ok || ttsAbortRef.current) return null;
      return URL.createObjectURL(await r.blob());
    } catch { return null; }
  }, []);

  const stopTTS = useCallback(() => {
    ttsAbortRef.current   = true;
    ttsQRef.current       = [];
    ttsRunRef.current     = false;
    ttsPendingRef.current = "";
    stopLipSync();
    if (audioRef.current)    { audioRef.current.pause(); audioRef.current = null; }
    if (audioUrlRef.current) { URL.revokeObjectURL(audioUrlRef.current); audioUrlRef.current = null; }
    setSpeaking(false);
    setAvatarState(streamingRef.current ? "thinking" : "idle");
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stopLipSync]);

  const drainTTS = useCallback(async () => {
    if (ttsRunRef.current) return;
    ttsRunRef.current = true;
    let prefetch: Promise<string | null> | null = null;

    while (ttsQRef.current.length > 0 && !ttsAbortRef.current) {
      const text = ttsQRef.current.shift()!;
      const url  = await (prefetch || fetchAudioUrl(text));
      prefetch   = null;
      if (!url || ttsAbortRef.current) continue;

      // Pre-fetch next sentence while current plays
      if (ttsQRef.current.length > 0 && !ttsAbortRef.current)
        prefetch = fetchAudioUrl(ttsQRef.current[0]);

      setSpeaking(true);
      setAvatarState("speaking");
      audioRef.current    = new Audio(url);
      audioUrlRef.current = url;

      await new Promise<void>(resolve => {
        audioRef.current!.oncanplay = () => startLipSync(audioRef.current!);
        audioRef.current!.onended   = () => {
          stopLipSync();
          URL.revokeObjectURL(url);
          audioRef.current = null; audioUrlRef.current = null;
          resolve();
        };
        audioRef.current!.onerror = () => { stopLipSync(); resolve(); };
        audioRef.current!.play().catch(resolve);
      });
    }

    if (prefetch) prefetch.then(u => u && URL.revokeObjectURL(u)).catch(() => {});
    ttsRunRef.current = false;
    if (ttsQRef.current.length === 0) {
      setSpeaking(false);
      setAvatarState(streamingRef.current ? "thinking" : "idle");
    }
  }, [fetchAudioUrl, startLipSync, stopLipSync]);

  const enqueueTTS = useCallback((text: string) => {
    if (!ttsEnabledRef.current || !text.trim()) return;
    ttsAbortRef.current = false;
    ttsQRef.current.push(text.trim());
    drainTTS();
  }, [drainTTS]);

  // ── Chat ──────────────────────────────────────────────────────────────────────
  const sendMessage = useCallback(async (text: string) => {
    if (!text.trim() || !token) return;

    abortRef.current?.abort();
    abortRef.current  = new AbortController();
    stopTTS();
    ttsAbortRef.current   = false;
    ttsPendingRef.current = "";

    if (streamingRef.current) {
      setMessages(prev => {
        const next = [...prev];
        const last = next[next.length - 1];
        if (last?.streaming) {
          if (last.content.trim()) return [...next.slice(0, -1), { ...last, streaming: false }];
          return next.slice(0, -1);
        }
        return next;
      });
      setStreaming(false);
    }

    setMessages(prev => [
      ...prev,
      { role: "user", content: text },
      { role: "assistant", content: "", streaming: true },
    ]);
    setInput("");
    setStreaming(true);
    setAvatarState("thinking");

    let fullAnswer = "";
    const history = messages.map(m => ({ role: m.role, content: m.content }));

    try {
      const res = await fetch(`${API_URL}/api/v1/conversations/assistant/stream`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ message: text, session_id: sessionId.current, history }),
        signal: abortRef.current.signal,
      });
      if (!res.ok || !res.body) throw new Error(`HTTP ${res.status}`);

      const reader  = res.body.getReader();
      const decoder = new TextDecoder();
      let buf = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        const lines = buf.split("\n");
        buf = lines.pop() ?? "";

        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          const raw = line.slice(6).trim();
          if (raw === "[DONE]") break;
          try {
            const evt = JSON.parse(raw);
            if (evt.type === "token" && evt.text) {
              fullAnswer            += evt.text;
              ttsPendingRef.current += evt.text;
              setMessages(prev => {
                const next = [...prev];
                next[next.length - 1] = { role: "assistant", content: fullAnswer, streaming: true };
                return next;
              });
              // Flush at sentence boundary ≥ 6 chars
              let m: RegExpMatchArray | null;
              while ((m = /^([\s\S]{6,}?[.!?])\s+/.exec(ttsPendingRef.current)) !== null) {
                enqueueTTS(m[1]);
                ttsPendingRef.current = ttsPendingRef.current.slice(m[0].length);
              }
              // Force-flush long fragments at word boundary
              if (ttsPendingRef.current.length > 50) {
                const cut = ttsPendingRef.current.lastIndexOf(" ", 42);
                if (cut > 10) { enqueueTTS(ttsPendingRef.current.slice(0, cut)); ttsPendingRef.current = ttsPendingRef.current.slice(cut + 1); }
              }
            } else if (evt.type === "done") {
              fullAnswer = evt.answer || fullAnswer;
            }
          } catch { /* ignore parse errors */ }
        }
      }
    } catch (err: unknown) {
      if (err instanceof Error && err.name === "AbortError") return;
      fullAnswer = fullAnswer || "Sorry, something went wrong. Please try again.";
    } finally {
      const final = fullAnswer || "I couldn't generate a response. Please try again.";
      setMessages(prev => {
        const next = [...prev];
        next[next.length - 1] = { role: "assistant", content: final, streaming: false };
        return next;
      });
      setStreaming(false);
      if (ttsPendingRef.current.trim()) {
        enqueueTTS(ttsPendingRef.current.trim());
        ttsPendingRef.current = "";
      }
      if (ttsQRef.current.length === 0 && !ttsRunRef.current) {
        setAvatarState("idle");
      }
    }
  }, [token, messages, stopTTS, enqueueTTS]);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (input.trim()) sendMessage(input);
  }

  function startVoice() {
    if (listening) {
      recognitionRef.current?.stop();
      setListening(false);
      setAvatarState(streamingRef.current ? "thinking" : "idle");
      return;
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const w = window as any;
    const SR = w.SpeechRecognition ?? w.webkitSpeechRecognition;
    if (!SR) { alert("Speech recognition requires Chrome or Edge."); return; }

    // Instant visual feedback before browser permission dialog
    setListening(true);
    setAvatarState("listening");

    const recognition = new SR();
    recognition.continuous = false; recognition.interimResults = false; recognition.lang = "en-US";
    recognition.onstart  = () => { setListening(true); setAvatarState("listening"); };
    recognition.onend    = () => { setListening(false); setAvatarState(streamingRef.current ? "thinking" : "idle"); };
    recognition.onerror  = () => { setListening(false); setAvatarState("idle"); };
    recognition.onresult = (e: { results: { [k: number]: { [k: number]: { transcript: string } } } }) => {
      const t = e.results[0]?.[0]?.transcript;
      if (t) sendMessage(t);
    };
    recognitionRef.current = recognition;
    try { recognition.start(); } catch { setListening(false); setAvatarState("idle"); }
  }

  function clearChat() {
    abortRef.current?.abort();
    stopTTS();
    setMessages([]);
    sessionId.current = `dash_${Date.now()}_${Math.random().toString(36).slice(2)}`;
    setStreaming(false);
    setAvatarState("idle");
  }

  const statusLabel = speaking ? "Speaking…" : listening ? "Listening…" : streaming ? "Thinking…" : "Ask about your AI agent";

  // ── Render ────────────────────────────────────────────────────────────────────
  return (
    <div className="fixed bottom-6 right-6 z-50 flex flex-col items-end gap-3 pointer-events-none">

      {open && (
        <div
          className="pointer-events-auto w-[380px] rounded-3xl shadow-2xl border border-white/60 flex flex-col overflow-hidden"
          style={{ height: 600, background: "rgba(255,255,255,0.97)", backdropFilter: "blur(24px)", WebkitBackdropFilter: "blur(24px)" }}
        >
          {/* ── Avatar header ── */}
          <div className="relative flex-shrink-0 overflow-hidden" style={{ height: 230, background: "#111827" }}>

            {/* VRM Three.js canvas */}
            {useVRM && (
              <VRMAvatarCanvas
                ref={vrmRef}
                vrmUrl={VRM_URL}
                width={380}
                height={230}
                avatarState={avatarState}
                onLoaded={() => setUseVRM(true)}
                onFallback={() => setUseVRM(false)}
                className="absolute inset-0"
                style={{ zIndex: 1 }}
              />
            )}

            {/* Photo + canvas mouth (shown when VRM unavailable) */}
            {!useVRM && (
              <>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  id="dash-avatar-img"
                  src={AVATAR_URL} alt="AI Assistant" draggable={false}
                  crossOrigin="anonymous"
                  onLoad={e => sampleSkinColor(e.currentTarget)}
                  className="absolute inset-0 w-full h-full object-cover"
                  style={{
                    objectPosition: "center 8%",
                    animation: avatarState === "speaking"
                      ? "dash-speak-bob 0.42s ease-in-out infinite alternate"
                      : avatarState === "listening"
                        ? "dash-listen-pulse 1.2s ease-in-out infinite"
                        : "dash-breathe 5s ease-in-out infinite",
                    zIndex: 1,
                  }}
                />
                <canvas ref={mouthCanvasRef} width={0} height={0}
                  className="absolute inset-0 pointer-events-none"
                  style={{ width:"100%", height:"100%", zIndex:3 }} />
                {/* Eye blink overlays */}
                <div className="absolute pointer-events-none" style={{ width:"22%",height:"11%",left:"24%",top:"28%",borderRadius:"0 0 55% 55%/0 0 80% 80%",background:"linear-gradient(to bottom,rgba(18,12,8,0.02) 0%,rgba(18,12,8,0.9) 55%,rgba(18,12,8,0.88) 100%)",transform:"scaleY(0)",transformOrigin:"top center",zIndex:5,animation:"dash-blink 4.5s ease-in-out infinite" }} />
                <div className="absolute pointer-events-none" style={{ width:"22%",height:"11%",left:"54%",top:"28%",borderRadius:"0 0 55% 55%/0 0 80% 80%",background:"linear-gradient(to bottom,rgba(18,12,8,0.02) 0%,rgba(18,12,8,0.9) 55%,rgba(18,12,8,0.88) 100%)",transform:"scaleY(0)",transformOrigin:"top center",zIndex:5,animation:"dash-blink 5.4s ease-in-out infinite" }} />
              </>
            )}

            {/* State glow border */}
            <div className="absolute inset-0 pointer-events-none transition-all duration-300" style={{
              zIndex: 10,
              border: "3px solid transparent",
              ...(avatarState === "thinking"  ? { borderColor:"rgba(59,130,246,.55)",  boxShadow:"inset 0 0 30px rgba(59,130,246,.25)" } : {}),
              ...(avatarState === "listening" ? { borderColor:"rgba(16,185,129,.6)",   boxShadow:"inset 0 0 30px rgba(16,185,129,.25)" } : {}),
              ...(avatarState === "speaking"  ? { borderColor:"rgba(124,58,237,.75)",  boxShadow:"inset 0 0 30px rgba(124,58,237,.3), 0 0 0 2px rgba(124,58,237,.4)" } : {}),
            }} />

            {/* Top bar */}
            <div className="absolute top-0 left-0 right-0 flex items-start justify-between px-3 pt-2.5 pb-8"
              style={{ background:"linear-gradient(to bottom,rgba(0,0,0,.65),transparent)", zIndex:11 }}>
              <div>
                <p className="text-sm font-bold text-white leading-tight" style={{ textShadow:"0 1px 4px rgba(0,0,0,.5)" }}>Dashboard Assistant</p>
                <p className="text-[10.5px] text-white/75">AI Assistant · Real-time lip-sync</p>
              </div>
              <div className="flex items-center gap-1">
                {speaking && (
                  <button onClick={stopTTS} title="Stop speaking"
                    className="w-7 h-7 rounded-lg flex items-center justify-center text-white/85 hover:bg-black/40 transition"
                    style={{ background:"rgba(0,0,0,.3)",backdropFilter:"blur(4px)" }}>
                    <VolumeX size={13} />
                  </button>
                )}
                <button onClick={() => { setTtsEnabled(v => !v); if (speaking) stopTTS(); }} title={ttsEnabled ? "Mute" : "Unmute"}
                  className="w-7 h-7 rounded-lg flex items-center justify-center text-white/85 hover:bg-black/40 transition"
                  style={{ background:"rgba(0,0,0,.3)",backdropFilter:"blur(4px)" }}>
                  {ttsEnabled ? <Volume2 size={13} /> : <VolumeX size={13} />}
                </button>
                {messages.length > 0 && (
                  <button onClick={clearChat} title="Clear"
                    className="w-7 h-7 rounded-lg flex items-center justify-center text-white/85 hover:bg-black/40 transition"
                    style={{ background:"rgba(0,0,0,.3)",backdropFilter:"blur(4px)" }}>
                    <RotateCcw size={12} />
                  </button>
                )}
                <button onClick={() => setOpen(false)}
                  className="w-7 h-7 rounded-lg flex items-center justify-center text-white/85 hover:bg-black/40 transition"
                  style={{ background:"rgba(0,0,0,.3)",backdropFilter:"blur(4px)" }}>
                  <X size={13} />
                </button>
              </div>
            </div>

            {/* Bottom bar — status + waveform + mic */}
            <div className="absolute bottom-0 left-0 right-0 flex items-end gap-2 px-3 pb-2.5 pt-8"
              style={{ background:"linear-gradient(to top,rgba(0,0,0,.65),transparent)", zIndex:11 }}>
              <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full flex-shrink-0"
                style={{ background:"rgba(0,0,0,.4)",backdropFilter:"blur(4px)" }}>
                <span className="w-2 h-2 rounded-full flex-shrink-0 transition-all duration-300" style={{
                  background: avatarState==="thinking" ? "#60a5fa" : avatarState==="listening" ? "#34d399" : avatarState==="speaking" ? "#e879f9" : "#64748b",
                  animation: avatarState !== "idle" ? "dash-dot-pulse 0.7s ease-in-out infinite" : "none",
                }} />
                <span className="text-[10.5px] font-semibold text-white/90 whitespace-nowrap">{statusLabel}</span>
              </div>
              <div className="flex items-end gap-[2.5px] h-6 flex-1 transition-opacity duration-300"
                style={{ opacity: avatarState==="speaking" || avatarState==="listening" ? 1 : 0 }}>
                {Array.from({ length: NUM_WAVE_BARS }, (_, i) => (
                  <span key={i} ref={el => { waveBarRefs.current[i] = el; }}
                    className="flex-shrink-0 rounded-sm"
                    style={{ width:3, height:3, background:"rgba(255,255,255,.85)", transition:"height 0.04s linear" }} />
                ))}
              </div>
              <button onClick={startVoice} title={listening ? "Stop" : "Voice input"}
                className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 text-white transition"
                style={{
                  background: listening ? "rgba(239,68,68,.5)" : "rgba(255,255,255,.15)",
                  backdropFilter:"blur(4px)",
                  animation: listening ? "dash-dot-pulse 1.2s ease-in-out infinite" : "none",
                }}>
                {listening ? <MicOff size={14} /> : <Mic size={14} />}
              </button>
            </div>
          </div>

          {/* Messages */}
          <div className="flex-1 overflow-y-auto p-4 space-y-3">
            {messages.length === 0 && (
              <div className="h-full flex items-center justify-center">
                <div className="text-center px-4">
                  <p className="text-sm font-semibold text-slate-700 mb-1">Your AI Agent Assistant</p>
                  <p className="text-xs text-slate-400 leading-relaxed mb-4">Ask about training status, conversation quality, API setup, or how to improve your agent.</p>
                  <div className="flex flex-col gap-2">
                    {["How do I train my AI on a new site?","Why isn't my widget responding?","How do I embed the widget?"].map(q => (
                      <button key={q} onClick={() => sendMessage(q)}
                        className="text-xs text-left px-3 py-2 rounded-xl bg-slate-50 hover:bg-violet-50 hover:text-violet-700 text-slate-500 border border-slate-100 hover:border-violet-200 transition">{q}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )}
            {messages.map((m, i) => (
              <div key={i} className={`flex ${m.role==="user" ? "justify-end" : "justify-start"}`}>
                <div
                  className={`max-w-[86%] px-3.5 py-2.5 rounded-2xl text-sm leading-relaxed ${m.role==="user" ? "text-white rounded-br-sm" : "bg-slate-100 text-slate-700 rounded-bl-sm"}`}
                  style={m.role==="user" ? { background:"linear-gradient(135deg,#7c3aed,#a855f7)" } : {}}
                >
                  {m.content || (m.streaming && (
                    <span className="flex gap-1 items-center h-4 py-0.5">
                      {[0,150,300].map(d => <span key={d} className="w-1.5 h-1.5 rounded-full bg-slate-400 animate-bounce" style={{ animationDelay:`${d}ms` }} />)}
                    </span>
                  ))}
                  {m.streaming && m.content && <span className="inline-block w-0.5 h-3.5 bg-slate-400 ml-0.5 animate-pulse align-middle" />}
                </div>
              </div>
            ))}
            <div ref={messagesEndRef} />
          </div>

          {/* Input */}
          <div className="p-3 border-t border-slate-100 flex-shrink-0">
            <form onSubmit={handleSubmit} className="flex items-center gap-2 bg-slate-50 rounded-2xl px-3 py-1.5 border border-slate-200 focus-within:border-violet-300 focus-within:ring-2 focus-within:ring-violet-100 transition">
              <input
                ref={inputRef} type="text" value={input}
                onChange={e => setInput(e.target.value)}
                placeholder={listening ? "Listening…" : streaming && !input ? "Responding… (type to interrupt)" : "Type or speak…"}
                className="flex-1 bg-transparent text-sm text-slate-700 placeholder:text-slate-400 focus:outline-none py-1 min-w-0"
              />
              <button
                type="button" onClick={startVoice}
                title={listening ? "Stop listening" : "Voice input"}
                className="p-1.5 rounded-xl flex-shrink-0 transition-all"
                style={{
                  background: listening ? "#fee2e2" : "#f1f5f9",
                  color: listening ? "#ef4444" : "#94a3b8",
                  animation: listening ? "dash-dot-pulse 1.2s ease-in-out infinite" : "none",
                }}>
                {listening ? <MicOff size={15} /> : <Mic size={15} />}
              </button>
              {streaming && !input.trim() ? (
                <button type="button" onClick={() => {
                  abortRef.current?.abort(); stopTTS();
                  setMessages(prev => {
                    const next = [...prev];
                    const last = next[next.length - 1];
                    if (last?.streaming) {
                      if (last.content.trim()) return [...next.slice(0,-1),{...last,streaming:false}];
                      return next.slice(0,-1);
                    }
                    return next;
                  });
                  setStreaming(false); setAvatarState("idle");
                }}
                  className="p-1.5 rounded-xl flex-shrink-0 text-white hover:opacity-90 transition shadow-sm"
                  style={{ background:"linear-gradient(135deg,#ef4444,#dc2626)" }} title="Stop response">
                  <X size={15} />
                </button>
              ) : (
                <button type="submit" disabled={!input.trim()}
                  className="p-1.5 rounded-xl flex-shrink-0 text-white disabled:opacity-40 hover:opacity-90 transition shadow-sm"
                  style={{ background:"linear-gradient(135deg,#7c3aed,#a855f7)" }}
                  title="Send">
                  <Send size={15} />
                </button>
              )}
            </form>
            <p className="text-[10px] text-slate-400 text-center mt-1.5">
              Powered by WebTalk AI{messages.length > 0 && ` · ${Math.ceil(messages.length/2)} turn${messages.length>2?"s":""}`}
            </p>
          </div>
        </div>
      )}

      {/* Launch button */}
      <button
        onClick={() => setOpen(v => !v)}
        className="pointer-events-auto w-14 h-14 rounded-2xl shadow-xl flex items-center justify-center transition-all duration-200 hover:scale-105 active:scale-95"
        style={{
          background: open ? "#334155" : "linear-gradient(135deg,#7c3aed,#a855f7)",
          boxShadow:  open ? "0 10px 25px rgba(0,0,0,.2)" : "0 10px 30px rgba(124,58,237,.4)",
        }}
        title="Dashboard AI Assistant"
      >
        {open ? <X size={20} className="text-white" /> : (
          <div className="relative">
            <MessageSquare size={20} className="text-white" />
            {(speaking||listening||streaming) && (
              <span className="absolute -top-1.5 -right-1.5 w-3 h-3 rounded-full bg-emerald-400 border-2 border-white" />
            )}
          </div>
        )}
      </button>

      <style>{`
        @keyframes dash-breathe      { 0%,100%{transform:scale(1) translateY(0)} 50%{transform:scale(1.009) translateY(-1.5px)} }
        @keyframes dash-speak-bob    { from{transform:scale(1.001) translateY(0) rotate(0deg)} to{transform:scale(1.014) translateY(-3px) rotate(0.22deg)} }
        @keyframes dash-listen-pulse { 0%,100%{transform:scale(1)} 50%{transform:scale(1.005)} }
        @keyframes dash-dot-pulse    { 0%,100%{transform:scale(1)} 50%{transform:scale(1.5)} }
        @keyframes dash-blink        { 0%,93%,100%{transform:scaleY(0)} 95.5%,96.5%{transform:scaleY(1)} 97%{transform:scaleY(0.08)} 98.5%{transform:scaleY(0.92)} }
      `}</style>
    </div>
  );
}
