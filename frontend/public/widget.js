"use strict";(()=>{var F="2.2.0",de="https://webtalk-ai.onrender.com",pe="wss://webtalk-ai.onrender.com";console.log("%c[WebTalkAI v"+F+"] %cText = REST \xB7 Voice = continuous (VAD)","background:linear-gradient(135deg,#6366f1,#a855f7);color:#fff;padding:2px 8px;border-radius:4px;font-weight:bold","color:#6b7280");var Z={purple:{primary:"#6366f1",accent:"#a855f7"},blue:{primary:"#3b82f6",accent:"#06b6d4"},green:{primary:"#10b981",accent:"#84cc16"},dark:{primary:"#1f2937",accent:"#6366f1"}},l,g=null,u=[],V,v=!1,$=!1,W=!1,_="idle",d=null,q=null,b=null,m=null,y=null,E=null,M=!1,G=0,R=0,Q=0,I=[],A=null,z=null,C=!1,S=!1,T,s,L,h,j,P,U,J,N,ee,X,O=null,D=null;function ue(){try{let e="wtai_session_v2",t=localStorage.getItem(e);return t||(t="s_"+Math.random().toString(36).slice(2,11)+"_"+Date.now(),localStorage.setItem(e,t)),t}catch(e){return"s_"+Date.now()}}function k(e){let t=document.createElement("div");return t.textContent=e,t.innerHTML}function fe(e){try{let t=new URL(e),n=t.pathname.length>18?t.pathname.slice(0,18)+"\u2026":t.pathname;return t.hostname.replace(/^www\./,"")+(n==="/"?"":n)}catch(t){return e.slice(0,30)}}function ge(){let e=l.theme,t=l.position==="bottom-right"?"right":"left",n=`
.wtai-w * { box-sizing: border-box; font-family: -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif; }

/* Launcher button */
.wtai-launcher { position: fixed; ${t}: 24px; bottom: 24px; z-index: 2147483646; width: 64px; height: 64px; border-radius: 50%; background: linear-gradient(135deg,${e.primary},${e.accent}); border: none; cursor: pointer; box-shadow: 0 10px 32px ${e.primary}55, 0 4px 12px rgba(0,0,0,.15); display: flex; align-items: center; justify-content: center; transition: transform .2s; }
.wtai-launcher::before { content:""; position: absolute; inset: -4px; border-radius: 50%; background: linear-gradient(135deg,${e.primary},${e.accent}); opacity: .35; filter: blur(8px); z-index: -1; animation: wtai-launcher-glow 3s ease-in-out infinite; }
@keyframes wtai-launcher-glow { 0%,100% { transform: scale(1); opacity: .35; } 50% { transform: scale(1.1); opacity: .55; } }
.wtai-launcher:hover { transform: scale(1.08); }
.wtai-launcher svg { width: 28px; height: 28px; fill: #fff; }

/* Main panel */
.wtai-panel { position: fixed; ${t}: 24px; bottom: 100px; z-index: 2147483647; width: 400px; max-width: calc(100vw - 32px); height: 620px; max-height: calc(100vh - 130px); background: rgba(255,255,255,.96); backdrop-filter: blur(16px); -webkit-backdrop-filter: blur(16px); border-radius: 22px; box-shadow: 0 24px 70px rgba(15,23,42,.25), 0 4px 14px rgba(15,23,42,.08); display: none; flex-direction: column; overflow: hidden; border: 1px solid rgba(255,255,255,.6); }
.wtai-panel.open { display: flex; animation: wtai-fade .3s cubic-bezier(.16,1,.3,1); }
@keyframes wtai-fade { from { opacity: 0; transform: translateY(14px) scale(.96); } to { opacity: 1; transform: translateY(0) scale(1); } }

/* Header */
.wtai-head { background: linear-gradient(135deg,${e.primary},${e.accent}); color: #fff; padding: 16px 18px; display: flex; align-items: center; gap: 12px; position: relative; overflow: hidden; }
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
.wtai-mbot { width: 28px; height: 28px; border-radius: 50%; background: linear-gradient(135deg,${e.primary},${e.accent}); display: flex; align-items: center; justify-content: center; flex-shrink: 0; box-shadow: 0 2px 6px ${e.primary}33; }
.wtai-mbot svg { width: 14px; height: 14px; fill: #fff; }
.wtai-mbot.err { background: #fbbf24; }
.wtai-bub { max-width: 75%; padding: 10px 14px; border-radius: 16px; font-size: 14px; line-height: 1.5; word-wrap: break-word; white-space: pre-wrap; }
.wtai-msg.user .wtai-bub { background: linear-gradient(135deg,${e.primary},${e.accent}); color: #fff; border-bottom-right-radius: 4px; box-shadow: 0 2px 6px ${e.primary}33; }
.wtai-msg.assistant .wtai-bub { background: #fff; border: 1px solid #e5e7eb; color: #1f2937; border-bottom-left-radius: 4px; }
.wtai-msg.assistant.err .wtai-bub { background: #fef3c7; border-color: #fcd34d; color: #92400e; }
.wtai-caret { display: inline-block; width: 7px; height: 14px; background: #9ca3af; margin-left: 2px; vertical-align: text-bottom; animation: wtai-blink 1s infinite; }
@keyframes wtai-blink { 0%, 50% { opacity: 1; } 51%, 100% { opacity: 0; } }
.wtai-srcs { display: flex; flex-wrap: wrap; gap: 4px; margin-top: 6px; }
.wtai-src { font-size: 10px; color: #6b7280; background: #fff; border: 1px solid #e5e7eb; border-radius: 4px; padding: 2px 6px; text-decoration: none; transition: all .15s; }
.wtai-src:hover { color: ${e.primary}; border-color: ${e.primary}; }
.wtai-typing { display: inline-flex; gap: 3px; align-items: center; padding: 12px 14px; }
.wtai-typing span { width: 6px; height: 6px; border-radius: 50%; background: #9ca3af; animation: wtai-bnce 1.4s ease-in-out infinite; }
.wtai-typing span:nth-child(2) { animation-delay: .15s; }
.wtai-typing span:nth-child(3) { animation-delay: .3s; }
@keyframes wtai-bnce { 0%,80%,100% { transform: scale(.6); opacity: .5; } 40% { transform: scale(1); opacity: 1; } }

/* Suggestions */
.wtai-sugs { padding: 0 12px 8px; display: flex; flex-wrap: wrap; gap: 5px; }
.wtai-sug { font-size: 12px; padding: 6px 10px; border-radius: 14px; background: #fff; border: 1px solid #e5e7eb; color: #4b5563; cursor: pointer; transition: all .15s; }
.wtai-sug:hover { background: #f9fafb; border-color: ${e.primary}; color: ${e.primary}; }

/* Input row */
.wtai-row { padding: 12px; background: #fff; border-top: 1px solid #e5e7eb; display: flex; gap: 8px; align-items: center; }
.wtai-in { flex: 1; border: 1px solid #e5e7eb; border-radius: 22px; padding: 10px 16px; font-size: 14px; outline: none; transition: border-color .15s, box-shadow .15s; background: #fafafa; }
.wtai-in:focus { border-color: ${e.primary}; background: #fff; box-shadow: 0 0 0 3px ${e.primary}1a; }
.wtai-in:disabled { opacity: .6; }
.wtai-btn { width: 40px; height: 40px; border-radius: 50%; border: none; cursor: pointer; display: flex; align-items: center; justify-content: center; flex-shrink: 0; transition: all .15s; }
.wtai-mic { background: #f3f4f6; color: #4b5563; }
.wtai-mic:hover { background: #e5e7eb; transform: scale(1.05); }
.wtai-mic svg { width: 16px; height: 16px; fill: currentColor; }
.wtai-send { background: linear-gradient(135deg,${e.primary},${e.accent}); color: #fff; box-shadow: 0 2px 8px ${e.primary}55; }
.wtai-send:hover:not(:disabled) { transform: scale(1.05); }
.wtai-send:disabled { opacity: .4; cursor: not-allowed; }
.wtai-send svg { width: 15px; height: 15px; fill: #fff; }
.wtai-foot { text-align: center; padding: 6px; font-size: 10px; color: #9ca3af; background: #fff; }
.wtai-foot a { color: ${e.primary}; text-decoration: none; }

/* \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500 Voice mode (full panel takeover) \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500 */
.wtai-voice { position: absolute; inset: 0; z-index: 5; background: linear-gradient(160deg, ${e.primary} 0%, ${e.accent} 100%); color: #fff; display: none; flex-direction: column; align-items: center; justify-content: space-between; padding: 24px 20px; text-align: center; overflow: hidden; }
.wtai-voice.active { display: flex; animation: wtai-vfade .35s cubic-bezier(.16,1,.3,1); }
@keyframes wtai-vfade { from { opacity: 0; } to { opacity: 1; } }

.wtai-voice::before, .wtai-voice::after {
  content:""; position:absolute; width: 360px; height: 360px; border-radius:50%; filter: blur(60px); opacity: .35; z-index:0;
}
.wtai-voice::before { background: ${e.primary}; top: -100px; left: -120px; animation: wtai-blob 12s ease-in-out infinite alternate; }
.wtai-voice::after  { background: ${e.accent};  bottom: -100px; right: -120px; animation: wtai-blob 12s ease-in-out infinite alternate-reverse; }
@keyframes wtai-blob { 0% { transform: translate(0,0); } 100% { transform: translate(40px,40px); } }

.wtai-voice-top { width: 100%; display: flex; justify-content: space-between; align-items: center; position: relative; z-index: 1; }
.wtai-voice-title { font-weight: 600; font-size: 14px; opacity: .95; }
.wtai-voice-x { background: rgba(255,255,255,.18); border: none; color: #fff; width: 32px; height: 32px; border-radius: 50%; cursor: pointer; display: flex; align-items: center; justify-content: center; backdrop-filter: blur(6px); transition: background .15s; }
.wtai-voice-x:hover { background: rgba(255,255,255,.3); }
.wtai-voice-x svg { width: 16px; height: 16px; fill: #fff; }

.wtai-voice-center { display: flex; flex-direction: column; align-items: center; gap: 28px; position: relative; z-index: 1; }

/* \u2500\u2500\u2500\u2500 The AI orb \u2500\u2500\u2500\u2500 */
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
  `.trim(),i=document.createElement("style");i.id="wtai-styles",i.textContent=n,document.head.appendChild(i)}function be(){T=document.createElement("button"),T.className="wtai-w wtai-launcher",T.setAttribute("aria-label","Open AI assistant"),T.innerHTML='<svg viewBox="0 0 24 24"><path d="M12 2C6.48 2 2 6.48 2 12c0 1.86.5 3.6 1.38 5.1L2 22l4.9-1.38C8.4 21.5 10.14 22 12 22c5.52 0 10-4.48 10-10S17.52 2 12 2zm0 18c-1.65 0-3.27-.45-4.7-1.3l-.34-.2-3.04.86.85-3.03-.21-.34C3.45 14.27 3 12.65 3 11c0-4.97 4.03-9 9-9s9 4.03 9 9-4.03 9-9 9z"/><circle cx="8" cy="12" r="1.4"/><circle cx="12" cy="12" r="1.4"/><circle cx="16" cy="12" r="1.4"/></svg>',T.onclick=B,(document.body||document.documentElement).appendChild(T),s=document.createElement("div"),s.className="wtai-w wtai-panel",s.innerHTML=`
    <div class="wtai-head">
      <div class="wtai-avatar"><svg viewBox="0 0 24 24"><path d="M12 2L13.09 8.26L19 7L17.74 13.09L24 12L17.74 10.91L19 17L13.09 15.74L12 22L10.91 15.74L5 17L6.26 10.91L0 12L6.26 13.09L5 7L10.91 8.26L12 2Z"/></svg></div>
      <div style="flex:1;min-width:0;">
        <div class="wtai-name">${k((g==null?void 0:g.company_name)||"AI Assistant")}</div>
        <div class="wtai-status">Trained on this site</div>
      </div>
      <button class="wtai-close" aria-label="Close"><svg viewBox="0 0 24 24"><path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/></svg></button>
    </div>
    <div class="wtai-msgs"></div>
    <div class="wtai-sugs"></div>
    <div class="wtai-row">
      <input type="text" class="wtai-in" placeholder="Ask anything\u2026" autocomplete="off" />
      ${l.voiceEnabled?'<button class="wtai-btn wtai-mic" aria-label="Voice conversation" title="Start voice conversation"><svg viewBox="0 0 24 24"><path d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3zm5.3-3c0 3-2.54 5.1-5.3 5.1S6.7 14 6.7 11H5c0 3.41 2.72 6.23 6 6.72V21h2v-3.28c3.28-.49 6-3.31 6-6.72h-1.7z"/></svg></button>':""}
      <button class="wtai-btn wtai-send" aria-label="Send"><svg viewBox="0 0 24 24"><path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z"/></svg></button>
    </div>
    <div class="wtai-foot">Powered by <a href="https://web-talk-ai.vercel.app" target="_blank" rel="noopener">WebTalk AI</a></div>

    <div class="wtai-voice">
      <div class="wtai-voice-top">
        <div class="wtai-voice-title">${k((g==null?void 0:g.company_name)||"AI Assistant")}</div>
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
  `,(document.body||document.documentElement).appendChild(s),L=s.querySelector(".wtai-msgs"),h=s.querySelector(".wtai-in"),P=s.querySelector(".wtai-send"),j=s.querySelector(".wtai-mic"),U=s.querySelector(".wtai-sugs"),J=s.querySelector(".wtai-voice"),N=s.querySelector(".wtai-orb"),ee=s.querySelector(".wtai-vstat"),X=s.querySelector(".wtai-vcap"),O=s.querySelector(".wtai-wave"),s.querySelector(".wtai-close").onclick=B,P.onclick=()=>K(),h.addEventListener("keydown",e=>{e.key==="Enter"&&!$&&K()}),j&&(j.onclick=oe),s.querySelector('[data-act="start"]').onclick=he,s.querySelector('[data-act="end"]').onclick=le,s.querySelector(".wtai-voice-x").onclick=se}function B(){v=!v,s.classList.toggle("open",v),v?(h.focus(),setTimeout(()=>L.scrollTo({top:L.scrollHeight,behavior:"smooth"}),50)):W&&se()}function H(){L.innerHTML=u.map(e=>{let t='<svg viewBox="0 0 24 24"><path d="M20 9V7c0-1.1-.9-2-2-2h-3c0-1.66-1.34-3-3-3S9 3.34 9 5H6c-1.1 0-2 .9-2 2v2c-1.66 0-3 1.34-3 3s1.34 3 3 3v4c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2v-4c1.66 0 3-1.34 3-3s-1.34-3-3-3zM7.5 11.5c0-.83.67-1.5 1.5-1.5s1.5.67 1.5 1.5S9.83 13 9 13s-1.5-.67-1.5-1.5zM16 17H8v-2h8v2zm-1-4c-.83 0-1.5-.67-1.5-1.5S14.17 10 15 10s1.5.67 1.5 1.5S15.83 13 15 13z"/></svg>',n='<svg viewBox="0 0 24 24"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z"/></svg>',i=e.sources&&e.sources.length&&!e.streaming?`<div class="wtai-srcs">${e.sources.slice(0,4).map(c=>`<a class="wtai-src" href="${k(c)}" target="_blank" rel="noopener">${k(fe(c))}</a>`).join("")}</div>`:"";if(e.role==="user")return`<div class="wtai-msg user"><div class="wtai-bub">${k(e.content)}</div></div>`;let a=e.error?"wtai-msg assistant err":"wtai-msg assistant",r=e.error?"wtai-mbot err":"wtai-mbot",o=e.streaming&&e.content?'<span class="wtai-caret"></span>':"",p=e.streaming&&!e.content?'<div class="wtai-typing"><span></span><span></span><span></span></div>':`${k(e.content)}${o}`;return`<div class="${a}">
      <div class="${r}">${e.error?n:t}</div>
      <div style="max-width:75%"><div class="wtai-bub">${p}</div>${i}</div>
    </div>`}).join(""),L.scrollTo({top:L.scrollHeight,behavior:"smooth"})}function te(){if(u.length>1||$){U.innerHTML="";return}let e=["What is this site about?","What do you offer?","How can I get in touch?"];U.innerHTML=e.map(t=>`<button class="wtai-sug">${k(t)}</button>`).join(""),U.querySelectorAll(".wtai-sug").forEach((t,n)=>{t.onclick=()=>K(e[n])})}async function K(e){let t=(e!=null?e:h.value).trim();if(!t||$)return;h.value="",u.push({role:"user",content:t}),u.push({role:"assistant",content:"",streaming:!0}),$=!0,P.disabled=!0,h.disabled=!0,H(),te();let n=new AbortController,i=setTimeout(()=>n.abort(),6e4);try{let a=await fetch(`${l.apiUrl}/api/v1/widget/chat`,{method:"POST",headers:{"Content-Type":"application/json","X-API-Key":l.apiKey},body:JSON.stringify({api_key:l.apiKey,message:t,conversation_id:V}),signal:n.signal});if(clearTimeout(i),!a.ok){let w="";try{w=await a.text()}catch(x){}throw console.error("[WebTalkAI] HTTP",a.status,w),new Error(a.status===401?"Invalid API key":a.status>=500?"The AI is having trouble. Please try again.":`Server returned ${a.status}.`)}let r=await a.json(),o=r.response||r.answer||"I couldn't generate a response. Please try again.",p=r.sources||[],c=u[u.length-1];c&&(c.content=o,c.sources=p,c.streaming=!1),H(),l.ttsAutoPlay&&o&&we(o).catch(()=>{})}catch(a){clearTimeout(i);let r="Something went wrong.";a instanceof DOMException&&a.name==="AbortError"?r="The AI is starting up \u2014 please wait a moment and try again.":a instanceof TypeError&&a.message==="Failed to fetch"?r="Couldn't reach the server.":a instanceof Error&&(r=a.message);let o=u[u.length-1];o&&o.streaming?(o.content=r,o.streaming=!1,o.error=!0):u.push({role:"assistant",content:r,error:!0}),H()}finally{$=!1,P.disabled=!1,h.disabled=!1,h.focus()}}function ae(){if(!q){let e=window.AudioContext||window.webkitAudioContext;q=new e}return q}function ie(){if(A){try{A.stop()}catch(e){}A=null}}async function ne(e){if(e.byteLength===0)return;ie();let t=ae();t.state==="suspended"&&await t.resume();let n=await t.decodeAudioData(e.slice(0)),i=t.createBufferSource();return i.buffer=n,i.connect(t.destination),new Promise(a=>{i.onended=()=>{A===i&&(A=null),a()},A=i,i.start(0)})}async function we(e){if(D!==!1)try{let t=await fetch(`${l.apiUrl}/api/v1/widget/tts`,{method:"POST",headers:{"Content-Type":"application/json","X-API-Key":l.apiKey},body:JSON.stringify({text:e})});if(t.ok){let n=await t.arrayBuffer();if(n.byteLength>0){D=!0,await ne(n);return}}D=!1,console.warn("[WebTalkAI] Server TTS unavailable, falling back to browser voice")}catch(t){D=!1,console.warn("[WebTalkAI] Server TTS error:",t)}await re(e)}function re(e){return new Promise(t=>{if(!("speechSynthesis"in window))return t();window.speechSynthesis.cancel();let n=!1,i=()=>{if(n)return;n=!0;let a=new SpeechSynthesisUtterance(e);a.rate=1,a.pitch=1,a.volume=1;let r=window.speechSynthesis.getVoices(),o=r.find(p=>/Google US English|Samantha|Karen|Daniel|Microsoft.*Natural/i.test(p.name))||r.find(p=>p.lang&&p.lang.toLowerCase().startsWith("en"));o&&(a.voice=o),a.onend=()=>t(),a.onerror=()=>t(),window.speechSynthesis.speak(a)};window.speechSynthesis.getVoices().length===0?(window.speechSynthesis.onvoiceschanged=()=>{window.speechSynthesis.onvoiceschanged=null,i()},setTimeout(i,250)):i()})}function f(e,t,n){_=e,N.classList.remove("idle","listening","thinking","speaking","error"),N.classList.add(e),t&&(ee.textContent=t),n!==void 0&&(X.textContent=n),console.log("[WebTalkAI] state \u2192",e)}function oe(){!l.voiceEnabled||!g||(W=!0,J.classList.add("active"),f("idle","Tap to start","Have a natural conversation with the AI. It listens and responds in real time."),s.querySelector('[data-act="start"]').style.display="inline-block",s.querySelector('[data-act="end"]').style.display="none")}function se(){le(),J.classList.remove("active"),W=!1}async function he(){S=!1,f("listening","Connecting\u2026","Setting up secure voice channel."),s.querySelector('[data-act="start"]').style.display="none",s.querySelector('[data-act="end"]').style.display="inline-block";try{m=await navigator.mediaDevices.getUserMedia({audio:{echoCancellation:!0,noiseSuppression:!0,autoGainControl:!0}})}catch(t){f("error","Microphone blocked","Please allow microphone access in your browser settings.");return}let e=`${l.wsUrl}/ws/voice/${g.client_id}?session_id=${encodeURIComponent(V)}&api_key=${encodeURIComponent(l.apiKey)}`;try{d=new WebSocket(e)}catch(t){f("error","Connection failed","Couldn't connect to the AI.");return}d.onopen=()=>{f("listening","Listening\u2026","Speak naturally. I'll respond when you pause."),xe(),me(),ke()},d.onmessage=ye,d.onerror=()=>f("error","Connection error","Voice connection lost. Try again."),d.onclose=()=>{S||f("idle","Disconnected","")}}function le(){if(S=!0,E&&cancelAnimationFrame(E),z&&cancelAnimationFrame(z),E=null,z=null,y&&y.state!=="inactive")try{y.stop()}catch(e){}if(y=null,m&&(m.getTracks().forEach(e=>e.stop()),m=null),b){try{b.disconnect()}catch(e){}b=null}if(d){try{d.close()}catch(e){}d=null}ie(),M=!1,C=!1,I.length=0,f("idle","Tap to start","Have a natural conversation with the AI. It listens and responds in real time."),s.querySelector('[data-act="start"]').style.display="inline-block",s.querySelector('[data-act="end"]').style.display="none"}function me(){if(m){try{y=new MediaRecorder(m,{mimeType:"audio/webm"})}catch(e){console.error("[WebTalkAI] MediaRecorder failed:",e);return}y.ondataavailable=e=>{if(!d||d.readyState!==WebSocket.OPEN||e.data.size===0||C)return;let t=new FileReader;t.onload=()=>{let n=t.result.split(",")[1];try{d.send(JSON.stringify({type:"audio_chunk",data:n}))}catch(i){}},t.readAsDataURL(e.data)},y.start(250)}}function xe(){if(!m)return;let e=ae();e.state==="suspended"&&e.resume();let t=e.createMediaStreamSource(m);b=e.createAnalyser(),b.fftSize=512,b.smoothingTimeConstant=.3,t.connect(b);let n=new Uint8Array(b.fftSize),i=0,a=1e3/50,r=o=>{if(!b||S)return;if(o-i<a){E=requestAnimationFrame(r);return}i=o,b.getByteTimeDomainData(n);let p=0;for(let w=0;w<n.length;w++){let x=(n[w]-128)/128;p+=x*x}let c=Math.sqrt(p/n.length);Q=c,_==="listening"&&!C&&(c>.018?(M||(M=!0,G=o),R=o):M&&o-R>1500&&(R-G>300?ve():M=!1)),E=requestAnimationFrame(r)};E=requestAnimationFrame(r)}function ve(){if(M=!1,C=!0,f("thinking","Thinking\u2026","Looking that up in my knowledge base."),d&&d.readyState===WebSocket.OPEN)try{d.send(JSON.stringify({type:"audio_end"}))}catch(e){}}async function ye(e){let t=JSON.parse(e.data);if(t.type==="transcript"&&t.text)u.push({role:"user",content:t.text}),H(),X.textContent=`You: ${t.text}`;else if(t.type==="answer_text")u.push({role:"assistant",content:t.text}),H(),f("speaking","Speaking\u2026",t.text.slice(0,120));else if(t.type==="audio_chunk"){let n=atob(t.data),i=new Uint8Array(n.length);for(let a=0;a<n.length;a++)i[a]=n.charCodeAt(a);I.push(i)}else if(t.type==="audio_end"){let n=I.reduce((i,a)=>i+a.length,0);if(n>0){let i=new Uint8Array(n),a=0;for(let r of I)i.set(r,a),a+=r.length;I.length=0;try{await ne(i.buffer)}catch(r){console.warn("[WebTalkAI] Audio playback failed:",r)}}else{let i=[...u].reverse().find(a=>a.role==="assistant"&&!a.error);if(i!=null&&i.content)try{await re(i.content)}catch(a){}}C=!1,S||f("listening","Listening\u2026","Speak naturally. I'll respond when you pause.")}else t.type==="error"&&(f("error","Error",t.message||"Something went wrong."),setTimeout(()=>{S||(C=!1,f("listening","Listening\u2026","Speak naturally."))},1800))}function ke(){if(!O)return;let e=O,t=e.getContext("2d");if(!t)return;Se=t;let n=e.width,i=e.height,a=()=>{if(S)return;t.clearRect(0,0,n,i);let r=0;if((_==="listening"||_==="speaking")&&(r=Math.min(1,Q*8)),_==="speaking"){let c=Date.now()/120;r=Math.max(r,.45+.35*Math.abs(Math.sin(c)))}let o=32,p=n/o-2;for(let c=0;c<o;c++){let w=c/o*Math.PI*2,x=.5+.5*Math.sin(Date.now()/200+w*2),Y=r*i*.9*(.4+x*.6),ce=(i-Y)/2;t.fillStyle=`rgba(255,255,255,${.45+x*.4})`,t.fillRect(c*(n/o)+1,ce,p,Math.max(2,Y))}z=requestAnimationFrame(a)};a()}var Se=null;async function Te(e){if(!e||!e.apiKey){console.error("[WebTalkAI] apiKey is required");return}if(document.getElementById("wtai-styles")){console.warn("[WebTalkAI] Already initialized");return}let t=e.theme&&Z[e.theme]?e.theme:"purple";l={apiKey:e.apiKey,apiUrl:e.apiUrl||de,wsUrl:e.wsUrl||pe,position:e.position==="bottom-left"?"bottom-left":"bottom-right",theme:Z[t],greeting:e.greeting||"Hi! How can I help you today?",voiceEnabled:e.voiceEnabled!==!1,ttsAutoPlay:e.ttsAutoPlay===!0},V=ue(),console.log("[WebTalkAI] init v"+F,{apiUrl:l.apiUrl,wsUrl:l.wsUrl,theme:e.theme||"purple",position:l.position,voiceEnabled:l.voiceEnabled,sessionId:V});let n=performance.now();try{let i=await fetch(`${l.apiUrl}/api/v1/widget/config?api_key=${encodeURIComponent(l.apiKey)}`),a=Math.round(performance.now()-n);if(!i.ok){console.error(`[WebTalkAI] Bootstrap failed: HTTP ${i.status} after ${a}ms. Check API key and ${l.apiUrl}.`);return}g=await i.json(),console.log("[WebTalkAI] connected in",a,"ms \u2014 tenant:",g==null?void 0:g.company_name)}catch(i){console.error("[WebTalkAI] Bootstrap failed (network):",i);return}try{ge(),be(),u=[{role:"assistant",content:l.greeting}],H(),te()}catch(err){console.error("[WebTalkAI] UI init error — open DevTools for details:",err.message||String(err),err)}}window.WebTalkAI={init:Te,open:()=>{v||B()},close:()=>{v&&B()},startVoice:()=>{v||B(),W||oe()},version:F};})();
