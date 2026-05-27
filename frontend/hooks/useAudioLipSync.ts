/**
 * useAudioLipSync
 * ────────────────
 * Analyses a playing <audio> element in real-time using the Web Audio API
 * and maps speech frequency bands to the five standard VRM vowel visemes:
 *
 *   aa – open mouth (father)    → 700–1 500 Hz  (high F1)
 *   ih – narrow/high  (bit)     → 1 800–3 800 Hz (high F2, front)
 *   ou – rounded/back (boot)    → 300–700 Hz    (low F2)
 *   ee – wide smile   (beat)    → 1 200–2 800 Hz (very high F2)
 *   oh – open round   (bought)  → 500–1 100 Hz  (mid F2)
 *
 * Usage:
 *   const { start, stop, amplitudeRef } = useAudioLipSync();
 *   // on audio canplay:
 *   start(audioEl, ({ weights, amplitude, viseme }) => { ... });
 *   // on audio ended:
 *   stop();
 */

import { useRef, useCallback } from "react";

// ── Public types ──────────────────────────────────────────────────────────────

export type VisemeName = "aa" | "ih" | "ou" | "ee" | "oh" | "neutral";

export interface VisemeWeights {
  aa: number;
  ih: number;
  ou: number;
  ee: number;
  oh: number;
}

export interface VisemeFrame {
  /** Dominant viseme label */
  viseme: VisemeName;
  /** Overall speech amplitude 0–1 (smoothed RMS) */
  amplitude: number;
  /** Per-viseme blend weights 0–1 — apply all of them to the VRM */
  weights: VisemeWeights;
  /** Raw waveform bins for waveform bar visualisation (length = NUM_BARS) */
  bars: number[];
}

export type VisemeCallback = (frame: VisemeFrame) => void;

const NUM_BARS = 12;

// ── Hook ─────────────────────────────────────────────────────────────────────

export function useAudioLipSync() {
  const audioCtxRef  = useRef<AudioContext | null>(null);
  const sourceRef    = useRef<MediaElementAudioSourceNode | null>(null);
  const analyserRef  = useRef<AnalyserNode | null>(null);
  const animRef      = useRef<number | null>(null);
  const smoothAmpRef = useRef(0);
  /** Live amplitude for external waveform displays — updated every frame */
  const amplitudeRef = useRef(0);

  // ── Stop ────────────────────────────────────────────────────────────────────
  const stop = useCallback(() => {
    if (animRef.current) { cancelAnimationFrame(animRef.current); animRef.current = null; }
    try { sourceRef.current?.disconnect(); } catch { /* ignore */ }
    sourceRef.current   = null;
    analyserRef.current = null;
    smoothAmpRef.current = 0;
    amplitudeRef.current = 0;
  }, []);

  // ── Start ───────────────────────────────────────────────────────────────────
  const start = useCallback((audioEl: HTMLAudioElement, onViseme: VisemeCallback) => {
    stop();

    try {
      // Reuse AudioContext — browsers allow only one per tab
      if (!audioCtxRef.current || audioCtxRef.current.state === "closed") {
        audioCtxRef.current = new (
          window.AudioContext ||
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          (window as any).webkitAudioContext
        )();
      }
      if (audioCtxRef.current.state === "suspended") {
        audioCtxRef.current.resume().catch(() => {});
      }

      const ctx      = audioCtxRef.current;
      const analyser = ctx.createAnalyser();
      analyser.fftSize               = 512;   // 256 bins
      analyser.smoothingTimeConstant = 0.65;  // mild temporal smoothing
      analyserRef.current            = analyser;

      const src = ctx.createMediaElementSource(audioEl);
      src.connect(analyser);
      analyser.connect(ctx.destination);
      sourceRef.current = src;

      const bufLen = analyser.frequencyBinCount;   // 256
      const data   = new Uint8Array(bufLen);
      const sampleRate = ctx.sampleRate;            // e.g. 44100
      const binHz  = sampleRate / analyser.fftSize; // Hz per bin

      /** Bin index for a given frequency (clamped) */
      const bIdx = (hz: number) => Math.min(bufLen - 1, Math.max(0, Math.round(hz / binHz)));

      /** Average normalised energy in a frequency range */
      const bandAvg = (loHz: number, hiHz: number): number => {
        const a = bIdx(loHz), b = bIdx(hiHz);
        let s = 0;
        for (let i = a; i <= b; i++) s += data[i];
        return s / Math.max(1, b - a + 1) / 255;
      };

      const tick = () => {
        animRef.current = requestAnimationFrame(tick);
        analyser.getByteFrequencyData(data);

        // ── Overall amplitude (speech band 80–4 000 Hz) ───────────────
        const lo80  = bIdx(80);
        const hi4k  = bIdx(4000);
        let sumSq   = 0;
        for (let i = lo80; i <= hi4k; i++) sumSq += data[i] * data[i];
        const rms   = Math.sqrt(sumSq / Math.max(1, hi4k - lo80 + 1)) / 255;
        // Fast attack, slow release — keeps mouth from snapping shut
        const tgt   = rms > smoothAmpRef.current ? rms : smoothAmpRef.current * 0.84;
        smoothAmpRef.current += (tgt - smoothAmpRef.current) * 0.28;
        const amp   = Math.min(1, smoothAmpRef.current * 3.8);
        amplitudeRef.current = amp;

        // ── Waveform bars (12 visual bars) ────────────────────────────
        const bars: number[] = [];
        for (let i = 0; i < NUM_BARS; i++) {
          bars.push(Math.max(3, Math.round((data[Math.floor(2 + i * 4)] / 255) * 24)));
        }

        // ── Silent frame — emit neutral ────────────────────────────────
        if (amp < 0.03) {
          onViseme({ viseme: "neutral", amplitude: 0, weights: { aa: 0, ih: 0, ou: 0, ee: 0, oh: 0 }, bars });
          return;
        }

        // ── Per-vowel frequency band energies ─────────────────────────
        // Bands derived from average F1/F2 formant ranges:
        //   ou (boot): very low F2  300–700 Hz
        //   oh (bought): mid-low    500–1 100 Hz
        //   aa (father): high F1    700–1 500 Hz
        //   ee (beat): very high F2 1 200–2 800 Hz
        //   ih (bit): high F2+      1 800–3 800 Hz
        const eOU = bandAvg(300,  700);
        const eOH = bandAvg(500,  1100);
        const eAA = bandAvg(700,  1500);
        const eEE = bandAvg(1200, 2800);
        const eIH = bandAvg(1800, 3800);

        // Normalise so weights sum ≤ 1 × amplitude
        const total = eOU + eOH + eAA + eEE + eIH + 1e-6;
        const wOU = (eOU / total) * amp;
        const wOH = (eOH / total) * amp;
        const wAA = (eAA / total) * amp;
        const wEE = (eEE / total) * amp;
        const wIH = (eIH / total) * amp;

        // Dominant viseme for state label only (we send ALL weights to VRM)
        const pairs: [VisemeName, number][] = [
          ["ou", wOU], ["oh", wOH], ["aa", wAA], ["ee", wEE], ["ih", wIH],
        ];
        const dominant = pairs.reduce((best, cur) => (cur[1] > best[1] ? cur : best))[0];

        onViseme({
          viseme:    dominant,
          amplitude: amp,
          weights:   { aa: wAA, ih: wIH, ou: wOU, ee: wEE, oh: wOH },
          bars,
        });
      };

      tick();
    } catch (e) {
      console.warn("[LipSync] AudioContext setup failed:", e);
    }
  }, [stop]);

  return { start, stop, amplitudeRef };
}
