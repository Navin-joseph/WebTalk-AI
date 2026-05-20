/**
 * WebTalk AI Widget — embeddable AI assistant for any website.
 *
 *   <script src="https://web-talk-ai.vercel.app/widget.js"></script>
 *   <script>
 *     WebTalkAI.init({
 *       apiKey: "wtk_...",
 *       position: "bottom-right",   // optional, "bottom-right" | "bottom-left"
 *       theme: "purple",            // optional, "purple" | "blue" | "green" | "dark"
 *       greeting: "Hi!",            // optional
 *       voiceEnabled: true,         // optional
 *       ttsAutoPlay: false          // optional — speak typed answers too
 *     });
 *   </script>
 */

const VERSION = "2.1.0";
const DEFAULT_API_URL = "https://webtalk-ai.onrender.com";
const DEFAULT_WS_URL  = "wss://webtalk-ai.onrender.com";

// Loud, unmissable startup banner. If you don't see this in DevTools console,
// your browser is serving a CACHED old widget.js — hard-refresh (Ctrl+Shift+R).
console.log(
  "%c[WebTalkAI v" + VERSION + "] %cText = REST · Voice = WebSocket (mic only)",
  "background:#6366f1;color:#fff;padding:2px 6px;border-radius:3px;font-weight:bold",
  "color:#6b7280"
);

// ────────────────────────── Types ──────────────────────────

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

// ────────────────────────── State ──────────────────────────

let cfg!: Config;
let boot: BootData | null = null;
let messages: Msg[] = [];
let sessionId: string;
let isOpen = false;
let isStreaming = false;

// Voice state
let ws: WebSocket | null = null;
let mediaRecorder: MediaRecorder | null = null;
let micStream: MediaStream | null = null;
let voiceCancelled = false;

// Audio playback state (AudioContext API — more reliable than <audio>+Blob)
let audioContext: AudioContext | null = null;
let currentAudioSource: AudioBufferSourceNode | null = null;

// DOM
let launcherEl: HTMLButtonElement;
let panelEl: HTMLDivElement;
let messagesEl: HTMLDivElement;
let inputEl: HTMLInputElement;
let micBtn: HTMLButtonElement;
let sendBtn: HTMLButtonElement;
let suggestionsEl: HTMLDivElement;
let voiceOverlayEl: HTMLDivElement;
let voiceStatusEl: HTMLDivElement;

// ────────────────────────── Helpers ──────────────────────────

function getOrCreateSession(): string {
  try {
    const k = "wtai_session_v2";
    let s = localStorage.getItem(k);
    if (!s) {
      s = `s_${Math.random().toString(36).slice(2, 11)}_${Date.now()}`;
      localStorage.setItem(k, s);
    }
    return s;
  } catch {
    return `s_${Date.now()}`;
  }
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
  } catch {
    return url.slice(0, 30);
  }
}

// ────────────────────────── Styles ──────────────────────────

