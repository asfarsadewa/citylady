// Ambient city motion: traffic, an elevated train, manhole steam and beat-synced string lights.
import { W } from "../engine/core";
import type { District } from "./data";
import type { Night } from "./state";

interface Car { x: number; dir: number; speed: number; lane: number; body: string; kind: number }
interface Puff { x: number; y: number; t: number; r: number }
interface Garland { x0: number; x1: number; sag: number; v: number; phase: number }

const BODIES = ["#1a1422", "#2a1620", "#141c2a", "#26221c", "#301018", "#1c2622"];

export class CityLife {
  private cars: Car[] = [];
  private carTimer = 1;
  private train = { x: -9999, dir: 1, timer: 6 };
  private puffs: Puff[] = [];
  private vents: number[] = [];
  private garlands: Garland[] = [];
  private t = 0;

  constructor(night: Night, private d: District, private groundY: number, private curbY: number) {
    for (let x = 400; x < night.length; x += 520 + ((x * 7) % 300)) this.vents.push(x);
    const lamps = night.lamps;
    for (let i = 0; i + 1 < lamps.length; i++) {
      if (i % 2 === 0) this.garlands.push({ x0: lamps[i] + 1, x1: lamps[i + 1] + 1, sag: 10, v: 0, phase: i * 1.7 });
    }
  }

  update(dt: number, cam: number) {
    this.t += dt;
    // traffic
    this.carTimer -= dt;
    if (this.carTimer <= 0) {
      this.carTimer = 2.5 + Math.random() * 5;
      const dir = Math.random() < 0.5 ? 1 : -1;
      this.cars.push({
        x: dir > 0 ? cam - 90 : cam + W + 90, dir, speed: 90 + Math.random() * 90, lane: dir > 0 ? 1 : 0,
        body: BODIES[Math.floor(Math.random() * BODIES.length)], kind: Math.floor(Math.random() * 3),
      });
    }
    for (const c of this.cars) c.x += c.dir * c.speed * dt;
    this.cars = this.cars.filter((c) => c.x > cam - 200 && c.x < cam + W + 200);
    // elevated train on the mid layer
    this.train.timer -= dt;
    if (this.train.timer <= 0 && this.train.x < -9000) {
      this.train.dir = Math.random() < 0.5 ? 1 : -1;
      this.train.x = this.train.dir > 0 ? -420 : W + 420;
    }
    if (this.train.x > -9000) {
      this.train.x += this.train.dir * 150 * dt;
      if (this.train.x > W + 460 || this.train.x < -460) {
        this.train.x = -9999;
        this.train.timer = 14 + Math.random() * 18;
      }
    }
    // steam from manholes, thicker in the cold and at the ironworks
    const rate = this.d.weather === "snow" || this.d.weather === "steam" ? 0.5 : 0.18;
    for (const v of this.vents) {
      if (v > cam - 40 && v < cam + W + 40 && Math.random() < rate * dt * 6) this.puffs.push({ x: v + (Math.random() - 0.5) * 6, y: this.curbY + 16, t: 0, r: 3 + Math.random() * 3 });
    }
    for (const p of this.puffs) {
      p.t += dt;
      p.y -= 12 * dt;
      p.x -= 6 * dt * (1 + this.d.wind);
    }
    this.puffs = this.puffs.filter((p) => p.t < 3.5);
    // garlands swing like damped pendulums pushed by the wind
    for (const g of this.garlands) {
      const wind = Math.sin(this.t * 0.8 + g.phase) * this.d.wind * 4;
      g.v += ((10 + wind - g.sag) * 6 - g.v * 1.6) * dt;
      g.sag += g.v * dt;
    }
  }

  /** Mid-layer train, drawn after the parallax buildings. */
  drawBack(ctx: CanvasRenderingContext2D) {
    if (this.train.x < -9000) return;
    const y = this.groundY - 118;
    ctx.fillStyle = "rgba(10,8,18,0.9)";
    ctx.fillRect(0, y + 13, W, 2);
    for (let c = 0; c < 4; c++) {
      const x = Math.round(this.train.x + c * 92 * -this.train.dir);
      ctx.fillStyle = "#120e1a";
      ctx.fillRect(x - 44, y, 88, 13);
      for (let k = 0; k < 9; k++) {
        ctx.fillStyle = (k + c) % 4 === 0 ? "rgba(255,240,200,0.55)" : "rgba(255,215,150,0.85)";
        ctx.fillRect(x - 40 + k * 9, y + 3, 6, 5);
      }
    }
  }

