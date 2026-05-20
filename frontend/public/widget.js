"use strict";(()=>{var f=()=>{var t;return(t=window.WebTalkConfig)!=null?t:{}},r=null,c=null,l=null,y=`s_${Math.random().toString(36).slice(2)}_${Date.now()}`,m=!1,g=!1;function w(){var u,p,h;let t=f(),n=(u=t.position)!=null?u:"bottom-right",e=(p=t.primaryColor)!=null?p:"#2563eb",o=(h=t.greeting)!=null?h:"Hi! How can I help you today?",a=document.createElement("style");a.textContent=`
    #wtai-launcher{position:fixed;${n==="bottom-right"?"right:24px":"left:24px"};bottom:24px;z-index:9999;
      width:52px;height:52px;border-radius:50%;background:${e};border:none;cursor:pointer;
      box-shadow:0 4px 20px rgba(0,0,0,.18);display:flex;align-items:center;justify-content:center;transition:transform .2s}
    #wtai-launcher:hover{transform:scale(1.08)}
    #wtai-launcher svg{width:24px;height:24px;fill:white}
    #wtai-panel{position:fixed;${n==="bottom-right"?"right:24px":"left:24px"};bottom:88px;z-index:9998;
      width:360px;max-height:520px;border-radius:16px;background:#fff;
      box-shadow:0 8px 40px rgba(0,0,0,.16);display:none;flex-direction:column;overflow:hidden;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif}
    #wtai-panel.open{display:flex}
    #wtai-header{padding:14px 16px;background:${e};color:#fff;font-weight:600;font-size:14px;display:flex;justify-content:space-between;align-items:center}
    #wtai-header button{background:none;border:none;color:#fff;cursor:pointer;font-size:18px;line-height:1}
    #wtai-messages{flex:1;overflow-y:auto;padding:12px;display:flex;flex-direction:column;gap:8px}
    .wtai-msg{max-width:82%;padding:8px 12px;border-radius:14px;font-size:13px;line-height:1.5;word-break:break-word}
    .wtai-msg.user{align-self:flex-end;background:${e};color:#fff;border-bottom-right-radius:4px}
    .wtai-msg.assistant{align-self:flex-start;background:#f1f5f9;color:#1e293b;border-bottom-left-radius:4px}
    .wtai-msg.thinking{color:#94a3b8;font-style:italic}
    #wtai-footer{padding:10px;border-top:1px solid #f1f5f9;display:flex;gap:8px;align-items:center}
    #wtai-input{flex:1;border:1px solid #e2e8f0;border-radius:20px;padding:8px 14px;font-size:13px;outline:none}
    #wtai-input:focus{border-color:${e}}
    #wtai-send,#wtai-mic{width:36px;height:36px;border-radius:50%;border:none;cursor:pointer;display:flex;align-items:center;justify-content:center;flex-shrink:0}
    #wtai-send{background:${e}}
    #wtai-send svg{width:16px;height:16px;fill:white}
    #wtai-mic{background:#f1f5f9}
    #wtai-mic.recording{background:#ef4444}
    #wtai-mic svg{width:16px;height:16px}
    #wtai-mic.recording svg{fill:white}
  `,document.head.appendChild(a);let s=document.createElement("button");s.id="wtai-launcher",s.setAttribute("aria-label","Open AI chat"),s.innerHTML='<svg viewBox="0 0 24 24"><path d="M12 2C6.48 2 2 6.48 2 12c0 1.86.5 3.6 1.38 5.1L2 22l4.9-1.38C8.4 21.5 10.14 22 12 22c5.52 0 10-4.48 10-10S17.52 2 12 2zm1 15H7v-2h6v2zm3-4H7v-2h9v2zm0-4H7V7h9v2z"/></svg>',document.body.appendChild(s);let i=document.createElement("div");i.id="wtai-panel",i.setAttribute("role","dialog"),i.setAttribute("aria-label","AI Chat"),i.innerHTML=`
    <div id="wtai-header">
      <span>AI Assistant</span>
      <button id="wtai-close" aria-label="Close">\xD7</button>
    </div>
    <div id="wtai-messages"></div>
    <div id="wtai-footer">
      <input id="wtai-input" type="text" placeholder="Type a message\u2026" autocomplete="off" />
      <button id="wtai-send" aria-label="Send">
        <svg viewBox="0 0 24 24"><path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z"/></svg>
      </button>
      <button id="wtai-mic" aria-label="Voice input">
        <svg viewBox="0 0 24 24"><path d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3zm5.3-3c0 3-2.54 5.1-5.3 5.1S6.7 14 6.7 11H5c0 3.41 2.72 6.23 6 6.72V21h2v-3.28c3.28-.49 6-3.31 6-6.72h-1.7z"/></svg>
      </button>
    </div>
  `,document.body.appendChild(i),d("assistant",o),s.addEventListener("click",b),document.getElementById("wtai-close").addEventListener("click",b),document.getElementById("wtai-send").addEventListener("click",x),document.getElementById("wtai-input").addEventListener("keydown",k=>{k.key==="Enter"&&x()}),document.getElementById("wtai-mic").addEventListener("click",C)}function b(){g=!g,document.getElementById("wtai-panel").classList.toggle("open",g),g&&!r&&v()}async function x(){var o;let t=document.getElementById("wtai-input"),n=t.value.trim();if(!n)return;t.value="",d("user",n);let e=d("assistant","Thinking\u2026","thinking");try{let{apiUrl:a="http://localhost:8000",clientId:s,apiKey:i}=f(),p=await(await fetch(`${a}/api/v1/conversations/chat`,{method:"POST",headers:{"Content-Type":"application/json","X-API-Key":i},body:JSON.stringify({message:n,session_id:y,client_id:s})})).json();e.textContent=(o=p.answer)!=null?o:"Sorry, I couldn't get a response.",e.classList.remove("thinking")}catch(a){e.textContent="Connection error. Please try again.",e.classList.remove("thinking")}}function v(){let{wsUrl:t="ws://localhost:8000",clientId:n,apiKey:e}=f(),o=`${t}/ws/voice/${n}?session_id=${y}&api_key=${encodeURIComponent(e)}`;r=new WebSocket(o);let a=null;r.onmessage=async s=>{let i=JSON.parse(s.data);i.type==="transcript"?i.text&&d("user",i.text):i.type==="answer_text"?a=d("assistant",i.text):i.type==="audio_chunk"?await I(i.data):i.type==="error"&&d("assistant",`Error: ${i.message}`,"thinking")},r.onerror=()=>d("assistant","Voice connection error.","thinking"),r.onclose=()=>{r=null}}async function C(){m?S():await E()}async function E(){if(!navigator.mediaDevices){alert("Microphone not available in this browser.");return}let t=await navigator.mediaDevices.getUserMedia({audio:!0});l=new MediaRecorder(t,{mimeType:"audio/webm"}),l.ondataavailable=n=>{if(!r||r.readyState!==WebSocket.OPEN||n.data.size===0)return;let e=new FileReader;e.onload=()=>{let o=e.result.split(",")[1];r.send(JSON.stringify({type:"audio_chunk",data:o}))},e.readAsDataURL(n.data)},l.start(250),m=!0,document.getElementById("wtai-mic").classList.add("recording"),(!r||r.readyState!==WebSocket.OPEN)&&v()}function S(){l&&(l.stop(),l.stream.getTracks().forEach(t=>t.stop()),m=!1,document.getElementById("wtai-mic").classList.remove("recording"),r&&r.readyState===WebSocket.OPEN&&r.send(JSON.stringify({type:"audio_end"})))}async function I(t){c||(c=new AudioContext);let n=atob(t),e=new Uint8Array(n.length);for(let s=0;s<n.length;s++)e[s]=n.charCodeAt(s);let o=await c.decodeAudioData(e.buffer),a=c.createBufferSource();a.buffer=o,a.connect(c.destination),a.start()}function d(t,n,e){let o=document.getElementById("wtai-messages"),a=document.createElement("div");return a.className=`wtai-msg ${t}${e?" "+e:""}`,a.textContent=n,o.appendChild(a),o.scrollTop=o.scrollHeight,a}document.readyState==="loading"?document.addEventListener("DOMContentLoaded",w):w();})();
