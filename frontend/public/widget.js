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
  let recognition = null, currentAudio = null, currentAudioUrl = null;
  // TTS sentence pipeline — lets audio start while text is still streaming
  let ttsQueue = [], ttsRunning = false, ttsPendingText = "";
  // AbortController for the current SSE stream (enables interruption)
  let streamAbort = null;
  // Resolve handle for currently-playing audio Promise (so stopSpeaking can unblock _ttsDrain)
  let _ttsResolve = null;
  // AbortController for in-flight TTS fetch (cancelled when speaking is stopped)
  let _ttsFetchAbort = null;
  // ── Mouth canvas lip-sync ──────────────────────────────────────────────────
  let _mouthCanvas = null, _mouthCtx = null;
  let _skinColor   = { r: 188, g: 150, b: 128 };   // default; overridden by skin-sample
  let _smoothMouthAmp = 0;
  // ── D-ID Streams state ──────────────────────────────────────────────────────
  let _didPeer = null, _didStreamId = null, _didSessionId = null;
  let _didReady = false, _didSpeakEndTime = 0, _didSpeakTimer = null;
  let _didAudioCtx = null, _didAnimId = null, _didSpeakStarted = false;
  let _didLastText = "";

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
  function setActive(_on) { /* compat stub — state driven by setAvatarState */ }

  const AV_STATES = ["av-idle","av-thinking","av-listening","av-speaking"];
  const STATUS_TEXT = { idle:"Ask about this site", thinking:"Thinking…", listening:"Listening…", speaking:"Speaking…" };

  function setAvatarState(state) {
    const wrap  = document.getElementById("wtai-photo-wrap");
    const photo = document.getElementById("wtai-photo");
    const glow  = document.getElementById("wtai-photo-glow");
    const pill  = document.getElementById("wtai-statpill");
    const sub   = document.getElementById("wtai-status");

    [wrap, photo, pill].forEach(el => {
      if (!el) return;
      AV_STATES.forEach(c => el.classList.remove(c));
      el.classList.add("av-" + state);
    });

    if (glow) {
      AV_STATES.forEach(c => glow.classList.remove(c));
      if (state !== "idle") glow.classList.add("av-" + state);
    }
    if (sub) sub.textContent = STATUS_TEXT[state] || "";

    // ── Video mode: drive CSS animations on idle video (no crossfade) ─────────
    if (photo && photo.tagName === "VIDEO") {
      if (state === "speaking") {
        photo.style.animation = "wtai-speak-bob .42s ease-in-out infinite alternate";
      } else if (state === "listening") {
        photo.style.animation = "wtai-listen-pulse 1.2s ease-in-out infinite";
      } else {
        photo.style.animation = "wtai-breathe 5s ease-in-out infinite";
      }
    }

    // Mic overlay button class
    const micOv = document.getElementById("wtai-mic");
    if (micOv && state === "listening") micOv.classList.add("on");
    else if (micOv) micOv.classList.remove("on");
  }

  /** Sync send button appearance: stop (red ×) while streaming, send arrow otherwise */
  function _updateSendBtn() {
    if (!sendBtn) return;
    if (streaming) {
      sendBtn.innerHTML = ICO.close;
      sendBtn.disabled  = false;
      sendBtn.title     = "Stop response";
      sendBtn.classList.add("stop");
    } else {
      sendBtn.innerHTML = ICO.send;
      sendBtn.disabled  = !inputEl?.value.trim();
      sendBtn.title     = "Send";
      sendBtn.classList.remove("stop");
    }
  }

  /** Interrupt the current SSE stream and TTS without sending a new message */
  function _interruptStream() {
    if (streamAbort) { streamAbort.abort(); streamAbort = null; }
    stopSpeaking();
    // Keep partial AI reply if it has content, else remove empty placeholder
    const last = msgs[msgs.length - 1];
    if (last?.streaming) {
      if (last.content?.trim()) last.streaming = false;
      else msgs.pop();
    }
    streaming = false;
    ttsPendingText = "";
    setAvatarState("idle");
    _updateSendBtn();
    render();
  }

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
.wtai-send.stop{background:linear-gradient(135deg,#ef4444,#dc2626) !important;box-shadow:0 2px 8px rgba(239,68,68,.5) !important;opacity:1 !important;cursor:pointer !important}
.wtai-send svg{width:14px;height:14px;fill:#fff}
.wtai-foot{text-align:center;padding:5px;font-size:10px;color:#cbd5e1;border-top:1px solid rgba(148,163,184,.08);flex-shrink:0}
.wtai-foot a{color:${p};text-decoration:none}
@media(max-width:480px){.wtai-panel{right:8px;left:8px;bottom:8px;width:auto;max-width:none;height:calc(100vh - 88px)}.wtai-launch{right:16px;bottom:16px}}

/* ── Grace-style photo/video header ─────────────────────────────────────── */
.wtai-photo-wrap{position:relative;width:100%;height:230px;overflow:hidden;background:#111827;flex-shrink:0}
/* Both <img> and <video> share base styles */
.wtai-photo{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;object-position:center 8%;display:block;transition:opacity .45s cubic-bezier(.4,0,.2,1),transform .15s ease}
/* Talking-video layer — z-index 2, hidden until speaking */
.wtai-photo-talk{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;object-position:center 8%;display:block;opacity:0;transition:opacity .35s cubic-bezier(.4,0,.2,1);z-index:2;pointer-events:none}
/* Idle / speaking animations (photo fallback only; videos move naturally) */
.wtai-photo-static.av-idle{animation:wtai-breathe 5s ease-in-out infinite}
@keyframes wtai-breathe{0%,100%{transform:scale(1) translateY(0)}50%{transform:scale(1.009) translateY(-1.5px)}}
.wtai-photo-static.av-speaking{animation:wtai-speak-bob .42s ease-in-out infinite alternate}
@keyframes wtai-speak-bob{from{transform:scale(1.001) translateY(0) rotate(0deg)}to{transform:scale(1.013) translateY(-3px) rotate(0.2deg)}}
.wtai-photo-static.av-listening{animation:wtai-listen-pulse 1.2s ease-in-out infinite}
@keyframes wtai-listen-pulse{0%,100%{transform:scale(1)}50%{transform:scale(1.005)}}
/* State glow inset border */
.wtai-photo-glow{position:absolute;inset:0;pointer-events:none;transition:box-shadow .35s,border .35s;border:3px solid transparent}
.wtai-photo-glow.av-thinking{border-color:rgba(59,130,246,.55);box-shadow:inset 0 0 30px rgba(59,130,246,.25)}
.wtai-photo-glow.av-listening{border-color:rgba(16,185,129,.6);box-shadow:inset 0 0 30px rgba(16,185,129,.25)}
.wtai-photo-glow.av-speaking{border-color:${p}bb;box-shadow:inset 0 0 30px ${p}33,0 0 0 2px ${p}55}
/* Top gradient bar (name + controls) */
.wtai-topbar{position:absolute;top:0;left:0;right:0;padding:10px 12px 24px;background:linear-gradient(to bottom,rgba(0,0,0,.65) 0%,transparent 100%);display:flex;align-items:flex-start;justify-content:space-between;z-index:2}
.wtai-topbar-info{display:flex;flex-direction:column;gap:1px}
.wtai-topbar-name{color:#fff;font-size:14px;font-weight:700;text-shadow:0 1px 4px rgba(0,0,0,.5);line-height:1.2}
.wtai-topbar-role{color:rgba(255,255,255,.75);font-size:10.5px;text-shadow:0 1px 3px rgba(0,0,0,.4)}
.wtai-topbar-btns{display:flex;gap:2px}
.wtai-hbtn-w{width:28px;height:28px;border:none;background:rgba(0,0,0,.35);cursor:pointer;border-radius:8px;display:flex;align-items:center;justify-content:center;color:rgba(255,255,255,.85);backdrop-filter:blur(4px);transition:background .15s;flex-shrink:0}
.wtai-hbtn-w:hover{background:rgba(0,0,0,.55)}
.wtai-hbtn-w svg{width:14px;height:14px;fill:currentColor}
/* Bottom controls bar */
.wtai-photo-btm{position:absolute;bottom:0;left:0;right:0;padding:18px 12px 10px;background:linear-gradient(to top,rgba(0,0,0,.65) 0%,transparent 100%);display:flex;align-items:flex-end;gap:10px;z-index:2}
/* Waveform bars */
.wtai-wave{display:flex;gap:2.5px;align-items:flex-end;height:26px;flex:1;opacity:0;transition:opacity .3s;pointer-events:none}
.wtai-photo-wrap.av-speaking .wtai-wave{opacity:1}
.wtai-photo-wrap.av-listening .wtai-wave{opacity:.5}
.wtai-wave span{width:3px;background:rgba(255,255,255,.85);border-radius:1.5px;min-height:3px;flex-shrink:0;transition:height .04s linear}
/* Status pill */
.wtai-statpill{display:inline-flex;align-items:center;gap:5px;padding:3px 9px;border-radius:20px;font-size:10.5px;font-weight:600;color:#fff;background:rgba(0,0,0,.4);backdrop-filter:blur(4px);flex-shrink:0}
.wtai-statpill-dot{width:7px;height:7px;border-radius:50%;background:#64748b;transition:background .3s}
.av-thinking  .wtai-statpill-dot{background:#60a5fa;animation:wtai-dot-pulse .9s ease-in-out infinite}
.av-listening .wtai-statpill-dot{background:#34d399;animation:wtai-dot-pulse .7s ease-in-out infinite}
.av-speaking  .wtai-statpill-dot{background:#e879f9;animation:wtai-dot-pulse .5s ease-in-out infinite}
@keyframes wtai-dot-pulse{0%,100%{transform:scale(1)}50%{transform:scale(1.5)}}
.wtai-mic-ov{width:32px;height:32px;border-radius:50%;border:none;background:rgba(255,255,255,.15);backdrop-filter:blur(4px);cursor:pointer;display:flex;align-items:center;justify-content:center;color:#fff;transition:background .15s;flex-shrink:0}
.wtai-mic-ov:hover{background:rgba(255,255,255,.28)}
.wtai-mic-ov.on{background:#ef444480;animation:wtai-dot-pulse 1.2s ease-in-out infinite}
.wtai-mic-ov svg{width:14px;height:14px;fill:currentColor}

/* ── Eye-blink overlays ────────────────────────────────────────────────── */
.wtai-blink-eye{position:absolute;width:22%;height:11%;border-radius:0 0 55% 55%/0 0 80% 80%;background:linear-gradient(to bottom,rgba(18,12,8,0.02) 0%,rgba(18,12,8,0.9) 55%,rgba(18,12,8,0.88) 100%);pointer-events:none;z-index:5;transform:scaleY(0);transform-origin:top center;transform-box:fill-box;animation:wtai-blink-eye var(--bdelay,4.5s) ease-in-out infinite}
#wtai-blink-l{left:24%;top:28%}
#wtai-blink-r{left:54%;top:28%;--bdelay:5.4s}
@keyframes wtai-blink-eye{0%,93%,100%{transform:scaleY(0)}95.5%,96.5%{transform:scaleY(1)}97%{transform:scaleY(0.08)}98.5%{transform:scaleY(0.92)}}
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

  // FACE_SVG removed — widget now uses a real photo (cfg.avatarUrl).

  // ── Lip-sync via Web Audio API → waveform bars + canvas mouth ───────────────
  let _lipAudioCtx = null, _lipAnimId = null, _lipAnalyser = null, _lipSource = null;
  const NUM_BARS = 12;

  function _getBar(i) { return document.getElementById("wtai-wb" + i); }

  /** Initialise mouth canvas — call lazily when panel is first open */
  function _initMouthCanvas(photoEl) {
    if (_mouthCanvas) return;
    const wrap = document.getElementById("wtai-photo-wrap");
    if (!wrap) return;
    const W = wrap.offsetWidth  || 380;
    const H = wrap.offsetHeight || 230;
    _mouthCanvas = document.getElementById("wtai-mouth-cv");
    if (!_mouthCanvas) return;
    _mouthCanvas.width  = W;
    _mouthCanvas.height = H;
    _mouthCtx = _mouthCanvas.getContext("2d");
    _sampleSkinColor(photoEl, W, H);
  }

  /** Sample average cheek-area colour so the skin-fill matches the photo */
  function _sampleSkinColor(photoEl, W, H) {
    try {
      const tmp = document.createElement("canvas");
      tmp.width = W; tmp.height = H;
      const tc = tmp.getContext("2d");
      tc.drawImage(photoEl, 0, 0, W, H);
      const pts = [[W*0.31,H*0.64],[W*0.69,H*0.64],[W*0.28,H*0.59],[W*0.72,H*0.59]];
      let r=0,g=0,b=0,n=0;
      for (const [x,y] of pts) {
        try { const px=tc.getImageData(~~x,~~y,1,1).data; if(px[3]>80){r+=px[0];g+=px[1];b+=px[2];n++;} } catch{}
      }
      if (n > 0) _skinColor = { r:r/n, g:g/n, b:b/n };
    } catch {} // CORS-tainted — keep default
  }

  /** Draw animated mouth at current openAmt (0 = closed, 1 = wide open) */
  function _drawMouth(openAmt) {
    if (!_mouthCtx || !_mouthCanvas) return;
    const W=_mouthCanvas.width, H=_mouthCanvas.height, ctx=_mouthCtx;
    ctx.clearRect(0,0,W,H);
    if (openAmt < 0.02) return;

    const cx=W*0.50, cy=H*0.80, mw=W*0.26, mh=H*0.068;
    const {r,g,b} = _skinColor;
    const gap = openAmt * mh * 4;   // max opening ≈ 4 × resting lip height

    // ① Skin-tone gradient erases the closed-lip pixels from the photo
    const sg = ctx.createRadialGradient(cx,cy,0,cx,cy,mw*0.65);
    sg.addColorStop(0,   `rgba(${~~r},${~~g},${~~b},1)`);
    sg.addColorStop(0.6, `rgba(${~~r},${~~g},${~~b},0.9)`);
    sg.addColorStop(1,   `rgba(${~~r},${~~g},${~~b},0)`);
    ctx.fillStyle=sg; ctx.beginPath();
    ctx.ellipse(cx,cy, mw*0.65, mh*0.52+gap*0.58, 0,0,Math.PI*2); ctx.fill();

    // ② Inner mouth (dark cavity)
    if (gap > 0.5) {
      const mg = ctx.createRadialGradient(cx,cy+gap*0.12,0,cx,cy+gap*0.12,mw*0.44);
      mg.addColorStop(0,  "rgba(16,6,6,1)");
      mg.addColorStop(0.7,"rgba(32,10,10,0.97)");
      mg.addColorStop(1,  "rgba(52,16,16,0.18)");
      ctx.fillStyle=mg; ctx.beginPath();
      ctx.ellipse(cx,cy+gap*0.12, mw*0.37, gap*0.52+0.5, 0,0,Math.PI*2); ctx.fill();

      // ③ Teeth (when open enough)
      if (openAmt > 0.22) {
        const tw=mw*0.52, th=Math.min(gap*0.36,mh*0.88), ty=cy-th*0.52;
        const tg=ctx.createLinearGradient(cx,ty,cx,ty+th);
        tg.addColorStop(0,"rgba(253,250,246,0.94)"); tg.addColorStop(1,"rgba(238,232,222,0.86)");
        ctx.fillStyle=tg; ctx.beginPath(); ctx.rect(cx-tw/2,ty,tw,th); ctx.fill();
        ctx.strokeStyle="rgba(195,188,174,0.3)"; ctx.lineWidth=0.7;
        for(let i=1;i<=3;i++){const tx=cx-tw/2+(tw/4)*i;ctx.beginPath();ctx.moveTo(tx,ty+th*0.06);ctx.lineTo(tx,ty+th*0.88);ctx.stroke();}
      }
    }

    // ④ Upper lip — cupid's bow shape
    const ulr=~~(r*0.70),ulg=~~(g*0.56),ulb=~~(b*0.54);
    const topY=cy-mh*0.5-gap*0.44, ucY=cy-gap*0.38;
    ctx.fillStyle=`rgba(${ulr},${ulg},${ulb},0.94)`;
    ctx.beginPath();
    ctx.moveTo(cx-mw*0.47, ucY+mh*0.1);
    ctx.bezierCurveTo(cx-mw*0.38,ucY-mh*0.06, cx-mw*0.21,topY+mh*0.03, cx-mw*0.09,topY+mh*0.14);
    ctx.bezierCurveTo(cx-mw*0.04,topY+mh*0.2,  cx+mw*0.04,topY+mh*0.2,  cx+mw*0.09,topY+mh*0.14);
    ctx.bezierCurveTo(cx+mw*0.21,topY+mh*0.03, cx+mw*0.38,ucY-mh*0.06,  cx+mw*0.47,ucY+mh*0.1);
    ctx.bezierCurveTo(cx+mw*0.34,ucY+mh*0.22,  cx-mw*0.34,ucY+mh*0.22,  cx-mw*0.47,ucY+mh*0.1);
    ctx.closePath(); ctx.fill();
    // philtrum highlight
    ctx.fillStyle=`rgba(${Math.min(255,ulr+30)},${Math.min(255,ulg+22)},${Math.min(255,ulb+22)},0.30)`;
    ctx.beginPath(); ctx.ellipse(cx,topY+mh*0.22, mw*0.09,mh*0.045, 0,0,Math.PI*2); ctx.fill();

    // ⑤ Lower lip — fuller/shinier
    const llr=~~(r*0.74),llg=~~(g*0.60),llb=~~(b*0.58);
    const lcY=cy+gap*0.40, btmY=cy+mh*0.5+gap*0.74;
    ctx.fillStyle=`rgba(${llr},${llg},${llb},0.94)`;
    ctx.beginPath();
    ctx.moveTo(cx-mw*0.47, lcY-mh*0.08);
    ctx.bezierCurveTo(cx-mw*0.41,lcY+mh*0.11, cx-mw*0.19,btmY-mh*0.04, cx,btmY);
    ctx.bezierCurveTo(cx+mw*0.19,btmY-mh*0.04, cx+mw*0.41,lcY+mh*0.11, cx+mw*0.47,lcY-mh*0.08);
    ctx.bezierCurveTo(cx+mw*0.35,lcY-mh*0.13, cx-mw*0.35,lcY-mh*0.13, cx-mw*0.47,lcY-mh*0.08);
    ctx.closePath(); ctx.fill();
    // lower lip highlight
    ctx.fillStyle=`rgba(${Math.min(255,llr+45)},${Math.min(255,llg+32)},${Math.min(255,llb+32)},0.36)`;
    ctx.beginPath(); ctx.ellipse(cx,btmY-mh*0.22, mw*0.17,mh*0.065, 0,0,Math.PI*2); ctx.fill();
  }

  function startLipSync(audioEl) {
    stopLipSync();
    // Init mouth canvas (lazy — photo wrap must be visible)
    const photo = document.getElementById("wtai-photo");
    if (photo && !_mouthCanvas) _initMouthCanvas(photo);

    try {
      if (!_lipAudioCtx) _lipAudioCtx = new (window.AudioContext || window.webkitAudioContext)();
      _lipAnalyser = _lipAudioCtx.createAnalyser();
      _lipAnalyser.fftSize = 256;
      _lipAnalyser.smoothingTimeConstant = 0.5;
      _lipSource = _lipAudioCtx.createMediaElementSource(audioEl);
      _lipSource.connect(_lipAnalyser);
      _lipAnalyser.connect(_lipAudioCtx.destination);
    } catch { return; }

    const data = new Uint8Array(_lipAnalyser.frequencyBinCount);

    function tick() {
      _lipAnimId = requestAnimationFrame(tick);
      _lipAnalyser.getByteFrequencyData(data);

      // ── Waveform bars ────────────────────────────────────────────────────
      for (let i = 0; i < NUM_BARS; i++) {
        const bar = _getBar(i);
        if (!bar) continue;
        const bin = Math.floor(2 + i * 4);
        const h = Math.max(3, Math.round((data[bin] / 255) * 24));
        bar.style.height = h + "px";
      }

      // ── Mouth canvas ─────────────────────────────────────────────────────
      // RMS of speech-frequency bins (2–50) as amplitude signal
      let sum = 0;
      for (let i = 2; i < 50; i++) sum += data[i] * data[i];
      const rms = Math.sqrt(sum / 48) / 255;
      // Smooth: fast attack, slower release for natural feel
      const target = rms > _smoothMouthAmp ? rms : _smoothMouthAmp * 0.82;
      _smoothMouthAmp += (target - _smoothMouthAmp) * 0.25;
      _drawMouth(Math.min(1, _smoothMouthAmp * 3.8));
    }
    tick();
  }

  function stopLipSync() {
    if (_lipAnimId) { cancelAnimationFrame(_lipAnimId); _lipAnimId = null; }
    try { if (_lipSource) { _lipSource.disconnect(); _lipSource = null; } } catch {}
    _smoothMouthAmp = 0;
    if (_mouthCtx && _mouthCanvas) _mouthCtx.clearRect(0, 0, _mouthCanvas.width, _mouthCanvas.height);
    for (let i = 0; i < NUM_BARS; i++) {
      const b = _getBar(i); if (b) b.style.height = "3px";
    }
  }

  // ── D-ID Streams neural lip-sync ─────────────────────────────────────────────

  async function _initDIDStream() {
    if (!cfg.didEnabled || !cfg.didSourceUrl) return;
    if (_didPeer) return;  // already initialised

    try {
      const res = await fetch(`${cfg.apiUrl}/api/v1/widget/avatar/stream/create`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-API-Key": cfg.apiKey },
        body: JSON.stringify({
          source_url: cfg.didSourceUrl,
          driver_url: "bank://lively/driver",
          output_resolution: 512,
          stream_warmup: true,
          config: { stitch: true, fluent: true, pad_audio: 0.0 },
        }),
      });
      if (!res.ok) { console.warn("[WebTalkAI] D-ID create failed", res.status); return; }
      const data = await res.json();

      _didStreamId  = data.id;
      _didSessionId = data.session_id;

      _didPeer = new RTCPeerConnection({ iceServers: data.ice_servers });

      _didPeer.onicecandidate = async (evt) => {
        if (!evt.candidate || !_didStreamId || !_didSessionId) return;
        try {
          await fetch(`${cfg.apiUrl}/api/v1/widget/avatar/stream/${_didStreamId}/ice`, {
            method: "POST",
            headers: { "Content-Type": "application/json", "X-API-Key": cfg.apiKey },
            body: JSON.stringify({
              candidate:     evt.candidate.candidate,
              sdpMid:        evt.candidate.sdpMid,
              sdpMLineIndex: evt.candidate.sdpMLineIndex,
              session_id:    _didSessionId,
            }),
          });
        } catch {}
      };

      _didPeer.ontrack = (evt) => {
        if (!evt.streams?.[0]) return;
        const didVid = document.getElementById("wtai-did-video");
        if (didVid) {
          didVid.srcObject = evt.streams[0];
          didVid.play().catch(() => {});
        }
        _didReady = true;
        console.log("[WebTalkAI] D-ID Streams ready");
      };

      _didPeer.onconnectionstatechange = () => {
        const s = _didPeer?.connectionState;
        if (s === "failed" || s === "disconnected") {
          _didReady = false;
          _didPeer  = null;
        }
      };

      // Exchange SDP
      await _didPeer.setRemoteDescription(new RTCSessionDescription(data.offer));
      const answer = await _didPeer.createAnswer();
      await _didPeer.setLocalDescription(answer);
      await fetch(`${cfg.apiUrl}/api/v1/widget/avatar/stream/${_didStreamId}/sdp`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-API-Key": cfg.apiKey },
        body: JSON.stringify({ answer: { type: answer.type, sdp: answer.sdp }, session_id: _didSessionId }),
      });
    } catch (e) {
      console.warn("[WebTalkAI] D-ID init failed:", e);
      _didPeer   = null;
      _didReady  = false;
    }
  }

  /** Send full answer text to D-ID for neural lip-sync; falls back to TTS if not ready. */
  function _speakDID(text) {
    if (!_didReady || !_didStreamId || !_didSessionId) {
      ttsEnqueue(text);
      return;
    }
    if (_didSpeakTimer) { clearTimeout(_didSpeakTimer); _didSpeakTimer = null; }
    _didLastText     = text;
    _didSpeakStarted = false;

    // Show D-ID video overlay
    const didVid = document.getElementById("wtai-did-video");
    if (didVid) didVid.style.opacity = "1";
    speaking = true;
    setAvatarState("speaking");

    fetch(`${cfg.apiUrl}/api/v1/widget/avatar/stream/${_didStreamId}/speak`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-API-Key": cfg.apiKey },
      body: JSON.stringify({
        script: {
          type:      "text",
          subtitles: false,
          provider:  { type: cfg.didVoiceProvider, voice_id: cfg.didVoiceId },
          input:     text,
        },
        config:     { fluent: true, pad_audio: 0.0, stitch: true },
        session_id: _didSessionId,
      }),
    }).then(() => {
      _didSpeakStarted = false;
      setTimeout(() => _startDIDAudioMonitor(), 400);
    }).catch(() => _onDIDSpeakDone());
  }

  function _onDIDSpeakDone() {
    _stopDIDAudioMonitor();
    _didSpeakStarted = false;
    if (_didSpeakTimer) { clearTimeout(_didSpeakTimer); _didSpeakTimer = null; }
    const didVid = document.getElementById("wtai-did-video");
    if (didVid) didVid.style.opacity = "0";
    speaking = false;
    setAvatarState(streaming ? "thinking" : "idle");
  }

  function _startDIDAudioMonitor() {
    _stopDIDAudioMonitor();
    const didVid = document.getElementById("wtai-did-video");
    if (!didVid?.srcObject) { _onDIDSpeakDone(); return; }

    try {
      if (!_didAudioCtx) _didAudioCtx = new (window.AudioContext || window.webkitAudioContext)();
      const analyser = _didAudioCtx.createAnalyser();
      analyser.fftSize = 256;
      analyser.smoothingTimeConstant = 0.4;
      const source = _didAudioCtx.createMediaStreamSource(didVid.srcObject);
      source.connect(analyser);
      const data = new Uint8Array(analyser.frequencyBinCount);
      let silentFrames = 0, totalFrames = 0;

      // Also drive waveform bars from D-ID audio
      function tick() {
        _didAnimId = requestAnimationFrame(tick);
        analyser.getByteFrequencyData(data);
        totalFrames++;

        // Waveform bars
        for (let i = 0; i < NUM_BARS; i++) {
          const bar = _getBar(i);
          if (bar) bar.style.height = Math.max(3, Math.round((data[Math.floor(2 + i * 4)] / 255) * 24)) + "px";
        }

        if (totalFrames < 15) return;  // skip first ~250ms warmup

        const rms = data.reduce((s, v) => s + v * v, 0) / data.length;
        if (rms < 8) {
          // Only count silence after we've seen some audio (speech has started)
          if (_didSpeakStarted) silentFrames++;
          if (silentFrames >= 35) _onDIDSpeakDone();
        } else {
          _didSpeakStarted = true;
          silentFrames = 0;
        }
      }
      tick();
    } catch {
      // Fallback timer: estimate duration from word count
      const ms = Math.max(3000, (_didLastText.split(" ").length || 10) * 320);
      _didSpeakTimer = setTimeout(_onDIDSpeakDone, ms);
    }
  }

  function _stopDIDAudioMonitor() {
    if (_didAnimId) { cancelAnimationFrame(_didAnimId); _didAnimId = null; }
    try { if (_didAudioCtx) { _didAudioCtx.close(); } } catch {}
    _didAudioCtx = null;
    for (let i = 0; i < NUM_BARS; i++) {
      const b = _getBar(i); if (b) b.style.height = "3px";
    }
  }

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
    const waveBarIds = Array.from({length:12}, (_,i) => `<span id="wtai-wb${i}" style="height:3px"></span>`).join("");
    // Decide avatar rendering mode:
    //   VIDEO MODE  → single idle <video> loop + canvas lip-sync overlay (audio-driven)
    //   PHOTO MODE  → <img> + canvas mouth overlay + CSS blink eyes (fallback)
    const useVid = !!(cfg.avatarIdleVideo || cfg.avatarTalkVideo);
    // D-ID overlay video (shown when D-ID is speaking, hidden otherwise)
    const didVideoEl = cfg.didEnabled ? `
        <video id="wtai-did-video" class="wtai-photo-talk" autoplay playsinline
          style="opacity:0;transition:opacity .35s cubic-bezier(.4,0,.2,1);z-index:4;pointer-events:none"></video>
    ` : "";
    const avatarMedia = useVid ? `
        <video id="wtai-photo" class="wtai-photo av-idle" autoplay loop muted playsinline crossorigin="anonymous"
          style="animation:wtai-breathe 5s ease-in-out infinite">
          <source src="${cfg.avatarIdleVideo || cfg.avatarTalkVideo}" type="video/mp4">
        </video>
        ${didVideoEl}
        <canvas id="wtai-mouth-cv" style="position:absolute;top:0;left:0;width:100%;height:100%;pointer-events:none;z-index:3"></canvas>
        <div class="wtai-blink-eye" id="wtai-blink-l"></div>
        <div class="wtai-blink-eye" id="wtai-blink-r"></div>
    ` : `
        <img class="wtai-photo wtai-photo-static av-idle" id="wtai-photo" src="${cfg.avatarUrl}" crossorigin="anonymous" alt="${name}" draggable="false">
        ${didVideoEl}
        <canvas id="wtai-mouth-cv" style="position:absolute;top:0;left:0;width:100%;height:100%;pointer-events:none;z-index:3"></canvas>
        <div class="wtai-blink-eye" id="wtai-blink-l"></div>
        <div class="wtai-blink-eye" id="wtai-blink-r"></div>
    `;
    panel.innerHTML = `
      <div class="wtai-photo-wrap av-idle" id="wtai-photo-wrap">
        ${avatarMedia}
        <div class="wtai-photo-glow" id="wtai-photo-glow"></div>
        <div class="wtai-topbar">
          <div class="wtai-topbar-info">
            <div class="wtai-topbar-name">${name}</div>
            <div class="wtai-topbar-role">AI Assistant</div>
          </div>
          <div class="wtai-topbar-btns">
            <button class="wtai-hbtn-w" id="wtai-mute" title="Toggle voice">${ICO.vol}</button>
            <button class="wtai-hbtn-w" id="wtai-close" title="Close">${ICO.close}</button>
          </div>
        </div>
        <div class="wtai-photo-btm">
          <div class="wtai-statpill" id="wtai-statpill">
            <span class="wtai-statpill-dot" id="wtai-statdot"></span>
            <span id="wtai-status">Ask about this site</span>
          </div>
          <div class="wtai-wave" id="wtai-wave">${waveBarIds}</div>
          ${cfg.voiceEnabled ? `<button class="wtai-mic-ov" id="wtai-mic" title="Voice input">${ICO.mic}</button>` : ""}
        </div>
      </div>
      <div class="wtai-msgs" id="wtai-msgs"></div>
      <div class="wtai-inrow">
        <input class="wtai-input" id="wtai-input" type="text" placeholder="Ask anything…" autocomplete="off"/>
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
    avatarEl= document.getElementById("wtai-photo-wrap");  // photo-wrap gets state classes
    muteBtn = document.getElementById("wtai-mute");

    // Events
    launcher.onclick = togglePanel;
    document.getElementById("wtai-close").onclick = togglePanel;
    sendBtn.onclick = () => {
      if (streaming && !inputEl.value.trim()) _interruptStream();  // red × with empty input = just stop
      else send(inputEl.value);                                     // send (interrupts if needed)
    };
    inputEl.addEventListener("keydown", e => { if (e.key === "Enter" && !e.shiftKey && inputEl.value.trim()) send(inputEl.value); });
    inputEl.addEventListener("input",   () => _updateSendBtn());
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
      // Warm up D-ID Streams WebRTC session in the background
      if (cfg.didEnabled && cfg.didSourceUrl) _initDIDStream();
    } else {
      const { p, a } = cfg.theme;
      launcher.style.background = `linear-gradient(135deg,${p},${a})`;
      launcher.innerHTML = ICO.chat;
      stopSpeaking();
      // Tear down D-ID session to free resources
      if (_didPeer) {
        if (_didStreamId && _didSessionId) {
          fetch(`${cfg.apiUrl}/api/v1/widget/avatar/stream/${_didStreamId}`, {
            method: "DELETE",
            headers: { "X-API-Key": cfg.apiKey },
          }).catch(() => {});
        }
        try { _didPeer.close(); } catch {}
        _didPeer = null; _didStreamId = null; _didSessionId = null; _didReady = false;
      }
    }
  }

  // ── Send message (SSE streaming) ─────────────────────────────────────────────
  async function send(text) {
    if (!text || !text.trim()) return;
    text = text.trim();

    // ── Interrupt any in-progress response before starting a new one ──
    if (streamAbort) { streamAbort.abort(); streamAbort = null; }
    stopSpeaking();
    if (streaming) {
      const last = msgs[msgs.length - 1];
      if (last?.streaming) {
        if (last.content?.trim()) last.streaming = false;  // keep partial
        else msgs.pop();                                    // discard empty
      }
      streaming = false;
    }
    ttsPendingText = "";
    // ─────────────────────────────────────────────────────────────────

    inputEl.value = "";
    msgs.push({ role: "user", content: text });
    msgs.push({ role: "assistant", content: "", streaming: true });
    streaming = true;
    setAvatarState("thinking");
    _updateSendBtn();
    render();

    let fullAnswer = "", sources = [];
    streamAbort = new AbortController();

    try {
      const res = await fetch(`${cfg.apiUrl}/api/v1/widget/chat/stream`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-API-Key": cfg.apiKey },
        body: JSON.stringify({ message: text, session_id: sessionId, use_voice: false }),
        signal: streamAbort.signal,
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
              fullAnswer        += evt.text;
              ttsPendingText    += evt.text;
              const last = msgs[msgs.length - 1];
              if (last) { last.content = fullAnswer; last.streaming = true; }
              render();
              // When D-ID is active, skip per-sentence TTS — full answer is sent to D-ID at the end
              if (!cfg.didEnabled || !_didReady) {
                // Flush at sentence boundary as soon as we have ≥4 chars
                let m;
                while ((m = /^([\s\S]{4,}?[.!?])\s+/.exec(ttsPendingText)) !== null) {
                  ttsEnqueue(m[1]);
                  ttsPendingText = ttsPendingText.slice(m[0].length);
                }
                // Force-flush at word boundary after 38 chars — shorter chunks = faster Cartesia synthesis
                if (ttsPendingText.length > 38) {
                  const cut = ttsPendingText.lastIndexOf(" ", 30);
                  if (cut > 8) {
                    ttsEnqueue(ttsPendingText.slice(0, cut));
                    ttsPendingText = ttsPendingText.slice(cut + 1);
                  }
                }
              }
            } else if (evt.type === "sources") {
              sources = evt.sources || [];
            } else if (evt.type === "done") {
              fullAnswer = evt.answer || fullAnswer;
            }
          } catch { /* skip malformed event */ }
        }
      }
    } catch (err) {
      if (err.name === "AbortError") return;  // interrupted — _interruptStream() already cleaned up
      fullAnswer = fullAnswer || (
        err.message === "Failed to fetch"
          ? "Couldn't reach the server. Please check your connection."
          : err.message || "Something went wrong. Please try again."
      );
    } finally {
      streamAbort = null;
      const last = msgs[msgs.length - 1];
      if (last?.streaming) {
        last.content   = fullAnswer || last.content || "I couldn't generate a response. Please try again.";
        last.streaming = false;
        if (sources.length) last.sources = sources;
      }
      streaming = false;
      _updateSendBtn();
      if (!speaking) setAvatarState("idle");
      render();
      // Speak the completed answer
      if (cfg.didEnabled && _didReady) {
        // D-ID neural lip-sync: send full answer at once for best quality
        if (fullAnswer.trim()) _speakDID(fullAnswer.trim());
        ttsPendingText = "";
      } else if (ttsOn && ttsPendingText.trim()) {
        // Cartesia TTS: enqueue any leftover sentence fragment
        ttsEnqueue(ttsPendingText.trim());
        ttsPendingText = "";
      }
    }
  }

  // ── Cartesia TTS — sentence-pipelined with pre-fetching ─────────────────────
  //
  // How it works:
  //   1. Sentences are detected during SSE streaming and enqueued immediately.
  //   2. While sentence N is playing, sentence N+1 is already being fetched
  //      from Cartesia — so there is zero gap between sentences.
  //   3. First audio starts as soon as the first complete sentence appears.

  function ttsEnqueue(text) {
    const t = (text || "").trim();
    if (!t || !ttsOn) return;
    ttsQueue.push(t);
    _ttsDrain();
  }

  /**
   * Fetch MP3 audio for `text` from the backend and return a blob URL.
   * Returns null on any error or if TTS has been turned off.
   */
  async function _fetchAudio(text) {
    // Cancel any previous in-flight fetch and issue a new one
    if (_ttsFetchAbort) _ttsFetchAbort.abort();
    _ttsFetchAbort = new AbortController();
    try {
      const res = await fetch(`${cfg.apiUrl}/api/v1/widget/tts`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-API-Key": cfg.apiKey },
        body: JSON.stringify({ text }),
        signal: _ttsFetchAbort.signal,
      });
      _ttsFetchAbort = null;
      if (!res.ok || !ttsOn) return null;
      return URL.createObjectURL(await res.blob());
    } catch (e) {
      if (e.name === "AbortError") return null;
      return null;
    }
  }

  /**
   * Drain the TTS queue with pre-fetching:
   * while sentence N is playing, sentence N+1 is already being fetched
   * so there is zero gap between sentences.
   */
  async function _ttsDrain() {
    if (ttsRunning) return;
    ttsRunning = true;

    let prefetch = null;
    while (ttsQueue.length > 0 && ttsOn) {
      const chunk = ttsQueue.shift();
      const url   = await (prefetch || _fetchAudio(chunk));
      prefetch    = null;
      if (!url || !ttsOn) continue;

      // Start pre-fetching the next sentence while this one plays
      if (ttsQueue.length > 0 && ttsOn) prefetch = _fetchAudio(ttsQueue[0]);

      currentAudio = new Audio(url); currentAudioUrl = url;
      speaking = true;
      setStatus("Speaking…");
      setAvatarState("speaking");
      setActive(true);

      await new Promise(resolve => {
        // Store resolver so stopSpeaking() can immediately unblock this loop
        _ttsResolve = resolve;
        currentAudio.oncanplay = () => startLipSync(currentAudio);
        currentAudio.onended = () => {
          _ttsResolve = null;
          stopLipSync();
          URL.revokeObjectURL(url);
          currentAudio = null; currentAudioUrl = null;
          resolve();
        };
        currentAudio.onerror = () => { _ttsResolve = null; stopLipSync(); resolve(); };
        currentAudio.play().catch(() => { _ttsResolve = null; resolve(); });
      });
    }

    // Cancel any pending pre-fetch that won't be used (TTS was stopped)
    if (prefetch) prefetch.then(u => { if (u) URL.revokeObjectURL(u); });

    ttsRunning = false;
    if (ttsQueue.length === 0) {
      speaking = false;
      setStatus("Ask about this site");
      setAvatarState(streaming ? "thinking" : "idle");
      setActive(false);
    }
  }

  function stopSpeaking() {
    ttsQueue      = [];
    ttsPendingText = "";
    ttsRunning    = false;
    stopLipSync();
    // Unblock _ttsDrain if it is awaiting currentAudio.onended — pause() never fires onended
    if (_ttsResolve) { _ttsResolve(); _ttsResolve = null; }
    // Cancel any in-flight Cartesia fetch
    if (_ttsFetchAbort) { _ttsFetchAbort.abort(); _ttsFetchAbort = null; }
    if (currentAudio)   { currentAudio.pause();              currentAudio    = null; }
    if (currentAudioUrl){ URL.revokeObjectURL(currentAudioUrl); currentAudioUrl = null; }
    // Cancel any D-ID speak
    _stopDIDAudioMonitor();
    if (_didSpeakTimer) { clearTimeout(_didSpeakTimer); _didSpeakTimer = null; }
    _didSpeakStarted = false;
    const didVid = document.getElementById("wtai-did-video");
    if (didVid) didVid.style.opacity = "0";
    speaking = false;
    setStatus("Ask about this site");
    setAvatarState("idle");
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
      setAvatarState("listening");
      inputEl.placeholder = "Listening…";
    };
    recognition.onend = () => {
      listening = false;
      if (micBtn) { micBtn.classList.remove("on"); micBtn.innerHTML = ICO.mic; }
      setAvatarState("idle");
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
      // Avatar photo URL — defaults to avatar.jpg served alongside widget.js
      avatarUrl: options.avatarUrl || (() => {
        try {
          const src = document.currentScript?.src || Array.from(document.scripts).find(s => s.src.includes("widget"))?.src || "";
          return src ? new URL("avatar.jpg", src).href : (DEFAULT_API + "/avatar.jpg");
        } catch { return DEFAULT_API + "/avatar.jpg"; }
      })(),
      // Optional video loops — set these for Grace-style realistic animation.
      // avatarIdleVideo : short ~3s loop of person sitting naturally (breathing, blinking)
      // avatarTalkVideo : short ~3s loop of person's mouth moving while speaking
      // Leave null → falls back to photo + canvas lip-sync overlay.
      avatarIdleVideo:  options.avatarIdleVideo || null,
      avatarTalkVideo:  options.avatarTalkVideo || null,
      // D-ID Streams neural lip-sync (requires backend DID_API_KEY + a public avatar image URL)
      // didEnabled    : true to enable D-ID Streams (overrides TTS + canvas mouth)
      // didSourceUrl  : publicly accessible URL of the avatar image, e.g. "https://yoursite.com/avatar.jpg"
      // didVoiceProvider / didVoiceId : D-ID voice settings (default: Microsoft Neural Jenny)
      didEnabled:       !!(options.didEnabled && options.didSourceUrl),
      didSourceUrl:     options.didSourceUrl   || "",
      didVoiceProvider: options.didVoiceProvider || "microsoft",
      didVoiceId:       options.didVoiceId       || "en-US-JennyNeural",
    };
    sessionId = sid();
    ttsOn = options.ttsAutoPlay !== false;

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
