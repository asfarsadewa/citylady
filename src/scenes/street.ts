// The district street: walk, read shopfronts, rest on benches, open the ledger, enter shops.
import { W, H, img, input, pointer, hit, kick, clamp, time, type Scene } from "../engine/core";
import { audio } from "../engine/audio";
import { text, para, measure, lineHeight } from "../engine/text";
import { DISTRICTS, BANKER_SECRETS, type District } from "../game/data";
import { clock, gossip, has, intelText, rng, type Night, type Run, type Shop } from "../game/state";
import { Vela } from "../game/vela";
import { WeatherFx } from "../game/weather";
import { CityLife } from "../game/citylife";
import { Crowd } from "../game/crowd";
import { COL, panel, bar, keycap, button, vignette, grain } from "../ui/widgets";
import { ai } from "../game/ai";
import artmeta from "../data/artmeta.json";
import * as flow from "./flow";
import { t, type Key } from "../i18n";

const GROUND = 300; // facade baseline
const FEET = 314;
const CURB = 326;
const META = artmeta as Record<string, { w: number; h: number; sign?: number[] | null }>;

export function shopOpen(s: Shop, minutes: number) {
  return minutes >= s.opens && minutes < s.closes;
}

export class StreetScene implements Scene {
  vela: Vela;
  cam = 0;
  private d: District;
  private row!: HTMLCanvasElement;
  private mid!: HTMLCanvasElement;
  private glowSprite!: HTMLCanvasElement;
  private fx: WeatherFx;
  private life: CityLife;
  private beat = 0;
  private crowd: Crowd;
  private silhouettes = new Map<number, { c: HTMLCanvasElement; x: number; y: number }>();
  private toasts: { text: string; t: number; color: string }[] = [];
  private ledgerOpen = false;
  private target: number | null = null;
  private entering: Shop | null = null;
  private enterT = 0;
  private resting = 0;
  private r = rng(Date.now() & 0xffff);

  constructor(public run: Run, public night: Night) {
    this.d = DISTRICTS[run.district];
    this.vela = new Vela(night.x, FEET);
    this.vela.wind = this.d.wind;
    this.vela.tint = this.d.fog;
    this.vela.tintStrength = 0.12;
    this.vela.onStep = () => audio.sfx(Math.random() < 0.5 ? "step_stone" : "step_stone2", { vol: 0.3, rate: 0.95 + Math.random() * 0.1 });
    this.fx = new WeatherFx(this.d.weather, this.d.wind, CURB);
    this.build();
    this.life = new CityLife(night, this.d, GROUND, CURB);
    this.crowd = new Crowd(night, this.d, GROUND, CURB);
  }

  enter() {
    audio.playMusic("mus_walk");
    audio.playAmb(this.d.amb);
    this.entering = null;
    this.vela.standUp();
    this.ledgerOpen = false;
  }

  toast(t: string, color = COL.paper) {
    this.toasts.push({ text: t, t: 0, color });
  }

