// Letterboxed cutscenes: slow camera moves over key art with voiced lines and weather.
import { W, H, img, input, pointer, ease, lerp, type Scene } from "../engine/core";
import { audio } from "../engine/audio";
import { text, para } from "../engine/text";
import { WeatherFx } from "../game/weather";
import type { Weather } from "../game/data";
import { COL, letterbox, vignette, grain } from "../ui/widgets";
import voiceData from "../data/voice.json";

const VOICE = voiceData as Record<string, { s: string; t: string }>;
const NAMES: Record<string, string> = { vela: "Vela", banker: "Madame Hale" };

export interface Shot {
  img: string;
  /** camera start/end: x,y in -1..1 across the spare image area, z zoom (1 = cover) */
  from: [number, number, number];
  to: [number, number, number];
  dur?: number;
  line?: string;
  title?: string;
  sub?: string;
  weather?: Weather;
  sfx?: string;
}

export class CinematicScene implements Scene {
  private i = -1;
  private t = 0;
  private dur = 4;
  private fx: WeatherFx | null = null;
  private cross = 0;
  private prev: Shot | null = null;
  private done = false;

  constructor(private shots: Shot[], private onDone: () => void, private music: string | null = null) {}

  enter() {
    if (this.music) audio.playMusic(this.music, 2);
    audio.playAmb(null);
    this.next();
  }

  private async next() {
    this.prev = this.shots[this.i] ?? null;
    this.i++;
    if (this.i >= this.shots.length) {
      if (!this.done) {
        this.done = true;
        this.onDone();
      }
      return;
    }
    const s = this.shots[this.i];
    this.t = 0;
    this.cross = this.prev ? 0 : 1;
    this.dur = s.dur ?? 4.5;
    this.fx = s.weather ? new WeatherFx(s.weather, 0.8, H + 40) : null;
    if (s.sfx) audio.sfx(s.sfx, { vol: 0.8 });
    if (s.line) {
      const d = await audio.voice(s.line);
      if (d) this.dur = Math.max(this.dur, d + 1.2);
    }
  }

  update(dt: number) {
    this.t += dt;
    this.cross = Math.min(1, this.cross + dt * 1.2);
    this.fx?.update(dt);
    if (input.pressed("back")) {
      audio.stopVoice();
      this.i = this.shots.length;
      this.next();
      return;
    }
    const skip = (input.pressed("ok") || pointer.clicked) && this.t > 0.6;
    if (skip) audio.stopVoice();
    if (this.t >= this.dur || skip) this.next();
  }

  private drawShot(ctx: CanvasRenderingContext2D, s: Shot, t: number, alpha: number) {
    const im = img(s.img);
    if (!im) return;
    const k = ease(Math.min(1, t));
    const z = lerp(s.from[2], s.to[2], k);
    const cover = Math.max(W / im.width, H / im.height) * z;
    const dw = im.width * cover, dh = im.height * cover;
    const x = lerp(s.from[0], s.to[0], k), y = lerp(s.from[1], s.to[1], k);
    const ox = (W - dw) / 2 + (x * (dw - W)) / 2;
    const oy = (H - dh) / 2 + (y * (dh - H)) / 2;
    ctx.globalAlpha = alpha;
    ctx.drawImage(im, Math.round(ox), Math.round(oy), Math.round(dw), Math.round(dh));
    ctx.globalAlpha = 1;
  }

  draw(ctx: CanvasRenderingContext2D) {
    const s = this.shots[Math.min(this.i, this.shots.length - 1)];
    if (!s) return;
    if (this.prev && this.cross < 1) this.drawShot(ctx, this.prev, 1, 1);
    this.drawShot(ctx, s, this.t / this.dur, this.cross);
    this.fx?.draw(ctx);
    vignette(ctx, 0.65);
    letterbox(ctx, 1, 40);
    if (s.title) {
      const a = Math.min(1, this.t * 1.5, (this.dur - this.t) * 2);
      text(ctx, s.title, W / 2, H / 2 - 30, { font: "big", color: COL.paper, align: "center", alpha: a });
      if (s.sub) text(ctx, s.sub, W / 2, H / 2 + 26, { font: "title", color: COL.gold, align: "center", alpha: a });
    }
    if (s.line && VOICE[s.line]) {
      const v = VOICE[s.line];
      const a = Math.min(1, this.t * 4, (this.dur - this.t) * 3);
      ctx.globalAlpha = Math.max(0, a);
      text(ctx, (NAMES[v.s] ?? v.s).toUpperCase(), W / 2, H - 36, { font: "small", color: v.s === "vela" ? COL.crimson : COL.gold, align: "center" });
      para(ctx, v.t, 110, H - 26, 420, { chars: Math.floor(this.t * 45), color: COL.paper, align: "center" });
      ctx.globalAlpha = 1;
    }
    text(ctx, "Skip: ESC", W - 8, 6, { font: "small", color: "#6e6380", align: "right" });
    grain(ctx, 0.07);
  }
}
