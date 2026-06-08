"use client";
/**
 * AvatarVideo  —  HeyGen Interactive Avatar WebRTC Stream
 * ──────────────────────────────────────────────────────────────────────────
 * Receives a MediaStream object (video + audio tracks) from HeyGen and
 * renders it in a native HTML5 <video> element with audio enabled.
 *
 * Key fixes:
 *   - NOT muted (audio must be audible)
 *   - videoRef.current.srcObject = mediaStream (not src = string)
 *   - Audio tracks explicitly enabled
 *   - Proper MediaStream lifecycle management
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
  /**
   * MediaStream object from HeyGen containing video + audio tracks.
   * Not a URL — a live stream object.
   */
  mediaStream?: MediaStream | null;

  /**
   * HeyGen stream URL + access token for fetching the live stream.
   * If provided, these are used to fetch the actual MediaStream.
   */
  streamUrl?: string | null;
  streamAccessToken?: string | null;

  className?: string;
  style?: React.CSSProperties;

  // Legacy props — ignored but kept for interface compatibility
  videoStreamUrl?: string | null;
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
      mediaStream,
      streamUrl,
      streamAccessToken,
      className,
      style,
      onReady,
    },
    ref,
  ) {
    const videoRef = useRef<HTMLVideoElement>(null);
    const fetchAbortRef = useRef<AbortController | null>(null);

    // ── Public handle ─────────────────────────────────────────────────────────
    useImperativeHandle(ref, () => ({
      sendAudio() {
        // No-op — HeyGen handles audio natively
      },
      isReady() { return !!mediaStream; },
    }));

    // ── Signal ready immediately ──────────────────────────────────────────────
    useEffect(() => {
      onReady?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // ── Fetch MediaStream from HeyGen URL if needed ───────────────────────
    // If streamUrl + token are provided but no mediaStream yet, fetch it.
    useEffect(() => {
      if (!streamUrl || !streamAccessToken) return;
      if (mediaStream) return; // already have a stream

      let isMounted = true;

      (async () => {
        try {
          fetchAbortRef.current = new AbortController();

          // Fetch the stream from HeyGen with authentication
          const res = await fetch(streamUrl, {
            method:    "GET",
            headers:   { "Authorization": `Bearer ${streamAccessToken}` },
            signal:    fetchAbortRef.current.signal,
          });

          if (!res.ok) {
            console.error(
              `[AvatarVideo] Stream fetch failed HTTP ${res.status}:`,
              res.statusText,
            );
            return;
          }

          if (!isMounted || !res.body) return;

          // Convert the fetch response to a playable format
          // HeyGen's endpoint returns a media stream (MP4, HLS, etc.)
          const blob = await res.blob();
          const objectUrl = URL.createObjectURL(blob);

          if (isMounted) {
            const video = videoRef.current;
            if (video) {
              video.src = objectUrl;
              video.load();
              video.play().catch(err => {
                console.warn("[AvatarVideo] autoplay blocked:", err.message);
              });
              console.log("[AvatarVideo] Stream loaded from URL");
            }
          }
        } catch (err) {
          if (err instanceof Error && err.name === "AbortError") return; // cancelled
          console.error("[AvatarVideo] Stream fetch error:", err);
        }
      })();

      return () => {
        isMounted = false;
        fetchAbortRef.current?.abort();
      };
    }, [streamUrl, streamAccessToken, mediaStream]);

    // ── Attach MediaStream to video element ─────────────────────────────────
    // This is the critical fix: WebRTC/live streams use srcObject, not src.
    useEffect(() => {
      const video = videoRef.current;
      if (!video || !mediaStream) return;

      // Assign the live MediaStream object to the video element.
      // This includes both video and audio tracks.
      video.srcObject = mediaStream;

      // Ensure audio tracks are not muted or blocked.
      const audioTracks = mediaStream.getAudioTracks();
      audioTracks.forEach(track => {
        track.enabled = true; // explicitly enable audio
      });

      const videoTracks = mediaStream.getVideoTracks();
      videoTracks.forEach(track => {
        track.enabled = true; // explicitly enable video
      });

      // Attempt to play. Autoplay may be blocked by browser policy,
      // but user interaction (clicking send/speak) will trigger playback.
      video.play().catch(err => {
        console.warn("[AvatarVideo] autoplay blocked:", err.message);
        // Not an error — user will interact, triggering playback
      });

      console.log(
        "[AvatarVideo] MediaStream attached:",
        `audio=${audioTracks.length}`,
        `video=${videoTracks.length}`,
      );

      // Cleanup: stop all tracks when component unmounts or stream changes.
      return () => {
        if (video.srcObject) {
          const tracks = (video.srcObject as MediaStream).getTracks();
          tracks.forEach(track => track.stop());
          video.srcObject = null;
        }
      };
    }, [mediaStream]);

    return (
      <video
        ref={videoRef}
        // CRITICAL: NOT muted — audio must be audible.
        // If muted={true}, the <audio> tracks are silenced.
        autoPlay
        playsInline
        style={{
          display:   "block",
          width:     "100%",
          height:    "100%",
          objectFit: "cover",
          backgroundColor: "#000", // black background while loading
          ...style,
        }}
        className={className}
      />
    );
  },
);

export default SimliAvatar;
