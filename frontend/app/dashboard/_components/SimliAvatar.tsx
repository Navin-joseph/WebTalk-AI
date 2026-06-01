/**
 * SimliAvatar
 * ───────────
 * Real-time talking-face video powered by Simli.ai.
 *
 * How it works:
 *   1. Calls Simli's REST API to generate a WebRTC session token.
 *   2. Opens a WebRTC peer connection; Simli streams back a continuous
 *      video of the avatar – idle breathing when quiet, speaking in sync
 *      when audio is fed in.
 *   3. The parent component calls ref.sendAudio(uint8) with PCM-16 audio
 *      (16 kHz, mono, little-endian) to drive the lip movement.
 *   4. Simli's audio output is muted here; the TTS audio is played
 *      locally by DashboardAI so waveform bars + timing still work.
 *
 * Setup (one-time – takes ~2 minutes):
 *   1. Sign up free at https://app.simli.ai → copy your API key.
 *   2. Create a face:
 *        curl -X POST https://api.simli.ai/createFaceId \
 *          -H "x-simli-key: YOUR_KEY" \
 *          -F "image=@frontend/public/avatar.jpg" \
 *          -F "name=WebTalkAI"
 *      Copy the returned faceId.
 *   3. Add to Vercel env vars:
 *        NEXT_PUBLIC_SIMLI_API_KEY = your-api-key
 *        NEXT_PUBLIC_SIMLI_FACE_ID = your-face-id
 */

"use client";

import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from "react";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface SimliAvatarHandle {
  /** Send PCM-16 (16 kHz mono, little-endian) Uint8Array to drive lip sync */
  sendAudio(data: Uint8Array): void;
  isReady(): boolean;
}

interface Props {
  apiKey: string;
  faceId: string;
  onReady?: () => void;
  onError?: (err: Error) => void;
  /** Fallback element shown while connecting / on error */
  fallback?: React.ReactNode;
  className?: string;
  style?: React.CSSProperties;
}

// ── Component ─────────────────────────────────────────────────────────────────

export const SimliAvatar = forwardRef<SimliAvatarHandle, Props>(
  function SimliAvatar({ apiKey, faceId, onReady, onError, fallback, className, style }, ref) {
    const videoRef  = useRef<HTMLVideoElement>(null);
    const audioRef  = useRef<HTMLAudioElement>(null);
    const clientRef = useRef<import("simli-client").SimliClient | null>(null);
    const readyRef  = useRef(false);

    const [status, setStatus] = useState<"connecting" | "ready" | "error">("connecting");

    // ── Public handle ─────────────────────────────────────────────────────────
    useImperativeHandle(ref, () => ({
      sendAudio(data: Uint8Array) {
        if (readyRef.current && clientRef.current) {
          try { clientRef.current.sendAudioData(data); } catch { /* ignore */ }
        }
      },
      isReady() { return readyRef.current; },
    }));

    // ── Init Simli WebRTC ─────────────────────────────────────────────────────
    useEffect(() => {
      if (!apiKey || !faceId) {
        setStatus("error");
        return;
      }

      let cancelled = false;

      (async () => {
        try {
          // Dynamic import — keeps Three.js + Simli out of the server bundle
          const {
            SimliClient,
            generateSimliSessionToken,
            generateIceServers,
          } = await import("simli-client");

          if (cancelled) return;

          // 1. Get session token from Simli
          const tokenResp = await generateSimliSessionToken({
            apiKey,
            config: {
              faceId,
              handleSilence: true,
              maxSessionLength: 600,
              maxIdleTime:     120,
              model: "fasttalk",
            },
          });

          if (cancelled) return;

          // 2. Get ICE servers (for WebRTC NAT traversal)
          const iceServers = await generateIceServers(apiKey);

          if (cancelled) return;

          // 3. Both DOM elements must be in the DOM at this point
          const video = videoRef.current;
          const audio = audioRef.current;
          if (!video || !audio) throw new Error("DOM elements not ready");

          // 4. Create and start the client
          const client = new SimliClient(
            tokenResp.session_token,
            video,
            audio,
            iceServers
          );

          // Listen for events (actual event names from SimliClientEvents type)
          client.on("start", () => {
            if (cancelled) return;
            readyRef.current = true;
            setStatus("ready");
            onReady?.();
          });
          client.on("stop", () => {
            if (cancelled) return;
            readyRef.current = false;
            setStatus("error");
          });
          client.on("startup_error", (msg) => {
            if (cancelled) return;
            readyRef.current = false;
            setStatus("error");
            onError?.(new Error(`Simli startup error: ${msg}`));
          });
          client.on("error", (detail) => {
            if (cancelled) return;
            console.warn("[SimliAvatar] error:", detail);
          });

          clientRef.current = client;
          await client.start();

        } catch (e) {
          if (!cancelled) {
            console.warn("[SimliAvatar] init failed:", e);
            setStatus("error");
            onError?.(e instanceof Error ? e : new Error(String(e)));
          }
        }
      })();

      return () => {
        cancelled = true;
        try { clientRef.current?.stop(); } catch { /* ignore */ }
        clientRef.current = null;
        readyRef.current  = false;
      };
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [apiKey, faceId]);

    return (
      <>
        {/* Simli video stream */}
        <video
          ref={videoRef}
          autoPlay
          playsInline
          className={className}
          style={{
            display:    "block",
            width:      "100%",
            height:     "100%",
            objectFit:  "cover",
            opacity:    status === "ready" ? 1 : 0,
            transition: "opacity 0.6s ease",
            ...style,
          }}
        />

        {/* Muted audio — we play TTS locally for timing; this prevents double sound */}
        <audio ref={audioRef} autoPlay muted />

        {/* Fallback / loading overlay */}
        {status !== "ready" && fallback && (
          <div className="absolute inset-0" style={{ zIndex: 0 }}>
            {fallback}
          </div>
        )}

        {/* Connecting indicator */}
        {status === "connecting" && (
          <div className="absolute bottom-16 left-1/2 -translate-x-1/2 flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-medium text-white"
            style={{ background: "rgba(0,0,0,.5)", backdropFilter: "blur(6px)", zIndex: 20 }}>
            <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse" />
            Connecting avatar…
          </div>
        )}
      </>
    );
  }
);

export default SimliAvatar;
