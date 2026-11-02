import * as THREE from "three";
import { addStudioLights, createStage, easeInOutCubic, smooth } from "./core";
import {
  capacitor, cadGear, flowParticles, glow, labelSprite, mat, motor, qfpChip, resistor, robotArm,
  textTexture, traceMaterial, traceRibbons,
} from "./parts";

/**
 * SCENES 2–8 — "Enter the Engineering World".
 * A circular engineering campus with six discipline stations. Scroll progress (0..1)
 * flies the camera from an overview into each station in turn. Stations are clickable.
 */
export const STATIONS = [
  { slug: "electronics", name: "Electronics", accent: 0xffc233 },
  { slug: "robotics", name: "Robotics", accent: 0xff7a1a },
  { slug: "iot", name: "IoT", accent: 0x38d2ff },
  { slug: "embedded", name: "Embedded", accent: 0x9be15d },
  { slug: "electrical", name: "Electrical", accent: 0xffd84d },
  { slug: "mechanical", name: "Mechanical", accent: 0xc9a7ff },
] as const;

export interface WorldHandle {
  setProgress: (p: number) => void;
  focus: (index: number) => void;
  dispose: () => void;
}

const R = 10;

type Updater = (t: number) => void;

function pedestal(accent: number) {
  const g = new THREE.Group();
  const base = new THREE.Mesh(new THREE.CylinderGeometry(3.3, 3.6, 0.5, 64), new THREE.MeshStandardMaterial({ color: 0x0f1729, roughness: 0.6, metalness: 0.5 }));
  base.position.y = 0.25;
  const top = new THREE.Mesh(new THREE.CylinderGeometry(3.15, 3.15, 0.06, 64), new THREE.MeshStandardMaterial({ color: 0x131d33, roughness: 0.7, metalness: 0.4, envMapIntensity: 0.4 }));
  top.position.y = 0.53;
  const ring = new THREE.Mesh(new THREE.TorusGeometry(3.3, 0.045, 8, 96), new THREE.MeshBasicMaterial({ color: accent }));
  ring.rotation.x = Math.PI / 2;
  ring.position.y = 0.52;
  g.add(base, top, ring);
  g.userData.ring = ring;
  return g;
}

// ── station builders ────────────────────────────────────────────────────────
function electronicsStation(): [THREE.Group, Updater] {
  const g = new THREE.Group();
  const board = new THREE.Mesh(new THREE.BoxGeometry(4.2, 0.12, 3), mat.pcbGreen());
  board.position.y = 0.62;
  g.add(board);
  const tm = traceMaterial();
  tm.uniforms.uProgress.value = 2;
  tm.uniforms.uFlow.value = 1;
  const paths: [number, number][][] = [];
  for (let i = 0; i < 9; i++) paths.push([[-1.9, -1.2 + i * 0.3], [-0.4 + (i % 3) * 0.2, -1.2 + i * 0.3], [0.2, -0.6 + i * 0.15], [1.9, -0.6 + i * 0.15]]);
  g.add(new THREE.Mesh(traceRibbons(paths, 0.06, 0.69, paths.map((_, i) => i * 0.05)), tm));
  const chip = qfpChip(0.9, 10, "AMP-01");
  chip.position.set(0.35, 0.68, 0.1);
  g.add(chip);
  for (let i = 0; i < 4; i++) {
    const r = resistor([["#8b4513", "#000", "#f00", "#d4af37"], ["#f00", "#f00", "#8b4513", "#d4af37"], ["#ff0", "#8a2be2", "#f00", "#d4af37"], ["#00f", "#808080", "#8b4513", "#d4af37"]][i]);
    r.position.set(-1.3 + i * 0.5, 0.82, -0.9);
    r.scale.setScalar(1.6);
    g.add(r);
  }
  [[1.4, 0.9], [1.0, 0.95], [-1.4, 0.8]].forEach(([x, z], i) => {
    const c = capacitor(i === 2 ? 0x111111 : 0x1d4fa0, 0.55, 0.2);
    c.position.set(x, 0.68, z);
    g.add(c);
  });
  return [g, (t) => { tm.uniforms.uTime.value = t; }];
}