  // ---------- pre-rendering ----------
  private build() {
    const n = this.night;
    const d = this.d;
    const r = rng(n.seed ^ 0x51f1);
    // mid layer: silhouetted blocks with lit windows
    const midW = Math.ceil(n.length * 0.45 + W + 40);
    this.mid = document.createElement("canvas");
    this.mid.width = midW;
    this.mid.height = H;
    const m = this.mid.getContext("2d")!;
    let x = -20;
    while (x < midW) {
      const bw = r.int(40, 110), bh = r.int(50, 125);
      const top = GROUND - bh + 10;
      m.fillStyle = shade(d.fog, -0.62 + r.next() * 0.06);
      m.fillRect(x, top, bw, H - top);
      // rooftop clutter: water tanks, antennas, vents
      const clutter = r.int(0, 3);
      for (let k = 0; k < clutter; k++) {
        const cx = x + r.int(4, bw - 14);
        const kind = r.int(0, 2);
        if (kind === 0) { m.fillRect(cx, top - 10, 10, 10); m.fillRect(cx + 1, top - 12, 8, 2); m.fillRect(cx + 2, top - 2, 1, 2); }
        else if (kind === 1) { m.fillRect(cx + 3, top - 22, 1, 22); m.fillRect(cx, top - 16, 7, 1); }
        else m.fillRect(cx, top - 4, 6, 4);
      }
      m.fillStyle = shade(d.fog, -0.45);
      m.fillRect(x, top, bw, 1);
      for (let wy = top + 8; wy < GROUND - 10; wy += 10) {
        for (let wx = x + 5; wx < x + bw - 6; wx += 8) {
          if (r.chance(0.09)) {
            m.fillStyle = r.chance(0.75) ? withAlpha(d.glow, 0.25 + r.next() * 0.25) : "rgba(150,190,255,0.22)";
            m.fillRect(wx, wy, 2, 3);
          }
        }
      }
      x += bw + r.int(-6, 8);
    }
    // street row: facades, props, pavement, road
    this.row = document.createElement("canvas");
    this.row.width = n.length;
    this.row.height = H;
    const c = this.row.getContext("2d")!;
    c.imageSmoothingEnabled = false;
    // pavement
    const pave = shade(d.fog, 0.05);
    c.fillStyle = pave;
    c.fillRect(0, GROUND - 2, n.length, CURB - GROUND + 2);
    for (let yy = GROUND; yy < CURB; yy += 7) {
      c.fillStyle = shade(d.fog, -0.12);
      c.fillRect(0, yy, n.length, 1);
      const off = ((yy - GROUND) / 7) % 2 ? 8 : 0;
      for (let xx = off; xx < n.length; xx += 16) c.fillRect(xx, yy, 1, 7);
    }
    c.fillStyle = shade(d.fog, 0.25);
    c.fillRect(0, CURB - 3, n.length, 2);
    c.fillStyle = shade(d.fog, -0.3);
    c.fillRect(0, CURB - 1, n.length, 2);
    c.fillStyle = shade(d.fog, -0.55);
    c.fillRect(0, CURB + 1, n.length, H - CURB);
    for (let xx = 30; xx < n.length; xx += 80) {
      c.fillStyle = "rgba(230,220,180,0.18)";
      c.fillRect(xx, 344, 34, 2);
    }
    // fillers first, then shops
    for (const f of n.fillers) this.facade(c, f.sprite, f.x, null, f.width);
    for (const s of n.shops) this.facade(c, s.sprite, s.x, s, s.width);
    // lamps and benches
    for (const lx of n.lamps) {
      c.fillStyle = "#15101c";
      c.fillRect(lx, GROUND - 105, 3, 110);
      c.fillRect(lx - 3, GROUND - 2, 9, 4);
      c.fillRect(lx - 6, GROUND - 106, 15, 3);
      c.fillStyle = "#2c2436";
      c.fillRect(lx + 1, GROUND - 100, 1, 95);
      c.fillStyle = "#fff2cf";
      c.fillRect(lx - 5, GROUND - 103, 5, 2);
      c.fillRect(lx + 3, GROUND - 103, 5, 2);
    }
    for (const bx of n.benches) {
      c.fillStyle = "#1c1420";
      c.fillRect(bx - 16, GROUND + 4, 32, 3);
      c.fillRect(bx - 16, GROUND - 6, 32, 2);
      c.fillRect(bx - 14, GROUND + 7, 2, 6);
      c.fillRect(bx + 12, GROUND + 7, 2, 6);
      c.fillStyle = "#4a3426";
      c.fillRect(bx - 15, GROUND + 3, 30, 1);
      c.fillRect(bx - 15, GROUND - 7, 30, 1);
    }
    // glow sprite
    this.glowSprite = document.createElement("canvas");
    this.glowSprite.width = this.glowSprite.height = 96;
    const g = this.glowSprite.getContext("2d")!;
    const grad = g.createRadialGradient(48, 48, 0, 48, 48, 48);
    grad.addColorStop(0, withAlpha(d.glow, 0.55));
    grad.addColorStop(0.35, withAlpha(d.glow, 0.18));
    grad.addColorStop(1, withAlpha(d.glow, 0));
    g.fillStyle = grad;
    g.fillRect(0, 0, 96, 96);
  }