function injectStyles() {
  const t = cfg.theme;
  const pos = cfg.position === "bottom-right" ? "right" : "left";

  const css = `
.wtai-w * { box-sizing: border-box; font-family: -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif; }
.wtai-launcher { position: fixed; ${pos}: 24px; bottom: 24px; z-index: 2147483646; width: 60px; height: 60px; border-radius: 50%; background: linear-gradient(135deg,${t.primary},${t.accent}); border: none; cursor: pointer; box-shadow: 0 8px 24px rgba(0,0,0,0.18); display: flex; align-items: center; justify-content: center; transition: transform .2s; }
.wtai-launcher:hover { transform: scale(1.08); }
.wtai-launcher svg { width: 26px; height: 26px; fill: #fff; }
.wtai-panel { position: fixed; ${pos}: 24px; bottom: 100px; z-index: 2147483647; width: 380px; max-width: calc(100vw - 32px); height: 580px; max-height: calc(100vh - 130px); background: #fff; border-radius: 18px; box-shadow: 0 20px 60px rgba(0,0,0,0.25); display: none; flex-direction: column; overflow: hidden; }
.wtai-panel.open { display: flex; animation: wtai-fade .25s ease; }
@keyframes wtai-fade { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } }
.wtai-head { background: linear-gradient(135deg,${t.primary},${t.accent}); color: #fff; padding: 16px 18px; display: flex; align-items: center; gap: 12px; }
.wtai-avatar { width: 36px; height: 36px; border-radius: 50%; background: rgba(255,255,255,.2); display: flex; align-items: center; justify-content: center; flex-shrink: 0; }
.wtai-avatar svg { width: 18px; height: 18px; fill: #fff; }
.wtai-name { font-weight: 600; font-size: 14px; }
.wtai-status { font-size: 11px; opacity: .85; margin-top: 2px; display: flex; align-items: center; gap: 5px; }
.wtai-status::before { content: ""; width: 6px; height: 6px; border-radius: 50%; background: #34d399; animation: wtai-pulse 2s ease-in-out infinite; }
@keyframes wtai-pulse { 0%,100% { opacity: 1; } 50% { opacity: .4; } }
.wtai-close { background: none; border: none; color: #fff; opacity: .85; cursor: pointer; padding: 4px; }
.wtai-close:hover { opacity: 1; }
.wtai-close svg { width: 18px; height: 18px; fill: #fff; }
.wtai-msgs { flex: 1; overflow-y: auto; padding: 16px; background: #fafafa; }
.wtai-msgs::-webkit-scrollbar { width: 6px; }
.wtai-msgs::-webkit-scrollbar-thumb { background: #d1d5db; border-radius: 3px; }
.wtai-msg { display: flex; gap: 8px; margin-bottom: 12px; }
.wtai-msg.user { justify-content: flex-end; }
.wtai-mbot { width: 28px; height: 28px; border-radius: 50%; background: linear-gradient(135deg,${t.primary},${t.accent}); display: flex; align-items: center; justify-content: center; flex-shrink: 0; }
.wtai-mbot svg { width: 14px; height: 14px; fill: #fff; }
.wtai-mbot.err { background: #fbbf24; }
.wtai-bub { max-width: 75%; padding: 10px 14px; border-radius: 16px; font-size: 14px; line-height: 1.5; word-wrap: break-word; white-space: pre-wrap; }
.wtai-msg.user .wtai-bub { background: linear-gradient(135deg,${t.primary},${t.accent}); color: #fff; border-bottom-right-radius: 4px; }
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
.wtai-sugs { padding: 0 12px 8px; display: flex; flex-wrap: wrap; gap: 5px; }
.wtai-sug { font-size: 12px; padding: 6px 10px; border-radius: 14px; background: #fff; border: 1px solid #e5e7eb; color: #4b5563; cursor: pointer; transition: all .15s; }
.wtai-sug:hover { background: #f9fafb; border-color: ${t.primary}; color: ${t.primary}; }
.wtai-row { padding: 12px; background: #fff; border-top: 1px solid #e5e7eb; display: flex; gap: 8px; align-items: center; }
.wtai-in { flex: 1; border: 1px solid #e5e7eb; border-radius: 22px; padding: 10px 16px; font-size: 14px; outline: none; transition: border-color .15s; }
.wtai-in:focus { border-color: ${t.primary}; }
.wtai-in:disabled { opacity: .6; }
.wtai-btn { width: 40px; height: 40px; border-radius: 50%; border: none; cursor: pointer; display: flex; align-items: center; justify-content: center; flex-shrink: 0; transition: all .15s; }
.wtai-mic { background: #f3f4f6; color: #4b5563; }
.wtai-mic:hover { background: #e5e7eb; }
.wtai-mic svg { width: 16px; height: 16px; fill: currentColor; }
.wtai-send { background: linear-gradient(135deg,${t.primary},${t.accent}); color: #fff; }
.wtai-send:disabled { opacity: .4; cursor: not-allowed; }
.wtai-send svg { width: 15px; height: 15px; fill: #fff; }
.wtai-foot { text-align: center; padding: 6px; font-size: 10px; color: #9ca3af; background: #fff; }
.wtai-foot a { color: ${t.primary}; text-decoration: none; }
.wtai-voice { position: absolute; inset: 0; background: linear-gradient(135deg,${t.primary},${t.accent}); display: none; flex-direction: column; align-items: center; justify-content: center; z-index: 10; color: #fff; padding: 24px; text-align: center; }
.wtai-voice.active { display: flex; }
.wtai-orb { width: 160px; height: 160px; border-radius: 50%; background: rgba(255,255,255,.15); display: flex; align-items: center; justify-content: center; margin-bottom: 22px; position: relative; }
.wtai-orb::before, .wtai-orb::after { content: ""; position: absolute; inset: 0; border-radius: 50%; border: 2px solid rgba(255,255,255,.3); animation: wtai-wave 2s ease-out infinite; }
.wtai-orb::after { animation-delay: 1s; }
@keyframes wtai-wave { 0% { transform: scale(1); opacity: 1; } 100% { transform: scale(1.6); opacity: 0; } }
.wtai-orb-icon { width: 60px; height: 60px; fill: #fff; z-index: 1; }
.wtai-vstat { font-size: 17px; font-weight: 600; margin-bottom: 6px; }
.wtai-vhint { font-size: 12px; opacity: .85; }
.wtai-vacts { margin-top: 30px; display: flex; gap: 12px; }
.wtai-vbtn { padding: 10px 22px; border-radius: 24px; background: rgba(255,255,255,.2); border: none; color: #fff; font-size: 13px; font-weight: 500; cursor: pointer; transition: background .15s; }
.wtai-vbtn:hover { background: rgba(255,255,255,.32); }
.wtai-vbtn.danger { background: #ef4444; }
.wtai-vbtn.danger:hover { background: #dc2626; }
@media (max-width: 480px) {
  .wtai-panel { right: 8px; left: 8px; bottom: 8px; width: auto; max-width: none; height: calc(100vh - 90px); }
  .wtai-launcher { right: 16px; bottom: 16px; }
}
  `.trim();

  const s = document.createElement("style");
  s.id = "wtai-styles";
  s.textContent = css;
  document.head.appendChild(s);
}

