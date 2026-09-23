// Screen-space weather particles: rain, snow, sky lanterns, steam, wind debris and embers.
import { W, H } from "../engine/core";
import type { Weather } from "./data";

interface Pt { x: number; y: number; vx: number; vy: number; life: number; size: number; z: number; seed: number }

export class WeatherFx {
  private pts: Pt[] = [];
  private splashes: { x: number; y: number; t: number }[] = [];
  constructor(public kind: Weather, public wind = 0.6, public groundY = 318) {
    const n = { rain: 260, snow: 170, lanterns: 26, steam: 30, wind: 40, embers: 70, clear: 36 }[kind];
    for (let i = 0; i < n; i++) this.pts.push(this.spawn(true));
  }

  private spawn(anywhere: boolean): Pt {
    const z = Math.random();
    const k = this.kind;
    const p: Pt = { x: Math.random() * (W + 80) - 40, y: anywhere ? Math.random() * H : -10, vx: 0, vy: 0, life: 0, size: 1, z, seed: Math.random() * 100 };
    if (k === "rain") { p.vy = 380 + z * 260; p.vx = -60 * this.wind - 20; p.size = z > 0.7 ? 2 : 1; }
    else if (k === "snow") { p.vy = 18 + z * 30; p.vx = -20 * this.wind; p.size = z > 0.75 ? 2 : 1; }
    else if (k === "lanterns") { p.y = anywhere ? Math.random() * H * 0.8 : H + 10; p.vy = -(6 + z * 10); p.vx = -3 * this.wind; p.size = 2 + Math.round(z * 3); }
    else if (k === "steam") { p.y = anywhere ? Math.random() * H : H * 0.75; p.vy = -(10 + z * 12); p.vx = -8; p.size = 10 + z * 20; p.life = anywhere ? Math.random() * 6 : 0; }
    else if (k === "wind") { p.vx = -(120 + z * 180) * this.wind; p.vy = 6; p.size = 1; p.x = anywhere ? p.x : W + 20; p.y = Math.random() * H; }
    else if (k === "embers") { p.y = anywhere ? Math.random() * H : H + 5; p.vy = -(14 + z * 26); p.vx = -12 * this.wind; p.size = z > 0.8 ? 2 : 1; }
    else { p.vy = -2 - z * 3; p.vx = -2; p.size = 1; } // clear: drifting dust motes
    return p;
  }

  update(dt: number, camDx = 0) {
    for (let i = 0; i < this.pts.length; i++) {
      const p = this.pts[i];
      p.life += dt;
      const sway = this.kind === "snow" ? Math.sin(p.life * 1.5 + p.seed) * 14 : this.kind === "lanterns" ? Math.sin(p.life * 0.6 + p.seed) * 4 : 0;
      p.x += (p.vx + sway) * dt - camDx * (0.3 + p.z * 0.9);
      p.y += p.vy * dt;
      if (this.kind === "rain" && p.y > this.groundY + p.z * 30) {
        if (Math.random() < 0.4) this.splashes.push({ x: p.x, y: this.groundY + p.z * 30, t: 0 });
        this.pts[i] = this.spawn(false);
      } else if (p.y > H + 20 || p.y < -30 || p.x < -60 || p.x > W + 60 || (this.kind === "steam" && p.life > 7)) {
        this.pts[i] = this.spawn(false);
        if (p.x < -60) this.pts[i].x = W + 40;
        if (p.x > W + 60) this.pts[i].x = -40;
      }
    }
    for (let i = this.splashes.length - 1; i >= 0; i--) {
      this.splashes[i].t += dt;
      if (this.splashes[i].t > 0.25) this.splashes.splice(i, 1);
    }
  }

  draw(ctx: CanvasRenderingContext2D, glow = "#ffc36b") {
    const k = this.kind;
    ctx.save();
    for (const p of this.pts) {
      const x = Math.round(p.x), y = Math.round(p.y);
      if (k === "rain") {
        ctx.fillStyle = p.z > 0.6 ? "rgba(200,215,255,0.55)" : "rgba(170,180,230,0.3)";
        const len = 5 + p.z * 8;
        for (let j = 0; j < len; j++) ctx.fillRect(x + Math.round((j * p.vx) / p.vy), y - j, p.size, 1);
      } else if (k === "snow") {
        ctx.fillStyle = `rgba(240,245,255,${0.45 + p.z * 0.5})`;
        ctx.fillRect(x, y, p.size, p.size);
      } else if (k === "lanterns") {
        const flick = 0.75 + Math.sin(p.life * 7 + p.seed) * 0.25;
        ctx.globalAlpha = 0.25 * flick;
        ctx.fillStyle = glow;
        ctx.fillRect(x - p.size, y - p.size, p.size * 3, p.size * 3 + 1);
        ctx.globalAlpha = flick;
        ctx.fillStyle = "#ffcf7a";
        ctx.fillRect(x, y, p.size, p.size + 1);
        ctx.fillStyle = "#ff7a3c";
        ctx.fillRect(x, y + p.size, p.size, 1);
        ctx.globalAlpha = 1;
      } else if (k === "steam") {
        const a = Math.sin((p.life / 7) * Math.PI) * 0.09;
        ctx.fillStyle = `rgba(210,210,200,${a})`;
        ctx.beginPath();
        ctx.arc(x, y, p.size + p.life * 3, 0, Math.PI * 2);
        ctx.fill();
      } else if (k === "wind") {
        ctx.fillStyle = "rgba(220,220,255,0.18)";
        ctx.fillRect(x, y, 6 + p.z * 14, 1);
      } else if (k === "embers") {
        ctx.fillStyle = p.z > 0.5 ? "#ffb347" : "#ff6a3a";
        ctx.globalAlpha = 0.5 + Math.sin(p.life * 9 + p.seed) * 0.4;
        ctx.fillRect(x, y, p.size, p.size);
        ctx.globalAlpha = 1;
      } else {
        ctx.fillStyle = `rgba(255,230,190,${0.15 + 0.2 * Math.sin(p.life + p.seed)})`;
        ctx.fillRect(x, y, 1, 1);
      }
    }
    ctx.fillStyle = "rgba(200,215,255,0.5)";
    for (const s of this.splashes) {
      const r = Math.round(s.t * 14);
      ctx.fillRect(Math.round(s.x) - r, Math.round(s.y), 1, 1);
      ctx.fillRect(Math.round(s.x) + r, Math.round(s.y), 1, 1);
      ctx.fillRect(Math.round(s.x), Math.round(s.y) - 1 - r, 1, 1);
    }
    ctx.restore();
  }
}