function roboticsStation(): [THREE.Group, Updater] {
  const g = new THREE.Group();
  const arm = robotArm(0.95, 0xff7a1a);
  arm.root.position.y = 0.55;
  g.add(arm.root);
  const tray = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.12, 1.2), mat.darkSteel());
  tray.position.set(1.8, 0.62, 0.6);
  const cube = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.35, 0.35), mat.orange());
  cube.position.set(1.8, 0.86, 0.6);
  g.add(tray, cube);
  return [g, (t) => {
    arm.yaw.rotation.y = Math.sin(t * 0.6) * 0.9;
    arm.shoulder.rotation.x = -0.35 + Math.sin(t * 0.8) * 0.3;
    arm.elbow.rotation.x = 0.9 + Math.sin(t * 0.8 + 1) * 0.35;
    arm.wrist.rotation.x = 0.4 + Math.sin(t * 1.3) * 0.3;
    const grip = 0.18 + (Math.sin(t * 1.6) * 0.5 + 0.5) * 0.08;
    arm.fingerL.position.x = -grip; arm.fingerR.position.x = grip;
  }];
}

function iotStation(): [THREE.Group, Updater] {
  const g = new THREE.Group();
  const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.55, 0.9, 32), new THREE.MeshStandardMaterial({ color: 0xe8eef6, roughness: 0.3, metalness: 0.2 }));
  hub.position.y = 1.0;
  const ant = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.9, 8), mat.steel());
  ant.position.y = 1.9;
  const tipGlow = glow(0.8, "56,210,255", 0.9); tipGlow.position.y = 2.35;
  g.add(hub, ant, tipGlow);
  const waves: THREE.Mesh[] = [];
  for (let i = 0; i < 3; i++) {
    const w = new THREE.Mesh(new THREE.TorusGeometry(1, 0.025, 6, 64), new THREE.MeshBasicMaterial({ color: 0x38d2ff, transparent: true }));
    w.rotation.x = Math.PI / 2; w.position.y = 1.2;
    waves.push(w); g.add(w);
  }
  const nodes: THREE.Vector3[] = [];
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + 0.4;
    const p = new THREE.Vector3(Math.cos(a) * 2.3, 0.55, Math.sin(a) * 2.3);
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.7, 8), mat.darkSteel());
    post.position.copy(p).setY(0.9);
    const sensor = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.25, 0.35), new THREE.MeshStandardMaterial({ color: 0x1f5fbf, roughness: 0.4 }));
    sensor.position.copy(p).setY(1.35);
    const led = new THREE.Mesh(new THREE.SphereGeometry(0.06, 12, 8), mat.emissive(0x38d2ff, 3));
    led.position.copy(p).setY(1.52);
    g.add(post, sensor, led);
    nodes.push(p.clone().setY(1.4));
  }
  // live dashboard panel (canvas texture updated a few times per second)
  const c = document.createElement("canvas"); c.width = 512; c.height = 320;
  const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace;
  const panel = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true }));
  panel.scale.set(2.6, 1.62, 1);
  panel.position.set(0, 3.3, 0.2);
  g.add(panel);
  const vals = Array.from({ length: 12 }, () => Math.random());
  const draw = (t: number) => {
    const x = c.getContext("2d")!;
    x.clearRect(0, 0, 512, 320);
    x.fillStyle = "rgba(6,14,28,0.85)"; x.beginPath(); x.roundRect(0, 0, 512, 320, 28); x.fill();
    x.strokeStyle = "rgba(56,210,255,0.6)"; x.lineWidth = 3; x.stroke();
    x.fillStyle = "#9fe7ff"; x.font = '600 30px "IBM Plex Mono", monospace'; x.fillText("SENSOR DASHBOARD", 28, 52);
    x.fillStyle = "#ffffff"; x.font = '700 54px "IBM Plex Mono", monospace'; x.fillText(`${(24 + Math.sin(t) * 1.5).toFixed(1)}°C`, 28, 120);
    vals.shift(); vals.push(0.3 + 0.6 * Math.abs(Math.sin(t * 1.7 + Math.random())));
    vals.forEach((v, i) => { x.fillStyle = i === vals.length - 1 ? "#ffb300" : "#38d2ff"; x.fillRect(28 + i * 38, 290 - v * 140, 26, v * 140); });
    tex.needsUpdate = true;
  };
  const curves = nodes.map((n) => new THREE.QuadraticBezierCurve3(n, n.clone().lerp(panel.position, 0.5).add(new THREE.Vector3(0, 1.4, 0)), panel.position.clone()));
  const packets = curves.map((cv) => flowParticles(cv, 4, 0x8ae8ff, 0.22));
  packets.forEach((p) => g.add(p));
  let lastDraw = -1;
  return [g, (t) => {
    waves.forEach((w, i) => {
      const k = ((t * 0.5 + i / 3) % 1);
      w.scale.setScalar(0.6 + k * 2.6);
      (w.material as THREE.MeshBasicMaterial).opacity = 0.7 * (1 - k);
    });
    packets.forEach((p, i) => p.userData.update(t + i * 0.13, 0.35));
    if (t - lastDraw > 0.4) { lastDraw = t; draw(t); }
  }];
}

