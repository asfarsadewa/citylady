// Vela: a painted sprite atlas (54 frames) with physics-driven secondary motion.
// A damped spring reacts to acceleration and wind; rows behind her torso (hair, coat tail)
// are displaced by it so the hair keeps flowing between the painted frames.
import { img } from "../engine/core";
import atlasMeta from "../data/vela_atlas.json";

type Clip = "idle" | "wind" | "stop" | "start" | "walk" | "run" | "turn" | "toss" | "enter" | "read";
const META = atlasMeta as { cell: number[]; anchor: number[]; clips: Record<Clip, number[]>; cols: number };
const [CW, CH] = META.cell;
const [AX, AY] = META.anchor;
const FPS: Record<Clip, number> = { idle: 5, wind: 6, stop: 9, start: 0, walk: 0, run: 0, turn: 16, toss: 9, enter: 7, read: 2 };
const STANDING: Clip[] = ["idle", "wind", "stop", "toss", "read"];

export class Vela {
  x: number;
  y: number;
  facing = 1;
  speed = 0;
  alpha = 1;
  wind = 0.6;
  /** street light colour graded over the sprite */
  tint = "#ffffff";
  tintStrength = 0;
  onStep: (() => void) | null = null;

  private clip: Clip = "wind";
  private frame = 0; // float frame index inside the clip
  private t = 0;
  private idleT = 0;
  private turnFrom = 1;
  private sway = 0;
  private swayV = 0;
  private lastVx = 0;
  private cell = document.createElement("canvas");
  private warped = document.createElement("canvas");
  private lastStepFrame = -1;

  constructor(x: number, y: number) {
    this.x = x;
    this.y = y;
    this.cell.width = this.warped.width = CW;
    this.cell.height = this.warped.height = CH;
    this.cell.getContext("2d", { willReadFrequently: true });
  }

  /** Plays the back-view door entrance once. */
  playEnter() {
    this.setClip("enter");
  }

  /** Back on the street after a shop: face the camera side again and idle. */
  standUp() {
    this.setClip("wind");
    this.alpha = 1;
  }

  private setClip(c: Clip) {
    if (this.clip === c) return;
    this.clip = c;
    this.frame = 0;
    this.lastStepFrame = -1;
  }

  update(dt: number, vx: number) {
    this.t += dt;
    this.speed = Math.abs(vx);
    const dir = vx > 0 ? 1 : vx < 0 ? -1 : 0;
    // physics: acceleration throws the hair against the motion, wind keeps it alive
    const acc = (vx - this.lastVx) / Math.max(dt, 1e-3);
    this.lastVx = vx;
    // all in her local frame: negative = behind her
    const target = -this.speed * 0.045 - this.wind * 1.2 * this.facing;
    this.swayV += ((target - this.sway) * 38 - this.swayV * 5.5 - acc * this.facing * 0.012) * dt;
    this.sway += this.swayV * dt;
    this.sway = Math.max(-9, Math.min(9, this.sway));

    if (this.clip === "enter") {
      this.frame = Math.min(META.clips.enter.length - 0.01, this.frame + dt * FPS.enter);
      return;
    }
    if (dir !== 0 && dir !== this.facing && this.clip !== "turn") {
      this.turnFrom = this.facing;
      this.facing = dir;
      this.setClip("turn");
    }
    if (this.clip === "turn") {
      this.frame += dt * FPS.turn;
      this.x += vx * dt * 0.4;
      if (this.frame >= META.clips.turn.length) this.setClip(dir ? "walk" : "wind");
      return;
    }
    this.x += vx * dt;
    if (dir !== 0) {
      this.idleT = 0;
      const run = this.speed > 80;
      // from a standstill, the start clip carries her into the stride with her hair lagging behind
      if (!run && STANDING.includes(this.clip)) this.setClip("start");
      if (this.clip === "start") {
        this.frame += (this.speed * dt * 4) / 40;
        if (this.frame >= META.clips.start.length) this.setClip("walk");
        return;
      }
      this.setClip(run ? "run" : "walk");
      // advance by distance so feet do not slide: a walk cycle (two steps) measures ~78 px in the atlas
      const n = META.clips[this.clip].length;
      this.frame = (this.frame + (this.speed * dt * n) / (run ? 88 : 78)) % n;
      const contact = [0, 4]; // heel strikes: frames 1 and 5 of both 8-frame cycles
      const f = Math.floor(this.frame);
      if (contact.includes(f) && this.lastStepFrame !== f) this.onStep?.();
      this.lastStepFrame = f;
      return;
    }
    // standing still
    if (this.clip === "walk" || this.clip === "run" || this.clip === "start") this.setClip("stop");
    const n = META.clips[this.clip].length;
    if (this.clip === "stop") {
      this.frame += dt * FPS.stop;
      if (this.frame >= n) this.setClip("wind");
    } else if (this.clip === "toss" || this.clip === "read") {
      this.frame += dt * FPS[this.clip];
      if (this.clip === "toss" && this.frame >= n) this.setClip("wind");
      if (this.clip === "read" && this.frame >= n + 3) this.setClip("wind");
    } else {
      // the wind loop is her resting state; the calmer breathing loop and gestures break it up
      this.idleT += dt;
      this.frame = (this.frame + dt * FPS[this.clip]) % n;
      if (this.idleT > 8) {
        this.idleT = -4;
        const r = Math.random();
        this.setClip(r < 0.4 ? "toss" : r < 0.6 ? "read" : this.clip === "wind" ? "idle" : "wind");
      }
    }
  }

