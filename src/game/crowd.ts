// Pedestrians: painted sprite characters at Vela's scale, graded into the night.
// Back-layer walkers pass behind her; a rare foreground walker crosses in front, dark as a silhouette.
import { img, W } from "../engine/core";
import npcMeta from "../data/npc_atlas.json";
import type { District } from "./data";
import type { Night } from "./state";

const META = npcMeta as { cell: number[]; anchor: number[]; cols: number; chars: Record<string, { frames: number[]; tags: string[] }> };
const [CW, CH] = META.cell;
const [AX, AY] = META.anchor;

// walking speed (px/s) and stride of one full cycle (px) per character, measured from their gait
const GAIT: Record<string, { speed: number; cycle: number }> = {
  umbrella_man: { speed: 38, cycle: 74 }, fur_lady: { speed: 28, cycle: 58 }, grocer: { speed: 44, cycle: 76 },
  raincoat: { speed: 46, cycle: 70 }, docker: { speed: 36, cycle: 78 }, suit: { speed: 62, cycle: 84 }, cat: { speed: 48, cycle: 30 },
};

interface Ped {
  cid: string;
  x: number;
  y: number;
  dir: number;
  speed: number;
  frame: number;
  front: boolean;
  idle: boolean;
}

export class Crowd {
  private peds: Ped[] = [];
  private tmp = document.createElement("canvas");
  private walkers: string[];
  private frontTimer = 9;
  private catTimer = 20;

  constructor(night: Night, private d: District, private groundY: number, private curbY: number) {
    this.tmp.width = CW;
    this.tmp.height = CH;
    const wet = d.weather === "rain" || d.weather === "snow";
    this.walkers = Object.keys(META.chars).filter((c) => {
      const tags = META.chars[c].tags;
      if (tags.includes("idle") || tags.includes("cat")) return false;
      return tags.includes("wet") ? wet : true;
    });
    // a smoker or two under the lamps, placed from the night seed so the street is stable
    const lamps = night.lamps;
    let smokers = 0;
    for (let i = 0; i < lamps.length && smokers < 2; i++) {
      if ((night.seed >> i) % 3 === 0) {
        smokers++;
        this.peds.push({ cid: "smoker", x: lamps[i] + 14, y: groundY + 5, dir: (night.seed >> (i + 3)) % 2 ? 1 : -1, speed: 0, frame: i * 2.3, front: false, idle: true });
      }
    }
    for (let i = 0; i < 7; i++) this.spawn(Math.random() * night.length, false);
  }

  private spawn(x: number | null, front: boolean, cam = 0) {
    // twins on the same stretch of pavement break the illusion: prefer someone not already in view
    const near = new Set(this.peds.filter((p) => Math.abs(p.x - (x ?? cam + W / 2)) < W).map((p) => p.cid));
    const fresh = this.walkers.filter((c) => !near.has(c));
    const pool = fresh.length ? fresh : this.walkers;
    const cid = pool[Math.floor(Math.random() * pool.length)];
    const dir = Math.random() < 0.5 ? 1 : -1;
    const g = GAIT[cid];
    this.peds.push({
      cid, dir, front, idle: false,
      x: x ?? (dir > 0 ? cam - 60 : cam + W + 60),
      y: front ? this.curbY + 6 : this.groundY + 4 + Math.round(Math.random() * 7),
      speed: g.speed * (0.9 + Math.random() * 0.2),
      frame: Math.random() * 8,
    });
  }

  update(dt: number, cam: number) {
    for (const p of this.peds) {
      if (p.idle) {
        p.frame = (p.frame + dt * 5) % 8;
        continue;
      }
      const g = GAIT[p.cid];
      p.x += p.dir * p.speed * dt;
      // frames advance with distance so feet stay planted on the pavement
      p.frame = (p.frame + (p.speed * dt * 8) / g.cycle) % 8;
    }
    this.peds = this.peds.filter((p) => p.idle || (p.x > cam - 140 && p.x < cam + W + 140));
    const back = this.peds.filter((p) => !p.idle && !p.front && p.cid !== "cat").length;
    if (back < 7) this.spawn(null, false, cam);
    this.frontTimer -= dt;
    if (this.frontTimer <= 0) {
      this.frontTimer = 14 + Math.random() * 16;
      this.spawn(null, true, cam);
    }
    this.catTimer -= dt;
    if (this.catTimer <= 0) {
      this.catTimer = 35 + Math.random() * 40;
      const dir = Math.random() < 0.5 ? 1 : -1;
      this.peds.push({ cid: "cat", x: dir > 0 ? cam - 30 : cam + W + 30, y: this.groundY + 12, dir, speed: GAIT.cat.speed, frame: 0, front: false, idle: false });
    }
  }

  /** layer "back" draws behind Vela, "front" in front of her */
  draw(ctx: CanvasRenderingContext2D, cam: number, layer: "back" | "front") {
    const atlas = img("npc_atlas");
    if (!atlas) return;
    const list = this.peds.filter((p) => p.front === (layer === "front")).sort((a, b) => a.y - b.y);
    for (const p of list) {
      const sx = Math.round(p.x - cam);
      if (sx < -80 || sx > W + 80) continue;
      const frames = META.chars[p.cid].frames;
      const idx = frames[Math.floor(p.frame) % frames.length];
      const fx = (idx % META.cols) * CW, fy = Math.floor(idx / META.cols) * CH;
      const g = this.tmp.getContext("2d")!;
      g.clearRect(0, 0, CW, CH);
      g.globalCompositeOperation = "source-over";
      g.drawImage(atlas, fx, fy, CW, CH, 0, 0, CW, CH);
      // grade: back walkers sink into the district haze; foreground walkers become near silhouettes
      g.globalCompositeOperation = "source-atop";
      g.globalAlpha = p.front ? 0.8 : 0.42;
      g.fillStyle = p.front ? "#06040a" : this.d.fog;
      g.fillRect(0, 0, CW, CH);
      g.globalAlpha = 1;
      g.globalCompositeOperation = "source-over";
      // contact shadow
      ctx.fillStyle = p.front ? "rgba(0,0,0,0.5)" : "rgba(0,0,0,0.3)";
      ctx.fillRect(sx - 9, p.y - 1, 18, 2);
      ctx.save();
      if (p.dir < 0) {
        ctx.translate(sx, 0);
        ctx.scale(-1, 1);
        ctx.drawImage(this.tmp, -AX, p.y - AY);
      } else ctx.drawImage(this.tmp, sx - AX, p.y - AY);
      ctx.restore();
    }
  }
}
