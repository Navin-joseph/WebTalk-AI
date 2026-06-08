/**
 * AvatarVideo  (replaces SimliAvatar WebRTC component)
 * ─────────────────────────────────────────────────────
 * Displays a looping video avatar with state-driven playback.
 * Removes all Simli WebRTC handshake, token generation, and ICE
 * negotiation. The avatar is visible instantly with zero async setup.
 *
 * Playback behaviour:
 *   idle                → video paused at frame 0  (mouth closed)
 *   thinking / listening / speaking  → video plays in a loop
 *
 * Future MuseTalk integration:
 *   sendAudio(pcm16) will pipe raw PCM-16 bytes (16 kHz mono s16le)
 *   to the MuseTalk backend once that pipeline is wired up.
 *   Until then it is a documented no-op stub.
 *
 * Env var:
 *   NEXT_PUBLIC_AVATAR_VIDEO_URL   — override the default video asset.
 *   Falls back to the bundled Replicate mp4 if not set.
 */

"use client";

import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
} from "react";

// ── Config ────────────────────────────────────────────────────────────────────

const AVATAR_VIDEO_URL =
  process.env.NEXT_PUBLIC_AVATAR_VIDEO_URL ??
  "https://replicate.delivery/pbxt/L2hFUyTjQUalIvUBRskwEaJLCi1dwbWNMjL1NI9cQNgvMfaX/sun.mp4";

// ── Types ─────────────────────────────────────────────────────────────────────

/** Same handle shape as the old Simli component — DashboardAI needs no import changes. */
export interface SimliAvatarHandle {
  /**
   * Feed raw PCM-16 audio (16 kHz mono, little-endian) for lip sync.
   * Currently a no-op stub — will be wired to MuseTalk when ready.
   */
  sendAudio(pcm16: Uint8Array): void;
  isReady(): boolean;
}

type AvatarState = "idle" | "thinking" | "listening" | "speaking";

interface Props {
  /** Current AI state — drives video play / pause. */
  avatarState: AvatarState;
  /** Called the first time the video has buffered enough to play. */
  onVideoReady?: () => void;
  className?: string;
  style?: React.CSSProperties;

  // Legacy Simli props — accepted but unused so call sites compile unchanged.
  apiKey?: string;
  faceId?: string;
  onReady?: () => void;
  onError?: (err: Error) => void;
}

// ── Component ─────────────────────────────────────────────────────────────────

export const SimliAvatar = forwardRef<SimliAvatarHandle, Props>(
  function AvatarVideo(
    { avatarState, onVideoReady, className, style, onReady },
    ref,
  ) {
    const videoRef = useRef<HTMLVideoElement>(null);

    // ── Public handle ─────────────────────────────────────────────────────────
    useImperativeHandle(ref, () => ({
      sendAudio(pcm16: Uint8Array) {
        // TODO: pipe PCM-16 to MuseTalk when backend integration is complete.
        // Shape: 16-bit signed little-endian, 16 kHz, mono.
        // Suppress unused-variable lint until wired up:
        void pcm16;
      },
      isReady() { return true; },
    }));

    // ── Signal legacy onReady immediately (no async handshake needed) ────────
    useEffect(() => {
      onReady?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // ── State-driven playback ─────────────────────────────────────────────────
    useEffect(() => {
      const video = videoRef.current;
      if (!video) return;

      if (avatarState === "idle") {
        // Pause on frame 0 — shows a closed-mouth still.
        video.pause();
        video.currentTime = 0;
      } else {
        // speaking / thinking / listening — play the talking loop.
        video.play().catch(() => {
          // Autoplay may be blocked until first user gesture — that's fine,
          // the video will start on the next interaction.
        });
      }
    }, [avatarState]);

    return (
      <video
        ref={videoRef}
        src={AVATAR_VIDEO_URL}
        muted
        playsInline
        loop
        preload="auto"
        className={className}
        // onCanPlay fires as soon as the browser has buffered enough to start
        // playing. This is the earliest safe moment to hide the loading spinner.
        onCanPlay={() => onVideoReady?.()}
        style={{
          display:    "block",
          width:      "100%",
          height:     "100%",
          objectFit:  "cover",
          // Keep the element in the DOM even while loading so the browser
          // can buffer the video; visibility is controlled by the parent overlay.
          ...style,
        }}
      />
    );
  },
);

export default SimliAvatar;
