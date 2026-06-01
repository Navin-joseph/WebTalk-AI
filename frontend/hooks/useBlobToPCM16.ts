/**
 * blobToPCM16
 * ───────────
 * Converts an MP3/AAC/WAV audio Blob to a raw PCM-16 Uint8Array at 16 kHz
 * mono — the exact format Simli.ai expects for its sendAudioData() call.
 *
 * Process:
 *   1. Decode the audio blob using the Web Audio API.
 *   2. Resample to 16 000 Hz mono via OfflineAudioContext.
 *   3. Convert Float32 samples → Int16 → Uint8Array (raw bytes, LE).
 *
 * Usage:
 *   const uint8 = await blobToPCM16(blob);
 *   simliRef.current.sendAudio(uint8);
 */

const TARGET_SAMPLE_RATE = 16_000; // Hz — what Simli expects

let sharedAudioCtx: AudioContext | null = null;

function getAudioCtx(): AudioContext {
  if (!sharedAudioCtx || sharedAudioCtx.state === "closed") {
    sharedAudioCtx = new (
      window.AudioContext ||
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (window as any).webkitAudioContext
    )({ sampleRate: 44100 });  // decode at native rate; we resample below
  }
  return sharedAudioCtx;
}

export async function blobToPCM16(blob: Blob): Promise<Uint8Array> {
  // 1. Decode the compressed audio
  const arrayBuffer = await blob.arrayBuffer();
  const audioCtx    = getAudioCtx();
  const decoded     = await audioCtx.decodeAudioData(arrayBuffer);

  // 2. Resample to 16 kHz mono with OfflineAudioContext
  const numFrames     = Math.ceil(decoded.duration * TARGET_SAMPLE_RATE);
  const offlineCtx    = new OfflineAudioContext(1, numFrames, TARGET_SAMPLE_RATE);
  const src           = offlineCtx.createBufferSource();
  src.buffer          = decoded;
  src.connect(offlineCtx.destination);
  src.start(0);
  const rendered      = await offlineCtx.startRendering();
  const float32       = rendered.getChannelData(0);

  // 3. Float32 → Int16 → Uint8Array (little-endian)
  const int16  = new Int16Array(float32.length);
  for (let i = 0; i < float32.length; i++) {
    // Clamp to [-1, 1] then scale to Int16 range
    const s    = Math.max(-1, Math.min(1, float32[i]));
    int16[i]   = s < 0 ? s * 0x8000 : s * 0x7FFF;
  }

  return new Uint8Array(int16.buffer);
}
