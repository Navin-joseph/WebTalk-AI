"use client";
/**
 * AvatarVideo  —  HeyGen Interactive Avatar via WebRTC
 * ──────────────────────────────────────────────────────────────────────────
 * Handles the remote MediaStream from HeyGen's WebRTC connection.
 * The parent component (DashboardAI) manages the RTCPeerConnection;
 * this component just attaches the remote tracks to the <video> element.
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
   * RTCPeerConnection from HeyGen handshake.
   * Parent (DashboardAI) creates it and manages the SDP offer/answer flow.
   */
  peerConnection?: RTCPeerConnection | null;
  className?: string;
  style?: React.CSSProperties;

  // Legacy props — ignored but kept for interface compatibility
  mediaStream?: any;
  videoStreamUrl?: string | null;
  streamUrl?: string | null;
  streamAccessToken?: string | null;
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
      peerConnection,
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
      isReady() { return !!peerConnection; },
    }));

    // ── Signal ready immediately ──────────────────────────────────────────────
    useEffect(() => {
      onReady?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // ── Attach RTCPeerConnection event handlers ────────────────────────────────
    useEffect(() => {
      if (!peerConnection) return;

      // CRITICAL: Listen for remote tracks from HeyGen
      // When HeyGen sends video+audio, this fires with the remote stream
      const handleTrack = (event: RTCTrackEvent) => {
        console.log(
          "[AvatarVideo] Remote track received:",
          event.track.kind,
          `(${event.track.enabled ? "enabled" : "disabled"})`,
        );

        // The stream contains both video and audio tracks
        if (event.streams && event.streams[0]) {
          const stream = event.streams[0];
          const video = videoRef.current;

          if (video) {
            console.log(
              "[AvatarVideo] Attaching stream to video element:",
              `${stream.getVideoTracks().length} video tracks,`,
              `${stream.getAudioTracks().length} audio tracks`,
            );

            // Attach the entire MediaStream (video + audio)
            video.srcObject = stream;

            // Ensure all tracks are enabled
            stream.getTracks().forEach(track => {
              track.enabled = true;
              console.log(
                `[AvatarVideo] Track enabled: ${track.kind} (${track.id})`,
              );
            });

            // Try to play (may be blocked by autoplay policy)
            video.play().catch(err => {
              console.warn("[AvatarVideo] Autoplay blocked:", err.message);
            });
          }
        }
      };

      const handleConnectionStateChange = () => {
        console.log(
          "[AvatarVideo] Connection state:",
          peerConnection.connectionState,
        );

        if (peerConnection.connectionState === "failed") {
          console.error("[AvatarVideo] WebRTC connection failed");
        }
      };

      const handleIceConnectionStateChange = () => {
        console.log(
          "[AvatarVideo] ICE connection state:",
          peerConnection.iceConnectionState,
        );
      };

      // Register event listeners
      peerConnection.addEventListener("track", handleTrack);
      peerConnection.addEventListener(
        "connectionstatechange",
        handleConnectionStateChange,
      );
      peerConnection.addEventListener(
        "iceconnectionstatechange",
        handleIceConnectionStateChange,
      );

      // Cleanup
      return () => {
        peerConnection.removeEventListener("track", handleTrack);
        peerConnection.removeEventListener(
          "connectionstatechange",
          handleConnectionStateChange,
        );
        peerConnection.removeEventListener(
          "iceconnectionstatechange",
          handleIceConnectionStateChange,
        );
      };
    }, [peerConnection]);

    return (
      <video
        ref={videoRef}
        // CRITICAL: NOT muted — HeyGen audio must be audible
        autoPlay
        playsInline
        style={{
          display:   "block",
          width:     "100%",
          height:    "100%",
          objectFit: "cover",
          backgroundColor: "#000",
          ...style,
        }}
        className={className}
      />
    );
  },
);

export default SimliAvatar;
