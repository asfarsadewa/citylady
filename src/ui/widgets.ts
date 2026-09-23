// Shared pixel UI: panels, bars, buttons, keycaps, subtitle box and the effects layer.
import { hit, pointer, time, W, H } from "../engine/core";
import { text, para, measure, type FontId } from "../engine/text";
import { audio } from "../engine/audio";

export const COL = {
  ink: "#0b0714",
  ink2: "#171024",
  panel: "rgba(14,9,22,0.88)",
  line: "#3a2c4c",
  paper: "#f4e9dc",
  dim: "#9a8fab",
  gold: "#f2c14e",
  crimson: "#d83a47",
  red: "#ff5a5a",
  teal: "#5ad1c8",
  violet: "#b58cff",
  green: "#8fe07a",
};

export function panel(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, accent = COL.line, fill = COL.panel) {
  ctx.fillStyle = fill;
  ctx.fillRect(x + 1, y, w - 2, h);
  ctx.fillRect(x, y + 1, w, h - 2);
  ctx.fillStyle = accent;
  ctx.fillRect(x + 1, y, w - 2, 1);
  ctx.fillRect(x + 1, y + h - 1, w - 2, 1);
  ctx.fillRect(x, y + 1, 1, h - 2);
  ctx.fillRect(x + w - 1, y + 1, 1, h - 2);
  ctx.fillStyle = "rgba(255,255,255,0.05)";
  ctx.fillRect(x + 1, y + 1, w - 2, 1);
}

export function bar(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, v: number, color: string, ghost?: number) {
  ctx.fillStyle = "#0a0610";
  ctx.fillRect(x - 1, y - 1, w + 2, h + 2);
  ctx.fillStyle = "#231a30";
  ctx.fillRect(x, y, w, h);
  if (ghost !== undefined && ghost > v) {
    ctx.fillStyle = "#fff4";
    ctx.fillRect(x, y, Math.round(w * Math.min(1, ghost)), h);
  }
  ctx.fillStyle = color;
  const fw = Math.round(w * Math.max(0, Math.min(1, v)));
  ctx.fillRect(x, y, fw, h);
  ctx.fillStyle = "rgba(255,255,255,0.25)";
  ctx.fillRect(x, y, fw, 1);
  // tick marks every 10%
  ctx.fillStyle = "rgba(0,0,0,0.35)";
  for (let i = 1; i < 10; i++) ctx.fillRect(x + Math.round((w * i) / 10), y + h - 1, 1, 1);
}

export function keycap(ctx: CanvasRenderingContext2D, k: string, x: number, y: number) {
  const w = Math.max(10, measure(k, "small") + 5);
  ctx.fillStyle = "#e9dcc6";
  ctx.fillRect(x, y, w, 10);
  ctx.fillStyle = "#9c8c78";
  ctx.fillRect(x, y + 9, w, 1);
  text(ctx, k, x + w / 2 + 0.5, y + 2, { font: "small", color: COL.ink, align: "center", shadow: null });
  return w;
}

let hoverSoundKey = "";

export interface ButtonOpts {
  font?: FontId;
  key?: string;
  disabled?: boolean;
  accent?: string;
  selected?: boolean;
  sub?: string;
}

/** Immediate-mode button. Returns true on click. */
export function button(ctx: CanvasRenderingContext2D, id: string, label: string, x: number, y: number, w: number, h: number, o: ButtonOpts = {}): boolean {
  const over = hit(x, y, w, h) && !o.disabled;
  const on = over || o.selected;
  if (over && hoverSoundKey !== id && pointer.moved) {
    hoverSoundKey = id;
    audio.sfx("ui_move", { vol: 0.35 });
  }
  if (!over && hoverSoundKey === id) hoverSoundKey = "";
  const accent = o.disabled ? "#2a2236" : on ? (o.accent ?? COL.gold) : COL.line;
  panel(ctx, x, y, w, h, accent, on ? "rgba(40,22,44,0.94)" : COL.panel);
  if (on) {
    ctx.fillStyle = o.accent ?? COL.gold;
    ctx.fillRect(x + 2, y + 2, 2, h - 4);
  }
  let tx = x + 8;
  if (o.key) tx += keycap(ctx, o.key, x + 6, y + Math.floor((h - 10) / 2) - (o.sub ? 6 : 0)) + 5;
  const font = o.font ?? "body";
  const color = o.disabled ? "#5c5068" : on ? "#fff6e6" : COL.paper;
  if (o.sub) {
    text(ctx, label, tx, y + 6, { font, color });
    text(ctx, o.sub, tx, y + 19, { font: "small", color: o.disabled ? "#4a4056" : COL.dim });
  } else text(ctx, label, tx, y + Math.floor((h - 8) / 2), { font, color });
  return over && pointer.clicked;
}

