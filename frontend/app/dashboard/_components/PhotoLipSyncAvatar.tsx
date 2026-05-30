/**
 * PhotoLipSyncAvatar
 * ──────────────────
 * Renders a real-person photo on a canvas and animates the mouth using
 * a "puppet warp" technique: the actual face pixels split at the mouth
 * line and the lower-face (lower lip + chin) shifts down while speech plays.
 *
 * Result looks far more realistic than bezier-curve overlays because
 * the real skin texture, lower lip shape, and chin move together.
 *
 * Mouth detection (one-time, lazy):
 *   1. Uses the browser-native FaceDetector API (Chrome / Edge)
 *      → gets exact mouth-centre Y from the `mouth` landmark
 *   2. Falls back to H × 0.76 for Firefox / Safari (works for most
 *      portrait/headshot crops)
 *
 * Idle animations (always running):
 *   • Gentle breathing — subtle vertical scale pulse
 *   • Head sway — tiny Lissajous XY translate
 *   • Speaking bob — rapid micro-bounce while mouth is open
 *
 * Controlled via imperative handle:
 *   ref.current.updateViseme(weights, amplitude)   // called every RAF frame
 *   ref.current.reset()                            // snap mouth closed
 */

"use client";

import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from "react";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface PhotoLipSyncHandle {
  updateViseme(
    weights: { aa: number; ih: number; ou: number; ee: number; oh: number },
    amplitude: number
  ): void;
  reset(): void;
}

interface Props {
  photoUrl: string;
  width: number;
  height: number;
  avatarState?: "idle" | "thinking" | "listening" | "speaking";
  className?: string;
  style?: React.CSSProperties;
}

interface MouthCfg {
  /** Mouth-centre Y in canvas pixels */
  centerY: number;
  /** Mouth width in canvas pixels  */
  mouthW: number;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const DEFAULT_CFG: MouthCfg = { centerY: 0, mouthW: 0 };

/** Try to locate the mouth via the browser FaceDetector API. */
async function detectMouthFromImage(
  img: HTMLImageElement,
  canvasW: number,
  canvasH: number
): Promise<MouthCfg> {
  const natW = img.naturalWidth  || canvasW;
  const natH = img.naturalHeight || canvasH;
  const sx   = canvasW / natW;
  const sy   = canvasH / natH;

  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const FD = (window as any).FaceDetector;
    if (!FD) throw new Error("no FaceDetector");
    const detector = new FD({ maxDetectedFaces: 1, fastMode: false });
    const faces = await detector.detect(img);
    if (!faces.length) throw new Error("no face detected");

    const face = faces[0];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const mouthLM = face.landmarks?.find((l: any) => l.type === "mouth");

    let centerY: number;
    let mouthW: number;

    if (mouthLM) {
      // Chrome M125+ provides exact landmark location
      centerY = mouthLM.location.y * sy;
      mouthW  = face.boundingBox.width * 0.36 * sx;
    } else {
      // Older Chrome: estimate from face bounding box
      const bb = face.boundingBox;
      centerY  = (bb.top + bb.height * 0.78) * sy;
      mouthW   = bb.width * 0.34 * sx;
    }

    return { centerY, mouthW };
  } catch {
    // FaceDetector unavailable (Firefox / Safari) — use portrait defaults
    return {
      centerY: canvasH * 0.76,
      mouthW:  canvasW * 0.24,
    };
  }
}

// ── Component ─────────────────────────────────────────────────────────────────

