/**
 * WebTalk AI — Embeddable Widget
 *
 * Usage:
 *   <script>
 *     window.WebTalkConfig = { clientId: "...", apiKey: "wtk_..." };
 *   </script>
 *   <script src="https://cdn.webtalk.ai/widget.js" async></script>
 */

interface WebTalkConfig {
  clientId: string;
  apiKey: string;
  apiUrl?: string;
  wsUrl?: string;
  position?: "bottom-right" | "bottom-left";
  primaryColor?: string;
  greeting?: string;
}

declare global {
  interface Window {
    WebTalkConfig: WebTalkConfig;
  }
}

const cfg = (): WebTalkConfig => window.WebTalkConfig ?? ({} as WebTalkConfig);

// ─── State ───────────────────────────────────────────────────
let ws: WebSocket | null = null;
let audioContext: AudioContext | null = null;
let mediaRecorder: MediaRecorder | null = null;
let sessionId = `s_${Math.random().toString(36).slice(2)}_${Date.now()}`;
let isRecording = false;
let isOpen = false;

// ─── DOM ─────────────────────────────────────────────────────
function inject() {
  const config = cfg();
  const pos = config.position ?? "bottom-right";
  const color = config.primaryColor ?? "#2563eb";
  const greeting = config.greeting ?? "Hi! How can I help you today?";

  const style = document.createElement("style");
  style.textContent = `
    #wtai-launcher{position:fixed;${pos === "bottom-right" ? "right:24px" : "left:24px"};bottom:24px;z-index:9999;
      width:52px;height:52px;border-radius:50%;background:${color};border:none;cursor:pointer;
      box-shadow:0 4px 20px rgba(0,0,0,.18);display:flex;align-items:center;justify-content:center;transition:transform .2s}
    #wtai-launcher:hover{transform:scale(1.08)}
    #wtai-launcher svg{width:24px;height:24px;fill:white}
    #wtai-panel{position:fixed;${pos === "bottom-right" ? "right:24px" : "left:24px"};bottom:88px;z-index:9998;
      width:360px;max-height:520px;border-radius:16px;background:#fff;
      box-shadow:0 8px 40px rgba(0,0,0,.16);display:none;flex-direction:column;overflow:hidden;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif}
    #wtai-panel.open{display:flex}
    #wtai-header{padding:14px 16px;background:${color};color:#fff;font-weight:600;font-size:14px;display:flex;justify-content:space-between;align-items:center}
    #wtai-header button{background:none;border:none;color:#fff;cursor:pointer;font-size:18px;line-height:1}
    #wtai-messages{flex:1;overflow-y:auto;padding:12px;display:flex;flex-direction:column;gap:8px}
    .wtai-msg{max-width:82%;padding:8px 12px;border-radius:14px;font-size:13px;line-height:1.5;word-break:break-word}
    .wtai-msg.user{align-self:flex-end;background:${color};color:#fff;border-bottom-right-radius:4px}
    .wtai-msg.assistant{align-self:flex-start;background:#f1f5f9;color:#1e293b;border-bottom-left-radius:4px}
    .wtai-msg.thinking{color:#94a3b8;font-style:italic}
    #wtai-footer{padding:10px;border-top:1px solid #f1f5f9;display:flex;gap:8px;align-items:center}
    #wtai-input{flex:1;border:1px solid #e2e8f0;border-radius:20px;padding:8px 14px;font-size:13px;outline:none}
    #wtai-input:focus{border-color:${color}}
    #wtai-send,#wtai-mic{width:36px;height:36px;border-radius:50%;border:none;cursor:pointer;display:flex;align-items:center;justify-content:center;flex-shrink:0}
    #wtai-send{background:${color}}
    #wtai-send svg{width:16px;height:16px;fill:white}
    #wtai-mic{background:#f1f5f9}
    #wtai-mic.recording{background:#ef4444}
    #wtai-mic svg{width:16px;height:16px}
    #wtai-mic.recording svg{fill:white}
  `;
  document.head.appendChild(style);

  // Launcher button
  const launcher = document.createElement("button");
  launcher.id = "wtai-launcher";
  launcher.setAttribute("aria-label", "Open AI chat");
  launcher.innerHTML = `<svg viewBox="0 0 24 24"><path d="M12 2C6.48 2 2 6.48 2 12c0 1.86.5 3.6 1.38 5.1L2 22l4.9-1.38C8.4 21.5 10.14 22 12 22c5.52 0 10-4.48 10-10S17.52 2 12 2zm1 15H7v-2h6v2zm3-4H7v-2h9v2zm0-4H7V7h9v2z"/></svg>`;
  document.body.appendChild(launcher);

  // Panel
  const panel = document.createElement("div");
  panel.id = "wtai-panel";
  panel.setAttribute("role", "dialog");
  panel.setAttribute("aria-label", "AI Chat");
  panel.innerHTML = `
    <div id="wtai-header">
      <span>AI Assistant</span>
      <button id="wtai-close" aria-label="Close">×</button>
    </div>
    <div id="wtai-messages"></div>
    <div id="wtai-footer">
      <input id="wtai-input" type="text" placeholder="Type a message…" autocomplete="off" />
      <button id="wtai-send" aria-label="Send">
        <svg viewBox="0 0 24 24"><path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z"/></svg>
      </button>
      <button id="wtai-mic" aria-label="Voice input">
        <svg viewBox="0 0 24 24"><path d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3zm5.3-3c0 3-2.54 5.1-5.3 5.1S6.7 14 6.7 11H5c0 3.41 2.72 6.23 6 6.72V21h2v-3.28c3.28-.49 6-3.31 6-6.72h-1.7z"/></svg>
      </button>
    </div>
  `;
  document.body.appendChild(panel);

  // Greeting
  appendMessage("assistant", greeting);

  // Events
  launcher.addEventListener("click", togglePanel);
  document.getElementById("wtai-close")!.addEventListener("click", togglePanel);
  document.getElementById("wtai-send")!.addEventListener("click", sendText);
  document.getElementById("wtai-input")!.addEventListener("keydown", (e) => {
    if ((e as KeyboardEvent).key === "Enter") sendText();
  });
  document.getElementById("wtai-mic")!.addEventListener("click", toggleVoice);
}