function embeddedStation(): [THREE.Group, Updater] {
  const g = new THREE.Group();
  const board = new THREE.Mesh(new THREE.BoxGeometry(4.6, 0.1, 3.4), mat.pcb());
  board.position.y = 0.6;
  g.add(board);
  const mcu = qfpChip(1.5, 14, "MCU");
  mcu.position.set(0, 0.65, 0);
  g.add(mcu);
  const tm = traceMaterial(); tm.uniforms.uProgress.value = 2; tm.uniforms.uFlow.value = 1;
  tm.uniforms.uLit.value = new THREE.Color(0x9be15d); tm.uniforms.uHot.value = new THREE.Color(0xe9ffd0); tm.uniforms.uDim.value = new THREE.Color(0x2e4a1c);
  const buses: [string, [number, number]][] = [["UART", [-1.8, -1.2]], ["I2C", [1.8, -1.2]], ["SPI", [-1.8, 1.2]], ["CAN", [1.8, 1.2]]];
  const paths: [number, number][][] = [];
  buses.forEach(([, [x, z]]) => {
    for (let k = -1; k <= 1; k++) paths.push([[Math.sign(x) * 0.85, k * 0.12 + z * 0.15], [x * 0.6, k * 0.12 + z * 0.15], [x * 0.6 + k * 0.1, z], [x, z + k * 0.1]]);
  });
  g.add(new THREE.Mesh(traceRibbons(paths, 0.05, 0.66, paths.map((_, i) => (i % 3) * 0.08)), tm));
  buses.forEach(([name, [x, z]]) => {
    const blk = new THREE.Mesh(new THREE.BoxGeometry(0.75, 0.22, 0.55), mat.blackPlastic());
    blk.position.set(x, 0.76, z);
    const lbl = new THREE.Mesh(new THREE.PlaneGeometry(0.7, 0.3), new THREE.MeshBasicMaterial({ map: textTexture([name], { w: 256, h: 110, color: "#9be15d", size: 70 }), transparent: true }));
    lbl.rotation.x = -Math.PI / 2; lbl.position.set(x, 0.875, z);
    g.add(blk, lbl);
  });
  const flow = new THREE.CatmullRomCurve3([new THREE.Vector3(-1.8, 1.0, -1.2), new THREE.Vector3(0, 1.3, 0), new THREE.Vector3(1.8, 1.0, 1.2), new THREE.Vector3(1.8, 1.0, -1.2), new THREE.Vector3(0, 1.3, 0), new THREE.Vector3(-1.8, 1.0, 1.2)], true);
  const pk = flowParticles(flow, 10, 0xb8ff7a, 0.2);
  g.add(pk);
  return [g, (t) => { tm.uniforms.uTime.value = t; pk.userData.update(t, 0.12); }];
}