export const PhotoLipSyncAvatar = forwardRef<PhotoLipSyncHandle, Props>(
  function PhotoLipSyncAvatar(
    { photoUrl, width, height, avatarState = "idle", className, style },
    ref
  ) {
    const canvasRef  = useRef<HTMLCanvasElement>(null);
    const imgRef     = useRef<HTMLImageElement | null>(null);
    const cfgRef     = useRef<MouthCfg>(DEFAULT_CFG);
    const rafRef     = useRef<number | null>(null);
    const timeRef    = useRef(0);                            // accumulated seconds
    const lastTRef   = useRef(performance.now());
    // Live viseme data written from outside via handle
    const wRef       = useRef({ aa: 0, ih: 0, ou: 0, ee: 0, oh: 0 });
    const ampRef     = useRef(0);
    // Refs for props used inside RAF (avoid stale closure)
    const stateRef   = useRef(avatarState);
    const [ready, setReady] = useState(false);

    useEffect(() => { stateRef.current = avatarState; }, [avatarState]);

    // ── Imperative handle ─────────────────────────────────────────────────
    useImperativeHandle(ref, () => ({
      updateViseme(weights, amplitude) {
        wRef.current   = weights;
        ampRef.current = amplitude;
      },
      reset() {
        wRef.current   = { aa: 0, ih: 0, ou: 0, ee: 0, oh: 0 };
        ampRef.current = 0;
      },
    }));

    // ── Puppet-warp draw ──────────────────────────────────────────────────
    const drawFrame = useCallback(
      (
        ctx: CanvasRenderingContext2D,
        img: HTMLImageElement,
        cfg: MouthCfg,
        weights: { aa: number; ih: number; ou: number; ee: number; oh: number },
        amplitude: number,
        t: number,
        state: string
      ) => {
        const W = width, H = height;
        ctx.clearRect(0, 0, W, H);

        // ── Idle motion transform ───────────────────────────────────────────
        // All drawing happens inside this transform so idle animations apply
        // to the whole image — no separate element needed.
        ctx.save();

        const breatheAmp = 1.4;
        const breathe    = Math.sin(t * 0.42) * breatheAmp;          // slow breath
        const swayX      = Math.sin(t * 0.31 + 1.2) * 1.1
                         + Math.sin(t * 0.67) * 0.4;                 // Lissajous X
        const swayY      = Math.sin(t * 0.24) * 0.7;                 // gentle Y sway
        const bob        = state === "speaking"                       // speaking micro-bob
          ? Math.sin(t * 14.8) * (amplitude * 2.2)
          : 0;
        const breatheScale = 1 + breathe * 0.0003;

        ctx.translate(W / 2 + swayX, H / 2 + swayY + breathe + bob);
        ctx.scale(breatheScale, breatheScale);
        ctx.translate(-W / 2, -H / 2);

        // ── Closed mouth — just draw the photo ─────────────────────────────
        if (amplitude < 0.025 || (cfg.centerY === 0 && cfg.mouthW === 0)) {
          ctx.drawImage(img, 0, 0, W, H);
          ctx.restore();
          return;
        }

        // ── Open-mouth puppet warp ──────────────────────────────────────────
        const { centerY, mouthW } = cfg;
        const lipH   = mouthW * 0.115;   // resting lip-pair height

        // Jaw opening amount — blended from per-viseme contributions
        const wSum = weights.aa + weights.ih + weights.ou + weights.ee + weights.oh;
        const jawFactor = wSum > 0.01
          ? (weights.aa * 1.00
           + weights.ih * 0.58
           + weights.ou * 0.40
           + weights.ee * 0.65
           + weights.oh * 0.82) / wSum
          : 0.68;

        const maxJaw  = mouthW * 0.30;
        const jawDrop = Math.max(0, amplitude * maxJaw * (0.32 + jawFactor * 0.68));

        // Cavity width: smile (EE) widens, pucker (OU) narrows
        const widthMod = 1.0 + weights.ee * 0.20 - weights.ou * 0.28;
        const cavHW    = Math.max(2, mouthW * 0.52 * widthMod * 0.5);  // half-width

        // Split Y: base of upper lip
        const splitY = centerY - lipH * 0.25;

        // 1 ── Upper face (forehead → just above mouth split) ───────────────
        ctx.drawImage(img, 0, 0, W, splitY, 0, 0, W, splitY);

        // 2 ── Dark mouth cavity ─────────────────────────────────────────────
        if (jawDrop > 0.8) {
          const cavCX = W * 0.5;
          const cavCY = splitY + jawDrop * 0.44;
          const cavHH = Math.max(1, jawDrop * 0.60 + 1);

          ctx.save();
          ctx.beginPath();
          ctx.ellipse(cavCX, cavCY, cavHW, cavHH, 0, 0, Math.PI * 2);
          ctx.clip();

          const grad = ctx.createRadialGradient(
            cavCX, cavCY - jawDrop * 0.1, 0,
            cavCX, cavCY,                  Math.max(1, cavHW)
          );
          grad.addColorStop(0,    "rgba(10,3,3,1)");
          grad.addColorStop(0.5,  "rgba(20,7,7,0.98)");
          grad.addColorStop(0.82, "rgba(36,12,12,0.85)");
          grad.addColorStop(1,    "rgba(55,18,18,0.08)");
          ctx.fillStyle = grad;
          ctx.fillRect(0, splitY - 4, W, jawDrop * 2 + 10);
          ctx.restore();
        }

        // 3 ── Teeth ─────────────────────────────────────────────────────────
        const teethBlend  = weights.aa * 1.0 + weights.oh * 0.75 + weights.ee * 0.55;
        const teethAlpha  = Math.max(0, (teethBlend - 0.15) / 0.85);
        if (teethAlpha > 0.04 && jawDrop > lipH * 0.5) {
          const tw = cavHW * 2 * 0.70 * (1 - weights.ou * 0.55);
          const th = Math.min(jawDrop * 0.28, lipH * 0.92) * teethAlpha;
          const ty = splitY - th * 0.40;
          const tg = ctx.createLinearGradient(W / 2, ty, W / 2, ty + th);
          tg.addColorStop(0, `rgba(252,249,245,${(0.93 * teethAlpha).toFixed(2)})`);
          tg.addColorStop(1, `rgba(236,229,219,${(0.86 * teethAlpha).toFixed(2)})`);
          ctx.fillStyle = tg;
          ctx.beginPath();
          if (typeof ctx.roundRect === "function") {
            ctx.roundRect(W / 2 - tw / 2, ty, tw, th, 2);
          } else {
            ctx.rect(W / 2 - tw / 2, ty, tw, th);
          }
          ctx.fill();
          // Tooth dividers
          ctx.strokeStyle = `rgba(198,190,176,${(0.26 * teethAlpha).toFixed(2)})`;
          ctx.lineWidth = 0.8;
          for (let i = 1; i <= 3; i++) {
            const tx = W / 2 - tw / 2 + (tw / 4) * i;
            ctx.beginPath();
            ctx.moveTo(tx, ty + th * 0.08);
            ctx.lineTo(tx, ty + th * 0.90);
            ctx.stroke();
          }
        }

        // 4 ── Lower face (lower lip + chin + neck), shifted down ────────────
        //  Source: from slightly above lower-lip baseline
        //  Destination: same X/width, Y shifted down by jawDrop
        const lowerSrcY = Math.max(0, centerY - lipH * 0.60);
        const lowerH    = H - lowerSrcY;
        if (lowerH > 0) {
          ctx.drawImage(
            img,
            0, lowerSrcY, W, lowerH,              // src
            0, lowerSrcY + jawDrop, W, lowerH     // dst (shifted down)
          );
        }

        ctx.restore();
      },
      [width, height]
    );

    // ── RAF loop ──────────────────────────────────────────────────────────
    const startLoop = useCallback(() => {
      const tick = (now: number) => {
        rafRef.current = requestAnimationFrame(tick);
        const delta = Math.min((now - lastTRef.current) / 1000, 0.05);
        lastTRef.current = now;
        timeRef.current += delta;

        const canvas = canvasRef.current;
        const img    = imgRef.current;
        if (!canvas || !img) return;

        const ctx = canvas.getContext("2d");
        if (!ctx) return;

        drawFrame(
          ctx,
          img,
          cfgRef.current,
          wRef.current,
          ampRef.current,
          timeRef.current,
          stateRef.current
        );
      };
      rafRef.current = requestAnimationFrame(tick);
    }, [drawFrame]);

    // ── Load photo + detect mouth, then start loop ─────────────────────────
    useEffect(() => {
      const img = new Image();
      img.crossOrigin = "anonymous";
      img.onload = async () => {
        imgRef.current = img;
        const cfg = await detectMouthFromImage(img, width, height);
        cfgRef.current = cfg;
        setReady(true);
        startLoop();
      };
      img.onerror = () => {
        // Photo failed to load — still start loop (draws blank canvas)
        startLoop();
      };
      img.src = photoUrl;

      return () => {
        if (rafRef.current) cancelAnimationFrame(rafRef.current);
      };
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [photoUrl]);

    return (
      <canvas
        ref={canvasRef}
        width={width}
        height={height}
        className={className}
        style={{
          display:    "block",
          width:      "100%",
          height:     "100%",
          objectFit:  "cover",
          opacity:    ready ? 1 : 0,
          transition: "opacity 0.35s ease",
          ...style,
        }}
      />
    );
  }
);

export default PhotoLipSyncAvatar;
