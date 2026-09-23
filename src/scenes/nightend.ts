// Dawn: settle the night with Madame Hale, spend the surplus on perks, move to the next district.
import { W, H, img, input, time, type Scene } from "../engine/core";
import { audio } from "../engine/audio";
import { text, para } from "../engine/text";
import { DISTRICTS, PERKS } from "../game/data";
import { has, save, type Run } from "../game/state";
import { COL, panel, button, vignette, grain } from "../ui/widgets";
import voiceData from "../data/voice.json";
import * as flow from "./flow";

const VOICE = voiceData as Record<string, { s: string; t: string }>;

export class NightEndScene implements Scene {
  private t = 0;
  private success: boolean;
  private surplus = 0;
  private line: string;
  private final: boolean;

  constructor(private run: Run) {
    const n = run.night!;
    this.success = n.collected >= n.quota;
    this.final = run.district === DISTRICTS.length - 1;
    if (this.success) {
      this.surplus = n.collected - n.quota;
      run.purse += this.surplus;
      this.line = run.fear > run.grace + 15 ? "hale_fear" : run.grace > run.fear + 15 ? "hale_grace" : `hale_win_${1 + (run.district % 3)}`;
    } else this.line = "hale_fail";
  }

  enter() {
    audio.playMusic(this.success ? "mus_theme" : null, 2);
    audio.playAmb(null);
    audio.sfx(this.success ? "success" : "fail", { vol: 0.8 });
    setTimeout(() => audio.voice(this.line), 900);
  }

  update(dt: number) {
    this.t += dt;
    if (input.pressed("ok") && this.t > 1) this.proceed();
  }

  private proceed() {
    audio.sfx("ui_ok");
    audio.stopVoice();
    if (!this.success) return flow.retryNight();
    if (this.final) return flow.toFinale(this.run);
    this.run.district++;
    this.run.night = null;
    save(this.run);
    flow.startDistrict(this.run);
  }

  draw(ctx: CanvasRenderingContext2D) {
    const run = this.run, n = run.night!;
    const bg = img(this.success ? "cine_banker" : "cine_fail");
    if (bg) {
      const s = 1.08 + Math.sin(time * 0.1) * 0.02;
      ctx.globalAlpha = 0.55;
      ctx.drawImage(bg, (W - bg.width * s) / 2, (H - bg.height * s) / 2, bg.width * s, bg.height * s);
      ctx.globalAlpha = 1;
    }
    vignette(ctx, 0.8);
    const a = Math.min(1, this.t * 2);
    ctx.globalAlpha = a;
    text(ctx, "DAWN", 24, 18, { font: "big", color: this.success ? COL.gold : COL.red });
    text(ctx, DISTRICTS[run.district].name.toUpperCase(), 26, 70, { font: "title", color: COL.paper });
    let y = 98;
    const row = (l: string, v: string, c = COL.paper) => {
      text(ctx, l, 26, y, { color: COL.dim });
      text(ctx, v, 230, y, { color: c, align: "right" });
      y += 14;
    };
    row("Collected", String(n.collected), COL.gold);
    row("Quota", String(n.quota));
    row(this.success ? "Surplus to your purse" : "Short by", this.success ? `+${this.surplus}` : String(n.quota - n.collected), this.success ? COL.green : COL.red);
    row("Purse", String(run.purse), COL.gold);
    row("Fear", String(Math.round(run.fear)), COL.crimson);
    row("Grace", String(Math.round(run.grace)), COL.teal);
    if (run.notes.length) row("Notes due next night", String(run.notes.reduce((s, x) => s + x.amount, 0)), COL.teal);
    y += 6;
    const v = VOICE[this.line];
    text(ctx, "MADAME HALE", 26, y, { font: "small", color: COL.gold });
    para(ctx, `“${v.t}”`, 26, y + 10, 210, { color: COL.paper });

    if (this.success && !this.final) {
      // perk shop
      const px = 262, py = 24;
      panel(ctx, px, py, W - px - 16, H - 70, COL.gold, "rgba(18,11,22,0.92)");
      text(ctx, "SPEND YOUR PURSE", px + 10, py + 8, { font: "title", color: COL.gold });
      text(ctx, "Perks stay for the rest of the run.", px + 10, py + 26, { font: "small", color: COL.dim });
      PERKS.forEach((p, i) => {
        const bx = px + 8 + (i % 2) * 180, by = py + 40 + Math.floor(i / 2) * 58;
        const owned = has(run, p.id);
        const afford = run.purse >= p.cost;
        const clicked = button(ctx, `perk${p.id}`, owned ? `${p.name} ✓` : `${p.name} · ${p.cost}`, bx, by, 174, 52, {
          disabled: owned || !afford, accent: owned ? COL.green : COL.gold, sub: " ",
        });
        para(ctx, p.desc, bx + 8, by + 18, 160, { font: "small", color: owned ? COL.green : afford ? COL.dim : "#4f455c" });
        if (clicked && !owned && afford) {
          run.purse -= p.cost;
          run.perks.push(p.id);
          audio.sfx("coins", { vol: 0.8 });
        }
      });
    }
    const label = !this.success ? "Retry the night" : this.final ? "Climb the Spire" : "Next district";
    if (button(ctx, "go", label, W - 186, H - 38, 170, 26, { key: "E", accent: this.success ? COL.gold : COL.red })) this.proceed();
    if (!this.success && button(ctx, "title", "Title screen", W - 330, H - 38, 130, 26, {})) flow.toTitle();
    ctx.globalAlpha = 1;
    grain(ctx, 0.06);
  }
}
