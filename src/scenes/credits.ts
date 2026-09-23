// End credits: Vela walks through all ten districts at dawn while the credits roll to "Lampu Kota".
import { W, H, img, input, pointer, type Scene } from "../engine/core";
import { audio } from "../engine/audio";
import { text, lineHeight } from "../engine/text";
import { DISTRICTS } from "../game/data";
import { Vela } from "../game/vela";
import { WeatherFx } from "../game/weather";
import { COL, letterbox, vignette, grain } from "../ui/widgets";
import { t, type Key } from "../i18n";

type Line =
  | { kind: "head"; text: string }
  | { kind: "item"; label: string; value: string }
  | { kind: "cast"; portrait: string; role: string }
  | { kind: "gap"; size: number }
  | { kind: "title"; text: string; sub: string };

const CAST = ["d_banker", "d_baker", "d_tailor", "d_chef", "d_pawn", "d_florist", "d_books", "d_apothecary", "d_jeweler",
  "d_teahouse", "d_records", "d_barber", "d_fish", "d_clock", "d_cabaret", "d_mechanic", "d_father"];

function roll(ending: string): Line[] {
  const L: Line[] = [
    { kind: "title", text: "CITY LADY", sub: ending },
    { kind: "gap", size: 40 },
    { kind: "head", text: t("name.vela").toUpperCase() },
    { kind: "item", label: t("cr.voice"), value: "Gemini TTS, Despina" },
    { kind: "gap", size: 16 },
    { kind: "head", text: t("cr.cast") },
    ...CAST.map((portrait) => ({ kind: "cast" as const, portrait, role: t(`role.${portrait}` as Key) })),
    { kind: "gap", size: 16 },
    { kind: "head", text: t("cr.art") },
    { kind: "item", label: t("cr.art.world"), value: "Qwen-Image 2.1" },
    { kind: "item", label: t("cr.art.sprites"), value: "GPT Image 2.5 Sunburst" },
    { kind: "item", label: t("cr.art.pixel"), value: t("cr.art.pixel.v") },
    { kind: "gap", size: 16 },
    { kind: "head", text: t("cr.music") },
    { kind: "item", label: "City Lady", value: "YuE2" },
    { kind: "item", label: "Night Walk", value: "YuE2" },
    { kind: "item", label: "The Ledger", value: "YuE2" },
    { kind: "item", label: "Dawn", value: "YuE2" },
    { kind: "item", label: "Lampu Kota", value: "YuE2" },
    { kind: "gap", size: 16 },
    { kind: "head", text: t("cr.sound") },
    { kind: "item", label: t("cr.sfx"), value: "ElevenLabs" },
    { kind: "item", label: t("cr.voices"), value: "Gemini TTS" },
    { kind: "gap", size: 16 },
    { kind: "head", text: t("cr.ai") },
    { kind: "item", label: t("cr.ai.v"), value: "TypeSafe Jev" },
    { kind: "gap", size: 16 },
    { kind: "head", text: t("cr.engine") },
    { kind: "item", label: t("cr.code"), value: "TypeScript, Canvas, WebGL" },
    { kind: "item", label: t("cr.hosting"), value: "Cloudflare Workers" },
    { kind: "item", label: t("cr.fonts"), value: "Pixelify Sans, Jersey 10, Tiny5, Fusion Pixel" },
    { kind: "gap", size: 70 },
    { kind: "title", text: t("cr.thanks"), sub: t("cr.thanks.sub") },
  ];
  return L;
}

// row heights follow the active font metrics, so taller CJK glyphs get room
const height = (k: Line["kind"]) =>
  k === "head" ? lineHeight("title") + 4 : k === "item" ? lineHeight("body") + 2 : k === "cast" ? 34 : k === "title" ? 62 : 0;

export class CreditsScene implements Scene {
  private t = 0;
  private scroll = -H + 40;
  private lines: Line[];
  private total: number;
  private vela = new Vela(0, 0);
  private fx = new WeatherFx("lanterns", 0.5, H + 40);
  private done = false;

  constructor(ending: string, private onDone: () => void) {
    this.lines = roll(ending);
    this.total = this.lines.reduce((s, l) => s + (l.kind === "gap" ? l.size : height(l.kind)), 0);
    this.vela.wind = 0.9;
  }

