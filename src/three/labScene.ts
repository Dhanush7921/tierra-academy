import * as THREE from "three";
import { addStudioLights, createStage, themeIsLight } from "./core";
import { capacitor, esp32Board, glow, mat, qfpChip, robotArm, textTexture } from "./parts";

/**
 * Student dashboard — an isometric miniature engineering lab. Each object is a
 * navigation hotspot; screen-space anchors are reported every frame so the React
 * layer can position accessible HTML labels/links over the canvas.
 */
export const LAB_HOTSPOTS = [
  { key: "courses", label: "My Courses", href: "/dashboard/courses" },
  { key: "embedded", label: "Embedded Systems", href: "/courses?category=embedded" },
  { key: "robotics", label: "Robotics", href: "/courses?category=robotics" },
  { key: "live", label: "Live Classes", href: "/dashboard/live" },
  { key: "bench", label: "Practical Resources", href: "/dashboard/resources" },
  { key: "certificates", label: "Certificates", href: "/dashboard/certificates" },
] as const;

export type HotspotKey = (typeof LAB_HOTSPOTS)[number]["key"];

export interface LabHandle {
  dispose: () => void;
  setScreens: (s: { courses: string[]; nextClass: string }) => void;
}

function screenTexture(lines: string[], accent = "#ff9a3c") {
  return textTexture(lines, { w: 512, h: 320, bg: "#08101e", color: accent, size: 34, align: "left" });
}

