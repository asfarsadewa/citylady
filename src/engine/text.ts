// Crisp bitmap text: each glyph is rasterised on first use and alpha-thresholded, so any
// script works (Latin, CJK). Fonts and metrics switch per language.
import { lang, onLangChange, type Lang } from "../i18n";

export type FontId = "body" | "bold" | "title" | "small" | "big" | "logo" | "logoSmall";

interface Face { family: string; size: number; weight: number; lh: number }

const LATIN_LOGO = (size: number): Face => ({ family: "Jersey10", size, weight: 400, lh: size === 60 ? 52 : 18 });
const LATIN: Record<FontId, Face> = {
  body: { family: "Pixelify", size: 11, weight: 400, lh: 13 },
  bold: { family: "Pixelify", size: 11, weight: 700, lh: 13 },
  small: { family: "Tiny5", size: 10, weight: 400, lh: 9 },
  title: { family: "Jersey10", size: 20, weight: 400, lh: 18 },
  big: { family: "Jersey10", size: 60, weight: 400, lh: 52 },
  logo: { family: "Jersey10", size: 60, weight: 400, lh: 52 },
  logoSmall: { family: "Jersey10", size: 20, weight: 400, lh: 18 },
};
// Fusion Pixel is drawn on 12 px and 10 px grids: use those sizes or exact multiples to stay sharp
const CJK: Record<FontId, Face> = {
  body: { family: "Fusion12", size: 12, weight: 400, lh: 15 },
  bold: { family: "Fusion12", size: 12, weight: 400, lh: 15 },
  small: { family: "Fusion10", size: 10, weight: 400, lh: 12 },
  title: { family: "Fusion12", size: 24, weight: 400, lh: 26 },
  big: { family: "Fusion12", size: 48, weight: 400, lh: 50 },
  // the CITY LADY wordmark is a brand: same letterforms in every language
  logo: LATIN_LOGO(60),
  logoSmall: LATIN_LOGO(20),
};
const facesFor = (l: Lang) => (l === "zh" ? CJK : LATIN);

interface Glyph { c: HTMLCanvasElement; w: number }
interface Atlas { face: Face; font: string; h: number; base: number; capTop: number; glyphs: Map<string, Glyph>; tinted: Map<string, HTMLCanvasElement> }

let atlases = new Map<FontId, Atlas>();
const measureCtx = document.createElement("canvas").getContext("2d")!;

export async function loadFonts() {
  const faces = [
    new FontFace("Pixelify", "url(fonts/pixelify.woff2)", { weight: "400 700" }),
    new FontFace("Jersey10", "url(fonts/jersey10.woff2)"),
    new FontFace("Tiny5", "url(fonts/tiny5.woff2)"),
    new FontFace("Fusion12", "url(fonts/fusion12.woff2)"),
    new FontFace("Fusion10", "url(fonts/fusion10.woff2)"),
  ];
  for (const f of faces) {
    await f.load();
    document.fonts.add(f);
  }
  rebuild();
  onLangChange(rebuild);
}

function rebuild() {
  atlases = new Map();
  const faces = facesFor(lang());
  for (const id of Object.keys(faces) as FontId[]) {
    const face = faces[id];
    const font = `${face.weight} ${face.size}px ${face.family}`;
    const a: Atlas = { face, font, h: Math.ceil(face.size * 1.5), base: Math.round(face.size * 1.15), capTop: 0, glyphs: new Map(), tinted: new Map() };
    atlases.set(id, a);
    // position text by the top of a capital letter
    const g = glyph(a, "H", id);
    const d = g.c.getContext("2d")!.getImageData(0, 0, g.c.width, g.c.height).data;
    outer: for (let y = 0; y < g.c.height; y++) {
      for (let x = 0; x < g.c.width; x++) if (d[(y * g.c.width + x) * 4 + 3]) { a.capTop = y; break outer; }
    }
  }
}