  private facade(c: CanvasRenderingContext2D, sprite: string, cx: number, shop: Shop | null, slot: number) {
    const im = img(sprite);
    if (!im) return;
    const meta = META[sprite];
    const w = im.width, h = im.height;
    const scale = Math.min(1, slot / w);
    const dw = Math.round(w * scale), dh = Math.round(h * scale);
    const x = Math.round(cx - dw / 2), y = GROUND - dh + 4;
    // grade the facade into the district's light
    const tmp = document.createElement("canvas");
    tmp.width = dw; tmp.height = dh;
    const g2 = tmp.getContext("2d")!;
    g2.imageSmoothingEnabled = false;
    g2.drawImage(im, 0, 0, dw, dh);
    g2.globalCompositeOperation = "multiply";
    g2.fillStyle = this.d.tint;
    g2.fillRect(0, 0, dw, dh);
    g2.globalCompositeOperation = "destination-in";
    g2.drawImage(im, 0, 0, dw, dh);
    g2.globalCompositeOperation = "source-over";
    if (shop) {
      this.sign(g2, shop, meta?.sign ? meta.sign.map((v) => v * scale) : null, dw, dh);
      const sil = document.createElement("canvas");
      sil.width = dw; sil.height = dh;
      const sg = sil.getContext("2d")!;
      sg.fillStyle = "#07050e";
      sg.fillRect(0, 0, dw, dh);
      sg.globalCompositeOperation = "destination-in";
      sg.drawImage(im, 0, 0, dw, dh);
      this.silhouettes.set(shop.id, { c: sil, x, y });
    }
    c.drawImage(tmp, x, y);
  }

  private sign(g2: CanvasRenderingContext2D, s: Shop, rect: number[] | null, dw: number, dh: number) {
    const name = s.name;
    if (rect && rect[2] > 40) {
      const [sx, sy, sw, sh] = rect;
      const font = measure(name, "title") < sw - 8 && sh >= 18 ? "title" : "bold";
      const fh = font === "title" ? 16 : 11;
      text(g2, name, sx + sw / 2, sy + (sh - fh) / 2, { font, color: "#3b2216", align: "center", shadow: "rgba(255,240,210,0.35)" });
    } else {
      const w = measure(name, "bold") + 14;
      const x = Math.round((dw - w) / 2), y = Math.round(dh * 0.4);
      g2.fillStyle = "#120c18";
      g2.fillRect(x, y, w, 15);
      g2.fillStyle = this.d.glow;
      g2.fillRect(x, y, w, 1);
      g2.fillRect(x, y + 14, w, 1);
      text(g2, name, dw / 2, y + 2, { font: "bold", color: this.d.glow, align: "center", shadow: null });
    }
  }

  // ---------- update ----------
  nearShop(): Shop | null {
    let best: Shop | null = null;
    for (const s of this.night.shops) if (Math.abs(s.x - this.vela.x) < s.width / 2 - 10 && (!best || Math.abs(s.x - this.vela.x) < Math.abs(best.x - this.vela.x))) best = s;
    return best;
  }

  nearBench(): number | null {
    return this.night.benches.find((b) => Math.abs(b - this.vela.x) < 22) ?? null;
  }

