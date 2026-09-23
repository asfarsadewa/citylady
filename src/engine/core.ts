// Game loop, low-res canvas, scaling, input, scene stack, transitions and image assets.
import { audio } from "./audio";
import { Post } from "./post";

export const W = 640;
export const H = 360;

export interface Scene {
  enter?(): void;
  leave?(): void;
  update(dt: number): void;
  draw(ctx: CanvasRenderingContext2D): void;
}

// ---------- input ----------
const down = new Set<string>();
const pressed = new Set<string>();
export const pointer = { x: -1, y: -1, down: false, clicked: false, moved: false, touch: false };

const KEYMAP: Record<string, string> = {
  ArrowLeft: "left", KeyA: "left", ArrowRight: "right", KeyD: "right", ArrowUp: "up", KeyW: "up",
  ArrowDown: "down", KeyS: "down", Enter: "ok", Space: "ok", KeyE: "ok", Escape: "back", Backspace: "back",
  Tab: "ledger", KeyL: "ledger", ShiftLeft: "run", ShiftRight: "run", KeyM: "mute", KeyV: "analog",
  Digit1: "1", Digit2: "2", Digit3: "3", Digit4: "4", Digit5: "5", Digit6: "6", Digit7: "7", Digit8: "8",
};

export const input = {
  down: (k: string) => down.has(k),
  pressed: (k: string) => pressed.has(k),
  /** true while a DOM text field has focus; game keys are ignored then. */
  typing: false,
  consume(k: string) { pressed.delete(k); },
};

function bindInput(canvas: HTMLCanvasElement) {
  addEventListener("keydown", (e) => {
    audio.unlock();
    if (input.typing) return;
    const k = KEYMAP[e.code];
    if (!k) return;
    e.preventDefault();
    if (!down.has(k)) pressed.add(k);
    down.add(k);
  });
  addEventListener("keyup", (e) => {
    const k = KEYMAP[e.code];
    if (k) down.delete(k);
  });
  addEventListener("blur", () => down.clear());
  const toGame = (e: PointerEvent) => {
    const r = canvas.getBoundingClientRect();
    pointer.x = ((e.clientX - r.left) / r.width) * W;
    pointer.y = ((e.clientY - r.top) / r.height) * H;
    pointer.touch = e.pointerType === "touch";
  };
  canvas.addEventListener("pointerdown", (e) => {
    audio.unlock();
    toGame(e);
    pointer.down = true;
    pointer.clicked = true;
  });
  canvas.addEventListener("pointermove", (e) => {
    toGame(e);
    pointer.moved = true;
  });
  addEventListener("pointerup", () => (pointer.down = false));
  canvas.addEventListener("contextmenu", (e) => e.preventDefault());
}

export function hit(x: number, y: number, w: number, h: number) {
  return pointer.x >= x && pointer.x < x + w && pointer.y >= y && pointer.y < y + h;
}

// ---------- images ----------
export const images = new Map<string, HTMLImageElement>();

export function img(key: string): HTMLImageElement | undefined {
  return images.get(key);
}

export async function loadImages(keys: string[], onProgress: (f: number) => void) {
  let done = 0;
  await Promise.all(
    keys.map(
      (k) =>
        new Promise<void>((res) => {
          const im = new Image();
          im.onload = () => { images.set(k, im); res(); };
          im.onerror = () => res();
          im.src = `art/${k}.png`;
        }).then(() => onProgress(++done / keys.length)),
    ),
  );
}

// ---------- scenes & loop ----------
let current: Scene | null = null;
let next: Scene | null = null;
let fade = 0; // 0 = clear, 1 = black
let fadeDir = 0;
let fadeSpeed = 2.5;
export const shake = { amp: 0, t: 0 };
export let time = 0;
let ctx: CanvasRenderingContext2D;
export let post: Post | null = null;

export function go(scene: Scene, speed = 2.5) {
  if (!current) {
    current = scene;
    scene.enter?.();
    return;
  }
  next = scene;
  fadeDir = 1;
  fadeSpeed = speed;
}