function electricalStation(): [THREE.Group, Updater] {
  const g = new THREE.Group();
  const m = motor();
  m.position.set(-0.4, 1.7, -0.2);
  m.scale.setScalar(0.85);
  g.add(m);
  const fan = new THREE.Group();
  for (let i = 0; i < 4; i++) {
    const blade = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.9, 0.22), mat.amber());
    blade.position.y = 0.45; const holder = new THREE.Group(); holder.rotation.x = (i / 4) * Math.PI * 2; holder.add(blade); fan.add(holder);
  }
  fan.position.set(1.55, 1.7, -0.2);
  g.add(fan);
  const panel = new THREE.Mesh(new THREE.BoxGeometry(1.5, 2.2, 0.5), new THREE.MeshStandardMaterial({ color: 0xd8dde5, roughness: 0.5, metalness: 0.3 }));
  panel.position.set(-0.8, 1.65, 1.9);
  g.add(panel);
  const breakers = new THREE.InstancedMesh(new THREE.BoxGeometry(0.18, 0.5, 0.12), mat.blackPlastic(), 12);
  const mm = new THREE.Matrix4();
  for (let i = 0; i < 12; i++) { mm.makeTranslation(-1.3 + (i % 6) * 0.2, 2.15 - Math.floor(i / 6) * 0.75, 1.62); breakers.setMatrixAt(i, mm); }
  g.add(breakers);
  const warn = new THREE.Mesh(new THREE.PlaneGeometry(0.6, 0.3), new THREE.MeshBasicMaterial({ map: textTexture(["415V ⚡"], { w: 256, h: 128, bg: "#ffd84d", color: "#111", size: 64 }) }));
  warn.position.set(-0.8, 0.85, 1.64);
  warn.rotation.y = Math.PI;
  g.add(warn);
  const cable = new THREE.CatmullRomCurve3([new THREE.Vector3(-0.3, 1.6, 1.65), new THREE.Vector3(0.4, 0.7, 1.2), new THREE.Vector3(0.6, 0.65, 0.6), new THREE.Vector3(-0.2, 1.0, 0.3)]);
  g.add(new THREE.Mesh(new THREE.TubeGeometry(cable, 48, 0.07, 8), new THREE.MeshStandardMaterial({ color: 0x222831, roughness: 0.7 })));
  const current = flowParticles(cable, 8, 0xffe066, 0.25);
  g.add(current);
  return [g, (t) => {
    m.userData.shaft.rotation.x = t * 8;
    fan.rotation.x = t * 8;
    current.userData.update(t, 0.5);
  }];
}

function mechanicalStation(): [THREE.Group, Updater] {
  const g = new THREE.Group();
  const big = cadGear(28, 1.25, 0.35, 0xc9a7ff);
  const small = cadGear(14, 0.62, 0.35, 0xffb300);
  const tiny = cadGear(10, 0.45, 0.3, 0xe8eef6);
  big.position.set(-0.7, 1.9, 0.6);
  small.position.set(-0.7 + 1.25 + 0.62 + 0.12, 1.9, 0.6);
  tiny.position.set(-0.7 - 1.25 - 0.45 - 0.1, 1.9, 0.6);
  g.add(big, small, tiny);
  // exploded shaft assembly (bearing, spacer, gear, collar) sliding apart along its axis
  const stack = new THREE.Group();
  const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 3, 16), mat.steel());
  shaft.rotation.z = Math.PI / 2;
  stack.add(shaft);
  const pieces = [
    new THREE.Mesh(new THREE.TorusGeometry(0.28, 0.1, 12, 32), mat.steel()),
    new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.22, 0.2, 24), mat.amber()),
    cadGear(12, 0.42, 0.22, 0xff7a1a),
    new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 0.16, 6), mat.darkSteel()),
  ];
  pieces.forEach((p) => { p.rotation.y = Math.PI / 2; stack.add(p); });
  pieces[1].rotation.set(0, 0, Math.PI / 2);
  pieces[3].rotation.set(0, 0, Math.PI / 2);
  stack.position.set(0.9, 0.95, -1.7);
  g.add(stack);
  return [g, (t) => {
    big.rotation.z = t * 0.5;
    small.rotation.z = -t * 0.5 * 2 + 0.11;
    tiny.rotation.z = -t * 0.5 * 2.8;
    const e = (Math.sin(t * 0.8) * 0.5 + 0.5) * 0.45;
    pieces.forEach((p, i) => (p.position.x = (i - 1.5) * (0.3 + e)));
  }];
}

const BUILDERS = [electronicsStation, roboticsStation, iotStation, embeddedStation, electricalStation, mechanicalStation];