  update(dt: number) {
    const n = this.night;
    for (const toast of this.toasts) toast.t += dt;
    this.toasts = this.toasts.filter((toast) => toast.t < 4.5);
    if (this.entering) {
      this.enterT += dt;
      this.vela.alpha = Math.max(0, 1 - Math.max(0, this.enterT - 0.35) * 2.5);
      this.vela.update(dt, 0);
      if (this.enterT > 0.8) {
        const s = this.entering;
        this.entering = null;
        n.x = this.vela.x;
        flow.toDuel(this.run, n, s, this);
      }
      return;
    }
    if (this.resting > 0) {
      this.resting -= dt;
      this.vela.update(dt, 0);
      this.fx.update(dt);
      return;
    }
    if (input.pressed("ledger")) {
      this.ledgerOpen = !this.ledgerOpen;
      audio.sfx(this.ledgerOpen ? "ledger" : "ui_back", { vol: 0.6 });
    }
    if (this.ledgerOpen) {
      if (input.pressed("back")) this.ledgerOpen = false;
      this.fx.update(dt);
      this.vela.update(dt, 0);
      return;
    }

    let dir = (input.down("right") ? 1 : 0) - (input.down("left") ? 1 : 0);
    if (dir !== 0) this.target = null;
    // pointer: tap the street to walk there
    if (pointer.clicked && pointer.y > 60 && pointer.y < H - 40 && !this.hudHit()) this.target = pointer.x + this.cam;
    if (this.target !== null) {
      const dx = this.target - this.vela.x;
      if (Math.abs(dx) < 3) this.target = null;
      else dir = Math.sign(dx);
    }
    const speed = input.down("run") ? 96 : 58;
    const vx = dir * speed;
    const before = this.vela.x;
    this.vela.update(dt, vx);
    this.vela.x = clamp(this.vela.x, 40, n.length - 40);
    const moved = Math.abs(this.vela.x - before);
    n.minutes += moved / 14 + dt * 0.5;
    n.heat = Math.max(0, n.heat - dt * (has(this.run, "card") ? 0.9 : 0.5));
    // camera leads a little in the walking direction
    const lead = this.vela.facing * 60;
    const tx = clamp(this.vela.x - W / 2 + lead, 0, n.length - W);
    const prevCam = this.cam;
    this.cam += (tx - this.cam) * Math.min(1, dt * 2.5);
    this.fx.update(dt, this.cam - prevCam);
    this.life.update(dt, this.cam);
    this.beat = audio.beat();

    this.crowd.update(dt, this.cam);


    // interactions
    const shop = this.nearShop();
    const bench = this.nearBench();
    const act = input.pressed("ok") || input.pressed("up") || (pointer.clicked && this.actionButtonHit());
    if (act && shop) this.tryEnter(shop);
    else if (act && bench !== null) this.rest();

    // heat patrol
    if (n.heat >= 100) {
      n.heat = 35;
      n.minutes += 60;
      audio.sfx("whistle");
      kick(4);
      this.toast(t("toast.patrol"), COL.red);
    }
    if (n.minutes >= n.endMinutes) {
      n.minutes = n.endMinutes;
      audio.sfx("bell_toll");
      flow.toNightEnd(this.run);
    }
  }

  private tryEnter(s: Shop) {
    const n = this.night;
    if (s.status === "paid") return this.toast(t("toast.paid", { owner: s.owner }), COL.dim);
    if (s.status === "banned") return this.toast(t("toast.banned", { owner: s.owner }), COL.red);
    if (s.status === "partial") return this.toast(t("toast.partial", { owner: s.owner }), COL.dim);
    if (!shopOpen(s, n.minutes)) {
      audio.sfx("ui_back");
      return this.toast(n.minutes < s.opens ? t("toast.opens", { shop: s.name, t: clock(s.opens) }) : t("toast.closed", { shop: s.name }), COL.dim);
    }
    this.entering = s;
    this.enterT = 0;
    this.vela.x = s.x;
    this.vela.playEnter();
    s.visits++;
    audio.sfx("door_bell", { vol: 0.8 });
  }

  private rest() {
    const n = this.night;
    this.resting = 1.4;
    n.minutes += 30;
    n.composure = Math.min(n.maxComposure, n.composure + 35);
    audio.sfx("cloth", { vol: 0.5 });
    this.toast(t("toast.rest"), COL.teal);
    if (this.r.chance(0.55)) {
      const any = n.shops.find((s) => s.status === "open");
      if (any) {
        const it = gossip(this.run, n, any, this.r);
        if (it) {
          audio.sfx("paper", { vol: 0.7 });
          this.toast(t("toast.overhear", { text: intelText(it, n) }), COL.gold);
        }
      }
    }
  }

  private hudHit() {
    return hit(W - 70, H - 34, 64, 26) || hit(8, H - 34, 60, 26) || hit(W - 92, 4, 88, 18);
  }

  private actionButtonHit() {
    return pointer.touch && hit(W - 70, H - 34, 64, 26);
  }

