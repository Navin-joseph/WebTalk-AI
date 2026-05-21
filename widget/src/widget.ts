/**
 * WebTalk AI Widget v2.2.0 — premium conversational AI assistant.
 *
 *   <script src="https://web-talk-ai.vercel.app/widget.js?v=2.2.0"></script>
 *   <script>
 *     WebTalkAI.init({
 *       apiKey: "wtk_...",
 *       position: "bottom-right",
 *       theme: "purple",
 *       voiceEnabled: true,
 *       ttsAutoPlay: true
 *     });
 *   </script>
 *
 * Architecture:
 *   - Text chat:  REST  POST /api/v1/widget/chat   (one-shot JSON)
 *   - Voice chat: WS    /ws/voice/<client_id>      (continuous w/ VAD)
 *   - TTS audio:  REST  POST /api/v1/widget/tts    (ElevenLabs or browser fallback)
 *
 * Voice mode behaves like ChatGPT Voice / Gemini Live:
 *   1. User taps mic once → enters continuous conversation mode
 *   2. VAD (Voice Activity Detection) auto-detects when user starts/stops talking
 *   3. After 1500ms of silence, audio is sent
 *   4. AI responds via voice
 *   5. Listening auto-resumes after AI finishes speaking
 *   6. User taps X to exit
 */

const VERSION = "2.2.0";
const DEFAULT_API_URL = "https://webtalk-ai.onrender.com";
const DEFAULT_WS_URL  = "wss://webtalk-ai.onrender.com";

// VAD tuning
const VAD_SAMPLE_RATE_HZ = 50;       // poll mic level 50x/sec
const VAD_SILENCE_MS = 1500;         // silence duration before sending
const VAD_MIN_SPEECH_MS = 300;       // ignore blips shorter than this
const VAD_VOLUME_THRESHOLD = 0.018;  // RMS threshold to count as speech

console.log(
  "%c[WebTalkAI v" + VERSION + "] %cText = REST · Voice = continuous (VAD)",
  "background:linear-gradient(135deg,#6366f1,#a855f7);color:#fff;padding:2px 8px;border-radius:4px;font-weight:bold",
  "color:#6b7280"
);

// ─────────────────── Types ───────────────────

interface Theme { primary: string; accent: string; }

const THEMES: Record<string, Theme> = {
  purple: { primary: "#6366f1", accent: "#a855f7" },
  blue:   { primary: "#3b82f6", accent: "#06b6d4" },
  green:  { primary: "#10b981", accent: "#84cc16" },
  dark:   { primary: "#1f2937", accent: "#6366f1" },
};

interface InitOpts {
  apiKey: string;
  position?: "bottom-right" | "bottom-left";
  theme?: keyof typeof THEMES;
  greeting?: string;
  voiceEnabled?: boolean;
  ttsAutoPlay?: boolean;
  apiUrl?: string;
  wsUrl?: string;
}

interface Config {
  apiKey: string;
  apiUrl: string;
  wsUrl: string;
  position: "bottom-right" | "bottom-left";
  theme: Theme;
  greeting: string;
  voiceEnabled: boolean;
  ttsAutoPlay: boolean;
}

interface BootData {
  client_id: string;
  company_name: string;
  voice_enabled: boolean;
}

interface Msg {
  role: "user" | "assistant";
  content: string;
  sources?: string[];
  error?: boolean;
  streaming?: boolean;
}

type VoiceState = "idle" | "listening" | "thinking" | "speaking" | "error";

// ─────────────────── State ───────────────────

let cfg!: Config;
let boot: BootData | null = null;
let messages: Msg[] = [];
let sessionId: string;
let isOpen = false;
let isStreaming = false;
let voiceMode = false;
let voiceState: VoiceState = "idle";

// Voice subsystem
let vWs: WebSocket | null = null;
let vAudioCtx: AudioContext | null = null;
let vAnalyser: AnalyserNode | null = null;
let vMicStream: MediaStream | null = null;
let vMediaRecorder: MediaRecorder | null = null;
let vVadRafId: number | null = null;
let vSpeechStarted = false;
let vSpeechStartTime = 0;
let vLastSpeechTime = 0;
let vCurrentRmsLevel = 0;
let vIncomingAudioChunks: Uint8Array[] = [];
let vCurrentBufferSource: AudioBufferSourceNode | null = null;
let vWaveformRafId: number | null = null;
let vIsSpeaking = false;  // AI is currently speaking
let vShouldClose = false;

// DOM refs
let launcherEl: HTMLButtonElement;
let panelEl: HTMLDivElement;
let messagesEl: HTMLDivElement;
let inputEl: HTMLInputElement;
let micBtn: HTMLButtonElement;
let sendBtn: HTMLButtonElement;
let suggestionsEl: HTMLDivElement;
let voicePanelEl: HTMLDivElement;
let orbEl: HTMLDivElement;
let voiceStatusEl: HTMLDivElement;
let voiceCaptionEl: HTMLDivElement;
let waveformCanvas: HTMLCanvasElement | null = null;

// Server-TTS cache
let serverTTSAvailable: boolean | null = null;

// ─────────────────── Helpers ───────────────────

function getOrCreateSession(): string {
  try {
    const k = "wtai_session_v2";
    let s = localStorage.getItem(k);
    if (!s) {
      s = "s_" + Math.random().toString(36).slice(2, 11) + "_" + Date.now();
      localStorage.setItem(k, s);
    }
    return s;
  } catch { return "s_" + Date.now(); }
}

function esc(s: string): string {
  const d = document.createElement("div");
  d.textContent = s;
  return d.innerHTML;
}

function shortUrl(url: string): string {
  try {
    const u = new URL(url);
    const path = u.pathname.length > 18 ? u.pathname.slice(0, 18) + "…" : u.pathname;
    return u.hostname.replace(/^www\./, "") + (path === "/" ? "" : path);
  } catch { return url.slice(0, 30); }
}

// ─────────────────── Styles ───────────────────