function togglePanel() {
  isOpen = !isOpen;
  document.getElementById("wtai-panel")!.classList.toggle("open", isOpen);
  if (isOpen && !ws) connectWebSocket();
}

// ─── Text chat ────────────────────────────────────────────────
async function sendText() {
  const input = document.getElementById("wtai-input") as HTMLInputElement;
  const text = input.value.trim();
  if (!text) return;
  input.value = "";

  appendMessage("user", text);
  const thinking = appendMessage("assistant", "Thinking…", "thinking");

  try {
    const { apiUrl = "http://localhost:8000", clientId, apiKey } = cfg();
    const res = await fetch(`${apiUrl}/api/v1/conversations/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-API-Key": apiKey },
      body: JSON.stringify({ message: text, session_id: sessionId, client_id: clientId }),
    });
    const data = await res.json();
    thinking.textContent = data.answer ?? "Sorry, I couldn't get a response.";
    thinking.classList.remove("thinking");
  } catch {
    thinking.textContent = "Connection error. Please try again.";
    thinking.classList.remove("thinking");
  }
}

// ─── Voice chat via WebSocket ─────────────────────────────────
function connectWebSocket() {
  const { wsUrl = "ws://localhost:8000", clientId, apiKey } = cfg();
  const url = `${wsUrl}/ws/voice/${clientId}?session_id=${sessionId}&api_key=${encodeURIComponent(apiKey)}`;
  ws = new WebSocket(url);

  let currentAiMsg: HTMLElement | null = null;

  ws.onmessage = async (event) => {
    const msg = JSON.parse(event.data);

    if (msg.type === "transcript") {
      if (msg.text) appendMessage("user", msg.text);
    } else if (msg.type === "answer_text") {
      currentAiMsg = appendMessage("assistant", msg.text);
    } else if (msg.type === "audio_chunk") {
      await playAudioChunk(msg.data);
    } else if (msg.type === "error") {
      appendMessage("assistant", `Error: ${msg.message}`, "thinking");
    }
  };

  ws.onerror = () => appendMessage("assistant", "Voice connection error.", "thinking");
  ws.onclose = () => { ws = null; };
}

async function toggleVoice() {
  if (!isRecording) {
    await startRecording();
  } else {
    stopRecording();
  }
}

async function startRecording() {
  if (!navigator.mediaDevices) {
    alert("Microphone not available in this browser.");
    return;
  }
  const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  mediaRecorder = new MediaRecorder(stream, { mimeType: "audio/webm" });

  mediaRecorder.ondataavailable = (e) => {
    if (!ws || ws.readyState !== WebSocket.OPEN || e.data.size === 0) return;
    const reader = new FileReader();
    reader.onload = () => {
      const base64 = (reader.result as string).split(",")[1];
      ws!.send(JSON.stringify({ type: "audio_chunk", data: base64 }));
    };
    reader.readAsDataURL(e.data);
  };

  mediaRecorder.start(250); // 250ms chunks
  isRecording = true;
  document.getElementById("wtai-mic")!.classList.add("recording");
  if (!ws || ws.readyState !== WebSocket.OPEN) connectWebSocket();
}

function stopRecording() {
  if (!mediaRecorder) return;
  mediaRecorder.stop();
  mediaRecorder.stream.getTracks().forEach((t) => t.stop());
  isRecording = false;
  document.getElementById("wtai-mic")!.classList.remove("recording");
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify({ type: "audio_end" }));
  }
}

async function playAudioChunk(base64: string) {
  if (!audioContext) audioContext = new AudioContext();
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  const buffer = await audioContext.decodeAudioData(bytes.buffer);
  const source = audioContext.createBufferSource();
  source.buffer = buffer;
  source.connect(audioContext.destination);
  source.start();
}

// ─── Helpers ─────────────────────────────────────────────────
function appendMessage(role: "user" | "assistant", text: string, extra?: string): HTMLElement {
  const container = document.getElementById("wtai-messages")!;
  const div = document.createElement("div");
  div.className = `wtai-msg ${role}${extra ? " " + extra : ""}`;
  div.textContent = text;
  container.appendChild(div);
  container.scrollTop = container.scrollHeight;
  return div;
}

// ─── Boot ─────────────────────────────────────────────────────
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", inject);
} else {
  inject();
}