  // ---------- draw ----------
  draw(ctx: CanvasRenderingContext2D) {
    const n = this.night;
    const cam = Math.round(this.cam);
    const d = this.d;
    // sky
    const sky = img(d.sky);
    if (sky) {
      const sx = (cam * 0.12) % Math.max(1, sky.width - W);
      ctx.drawImage(sky, Math.round(sx), 0, W, H, 0, 0, W, H);
    }
    // mid layer and haze
    ctx.drawImage(this.mid, Math.round(cam * 0.45), 0, W, H, 0, 0, W, H);
    this.life.drawBack(ctx);
    const haze = ctx.createLinearGradient(0, 120, 0, GROUND);
    haze.addColorStop(0, withAlpha(d.fog, 0));
    haze.addColorStop(1, withAlpha(d.fog, 0.55));
    ctx.fillStyle = haze;
    ctx.fillRect(0, 120, W, GROUND - 120);
    // street row
    ctx.drawImage(this.row, cam, 0, W, H, 0, 0, W, H);
    // wet reflections
    if (d.reflect || d.weather === "rain") {
      ctx.save();
      ctx.globalAlpha = 0.28;
      for (let j = 0; j < H - CURB - 1; j++) {
        const sy = CURB - 30 - j * 1.35;
        if (sy < 0) break;
        const wob = Math.round(Math.sin(time * 2.2 + j * 0.45) * (1 + j * 0.04));
        ctx.drawImage(this.row, cam + wob, Math.round(sy), W, 1, 0, CURB + 1 + j, W, 1);
      }
      ctx.restore();
    }
    this.life.drawGarlands(ctx, cam, this.beat, d.glow);
    // glows
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    for (const lx of n.lamps) {
      const x = lx - cam;
      if (x < -120 || x > W + 120) continue;
      const fl = 0.78 + this.beat * 0.22 + Math.sin(time * 13 + lx) * 0.04 + (Math.random() < 0.01 ? -0.3 : 0);
      ctx.globalAlpha = fl;
      ctx.drawImage(this.glowSprite, x - 46, GROUND - 150, 96, 96);
      ctx.globalAlpha = 0.25 * fl;
      ctx.drawImage(this.glowSprite, x - 60, GROUND - 30, 124, 60);
      if (d.reflect) ctx.drawImage(this.glowSprite, x - 20, CURB + 8, 44, 40);
    }
    for (const s of n.shops) {
      const x = s.x - cam;
      if (x < -140 || x > W + 140) continue;
      const open = shopOpen(s, n.minutes) && s.status === "open";
      ctx.globalAlpha = open ? 0.5 + this.beat * 0.1 + Math.sin(time * 3 + s.id) * 0.05 : 0.15;
      ctx.drawImage(this.glowSprite, x - 70, GROUND - 90, 140, 110);
    }
    ctx.restore();
    // closed shops get dimmed
    for (const s of n.shops) {
      const x = s.x - cam;
      if (x < -140 || x > W + 140) continue;
      const sil = this.silhouettes.get(s.id);
      if (sil && (!shopOpen(s, n.minutes) || s.status !== "open")) {
        ctx.globalAlpha = s.status === "paid" ? 0.22 : 0.5;
        ctx.drawImage(sil.c, sil.x - cam, sil.y);
        ctx.globalAlpha = 1;
      }
    }
    // pedestrians behind her
    this.crowd.draw(ctx, cam, "back");
    // Vela's shadow and body
    const vx = this.vela.x - cam;
    ctx.fillStyle = "rgba(0,0,0,0.35)";
    ctx.fillRect(Math.round(vx - 10), FEET, 20, 2);
    ctx.fillRect(Math.round(vx - 7), FEET + 2, 14, 1);
    this.vela.draw(ctx, vx, FEET);
    // foreground passers-by, then the road, which is nearer the camera than the pavement
    this.crowd.draw(ctx, cam, "front");
    this.life.drawRoad(ctx, cam, d.reflect || d.weather === "rain");
    // weather and grading
    this.fx.draw(ctx, d.glow);
    const top = ctx.createLinearGradient(0, 0, 0, 110);
    top.addColorStop(0, "rgba(5,3,12,0.55)");
    top.addColorStop(1, "rgba(5,3,12,0)");
    ctx.fillStyle = top;
    ctx.fillRect(0, 0, W, 110);
    vignette(ctx, 0.55);
    grain(ctx, 0.05);
    // markers above shops (a dev flag hides UI for clean promo capture)
    const clean = import.meta.env.DEV && (window as unknown as { __clean?: boolean }).__clean;
    if (!clean) {
      this.drawMarkers(ctx, cam);
      this.drawHud(ctx);
    }
    if (this.ledgerOpen) this.drawLedger(ctx);
    // toasts
    this.toasts.slice(-3).forEach((toast, i) => {
      const a = Math.min(1, toast.t * 5, (4.5 - toast.t) * 2);
      const w = Math.min(460, measure(toast.text) + 20);
      ctx.globalAlpha = a;
      const ty = 18 + lineHeight("title") + i * (lineHeight("body") + 7);
      panel(ctx, (W - w) / 2, ty, w, lineHeight("body") + 4, toast.color);
      text(ctx, toast.text, W / 2, ty + 3, { color: toast.color, align: "center" });
      ctx.globalAlpha = 1;
    });
    if (this.resting > 0) {
      ctx.fillStyle = `rgba(5,3,12,${Math.sin((1 - this.resting / 1.4) * Math.PI) * 0.7})`;
      ctx.fillRect(0, 0, W, H);
    }
  }

