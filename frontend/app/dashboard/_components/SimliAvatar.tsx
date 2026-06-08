"use client";
/**
 * AvatarVideo  —  two-layer video avatar
 * ────────────────────────────────────────────────────────────────────────────
 * Layer 1 (back):   base idle loop  — always visible, always silent.
 *   • plays continuously while idle / thinking / listening
 *   • natural, living character appearance (no frozen static frame)
 *
 * Layer 2 (front):  MuseTalk video  — visible only while speaking.
 *   • loaded dynamically when musetalkVideoUrl is set
 *   • NOT muted — contains the Cartesia vocal audio baked in by the backend
 *   • removed from view the moment it ends; layer 1 reappears instantly
 *
 * Spinner contract (owned by parent DashboardAI):
 *   onBaseVideoReady  → base video buffered → hide "loading" spinner
 *   onSpeakVideoReady → musetalk video buffered → hide "generating" spinner
 *   onSpeakVideoEnd   → musetalk finished → parent advances the TTS queue
 *
 * sendAudio() stub:
 *   Kept for interface compatibility. Will pipe raw PCM-16 (16 kHz mono
 *   s16le) to a MuseTalk streaming path when that backend route exists.
 *
 * Env var:
 *   NEXT_PUBLIC_AVATAR_VIDEO_URL — override the default Replicate mp4.
 */

import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
} from "react";

// ── Config ────────────────────────────────────────────────────────────────────

export const BASE_VIDEO_URL =
  process.env.NEXT_PUBLIC_AVATAR_VIDEO_URL ??
  "https://replicate.delivery/pbxt/L2hFUyTjQUalIvUBRskwEaJLCi1dwbWNMjL1NI9cQNgvMfaX/sun.mp4";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface SimliAvatarHandle {
  /**
   * Feed raw PCM-16 audio (16 kHz mono, little-endian) to drive lip sync.
   * Stub — will be wired to a streaming MuseTalk path when ready.
   */
  sendAudio(pcm16: Uint8Array): void;
  isReady(): boolean;
}

type AvatarState = "idle" | "thinking" | "listening" | "speaking";

interface Props {
  avatarState: AvatarState;

  /**
   * URL of a MuseTalk-generated lip-sync video (contains baked audio).
   * Set → layer 2 loads and plays it over layer 1.
   * null → layer 1 resumes as the only visible layer.
   */
  musetalkVideoUrl?: string | null;

  /** Base idle video buffered enough to play — hide initial spinner. */
  onBaseVideoReady?: () => void;
  /** MuseTalk video buffered enough to play — hide "generating" spinner. */
  onSpeakVideoReady?: () => void;
  /** MuseTalk video finished — parent should advance the TTS queue. */
  onSpeakVideoEnd?: () => void;

  className?: string;
  style?: React.CSSProperties;

  // Legacy Simli props — accepted but unused so DashboardAI compiles unchanged.
  apiKey?: string;
  faceId?: string;
  onReady?: () => void;
  onError?: (err: Error) => void;
}

// ── Component ─────────────────────────────────────────────────────────────────

export const SimliAvatar = forwardRef<SimliAvatarHandle, Props>(
  function AvatarVideo(
    {
      avatarState,
      musetalkVideoUrl,
      onBaseVideoReady,
      onSpeakVideoReady,
      onSpeakVideoEnd,
      className,
      style,
      onReady,
    },
    ref,
  ) {
    const idleRef  = useRef<HTMLVideoElement>(null);
    const speakRef = useRef<HTMLVideoElement>(null);

    // ── Public handle ─────────────────────────────────────────────────────────
    useImperativeHandle(ref, () => ({
      sendAudio(pcm16: Uint8Array) {
        // TODO: stream to MuseTalk when backend route is ready.
        void pcm16;
      },
      isReady() { return true; },
    }));

    // ── Signal legacy onReady immediately ────────────────────────────────────
    useEffect(() => {
      onReady?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // ── Layer 1: idle video playback ─────────────────────────────────────────
    // Always looping silently. We never pause it — a live loop looks far more
    // natural than a frozen first frame (which browsers render as a static img).
    useEffect(() => {
      const v = idleRef.current;
      if (!v) return;

      if (avatarState === "idle" || !musetalkVideoUrl) {
        // Ensure the idle video is playing so it appears "alive"
        v.play().catch(() => {});
      }
      // When a musetalk video is active the idle video stays running silently
      // underneath — no visible gap when the musetalk video ends.
    }, [avatarState, musetalkVideoUrl]);

    // ── Layer 2: MuseTalk speaking video ─────────────────────────────────────
    useEffect(() => {
      const v = speakRef.current;
      if (!v) return;

      if (musetalkVideoUrl) {
        // Load the new URL; playback is triggered in onCanPlay below
        v.src    = musetalkVideoUrl;
        v.load();
      } else {
        // Clear the src so the element releases its resources
        v.src = "";
        try { v.load(); } catch { /* ignore */ }
      }
    }, [musetalkVideoUrl]);

    // ── Render ────────────────────────────────────────────────────────────────
    return (
      <>
        {/* ── Layer 1: base idle loop ───────────────────────────────────── */}
        <video
          ref={idleRef}
          src={BASE_VIDEO_URL}
          muted
          playsInline
          loop
          autoPlay
          preload="auto"
          onCanPlay={() => onBaseVideoReady?.()}
          className={className}
          style={{
            display:   "block",
            width:     "100%",
            height:    "100%",
            objectFit: "cover",
            ...style,
          }}
        />

        {/* ── Layer 2: MuseTalk lip-sync video ──────────────────────────── */}
        {/* Rendered at all times so the ref is stable; hidden via opacity   */}
        <video
          ref={speakRef}
          playsInline
          preload="auto"
          // NOT muted — the MuseTalk video has Cartesia audio baked in.
          // Playing it directly ensures audio + animation are perfectly locked.
          onCanPlay={() => {
            // Video has buffered enough — start playback and tell parent to
            // dismiss the "Generating Avatar Sync..." spinner.
            speakRef.current?.play().catch(() => {});
            onSpeakVideoReady?.();
          }}
          onEnded={() => onSpeakVideoEnd?.()}
          style={{
            position:       "absolute",
            inset:          0,
            display:        "block",
            width:          "100%",
            height:         "100%",
            objectFit:      "cover",
            // Crossfade in when a musetalk URL is active
            opacity:        musetalkVideoUrl ? 1 : 0,
            transition:     "opacity 0.15s ease",
            pointerEvents:  "none",
            zIndex:         1,
          }}
        />
      </>
    );
  },
);

export default SimliAvatar;