function injectStyles() {
  const t = cfg.theme;
  const pos = cfg.position === "bottom-right" ? "right" : "left";

  const css = `
.wtai-w * { box-sizing: border-box; font-family: -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif; }

/* Launcher button */
.wtai-launcher { position: fixed; ${pos}: 24px; bottom: 24px; z-index: 2147483646; width: 64px; height: 64px; border-radius: 50%; background: linear-gradient(135deg,${t.primary},${t.accent}); border: none; cursor: pointer; box-shadow: 0 10px 32px ${t.primary}55, 0 4px 12px rgba(0,0,0,.15); display: flex; align-items: center; justify-content: center; transition: transform .2s; }
.wtai-launcher::before { content:""; position: absolute; inset: -4px; border-radius: 50%; background: linear-gradient(135deg,${t.primary},${t.accent}); opacity: .35; filter: blur(8px); z-index: -1; animation: wtai-launcher-glow 3s ease-in-out infinite; }
@keyframes wtai-launcher-glow { 0%,100% { transform: scale(1); opacity: .35; } 50% { transform: scale(1.1); opacity: .55; } }
.wtai-launcher:hover { transform: scale(1.08); }
.wtai-launcher svg { width: 28px; height: 28px; fill: #fff; }

/* Main panel */
.wtai-panel { position: fixed; ${pos}: 24px; bottom: 100px; z-index: 2147483647; width: 400px; max-width: calc(100vw - 32px); height: 620px; max-height: calc(100vh - 130px); background: rgba(255,255,255,.96); backdrop-filter: blur(16px); -webkit-backdrop-filter: blur(16px); border-radius: 22px; box-shadow: 0 24px 70px rgba(15,23,42,.25), 0 4px 14px rgba(15,23,42,.08); display: none; flex-direction: column; overflow: hidden; border: 1px solid rgba(255,255,255,.6); }
.wtai-panel.open { display: flex; animation: wtai-fade .3s cubic-bezier(.16,1,.3,1); }
@keyframes wtai-fade { from { opacity: 0; transform: translateY(14px) scale(.96); } to { opacity: 1; transform: translateY(0) scale(1); } }

/* Header */
.wtai-head { background: linear-gradient(135deg,${t.primary},${t.accent}); color: #fff; padding: 16px 18px; display: flex; align-items: center; gap: 12px; position: relative; overflow: hidden; }
.wtai-head::before { content:""; position:absolute; inset:0; background-image: radial-gradient(circle at 20% 30%, rgba(255,255,255,.18), transparent 40%), radial-gradient(circle at 80% 70%, rgba(255,255,255,.12), transparent 40%); }
.wtai-head > * { position: relative; z-index: 1; }
.wtai-avatar { width: 36px; height: 36px; border-radius: 50%; background: rgba(255,255,255,.22); backdrop-filter: blur(4px); display: flex; align-items: center; justify-content: center; flex-shrink: 0; }
.wtai-avatar svg { width: 18px; height: 18px; fill: #fff; }
.wtai-name { font-weight: 600; font-size: 14px; }
.wtai-status { font-size: 11px; opacity: .9; margin-top: 2px; display: flex; align-items: center; gap: 5px; }
.wtai-status::before { content: ""; width: 6px; height: 6px; border-radius: 50%; background: #34d399; box-shadow: 0 0 6px #34d399; animation: wtai-pulse 2s ease-in-out infinite; }
@keyframes wtai-pulse { 0%,100% { opacity: 1; } 50% { opacity: .4; } }
.wtai-close { background: none; border: none; color: #fff; opacity: .85; cursor: pointer; padding: 4px; }
.wtai-close:hover { opacity: 1; }
.wtai-close svg { width: 18px; height: 18px; fill: #fff; }

/* Messages */
.wtai-msgs { flex: 1; overflow-y: auto; padding: 16px; background: linear-gradient(180deg, #fafbfc 0%, #f5f7fa 100%); }
.wtai-msgs::-webkit-scrollbar { width: 6px; }
.wtai-msgs::-webkit-scrollbar-thumb { background: #d1d5db; border-radius: 3px; }
.wtai-msg { display: flex; gap: 8px; margin-bottom: 12px; }
.wtai-msg.user { justify-content: flex-end; }
.wtai-mbot { width: 28px; height: 28px; border-radius: 50%; background: linear-gradient(135deg,${t.primary},${t.accent}); display: flex; align-items: center; justify-content: center; flex-shrink: 0; box-shadow: 0 2px 6px ${t.primary}33; }
.wtai-mbot svg { width: 14px; height: 14px; fill: #fff; }
.wtai-mbot.err { background: #fbbf24; }
.wtai-bub { max-width: 75%; padding: 10px 14px; border-radius: 16px; font-size: 14px; line-height: 1.5; word-wrap: break-word; white-space: pre-wrap; }
.wtai-msg.user .wtai-bub { background: linear-gradient(135deg,${t.primary},${t.accent}); color: #fff; border-bottom-right-radius: 4px; box-shadow: 0 2px 6px ${t.primary}33; }
.wtai-msg.assistant .wtai-bub { background: #fff; border: 1px solid #e5e7eb; color: #1f2937; border-bottom-left-radius: 4px; }
.wtai-msg.assistant.err .wtai-bub { background: #fef3c7; border-color: #fcd34d; color: #92400e; }
.wtai-caret { display: inline-block; width: 7px; height: 14px; background: #9ca3af; margin-left: 2px; vertical-align: text-bottom; animation: wtai-blink 1s infinite; }
@keyframes wtai-blink { 0%, 50% { opacity: 1; } 51%, 100% { opacity: 0; } }
.wtai-srcs { display: flex; flex-wrap: wrap; gap: 4px; margin-top: 6px; }
.wtai-src { font-size: 10px; color: #6b7280; background: #fff; border: 1px solid #e5e7eb; border-radius: 4px; padding: 2px 6px; text-decoration: none; transition: all .15s; }
.wtai-src:hover { color: ${t.primary}; border-color: ${t.primary}; }
.wtai-typing { display: inline-flex; gap: 3px; align-items: center; padding: 12px 14px; }
.wtai-typing span { width: 6px; height: 6px; border-radius: 50%; background: #9ca3af; animation: wtai-bnce 1.4s ease-in-out infinite; }
.wtai-typing span:nth-child(2) { animation-delay: .15s; }
.wtai-typing span:nth-child(3) { animation-delay: .3s; }
@keyframes wtai-bnce { 0%,80%,100% { transform: scale(.6); opacity: .5; } 40% { transform: scale(1); opacity: 1; } }

/* Suggestions */
.wtai-sugs { padding: 0 12px 8px; display: flex; flex-wrap: wrap; gap: 5px; }
.wtai-sug { font-size: 12px; padding: 6px 10px; border-radius: 14px; background: #fff; border: 1px solid #e5e7eb; color: #4b5563; cursor: pointer; transition: all .15s; }
.wtai-sug:hover { background: #f9fafb; border-color: ${t.primary}; color: ${t.primary}; }

/* Input row */
.wtai-row { padding: 12px; background: #fff; border-top: 1px solid #e5e7eb; display: flex; gap: 8px; align-items: center; }
.wtai-in { flex: 1; border: 1px solid #e5e7eb; border-radius: 22px; padding: 10px 16px; font-size: 14px; outline: none; transition: border-color .15s, box-shadow .15s; background: #fafafa; }
.wtai-in:focus { border-color: ${t.primary}; background: #fff; box-shadow: 0 0 0 3px ${t.primary}1a; }
.wtai-in:disabled { opacity: .6; }
.wtai-btn { width: 40px; height: 40px; border-radius: 50%; border: none; cursor: pointer; display: flex; align-items: center; justify-content: center; flex-shrink: 0; transition: all .15s; }
.wtai-mic { background: #f3f4f6; color: #4b5563; }
.wtai-mic:hover { background: #e5e7eb; transform: scale(1.05); }
.wtai-mic svg { width: 16px; height: 16px; fill: currentColor; }
.wtai-send { background: linear-gradient(135deg,${t.primary},${t.accent}); color: #fff; box-shadow: 0 2px 8px ${t.primary}55; }
.wtai-send:hover:not(:disabled) { transform: scale(1.05); }
.wtai-send:disabled { opacity: .4; cursor: not-allowed; }
.wtai-send svg { width: 15px; height: 15px; fill: #fff; }
.wtai-foot { text-align: center; padding: 6px; font-size: 10px; color: #9ca3af; background: #fff; }
.wtai-foot a { color: ${t.primary}; text-decoration: none; }

/* ──────────── Voice mode (full panel takeover) ──────────── */
.wtai-voice { position: absolute; inset: 0; z-index: 5; background: linear-gradient(160deg, ${t.primary} 0%, ${t.accent} 100%); color: #fff; display: none; flex-direction: column; align-items: center; justify-content: space-between; padding: 24px 20px; text-align: center; overflow: hidden; }
.wtai-voice.active { display: flex; animation: wtai-vfade .35s cubic-bezier(.16,1,.3,1); }
@keyframes wtai-vfade { from { opacity: 0; } to { opacity: 1; } }

.wtai-voice::before, .wtai-voice::after {
  content:""; position:absolute; width: 360px; height: 360px; border-radius:50%; filter: blur(60px); opacity: .35; z-index:0;
}
.wtai-voice::before { background: ${t.primary}; top: -100px; left: -120px; animation: wtai-blob 12s ease-in-out infinite alternate; }
.wtai-voice::after  { background: ${t.accent};  bottom: -100px; right: -120px; animation: wtai-blob 12s ease-in-out infinite alternate-reverse; }
@keyframes wtai-blob { 0% { transform: translate(0,0); } 100% { transform: translate(40px,40px); } }

.wtai-voice-top { width: 100%; display: flex; justify-content: space-between; align-items: center; position: relative; z-index: 1; }
.wtai-voice-title { font-weight: 600; font-size: 14px; opacity: .95; }
.wtai-voice-x { background: rgba(255,255,255,.18); border: none; color: #fff; width: 32px; height: 32px; border-radius: 50%; cursor: pointer; display: flex; align-items: center; justify-content: center; backdrop-filter: blur(6px); transition: background .15s; }
.wtai-voice-x:hover { background: rgba(255,255,255,.3); }
.wtai-voice-x svg { width: 16px; height: 16px; fill: #fff; }

.wtai-voice-center { display: flex; flex-direction: column; align-items: center; gap: 28px; position: relative; z-index: 1; }

/* ──── The AI orb ──── */
.wtai-orb { width: 200px; height: 200px; position: relative; display: flex; align-items: center; justify-content: center; }
.wtai-orb-core {
  width: 130px; height: 130px; border-radius: 50%;
  background: radial-gradient(circle at 30% 30%, rgba(255,255,255,.9), rgba(255,255,255,.5) 25%, rgba(255,255,255,.15) 50%, transparent 70%);
  box-shadow: inset 0 0 40px rgba(255,255,255,.5), 0 0 60px rgba(255,255,255,.5);
  position: relative; z-index: 2;
  animation: wtai-orb-idle 4s ease-in-out infinite;
}
@keyframes wtai-orb-idle {
  0%, 100% { transform: scale(1);   box-shadow: inset 0 0 40px rgba(255,255,255,.5), 0 0 60px rgba(255,255,255,.5); }
  50%      { transform: scale(1.06); box-shadow: inset 0 0 50px rgba(255,255,255,.7), 0 0 80px rgba(255,255,255,.7); }
}

/* Listening: pulsing rings + reactive scale */
.wtai-orb.listening .wtai-orb-core {
  animation: wtai-orb-listen 1.4s ease-in-out infinite;
  background: radial-gradient(circle at 30% 30%, rgba(255,255,255,.95), rgba(255,255,255,.55) 25%, rgba(255,255,255,.18) 50%, transparent 70%);
}
@keyframes wtai-orb-listen {
  0%,100% { transform: scale(1);     box-shadow: inset 0 0 40px rgba(255,255,255,.6), 0 0 80px rgba(255,255,255,.7); }
  50%     { transform: scale(1.1);   box-shadow: inset 0 0 60px rgba(255,255,255,.8), 0 0 120px rgba(255,255,255,.9); }
}
.wtai-orb.listening::before,
.wtai-orb.listening::after {
  content:""; position: absolute; inset: 30px; border-radius: 50%;
  border: 2px solid rgba(255,255,255,.55);
  animation: wtai-ring 1.8s ease-out infinite;
}
.wtai-orb.listening::after { animation-delay: .9s; }
@keyframes wtai-ring { 0% { transform: scale(.6); opacity: 1; } 100% { transform: scale(1.6); opacity: 0; } }

/* Thinking: rotating conic gradient */
.wtai-orb.thinking .wtai-orb-core {
  background: conic-gradient(from 0deg, rgba(255,255,255,.95) 0deg, rgba(255,255,255,.2) 60deg, rgba(255,255,255,.95) 180deg, rgba(255,255,255,.2) 240deg, rgba(255,255,255,.95) 360deg);
  animation: wtai-orb-think 2s linear infinite;
  filter: blur(.5px);
}
@keyframes wtai-orb-think { from { transform: rotate(0); } to { transform: rotate(360deg); } }

/* Speaking: audio-reactive waves */
.wtai-orb.speaking .wtai-orb-core {
  animation: wtai-orb-speak 1s ease-in-out infinite;
  background: radial-gradient(circle at 30% 30%, rgba(255,255,255,1), rgba(255,255,255,.65) 25%, rgba(255,255,255,.2) 50%, transparent 70%);
}
@keyframes wtai-orb-speak {
  0%,100% { transform: scale(1);     box-shadow: inset 0 0 50px rgba(255,255,255,.7), 0 0 100px rgba(255,255,255,.8); }
  25%     { transform: scale(1.12);  }
  50%     { transform: scale(.96);   box-shadow: inset 0 0 60px rgba(255,255,255,.9), 0 0 140px rgba(255,255,255,1); }
  75%     { transform: scale(1.08);  }
}
.wtai-orb.speaking::before {
  content:""; position: absolute; inset: 0; border-radius: 50%;
  border: 1.5px solid rgba(255,255,255,.5);
  animation: wtai-speak-ring 1s ease-in-out infinite;
}
@keyframes wtai-speak-ring { 0%,100% { transform: scale(.95); opacity: .6; } 50% { transform: scale(1.05); opacity: 1; } }

/* Error */
.wtai-orb.error .wtai-orb-core {
  background: radial-gradient(circle, #fca5a5, #ef4444);
  animation: wtai-orb-err .6s ease-in-out 3;
}
@keyframes wtai-orb-err { 0%,100% { transform: translateX(0); } 25% { transform: translateX(-6px); } 75% { transform: translateX(6px); } }

/* Status + caption */
.wtai-vstat { font-size: 20px; font-weight: 700; letter-spacing: -.01em; }
.wtai-vcap { font-size: 13px; opacity: .85; max-width: 280px; min-height: 38px; }

/* Waveform canvas */
.wtai-wave { width: 200px; height: 36px; opacity: .9; }

/* Bottom controls */
.wtai-voice-bot { width: 100%; display: flex; justify-content: center; gap: 12px; position: relative; z-index: 1; }
.wtai-vbtn { padding: 11px 22px; border-radius: 999px; background: rgba(255,255,255,.18); border: 1px solid rgba(255,255,255,.3); color: #fff; font-size: 13px; font-weight: 600; cursor: pointer; transition: all .15s; backdrop-filter: blur(8px); }
.wtai-vbtn:hover { background: rgba(255,255,255,.3); transform: translateY(-1px); }
.wtai-vbtn.danger { background: rgba(239,68,68,.85); border-color: rgba(239,68,68,.95); }
.wtai-vbtn.danger:hover { background: rgba(239,68,68,1); }

/* Mobile */
@media (max-width: 480px) {
  .wtai-panel { right: 8px; left: 8px; bottom: 8px; width: auto; max-width: none; height: calc(100vh - 90px); }
  .wtai-launcher { right: 16px; bottom: 16px; width: 56px; height: 56px; }
  .wtai-orb { width: 160px; height: 160px; }
  .wtai-orb-core { width: 110px; height: 110px; }
}
  `.trim();

  const s = document.createElement("style");
  s.id = "wtai-styles";
  s.textContent = css;
  document.head.appendChild(s);
}