  private drawMarkers(ctx: CanvasRenderingContext2D, cam: number) {
    const n = this.night;
    const near = this.nearShop();
    for (const s of n.shops) {
      const x = Math.round(s.x - cam);
      if (x < -60 || x > W + 60) continue;
      const open = shopOpen(s, n.minutes);
      const y = 70 + Math.round(Math.sin(time * 2 + s.id) * 2);
      if (s.status === "paid") text(ctx, t("mark.paid"), x, y, { font: "title", color: COL.green, align: "center" });
      else if (s.status === "banned") text(ctx, t("mark.banned"), x, y, { font: "title", color: COL.red, align: "center" });
      else if (s.status === "partial") text(ctx, t("mark.partial"), x, y, { font: "title", color: COL.teal, align: "center" });
      else if (!open) text(ctx, n.minutes < s.opens ? t("mark.opens", { t: clock(s.opens) }) : t("mark.closed"), x, y, { font: "small", color: COL.dim, align: "center" });
      else {
        ctx.fillStyle = COL.gold;
        const b = Math.round(Math.sin(time * 4) * 1.5);
        ctx.fillRect(x - 2, y + b, 5, 5);
        ctx.fillRect(x - 1, y + 6 + b, 3, 2);
      }
      if (near === s) this.drawShopCard(ctx, s, x);
    }
    const bench = this.nearBench();
    if (bench !== null && !near) {
      const x = Math.round(bench - cam);
      panel(ctx, x - 90, 238, 180, 26, COL.teal);
      keycap(ctx, "E", x - 84, 247);
      text(ctx, t("bench.title"), x - 70, 241, { color: COL.teal });
      text(ctx, t("bench.body"), x - 70, 252, { font: "small", color: COL.dim });
    }
  }

  private drawShopCard(ctx: CanvasRenderingContext2D, s: Shop, x: number) {
    const n = this.night;
    const w = 176, h = 74;
    const cx = clamp(x - w / 2, 6, W - w - 6);
    const y = 150;
    panel(ctx, cx, y, w, h, COL.gold);
    text(ctx, s.name, cx + 8, y + 5, { font: "bold", color: COL.gold });
    text(ctx, `${s.owner} · ${t(`shop.${s.type}` as Key)}`, cx + 8, y + 18, { font: "small", color: COL.dim });
    text(ctx, t("card.debt", { v: s.debt }), cx + 8, y + 29, { color: COL.paper });
    if (has(this.run, "eye")) text(ctx, t("card.cash", { v: s.cash }), cx + w - 8, y + 29, { color: COL.teal, align: "right" });
    const hours = shopOpen(s, n.minutes) ? t("card.open_until", { t: clock(s.closes) }) : n.minutes < s.opens ? t("card.opens_at", { t: clock(s.opens) }) : t("card.closed");
    text(ctx, hours, cx + 8, y + 41, { font: "small", color: shopOpen(s, n.minutes) ? COL.green : COL.red });
    const intel = n.intel.filter((i) => i.shopId === s.id);
    const tags = [...s.revealed.filter((k) => s.traits[k] > 0).map((k) => t(`trait.${k}` as Key)), ...intel.map((i) => t(`tag.${i.kind}` as Key))];
    text(ctx, tags.length ? tags.join(" · ") : t("card.no_intel"), cx + 8, y + 51, { font: "small", color: tags.length ? COL.violet : "#5e546c" });
    if (s.status === "open" && shopOpen(s, n.minutes)) {
      keycap(ctx, "E", cx + 8, y + 62);
      text(ctx, t("card.enter"), cx + 22, y + 60, { font: "small", color: COL.paper });
    }
  }