export function mountLab(
  canvas: HTMLCanvasElement,
  opts: { lowPower: boolean; reducedMotion: boolean; onAnchors: (a: Record<HotspotKey, { x: number; y: number; visible: boolean }>) => void; onSelect: (k: HotspotKey) => void; onHover?: (k: HotspotKey | null) => void },
): LabHandle {
  const stage = createStage(canvas, { fov: 28, maxDpr: opts.lowPower ? 1.25 : 1.6, lowPower: opts.lowPower });
  const { scene, camera, renderer } = stage;
  addStudioLights(scene, 1, renderer);

  const room = new THREE.Group();
  scene.add(room);
  const light = themeIsLight();
  const floor = new THREE.Mesh(new THREE.BoxGeometry(14, 0.4, 11), new THREE.MeshStandardMaterial({ color: light ? 0xe9e4da : 0x10172a, roughness: 0.9, metalness: 0.05, envMapIntensity: 0.25 }));
  floor.position.y = -0.2;
  const tiles = new THREE.GridHelper(14, 14, 0xff7a00, light ? 0xc9c0b0 : 0x2a3550);
  (tiles.material as THREE.Material).transparent = true;
  (tiles.material as THREE.Material).opacity = 0.35;
  tiles.position.y = 0.01;
  const wallMat = new THREE.MeshStandardMaterial({ color: light ? 0xf6f2ea : 0x141c2e, roughness: 0.9, envMapIntensity: light ? 0.6 : 1 });
  const back = new THREE.Mesh(new THREE.BoxGeometry(14, 6, 0.3), wallMat);
  back.position.set(0, 3, -5.5);
  const side = new THREE.Mesh(new THREE.BoxGeometry(0.3, 6, 11), wallMat);
  side.position.set(-7, 3, 0);
  const stripe = new THREE.Mesh(new THREE.BoxGeometry(14, 0.06, 0.02), mat.emissive(0xff7a00, 2));
  stripe.position.set(0, 4.6, -5.34);
  room.add(floor, tiles, back, side, stripe);

  const hot: Record<HotspotKey, THREE.Object3D> = {} as never;
  const anchors: Record<HotspotKey, THREE.Vector3> = {} as never;

  // desk + laptop → My Courses
  const desk = new THREE.Group();
  const top = new THREE.Mesh(new THREE.BoxGeometry(5.2, 0.18, 2.4), new THREE.MeshStandardMaterial({ color: 0xd8dde6, roughness: 0.5 }));
  top.position.y = 1.6;
  desk.add(top);
  [[-2.4, -1], [2.4, -1], [-2.4, 1], [2.4, 1]].forEach(([x, z]) => { const l = new THREE.Mesh(new THREE.BoxGeometry(0.12, 1.6, 0.12), mat.darkSteel()); l.position.set(x, 0.8, z); desk.add(l); });
  desk.position.set(-1.2, 0, -3.4);
  room.add(desk);
  const laptop = new THREE.Group();
  const lbase = new THREE.Mesh(new THREE.BoxGeometry(1.9, 0.08, 1.25), mat.darkSteel());
  const lid = new THREE.Group();
  const lidShell = new THREE.Mesh(new THREE.BoxGeometry(1.9, 1.25, 0.06), mat.darkSteel());
  lidShell.position.y = 0.62;
  const laptopScreen = new THREE.Mesh(new THREE.PlaneGeometry(1.75, 1.08), new THREE.MeshBasicMaterial({ map: screenTexture(["MY COURSES", "▸ Loading…"]) }));
  laptopScreen.position.set(0, 0.62, 0.035);
  lid.add(lidShell, laptopScreen);
  lid.position.set(0, 0.04, -0.6);
  lid.rotation.x = -0.25;
  laptop.add(lbase, lid);
  laptop.position.set(-2.2, 1.73, -3.2);
  room.add(laptop);
  hot.courses = laptop; anchors.courses = new THREE.Vector3(-2.2, 3.3, -3.4);

  // ESP32 board on the desk → Embedded
  const esp = esp32Board();
  esp.traceMaterial.uniforms.uProgress.value = 2;
  esp.traceMaterial.uniforms.uFlow.value = 1;
  esp.root.scale.setScalar(0.32);
  esp.root.position.set(0.3, 1.82, -3.0);
  esp.root.rotation.y = -0.35;
  room.add(esp.root);
  hot.embedded = esp.root; anchors.embedded = new THREE.Vector3(0.6, 2.75, -2.6);

  // robot arm → Robotics
  const arm = robotArm(0.85, 0xff7a00);
  arm.root.position.set(4.2, 0, -2.4);
  room.add(arm.root);
  hot.robotics = arm.root; anchors.robotics = new THREE.Vector3(4.2, 4.6, -2.4);

  // wall display → Live classes
  const tv = new THREE.Group();
  const frame = new THREE.Mesh(new THREE.BoxGeometry(3.4, 2.0, 0.12), mat.blackPlastic());
  const tvScreen = new THREE.Mesh(new THREE.PlaneGeometry(3.2, 1.8), new THREE.MeshBasicMaterial({ map: screenTexture(["NEXT LIVE CLASS", "—"], "#38d2ff") }));
  tvScreen.position.z = 0.065;
  const liveDot = new THREE.Mesh(new THREE.CircleGeometry(0.08, 16), mat.emissive(0xff3b30, 3));
  liveDot.position.set(1.45, 0.75, 0.07);
  tv.add(frame, tvScreen, liveDot);
  tv.position.set(1.8, 3.6, -5.3);
  room.add(tv);
  hot.live = tv; anchors.live = new THREE.Vector3(1.8, 4.8, -5.3);

  // electronics bench → Practical resources
  const bench = new THREE.Group();
  const btop = new THREE.Mesh(new THREE.BoxGeometry(3.2, 0.14, 1.8), new THREE.MeshStandardMaterial({ color: 0x2b3b5a, roughness: 0.6 }));
  btop.position.y = 1.2;
  bench.add(btop);
  [[-1.4, -0.7], [1.4, -0.7], [-1.4, 0.7], [1.4, 0.7]].forEach(([x, z]) => { const l = new THREE.Mesh(new THREE.BoxGeometry(0.1, 1.2, 0.1), mat.darkSteel()); l.position.set(x, 0.6, z); bench.add(l); });
  const scope = new THREE.Group();
  const sbody = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.75, 0.7), new THREE.MeshStandardMaterial({ color: 0xe6e9ef, roughness: 0.5 }));
  const c = document.createElement("canvas"); c.width = 256; c.height = 160;
  const stex = new THREE.CanvasTexture(c); stex.colorSpace = THREE.SRGBColorSpace;
  const sscreen = new THREE.Mesh(new THREE.PlaneGeometry(0.7, 0.45), new THREE.MeshBasicMaterial({ map: stex }));
  sscreen.position.set(-0.15, 0.05, 0.356);
  scope.add(sbody, sscreen);
  scope.position.set(-0.6, 1.65, -0.2);
  const bb = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.08, 0.6), mat.white());
  bb.position.set(0.8, 1.31, 0.3);
  const chip = qfpChip(0.3, 6);
  chip.position.set(0.7, 1.35, 0.3);
  const cap = capacitor(0x1d4fa0, 0.25, 0.08);
  cap.position.set(1.05, 1.35, 0.4);
  bench.add(scope, bb, chip, cap);
  bench.position.set(-4.3, 0, 1.2);
  bench.rotation.y = Math.PI / 2.4;
  room.add(bench);
  hot.bench = bench; anchors.bench = new THREE.Vector3(-4.3, 3.0, 1.2);

  // certificate frame → Certificates
  const cert = new THREE.Group();
  const cframe = new THREE.Mesh(new THREE.BoxGeometry(1.6, 1.15, 0.08), mat.gold());
  const paper = new THREE.Mesh(new THREE.PlaneGeometry(1.4, 0.95), new THREE.MeshBasicMaterial({ map: textTexture(["CERTIFICATE", "of completion", "★"], { w: 384, h: 260, bg: "#fbf6ea", color: "#8a5a12", size: 44 }) }));
  paper.position.z = 0.045;
  cert.add(cframe, paper);
  cert.position.set(-6.8, 3.4, -1.2);
  cert.rotation.y = Math.PI / 2;
  room.add(cert);
  hot.certificates = cert; anchors.certificates = new THREE.Vector3(-6.8, 4.4, -1.2);

  // hover halo
  const halo = glow(3, "255,140,40", 0);
  scene.add(halo);

  // camera: isometric-ish three-quarter view, responsive distance
  let dist = 24;
  stage.onResize((w, h) => { dist = w / h < 0.9 ? 34 : w / h < 1.3 ? 27 : 21.5; });
  const centre = new THREE.Vector3(-0.5, 1.6, -1.2);

  // pointer → hover / select
  const ray = new THREE.Raycaster();
  const ndc = new THREE.Vector2(9, 9);
  let hovered: HotspotKey | null = null;
  const keys = Object.keys(hot) as HotspotKey[];
  const pickAt = (e: PointerEvent) => {
    const r = canvas.getBoundingClientRect();
    ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    ray.setFromCamera(ndc, camera);
    for (const k of keys) if (ray.intersectObject(hot[k], true).length) return k;
    return null;
  };
  const onMove = (e: PointerEvent) => {
    const k = pickAt(e);
    if (k !== hovered) { hovered = k; canvas.style.cursor = k ? "pointer" : ""; opts.onHover?.(k); }
  };
  const onClick = (e: MouseEvent) => { const k = pickAt(e as PointerEvent); if (k) opts.onSelect(k); };
  canvas.addEventListener("pointermove", onMove);
  canvas.addEventListener("click", onClick);

  const proj = new THREE.Vector3();
  let yaw = 0.62;
  const out = {} as Record<HotspotKey, { x: number; y: number; visible: boolean }>;
  let lastScope = 0;
  stage.onFrame((_dt, t) => {
    if (!opts.reducedMotion) yaw = 0.62 + Math.sin(t * 0.15) * 0.08;
    camera.position.set(centre.x + Math.sin(yaw) * dist, centre.y + dist * 0.62, centre.z + Math.cos(yaw) * dist);
    camera.lookAt(centre);
    if (!opts.reducedMotion) {
      arm.yaw.rotation.y = Math.sin(t * 0.7) * 0.8;
      arm.shoulder.rotation.x = -0.3 + Math.sin(t * 0.9) * 0.25;
      arm.elbow.rotation.x = 0.8 + Math.sin(t * 0.9 + 1) * 0.3;
      esp.traceMaterial.uniforms.uTime.value = t;
      (liveDot.material as THREE.MeshStandardMaterial).emissiveIntensity = 1.5 + Math.sin(t * 4) * 1.5;
    }
    if (t - lastScope > 0.12) {
      lastScope = t;
      const x = c.getContext("2d")!;
      x.fillStyle = "#04140c"; x.fillRect(0, 0, 256, 160);
      x.strokeStyle = "#3dff9a"; x.lineWidth = 3; x.beginPath();
      for (let i = 0; i <= 256; i += 4) { const y = 80 + Math.sin(i * 0.06 + t * 4) * 40 * Math.sin(t * 0.7 + 1); i ? x.lineTo(i, y) : x.moveTo(i, y); }
      x.stroke(); stex.needsUpdate = true;
    }
    if (hovered) {
      halo.position.copy(anchors[hovered]).add(new THREE.Vector3(0, -1, 0));
      (halo.material as THREE.SpriteMaterial).opacity = 0.5;
    } else (halo.material as THREE.SpriteMaterial).opacity = 0;
    const w = canvas.clientWidth, h = canvas.clientHeight;
    for (const k of keys) {
      proj.copy(anchors[k]).project(camera);
      out[k] = { x: (proj.x * 0.5 + 0.5) * w, y: (-proj.y * 0.5 + 0.5) * h, visible: proj.z < 1 && Math.abs(proj.x) < 1.05 && Math.abs(proj.y) < 1.05 };
    }
    opts.onAnchors(out);
  });

  return {
    setScreens: ({ courses, nextClass }) => {
      (laptopScreen.material as THREE.MeshBasicMaterial).map?.dispose();
      (laptopScreen.material as THREE.MeshBasicMaterial).map = screenTexture(["MY COURSES", ...courses.slice(0, 3).map((c) => `▸ ${c.slice(0, 22)}`)]);
      (tvScreen.material as THREE.MeshBasicMaterial).map?.dispose();
      (tvScreen.material as THREE.MeshBasicMaterial).map = screenTexture(["NEXT LIVE CLASS", nextClass.slice(0, 24)], "#38d2ff");
      (laptopScreen.material as THREE.MeshBasicMaterial).needsUpdate = true;
      (tvScreen.material as THREE.MeshBasicMaterial).needsUpdate = true;
    },
    dispose: () => {
      canvas.removeEventListener("pointermove", onMove);
      canvas.removeEventListener("click", onClick);
      stage.dispose();
    },
  };
}
