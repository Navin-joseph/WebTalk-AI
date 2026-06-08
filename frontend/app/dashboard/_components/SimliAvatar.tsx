"use client";
/**
 * AvatarVideo  —  HeyGen Interactive Avatar WebRTC Stream
 * ──────────────────────────────────────────────────────────────────────────
 * Renders a WebRTC video stream from HeyGen that includes:
 *   - Real-time speech synthesis (TTS)
 *   - Mouth movement animation (lip-sync)
 *   - Natural avatar expressions (blinks, nods, etc.)
 *
 * The avatar is fully interactive: text sent to the backend is immediately
 * synthesized and animated, streamed back as video.
 *
 * Props:
 *   videoStreamUrl  — WebRTC stream URL from /heygen/session endpoint.
 *                     Pass this URL directly to <video> element.
 */

import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
} from "react";

export interface SimliAvatarHandle {
  /** Legacy stub — no longer used with HeyGen. */
  sendAudio(pcm16: Uint8Array): void;
  isReady(): boolean;
}

interface Props {
  /** WebRTC stream URL from HeyGen /heygen/session endpoint */
  videoStreamUrl?: string | null;
  className?: string;
  style?: React.CSSProperties;

  // Legacy props — ignored but kept for interface compatibility
  avatarState?: string;
  musetalkVideoUrl?: string | null;
  onBaseVideoReady?: () => void;
  onSpeakVideoReady?: () => void;
  onSpeakVideoEnd?: () => void;
  apiKey?: string;
  faceId?: string;
  onReady?: () => void;
  onError?: (err: Error) => void;
}

export const SimliAvatar = forwardRef<SimliAvatarHandle, Props>(
  function AvatarVideo(
    {
      videoStreamUrl,
      className,
      style,
      onReady,
    },
    ref,
  ) {
    const videoRef = useRef<HTMLVideoElement>(null);

    // ── Public handle ─────────────────────────────────────────────────────────
    useImperativeHandle(ref, () => ({
      sendAudio() {
        // No-op — HeyGen handles audio natively
      },
      isReady() { return !!videoStreamUrl; },
    }));

    // ── Signal ready immediately ──────────────────────────────────────────────
    useEffect(() => {
      onReady?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // ── Update video src when stream URL changes ──────────────────────────────
    useEffect(() => {
      const video = videoRef.current;
      if (!video) return;

      if (videoStreamUrl) {
        video.src = videoStreamUrl;
        video.load();
        video.play().catch(() => {
          // Autoplay blocked — that's ok, user will interact
        });
      } else {
        video.src = "";
        try { video.load(); } catch { /* ignore */ }
      }
    }, [videoStreamUrl]);

    return (
      <video
        ref={videoRef}
        muted
        playsInline
        autoPlay
        style={{
          display:   "block",
          width:     "100%",
          height:    "100%",
          objectFit: "cover",
          ...style,
        }}
        className={className}
      />
    );
  },
);

export default SimliAvatar;