function glyph(a: Atlas, ch: string, id: FontId): Glyph {
  let g = a.glyphs.get(ch);
  if (g) return g;
  measureCtx.font = a.font;
  const w = Math.max(1, Math.round(measureCtx.measureText(ch).width));
  const c = document.createElement("canvas");
  c.width = w + 2;
  c.height = a.h;
  const ctx = c.getContext("2d", { willReadFrequently: true })!;
  ctx.font = a.font;
  ctx.fillStyle = "#fff";
  ctx.textBaseline = "alphabetic";
  ctx.fillText(ch, 0, a.base);
  const img = ctx.getImageData(0, 0, c.width, c.height);
  const cut = id === "big" || id === "title" || id === "logo" || id === "logoSmall" ? 110 : 120;
  for (let i = 3; i < img.data.length; i += 4) img.data[i] = img.data[i] >= cut ? 255 : 0;
  ctx.putImageData(img, 0, 0);
  g = { c, w };
  a.glyphs.set(ch, g);
  return g;
}

function tintedGlyph(a: Atlas, g: Glyph, ch: string, color: string): HTMLCanvasElement {
  const key = ch + "\u0000" + color;
  let t = a.tinted.get(key);
  if (!t) {
    t = document.createElement("canvas");
    t.width = g.c.width;
    t.height = g.c.height;
    const ctx = t.getContext("2d")!;
    ctx.drawImage(g.c, 0, 0);
    ctx.globalCompositeOperation = "source-in";
    ctx.fillStyle = color;
    ctx.fillRect(0, 0, t.width, t.height);
    a.tinted.set(key, t);
  }
  return t;
}

export function lineHeight(id: FontId) {
  return facesFor(lang())[id].lh;
}

export function measure(str: string, id: FontId = "body"): number {
  const a = atlases.get(id);
  if (!a) return str.length * 6;
  let w = 0;
  for (const ch of str) w += glyph(a, ch, id).w;
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
  const color = o.color ?? "#f4e9dc";
  let n = 0;
  for (const ch of str) {
    if (o.chars !== undefined && n++ >= o.chars) break;
    const g = glyph(a, ch, id);
    if (ch !== " ") {
      if (shadow) ctx.drawImage(tintedGlyph(a, g, ch, shadow), cx + 1, cy + 1);
      ctx.drawImage(tintedGlyph(a, g, ch, color), cx, cy);
    }
    cx += g.w;
  }
  ctx.globalAlpha = prev;
}

const CJK_CHAR = /[⺀-鿿豈-﫿＀-￯　-〿]/;
// closing punctuation must not start a line (kinsoku)
const NO_START = /^[，。、：；！？）」』”’%·…]/;

/** Splits into wrap units: Latin words keep their trailing space; each CJK character stands alone. */
function units(para: string): string[] {
  const out: string[] = [];
  let word = "";
  for (const ch of para) {
    if (CJK_CHAR.test(ch)) {
      if (word) { out.push(word); word = ""; }
      if (NO_START.test(ch) && out.length) out[out.length - 1] += ch;
      else out.push(ch);
    } else if (ch === " ") {
      out.push(word + " ");
      word = "";
    } else if (!word && NO_START.test(ch) && out.length) {
      // closing quotes and marks after CJK text stay on the same line
      out[out.length - 1] += ch;
    } else word += ch;
  }
  if (word) out.push(word);
  return out;
}

export function wrap(str: string, maxW: number, id: FontId = "body"): string[] {
  const out: string[] = [];
  for (const para of str.split("\n")) {
    let line = "";
    for (const u of units(para)) {
      const next = line + u;
      if (measure(next.trimEnd(), id) > maxW && line.trim()) {
        out.push(line.trimEnd());
        line = u.trimStart();
      } else line = next;
    }
    out.push(line.trimEnd());
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
    left -= [...ln].length + 1;
  });
  return lines.length * lineHeight(id);
}