// ─────────────────── DOM ───────────────────

function buildDom() {
  // Launcher
  launcherEl = document.createElement("button");
  launcherEl.className = "wtai-w wtai-launcher";
  launcherEl.setAttribute("aria-label", "Open AI assistant");
  launcherEl.innerHTML = `<svg viewBox="0 0 24 24"><path d="M12 2C6.48 2 2 6.48 2 12c0 1.86.5 3.6 1.38 5.1L2 22l4.9-1.38C8.4 21.5 10.14 22 12 22c5.52 0 10-4.48 10-10S17.52 2 12 2zm0 18c-1.65 0-3.27-.45-4.7-1.3l-.34-.2-3.04.86.85-3.03-.21-.34C3.45 14.27 3 12.65 3 11c0-4.97 4.03-9 9-9s9 4.03 9 9-4.03 9-9 9z"/><circle cx="8" cy="12" r="1.4"/><circle cx="12" cy="12" r="1.4"/><circle cx="16" cy="12" r="1.4"/></svg>`;
  launcherEl.onclick = togglePanel;
  document.body.appendChild(launcherEl);

  // Panel
  panelEl = document.createElement("div");
  panelEl.className = "wtai-w wtai-panel";
  panelEl.innerHTML = `
    <div class="wtai-head">
      <div class="wtai-avatar"><svg viewBox="0 0 24 24"><path d="M12 2L13.09 8.26L19 7L17.74 13.09L24 12L17.74 10.91L19 17L13.09 15.74L12 22L10.91 15.74L5 17L6.26 10.91L0 12L6.26 13.09L5 7L10.91 8.26L12 2Z"/></svg></div>
      <div style="flex:1;min-width:0;">
        <div class="wtai-name">${esc(boot?.company_name || "AI Assistant")}</div>
        <div class="wtai-status">Trained on this site</div>
      </div>
      <button class="wtai-close" aria-label="Close"><svg viewBox="0 0 24 24"><path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/></svg></button>
    </div>
    <div class="wtai-msgs"></div>
    <div class="wtai-sugs"></div>
    <div class="wtai-row">
      <input type="text" class="wtai-in" placeholder="Ask anything…" autocomplete="off" />
      ${cfg.voiceEnabled ? `<button class="wtai-btn wtai-mic" aria-label="Voice conversation" title="Start voice conversation"><svg viewBox="0 0 24 24"><path d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3zm5.3-3c0 3-2.54 5.1-5.3 5.1S6.7 14 6.7 11H5c0 3.41 2.72 6.23 6 6.72V21h2v-3.28c3.28-.49 6-3.31 6-6.72h-1.7z"/></svg></button>` : ``}
      <button class="wtai-btn wtai-send" aria-label="Send"><svg viewBox="0 0 24 24"><path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z"/></svg></button>
    </div>
    <div class="wtai-foot">Powered by <a href="https://web-talk-ai.vercel.app" target="_blank" rel="noopener">WebTalk AI</a></div>

    <div class="wtai-voice">
      <div class="wtai-voice-top">
        <div class="wtai-voice-title">${esc(boot?.company_name || "AI Assistant")}</div>
        <button class="wtai-voice-x" aria-label="End conversation"><svg viewBox="0 0 24 24"><path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/></svg></button>
      </div>
      <div class="wtai-voice-center">
        <div class="wtai-orb idle">
          <div class="wtai-orb-core"></div>
        </div>
        <canvas class="wtai-wave" width="400" height="72"></canvas>
        <div>
          <div class="wtai-vstat">Tap to start</div>
          <div class="wtai-vcap">Have a natural conversation with the AI. It listens and responds in real time.</div>
        </div>
      </div>
      <div class="wtai-voice-bot">
        <button class="wtai-vbtn" data-act="start">Start Conversation</button>
        <button class="wtai-vbtn danger" data-act="end" style="display:none">End</button>
      </div>
    </div>
  `;
  document.body.appendChild(panelEl);

  // Cache refs
  messagesEl     = panelEl.querySelector(".wtai-msgs") as HTMLDivElement;
  inputEl        = panelEl.querySelector(".wtai-in") as HTMLInputElement;
  sendBtn        = panelEl.querySelector(".wtai-send") as HTMLButtonElement;
  micBtn         = panelEl.querySelector(".wtai-mic") as HTMLButtonElement;
  suggestionsEl  = panelEl.querySelector(".wtai-sugs") as HTMLDivElement;
  voicePanelEl   = panelEl.querySelector(".wtai-voice") as HTMLDivElement;
  orbEl          = panelEl.querySelector(".wtai-orb") as HTMLDivElement;
  voiceStatusEl  = panelEl.querySelector(".wtai-vstat") as HTMLDivElement;
  voiceCaptionEl = panelEl.querySelector(".wtai-vcap") as HTMLDivElement;
  waveformCanvas = panelEl.querySelector(".wtai-wave") as HTMLCanvasElement;

  // Listeners
  (panelEl.querySelector(".wtai-close") as HTMLButtonElement).onclick = togglePanel;
  sendBtn.onclick = () => sendText();
  inputEl.addEventListener("keydown", (e) => { if (e.key === "Enter" && !isStreaming) sendText(); });
  if (micBtn) micBtn.onclick = enterVoiceMode;

  (panelEl.querySelector('[data-act="start"]') as HTMLButtonElement).onclick = startVoiceConversation;
  (panelEl.querySelector('[data-act="end"]')   as HTMLButtonElement).onclick = endVoiceConversation;
  (panelEl.querySelector(".wtai-voice-x")      as HTMLButtonElement).onclick = exitVoiceMode;
}

function togglePanel() {
  isOpen = !isOpen;
  panelEl.classList.toggle("open", isOpen);
  if (isOpen) {
    inputEl.focus();
    setTimeout(() => messagesEl.scrollTo({ top: messagesEl.scrollHeight, behavior: "smooth" }), 50);
  } else if (voiceMode) {
    exitVoiceMode();
  }
}

// ─────────────────── Rendering ───────────────────

function renderMessages() {
  messagesEl.innerHTML = messages.map(m => {
    const botSvg = `<svg viewBox="0 0 24 24"><path d="M20 9V7c0-1.1-.9-2-2-2h-3c0-1.66-1.34-3-3-3S9 3.34 9 5H6c-1.1 0-2 .9-2 2v2c-1.66 0-3 1.34-3 3s1.34 3 3 3v4c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2v-4c1.66 0 3-1.34 3-3s-1.34-3-3-3zM7.5 11.5c0-.83.67-1.5 1.5-1.5s1.5.67 1.5 1.5S9.83 13 9 13s-1.5-.67-1.5-1.5zM16 17H8v-2h8v2zm-1-4c-.83 0-1.5-.67-1.5-1.5S14.17 10 15 10s1.5.67 1.5 1.5S15.83 13 15 13z"/></svg>`;
    const errSvg = `<svg viewBox="0 0 24 24"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z"/></svg>`;
    const sourcesHtml = m.sources && m.sources.length && !m.streaming
      ? `<div class="wtai-srcs">${m.sources.slice(0, 4).map(s => `<a class="wtai-src" href="${esc(s)}" target="_blank" rel="noopener">${esc(shortUrl(s))}</a>`).join("")}</div>`
      : ``;
    if (m.role === "user") {
      return `<div class="wtai-msg user"><div class="wtai-bub">${esc(m.content)}</div></div>`;
    }
    const klass = m.error ? "wtai-msg assistant err" : "wtai-msg assistant";
    const botClass = m.error ? "wtai-mbot err" : "wtai-mbot";
    const cursor = m.streaming && m.content ? `<span class="wtai-caret"></span>` : ``;
    const inner = m.streaming && !m.content
      ? `<div class="wtai-typing"><span></span><span></span><span></span></div>`
      : `${esc(m.content)}${cursor}`;
    return `<div class="${klass}">
      <div class="${botClass}">${m.error ? errSvg : botSvg}</div>
      <div style="max-width:75%"><div class="wtai-bub">${inner}</div>${sourcesHtml}</div>
    </div>`;
  }).join("");
  messagesEl.scrollTo({ top: messagesEl.scrollHeight, behavior: "smooth" });
}