// ────────────────────────── DOM ──────────────────────────

function buildDom() {
  // Launcher
  launcherEl = document.createElement("button");
  launcherEl.className = "wtai-w wtai-launcher";
  launcherEl.setAttribute("aria-label", "Open chat");
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
      ${cfg.voiceEnabled ? `<button class="wtai-btn wtai-mic" aria-label="Voice mode" title="Talk"><svg viewBox="0 0 24 24"><path d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3zm5.3-3c0 3-2.54 5.1-5.3 5.1S6.7 14 6.7 11H5c0 3.41 2.72 6.23 6 6.72V21h2v-3.28c3.28-.49 6-3.31 6-6.72h-1.7z"/></svg></button>` : ``}
      <button class="wtai-btn wtai-send" aria-label="Send"><svg viewBox="0 0 24 24"><path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z"/></svg></button>
    </div>
    <div class="wtai-foot">Powered by <a href="https://web-talk-ai.vercel.app" target="_blank" rel="noopener">WebTalk AI</a></div>

    <div class="wtai-voice">
      <div class="wtai-orb"><svg class="wtai-orb-icon" viewBox="0 0 24 24"><path d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3zm5.3-3c0 3-2.54 5.1-5.3 5.1S6.7 14 6.7 11H5c0 3.41 2.72 6.23 6 6.72V21h2v-3.28c3.28-.49 6-3.31 6-6.72h-1.7z"/></svg></div>
      <div class="wtai-vstat">Listening…</div>
      <div class="wtai-vhint">Speak naturally. Tap stop when done.</div>
      <div class="wtai-vacts">
        <button class="wtai-vbtn" data-act="cancel">Cancel</button>
        <button class="wtai-vbtn danger" data-act="stop">Stop &amp; Send</button>
      </div>
    </div>
  `;
  document.body.appendChild(panelEl);

  // Cache element refs
  messagesEl     = panelEl.querySelector(".wtai-msgs") as HTMLDivElement;
  inputEl        = panelEl.querySelector(".wtai-in") as HTMLInputElement;
  sendBtn        = panelEl.querySelector(".wtai-send") as HTMLButtonElement;
  micBtn         = panelEl.querySelector(".wtai-mic") as HTMLButtonElement;
  suggestionsEl  = panelEl.querySelector(".wtai-sugs") as HTMLDivElement;
  voiceOverlayEl = panelEl.querySelector(".wtai-voice") as HTMLDivElement;
  voiceStatusEl  = panelEl.querySelector(".wtai-vstat") as HTMLDivElement;

  // Listeners
  (panelEl.querySelector(".wtai-close") as HTMLButtonElement).onclick = togglePanel;
  sendBtn.onclick = () => sendText();
  inputEl.addEventListener("keydown", (e) => { if (e.key === "Enter" && !isStreaming) sendText(); });
  if (micBtn) micBtn.onclick = startVoice;
  (panelEl.querySelector('[data-act="cancel"]') as HTMLButtonElement).onclick = () => endVoice(true);
  (panelEl.querySelector('[data-act="stop"]')   as HTMLButtonElement).onclick = () => endVoice(false);
}

function togglePanel() {
  isOpen = !isOpen;
  panelEl.classList.toggle("open", isOpen);
  if (isOpen) {
    inputEl.focus();
    setTimeout(() => messagesEl.scrollTo({ top: messagesEl.scrollHeight, behavior: "smooth" }), 50);
  }
}

// ────────────────────────── Rendering ──────────────────────────

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
  if (messages.length > 1 || isStreaming) {
    suggestionsEl.innerHTML = "";
    return;
  }
  const suggestions = [
    "What is this site about?",
    "What do you offer?",
    "How can I get in touch?",
  ];
  suggestionsEl.innerHTML = suggestions
    .map((s) => `<button class="wtai-sug">${esc(s)}</button>`).join("");
  suggestionsEl.querySelectorAll(".wtai-sug").forEach((b, i) => {
    (b as HTMLButtonElement).onclick = () => sendText(suggestions[i]);
  });
}

// ────────────────────────── Text chat ──────────────────────────
//
// Uses non-streaming JSON endpoint (/widget/chat) — reliable across all
// proxies. SSE streaming exists on the backend (/widget/chat/stream) but
// Render's proxy buffers it, so we use the simpler endpoint by default.

const CHAT_TIMEOUT_MS = 60_000;

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
  const timeoutId = setTimeout(() => {
    console.warn("[WebTalkAI] Request timed out after", CHAT_TIMEOUT_MS, "ms");
    controller.abort();
  }, CHAT_TIMEOUT_MS);

  const t0 = performance.now();
  console.log("[WebTalkAI] → REST POST /widget/chat", { message: text, conversation_id: sessionId });

  try {
    const res = await fetch(`${cfg.apiUrl}/api/v1/widget/chat`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-API-Key": cfg.apiKey,
      },
      body: JSON.stringify({
        api_key: cfg.apiKey,
        message: text,
        conversation_id: sessionId,
      }),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);
    const dt = Math.round(performance.now() - t0);
    console.log("[WebTalkAI] ← status", res.status, "in", dt, "ms");

    if (!res.ok) {
      let bodyText = "";
      try { bodyText = await res.text(); } catch {}
      console.error("[WebTalkAI] HTTP", res.status, bodyText);
      let humanMsg = `Server returned ${res.status}.`;
      if (res.status === 401) humanMsg = "Invalid API key.";
      else if (res.status === 404) humanMsg = "Endpoint not found.";
      else if (res.status === 429) humanMsg = "Too many requests. Please wait a moment.";
      else if (res.status >= 500) humanMsg = "The AI is having trouble. Please try again.";
      throw new Error(humanMsg);
    }

    const data = await res.json();
    console.log("[WebTalkAI] response:", { len: data.response?.length, sources: data.sources?.length });

    const answer: string = data.response || data.answer || "I couldn't generate a response. Please try again.";
    const sources: string[] = data.sources || [];

    const last = messages[messages.length - 1];
    if (last) {
      last.content = answer;
      last.sources = sources;
      last.streaming = false;
    }
    renderMessages();

    // Optional TTS playback for typed answers
    if (cfg.ttsAutoPlay && answer) {
      playTTS(answer).catch(e => console.warn("[WebTalkAI] TTS failed:", e));
    }
  } catch (err) {
    clearTimeout(timeoutId);
    const dt = Math.round(performance.now() - t0);
    console.error("[WebTalkAI] Chat failed after", dt, "ms:", err);

    let msg = "Something went wrong. Please try again.";
    if (err instanceof DOMException && err.name === "AbortError") {
      msg = "The AI is starting up — please wait a moment and try again. (The server sleeps when idle on free hosting.)";
    } else if (err instanceof TypeError && err.message === "Failed to fetch") {
      msg = "Couldn't reach the server. Please check your connection.";
    } else if (err instanceof Error) {
      msg = err.message;
    }

    const last = messages[messages.length - 1];
    if (last && last.streaming) {
      last.content = msg;
      last.streaming = false;
      last.error = true;
    } else {
      messages.push({ role: "assistant", content: msg, error: true });
    }
    renderMessages();
  } finally {
    isStreaming = false;
    sendBtn.disabled = false;
    inputEl.disabled = false;
    inputEl.focus();
  }
}

// ────────────────────────── Audio playback ──────────────────────────
//
// Uses the Web Audio API instead of <audio>+Blob URLs.
//
// Why: Chrome's <audio> element issues byte-range requests on blob URLs,
// which often fails with ERR_REQUEST_RANGE_NOT_SATISFIABLE. Decoding the
// entire MP3 into an AudioBuffer up front sidesteps the problem entirely
// and gives us start/stop control for interruptions.

function getAudioContext(): AudioContext {
  if (!audioContext) {
    const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    audioContext = new Ctx();
  }
  return audioContext;
}

function stopCurrentAudio() {
  if (currentAudioSource) {
    try { currentAudioSource.stop(); } catch { /* already stopped */ }
    currentAudioSource = null;
  }
}

async function playAudioBuffer(buffer: ArrayBuffer): Promise<void> {
  if (buffer.byteLength === 0) {
    console.warn("[WebTalkAI] Empty audio buffer — skipping playback");
    return;
  }
  stopCurrentAudio();
  const ctx = getAudioContext();
  // Resume if suspended (Chrome autoplay policy)
  if (ctx.state === "suspended") await ctx.resume();

  // decodeAudioData consumes the ArrayBuffer; pass a copy so caller can reuse it
  const audioBuffer = await ctx.decodeAudioData(buffer.slice(0));
  const source = ctx.createBufferSource();
  source.buffer = audioBuffer;
  source.connect(ctx.destination);

  return new Promise<void>((resolve) => {
    source.onended = () => {
      if (currentAudioSource === source) currentAudioSource = null;
      resolve();
    };
    currentAudioSource = source;
    source.start(0);
  });
}

async function playTTS(text: string) {
  try {
    const res = await fetch(`${cfg.apiUrl}/api/v1/widget/tts`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-API-Key": cfg.apiKey,
      },
      body: JSON.stringify({ text }),
    });
    if (!res.ok) {
      console.warn("[WebTalkAI] TTS HTTP", res.status);
      return;
    }
    const buffer = await res.arrayBuffer();
    console.log("[WebTalkAI] TTS audio:", buffer.byteLength, "bytes");
    await playAudioBuffer(buffer);
  } catch (e) {
    console.warn("[WebTalkAI] TTS playback failed:", e);
  }
}

// ────────────────────────── Voice mode (WebSocket) ──────────────────────────

async function startVoice() {
  if (!cfg.voiceEnabled || !boot) return;
  if (isStreaming) return;

  // Open overlay
  voiceOverlayEl.classList.add("active");
  voiceStatusEl.textContent = "Connecting…";
  voiceCancelled = false;

  // Get microphone
  try {
    micStream = await navigator.mediaDevices.getUserMedia({ audio: true });
  } catch (e) {
    voiceStatusEl.textContent = "Microphone access denied";
    setTimeout(() => endVoice(true), 1500);
    return;
  }

  // Open WebSocket
  const url = `${cfg.wsUrl}/ws/voice/${boot.client_id}?session_id=${encodeURIComponent(sessionId)}&api_key=${encodeURIComponent(cfg.apiKey)}`;
  try {
    ws = new WebSocket(url);
  } catch (e) {
    voiceStatusEl.textContent = "Connection failed";
    setTimeout(() => endVoice(true), 1500);
    return;
  }

  // Audio playback for incoming voice
  const audioChunks: Uint8Array[] = [];

  ws.onopen = () => {
    voiceStatusEl.textContent = "Listening…";
    // Start recording
    mediaRecorder = new MediaRecorder(micStream!, { mimeType: "audio/webm" });
    mediaRecorder.ondataavailable = (e) => {
      if (!ws || ws.readyState !== WebSocket.OPEN || e.data.size === 0) return;
      const reader = new FileReader();
      reader.onload = () => {
        const b64 = (reader.result as string).split(",")[1];
        ws!.send(JSON.stringify({ type: "audio_chunk", data: b64 }));
      };
      reader.readAsDataURL(e.data);
    };
    mediaRecorder.start(300);
  };

  ws.onmessage = (e) => {
    const msg = JSON.parse(e.data);
    if (msg.type === "transcript" && msg.text) {
      messages.push({ role: "user", content: msg.text });
      renderMessages();
    } else if (msg.type === "answer_text") {
      messages.push({ role: "assistant", content: msg.text });
      voiceStatusEl.textContent = "Speaking…";
      renderMessages();
    } else if (msg.type === "audio_chunk") {
      const bin = atob(msg.data);
      const bytes = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
      audioChunks.push(bytes);
    } else if (msg.type === "audio_end") {
      const total = audioChunks.reduce((acc, c) => acc + c.length, 0);
      const buf = new Uint8Array(total);
      let pos = 0;
      for (const c of audioChunks) { buf.set(c, pos); pos += c.length; }
      audioChunks.length = 0;
      // Decode + play via AudioContext (reliable, supports interruption)
      playAudioBuffer(buf.buffer as ArrayBuffer)
        .then(() => {
          // Ready for next round of listening
          if (!voiceCancelled) {
            voiceStatusEl.textContent = "Listening…";
            if (mediaRecorder && mediaRecorder.state === "inactive") {
              mediaRecorder.start(300);
            }
          }
        })
        .catch((e) => console.warn("[WebTalkAI] voice playback failed:", e));
    } else if (msg.type === "error") {
      voiceStatusEl.textContent = "Error: " + msg.message;
      setTimeout(() => endVoice(true), 1800);
    }
  };

  ws.onerror = () => {
    voiceStatusEl.textContent = "Voice connection error";
  };

  ws.onclose = () => {
    if (!voiceCancelled) voiceStatusEl.textContent = "Disconnected";
  };
}

function endVoice(cancelled: boolean) {
  voiceCancelled = cancelled;
  voiceOverlayEl.classList.remove("active");

  if (mediaRecorder && mediaRecorder.state !== "inactive") {
    mediaRecorder.stop();
  }
  if (!cancelled && ws && ws.readyState === WebSocket.OPEN) {
    // Signal that user finished speaking
    voiceStatusEl.textContent = "Thinking…";
    ws.send(JSON.stringify({ type: "audio_end" }));
    // Keep ws open to receive answer + audio
  } else {
    if (ws) { ws.close(); ws = null; }
  }
  if (micStream) {
    micStream.getTracks().forEach(t => t.stop());
    micStream = null;
  }
  mediaRecorder = null;
}

// ────────────────────────── Init / Public API ──────────────────────────

async function init(opts: InitOpts) {
  if (!opts || !opts.apiKey) {
    console.error("[WebTalkAI] apiKey is required");
    return;
  }

  // Prevent double-init
  if (document.getElementById("wtai-styles")) {
    console.warn("[WebTalkAI] Already initialized");
    return;
  }

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
    apiUrl: cfg.apiUrl,
    wsUrl: cfg.wsUrl,
    theme: opts.theme || "purple",
    position: cfg.position,
    voiceEnabled: cfg.voiceEnabled,
    sessionId,
  });

  // Fetch tenant info
  const t0 = performance.now();
  try {
    const res = await fetch(
      `${cfg.apiUrl}/api/v1/widget/config?api_key=${encodeURIComponent(cfg.apiKey)}`
    );
    const dt = Math.round(performance.now() - t0);
    if (!res.ok) {
      console.error(
        `[WebTalkAI] Bootstrap failed: HTTP ${res.status} after ${dt}ms. ` +
        `Check that the API key is valid and that ${cfg.apiUrl} is reachable.`
      );
      return;
    }
    boot = await res.json();
    console.log("[WebTalkAI] connected in", dt, "ms — tenant:", boot?.company_name);
  } catch (e) {
    console.error("[WebTalkAI] Bootstrap failed (network):", e);
    return;
  }

  // Render
  injectStyles();
  buildDom();

  messages = [{ role: "assistant", content: cfg.greeting }];
  renderMessages();
  renderSuggestions();
}

// Expose globals
(window as unknown as { WebTalkAI: object }).WebTalkAI = {
  init,
  open:  () => { if (!isOpen) togglePanel(); },
  close: () => { if (isOpen)  togglePanel(); },
  version: VERSION,
};
