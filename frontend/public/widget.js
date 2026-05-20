"use strict";(()=>{var j="2.1.3",J="https://webtalk-ai.onrender.com",F="wss://webtalk-ai.onrender.com";console.log("%c[WebTalkAI v"+j+"] %cText = REST \xB7 Voice = WebSocket (mic only)","background:#6366f1;color:#fff;padding:2px 6px;border-radius:3px;font-weight:bold","color:#6b7280");var O={purple:{primary:"#6366f1",accent:"#a855f7"},blue:{primary:"#3b82f6",accent:"#06b6d4"},green:{primary:"#10b981",accent:"#84cc16"},dark:{primary:"#1f2937",accent:"#6366f1"}},o,b=null,p=[],C,x=!1,k=!1,l=null,g=null,L=null,U=!1,_=null,T=null,y,c,S,m,P,B,W,R,f;function X(){try{let e="wtai_session_v2",t=localStorage.getItem(e);return t||(t=`s_${Math.random().toString(36).slice(2,11)}_${Date.now()}`,localStorage.setItem(e,t)),t}catch(e){return`s_${Date.now()}`}}function v(e){let t=document.createElement("div");return t.textContent=e,t.innerHTML}function Y(e){try{let t=new URL(e),n=t.pathname.length>18?t.pathname.slice(0,18)+"\u2026":t.pathname;return t.hostname.replace(/^www\./,"")+(n==="/"?"":n)}catch(t){return e.slice(0,30)}}function G(){let e=o.theme,t=o.position==="bottom-right"?"right":"left",n=`
.wtai-w * { box-sizing: border-box; font-family: -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif; }
.wtai-launcher { position: fixed; ${t}: 24px; bottom: 24px; z-index: 2147483646; width: 60px; height: 60px; border-radius: 50%; background: linear-gradient(135deg,${e.primary},${e.accent}); border: none; cursor: pointer; box-shadow: 0 8px 24px rgba(0,0,0,0.18); display: flex; align-items: center; justify-content: center; transition: transform .2s; }
.wtai-launcher:hover { transform: scale(1.08); }
.wtai-launcher svg { width: 26px; height: 26px; fill: #fff; }
.wtai-panel { position: fixed; ${t}: 24px; bottom: 100px; z-index: 2147483647; width: 380px; max-width: calc(100vw - 32px); height: 580px; max-height: calc(100vh - 130px); background: #fff; border-radius: 18px; box-shadow: 0 20px 60px rgba(0,0,0,0.25); display: none; flex-direction: column; overflow: hidden; }
.wtai-panel.open { display: flex; animation: wtai-fade .25s ease; }
@keyframes wtai-fade { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } }
.wtai-head { background: linear-gradient(135deg,${e.primary},${e.accent}); color: #fff; padding: 16px 18px; display: flex; align-items: center; gap: 12px; }
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
.wtai-mbot { width: 28px; height: 28px; border-radius: 50%; background: linear-gradient(135deg,${e.primary},${e.accent}); display: flex; align-items: center; justify-content: center; flex-shrink: 0; }
.wtai-mbot svg { width: 14px; height: 14px; fill: #fff; }
.wtai-mbot.err { background: #fbbf24; }
.wtai-bub { max-width: 75%; padding: 10px 14px; border-radius: 16px; font-size: 14px; line-height: 1.5; word-wrap: break-word; white-space: pre-wrap; }
.wtai-msg.user .wtai-bub { background: linear-gradient(135deg,${e.primary},${e.accent}); color: #fff; border-bottom-right-radius: 4px; }
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
.wtai-sugs { padding: 0 12px 8px; display: flex; flex-wrap: wrap; gap: 5px; }
.wtai-sug { font-size: 12px; padding: 6px 10px; border-radius: 14px; background: #fff; border: 1px solid #e5e7eb; color: #4b5563; cursor: pointer; transition: all .15s; }
.wtai-sug:hover { background: #f9fafb; border-color: ${e.primary}; color: ${e.primary}; }
.wtai-row { padding: 12px; background: #fff; border-top: 1px solid #e5e7eb; display: flex; gap: 8px; align-items: center; }
.wtai-in { flex: 1; border: 1px solid #e5e7eb; border-radius: 22px; padding: 10px 16px; font-size: 14px; outline: none; transition: border-color .15s; }
.wtai-in:focus { border-color: ${e.primary}; }
.wtai-in:disabled { opacity: .6; }
.wtai-btn { width: 40px; height: 40px; border-radius: 50%; border: none; cursor: pointer; display: flex; align-items: center; justify-content: center; flex-shrink: 0; transition: all .15s; }
.wtai-mic { background: #f3f4f6; color: #4b5563; }
.wtai-mic:hover { background: #e5e7eb; }
.wtai-mic svg { width: 16px; height: 16px; fill: currentColor; }
.wtai-send { background: linear-gradient(135deg,${e.primary},${e.accent}); color: #fff; }
.wtai-send:disabled { opacity: .4; cursor: not-allowed; }
.wtai-send svg { width: 15px; height: 15px; fill: #fff; }
.wtai-foot { text-align: center; padding: 6px; font-size: 10px; color: #9ca3af; background: #fff; }
.wtai-foot a { color: ${e.primary}; text-decoration: none; }
.wtai-voice { position: absolute; inset: 0; background: linear-gradient(135deg,${e.primary},${e.accent}); display: none; flex-direction: column; align-items: center; justify-content: center; z-index: 10; color: #fff; padding: 24px; text-align: center; }
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
  `.trim(),a=document.createElement("style");a.id="wtai-styles",a.textContent=n,document.head.appendChild(a)}function Z(){y=document.createElement("button"),y.className="wtai-w wtai-launcher",y.setAttribute("aria-label","Open chat"),y.innerHTML='<svg viewBox="0 0 24 24"><path d="M12 2C6.48 2 2 6.48 2 12c0 1.86.5 3.6 1.38 5.1L2 22l4.9-1.38C8.4 21.5 10.14 22 12 22c5.52 0 10-4.48 10-10S17.52 2 12 2zm0 18c-1.65 0-3.27-.45-4.7-1.3l-.34-.2-3.04.86.85-3.03-.21-.34C3.45 14.27 3 12.65 3 11c0-4.97 4.03-9 9-9s9 4.03 9 9-4.03 9-9 9z"/><circle cx="8" cy="12" r="1.4"/><circle cx="12" cy="12" r="1.4"/><circle cx="16" cy="12" r="1.4"/></svg>',y.onclick=z,document.body.appendChild(y),c=document.createElement("div"),c.className="wtai-w wtai-panel",c.innerHTML=`
    <div class="wtai-head">
      <div class="wtai-avatar"><svg viewBox="0 0 24 24"><path d="M12 2L13.09 8.26L19 7L17.74 13.09L24 12L17.74 10.91L19 17L13.09 15.74L12 22L10.91 15.74L5 17L6.26 10.91L0 12L6.26 13.09L5 7L10.91 8.26L12 2Z"/></svg></div>
      <div style="flex:1;min-width:0;">
        <div class="wtai-name">${v((b==null?void 0:b.company_name)||"AI Assistant")}</div>
        <div class="wtai-status">Trained on this site</div>
      </div>
      <button class="wtai-close" aria-label="Close"><svg viewBox="0 0 24 24"><path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/></svg></button>
    </div>
    <div class="wtai-msgs"></div>
    <div class="wtai-sugs"></div>
    <div class="wtai-row">
      <input type="text" class="wtai-in" placeholder="Ask anything\u2026" autocomplete="off" />
      ${o.voiceEnabled?'<button class="wtai-btn wtai-mic" aria-label="Voice mode" title="Talk"><svg viewBox="0 0 24 24"><path d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3zm5.3-3c0 3-2.54 5.1-5.3 5.1S6.7 14 6.7 11H5c0 3.41 2.72 6.23 6 6.72V21h2v-3.28c3.28-.49 6-3.31 6-6.72h-1.7z"/></svg></button>':""}
      <button class="wtai-btn wtai-send" aria-label="Send"><svg viewBox="0 0 24 24"><path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z"/></svg></button>
    </div>
    <div class="wtai-foot">Powered by <a href="https://web-talk-ai.vercel.app" target="_blank" rel="noopener">WebTalk AI</a></div>

    <div class="wtai-voice">
      <div class="wtai-orb"><svg class="wtai-orb-icon" viewBox="0 0 24 24"><path d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3zm5.3-3c0 3-2.54 5.1-5.3 5.1S6.7 14 6.7 11H5c0 3.41 2.72 6.23 6 6.72V21h2v-3.28c3.28-.49 6-3.31 6-6.72h-1.7z"/></svg></div>
      <div class="wtai-vstat">Listening\u2026</div>
      <div class="wtai-vhint">Speak naturally. Tap stop when done.</div>
      <div class="wtai-vacts">
        <button class="wtai-vbtn" data-act="cancel">Cancel</button>
        <button class="wtai-vbtn danger" data-act="stop">Stop &amp; Send</button>
      </div>
    </div>
  `,document.body.appendChild(c),S=c.querySelector(".wtai-msgs"),m=c.querySelector(".wtai-in"),B=c.querySelector(".wtai-send"),P=c.querySelector(".wtai-mic"),W=c.querySelector(".wtai-sugs"),R=c.querySelector(".wtai-voice"),f=c.querySelector(".wtai-vstat"),c.querySelector(".wtai-close").onclick=z,B.onclick=()=>D(),m.addEventListener("keydown",e=>{e.key==="Enter"&&!k&&D()}),P&&(P.onclick=ne),c.querySelector('[data-act="cancel"]').onclick=()=>M(!0),c.querySelector('[data-act="stop"]').onclick=()=>M(!1)}function z(){x=!x,c.classList.toggle("open",x),x&&(m.focus(),setTimeout(()=>S.scrollTo({top:S.scrollHeight,behavior:"smooth"}),50))}function A(){S.innerHTML=p.map(e=>{let t='<svg viewBox="0 0 24 24"><path d="M20 9V7c0-1.1-.9-2-2-2h-3c0-1.66-1.34-3-3-3S9 3.34 9 5H6c-1.1 0-2 .9-2 2v2c-1.66 0-3 1.34-3 3s1.34 3 3 3v4c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2v-4c1.66 0 3-1.34 3-3s-1.34-3-3-3zM7.5 11.5c0-.83.67-1.5 1.5-1.5s1.5.67 1.5 1.5S9.83 13 9 13s-1.5-.67-1.5-1.5zM16 17H8v-2h8v2zm-1-4c-.83 0-1.5-.67-1.5-1.5S14.17 10 15 10s1.5.67 1.5 1.5S15.83 13 15 13z"/></svg>',n='<svg viewBox="0 0 24 24"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z"/></svg>',a=e.sources&&e.sources.length&&!e.streaming?`<div class="wtai-srcs">${e.sources.slice(0,4).map(h=>`<a class="wtai-src" href="${v(h)}" target="_blank" rel="noopener">${v(Y(h))}</a>`).join("")}</div>`:"";if(e.role==="user")return`<div class="wtai-msg user"><div class="wtai-bub">${v(e.content)}</div></div>`;let s=e.error?"wtai-msg assistant err":"wtai-msg assistant",d=e.error?"wtai-mbot err":"wtai-mbot",r=e.streaming&&e.content?'<span class="wtai-caret"></span>':"",i=e.streaming&&!e.content?'<div class="wtai-typing"><span></span><span></span><span></span></div>':`${v(e.content)}${r}`;return`<div class="${s}">
      <div class="${d}">${e.error?n:t}</div>
      <div style="max-width:75%"><div class="wtai-bub">${i}</div>${a}</div>
    </div>`}).join(""),S.scrollTo({top:S.scrollHeight,behavior:"smooth"})}function q(){if(p.length>1||k){W.innerHTML="";return}let e=["What is this site about?","What do you offer?","How can I get in touch?"];W.innerHTML=e.map(t=>`<button class="wtai-sug">${v(t)}</button>`).join(""),W.querySelectorAll(".wtai-sug").forEach((t,n)=>{t.onclick=()=>D(e[n])})}var K=6e4;async function D(e){var d,r;let t=(e!=null?e:m.value).trim();if(!t||k)return;m.value="",p.push({role:"user",content:t}),p.push({role:"assistant",content:"",streaming:!0}),k=!0,B.disabled=!0,m.disabled=!0,A(),q();let n=new AbortController,a=setTimeout(()=>{console.warn("[WebTalkAI] Request timed out after",K,"ms"),n.abort()},K),s=performance.now();console.log("[WebTalkAI] \u2192 REST POST /widget/chat",{message:t,conversation_id:C});try{let i=await fetch(`${o.apiUrl}/api/v1/widget/chat`,{method:"POST",headers:{"Content-Type":"application/json","X-API-Key":o.apiKey},body:JSON.stringify({api_key:o.apiKey,message:t,conversation_id:C}),signal:n.signal});clearTimeout(a);let h=Math.round(performance.now()-s);if(console.log("[WebTalkAI] \u2190 status",i.status,"in",h,"ms"),!i.ok){let $="";try{$=await i.text()}catch(oe){}console.error("[WebTalkAI] HTTP",i.status,$);let E=`Server returned ${i.status}.`;throw i.status===401?E="Invalid API key.":i.status===404?E="Endpoint not found.":i.status===429?E="Too many requests. Please wait a moment.":i.status>=500&&(E="The AI is having trouble. Please try again."),new Error(E)}let u=await i.json();console.log("[WebTalkAI] response:",{len:(d=u.response)==null?void 0:d.length,sources:(r=u.sources)==null?void 0:r.length});let w=u.response||u.answer||"I couldn't generate a response. Please try again.",N=u.sources||[],I=p[p.length-1];I&&(I.content=w,I.sources=N,I.streaming=!1),A(),o.ttsAutoPlay&&w&&te(w).catch($=>console.warn("[WebTalkAI] TTS failed:",$))}catch(i){clearTimeout(a);let h=Math.round(performance.now()-s);console.error("[WebTalkAI] Chat failed after",h,"ms:",i);let u="Something went wrong. Please try again.";i instanceof DOMException&&i.name==="AbortError"?u="The AI is starting up \u2014 please wait a moment and try again. (The server sleeps when idle on free hosting.)":i instanceof TypeError&&i.message==="Failed to fetch"?u="Couldn't reach the server. Please check your connection.":i instanceof Error&&(u=i.message);let w=p[p.length-1];w&&w.streaming?(w.content=u,w.streaming=!1,w.error=!0):p.push({role:"assistant",content:u,error:!0}),A()}finally{k=!1,B.disabled=!1,m.disabled=!1,m.focus()}}function Q(){if(!_){let e=window.AudioContext||window.webkitAudioContext;_=new e}return _}function ee(){if(T){try{T.stop()}catch(e){}T=null}}async function V(e){if(e.byteLength===0){console.warn("[WebTalkAI] Empty audio buffer \u2014 skipping playback");return}ee();let t=Q();t.state==="suspended"&&await t.resume();let n=await t.decodeAudioData(e.slice(0)),a=t.createBufferSource();return a.buffer=n,a.connect(t.destination),new Promise(s=>{a.onended=()=>{T===a&&(T=null),s()},T=a,a.start(0)})}var H=null;async function te(e){if(H!==!1)try{let t=await fetch(`${o.apiUrl}/api/v1/widget/tts`,{method:"POST",headers:{"Content-Type":"application/json","X-API-Key":o.apiKey},body:JSON.stringify({text:e})});if(t.ok){let a=await t.arrayBuffer();if(a.byteLength>0){console.log("[WebTalkAI] TTS (ElevenLabs):",a.byteLength,"bytes"),H=!0,await V(a);return}}let n="";try{n=JSON.stringify(await t.json())}catch(a){n=await t.text().catch(()=>"")||""}console.warn("[WebTalkAI] Server TTS unavailable (HTTP "+t.status+"); using browser voice for the rest of this session."),n&&console.warn("[WebTalkAI] Server detail:",n.slice(0,200)),H=!1}catch(t){console.warn("[WebTalkAI] Server TTS error, switching to browser voice:",t),H=!1}ae(e)}function ae(e){if(typeof window=="undefined"||!("speechSynthesis"in window)){console.warn("[WebTalkAI] Browser TTS not supported in this browser");return}window.speechSynthesis.cancel();let t=()=>{var d;let n=new SpeechSynthesisUtterance(e);n.rate=1,n.pitch=1,n.volume=1;let a=window.speechSynthesis.getVoices(),s=a.find(r=>/Google US English|Samantha|Karen|Daniel|Microsoft.*Natural/i.test(r.name))||a.find(r=>r.lang&&r.lang.toLowerCase().startsWith("en"));s&&(n.voice=s),console.log("[WebTalkAI] TTS (browser):",((d=n.voice)==null?void 0:d.name)||"default"),window.speechSynthesis.speak(n)};window.speechSynthesis.getVoices().length===0?(window.speechSynthesis.onvoiceschanged=()=>{window.speechSynthesis.onvoiceschanged=null,t()},setTimeout(t,250)):t()}async function ne(){if(!o.voiceEnabled||!b||k)return;R.classList.add("active"),f.textContent="Connecting\u2026",U=!1;try{L=await navigator.mediaDevices.getUserMedia({audio:!0})}catch(n){f.textContent="Microphone access denied",setTimeout(()=>M(!0),1500);return}let e=`${o.wsUrl}/ws/voice/${b.client_id}?session_id=${encodeURIComponent(C)}&api_key=${encodeURIComponent(o.apiKey)}`;try{l=new WebSocket(e)}catch(n){f.textContent="Connection failed",setTimeout(()=>M(!0),1500);return}let t=[];l.onopen=()=>{f.textContent="Listening\u2026",g=new MediaRecorder(L,{mimeType:"audio/webm"}),g.ondataavailable=n=>{if(!l||l.readyState!==WebSocket.OPEN||n.data.size===0)return;let a=new FileReader;a.onload=()=>{let s=a.result.split(",")[1];l.send(JSON.stringify({type:"audio_chunk",data:s}))},a.readAsDataURL(n.data)},g.start(300)},l.onmessage=n=>{let a=JSON.parse(n.data);if(a.type==="transcript"&&a.text)p.push({role:"user",content:a.text}),A();else if(a.type==="answer_text")p.push({role:"assistant",content:a.text}),f.textContent="Speaking\u2026",A();else if(a.type==="audio_chunk"){let s=atob(a.data),d=new Uint8Array(s.length);for(let r=0;r<s.length;r++)d[r]=s.charCodeAt(r);t.push(d)}else if(a.type==="audio_end"){let s=t.reduce((i,h)=>i+h.length,0),d=new Uint8Array(s),r=0;for(let i of t)d.set(i,r),r+=i.length;t.length=0,V(d.buffer).then(()=>{U||(f.textContent="Listening\u2026",g&&g.state==="inactive"&&g.start(300))}).catch(i=>console.warn("[WebTalkAI] voice playback failed:",i))}else a.type==="error"&&(f.textContent="Error: "+a.message,setTimeout(()=>M(!0),1800))},l.onerror=()=>{f.textContent="Voice connection error"},l.onclose=()=>{U||(f.textContent="Disconnected")}}function M(e){U=e,R.classList.remove("active"),g&&g.state!=="inactive"&&g.stop(),!e&&l&&l.readyState===WebSocket.OPEN?(f.textContent="Thinking\u2026",l.send(JSON.stringify({type:"audio_end"}))):l&&(l.close(),l=null),L&&(L.getTracks().forEach(t=>t.stop()),L=null),g=null}async function ie(e){if(!e||!e.apiKey){console.error("[WebTalkAI] apiKey is required");return}if(document.getElementById("wtai-styles")){console.warn("[WebTalkAI] Already initialized");return}let t=e.theme&&O[e.theme]?e.theme:"purple";o={apiKey:e.apiKey,apiUrl:e.apiUrl||J,wsUrl:e.wsUrl||F,position:e.position==="bottom-left"?"bottom-left":"bottom-right",theme:O[t],greeting:e.greeting||"Hi! How can I help you today?",voiceEnabled:e.voiceEnabled!==!1,ttsAutoPlay:e.ttsAutoPlay===!0},C=X(),console.log("[WebTalkAI] init v"+j,{apiUrl:o.apiUrl,wsUrl:o.wsUrl,theme:e.theme||"purple",position:o.position,voiceEnabled:o.voiceEnabled,sessionId:C});let n=performance.now();try{let a=await fetch(`${o.apiUrl}/api/v1/widget/config?api_key=${encodeURIComponent(o.apiKey)}`),s=Math.round(performance.now()-n);if(!a.ok){console.error(`[WebTalkAI] Bootstrap failed: HTTP ${a.status} after ${s}ms. Check that the API key is valid and that ${o.apiUrl} is reachable.`);return}b=await a.json(),console.log("[WebTalkAI] connected in",s,"ms \u2014 tenant:",b==null?void 0:b.company_name)}catch(a){console.error("[WebTalkAI] Bootstrap failed (network):",a);return}G(),Z(),p=[{role:"assistant",content:o.greeting}],A(),q()}window.WebTalkAI={init:ie,open:()=>{x||z()},close:()=>{x&&z()},version:j};})();
