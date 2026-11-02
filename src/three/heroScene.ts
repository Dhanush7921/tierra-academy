import * as THREE from "three";
import { addStudioLights, createStage, easeOutCubic, smooth } from "./core";
import { capacitor, esp32Board, glow, led, oled, resistor, servo, ultrasonic, wire } from "./parts";

/**
 * SCENE 1 — "Engineering Awakens".
 * An ESP32 board assembles itself, peripherals arrive, jumper wires route to the pins
 * and the copper traces light up as current flows. ~4.5 s, skippable, then idles.
 */
export interface HeroHandle {
  skip: () => void;
  dispose: () => void;
}

const ASSEMBLY_END = 4.6;

export function mountHero(canvas: HTMLCanvasElement, opts: { reducedMotion: boolean; lowPower: boolean; onAssembled?: () => void }): HeroHandle {
  const stage = createStage(canvas, { fov: 32, maxDpr: opts.lowPower ? 1.25 : 1.75, lowPower: opts.lowPower });
  const { scene, camera } = stage;
  addStudioLights(scene, 1, stage.renderer);

  const world = new THREE.Group();
  scene.add(world);

  // warm glow pooled under the board
  const underGlow = glow(9, "255,122,0", 0.35);
  underGlow.position.y = -0.7;
  underGlow.scale.set(11, 6, 1);
  world.add(underGlow);

  const esp = esp32Board();
  world.add(esp.root);

  // peripherals placed around the board
  type Piece = { obj: THREE.Object3D; target: THREE.Vector3; from: THREE.Vector3; rot: THREE.Euler; base?: THREE.Euler; delay: number };
  const pieces: Piece[] = [];
  const addPiece = (obj: THREE.Object3D, target: [number, number, number], delay: number, rotY = 0) => {
    obj.position.set(...target);
    obj.rotation.y = rotY;
    world.add(obj);
    const dir = new THREE.Vector3(target[0], 0, target[2]).normalize().multiplyScalar(6);
    pieces.push({ obj, target: obj.position.clone(), from: obj.position.clone().add(dir).add(new THREE.Vector3(0, 5 + Math.random() * 2, 0)), rot: new THREE.Euler(Math.random() * 2, Math.random() * 2, Math.random()), delay });
  };
  // board sub-parts fly in from above
  esp.parts.forEach((p, i) => {
    pieces.push({ obj: p.obj, target: p.obj.position.clone(), from: p.obj.position.clone().add(new THREE.Vector3((i % 3 - 1) * 2, 4 + i * 0.3, (i % 2 ? 1 : -1) * 2)), rot: new THREE.Euler(Math.random(), Math.random(), Math.random()), delay: p.delay * 1.6 });
  });
  const sv = servo();
  addPiece(sv, [-4.6, -0.6, -1.6], 1.25, 0.5);
  const us = ultrasonic();
  addPiece(us, [4.4, -0.35, -1.7], 1.4, -0.4);
  const disp = oled();
  addPiece(disp, [4.3, -0.5, 1.7], 1.55, -0.3);
  const ledR = led(0xff5a1f);
  addPiece(ledR, [-3.9, -0.6, 2.0], 1.6);
  const res = resistor();
  addPiece(res, [-3.0, -0.5, 2.4], 1.65, 0.6);
  const cap = capacitor();
  addPiece(cap, [-5.0, -0.6, 0.6], 1.7);
  const cap2 = capacitor(0x111111, 0.3, 0.12);
  addPiece(cap2, [2.8, -0.6, 2.5], 1.75);

  // jumper wires from header pins to peripherals
  const pin = (i: number, side: 1 | -1) => new THREE.Vector3(-2.38 + i * 0.264, -0.45, side * 1.15);
  const wireDefs: [THREE.Vector3[], number][] = [
    [[pin(2, -1), new THREE.Vector3(-2.6, -0.2, -2.0), new THREE.Vector3(-4.0, 0.1, -1.9), new THREE.Vector3(-4.3, 0.35, -1.6)], 0xff7a00],
    [[pin(15, -1), new THREE.Vector3(2.4, -0.1, -2.1), new THREE.Vector3(3.6, 0.1, -1.9), new THREE.Vector3(3.95, -0.25, -1.7)], 0xffb300],
    [[pin(16, 1), new THREE.Vector3(2.6, -0.1, 2.1), new THREE.Vector3(3.5, -0.2, 1.9), new THREE.Vector3(3.75, -0.45, 1.7)], 0x38d2ff],
    [[pin(3, 1), new THREE.Vector3(-2.7, -0.2, 2.2), new THREE.Vector3(-3.5, -0.3, 2.1), new THREE.Vector3(-3.85, -0.45, 2.0)], 0xff3b30],
    [[pin(0, -1), new THREE.Vector3(-3.2, -0.3, -1.0), new THREE.Vector3(-4.4, -0.35, 0.2), new THREE.Vector3(-4.85, -0.2, 0.55)], 0x9be15d],
  ];
  const wires = wireDefs.map(([pts, c], i) => {
    const w = wire(pts, c);
    w.userData.setGrow(0);
    w.userData.delay = 2.0 + i * 0.16;
    world.add(w);
    return w;
  });

  // camera framing (responsive)
  const target = new THREE.Vector3(0, -0.1, 0);
  let baseDist = 13;
  let shiftX = 0;
  stage.onResize((w, h) => {
    const aspect = w / h;
    baseDist = aspect < 0.8 ? 22 : aspect < 1.2 ? 17 : 15;
    shiftX = aspect > 1.3 ? -1.7 : 0; // leave room for the headline on wide screens
  });

  const pointer = new THREE.Vector2();
  const onPointer = (e: PointerEvent) => {
    const r = canvas.getBoundingClientRect();
    pointer.set(((e.clientX - r.left) / r.width) * 2 - 1, ((e.clientY - r.top) / r.height) * 2 - 1);
  };
  window.addEventListener("pointermove", onPointer, { passive: true });

  let t0 = opts.reducedMotion ? ASSEMBLY_END : 0;
  let assembledFired = false;
  let elapsed = t0;

  const apply = (time: number) => {
    for (const p of pieces) {
      const k = easeOutCubic((time - p.delay) / 1.1);
      p.obj.position.lerpVectors(p.from, p.target, k);
      p.obj.visible = time >= p.delay - 0.05;
      const b = (p.base ??= p.obj.rotation.clone());
      p.obj.rotation.set(b.x + p.rot.x * (1 - k), b.y + p.rot.y * (1 - k), b.z + p.rot.z * (1 - k));
    }
    wires.forEach((w) => w.userData.setGrow(smooth(w.userData.delay, w.userData.delay + 0.9, time)));
    esp.traceMaterial.uniforms.uProgress.value = smooth(2.6, ASSEMBLY_END, time) * 1.25;
    esp.traceMaterial.uniforms.uFlow.value = smooth(ASSEMBLY_END - 0.4, ASSEMBLY_END + 0.6, time);
  };
  apply(elapsed);

  let last = performance.now();
  stage.onFrame((_dt, t) => {
    const now = performance.now();
    const real = Math.min((now - last) / 1000, 0.25); // wall-clock so slow GPUs still finish on time
    last = now;
    if (elapsed < ASSEMBLY_END + 1) elapsed += real;
    apply(elapsed);
    if (!assembledFired && elapsed >= ASSEMBLY_END) { assembledFired = true; opts.onAssembled?.(); }
    esp.traceMaterial.uniforms.uTime.value = t;
    // idle life: LEDs blink, servo sweeps, board floats
    esp.leds[0].material instanceof THREE.MeshStandardMaterial && (esp.leds[0].material.emissiveIntensity = 1 + Math.sin(t * 3) * 0.8);
    (ledR.userData.dome.material as THREE.MeshStandardMaterial).emissiveIntensity = 1.2 + Math.sin(t * 2.2) * 0.6;
    sv.userData.horn.rotation.y = Math.sin(t * 0.9) * 0.9;
    const intro = smooth(0, ASSEMBLY_END, elapsed);
    world.rotation.y = THREE.MathUtils.lerp(world.rotation.y, -0.35 + pointer.x * 0.25 + (1 - intro) * 0.6, 0.05);
    world.position.y = Math.sin(t * 0.8) * 0.05;
    const dist = baseDist + (1 - intro) * 3;
    camera.position.set(0, 6.2 + pointer.y * 0.6 + (1 - intro) * 2, dist);
    camera.position.x = shiftX;
    camera.lookAt(target.x + shiftX, target.y, target.z);
  });

  return {
    skip: () => { elapsed = ASSEMBLY_END + 0.5; apply(elapsed); },
    dispose: () => { window.removeEventListener("pointermove", onPointer); stage.dispose(); },
  };
}