  enter() {
    audio.playMusic("mus_credits", 2.5);
    audio.playAmb("amb_city", 3);
  }

  update(dt: number) {
    this.t += dt;
    // ~13 px/s lands the final card as "Lampu Kota" (126 s) comes to its close
    this.scroll += dt * 13 * (input.down("ok") ? 4 : 1);
    this.fx.update(dt);
    // she walks in place while the city scrolls past behind her
    this.vela.update(dt, 58);
    this.vela.x = 0;
    const end = this.scroll > this.total + 40;
    if ((end || input.pressed("back") || (pointer.clicked && this.t > 2)) && !this.done) {
      this.done = true;
      audio.playMusic(null, 3);
      this.onDone();
    }
  }

  draw(ctx: CanvasRenderingContext2D) {
    // district montage: each skyline pans for 8 seconds, crossfading into the next
    const seg = 8;
    const i = Math.floor(this.t / seg) % DISTRICTS.length;
    const k = (this.t % seg) / seg;
    const drawSky = (idx: number, u: number, a: number) => {
      const sky = img(DISTRICTS[idx].sky);
      if (!sky) return;
      ctx.globalAlpha = a;
      ctx.drawImage(sky, Math.round(-(sky.width - W) * u), 0);
      ctx.globalAlpha = 1;
    };
    drawSky(i, k, 1);
    if (k > 0.8) drawSky((i + 1) % DISTRICTS.length, 0, (k - 0.8) / 0.2);
    const name = t(`district.${DISTRICTS[i].id}` as Key).toUpperCase();
    text(ctx, name, 26, H - 52, { font: "small", color: COL.gold, alpha: Math.min(1, k * 6, (1 - k) * 6) });
    // ground and Vela
    ctx.fillStyle = "rgba(6,4,12,0.85)";
    ctx.fillRect(0, H - 44, W, 44);
    this.fx.draw(ctx);
    this.vela.draw(ctx, 150, H - 44);
    // a dark band behind the credits column keeps them readable over bright skies
    const g = ctx.createLinearGradient(W * 0.42, 0, W, 0);
    g.addColorStop(0, "rgba(6,4,12,0)");
    g.addColorStop(0.35, "rgba(6,4,12,0.65)");
    g.addColorStop(1, "rgba(6,4,12,0.8)");
    ctx.fillStyle = g;
    ctx.fillRect(W * 0.42, 0, W * 0.58, H);
    // the roll
    const cx = 470;
    let y = -this.scroll;
    for (const l of this.lines) {
      const h = l.kind === "gap" ? l.size : height(l.kind);
      if (y > -70 && y < H + 10) {
        const fade = Math.min(1, (y + 40) / 60, (H - 50 - y) / 60);
        if (fade > 0) {
          if (l.kind === "title") {
            text(ctx, l.text, cx, y, { font: l.text === "CITY LADY" ? "logo" : "big", color: COL.paper, align: "center", alpha: fade });
            text(ctx, l.sub.toUpperCase(), cx, y + 46, { font: "small", color: COL.gold, align: "center", alpha: fade });
          } else if (l.kind === "head") {
            text(ctx, l.text, cx, y + 4, { font: "title", color: COL.crimson, align: "center", alpha: fade });
          } else if (l.kind === "item") {
            text(ctx, l.label, cx - 6, y, { font: "small", color: COL.dim, align: "right", alpha: fade });
            text(ctx, l.value, cx + 6, y, { color: COL.paper, alpha: fade });
          } else if (l.kind === "cast") {
            const p = img(l.portrait);
            ctx.globalAlpha = fade;
            // a smooth downscale keeps the tiny portraits readable instead of aliased
            ctx.imageSmoothingEnabled = true;
            if (p) ctx.drawImage(p, 40, 20, 160, 160, cx - 110, y, 30, 30);
            ctx.imageSmoothingEnabled = false;
            ctx.globalAlpha = 1;
            text(ctx, l.role, cx - 72, y + 11, { color: COL.paper, alpha: fade });
          }
        }
      }
      y += h;
    }
    vignette(ctx, 0.55);
    letterbox(ctx, 1, 22);
    grain(ctx, 0.06);
  }
}