export function mountWorld(canvas: HTMLCanvasElement, opts: { lowPower: boolean; onSelect: (slug: string) => void; onHover?: (slug: string | null) => void }): WorldHandle {
  const stage = createStage(canvas, { fov: 40, maxDpr: opts.lowPower ? 1.25 : 1.6, lowPower: opts.lowPower });
  const { scene, camera, renderer } = stage;
  addStudioLights(scene, 0.9, renderer);
  scene.fog = new THREE.Fog(0x05080f, 30, 75);

  // campus platform with blueprint grid texture
  const gc = document.createElement("canvas"); gc.width = gc.height = 1024;
  const x = gc.getContext("2d")!;
  x.fillStyle = "#070c17"; x.fillRect(0, 0, 1024, 1024);
  x.strokeStyle = "rgba(255,160,60,0.10)"; x.lineWidth = 2;
  for (let i = 0; i <= 1024; i += 32) { x.beginPath(); x.moveTo(i, 0); x.lineTo(i, 1024); x.stroke(); x.beginPath(); x.moveTo(0, i); x.lineTo(1024, i); x.stroke(); }
  x.strokeStyle = "rgba(255,160,60,0.22)";
  for (let i = 0; i <= 1024; i += 128) { x.beginPath(); x.moveTo(i, 0); x.lineTo(i, 1024); x.stroke(); x.beginPath(); x.moveTo(0, i); x.lineTo(1024, i); x.stroke(); }
  const gt = new THREE.CanvasTexture(gc); gt.colorSpace = THREE.SRGBColorSpace; gt.anisotropy = 8;
  const floor = new THREE.Mesh(new THREE.CircleGeometry(R + 6, 96), new THREE.MeshStandardMaterial({ map: gt, color: 0x6a7080, roughness: 0.95, metalness: 0.05, envMapIntensity: 0.15 }));
  floor.rotation.x = -Math.PI / 2;
  scene.add(floor);
  const road = new THREE.Mesh(new THREE.TorusGeometry(R, 0.06, 8, 160), new THREE.MeshBasicMaterial({ color: 0xff7a00 }));
  road.rotation.x = Math.PI / 2; road.position.y = 0.02;
  scene.add(road);
  const ringCurve = new THREE.EllipseCurve(0, 0, R, R, 0, Math.PI * 2, false, 0);
  const ring3 = new THREE.CatmullRomCurve3(ringCurve.getPoints(120).map((p) => new THREE.Vector3(p.x, 0.12, p.y)), true);
  const data = flowParticles(ring3, 36, 0xffb347, 0.3);
  scene.add(data);

  // centre core
  const core = new THREE.Group();
  const coreBase = new THREE.Mesh(new THREE.CylinderGeometry(2.2, 2.6, 0.4, 6), new THREE.MeshStandardMaterial({ color: 0x101a2e, metalness: 0.6, roughness: 0.4 }));
  coreBase.position.y = 0.2;
  const crystal = new THREE.Mesh(new THREE.OctahedronGeometry(1, 0), new THREE.MeshStandardMaterial({ color: 0xff8a1f, emissive: 0xff6a00, emissiveIntensity: 1.2, roughness: 0.2, metalness: 0.3, flatShading: true }));
  crystal.position.y = 2.2;
  const coreGlow = glow(5, "255,122,0", 0.55); coreGlow.position.y = 2.2;
  const coreLabel = labelSprite("TIERRA ACADEMY", "#ff7a00", 0.9); coreLabel.position.y = 4;
  core.add(coreBase, crystal, coreGlow, coreLabel);
  scene.add(core);

  const stations: { group: THREE.Group; pos: THREE.Vector3; update: Updater; hit: THREE.Mesh; ring: THREE.Mesh; dir: THREE.Vector3 }[] = [];
  STATIONS.forEach((s, i) => {
    const a = (i / STATIONS.length) * Math.PI * 2 - Math.PI / 2;
    const pos = new THREE.Vector3(Math.cos(a) * R, 0, Math.sin(a) * R);
    const group = new THREE.Group();
    group.position.copy(pos);
    group.rotation.y = -a - Math.PI / 2; // face the centre
    const ped = pedestal(s.accent);
    group.add(ped);
    const [content, update] = BUILDERS[i]();
    group.add(content);
    const label = labelSprite(s.name, `#${s.accent.toString(16).padStart(6, "0")}`, 1.15);
    label.position.y = 5.2;
    group.add(label);
    const hit = new THREE.Mesh(new THREE.CylinderGeometry(3.4, 3.4, 5, 16), new THREE.MeshBasicMaterial({ visible: false }));
    hit.position.y = 2.5;
    hit.userData.slug = s.slug;
    group.add(hit);
    scene.add(group);
    // spoke from centre
    const spoke = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.02, R - 5.8), new THREE.MeshBasicMaterial({ color: s.accent, transparent: true, opacity: 0.6 }));
    spoke.position.copy(pos.clone().multiplyScalar(0.5)).setY(0.02);
    spoke.lookAt(new THREE.Vector3(0, 0.02, 0));
    scene.add(spoke);
    stations.push({ group, pos, update, hit, ring: ped.userData.ring, dir: pos.clone().normalize() });
  });

  // ── camera path ──────────────────────────────────────────────────────────
  const overview = { pos: new THREE.Vector3(0, 26, 30), look: new THREE.Vector3(0, 0, 0) };
  const keyFor = (i: number) => {
    const s = stations[i];
    const side = new THREE.Vector3(-s.dir.z, 0, s.dir.x).multiplyScalar(2.2);
    return { pos: s.pos.clone().sub(s.dir.clone().multiplyScalar(-7.6)).add(new THREE.Vector3(0, i === 1 ? 5.4 : 4.6, 0)).add(side), look: s.pos.clone().add(new THREE.Vector3(0, i === 1 ? 2.4 : 1.6, 0)) };
  };
  const keys = [overview, ...stations.map((_, i) => keyFor(i)), { pos: new THREE.Vector3(0, 20, 26), look: new THREE.Vector3(0, 0, 0) }];
  let progress = 0;
  let target = 0;
  const camPos = overview.pos.clone();
  const camLook = overview.look.clone();
  const tmpP = new THREE.Vector3(), tmpL = new THREE.Vector3();
  let narrow = false;
  stage.onResize((w, h) => { narrow = w / h < 0.9; });

  const sample = (p: number) => {
    const seg = p * (keys.length - 1);
    const i = Math.min(keys.length - 2, Math.floor(seg));
    // dwell at each station: ease the transition into the first 55% of each segment
    const local = easeInOutCubic(smooth(0, 0.55, seg - i));
    tmpP.lerpVectors(keys[i].pos, keys[i + 1].pos, local);
    tmpL.lerpVectors(keys[i].look, keys[i + 1].look, local);
    // lift the camera mid-flight for a sweeping arc
    tmpP.y += Math.sin(local * Math.PI) * 3;
    if (narrow) tmpP.add(tmpP.clone().sub(tmpL).multiplyScalar(0.35));
  };

  // ── interaction ──────────────────────────────────────────────────────────
  const ray = new THREE.Raycaster();
  const ndc = new THREE.Vector2();
  let hovered: string | null = null;
  const pick = (e: PointerEvent) => {
    const r = canvas.getBoundingClientRect();
    ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    ray.setFromCamera(ndc, camera);
    const hit = ray.intersectObjects(stations.map((s) => s.hit), false)[0];
    return (hit?.object.userData.slug as string) ?? null;
  };
  const onMove = (e: PointerEvent) => {
    const s = pick(e);
    if (s !== hovered) { hovered = s; canvas.style.cursor = s ? "pointer" : ""; opts.onHover?.(s); }
  };
  const onClick = (e: PointerEvent) => { const s = pick(e); if (s) opts.onSelect(s); };
  canvas.addEventListener("pointermove", onMove);
  canvas.addEventListener("click", onClick as EventListener);

  stage.onFrame((dt, t) => {
    progress += (target - progress) * Math.min(1, dt * 4);
    sample(progress);
    camPos.lerp(tmpP, Math.min(1, dt * 5));
    camLook.lerp(tmpL, Math.min(1, dt * 5));
    camera.position.copy(camPos);
    camera.lookAt(camLook);
    crystal.rotation.y = t * 0.6;
    crystal.position.y = 2.2 + Math.sin(t * 1.2) * 0.15;
    data.userData.update(t, 0.04);
    const active = Math.round(progress * (keys.length - 1)) - 1;
    stations.forEach((s, i) => {
      s.update(t);
      const on = i === active || STATIONS[i].slug === hovered;
      (s.ring.material as THREE.MeshBasicMaterial).color.setHex(on ? 0xffffff : STATIONS[i].accent);
      s.ring.scale.setScalar(on ? 1 + Math.sin(t * 4) * 0.01 + 0.01 : 1);
    });
  });

  return {
    setProgress: (p) => { target = Math.min(1, Math.max(0, p)); },
    focus: (i) => { target = (i + 1) / (keys.length - 1); },
    dispose: () => {
      canvas.removeEventListener("pointermove", onMove);
      canvas.removeEventListener("click", onClick as EventListener);
      stage.dispose();
    },
  };
}
