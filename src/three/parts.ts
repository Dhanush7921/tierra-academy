import * as THREE from "three";

/** Procedural engineering parts — every model is generated in code (no external assets / licences). */

// ── materials ────────────────────────────────────────────────────────────────
export const mat = {
  pcb: () => new THREE.MeshStandardMaterial({ color: 0x0e2233, roughness: 0.55, metalness: 0.15 }),
  pcbGreen: () => new THREE.MeshStandardMaterial({ color: 0x0f3b2c, roughness: 0.5, metalness: 0.1 }),
  blackPlastic: () => new THREE.MeshStandardMaterial({ color: 0x14161c, roughness: 0.6, metalness: 0.05 }),
  shield: () => new THREE.MeshStandardMaterial({ color: 0xdfe3ea, roughness: 0.38, metalness: 0.9, envMapIntensity: 1.6 }),
  gold: () => new THREE.MeshStandardMaterial({ color: 0xf2c15c, roughness: 0.3, metalness: 1, envMapIntensity: 1.5 }),
  copper: () => new THREE.MeshStandardMaterial({ color: 0xc8743a, roughness: 0.3, metalness: 0.9 }),
  steel: () => new THREE.MeshStandardMaterial({ color: 0x8b94a3, roughness: 0.35, metalness: 0.85 }),
  darkSteel: () => new THREE.MeshStandardMaterial({ color: 0x3a4150, roughness: 0.45, metalness: 0.8 }),
  orange: () => new THREE.MeshStandardMaterial({ color: 0xff7a00, roughness: 0.4, metalness: 0.2 }),
  amber: () => new THREE.MeshStandardMaterial({ color: 0xffb300, roughness: 0.4, metalness: 0.2 }),
  white: () => new THREE.MeshStandardMaterial({ color: 0xeef1f5, roughness: 0.5, metalness: 0.05 }),
  blueBody: () => new THREE.MeshStandardMaterial({ color: 0x1f5fbf, roughness: 0.45, metalness: 0.1 }),
  emissive: (c: number, i = 2) => new THREE.MeshStandardMaterial({ color: c, emissive: c, emissiveIntensity: i, roughness: 0.4 }),
  glass: () => new THREE.MeshPhysicalMaterial({ color: 0x9fd8ff, roughness: 0.05, metalness: 0, transmission: 0.6, transparent: true, opacity: 0.35 }),
};

// ── textures ────────────────────────────────────────────────────────────────
export function textTexture(lines: string[], o: { w?: number; h?: number; bg?: string; color?: string; font?: string; align?: CanvasTextAlign; size?: number } = {}) {
  const w = o.w ?? 512, h = o.h ?? 128;
  const c = document.createElement("canvas");
  c.width = w; c.height = h;
  const g = c.getContext("2d")!;
  if (o.bg) { g.fillStyle = o.bg; g.fillRect(0, 0, w, h); }
  g.fillStyle = o.color ?? "#ffffff";
  g.textAlign = o.align ?? "center";
  g.textBaseline = "middle";
  const size = o.size ?? Math.floor(h / (lines.length + 0.6));
  g.font = o.font ?? `600 ${size}px "IBM Plex Mono", ui-monospace, monospace`;
  lines.forEach((l, i) => g.fillText(l, o.align === "left" ? 24 : w / 2, (h / (lines.length + 1)) * (i + 1)));
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

export function glowTexture(color = "255,150,40") {
  const c = document.createElement("canvas");
  c.width = c.height = 128;
  const g = c.getContext("2d")!;
  const grd = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  grd.addColorStop(0, `rgba(${color},1)`);
  grd.addColorStop(0.35, `rgba(${color},0.35)`);
  grd.addColorStop(1, `rgba(${color},0)`);
  g.fillStyle = grd;
  g.fillRect(0, 0, 128, 128);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export function glow(size: number, color?: string, opacity = 0.8) {
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture(color), blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity }));
  s.scale.set(size, size, 1);
  return s;
}