  /** Cars, headlight beams and steam on the road. */
  drawRoad(ctx: CanvasRenderingContext2D, cam: number, reflect: boolean) {
    for (const c of this.cars) {
      const x = Math.round(c.x - cam), y = this.curbY + 10 + c.lane * 12;
      const len = c.kind === 2 ? 54 : 44, hgt = c.kind === 1 ? 16 : 12;
      const front = c.dir > 0 ? x + len / 2 : x - len / 2;
      // headlight beam
      ctx.save();
      ctx.globalCompositeOperation = "lighter";
      const g = ctx.createLinearGradient(front, 0, front + c.dir * 110, 0);
      g.addColorStop(0, "rgba(255,240,200,0.35)");
      g.addColorStop(1, "rgba(255,240,200,0)");
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.moveTo(front, y - hgt + 6);
      ctx.lineTo(front + c.dir * 110, y - hgt - 4);
      ctx.lineTo(front + c.dir * 110, y + 8);
      ctx.lineTo(front, y - 2);
      ctx.fill();
      if (reflect) {
        ctx.fillStyle = "rgba(255,230,190,0.18)";
        ctx.fillRect(Math.min(front, front + c.dir * 70), y + 3, 70, 2);
        ctx.fillStyle = "rgba(255,60,60,0.18)";
        ctx.fillRect(c.dir > 0 ? x - len / 2 - 20 : x + len / 2, y + 3, 20, 2);
      }
      ctx.restore();
      // body
      ctx.fillStyle = c.body;
      ctx.fillRect(x - len / 2, y - hgt + 5, len, hgt - 5);
      ctx.fillRect(x - len / 2 + 9, y - hgt, len - 20, 6);
      ctx.fillStyle = "rgba(160,190,230,0.35)";
      ctx.fillRect(x - len / 2 + 11, y - hgt + 1, len - 24, 4);
      ctx.fillStyle = "#07050a";
      ctx.fillRect(x - len / 2 + 6, y - 1, 7, 3);
      ctx.fillRect(x + len / 2 - 13, y - 1, 7, 3);
      ctx.fillStyle = "#fff4d0";
      ctx.fillRect(c.dir > 0 ? x + len / 2 - 2 : x - len / 2, y - hgt + 7, 2, 2);
      ctx.fillStyle = "#ff3848";
      ctx.fillRect(c.dir > 0 ? x - len / 2 : x + len / 2 - 2, y - hgt + 7, 2, 2);
    }
    for (const p of this.puffs) {
      const a = Math.sin((p.t / 3.5) * Math.PI) * 0.12;
      ctx.fillStyle = `rgba(220,215,210,${a})`;
      ctx.beginPath();
      ctx.arc(p.x - cam, p.y, p.r + p.t * 5, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  /** String lights between lamp posts; bulbs chase along on the beat. */
  drawGarlands(ctx: CanvasRenderingContext2D, cam: number, beat: number, glow: string) {
    const top = this.groundY - 104;
    for (const g of this.garlands) {
      const x0 = g.x0 - cam, x1 = g.x1 - cam;
      if (x1 < -20 || x0 > W + 20) continue;
      const n = Math.max(6, Math.floor((x1 - x0) / 14));
      let px = x0, py = top;
      for (let i = 1; i <= n; i++) {
        const u = i / n;
        const x = x0 + (x1 - x0) * u;
        const y = top + Math.sin(u * Math.PI) * g.sag;
        ctx.fillStyle = "rgba(10,8,14,0.9)";
        const steps = Math.max(1, Math.round(x - px));
        for (let s = 0; s < steps; s++) ctx.fillRect(Math.round(px + s), Math.round(py + ((y - py) * s) / steps), 1, 1);
        px = x;
        py = y;
        if (i < n) {
          const chase = (i + Math.floor(this.t * 6)) % 3 === 0 ? 1 : 0.55;
          const lum = Math.min(1, chase * (0.6 + beat * 0.6));
          ctx.globalAlpha = lum;
          ctx.fillStyle = i % 3 === 0 ? "#ffe6a8" : glow;
          ctx.fillRect(Math.round(x) - 1, Math.round(y) + 1, 2, 2);
          ctx.globalAlpha = lum * 0.25;
          ctx.fillRect(Math.round(x) - 3, Math.round(y) - 1, 6, 6);
          ctx.globalAlpha = 1;
        }
      }
    }
  }
}
