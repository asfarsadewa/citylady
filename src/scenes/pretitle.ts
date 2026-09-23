// Pre-title: browsers only allow sound after a user gesture, so the first input starts the tape.
import { W, H, go, time, type Scene } from "../engine/core";
import { audio } from "../engine/audio";
import { text } from "../engine/text";
import { COL, grain, vignette } from "../ui/widgets";
import { TitleScene } from "./title";
import { t } from "../i18n";

export class PreTitleScene implements Scene {
  private t = 0;
  private started = false;
  private onInput = () => this.begin();

  enter() {
    addEventListener("keydown", this.onInput);
    addEventListener("pointerdown", this.onInput);
  }

  leave() {
    removeEventListener("keydown", this.onInput);
    removeEventListener("pointerdown", this.onInput);
  }

  private begin() {
    if (this.started || this.t < 0.4) return;
    this.started = true;
    audio.unlock();
    audio.sfx("clock_tick", { vol: 0.5, rate: 1.6 });
    go(new TitleScene(), 0.7);
  }

  update(dt: number) {
    this.t += dt;
  }

  draw(ctx: CanvasRenderingContext2D) {
    ctx.fillStyle = "#040308";
    ctx.fillRect(0, 0, W, H);
    // tape noise lines drifting through the black
    for (let i = 0; i < 6; i++) {
      const y = (time * 23 + i * 61) % H;
      ctx.fillStyle = `rgba(120,110,160,${0.03 + (i % 2) * 0.02})`;
      ctx.fillRect(0, Math.round(y), W, 1);
    }
    // VCR on-screen display
    text(ctx, "PLAY", 26, 24, { font: "logoSmall", color: "#e8f0ff", shadow: "#1a2a6a" });
    if (Math.floor(time * 1.6) % 2 === 0) {
      // the font has no play glyph, so the triangle is drawn in pixels
      for (let r = 0; r < 11; r++) {
        const w = 6 - Math.abs(r - 5);
        ctx.fillStyle = "#1a2a6a";
        ctx.fillRect(69, 25 + r, w, 1);
        ctx.fillStyle = "#e8f0ff";
        ctx.fillRect(68, 24 + r, w, 1);
      }
    }
    const secs = Math.floor(this.t);
    const counter = `SP  00:${String(Math.floor(secs / 60)).padStart(2, "0")}:${String(secs % 60).padStart(2, "0")}`;
    text(ctx, counter, W - 26, 24, { font: "logoSmall", color: "#e8f0ff", shadow: "#1a2a6a", align: "right" });
    const a = Math.min(1, this.t / 1.5);
    text(ctx, "CITY LADY", W / 2, H / 2 - 30, { font: "logoSmall", color: COL.crimson, align: "center", alpha: a * 0.9 });
    ctx.fillStyle = `rgba(242,193,78,${a * 0.6})`;
    ctx.fillRect(W / 2 - 40, H / 2 - 8, 80, 1);
    const pulse = 0.45 + 0.55 * Math.abs(Math.sin(time * 2.2));
    text(ctx, t("pre.start"), W / 2, H / 2 + 6, { color: COL.paper, align: "center", alpha: a * pulse });
    text(ctx, t("pre.headphones"), W / 2, H - 40, { font: "small", color: COL.dim, align: "center", alpha: a * 0.8 });
    vignette(ctx, 0.7);
    grain(ctx, 0.08);
  }
}