  private frameIndex(): { index: number; flip: boolean } {
    const list = META.clips[this.clip];
    let f = Math.min(list.length - 1, Math.floor(this.frame));
    if (this.clip === "read") f = Math.min(1, f);
    if (this.clip === "turn") {
      // the painted turn goes right -> left; play it backwards for left -> right
      if (this.turnFrom < 0) f = list.length - 1 - f;
      return { index: list[f], flip: false };
    }
    if (this.clip === "enter") return { index: list[f], flip: false };
    return { index: list[f], flip: this.facing < 0 };
  }

  draw(ctx: CanvasRenderingContext2D, sx: number, sy: number) {
    const atlas = img("vela_atlas");
    if (!atlas) return;
    const { index, flip } = this.frameIndex();
    const fx = (index % META.cols) * CW, fy = Math.floor(index / META.cols) * CH;
    const g = this.cell.getContext("2d")!;
    g.clearRect(0, 0, CW, CH);
    g.imageSmoothingEnabled = false;
    g.drawImage(atlas, fx, fy, CW, CH, 0, 0, CW, CH);
    if (this.tintStrength > 0) {
      g.globalCompositeOperation = "source-atop";
      g.globalAlpha = this.tintStrength;
      g.fillStyle = this.tint;
      g.fillRect(0, 0, CW, CH);
      g.globalAlpha = 1;
      g.globalCompositeOperation = "source-over";
    }
    // secondary motion: inverse-mapped horizontal displacement, so no pixel is ever left empty.
    // The weight is 1 behind her back and fades to 0 before the torso, keeping the body rigid.
    const secondary = this.clip !== "enter" && this.clip !== "turn";
    let out: HTMLCanvasElement = this.cell;
    if (secondary) {
      const src = g.getImageData(0, 0, CW, CH);
      const w = this.warped.getContext("2d")!;
      const dst = w.createImageData(CW, CH);
      const s32 = new Uint32Array(src.data.buffer), d32 = new Uint32Array(dst.data.buffer);
      const fadeEnd = AX - 4, fadeStart = AX - 18;
      for (let y = 0; y < CH; y++) {
        const k = y < 20 ? y / 20 : y < 70 ? 1 : Math.max(0, 1 - (y - 70) / 30) * 0.6;
        const flutter = Math.sin(this.t * 3.2 + y * 0.09) * (0.6 + this.wind * 0.9) * (y / CH);
        const off = (this.sway * (y / CH) * 1.4 + flutter) * k;
        const row = y * CW;
        for (let x = 0; x < CW; x++) {
          const wgt = x <= fadeStart ? 1 : x >= fadeEnd ? 0 : (fadeEnd - x) / (fadeEnd - fadeStart);
          const sx = Math.round(x - off * wgt);
          d32[row + x] = sx >= 0 && sx < CW ? s32[row + sx] : 0;
        }
      }
      w.putImageData(dst, 0, 0);
      out = this.warped;
    }
    ctx.save();
    ctx.globalAlpha = this.alpha;
    ctx.imageSmoothingEnabled = false;
    const ox = Math.round(sx), oy = Math.round(sy) - AY;
    if (flip) {
      ctx.translate(ox, 0);
      ctx.scale(-1, 1);
      ctx.drawImage(out, -AX, oy);
    } else ctx.drawImage(out, ox - AX, oy);
    ctx.restore();
  }
}