  private drawHud(ctx: CanvasRenderingContext2D) {
    const n = this.night;
    const run = this.run;
    // district and clock
    text(ctx, t(`district.${this.d.id}` as Key).toUpperCase(), 10, 8, { font: "title", color: COL.paper });
    const sub = 8 + lineHeight("title"); // second HUD row sits under the title font, whatever its size
    text(ctx, t("hud.night", { n: run.district + 1 }), 10, sub, { font: "small", color: COL.dim });
    const left = n.endMinutes - n.minutes;
    text(ctx, clock(n.minutes), W / 2, 6, { font: "title", color: left < 60 ? COL.red : COL.gold, align: "center" });
    text(ctx, t("hud.dawn", { t: clock(n.endMinutes) }), W / 2, sub - 2, { font: "small", color: COL.dim, align: "center" });
    // quota
    const q = n.collected / n.quota;
    text(ctx, `${n.collected} / ${n.quota}`, W - 10, 6, { font: "title", color: q >= 1 ? COL.green : COL.paper, align: "right" });
    bar(ctx, W - 130, sub, 120, 4, q, q >= 1 ? COL.green : COL.gold);
    text(ctx, t("hud.quota"), W - 134, sub - 2, { font: "small", color: COL.dim, align: "right" });
    // composure and heat
    const by = H - 30;
    // columns flow from measured label widths so longer languages never overlap
    const bx = 10 + Math.max(measure(t("hud.composure"), "small"), measure(t("hud.heat"), "small")) + 6;
    text(ctx, t("hud.composure"), 10, by - 2, { font: "small", color: COL.dim });
    bar(ctx, bx, by, 84, 4, n.composure / n.maxComposure, COL.teal);
    text(ctx, t("hud.heat"), 10, by + 9, { font: "small", color: COL.dim });
    bar(ctx, bx, by + 11, 84, 4, n.heat / 100, n.heat > 70 ? COL.red : "#e08a3c");
    const rx = bx + 84 + 10;
    const fearTxt = t("hud.fear", { v: Math.round(run.fear) }), graceTxt = t("hud.grace", { v: Math.round(run.grace) });
    text(ctx, fearTxt, rx, by - 2, { font: "small", color: COL.crimson });
    text(ctx, graceTxt, rx, by + 9, { font: "small", color: COL.teal });
    const px = rx + Math.max(measure(fearTxt, "small"), measure(graceTxt, "small")) + 14;
    text(ctx, t("hud.purse", { v: run.purse }), px, by - 2, { font: "small", color: COL.gold });
    text(ctx, ai.status === "online" ? t("hud.jev") : t("hud.local"), px, by + 9, { font: "small", color: ai.status === "online" ? COL.violet : "#5e546c" });
    // hints
    const hx = W - 10;
    let x = hx - measure(t("hud.ledger"), "small");
    text(ctx, t("hud.ledger"), x, by + 9, { font: "small", color: COL.dim });
    x -= keycap(ctx, "TAB", x - 26, by + 8) + 8;
    // hints are laid out right to left from measured widths, so every language fits
    const walk = t("hud.walk");
    x -= measure(walk, "small") + 2;
    text(ctx, walk, x, by + 9, { font: "small", color: COL.dim });
    keycap(ctx, "D", x - 12, by + 8);
    keycap(ctx, "A", x - 24, by + 8);
    const runLabel = t("hud.run");
    text(ctx, runLabel, hx - measure(runLabel, "small"), by - 2, { font: "small", color: COL.dim });
    keycap(ctx, "SHIFT", hx - measure(runLabel, "small") - 34, by - 3);
    if (pointer.touch) {
      button(ctx, "act", t("btn.enter"), W - 70, H - 64, 64, 26, { accent: COL.gold });
      if (button(ctx, "ledger", t("hud.ledger"), W - 92, 36, 84, 18, {})) this.ledgerOpen = true;
    }
  }

