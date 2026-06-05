# Simli.ai WebRTC Avatar Setup Guide

## Step 1: Get Simli.ai Credentials

### Get API Key
1. Go to **https://app.simli.ai**
2. Sign up or log in
3. Go to **Settings → API Keys**
4. Copy your API key (save it safely)
   - Example: `zxvcgjq9ijl9rjot3rfjoo`

### Create & Get Face ID
1. In Simli Studio, click **"Faces"** in left sidebar
2. Click **"Create Face"**
3. Upload your avatar photo (or use demo)
4. Wait ~30 seconds for processing
5. Click the face card → copy the **Face ID** from the URL or detail panel
   - Example: `dd10cb5a-d31d-4b8f-a4c2-xyz...`

---

## Step 2: Add to Vercel (Dashboard & Widget)

Go to **Vercel → Your Project → Settings → Environment Variables**

Add these two variables:

```
NEXT_PUBLIC_SIMLI_API_KEY=zxvcgjq9ijl9rjot3rfjoo
NEXT_PUBLIC_SIMLI_FACE_ID=dd10cb5a-d31d-4b8f-a4c2-xyz...
```

Click **Save** → Vercel auto-redeploys (2-3 min)

---

## Step 3: Embed Widget on Your Website

Add this code to your website **before `</body>`**:

```html
<script defer src="https://web-talk-ai.vercel.app/widget.js"></script>
<script>
document.addEventListener("DOMContentLoaded", function () {
  WebTalkAI.init({
    apiKey: "YOUR_GENERATED_API_KEY",
    
    // ── Optional: Simli.ai WebRTC avatar ────────────────
    simliApiKey: "zxvcgjq9ijl9rjot3rfjoo",
    simliFaceId: "dd10cb5a-d31d-4b8f-a4c2-xyz...",
    
    // ── Widget settings ────────────────────────────────
    theme: "dark",
    position: "bottom-right",
    voiceEnabled: true,
    ttsAutoPlay: true
  });
});
</script>
```

**Replace:**
- `YOUR_GENERATED_API_KEY` — from Dashboard → Install & API Keys
- `zxvcgjq9ijl9rjot3rfjoo` — your Simli API key
- `dd10cb5a-d31d-4b8f-a4c2-xyz...` — your Simli Face ID

---

## Step 4: Test & Debug

### Check Browser Console

When you open the widget, you should see in **Browser DevTools → Console**:

✅ **Success:**
```
[WebTalkAI] Initializing Simli WebRTC...
[WebTalkAI] Generating Simli session token...
[WebTalkAI] Getting ICE servers...
[WebTalkAI] Creating SimliClient...
[WebTalkAI] Starting Simli client...
[WebTalkAI] Simli WebRTC connected
```

❌ **If you see errors:**

| Error | Fix |
|---|---|
| `No session token returned` | API key is wrong or face ID doesn't exist |
| `startup_error` | Face ID invalid; check it in Simli Studio |
| `Cannot find video/audio elements` | Widget HTML is corrupted; try hard refresh |
| `Simli not configured` | Missing simliApiKey or simliFaceId in init() |

---

## Step 5: Without Simli (Fallback)

If you **don't** provide Simli credentials, the widget automatically shows **photo puppet-warp animation**:

```javascript
WebTalkAI.init({
  apiKey: "YOUR_API_KEY",
  // Remove: simliApiKey and simliFaceId
  theme: "dark",
  ttsAutoPlay: true
});
```

---

## Troubleshooting

### "Invalid API key" errors in chat
- ✅ This means the **backend API key is wrong**, not Simli
- Fix: Generate a new API key in Dashboard → Install & API Keys
- Paste the full key, not a shortened version

### Simli avatar not showing but no errors
- Clear browser cache: `Ctrl+Shift+Delete` → clear all
- Hard refresh: `Ctrl+Shift+R` or `Cmd+Shift+R`
- Check console for exact error message

### Face ID not working
- Double-check spelling in embed code
- Go to app.simli.ai → Faces → click your face → copy exact ID
- Make sure the face finished processing (green checkmark)

### WebRTC connection takes 5+ seconds
- This is normal. Simli needs ~3-5 seconds to establish connection
- Loading animation shows while connecting

---

## What You Get

✅ **Dashboard**: Real-time Simli avatar + puppet-warp during connect  
✅ **Widget**: Real-time Simli avatar with dark theme  
✅ **Fallback**: Photo puppet-warp if Simli config missing  
✅ **Audio Sync**: PCM-16 audio for perfect lip sync  
✅ **Low Latency**: Cartesia TTS at 80-150ms first byte  

---

## Free Tier Limits

- **Simli.ai**: 100 minutes per month (free)
- **Cartesia TTS**: Free tier available
- **Deepgram STT**: Free tier available
- **Groq LLM**: Free tier available

**All free with no credit card needed!**
