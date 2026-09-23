// Crisp bitmap text: glyphs from pixel fonts are rasterised once and alpha-thresholded.

export type FontId = "body" | "bold" | "title" | "small" | "big";

const FONTS: Record<FontId, { family: string; size: number; weight: number; lh: number }> = {
  body: { family: "Pixelify", size: 11, weight: 400, lh: 13 },
  bold: { family: "Pixelify", size: 11, weight: 700, lh: 13 },
  small: { family: "Tiny5", size: 10, weight: 400, lh: 9 },
  title: { family: "Jersey10", size: 20, weight: 400, lh: 18 },
  big: { family: "Jersey10", size: 60, weight: 400, lh: 52 },
};

interface Atlas {
  canvas: HTMLCanvasElement;
  glyphs: Map<string, { x: number; w: number }>;
  h: number;
  base: number;
  /** first opaque row of a capital letter: text is positioned by its cap top */
  capTop: number;
}

const atlases = new Map<FontId, Atlas>();
const tinted = new Map<string, HTMLCanvasElement>();
const CHARS = Array.from({ length: 95 }, (_, i) => String.fromCharCode(32 + i)).join("") + "—–’“”…·•€£¥₵×÷←→↑↓♥★";

export async function loadFonts() {
  const faces = [
    new FontFace("Pixelify", "url(fonts/pixelify.woff2)", { weight: "400 700" }),
    new FontFace("Jersey10", "url(fonts/jersey10.woff2)"),
    new FontFace("Tiny5", "url(fonts/tiny5.woff2)"),
  ];
  for (const f of faces) {
    await f.load();
    document.fonts.add(f);
  }
  for (const id of Object.keys(FONTS) as FontId[]) atlases.set(id, build(id));
}

function build(id: FontId): Atlas {
  const f = FONTS[id];
  const font = `${f.weight} ${f.size}px ${f.family}`;
  const m = document.createElement("canvas").getContext("2d")!;
  m.font = font;
  const h = Math.ceil(f.size * 1.4);
  const base = Math.round(f.size * 1.05);
  let total = 0;
  const widths: number[] = [];
  for (const ch of CHARS) {
    const w = Math.max(1, Math.round(m.measureText(ch).width));
    widths.push(w);
    total += w + 2;
  }
  const c = document.createElement("canvas");
  c.width = total;
  c.height = h;
  const ctx = c.getContext("2d")!;
  ctx.font = font;
  ctx.fillStyle = "#fff";
  ctx.textBaseline = "alphabetic";
  const glyphs = new Map<string, { x: number; w: number }>();
  let x = 0;
  [...CHARS].forEach((ch, i) => {
    ctx.fillText(ch, x, base);
    glyphs.set(ch, { x, w: widths[i] });
    x += widths[i] + 2;
  });
  const img = ctx.getImageData(0, 0, c.width, c.height);
  const cut = id === "big" || id === "title" ? 110 : 120;
  for (let i = 3; i < img.data.length; i += 4) img.data[i] = img.data[i] >= cut ? 255 : 0;
  ctx.putImageData(img, 0, 0);
  const H_ = glyphs.get("H")!;
  let capTop = 0;
  outer: for (let y = 0; y < h; y++) {
    for (let x = H_.x; x < H_.x + H_.w; x++) if (img.data[(y * c.width + x) * 4 + 3]) { capTop = y; break outer; }
  }
  return { canvas: c, glyphs, h, base, capTop };
}

function tint(id: FontId, color: string): HTMLCanvasElement {
  const key = id + color;
  let t = tinted.get(key);
  if (!t) {
    const a = atlases.get(id)!;
    t = document.createElement("canvas");
    t.width = a.canvas.width;
    t.height = a.canvas.height;
    const ctx = t.getContext("2d")!;
    ctx.drawImage(a.canvas, 0, 0);
    ctx.globalCompositeOperation = "source-in";
    ctx.fillStyle = color;
    ctx.fillRect(0, 0, t.width, t.height);
    tinted.set(key, t);
  }
  return t;
}

export function lineHeight(id: FontId) {
  return FONTS[id].lh;
}

export function measure(str: string, id: FontId = "body"): number {
  const a = atlases.get(id);
  if (!a) return str.length * 6;
  let w = 0;
  for (const ch of str) w += a.glyphs.get(ch)?.w ?? a.glyphs.get("?")!.w;
  return w;
}

export interface TextOpts {
  font?: FontId;
  color?: string;
  align?: "left" | "center" | "right";
  shadow?: string | null;
  alpha?: number;
  /** Reveal only the first n characters (typewriter). */
  chars?: number;
}

/** Draws text with its top-left (or top-centre/right) at x,y. */
export function text(ctx: CanvasRenderingContext2D, str: string, x: number, y: number, o: TextOpts = {}) {
  const id = o.font ?? "body";
  const a = atlases.get(id);
  if (!a) return;
  const w = measure(str, id);
  let cx = Math.round(o.align === "center" ? x - w / 2 : o.align === "right" ? x - w : x);
  const cy = Math.round(y - a.capTop);
  const prev = ctx.globalAlpha;
  if (o.alpha !== undefined) ctx.globalAlpha = prev * o.alpha;
  const shadow = o.shadow === undefined ? "#0b0714" : o.shadow;
  const sheet = tint(id, o.color ?? "#f4e9dc");
  const shadowSheet = shadow ? tint(id, shadow) : null;
  let n = 0;
  for (const ch of str) {
    if (o.chars !== undefined && n++ >= o.chars) break;
    const g = a.glyphs.get(ch) ?? a.glyphs.get("?")!;
    if (shadowSheet) ctx.drawImage(shadowSheet, g.x, 0, g.w, a.h, cx + 1, cy + 1, g.w, a.h);
    ctx.drawImage(sheet, g.x, 0, g.w, a.h, cx, cy, g.w, a.h);
    cx += g.w;
  }
  ctx.globalAlpha = prev;
}

export function wrap(str: string, maxW: number, id: FontId = "body"): string[] {
  const out: string[] = [];
  for (const para of str.split("\n")) {
    let line = "";
    for (const word of para.split(" ")) {
      const next = line ? line + " " + word : word;
      if (measure(next, id) > maxW && line) {
        out.push(line);
        line = word;
      } else line = next;
    }
    out.push(line);
  }
  return out;
}

/** Draws wrapped text; returns the total height used. */
export function para(ctx: CanvasRenderingContext2D, str: string, x: number, y: number, maxW: number, o: TextOpts = {}): number {
  const id = o.font ?? "body";
  const lines = wrap(str, maxW, id);
  let left = o.chars ?? Infinity;
  const lx = o.align === "center" ? x + maxW / 2 : x;
  lines.forEach((ln, i) => {
    if (left <= 0) return;
    text(ctx, ln, lx, y + i * lineHeight(id), { ...o, chars: left === Infinity ? undefined : left });
    left -= ln.length + 1;
  });
  return lines.length * lineHeight(id);
}