  private drawLedger(ctx: CanvasRenderingContext2D) {
    const n = this.night;
    ctx.fillStyle = "rgba(5,3,10,0.72)";
    ctx.fillRect(0, 0, W, H);
    const x = 40, y = 34, w = W - 80, h = H - 70;
    panel(ctx, x, y, w, h, COL.gold, "rgba(22,14,26,0.97)");
    text(ctx, t("ledger.title"), x + 12, y + 8, { font: "title", color: COL.gold });
    text(ctx, t("ledger.sub", { district: t(`district.${this.d.id}` as Key), t: clock(n.minutes), c: n.collected, q: n.quota }), x + w - 12, y + 12, { font: "small", color: COL.dim, align: "right" });
    let yy = y + 32;
    text(ctx, t("ledger.shop"), x + 12, yy, { font: "small", color: COL.dim });
    text(ctx, t("ledger.debt"), x + 250, yy, { font: "small", color: COL.dim });
    text(ctx, t("ledger.hours"), x + 300, yy, { font: "small", color: COL.dim });
    text(ctx, t("ledger.status"), x + 390, yy, { font: "small", color: COL.dim });
    yy += 11;
    for (const s of n.shops) {
      const open = shopOpen(s, n.minutes);
      const col = s.status === "paid" ? COL.green : s.status === "banned" ? COL.red : COL.paper;
      text(ctx, `${s.name} (${s.owner})`, x + 12, yy, { color: col });
      text(ctx, String(s.debt), x + 250, yy, { color: COL.paper });
      text(ctx, `${clock(s.opens)}-${clock(s.closes)}`, x + 300, yy, { font: "small", color: open ? COL.green : COL.dim });
      const st = s.status === "open" ? (open ? t("st.open") : t("st.closed")) : s.status === "paid" ? t("st.paid", { v: s.collected }) : s.status === "partial" ? t("st.part", { v: s.collected }) : t("st.banned");
      text(ctx, st, x + 390, yy, { font: "small", color: col });
      const intel = n.intel.filter((i) => i.shopId === s.id).length;
      if (intel) text(ctx, t("ledger.intel_count", { n: intel }), x + w - 12, yy, { font: "small", color: COL.violet, align: "right" });
      yy += 13;
    }
    yy += 6;
    text(ctx, t("ledger.intel"), x + 12, yy, { font: "small", color: COL.dim });
    yy += 11;
    if (!n.intel.length && !this.run.bankerIntel.length) text(ctx, t("ledger.no_intel"), x + 12, yy, { font: "small", color: "#6e6380" });
    for (const it of n.intel.slice(-6)) yy += para(ctx, `• ${intelText(it, n)}`, x + 12, yy, w - 24, { font: "small", color: it.kind === "secret" ? COL.crimson : it.kind === "stash" ? COL.gold : COL.teal });
    for (const b of this.run.bankerIntel) yy += para(ctx, `• ${t(`banker.${Math.max(0, BANKER_SECRETS.indexOf(b))}` as Key)}`, x + 12, yy, w - 24, { font: "small", color: COL.gold });
    const quotaMet = n.collected >= n.quota;
    if (button(ctx, "endnight", quotaMet ? t("ledger.end") : t("ledger.end_early"), x + w - 170, y + h - 28, 158, 20, { accent: quotaMet ? COL.green : COL.red })) {
      n.minutes = n.endMinutes;
      this.ledgerOpen = false;
    }
    text(ctx, t("ledger.close"), x + 12, y + h - 20, { font: "small", color: COL.dim });
  }
}

// ---------- colour helpers ----------
export function shade(hex: string, amt: number): string {
  const n = parseInt(hex.slice(1), 16);
  let r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
  const f = (v: number) => Math.round(clamp(amt >= 0 ? v + (255 - v) * amt : v * (1 + amt), 0, 255));
  r = f(r); g = f(g); b = f(b);
  return `rgb(${r},${g},${b})`;
}

export function withAlpha(hex: string, a: number): string {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}