export function kick(amp: number) {
  shake.amp = Math.max(shake.amp, amp);
}

/** `canvas` is the visible output; the game draws into a 640x360 buffer that the VHS pass presents. */
export function start(canvas: HTMLCanvasElement) {
  const buffer = document.createElement("canvas");
  buffer.width = W;
  buffer.height = H;
  ctx = buffer.getContext("2d")!;
  ctx.imageSmoothingEnabled = false;
  post = new Post(canvas);
  if (import.meta.env.DEV) (window as unknown as Record<string, unknown>).__buffer = buffer;
  try {
    const saved = localStorage.getItem("citylady.analog");
    if (saved !== null) post.amount = Number(saved);
  } catch { /* storage unavailable */ }
  bindInput(canvas);
  const fit = () => {
    const s = Math.min(innerWidth / W, innerHeight / H);
    const scale = s >= 1 ? Math.max(1, Math.floor(s * 4) / 4) : s;
    const is = Math.floor(s);
    const use = is >= 2 && s - is < 0.35 ? is : scale;
    canvas.style.width = `${Math.floor(W * use)}px`;
    canvas.style.height = `${Math.floor(H * use)}px`;
    post!.resize(Math.floor(W * use), Math.floor(H * use));
  };
  addEventListener("resize", fit);
  fit();
  let last = performance.now();
  let lastFrame = last;
  let rafPending = false;
  const schedule = () => {
    if (rafPending) return;
    rafPending = true;
    requestAnimationFrame(() => {
      rafPending = false;
      frame();
    });
  };
  const frame = () => {
    const now = performance.now();
    const dt = Math.max(0, Math.min(0.1, (now - last) / 1000));
    last = now;
    lastFrame = now;
    time += dt;
    if (pressed.has("mute")) {
      audio.volumes.master = audio.volumes.master > 0 ? 0 : 0.9;
      audio.applyVolumes();
    }
    if (pressed.has("analog")) setAnalog(post!.amount > 0 ? 0 : 1);
    if (fadeDir !== 0) {
      fade += fadeDir * dt * fadeSpeed;
      if (fade >= 1 && fadeDir > 0) {
        fade = 1;
        current?.leave?.();
        current = next;
        next = null;
        current?.enter?.();
        fadeDir = -1;
      } else if (fade <= 0 && fadeDir < 0) {
        fade = 0;
        fadeDir = 0;
      }
    }
    if (current && fadeDir <= 0) current.update(dt);
    ctx.save();
    if (shake.amp > 0.2) {
      ctx.translate(Math.round((Math.random() - 0.5) * shake.amp), Math.round((Math.random() - 0.5) * shake.amp));
      shake.amp *= Math.pow(0.02, dt);
    } else shake.amp = 0;
    ctx.fillStyle = "#07050c";
    ctx.fillRect(-20, -20, W + 40, H + 40);
    current?.draw(ctx);
    ctx.restore();
    if (fade > 0) {
      ctx.fillStyle = `rgba(7,5,12,${Math.min(1, fade)})`;
      ctx.fillRect(0, 0, W, H);
    }
    post!.render(buffer, time);
    pressed.clear();
    pointer.clicked = false;
    pointer.moved = false;
    schedule();
  };
  schedule();
  // some embedded browsers pause rAF; keep the game ticking with a slow timer
  setInterval(() => {
    if (performance.now() - lastFrame > 90) frame();
  }, 45);
}

// ---------- small helpers ----------
export const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
export const ease = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
export const easeOut = (t: number) => 1 - Math.pow(1 - t, 3);

/** Debug view of the scene state (dev tooling only). */
export const debugState = () => ({ current: current?.constructor.name, next: next?.constructor.name, fade, fadeDir, time, phase: (current as unknown as { phase?: string })?.phase, duel: (current as unknown as { d?: { resolve: number; temper: number; done: string | null } })?.d });

export function setAnalog(v: number) {
  if (!post) return;
  post.amount = v;
  try { localStorage.setItem("citylady.analog", String(v)); } catch { /* storage unavailable */ }
}
