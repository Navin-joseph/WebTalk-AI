"use strict";
(() => {
  const V = "3.0.0";
  const DEFAULT_API = "https://webtalk-ai.onrender.com";

  const THEMES = {
    purple: { p: "#7c3aed", a: "#a855f7" },
    blue:   { p: "#2563eb", a: "#06b6d4" },
    green:  { p: "#059669", a: "#10b981" },
    dark:   { p: "#1f2937", a: "#6366f1" },
  };

  // ── State ───────────────────────────────────────────────────────────────────
  let cfg, tenant;
  let msgs = [], streaming = false, listening = false, speaking = false;
  let ttsOn = true, panelOpen = false, sessionId;
  let msgsEl, inputEl, sendBtn, micBtn, statusEl, avatarEl, muteBtn;
  let recognition = null;

  // ── Helpers ─────────────────────────────────────────────────────────────────
  function esc(s) {
    const d = document.createElement("div");
    d.textContent = String(s ?? "");
    return d.innerHTML;
  }

  function sid() {
    try {
      let s = localStorage.getItem("wtai_sid3");
      if (!s) { s = "s_" + Math.random().toString(36).slice(2) + "_" + Date.now(); localStorage.setItem("wtai_sid3", s); }
      return s;
    } catch { return "s_" + Date.now(); }
  }

  function setStatus(t) { if (statusEl) statusEl.textContent = t; }
  function setActive(on) { if (avatarEl) avatarEl.classList.toggle("wtai-av-active", on); }

  // ── CSS ─────────────────────────────────────────────────────────────────────
  function injectCSS() {
    const { p, a } = cfg.theme;
    const side = cfg.position === "bottom-left" ? "left" : "right";
    document.head.insertAdjacentHTML("beforeend", `<style id="wtai-css">
.wtai-w *{box-sizing:border-box;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif}

/* Launcher */
.wtai-launch{position:fixed;${side}:24px;bottom:24px;z-index:2147483646;width:60px;height:60px;border-radius:50%;background:linear-gradient(135deg,${p},${a});border:none;cursor:pointer;box-shadow:0 8px 30px ${p}66,0 4px 12px rgba(0,0,0,.15);display:flex;align-items:center;justify-content:center;transition:transform .2s,background .2s,box-shadow .2s}
.wtai-launch:hover{transform:scale(1.08)}
.wtai-launch svg{width:26px;height:26px;fill:#fff;flex-shrink:0}
.wtai-badge{position:absolute;top:-1px;right:-1px;width:12px;height:12px;border-radius:50%;background:#34d399;border:2px solid #fff}

/* Panel */
.wtai-panel{position:fixed;${side}:24px;bottom:92px;z-index:2147483647;width:380px;max-width:calc(100vw - 32px);height:580px;max-height:calc(100vh - 120px);background:rgba(255,255,255,.97);backdrop-filter:blur(24px);-webkit-backdrop-filter:blur(24px);border-radius:24px;border:1px solid rgba(255,255,255,.6);box-shadow:0 20px 60px rgba(15,23,42,.2),0 4px 16px rgba(15,23,42,.08);display:none;flex-direction:column;overflow:hidden}
.wtai-panel.open{display:flex;animation:wtai-fadein .3s cubic-bezier(.16,1,.3,1)}
@keyframes wtai-fadein{from{opacity:0;transform:translateY(12px) scale(.96)}to{opacity:1;transform:translateY(0) scale(1)}}

/* Header */
.wtai-head{padding:13px 16px;display:flex;align-items:center;gap:10px;border-bottom:1px solid rgba(148,163,184,.12);background:linear-gradient(135deg,${p}0f,${a}0f);flex-shrink:0}
.wtai-av{width:36px;height:36px;border-radius:10px;flex-shrink:0;background:linear-gradient(135deg,${p},${a});display:flex;align-items:center;justify-content:center;transition:box-shadow .3s}
.wtai-av svg{width:18px;height:18px;fill:#fff}
.wtai-av-active{box-shadow:0 0 0 3px ${p}44;animation:wtai-pulse 1.5s ease-in-out infinite}
@keyframes wtai-pulse{0%,100%{opacity:1;transform:scale(1)}50%{opacity:.85;transform:scale(1.06)}}
.wtai-hinfo{flex:1;min-width:0}
.wtai-hname{font-size:13px;font-weight:600;color:#1e293b;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.wtai-hstatus{font-size:11px;color:#94a3b8;margin-top:1px}
.wtai-hbtns{display:flex;align-items:center;gap:2px}
.wtai-hbtn{width:28px;height:28px;border:none;background:none;cursor:pointer;border-radius:8px;display:flex;align-items:center;justify-content:center;color:#94a3b8;transition:background .15s,color .15s;flex-shrink:0}
.wtai-hbtn:hover{background:rgba(148,163,184,.15);color:#475569}
.wtai-hbtn svg{width:15px;height:15px;fill:currentColor}

/* Messages */
.wtai-msgs{flex:1;overflow-y:auto;padding:14px 14px 10px;display:flex;flex-direction:column;gap:10px}
.wtai-msgs::-webkit-scrollbar{width:4px}
.wtai-msgs::-webkit-scrollbar-thumb{background:#e2e8f0;border-radius:2px}
.wtai-mrow{display:flex}
.wtai-mrow.user{justify-content:flex-end}
.wtai-mrow.bot{justify-content:flex-start;align-items:flex-end;gap:7px}
.wtai-mav{width:26px;height:26px;border-radius:50%;flex-shrink:0;background:linear-gradient(135deg,${p},${a});display:flex;align-items:center;justify-content:center}
.wtai-mav svg{width:13px;height:13px;fill:#fff}
.wtai-bub{max-width:82%;padding:9px 13px;border-radius:18px;font-size:13.5px;line-height:1.55;word-wrap:break-word;white-space:pre-wrap}
.wtai-mrow.user .wtai-bub{background:linear-gradient(135deg,${p},${a});color:#fff;border-bottom-right-radius:4px;box-shadow:0 2px 8px ${p}44}
.wtai-mrow.bot .wtai-bub{background:#f1f5f9;color:#334155;border-bottom-left-radius:4px}
.wtai-caret{display:inline-block;width:2px;height:13px;background:#94a3b8;margin-left:2px;vertical-align:text-bottom;animation:wtai-blink 1s infinite}
@keyframes wtai-blink{0%,50%{opacity:1}51%,100%{opacity:0}}
.wtai-dots{display:inline-flex;gap:3px;align-items:center;padding:3px 0}
.wtai-dots span{width:6px;height:6px;border-radius:50%;background:#94a3b8;animation:wtai-bnc 1.4s ease-in-out infinite}
.wtai-dots span:nth-child(2){animation-delay:.15s}
.wtai-dots span:nth-child(3){animation-delay:.3s}
@keyframes wtai-bnc{0%,80%,100%{transform:scale(.6);opacity:.5}40%{transform:scale(1);opacity:1}}
.wtai-srcs{display:flex;flex-wrap:wrap;gap:4px;margin-top:5px}
.wtai-src{font-size:10px;color:#64748b;background:#fff;border:1px solid #e2e8f0;border-radius:4px;padding:2px 6px;text-decoration:none}
.wtai-src:hover{color:${p};border-color:${p}44}

/* Empty state */
.wtai-empty{flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:20px;text-align:center}
.wtai-ei{width:64px;height:64px;border-radius:20px;margin-bottom:14px;background:linear-gradient(135deg,${p}22,${a}22);display:flex;align-items:center;justify-content:center}
.wtai-ei svg{width:28px;height:28px;fill:${p}}
.wtai-etitle{font-size:14px;font-weight:600;color:#334155;margin-bottom:5px}
.wtai-esub{font-size:12px;color:#94a3b8;line-height:1.5;margin-bottom:16px}
.wtai-chips{display:flex;flex-direction:column;gap:6px;width:100%}
.wtai-chip{font-size:12px;text-align:left;padding:8px 12px;border-radius:12px;background:#f8fafc;border:1px solid #e2e8f0;color:#64748b;cursor:pointer;transition:all .15s}
.wtai-chip:hover{background:${p}0f;border-color:${p}44;color:${p}}

/* Input row */
.wtai-inrow{padding:10px 12px;border-top:1px solid rgba(148,163,184,.12);display:flex;align-items:center;gap:6px;flex-shrink:0}
.wtai-input{flex:1;background:#f8fafc;border:1px solid #e2e8f0;border-radius:20px;padding:9px 14px;font-size:13.5px;color:#334155;outline:none;transition:border-color .15s,box-shadow .15s,background .15s;min-width:0}
.wtai-input:focus{border-color:${p}88;box-shadow:0 0 0 3px ${p}1a;background:#fff}
.wtai-input:disabled{opacity:.6}
.wtai-ibtn{width:36px;height:36px;border-radius:50%;border:none;cursor:pointer;display:flex;align-items:center;justify-content:center;flex-shrink:0;transition:all .15s}
.wtai-mic{background:#f1f5f9;color:#64748b}
.wtai-mic:hover{background:#e2e8f0}
.wtai-mic.on{background:#fee2e2;color:#ef4444;animation:wtai-pulse 1.2s ease-in-out infinite}
.wtai-mic svg{width:15px;height:15px;fill:currentColor}
.wtai-send{background:linear-gradient(135deg,${p},${a});box-shadow:0 2px 8px ${p}55}
.wtai-send:hover:not(:disabled){transform:scale(1.06);opacity:.9}
.wtai-send:disabled{opacity:.35;cursor:not-allowed;box-shadow:none}
.wtai-send svg{width:14px;height:14px;fill:#fff}
.wtai-foot{text-align:center;padding:5px;font-size:10px;color:#cbd5e1;border-top:1px solid rgba(148,163,184,.08);flex-shrink:0}
.wtai-foot a{color:${p};text-decoration:none}
@media(max-width:480px){.wtai-panel{right:8px;left:8px;bottom:8px;width:auto;max-width:none;height:calc(100vh - 88px)}.wtai-launch{right:16px;bottom:16px}}
</style>`);
  }

  // ── SVG icons ────────────────────────────────────────────────────────────────
  const ICO = {
    bot:   `<svg viewBox="0 0 24 24"><path d="M20 9V7c0-1.1-.9-2-2-2h-3c0-1.66-1.34-3-3-3S9 3.34 9 5H6c-1.1 0-2 .9-2 2v2c-1.66 0-3 1.34-3 3s1.34 3 3 3v4c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2v-4c1.66 0 3-1.34 3-3s-1.34-3-3-3zM7.5 11.5c0-.83.67-1.5 1.5-1.5s1.5.67 1.5 1.5S9.83 13 9 13s-1.5-.67-1.5-1.5zM16 17H8v-2h8v2zm-1-4c-.83 0-1.5-.67-1.5-1.5S14.17 10 15 10s1.5.67 1.5 1.5S15.83 13 15 13z"/></svg>`,
    chat:  `<svg viewBox="0 0 24 24"><path d="M12 2C6.48 2 2 6.48 2 12c0 1.86.5 3.6 1.38 5.1L2 22l4.9-1.38C8.4 21.5 10.14 22 12 22c5.52 0 10-4.48 10-10S17.52 2 12 2zm0 18c-1.65 0-3.27-.45-4.7-1.3l-.34-.2-3.04.86.85-3.03-.21-.34C3.45 14.27 3 12.65 3 11c0-4.97 4.03-9 9-9s9 4.03 9 9-4.03 9-9 9z"/><circle cx="8" cy="12" r="1.4"/><circle cx="12" cy="12" r="1.4"/><circle cx="16" cy="12" r="1.4"/></svg>`,
    close: `<svg viewBox="0 0 24 24"><path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/></svg>`,
    mic:   `<svg viewBox="0 0 24 24"><path d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3zm5.3-3c0 3-2.54 5.1-5.3 5.1S6.7 14 6.7 11H5c0 3.41 2.72 6.23 6 6.72V21h2v-3.28c3.28-.49 6-3.31 6-6.72h-1.7z"/></svg>`,
    micoff:`<svg viewBox="0 0 24 24"><path d="M19 11h-1.7c0 .74-.16 1.43-.43 2.05l1.23 1.23c.56-.98.9-2.09.9-3.28zm-4.02.17c0-.06.02-.11.02-.17V5c0-1.66-1.34-3-3-3S9 3.34 9 5v.18l5.98 5.99zM4.27 3L3 4.27l6.01 6.01V11c0 1.66 1.33 3 2.99 3 .22 0 .44-.03.65-.08l1.66 1.66c-.71.33-1.5.52-2.31.52-2.76 0-5.3-2.1-5.3-5.1H5c0 3.41 2.72 6.23 6 6.72V21h2v-3.28c.91-.13 1.77-.45 2.54-.9L19.73 21 21 19.73 4.27 3z"/></svg>`,
    send:  `<svg viewBox="0 0 24 24"><path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z"/></svg>`,
    vol:   `<svg viewBox="0 0 24 24"><path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z"/></svg>`,
    mute:  `<svg viewBox="0 0 24 24"><path d="M16.5 12c0-1.77-1.02-3.29-2.5-4.03v2.21l2.45 2.45c.03-.2.05-.41.05-.63zm2.5 0c0 .94-.2 1.82-.54 2.64l1.51 1.51C20.63 14.91 21 13.5 21 12c0-4.28-2.99-7.86-7-8.77v2.06c2.89.86 5 3.54 5 6.71zM4.27 3L3 4.27 7.73 9H3v6h4l5 5v-6.73l4.25 4.25c-.67.52-1.42.93-2.25 1.18v2.06c1.38-.31 2.63-.95 3.69-1.81L19.73 21 21 19.73l-9-9L4.27 3zM12 4L9.91 6.09 12 8.18V4z"/></svg>`,
  };

  // ── Build DOM ────────────────────────────────────────────────────────────────
  function buildUI() {
    const root = document.body || document.documentElement;
    const name = esc(tenant?.company_name || "AI Assistant");

    // Launcher
    const launcher = document.createElement("button");
    launcher.className = "wtai-w wtai-launch";
    launcher.setAttribute("aria-label", "Open AI assistant");
    launcher.innerHTML = ICO.chat;
    root.appendChild(launcher);

    // Panel
    const panel = document.createElement("div");
    panel.className = "wtai-w wtai-panel";
    panel.id = "wtai-panel";
    panel.innerHTML = `
      <div class="wtai-head">
        <div class="wtai-av" id="wtai-av">${ICO.bot}</div>
        <div class="wtai-hinfo">
          <div class="wtai-hname">${name}</div>
          <div class="wtai-hstatus" id="wtai-status">Ask about this site</div>
        </div>
        <div class="wtai-hbtns">
          <button class="wtai-hbtn" id="wtai-mute" title="Toggle voice">${ICO.vol}</button>
          <button class="wtai-hbtn" id="wtai-close" title="Close">${ICO.close}</button>
        </div>
      </div>
      <div class="wtai-msgs" id="wtai-msgs"></div>
      <div class="wtai-inrow">
        <input class="wtai-input" id="wtai-input" type="text" placeholder="Ask anything…" autocomplete="off"/>
        ${cfg.voiceEnabled ? `<button class="wtai-ibtn wtai-mic" id="wtai-mic" title="Voice input">${ICO.mic}</button>` : ""}
        <button class="wtai-ibtn wtai-send" id="wtai-send" disabled title="Send">${ICO.send}</button>
      </div>
      <div class="wtai-foot">Powered by <a href="https://web-talk-ai.vercel.app" target="_blank" rel="noopener">WebTalk AI</a></div>
    `;
    root.appendChild(panel);

    // Wire refs
    msgsEl  = document.getElementById("wtai-msgs");
    inputEl = document.getElementById("wtai-input");
    sendBtn = document.getElementById("wtai-send");
    micBtn  = document.getElementById("wtai-mic");
    statusEl= document.getElementById("wtai-status");
    avatarEl= document.getElementById("wtai-av");
    muteBtn = document.getElementById("wtai-mute");

    // Events
    launcher.onclick = togglePanel;
    document.getElementById("wtai-close").onclick = togglePanel;
    sendBtn.onclick = () => send(inputEl.value);
    inputEl.addEventListener("keydown", e => { if (e.key === "Enter" && !streaming) send(inputEl.value); });
    inputEl.addEventListener("input",   () => { sendBtn.disabled = !inputEl.value.trim() || streaming; });
    if (micBtn) micBtn.onclick = toggleVoice;
    muteBtn.onclick = () => {
      ttsOn = !ttsOn;
      muteBtn.innerHTML = ttsOn ? ICO.vol : ICO.mute;
      muteBtn.title = ttsOn ? "Mute voice" : "Unmute voice";
      muteBtn.style.color = ttsOn ? "" : "#7c3aed";
      if (!ttsOn) stopSpeaking();
    };

    render();

    // store launcher ref for open/close icon swap
    buildUI._launcher = launcher;
    buildUI._panel = panel;
  }

  // ── Render messages ─────────────────────────────────────────────────────────
  function render() {
    if (!msgsEl) return;

    if (msgs.length === 0) {
      const name = esc(tenant?.company_name || "AI Assistant");
      msgsEl.innerHTML = `
        <div class="wtai-empty">
          <div class="wtai-ei">${ICO.bot}</div>
          <div class="wtai-etitle">${name}</div>
          <div class="wtai-esub">I'm trained on this site's content. Ask me anything!</div>
          <div class="wtai-chips" id="wtai-chips">
            <button class="wtai-chip">What is this site about?</button>
            <button class="wtai-chip">What do you offer?</button>
            <button class="wtai-chip">How can I contact you?</button>
          </div>
        </div>`;
      msgsEl.querySelectorAll(".wtai-chip").forEach(b => {
        b.onclick = () => send(b.textContent);
      });
      return;
    }

    msgsEl.innerHTML = msgs.map(m => {
      if (m.role === "user") {
        return `<div class="wtai-mrow user"><div class="wtai-bub">${esc(m.content)}</div></div>`;
      }
      let body;
      if (!m.content && m.streaming) {
        body = `<div class="wtai-dots"><span></span><span></span><span></span></div>`;
      } else {
        body = esc(m.content || "");
        if (m.streaming) body += `<span class="wtai-caret"></span>`;
      }
      let srcs = "";
      if (m.sources && m.sources.length && !m.streaming) {
        srcs = `<div class="wtai-srcs">${m.sources.slice(0,3).map(s => {
          try { return `<a class="wtai-src" href="${esc(s)}" target="_blank" rel="noopener">${esc(new URL(s).hostname)}</a>`; }
          catch { return ""; }
        }).join("")}</div>`;
      }
      return `<div class="wtai-mrow bot">
        <div class="wtai-mav">${ICO.bot}</div>
        <div><div class="wtai-bub">${body}</div>${srcs}</div>
      </div>`;
    }).join("");

    msgsEl.scrollTop = msgsEl.scrollHeight;
  }

  // ── Toggle panel ─────────────────────────────────────────────────────────────
  function togglePanel() {
    panelOpen = !panelOpen;
    const panel   = document.getElementById("wtai-panel");
    const launcher = buildUI._launcher;
    if (!panel || !launcher) return;
    panel.classList.toggle("open", panelOpen);
    if (panelOpen) {
      launcher.style.background = "#334155";
      launcher.innerHTML = ICO.close;
      setTimeout(() => inputEl?.focus(), 80);
    } else {
      const { p, a } = cfg.theme;
      launcher.style.background = `linear-gradient(135deg,${p},${a})`;
      launcher.innerHTML = ICO.chat;
      stopSpeaking();
    }
  }

  // ── Send message (SSE streaming) ─────────────────────────────────────────────
  async function send(text) {
    if (!text || !text.trim() || streaming) return;
    text = text.trim();
    inputEl.value = "";
    sendBtn.disabled = true;

    msgs.push({ role: "user", content: text });
    msgs.push({ role: "assistant", content: "", streaming: true });
    streaming = true;
    setStatus("Thinking…");
    setActive(true);
    render();

    let fullAnswer = "", sources = [];

    try {
      const res = await fetch(`${cfg.apiUrl}/api/v1/widget/chat/stream`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-API-Key": cfg.apiKey },
        body: JSON.stringify({ message: text, session_id: sessionId, use_voice: false }),
      });

      if (!res.ok || !res.body) {
        throw new Error(res.status === 401 ? "Invalid API key." : `Server error ${res.status}.`);
      }

      const reader = res.body.getReader();
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
              fullAnswer += evt.text;
              const last = msgs[msgs.length - 1];
              if (last) { last.content = fullAnswer; last.streaming = true; }
              render();
            } else if (evt.type === "sources") {
              sources = evt.sources || [];
            } else if (evt.type === "done") {
              fullAnswer = evt.answer || fullAnswer;
            }
          } catch { /* skip malformed event */ }
        }
      }
    } catch (err) {
      if (err.name === "AbortError") return;
      fullAnswer = fullAnswer || (
        err.message === "Failed to fetch"
          ? "Couldn't reach the server. Please check your connection."
          : err.message || "Something went wrong. Please try again."
      );
    } finally {
      const last = msgs[msgs.length - 1];
      if (last) {
        last.content = fullAnswer || "I couldn't generate a response. Please try again.";
        last.streaming = false;
        if (sources.length) last.sources = sources;
      }
      streaming = false;
      sendBtn.disabled = !inputEl.value.trim();
      setStatus("Ask about this site");
      setActive(false);
      render();
      if (ttsOn && cfg.ttsAutoPlay && fullAnswer) speakText(fullAnswer);
    }
  }

  // ── Browser TTS (speechSynthesis) ────────────────────────────────────────────
  function speakText(text) {
    if (!window.speechSynthesis) return;
    window.speechSynthesis.cancel();
    const utt = new SpeechSynthesisUtterance(text.slice(0, 500));
    utt.rate = 1.05;
    utt.onstart = () => { speaking = true; setStatus("Speaking…"); setActive(true); };
    utt.onend   = () => { speaking = false; setStatus("Ask about this site"); setActive(false); };
    utt.onerror = () => { speaking = false; setStatus("Ask about this site"); setActive(false); };
    // Prefer a natural English voice if available
    const voices = window.speechSynthesis.getVoices();
    const pref = voices.find(v => /Google US English|Samantha|Karen|Daniel/i.test(v.name))
              || voices.find(v => v.lang?.startsWith("en"));
    if (pref) utt.voice = pref;
    window.speechSynthesis.speak(utt);
  }

  function stopSpeaking() {
    window.speechSynthesis?.cancel();
    speaking = false;
    setStatus("Ask about this site");
    setActive(false);
  }

  // ── Browser STT (SpeechRecognition) ──────────────────────────────────────────
  function toggleVoice() {
    if (listening) { recognition?.stop(); return; }

    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) { alert("Voice input requires Chrome or Edge."); return; }

    recognition = new SR();
    recognition.continuous = false;
    recognition.interimResults = false;
    recognition.lang = "en-US";

    recognition.onstart = () => {
      listening = true;
      if (micBtn) { micBtn.classList.add("on"); micBtn.innerHTML = ICO.micoff; }
      setStatus("🎙 Listening…");
      inputEl.placeholder = "Listening…";
    };
    recognition.onend = () => {
      listening = false;
      if (micBtn) { micBtn.classList.remove("on"); micBtn.innerHTML = ICO.mic; }
      setStatus("Ask about this site");
      inputEl.placeholder = "Ask anything…";
    };
    recognition.onerror = recognition.onend;
    recognition.onresult = e => {
      const t = e.results[0]?.[0]?.transcript;
      if (t) send(t);
    };
    recognition.start();
  }

  // ── Init ──────────────────────────────────────────────────────────────────────
  async function init(options) {
    if (!options?.apiKey) { console.error("[WebTalkAI] apiKey is required"); return; }
    if (document.getElementById("wtai-css")) { console.warn("[WebTalkAI] already initialized"); return; }

    const themeKey = options.theme && THEMES[options.theme] ? options.theme : "purple";
    cfg = {
      apiKey:      options.apiKey,
      apiUrl:      (options.apiUrl || DEFAULT_API).replace(/\/$/, ""),
      position:    options.position === "bottom-left" ? "bottom-left" : "bottom-right",
      theme:       THEMES[themeKey],
      voiceEnabled:options.voiceEnabled !== false,
      ttsAutoPlay: options.ttsAutoPlay === true,
    };
    sessionId = sid();
    ttsOn = true;

    console.log(`[WebTalkAI] v${V} init`, { apiUrl: cfg.apiUrl, theme: themeKey });

    // Validate API key & load tenant info
    try {
      const t0 = performance.now();
      const res = await fetch(`${cfg.apiUrl}/api/v1/widget/config?api_key=${encodeURIComponent(cfg.apiKey)}`);
      if (!res.ok) { console.error(`[WebTalkAI] Bootstrap failed HTTP ${res.status} — check apiKey and apiUrl`); return; }
      tenant = await res.json();
      console.log(`[WebTalkAI] connected ${Math.round(performance.now()-t0)}ms — tenant: ${tenant?.company_name}`);
    } catch (e) {
      console.error("[WebTalkAI] Bootstrap failed (network):", e);
      return;
    }

    try {
      injectCSS();
      buildUI();
    } catch (e) {
      console.error("[WebTalkAI] UI error:", e.message || e, e);
    }
  }

  window.WebTalkAI = {
    init,
    version: V,
    open:  () => { if (!panelOpen) togglePanel(); },
    close: () => { if (panelOpen)  togglePanel(); },
  };
})();