export function labelSprite(text: string, accent = "#ff7a00", scale = 1) {
  const c = document.createElement("canvas");
  c.width = 640; c.height = 140;
  const g = c.getContext("2d")!;
  g.fillStyle = "rgba(8,12,22,0.78)";
  g.beginPath();
  g.roundRect(4, 4, 632, 132, 40);
  g.fill();
  g.strokeStyle = accent;
  g.lineWidth = 4;
  g.stroke();
  g.fillStyle = accent;
  g.beginPath(); g.arc(60, 70, 14, 0, Math.PI * 2); g.fill();
  g.fillStyle = "#ffffff";
  g.font = '600 54px "Unbounded", "IBM Plex Sans", sans-serif';
  g.textBaseline = "middle";
  g.fillText(text, 96, 72);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, transparent: true, depthWrite: false }));
  s.scale.set(4.2 * scale, 0.92 * scale, 1);
  return s;
}

// ── animated copper trace material ──────────────────────────────────────────
/**
 * Ribbon geometry carries `aT` = normalised distance along the trace (+ per-trace delay).
 * uProgress sweeps a bright "current front" through every trace; uFlow adds travelling pulses.
 */
export function traceMaterial() {
  return new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    uniforms: {
      uProgress: { value: 0 },
      uTime: { value: 0 },
      uFlow: { value: 0 },
      uDim: { value: new THREE.Color(0x7a4a22) },
      uLit: { value: new THREE.Color(0xffa040) },
      uHot: { value: new THREE.Color(0xffe08a) },
    },
    vertexShader: /* glsl */ `
      attribute float aT;
      varying float vT;
      void main() { vT = aT; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: /* glsl */ `
      uniform float uProgress; uniform float uTime; uniform float uFlow;
      uniform vec3 uDim; uniform vec3 uLit; uniform vec3 uHot;
      varying float vT;
      void main() {
        float reached = step(vT, uProgress);
        float front = exp(-pow((vT - uProgress) * 28.0, 2.0));
        float pulse = exp(-pow(fract(vT * 1.6 - uTime * 0.45) - 0.5, 2.0) * 120.0) * reached * uFlow;
        vec3 col = mix(uDim, uLit, reached) + uHot * (front * 1.6 + pulse * 1.2);
        gl_FragColor = vec4(col, 0.92);
      }`,
  });
}

/** Builds flat ribbons on the XZ plane (y = height) from Manhattan polylines. */
export function traceRibbons(paths: [number, number][][], width: number, height: number, delays?: number[]) {
  const pos: number[] = [], at: number[] = [], idx: number[] = [];
  let base = 0;
  paths.forEach((pts, pi) => {
    let total = 0;
    for (let i = 1; i < pts.length; i++) total += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
    const delay = delays?.[pi] ?? 0;
    const span = 0.35;
    let run = 0;
    for (let i = 1; i < pts.length; i++) {
      const [x0, z0] = pts[i - 1], [x1, z1] = pts[i];
      const len = Math.hypot(x1 - x0, z1 - z0) || 1;
      const nx = (-(z1 - z0) / len) * width * 0.5, nz = ((x1 - x0) / len) * width * 0.5;
      const t0 = delay + (run / total) * span, t1 = delay + ((run + len) / total) * span;
      pos.push(x0 + nx, height, z0 + nz, x0 - nx, height, z0 - nz, x1 + nx, height, z1 + nz, x1 - nx, height, z1 - nz);
      at.push(t0, t0, t1, t1);
      idx.push(base, base + 2, base + 1, base + 1, base + 2, base + 3);
      base += 4;
      run += len;
    }
  });
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute("aT", new THREE.Float32BufferAttribute(at, 1));
  g.setIndex(idx);
  return g;
}

// ── electronic components ───────────────────────────────────────────────────
export function resistor(bands = ["#8b4513", "#000000", "#ff0000", "#d4af37"]) {
  const g = new THREE.Group();
  const c = document.createElement("canvas");
  c.width = 128; c.height = 16;
  const ctx = c.getContext("2d")!;
  ctx.fillStyle = "#d9c49a"; ctx.fillRect(0, 0, 128, 16);
  bands.forEach((b, i) => { ctx.fillStyle = b; ctx.fillRect(28 + i * 20 + (i === 3 ? 12 : 0), 0, 10, 16); });
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.09, 0.32, 6, 12), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.6 }));
  body.rotation.z = Math.PI / 2;
  g.add(body);
  const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.9, 6), mat.steel());
  leg.rotation.z = Math.PI / 2;
  g.add(leg);
  return g;
}

export function capacitor(color = 0x1d4fa0, h = 0.42, r = 0.16) {
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.CylinderGeometry(r, r, h, 24), new THREE.MeshStandardMaterial({ color, roughness: 0.35, metalness: 0.2 }));
  body.position.y = h / 2;
  const top = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.96, r * 0.96, 0.01, 24), mat.steel());
  top.position.y = h + 0.005;
  const stripe = new THREE.Mesh(new THREE.CylinderGeometry(r * 1.01, r * 1.01, h * 0.98, 24, 1, true, 0, 0.7), new THREE.MeshStandardMaterial({ color: 0xdfe6f0, roughness: 0.5, side: THREE.DoubleSide }));
  stripe.position.y = h / 2;
  g.add(body, top, stripe);
  return g;
}

export function led(color = 0xff3b30) {
  const g = new THREE.Group();
  const dome = new THREE.Mesh(new THREE.CapsuleGeometry(0.08, 0.12, 6, 12), new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 1.6, transparent: true, opacity: 0.9, roughness: 0.2 }));
  dome.position.y = 0.22;
  const legs = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.2, 0.01), mat.steel());
  legs.position.y = 0.06;
  g.add(dome, legs, glow(0.8, "255,80,60", 0.5));
  (g.children[2] as THREE.Sprite).position.y = 0.24;
  g.userData.dome = dome;
  return g;
}

/** Quad-flat-pack IC with instanced pins on 4 sides. */
export function qfpChip(size = 1, pinsPerSide = 12, label?: string) {
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.BoxGeometry(size, size * 0.14, size), mat.blackPlastic());
  body.position.y = size * 0.07;
  g.add(body);
  if (label) {
    const top = new THREE.Mesh(new THREE.PlaneGeometry(size * 0.86, size * 0.86), new THREE.MeshStandardMaterial({ map: textTexture([label], { w: 256, h: 256, color: "#c8ccd4", size: 46 }), transparent: true, roughness: 0.8 }));
    top.rotation.x = -Math.PI / 2;
    top.position.y = size * 0.141;
    g.add(top);
  }
  const pin = new THREE.BoxGeometry(size * 0.035, size * 0.03, size * 0.12);
  const pins = new THREE.InstancedMesh(pin, mat.gold(), pinsPerSide * 4);
  const m = new THREE.Matrix4();
  let i = 0;
  for (let s = 0; s < 4; s++) {
    for (let p = 0; p < pinsPerSide; p++) {
      const off = (p / (pinsPerSide - 1) - 0.5) * size * 0.8;
      const r = new THREE.Matrix4().makeRotationY((s * Math.PI) / 2);
      m.makeTranslation(off, size * 0.03, size * 0.55);
      pins.setMatrixAt(i++, r.clone().multiply(m));
    }
  }
  g.add(pins);
  return g;
}

/** ESP32 DevKit-style board (≈5.4 × 2.6 units). Returns named parts for assembly animation. */
export function esp32Board() {
  const root = new THREE.Group();
  const parts: { obj: THREE.Object3D; delay: number }[] = [];
  const W = 5.4, D = 2.6, T = 0.16;

  const board = new THREE.Mesh(new THREE.BoxGeometry(W, T, D), mat.pcb());
  board.position.y = T / 2;
  root.add(board);
  parts.push({ obj: board, delay: 0 });

  // silkscreen
  const silk = new THREE.Mesh(new THREE.PlaneGeometry(1.9, 0.3), new THREE.MeshBasicMaterial({ map: textTexture(["TIERRA · ESP32 DEVKIT"], { w: 640, h: 100, color: "#e9edf3", size: 44 }), transparent: true }));
  silk.rotation.x = -Math.PI / 2;
  silk.position.set(0.95, T + 0.002, 1.0);
  root.add(silk);
  parts.push({ obj: silk, delay: 0.35 });

  // copper traces (animated)
  const tm = traceMaterial();
  const paths: [number, number][][] = [];
  const delays: number[] = [];
  for (let i = 0; i < 14; i++) {
    const side = i % 2 ? 1 : -1;
    const x = -1.6 + (i >> 1) * 0.42;
    const zEnd = side * 1.05;
    paths.push([[-0.2, side * 0.25], [x + 0.6, side * 0.25], [x + 0.6, side * 0.62], [x, side * 0.62], [x, zEnd]]);
    delays.push(i * 0.045);
  }
  for (let i = 0; i < 4; i++) {
    paths.push([[1.45, -0.6 + i * 0.4], [0.9, -0.6 + i * 0.4], [0.9 - i * 0.12, -0.1 + i * 0.05], [0.2, -0.1 + i * 0.05]]);
    delays.push(0.25 + i * 0.05);
  }
  // visible signal bus across the free band of the board
  for (let i = 0; i < 4; i++) {
    const z = 0.1 + i * 0.075;
    paths.push([[-0.25, z], [0.6 + i * 0.1, z], [0.75 + i * 0.1, z - 0.15 - i * 0.02], [2.1, z - 0.15 - i * 0.02]]);
    delays.push(0.12 + i * 0.06);
    paths.push([[-0.25, -z - 0.05], [1.1 - i * 0.08, -z - 0.05], [1.25 - i * 0.08, -0.12], [1.3, -0.12]]);
    delays.push(0.2 + i * 0.06);
  }
  const traces = new THREE.Mesh(traceRibbons(paths, 0.055, T + 0.004, delays), tm);
  // vias at trace ends
  const vias = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.045, 0.045, 0.012, 12), mat.gold(), paths.length);
  const vm = new THREE.Matrix4();
  paths.forEach((p, i) => { const [x, z] = p[p.length - 1]; vm.makeTranslation(x, T + 0.006, z); vias.setMatrixAt(i, vm); });
  root.add(vias);
  root.add(traces);

  // WROOM module: black module PCB + shielding can + antenna meander
  const module = new THREE.Group();
  const modPcb = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.08, 1.75), mat.blackPlastic());
  const can = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.26, 1.55), mat.shield());
  can.position.set(0.3, 0.17, 0);
  const canLabel = new THREE.Mesh(new THREE.PlaneGeometry(1.4, 1.1), new THREE.MeshStandardMaterial({ map: textTexture(["ESP32-WROOM", "WI-FI + BT", "TIERRA"], { w: 512, h: 400, color: "#3a3f48", size: 64 }), transparent: true, roughness: 0.4, metalness: 0.6 }));
  canLabel.rotation.x = -Math.PI / 2;
  canLabel.position.set(0.3, 0.301, 0);
  const antenna = new THREE.Mesh(
    traceRibbons([[[-1.1, -0.7], [-1.1, 0.7], [-0.95, 0.7], [-0.95, -0.5], [-0.8, -0.5], [-0.8, 0.7], [-0.65, 0.7], [-0.65, -0.7]]], 0.05, 0.045, [0.55]),
    tm,
  );
  module.add(modPcb, can, canLabel, antenna);
  module.position.set(-1.45, T + 0.04, 0);
  root.add(module);
  parts.push({ obj: module, delay: 0.25 });

  // pin headers (2 × 19)
  const headerMat = mat.blackPlastic();
  [-1, 1].forEach((side, si) => {
    const strip = new THREE.Mesh(new THREE.BoxGeometry(W * 0.92, 0.22, 0.2), headerMat);
    strip.position.set(0, -0.11, side * (D / 2 - 0.15));
    const pins = new THREE.InstancedMesh(new THREE.BoxGeometry(0.05, 0.75, 0.05), mat.gold(), 19);
    const m = new THREE.Matrix4();
    for (let p = 0; p < 19; p++) { m.makeTranslation(-W * 0.44 + p * (W * 0.88) / 18, -0.28, side * (D / 2 - 0.15)); pins.setMatrixAt(p, m); }
    const header = new THREE.Group();
    header.add(strip, pins);
    root.add(header);
    parts.push({ obj: header, delay: 0.1 + si * 0.08 });
  });

  // USB connector, regulator, USB-UART chip, buttons, LEDs, SMD passives
  const usb = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.22, 0.75), mat.shield());
  usb.position.set(W / 2 - 0.22, T + 0.11, 0);
  root.add(usb); parts.push({ obj: usb, delay: 0.45 });

  const reg = new THREE.Group();
  const regBody = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.14, 0.3), mat.blackPlastic());
  const regTab = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.03, 0.18), mat.steel());
  regTab.position.set(0, -0.04, -0.22);
  reg.add(regBody, regTab);
  reg.position.set(1.45, T + 0.07, 0.62);
  root.add(reg); parts.push({ obj: reg, delay: 0.5 });

  const uart = qfpChip(0.5, 6, "CP2102");
  uart.position.set(1.55, T, -0.45);
  root.add(uart); parts.push({ obj: uart, delay: 0.55 });

  [[2.15, 0.85], [2.15, -0.85]].forEach(([x, z], i) => {
    const btn = new THREE.Group();
    const base = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.12, 0.34), mat.shield());
    const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 0.08, 16), mat.blackPlastic());
    cap.position.y = 0.1;
    btn.add(base, cap);
    btn.position.set(x, T + 0.06, z);
    root.add(btn); parts.push({ obj: btn, delay: 0.6 + i * 0.05 });
  });

  const leds: THREE.Mesh[] = [];
  [[0xff3b30, 0.55], [0x3b82f6, 0.25]].forEach(([c, z]) => {
    const l = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.06, 0.08), mat.emissive(c as number, 1.4));
    l.position.set(1.0, T + 0.03, (z as number) * -1 - 0.4);
    leds.push(l);
    root.add(l); parts.push({ obj: l, delay: 0.7 });
  });

  const smd = new THREE.InstancedMesh(new THREE.BoxGeometry(0.12, 0.06, 0.07), new THREE.MeshStandardMaterial({ color: 0xc9a77a, roughness: 0.5 }), 16);
  const m = new THREE.Matrix4();
  for (let i = 0; i < 16; i++) { m.makeTranslation(0.25 + (i % 8) * 0.17, T + 0.03, (i < 8 ? 0.45 : -0.75) + (i % 2) * 0.08); smd.setMatrixAt(i, m); }
  root.add(smd); parts.push({ obj: smd, delay: 0.65 });

  return { root, parts, traceMaterial: tm, leds };
}

export function servo() {
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.85, 0.6), mat.blueBody());
  body.position.y = 0.42;
  const tabs = new THREE.Mesh(new THREE.BoxGeometry(1.65, 0.07, 0.6), mat.blueBody());
  tabs.position.y = 0.62;
  const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.16, 0.18, 20), mat.white());
  hub.position.set(0.3, 0.92, 0);
  const horn = new THREE.Group();
  const arm = new THREE.Mesh(new THREE.BoxGeometry(0.95, 0.05, 0.14), mat.white());
  arm.position.x = 0.25;
  horn.add(arm);
  horn.position.set(0.3, 1.02, 0);
  g.add(body, tabs, hub, horn);
  g.userData.horn = horn;
  return g;
}

export function ultrasonic() {
  const g = new THREE.Group();
  const board = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.06, 0.85), mat.blueBody());
  g.add(board);
  [-0.48, 0.48].forEach((x) => {
    const can = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 0.42, 28), mat.shield());
    can.position.set(x, 0.24, 0);
    const mesh = new THREE.Mesh(new THREE.CircleGeometry(0.26, 24), new THREE.MeshStandardMaterial({ color: 0x2a2d33, roughness: 0.9 }));
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.set(x, 0.452, 0);
    g.add(can, mesh);
  });
  return g;
}

export function oled(lines = ["LEARN.", "BUILD.", "AUTOMATE."]) {
  const g = new THREE.Group();
  const board = new THREE.Mesh(new THREE.BoxGeometry(1.3, 0.06, 1.2), mat.pcb());
  const glass = new THREE.Mesh(new THREE.PlaneGeometry(1.12, 0.78), new THREE.MeshBasicMaterial({ map: textTexture(lines, { w: 512, h: 360, bg: "#02060c", color: "#ffb347", size: 70 }) }));
  glass.rotation.x = -Math.PI / 2;
  glass.position.set(0, 0.035, -0.08);
  g.add(board, glass);
  return g;
}

/** Jumper wire whose visible length can be animated through drawRange. */
export function wire(points: THREE.Vector3[], color: number, radius = 0.035) {
  const curve = new THREE.CatmullRomCurve3(points, false, "catmullrom", 0.3);
  const geo = new THREE.TubeGeometry(curve, 80, radius, 8, false);
  const mesh = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color, roughness: 0.45, metalness: 0.05 }));
  const total = geo.index!.count;
  mesh.userData.setGrow = (p: number) => geo.setDrawRange(0, Math.floor(total * Math.min(1, Math.max(0, p)) / 6) * 6);
  mesh.userData.curve = curve;
  return mesh;
}

// ── mechanical ──────────────────────────────────────────────────────────────
export function gearGeometry(teeth: number, radius: number, depth: number, toothH = radius * 0.16, bore = radius * 0.22) {
  const shape = new THREE.Shape();
  const step = (Math.PI * 2) / teeth;
  for (let i = 0; i < teeth; i++) {
    const a = i * step;
    const pts: [number, number][] = [
      [radius - toothH * 0.2, a],
      [radius + toothH, a + step * 0.18],
      [radius + toothH, a + step * 0.42],
      [radius - toothH * 0.2, a + step * 0.6],
    ];
    pts.forEach(([r, ang], j) => {
      const x = Math.cos(ang) * r, y = Math.sin(ang) * r;
      if (i === 0 && j === 0) shape.moveTo(x, y); else shape.lineTo(x, y);
    });
    const r0 = radius - toothH * 0.2;
    shape.lineTo(Math.cos(a + step) * r0, Math.sin(a + step) * r0);
  }
  const hole = new THREE.Path();
  hole.absarc(0, 0, bore, 0, Math.PI * 2, true);
  shape.holes.push(hole);
  // lightening holes
  for (let k = 0; k < 5 && radius > 0.8; k++) {
    const ang = (k / 5) * Math.PI * 2;
    const h = new THREE.Path();
    h.absarc(Math.cos(ang) * radius * 0.55, Math.sin(ang) * radius * 0.55, radius * 0.16, 0, Math.PI * 2, true);
    shape.holes.push(h);
  }
  const geo = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: true, bevelSize: 0.02, bevelThickness: 0.02, bevelSegments: 1, curveSegments: 6 });
  geo.translate(0, 0, -depth / 2);
  return geo;
}

export function cadGear(teeth: number, radius: number, depth: number, color = 0xffb300) {
  const geo = gearGeometry(teeth, radius, depth);
  const g = new THREE.Group();
  g.add(new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color, roughness: 0.35, metalness: 0.75 })));
  g.add(new THREE.LineSegments(new THREE.EdgesGeometry(geo, 25), new THREE.LineBasicMaterial({ color: 0xffe2b0, transparent: true, opacity: 0.35 })));
  return g;
}

/** Articulated 4-DOF arm. Exposes joints for animation. */
export function robotArm(scale = 1, accent = 0xff7a00) {
  const root = new THREE.Group();
  const body = new THREE.MeshStandardMaterial({ color: 0xe9edf2, roughness: 0.35, metalness: 0.25 });
  const joint = new THREE.MeshStandardMaterial({ color: accent, roughness: 0.35, metalness: 0.4 });
  const dark = mat.darkSteel();
  const base = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 1.05, 0.35, 40), dark);
  base.position.y = 0.17;
  root.add(base);
  const yaw = new THREE.Group(); yaw.position.y = 0.35; root.add(yaw);
  const turret = new THREE.Mesh(new THREE.CylinderGeometry(0.62, 0.7, 0.4, 32), body);
  turret.position.y = 0.2; yaw.add(turret);
  const shoulder = new THREE.Group(); shoulder.position.y = 0.55; yaw.add(shoulder);
  const sj = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.32, 0.8, 28), joint); sj.rotation.z = Math.PI / 2; shoulder.add(sj);
  const upper = new THREE.Mesh(new THREE.BoxGeometry(0.42, 2.0, 0.42), body); upper.position.y = 1.0; shoulder.add(upper);
  const elbow = new THREE.Group(); elbow.position.y = 2.0; shoulder.add(elbow);
  const ej = new THREE.Mesh(new THREE.CylinderGeometry(0.27, 0.27, 0.7, 28), joint); ej.rotation.z = Math.PI / 2; elbow.add(ej);
  const fore = new THREE.Mesh(new THREE.BoxGeometry(0.34, 1.6, 0.34), body); fore.position.y = 0.8; elbow.add(fore);
  const wrist = new THREE.Group(); wrist.position.y = 1.6; elbow.add(wrist);
  const wj = new THREE.Mesh(new THREE.SphereGeometry(0.22, 24, 16), joint); wrist.add(wj);
  const hand = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.18, 0.3), dark); hand.position.y = 0.22; wrist.add(hand);
  const fingerL = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.42, 0.22), dark); fingerL.position.set(-0.18, 0.5, 0);
  const fingerR = fingerL.clone(); fingerR.position.x = 0.18;
  wrist.add(fingerL, fingerR);
  const tip = glow(0.9, "255,140,30", 0.6); tip.position.y = 0.75; wrist.add(tip);
  root.scale.setScalar(scale);
  return { root, yaw, shoulder, elbow, wrist, fingerL, fingerR };
}

export function motor() {
  const g = new THREE.Group();
  const housing = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 0.9, 2.2, 40), new THREE.MeshStandardMaterial({ color: 0x2c4a7a, roughness: 0.4, metalness: 0.6 }));
  housing.rotation.z = Math.PI / 2;
  const fins = new THREE.InstancedMesh(new THREE.BoxGeometry(1.9, 0.07, 0.16), mat.darkSteel(), 20);
  const m = new THREE.Matrix4();
  for (let i = 0; i < 20; i++) {
    const a = (i / 20) * Math.PI * 2;
    m.makeRotationX(a).setPosition(0, Math.cos(a) * 0.95, Math.sin(a) * 0.95);
    fins.setMatrixAt(i, m);
  }
  const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.75, 0.9, 0.3, 40), mat.darkSteel());
  cap.rotation.z = Math.PI / 2; cap.position.x = -1.25;
  const shaft = new THREE.Group();
  const s = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 0.9, 16), mat.steel());
  s.rotation.z = Math.PI / 2; s.position.x = 0.45;
  const coupling = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.22, 0.25, 6), mat.orange());
  coupling.rotation.z = Math.PI / 2; coupling.position.x = 0.85;
  shaft.add(s, coupling);
  shaft.position.x = 1.1;
  const feet = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.16, 1.5), mat.darkSteel());
  feet.position.y = -0.95;
  const box = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.35, 0.55), new THREE.MeshStandardMaterial({ color: 0x2c4a7a, roughness: 0.5, metalness: 0.5 }));
  box.position.y = 0.98;
  g.add(housing, fins, cap, shaft, feet, box);
  g.userData.shaft = shaft;
  return g;
}

/** Points that travel along a curve (current flow / data packets). */
export function flowParticles(curve: THREE.Curve<THREE.Vector3>, count: number, color = 0xffc04d, size = 0.16) {
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(new Float32Array(count * 3), 3));
  const pts = new THREE.Points(geo, new THREE.PointsMaterial({ color, size, map: glowTexture(), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
  const v = new THREE.Vector3();
  pts.userData.update = (t: number, speed = 0.18) => {
    const arr = geo.attributes.position.array as Float32Array;
    for (let i = 0; i < count; i++) {
      curve.getPointAt(((i / count) + t * speed) % 1, v);
      arr[i * 3] = v.x; arr[i * 3 + 1] = v.y; arr[i * 3 + 2] = v.z;
    }
    geo.attributes.position.needsUpdate = true;
  };
  pts.userData.update(0);
  return pts;
}