/** Cinematic letterbox bars, 0..1 */
export function letterbox(ctx: CanvasRenderingContext2D, t: number, size = 34) {
  const s = Math.round(size * t);
  if (s <= 0) return;
  ctx.fillStyle = "#000";
  ctx.fillRect(0, 0, W, s);
  ctx.fillRect(0, H - s, W, s);
}

export function vignette(ctx: CanvasRenderingContext2D, strength = 0.6, color = "0,0,0") {
  const g = ctx.createRadialGradient(W / 2, H / 2, H * 0.3, W / 2, H / 2, H * 0.95);
  g.addColorStop(0, `rgba(${color},0)`);
  g.addColorStop(1, `rgba(${color},${strength})`);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
}

/** Subtle animated film grain drawn from a cached noise tile. */
let grainTiles: HTMLCanvasElement[] = [];
export function grain(ctx: CanvasRenderingContext2D, alpha = 0.06) {
  if (!grainTiles.length) {
    for (let k = 0; k < 4; k++) {
      const c = document.createElement("canvas");
      c.width = 128; c.height = 128;
      const g = c.getContext("2d")!;
      const img = g.createImageData(128, 128);
      for (let i = 0; i < img.data.length; i += 4) {
        const v = Math.random() * 255;
        img.data[i] = img.data[i + 1] = img.data[i + 2] = v;
        img.data[i + 3] = Math.random() < 0.5 ? 255 : 0;
      }
      g.putImageData(img, 0, 0);
      grainTiles.push(c);
    }
  }
  const tile = grainTiles[Math.floor(time * 12) % 4];
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.globalCompositeOperation = "overlay";
  for (let y = 0; y < H; y += 128) for (let x = 0; x < W; x += 128) ctx.drawImage(tile, x, y);
  ctx.restore();
}

export interface Subtitle {
  speaker: string;
  text: string;
  t: number;
  dur: number;
  color: string;
}

export function drawSubtitle(ctx: CanvasRenderingContext2D, s: Subtitle | null, y = H - 58) {
  if (!s) return;
  const chars = Math.floor(s.t * 55);
  const a = Math.min(1, s.t * 6, Math.max(0, s.dur - s.t) * 3);
  if (a <= 0) return;
  ctx.save();
  ctx.globalAlpha = a;
  const w = 420;
  const x = (W - w) / 2;
  text(ctx, s.speaker.toUpperCase(), W / 2, y - 12, { font: "small", color: s.color, align: "center" });
  para(ctx, s.text, x, y, w, { align: "left", chars, color: COL.paper });
  ctx.restore();
}

// ---------- floating combat text & particles ----------
interface Float { x: number; y: number; text: string; color: string; t: number; font: FontId }
const floats: Float[] = [];

export function floatText(x: number, y: number, str: string, color = COL.gold, font: FontId = "title") {
  floats.push({ x, y, text: str, color, t: 0, font });
}

export function drawFloats(ctx: CanvasRenderingContext2D, dt: number) {
  for (let i = floats.length - 1; i >= 0; i--) {
    const f = floats[i];
    f.t += dt;
    if (f.t > 1.6) {
      floats.splice(i, 1);
      continue;
    }
    const pop = f.t < 0.12 ? 1 + (0.12 - f.t) * 4 : 1;
    text(ctx, f.text, f.x, f.y - f.t * 22 * pop, { font: f.font, color: f.color, align: "center", alpha: Math.min(1, (1.6 - f.t) * 2) });
  }
}

export function clearFloats() {
  floats.length = 0;
}
