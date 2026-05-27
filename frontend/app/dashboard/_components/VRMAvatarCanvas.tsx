/**
 * VRMAvatarCanvas
 * ────────────────
 * Renders a VRM avatar using Three.js with:
 *  • Real-time viseme / expression blending via imperative handle
 *  • Idle animations: random blink, gentle breathing, head sway
 *  • Responsive camera framed on head + shoulders
 *  • Calls onFallback() when VRM file cannot be loaded
 *
 * NOTE: place your VRM file at  /public/avatar.vrm
 *       (any VRoid Studio / VRoid Hub export works — both VRM 0.x and 1.0)
 *       or pass a custom `vrmUrl` prop.
 *
 * Usage:
 *   const avatarRef = useRef<VRMAvatarHandle>(null);
 *   <VRMAvatarCanvas ref={avatarRef} vrmUrl="/avatar.vrm" width={380} height={230} />
 *   // set a viseme weight:
 *   avatarRef.current?.setViseme("aa", 0.7);
 *   // set a facial expression:
 *   avatarRef.current?.setExpression("happy", 0.4);
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
import * as THREE from "three";
import type { VRM, VRMExpressionManager } from "@pixiv/three-vrm";

// ── Types ────────────────────────────────────────────────────────────────────

export interface VRMAvatarHandle {
  /** Set a viseme blend weight (aa / ih / ou / ee / oh) — 0 to 1 */
  setViseme: (name: string, weight: number) => void;
  /** Set an expression blend weight (happy / angry / sad / relaxed / surprised / blink) */
  setExpression: (name: string, weight: number) => void;
  /** Directly access the loaded VRM (may be null while loading) */
  vrm: VRM | null;
}

interface Props {
  vrmUrl?: string;
  width: number;
  height: number;
  // avatarState can drive future expression changes (happy/sad/etc.)
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  avatarState?: "idle" | "thinking" | "listening" | "speaking";
  onLoaded?: () => void;
  onFallback?: () => void;
  className?: string;
  style?: React.CSSProperties;
}

// ── Alias map — VRM 1.0 names (keys) → also try VRM 0.x names (values) ────────
//   three-vrm v2+ uses VRMExpressionManager for both versions but the preset
//   names differ.  We try the canonical 1.0 name first, then the 0.x name.
const EXPR_ALIASES: Record<string, string[]> = {
  aa:         ["aa", "A"],
  ih:         ["ih", "I"],
  ou:         ["ou", "U"],
  ee:         ["ee", "E"],
  oh:         ["oh", "O"],
  blink:      ["blink",     "Blink"],
  blinkLeft:  ["blinkLeft", "BlinkL"],
  blinkRight: ["blinkRight","BlinkR"],
  happy:      ["happy",  "Joy"],
  angry:      ["angry",  "Angry"],
  sad:        ["sad",    "Sorrow"],
  relaxed:    ["relaxed","Fun"],
  surprised:  ["surprised","Surprised"],
};

// ── Helpers ──────────────────────────────────────────────────────────────────

function resolveExprName(mgr: VRMExpressionManager, name: string): string | null {
  const aliases = EXPR_ALIASES[name] ?? [name];
  for (const alias of aliases) {
    // getExpression returns undefined if not found
    if (mgr.getExpression(alias) !== undefined) return alias;
  }
  return null;
}

// ── Component ─────────────────────────────────────────────────────────────────

