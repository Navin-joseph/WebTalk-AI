"use strict";(()=>{var V="2.0.0",F="https://webtalk-ai.onrender.com",J="wss://webtalk-ai.onrender.com",W={purple:{primary:"#6366f1",accent:"#a855f7"},blue:{primary:"#3b82f6",accent:"#06b6d4"},green:{primary:"#10b981",accent:"#84cc16"},dark:{primary:"#1f2937",accent:"#6366f1"}},o,h=null,s=[],R,T=!1,E=!1,c=null,b=null,$=null,C=!1,u=null,L,n,M,x,_,U,A,D,g;function X(){try{let e="wtai_session_v2",t=localStorage.getItem(e);return t||(t=`s_${Math.random().toString(36).slice(2,11)}_${Date.now()}`,localStorage.setItem(e,t)),t}catch(e){return`s_${Date.now()}`}}function S(e){let t=document.createElement("div");return t.textContent=e,t.innerHTML}function Y(e){try{let t=new URL(e),a=t.pathname.length>18?t.pathname.slice(0,18)+"\u2026":t.pathname;return t.hostname.replace(/^www\./,"")+(a==="/"?"":a)}catch(t){return e.slice(0,30)}}function Z(){let e=o.theme,t=o.position==="bottom-right"?"right":"left",a=`
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
  `.trim(),i=document.createElement("style");i.id="wtai-styles",i.textContent=a,document.head.appendChild(i)}function G(){L=document.createElement("button"),L.className="wtai-w wtai-launcher",L.setAttribute("aria-label","Open chat"),L.innerHTML='<svg viewBox="0 0 24 24"><path d="M12 2C6.48 2 2 6.48 2 12c0 1.86.5 3.6 1.38 5.1L2 22l4.9-1.38C8.4 21.5 10.14 22 12 22c5.52 0 10-4.48 10-10S17.52 2 12 2zm0 18c-1.65 0-3.27-.45-4.7-1.3l-.34-.2-3.04.86.85-3.03-.21-.34C3.45 14.27 3 12.65 3 11c0-4.97 4.03-9 9-9s9 4.03 9 9-4.03 9-9 9z"/><circle cx="8" cy="12" r="1.4"/><circle cx="12" cy="12" r="1.4"/><circle cx="16" cy="12" r="1.4"/></svg>',L.onclick=z,document.body.appendChild(L),n=document.createElement("div"),n.className="wtai-w wtai-panel",n.innerHTML=`
    <div class="wtai-head">
      <div class="wtai-avatar"><svg viewBox="0 0 24 24"><path d="M12 2L13.09 8.26L19 7L17.74 13.09L24 12L17.74 10.91L19 17L13.09 15.74L12 22L10.91 15.74L5 17L6.26 10.91L0 12L6.26 13.09L5 7L10.91 8.26L12 2Z"/></svg></div>
      <div style="flex:1;min-width:0;">
        <div class="wtai-name">${S((h==null?void 0:h.company_name)||"AI Assistant")}</div>
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
  `,document.body.appendChild(n),M=n.querySelector(".wtai-msgs"),x=n.querySelector(".wtai-in"),U=n.querySelector(".wtai-send"),_=n.querySelector(".wtai-mic"),A=n.querySelector(".wtai-sugs"),D=n.querySelector(".wtai-voice"),g=n.querySelector(".wtai-vstat"),n.querySelector(".wtai-close").onclick=z,U.onclick=()=>B(),x.addEventListener("keydown",e=>{e.key==="Enter"&&!E&&B()}),_&&(_.onclick=ee),n.querySelector('[data-act="cancel"]').onclick=()=>H(!0),n.querySelector('[data-act="stop"]').onclick=()=>H(!1)}function z(){T=!T,n.classList.toggle("open",T),T&&(x.focus(),setTimeout(()=>M.scrollTo({top:M.scrollHeight,behavior:"smooth"}),50))}function y(){M.innerHTML=s.map(e=>{let t='<svg viewBox="0 0 24 24"><path d="M20 9V7c0-1.1-.9-2-2-2h-3c0-1.66-1.34-3-3-3S9 3.34 9 5H6c-1.1 0-2 .9-2 2v2c-1.66 0-3 1.34-3 3s1.34 3 3 3v4c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2v-4c1.66 0 3-1.34 3-3s-1.34-3-3-3zM7.5 11.5c0-.83.67-1.5 1.5-1.5s1.5.67 1.5 1.5S9.83 13 9 13s-1.5-.67-1.5-1.5zM16 17H8v-2h8v2zm-1-4c-.83 0-1.5-.67-1.5-1.5S14.17 10 15 10s1.5.67 1.5 1.5S15.83 13 15 13z"/></svg>',a='<svg viewBox="0 0 24 24"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z"/></svg>',i=e.sources&&e.sources.length&&!e.streaming?`<div class="wtai-srcs">${e.sources.slice(0,4).map(r=>`<a class="wtai-src" href="${S(r)}" target="_blank" rel="noopener">${S(Y(r))}</a>`).join("")}</div>`:"";if(e.role==="user")return`<div class="wtai-msg user"><div class="wtai-bub">${S(e.content)}</div></div>`;let l=e.error?"wtai-msg assistant err":"wtai-msg assistant",f=e.error?"wtai-mbot err":"wtai-mbot",d=e.streaming&&e.content?'<span class="wtai-caret"></span>':"",v=e.streaming&&!e.content?'<div class="wtai-typing"><span></span><span></span><span></span></div>':`${S(e.content)}${d}`;return`<div class="${l}">
      <div class="${f}">${e.error?a:t}</div>
      <div style="max-width:75%"><div class="wtai-bub">${v}</div>${i}</div>
    </div>`}).join(""),M.scrollTo({top:M.scrollHeight,behavior:"smooth"})}function K(){if(s.length>1||E){A.innerHTML="";return}let e=["What is this site about?","What do you offer?","How can I get in touch?"];A.innerHTML=e.map(t=>`<button class="wtai-sug">${S(t)}</button>`).join(""),A.querySelectorAll(".wtai-sug").forEach((t,a)=>{t.onclick=()=>B(e[a])})}async function B(e){var f,d,v;let t=(e!=null?e:x.value).trim();if(!t||E)return;x.value="",s.push({role:"user",content:t}),s.push({role:"assistant",content:"",streaming:!0}),E=!0,U.disabled=!0,x.disabled=!0,y(),K();let a="",i=[],l=!1;try{let r=await fetch(`${o.apiUrl}/api/v1/widget/chat/stream`,{method:"POST",headers:{"Content-Type":"application/json","X-API-Key":o.apiKey},body:JSON.stringify({message:t,session_id:R,client_id:(f=h==null?void 0:h.client_id)!=null?f:""})});if(!r.ok||!r.body)throw new Error(`HTTP ${r.status}`);let p=r.body.getReader(),k=new TextDecoder,I="";for(;;){let{done:N,value:q}=await p.read();if(N)break;I+=k.decode(q,{stream:!0});let j=I.split(`
`);I=(d=j.pop())!=null?d:"";for(let O of j){if(!O.startsWith("data: "))continue;let P=O.slice(6).trim();if(P==="[DONE]")break;try{let w=JSON.parse(P);if(l=!0,w.type==="sources")i=(v=w.sources)!=null?v:[];else if(w.type==="token"){a+=w.text;let m=s[s.length-1];m&&m.role==="assistant"&&(m.content=a,m.sources=i),y()}else if(w.type==="done"){let m=s[s.length-1];m&&(m.content=w.answer||a,m.sources=i,m.streaming=!1),y()}else if(w.type==="error")throw new Error(w.message||"Stream error")}catch(w){}}}if(!l)throw new Error("No response from server");o.ttsAutoPlay&&a&&Q(a).catch(()=>{})}catch(r){let p=s[s.length-1],k=r instanceof Error?r.message==="Failed to fetch"?"Couldn't reach the server. Please check your connection.":r.message:"Something went wrong.";p&&p.streaming?(p.content=k,p.streaming=!1,p.error=!0):s.push({role:"assistant",content:k,error:!0}),y()}finally{E=!1,U.disabled=!1,x.disabled=!1,x.focus()}}async function Q(e){try{u&&(u.pause(),u=null);let t=await fetch(`${o.apiUrl}/api/v1/widget/tts`,{method:"POST",headers:{"Content-Type":"application/json","X-API-Key":o.apiKey},body:JSON.stringify({text:e})});if(!t.ok)return;let a=await t.blob(),i=URL.createObjectURL(a);u=new Audio(i),u.onended=()=>URL.revokeObjectURL(i),await u.play()}catch(t){console.warn("[WebTalkAI] TTS playback failed:",t)}}async function ee(){if(!o.voiceEnabled||!h||E)return;D.classList.add("active"),g.textContent="Connecting\u2026",C=!1;try{$=await navigator.mediaDevices.getUserMedia({audio:!0})}catch(a){g.textContent="Microphone access denied",setTimeout(()=>H(!0),1500);return}let e=`${o.wsUrl}/ws/voice/${h.client_id}?session_id=${encodeURIComponent(R)}&api_key=${encodeURIComponent(o.apiKey)}`;try{c=new WebSocket(e)}catch(a){g.textContent="Connection failed",setTimeout(()=>H(!0),1500);return}let t=[];c.onopen=()=>{g.textContent="Listening\u2026",b=new MediaRecorder($,{mimeType:"audio/webm"}),b.ondataavailable=a=>{if(!c||c.readyState!==WebSocket.OPEN||a.data.size===0)return;let i=new FileReader;i.onload=()=>{let l=i.result.split(",")[1];c.send(JSON.stringify({type:"audio_chunk",data:l}))},i.readAsDataURL(a.data)},b.start(300)},c.onmessage=a=>{let i=JSON.parse(a.data);if(i.type==="transcript"&&i.text)s.push({role:"user",content:i.text}),y();else if(i.type==="answer_text")s.push({role:"assistant",content:i.text}),g.textContent="Speaking\u2026",y();else if(i.type==="audio_chunk"){let l=atob(i.data),f=new Uint8Array(l.length);for(let d=0;d<l.length;d++)f[d]=l.charCodeAt(d);t.push(f)}else if(i.type==="audio_end"){let l=t.reduce((p,k)=>p+k.length,0),f=new Uint8Array(l),d=0;for(let p of t)f.set(p,d),d+=p.length;t.length=0;let v=new Blob([f],{type:"audio/mpeg"}),r=URL.createObjectURL(v);u&&u.pause(),u=new Audio(r),u.onended=()=>{URL.revokeObjectURL(r),C||(g.textContent="Listening\u2026",b&&b.state==="inactive"&&b.start(300))},u.play().catch(()=>{})}else i.type==="error"&&(g.textContent="Error: "+i.message,setTimeout(()=>H(!0),1800))},c.onerror=()=>{g.textContent="Voice connection error"},c.onclose=()=>{C||(g.textContent="Disconnected")}}function H(e){C=e,D.classList.remove("active"),b&&b.state!=="inactive"&&b.stop(),!e&&c&&c.readyState===WebSocket.OPEN?(g.textContent="Thinking\u2026",c.send(JSON.stringify({type:"audio_end"}))):c&&(c.close(),c=null),$&&($.getTracks().forEach(t=>t.stop()),$=null),b=null}async function te(e){if(!e||!e.apiKey){console.error("[WebTalkAI] apiKey is required");return}if(document.getElementById("wtai-styles")){console.warn("[WebTalkAI] Already initialized");return}let t=e.theme&&W[e.theme]?e.theme:"purple";o={apiKey:e.apiKey,apiUrl:e.apiUrl||F,wsUrl:e.wsUrl||J,position:e.position==="bottom-left"?"bottom-left":"bottom-right",theme:W[t],greeting:e.greeting||"Hi! How can I help you today?",voiceEnabled:e.voiceEnabled!==!1,ttsAutoPlay:e.ttsAutoPlay===!0},R=X();try{let a=await fetch(`${o.apiUrl}/api/v1/widget/config?api_key=${encodeURIComponent(o.apiKey)}`);if(!a.ok){console.error("[WebTalkAI] Invalid API key or backend unreachable (status "+a.status+")");return}h=await a.json()}catch(a){console.error("[WebTalkAI] Failed to initialize:",a);return}Z(),G(),s=[{role:"assistant",content:o.greeting}],y(),K()}window.WebTalkAI={init:te,open:()=>{T||z()},close:()=>{T&&z()},version:V};})();
