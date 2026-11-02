import * as THREE from "three";

/**
 * Minimal render-loop host shared by all scenes:
 *  - capped devicePixelRatio, ACES tone mapping, sRGB output
 *  - pauses when the canvas is off-screen or the tab is hidden (battery + CPU friendly)
 *  - full GPU resource disposal on unmount
 */
export interface Stage {
  renderer: THREE.WebGLRenderer;
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  clock: THREE.Clock;
  onFrame: (fn: (dt: number, t: number) => void) => void;
  onResize: (fn: (w: number, h: number) => void) => void;
  renderOnce: () => void;
  dispose: () => void;
}

export function webglAvailable(): boolean {
  try {
    const c = document.createElement("canvas");
    return Boolean(c.getContext("webgl2") || c.getContext("webgl"));
  } catch {
    return false;
  }
}

export function createStage(canvas: HTMLCanvasElement, opts: { fov?: number; maxDpr?: number; lowPower?: boolean } = {}): Stage {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: !opts.lowPower, alpha: true, powerPreference: opts.lowPower ? "low-power" : "high-performance" });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, opts.maxDpr ?? 1.75));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  renderer.setClearColor(0x000000, 0);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(opts.fov ?? 35, 1, 0.1, 300);
  const clock = new THREE.Clock();
  const frameFns: ((dt: number, t: number) => void)[] = [];
  const resizeFns: ((w: number, h: number) => void)[] = [];
  let raf = 0;
  let visible = true;
  let running = false;

  const resize = () => {
    const w = canvas.clientWidth || canvas.parentElement?.clientWidth || 1;
    const h = canvas.clientHeight || canvas.parentElement?.clientHeight || 1;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    resizeFns.forEach((f) => f(w, h));
  };
  const loop = () => {
    raf = requestAnimationFrame(loop);
    const dt = Math.min(clock.getDelta(), 0.05);
    const t = clock.elapsedTime;
    frameFns.forEach((f) => f(dt, t));
    renderer.render(scene, camera);
  };
  const start = () => {
    if (running || !visible || document.hidden) return;
    running = true;
    clock.getDelta();
    raf = requestAnimationFrame(loop);
  };
  const stop = () => {
    running = false;
    cancelAnimationFrame(raf);
  };

  const ro = new ResizeObserver(resize);
  ro.observe(canvas);
  const io = new IntersectionObserver(([e]) => {
    visible = e.isIntersecting;
    if (visible) start(); else stop();
  }, { rootMargin: "100px" });
  io.observe(canvas);
  const onVis = () => (document.hidden ? stop() : start());
  document.addEventListener("visibilitychange", onVis);
  resize();
  start();

  return {
    renderer, scene, camera, clock,
    onFrame: (fn) => frameFns.push(fn),
    onResize: (fn) => { resizeFns.push(fn); resize(); },
    renderOnce: () => renderer.render(scene, camera),
    dispose: () => {
      stop();
      ro.disconnect();
      io.disconnect();
      document.removeEventListener("visibilitychange", onVis);
      scene.traverse((o) => {
        const m = o as THREE.Mesh;
        m.geometry?.dispose?.();
        const mats = Array.isArray(m.material) ? m.material : m.material ? [m.material] : [];
        mats.forEach((mat) => {
          Object.values(mat).forEach((v) => (v as THREE.Texture)?.isTexture && (v as THREE.Texture).dispose());
          mat.dispose();
        });
      });
      renderer.dispose();
    },
  };
}

export const easeOutCubic = (x: number) => 1 - Math.pow(1 - Math.min(1, Math.max(0, x)), 3);
export const easeInOutCubic = (x: number) => { const v = Math.min(1, Math.max(0, x)); return v < 0.5 ? 4 * v * v * v : 1 - Math.pow(-2 * v + 2, 3) / 2; };
export const clamp01 = (x: number) => Math.min(1, Math.max(0, x));
export const smooth = (a: number, b: number, x: number) => { const t = clamp01((x - a) / (b - a)); return t * t * (3 - 2 * t); };

/**
 * Procedural studio environment (soft-boxes in a dark room) prefiltered with PMREM,
 * so metals (shield cans, gold pins, gears) get believable reflections without HDR files.
 */
export function addStudioEnvironment(renderer: THREE.WebGLRenderer, scene: THREE.Scene) {
  const env = new THREE.Scene();
  env.background = new THREE.Color(0x0b0f18);
  const box = new THREE.BoxGeometry(1, 1, 1);
  const panel = (color: number, intensity: number, pos: [number, number, number], scale: [number, number, number]) => {
    const m = new THREE.Mesh(box, new THREE.MeshBasicMaterial({ color: new THREE.Color(color).multiplyScalar(intensity) }));
    m.position.set(...pos);
    m.scale.set(...scale);
    env.add(m);
  };
  panel(0xffffff, 4.5, [0, 9, 0], [14, 0.2, 14]);      // overhead soft-box
  panel(0xffb066, 2.4, [9, 3, 4], [0.2, 6, 10]);       // warm side
  panel(0x7fb2ff, 1.6, [-9, 3, -4], [0.2, 6, 10]);     // cool rim
  panel(0xff7a00, 1.2, [0, 1, -10], [16, 3, 0.2]);     // brand bounce
  panel(0x202838, 1, [0, -6, 0], [30, 0.2, 30]);       // floor
  const pmrem = new THREE.PMREMGenerator(renderer);
  const rt = pmrem.fromScene(env, 0.03);
  scene.environment = rt.texture;
  pmrem.dispose();
  box.dispose();
  return rt;
}

/** Standard warm key + cool rim lighting used across scenes. */
export function addStudioLights(scene: THREE.Scene, intensity = 1, renderer?: THREE.WebGLRenderer) {
  if (renderer) addStudioEnvironment(renderer, scene);
  const hemi = new THREE.HemisphereLight(0xe6eeff, 0x2a1a0a, 1.4 * intensity);
  const key = new THREE.DirectionalLight(0xffe0bd, 3.2 * intensity);
  key.position.set(6, 10, 6);
  const rim = new THREE.DirectionalLight(0x7fb2ff, 1.8 * intensity);
  rim.position.set(-8, 5, -6);
  const fill = new THREE.PointLight(0xff8a1f, 40 * intensity, 30, 2);
  fill.position.set(-2, 3, 4);
  scene.add(hemi, key, rim, fill);
  return { hemi, key, rim, fill };
}

export function themeIsLight() {
  return typeof document !== "undefined" && document.documentElement.dataset.theme === "light";
}