export const VRMAvatarCanvas = forwardRef<VRMAvatarHandle, Props>(
  function VRMAvatarCanvas(
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    { vrmUrl = "/avatar.vrm", width, height, avatarState: _avatarState = "idle", onLoaded, onFallback, className, style },
    ref
  ) {
    const canvasRef   = useRef<HTMLCanvasElement>(null);
    const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
    const sceneRef    = useRef<THREE.Scene | null>(null);
    const cameraRef   = useRef<THREE.PerspectiveCamera | null>(null);
    const vrmRef      = useRef<VRM | null>(null);
    const clockRef    = useRef(new THREE.Clock());
    const rafRef      = useRef<number | null>(null);

    // Smooth expression targets: { name → target weight }
    const exprTargetRef  = useRef<Record<string, number>>({});
    const exprCurrentRef = useRef<Record<string, number>>({});

    // Idle state
    const idleRef = useRef({
      time:        0,
      blinkTimer:  0,
      nextBlink:   2 + Math.random() * 3.5,
      blinkDur:    0.12,
    });

    const [vrmLoaded, setVrmLoaded] = useState(false);

    // ── Imperative handle ─────────────────────────────────────────────────────
    useImperativeHandle(ref, () => ({
      setViseme(name: string, weight: number) {
        exprTargetRef.current[name] = Math.max(0, Math.min(1, weight));
      },
      setExpression(name: string, weight: number) {
        exprTargetRef.current[name] = Math.max(0, Math.min(1, weight));
      },
      get vrm() { return vrmRef.current; },
    }));

    // ── Smooth-set expression helper ──────────────────────────────────────────
    const applyExpr = useCallback((name: string, weight: number) => {
      const vrm = vrmRef.current;
      if (!vrm?.expressionManager) return;
      const resolved = resolveExprName(vrm.expressionManager, name);
      if (resolved) vrm.expressionManager.setValue(resolved, weight);
    }, []);

    // ── Scene setup ───────────────────────────────────────────────────────────
    const setupScene = useCallback((canvas: HTMLCanvasElement) => {
      const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false });
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
      renderer.setSize(width, height);
      renderer.outputColorSpace = THREE.SRGBColorSpace;
      renderer.toneMapping      = THREE.ACESFilmicToneMapping;
      renderer.toneMappingExposure = 1.15;
      renderer.shadowMap.enabled = true;
      renderer.shadowMap.type    = THREE.PCFSoftShadowMap;
      rendererRef.current = renderer;

      const scene = new THREE.Scene();
      scene.background = new THREE.Color(0x111827);
      // Shallow fog for depth feeling
      scene.fog = new THREE.FogExp2(0x111827, 0.45);
      sceneRef.current = scene;

      // ── 3-point lighting ────────────────────────────────────────────────
      // Key light (warm, front-left)
      const key = new THREE.DirectionalLight(0xfff5e0, 2.0);
      key.position.set(0.9, 1.6, 1.2);
      key.castShadow = true;
      key.shadow.mapSize.setScalar(512);
      scene.add(key);

      // Fill light (cool, front-right)
      const fill = new THREE.DirectionalLight(0xd0e8ff, 0.8);
      fill.position.set(-1.0, 0.9, 1.0);
      scene.add(fill);

      // Hair / rim light (back-top)
      const rim = new THREE.DirectionalLight(0xffffff, 0.5);
      rim.position.set(0, 2.0, -1.2);
      scene.add(rim);

      // Ambient
      scene.add(new THREE.AmbientLight(0x8090a8, 0.7));

      // Camera — telephoto portrait framing
      const camera = new THREE.PerspectiveCamera(26, width / height, 0.01, 20);
      // Default position; repositioned after VRM loads
      camera.position.set(0, 1.4, 0.62);
      camera.lookAt(0, 1.35, 0);
      cameraRef.current = camera;
    }, [width, height]);

    // ── VRM loading ───────────────────────────────────────────────────────────
    const loadVRM = useCallback(async (url: string) => {
      try {
        // Dynamic imports — avoids SSR crash, keeps initial bundle small
        const { GLTFLoader }      = await import("three/examples/jsm/loaders/GLTFLoader.js");
        const { VRMLoaderPlugin, VRMUtils } = await import("@pixiv/three-vrm");

        const loader = new GLTFLoader();
        loader.register((parser) => new VRMLoaderPlugin(parser));

        const gltf = await new Promise<{ userData: { vrm?: VRM } }>((resolve, reject) =>
          loader.load(url, resolve as (g: unknown) => void, undefined, reject)
        );

        const vrm = gltf.userData.vrm;
        if (!vrm) throw new Error("No VRM data found in GLTF");

        // Clean redundant joints (reduces draw calls)
        VRMUtils.removeUnnecessaryJoints(vrm.scene);

        sceneRef.current?.add(vrm.scene);
        vrmRef.current = vrm;

        // ── Frame camera at the head bone ────────────────────────────────
        vrm.scene.updateWorldMatrix(true, true);
        const headBone = vrm.humanoid?.getNormalizedBoneNode("head");
        if (headBone && cameraRef.current) {
          const hp = new THREE.Vector3();
          headBone.getWorldPosition(hp);
          cameraRef.current.position.set(0, hp.y + 0.10, 0.58);
          cameraRef.current.lookAt(0, hp.y - 0.05, 0);
        }

        setVrmLoaded(true);
        onLoaded?.();
        return true;
      } catch (err) {
        console.warn("[VRMAvatarCanvas] VRM load failed:", err);
        onFallback?.();
        return false;
      }
    }, [onLoaded, onFallback]);

    // ── Render + animation loop ───────────────────────────────────────────────
    const startLoop = useCallback(() => {
      const animate = () => {
        rafRef.current = requestAnimationFrame(animate);
        const delta = clockRef.current.getDelta();
        const vrm   = vrmRef.current;
        if (!vrm) return;

        const idle  = idleRef.current;
        idle.time  += delta;

        // ── Random blink ─────────────────────────────────────────────────
        idle.blinkTimer += delta;
        if (idle.blinkTimer >= idle.nextBlink) {
          const t = idle.blinkTimer - idle.nextBlink;
          const blinkVal = t < idle.blinkDur
            ? Math.sin((t / idle.blinkDur) * Math.PI)
            : 0;
          applyExpr("blink",      blinkVal);
          applyExpr("blinkLeft",  blinkVal);
          applyExpr("blinkRight", blinkVal);
          if (t >= idle.blinkDur) {
            idle.blinkTimer = 0;
            idle.nextBlink  = 2.5 + Math.random() * 5.0;
          }
        }

        // ── Head sway (gentle Lissajous) ──────────────────────────────────
        const headBone = vrm.humanoid?.getNormalizedBoneNode("head");
        if (headBone) {
          headBone.rotation.x = Math.sin(idle.time * 0.31 + 1.2) * 0.016
                              + Math.sin(idle.time * 0.68)         * 0.006;
          headBone.rotation.y = Math.sin(idle.time * 0.23)         * 0.013;
          headBone.rotation.z = Math.sin(idle.time * 0.47 + 2.1)   * 0.005;
        }

        // ── Neck breathing nod ────────────────────────────────────────────
        const neckBone = vrm.humanoid?.getNormalizedBoneNode("neck");
        if (neckBone) {
          neckBone.rotation.x = Math.sin(idle.time * 0.40)         * 0.007;
        }

        // ── Chest / spine breathing ────────────────────────────────────────
        const chestBone = vrm.humanoid?.getNormalizedBoneNode("chest")
                       ?? vrm.humanoid?.getNormalizedBoneNode("spine");
        if (chestBone) {
          chestBone.rotation.x = Math.sin(idle.time * 0.38)        * 0.009;
        }

        // ── Smooth viseme / expression interpolation ───────────────────────
        for (const [name, target] of Object.entries(exprTargetRef.current)) {
          if (name === "blink" || name === "blinkLeft" || name === "blinkRight") continue;
          const curr   = exprCurrentRef.current[name] ?? 0;
          // Fast attack (0.35), slower release (0.18) → natural lip movement
          const alpha  = target > curr ? 0.38 : 0.20;
          const next   = curr + (target - curr) * alpha;
          exprCurrentRef.current[name] = next;
          applyExpr(name, next);
        }

        vrm.update(delta);
        rendererRef.current?.render(sceneRef.current!, cameraRef.current!);
      };

      animate();
    }, [applyExpr]);

    // ── Lifecycle ─────────────────────────────────────────────────────────────
    useEffect(() => {
      const canvas = canvasRef.current;
      if (!canvas) return;

      setupScene(canvas);
      loadVRM(vrmUrl);
      startLoop();

      return () => {
        if (rafRef.current) cancelAnimationFrame(rafRef.current);
        try { rendererRef.current?.dispose(); } catch { /* ignore */ }
        rendererRef.current = null;
        sceneRef.current    = null;
        vrmRef.current      = null;
      };
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    return (
      <canvas
        ref={canvasRef}
        width={width}
        height={height}
        className={className}
        style={{
          display:     "block",
          width:       "100%",
          height:      "100%",
          objectFit:   "cover",
          opacity:     vrmLoaded ? 1 : 0,
          transition:  "opacity 0.6s ease",
          ...style,
        }}
      />
    );
  }
);

export default VRMAvatarCanvas;