function renderSuggestions() {
  if (messages.length > 1 || isStreaming) { suggestionsEl.innerHTML = ""; return; }
  const suggestions = ["What is this site about?", "What do you offer?", "How can I get in touch?"];
  suggestionsEl.innerHTML = suggestions.map(s => `<button class="wtai-sug">${esc(s)}</button>`).join("");
  suggestionsEl.querySelectorAll(".wtai-sug").forEach((b, i) => {
    (b as HTMLButtonElement).onclick = () => sendText(suggestions[i]);
  });
}

// ─────────────────── Text chat (REST) ───────────────────

async function sendText(textOverride?: string) {
  const text = (textOverride ?? inputEl.value).trim();
  if (!text || isStreaming) return;

  inputEl.value = "";
  messages.push({ role: "user", content: text });
  messages.push({ role: "assistant", content: "", streaming: true });
  isStreaming = true;
  sendBtn.disabled = true;
  inputEl.disabled = true;
  renderMessages();
  renderSuggestions();

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 60_000);

  try {
    const res = await fetch(`${cfg.apiUrl}/api/v1/widget/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-API-Key": cfg.apiKey },
      body: JSON.stringify({ api_key: cfg.apiKey, message: text, conversation_id: sessionId }),
      signal: controller.signal,
    });
    clearTimeout(timeoutId);

    if (!res.ok) {
      let bodyText = "";
      try { bodyText = await res.text(); } catch {}
      console.error("[WebTalkAI] HTTP", res.status, bodyText);
      throw new Error(res.status === 401 ? "Invalid API key" : res.status >= 500 ? "The AI is having trouble. Please try again." : `Server returned ${res.status}.`);
    }

    const data = await res.json();
    const answer: string = data.response || data.answer || "I couldn't generate a response. Please try again.";
    const sources: string[] = data.sources || [];

    const last = messages[messages.length - 1];
    if (last) { last.content = answer; last.sources = sources; last.streaming = false; }
    renderMessages();

    if (cfg.ttsAutoPlay && answer) playTTS(answer).catch(() => {});
  } catch (err) {
    clearTimeout(timeoutId);
    let msg = "Something went wrong.";
    if (err instanceof DOMException && err.name === "AbortError") msg = "The AI is starting up — please wait a moment and try again.";
    else if (err instanceof TypeError && err.message === "Failed to fetch") msg = "Couldn't reach the server.";
    else if (err instanceof Error) msg = err.message;

    const last = messages[messages.length - 1];
    if (last && last.streaming) { last.content = msg; last.streaming = false; last.error = true; }
    else messages.push({ role: "assistant", content: msg, error: true });
    renderMessages();
  } finally {
    isStreaming = false;
    sendBtn.disabled = false;
    inputEl.disabled = false;
    inputEl.focus();
  }
}

// ─────────────────── Audio context (shared) ───────────────────

function getAudioContext(): AudioContext {
  if (!vAudioCtx) {
    const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    vAudioCtx = new Ctx();
  }
  return vAudioCtx;
}

function stopCurrentAudio() {
  if (vCurrentBufferSource) {
    try { vCurrentBufferSource.stop(); } catch {}
    vCurrentBufferSource = null;
  }
}

async function playAudioBuffer(buffer: ArrayBuffer): Promise<void> {
  if (buffer.byteLength === 0) return;
  stopCurrentAudio();
  const ctx = getAudioContext();
  if (ctx.state === "suspended") await ctx.resume();
  const audioBuffer = await ctx.decodeAudioData(buffer.slice(0));
  const source = ctx.createBufferSource();
  source.buffer = audioBuffer;
  source.connect(ctx.destination);
  return new Promise<void>((resolve) => {
    source.onended = () => { if (vCurrentBufferSource === source) vCurrentBufferSource = null; resolve(); };
    vCurrentBufferSource = source;
    source.start(0);
  });
}

// ─────────────────── TTS (server → browser fallback) ───────────────────

async function playTTS(text: string): Promise<void> {
  if (serverTTSAvailable !== false) {
    try {
      const res = await fetch(`${cfg.apiUrl}/api/v1/widget/tts`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-API-Key": cfg.apiKey },
        body: JSON.stringify({ text }),
      });
      if (res.ok) {
        const buffer = await res.arrayBuffer();
        if (buffer.byteLength > 0) {
          serverTTSAvailable = true;
          await playAudioBuffer(buffer);
          return;
        }
      }
      serverTTSAvailable = false;
      console.warn("[WebTalkAI] Server TTS unavailable, falling back to browser voice");
    } catch (e) {
      serverTTSAvailable = false;
      console.warn("[WebTalkAI] Server TTS error:", e);
    }
  }
  await speakWithBrowser(text);
}

function speakWithBrowser(text: string): Promise<void> {
  return new Promise((resolve) => {
    if (!("speechSynthesis" in window)) return resolve();
    window.speechSynthesis.cancel();
    let spoken = false;
    const speak = () => {
      if (spoken) return; spoken = true;
      const utter = new SpeechSynthesisUtterance(text);
      utter.rate = 1.0; utter.pitch = 1.0; utter.volume = 1.0;
      const voices = window.speechSynthesis.getVoices();
      const preferred = voices.find((v) => /Google US English|Samantha|Karen|Daniel|Microsoft.*Natural/i.test(v.name))
        || voices.find((v) => v.lang && v.lang.toLowerCase().startsWith("en"));
      if (preferred) utter.voice = preferred;
      utter.onend = () => resolve();
      utter.onerror = () => resolve();
      window.speechSynthesis.speak(utter);
    };
    if (window.speechSynthesis.getVoices().length === 0) {
      window.speechSynthesis.onvoiceschanged = () => { window.speechSynthesis.onvoiceschanged = null; speak(); };
      setTimeout(speak, 250);
    } else { speak(); }
  });
}

// ─────────────────── Voice state machine ───────────────────

function setVoiceState(s: VoiceState, status?: string, caption?: string) {
  voiceState = s;
  orbEl.classList.remove("idle", "listening", "thinking", "speaking", "error");
  orbEl.classList.add(s);
  if (status) voiceStatusEl.textContent = status;
  if (caption !== undefined) voiceCaptionEl.textContent = caption;
  console.log("[WebTalkAI] state →", s);
}

function enterVoiceMode() {
  if (!cfg.voiceEnabled || !boot) return;
  voiceMode = true;
  voicePanelEl.classList.add("active");
  setVoiceState("idle", "Tap to start", "Have a natural conversation with the AI. It listens and responds in real time.");
  // Show "Start" button, hide "End"
  (panelEl.querySelector('[data-act="start"]') as HTMLButtonElement).style.display = "inline-block";
  (panelEl.querySelector('[data-act="end"]')   as HTMLButtonElement).style.display = "none";
}

function exitVoiceMode() {
  endVoiceConversation();
  voicePanelEl.classList.remove("active");
  voiceMode = false;
}

// ─────────────────── Continuous voice conversation ───────────────────

async function startVoiceConversation() {
  vShouldClose = false;
  setVoiceState("listening", "Connecting…", "Setting up secure voice channel.");

  // Show End button
  (panelEl.querySelector('[data-act="start"]') as HTMLButtonElement).style.display = "none";
  (panelEl.querySelector('[data-act="end"]')   as HTMLButtonElement).style.display = "inline-block";

  // Mic permission
  try {
    vMicStream = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
    });
  } catch (e) {
    setVoiceState("error", "Microphone blocked", "Please allow microphone access in your browser settings.");
    return;
  }

  // WebSocket
  const url = `${cfg.wsUrl}/ws/voice/${boot!.client_id}?session_id=${encodeURIComponent(sessionId)}&api_key=${encodeURIComponent(cfg.apiKey)}`;
  try { vWs = new WebSocket(url); }
  catch (e) { setVoiceState("error", "Connection failed", "Couldn't connect to the AI."); return; }

  vWs.onopen = () => {
    setVoiceState("listening", "Listening…", "Speak naturally. I'll respond when you pause.");
    startVadLoop();
    startMediaRecorder();
    startWaveformDraw();
  };

  vWs.onmessage = handleWsMessage;
  vWs.onerror = () => setVoiceState("error", "Connection error", "Voice connection lost. Try again.");
  vWs.onclose = () => { if (!vShouldClose) setVoiceState("idle", "Disconnected", ""); };
}

function endVoiceConversation() {
  vShouldClose = true;
  if (vVadRafId) cancelAnimationFrame(vVadRafId);
  if (vWaveformRafId) cancelAnimationFrame(vWaveformRafId);
  vVadRafId = null;
  vWaveformRafId = null;
  if (vMediaRecorder && vMediaRecorder.state !== "inactive") { try { vMediaRecorder.stop(); } catch {} }
  vMediaRecorder = null;
  if (vMicStream) { vMicStream.getTracks().forEach(t => t.stop()); vMicStream = null; }
  if (vAnalyser) { try { vAnalyser.disconnect(); } catch {} vAnalyser = null; }
  if (vWs) { try { vWs.close(); } catch {} vWs = null; }
  stopCurrentAudio();
  vSpeechStarted = false;
  vIsSpeaking = false;
  vIncomingAudioChunks.length = 0;
  setVoiceState("idle", "Tap to start", "Have a natural conversation with the AI. It listens and responds in real time.");
  (panelEl.querySelector('[data-act="start"]') as HTMLButtonElement).style.display = "inline-block";
  (panelEl.querySelector('[data-act="end"]')   as HTMLButtonElement).style.display = "none";
}

function startMediaRecorder() {
  if (!vMicStream) return;
  try {
    vMediaRecorder = new MediaRecorder(vMicStream, { mimeType: "audio/webm" });
  } catch (e) {
    console.error("[WebTalkAI] MediaRecorder failed:", e);
    return;
  }
  vMediaRecorder.ondataavailable = (e) => {
    if (!vWs || vWs.readyState !== WebSocket.OPEN || e.data.size === 0) return;
    // Only send audio chunks while user is speaking (not while AI is speaking)
    if (vIsSpeaking) return;
    const reader = new FileReader();
    reader.onload = () => {
      const b64 = (reader.result as string).split(",")[1];
      try { vWs!.send(JSON.stringify({ type: "audio_chunk", data: b64 })); } catch {}
    };
    reader.readAsDataURL(e.data);
  };
  vMediaRecorder.start(250); // 250ms chunks
}

// ─── VAD loop using AnalyserNode RMS ───
function startVadLoop() {
  if (!vMicStream) return;
  const ctx = getAudioContext();
  if (ctx.state === "suspended") ctx.resume();
  const src = ctx.createMediaStreamSource(vMicStream);
  vAnalyser = ctx.createAnalyser();
  vAnalyser.fftSize = 512;
  vAnalyser.smoothingTimeConstant = 0.3;
  src.connect(vAnalyser);
  const data = new Uint8Array(vAnalyser.fftSize);
  let lastTick = 0;
  const intervalMs = 1000 / VAD_SAMPLE_RATE_HZ;

  const tick = (ts: number) => {
    if (!vAnalyser || vShouldClose) return;
    if (ts - lastTick < intervalMs) { vVadRafId = requestAnimationFrame(tick); return; }
    lastTick = ts;

    vAnalyser.getByteTimeDomainData(data);
    // RMS calculation
    let sum = 0;
    for (let i = 0; i < data.length; i++) {
      const v = (data[i] - 128) / 128;
      sum += v * v;
    }
    const rms = Math.sqrt(sum / data.length);
    vCurrentRmsLevel = rms;

    // VAD logic — only when actively listening
    if (voiceState === "listening" && !vIsSpeaking) {
      if (rms > VAD_VOLUME_THRESHOLD) {
        if (!vSpeechStarted) {
          vSpeechStarted = true;
          vSpeechStartTime = ts;
        }
        vLastSpeechTime = ts;
      } else if (vSpeechStarted) {
        const silenceMs = ts - vLastSpeechTime;
        if (silenceMs > VAD_SILENCE_MS) {
          const speechMs = vLastSpeechTime - vSpeechStartTime;
          if (speechMs > VAD_MIN_SPEECH_MS) {
            // User finished speaking — send to backend
            sendEndOfSpeech();
          } else {
            // Too short, ignore
            vSpeechStarted = false;
          }
        }
      }
    }

    vVadRafId = requestAnimationFrame(tick);
  };
  vVadRafId = requestAnimationFrame(tick);
}

function sendEndOfSpeech() {
  vSpeechStarted = false;
  vIsSpeaking = true; // block further chunk sending until AI replies
  setVoiceState("thinking", "Thinking…", "Looking that up in my knowledge base.");
  if (vWs && vWs.readyState === WebSocket.OPEN) {
    try { vWs.send(JSON.stringify({ type: "audio_end" })); } catch {}
  }
}

// ─── Incoming server messages ───
async function handleWsMessage(e: MessageEvent) {
  const msg = JSON.parse(e.data);
  if (msg.type === "transcript" && msg.text) {
    messages.push({ role: "user", content: msg.text });
    renderMessages();
    voiceCaptionEl.textContent = `You: ${msg.text}`;
  } else if (msg.type === "answer_text") {
    messages.push({ role: "assistant", content: msg.text });
    renderMessages();
    setVoiceState("speaking", "Speaking…", msg.text.slice(0, 120));
  } else if (msg.type === "audio_chunk") {
    const bin = atob(msg.data);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    vIncomingAudioChunks.push(bytes);
  } else if (msg.type === "audio_end") {
    const total = vIncomingAudioChunks.reduce((acc, c) => acc + c.length, 0);
    if (total > 0) {
      const buf = new Uint8Array(total);
      let pos = 0;
      for (const c of vIncomingAudioChunks) { buf.set(c, pos); pos += c.length; }
      vIncomingAudioChunks.length = 0;
      try {
        await playAudioBuffer(buf.buffer as ArrayBuffer);
      } catch (e) {
        console.warn("[WebTalkAI] Audio playback failed:", e);
      }
    } else {
      // No server audio — try browser TTS using last answer
      const last = [...messages].reverse().find(m => m.role === "assistant" && !m.error);
      if (last?.content) {
        try { await speakWithBrowser(last.content); } catch {}
      }
    }
    // Done speaking — resume listening
    vIsSpeaking = false;
    if (!vShouldClose) {
      setVoiceState("listening", "Listening…", "Speak naturally. I'll respond when you pause.");
    }
  } else if (msg.type === "error") {
    setVoiceState("error", "Error", msg.message || "Something went wrong.");
    setTimeout(() => {
      if (!vShouldClose) {
        vIsSpeaking = false;
        setVoiceState("listening", "Listening…", "Speak naturally.");
      }
    }, 1800);
  }
}

// ─── Waveform visualization (audio-reactive) ───
function startWaveformDraw() {
  if (!waveformCanvas) return;
  const canvas = waveformCanvas;
  const ctx2d = canvas.getContext("2d");
  if (!ctx2d) return;
  vCanvasCtx = ctx2d;
  const W = canvas.width;
  const H = canvas.height;

  const draw = () => {
    if (vShouldClose) return;
    ctx2d.clearRect(0, 0, W, H);

    // Pick a level depending on state
    let level = 0;
    if (voiceState === "listening" || voiceState === "speaking") {
      level = Math.min(1, vCurrentRmsLevel * 8); // input mic level
    }
    // For "speaking" state, simulate AI voice waveform with sine + jitter
    if (voiceState === "speaking") {
      const t = Date.now() / 120;
      level = Math.max(level, 0.45 + 0.35 * Math.abs(Math.sin(t)));
    }

    // Draw N bars
    const N = 32;
    const barW = W / N - 2;
    for (let i = 0; i < N; i++) {
      const phase = (i / N) * Math.PI * 2;
      const wave = 0.5 + 0.5 * Math.sin(Date.now() / 200 + phase * 2);
      const h = (level * H * 0.9 * (0.4 + wave * 0.6));
      const y = (H - h) / 2;
      ctx2d.fillStyle = `rgba(255,255,255,${0.45 + wave * 0.4})`;
      ctx2d.fillRect(i * (W / N) + 1, y, barW, Math.max(2, h));
    }

    vWaveformRafId = requestAnimationFrame(draw);
  };
  draw();
}

let vCanvasCtx: CanvasRenderingContext2D | null = null;

// ─────────────────── Init / Public API ───────────────────

async function init(opts: InitOpts) {
  if (!opts || !opts.apiKey) { console.error("[WebTalkAI] apiKey is required"); return; }
  if (document.getElementById("wtai-styles")) { console.warn("[WebTalkAI] Already initialized"); return; }

  const themeKey: keyof typeof THEMES = (opts.theme && THEMES[opts.theme]) ? opts.theme : "purple";
  cfg = {
    apiKey: opts.apiKey,
    apiUrl: opts.apiUrl || DEFAULT_API_URL,
    wsUrl:  opts.wsUrl  || DEFAULT_WS_URL,
    position: opts.position === "bottom-left" ? "bottom-left" : "bottom-right",
    theme: THEMES[themeKey],
    greeting: opts.greeting || "Hi! How can I help you today?",
    voiceEnabled: opts.voiceEnabled !== false,
    ttsAutoPlay: opts.ttsAutoPlay === true,
  };

  sessionId = getOrCreateSession();

  console.log("[WebTalkAI] init v" + VERSION, {
    apiUrl: cfg.apiUrl, wsUrl: cfg.wsUrl, theme: opts.theme || "purple",
    position: cfg.position, voiceEnabled: cfg.voiceEnabled, sessionId,
  });

  const t0 = performance.now();
  try {
    const res = await fetch(`${cfg.apiUrl}/api/v1/widget/config?api_key=${encodeURIComponent(cfg.apiKey)}`);
    const dt = Math.round(performance.now() - t0);
    if (!res.ok) {
      console.error(`[WebTalkAI] Bootstrap failed: HTTP ${res.status} after ${dt}ms. Check API key and ${cfg.apiUrl}.`);
      return;
    }
    boot = await res.json();
    console.log("[WebTalkAI] connected in", dt, "ms — tenant:", boot?.company_name);
  } catch (e) {
    console.error("[WebTalkAI] Bootstrap failed (network):", e);
    return;
  }

  injectStyles();
  buildDom();

  messages = [{ role: "assistant", content: cfg.greeting }];
  renderMessages();
  renderSuggestions();
}

(window as unknown as { WebTalkAI: object }).WebTalkAI = {
  init,
  open: () => { if (!isOpen) togglePanel(); },
  close: () => { if (isOpen) togglePanel(); },
  startVoice: () => { if (!isOpen) togglePanel(); if (!voiceMode) enterVoiceMode(); },
  version: VERSION,
};
