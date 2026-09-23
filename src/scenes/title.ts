// Title screen: rooftop key art, rain, logo, menu and the how-to-play sheet.
import { W, H, img, input, post, setAnalog, type Scene } from "../engine/core";
import { audio } from "../engine/audio";
import { text, para } from "../engine/text";
import { WeatherFx } from "../game/weather";
import { load } from "../game/state";
import { ai } from "../game/ai";
import { COL, panel, button, vignette, grain, letterbox } from "../ui/widgets";
import * as flow from "./flow";

const HELP = [
  ["Goal", "Collect the quota in each district before dawn. Ten districts lead to Madame Hale's tower."],
  ["Street", "Walk with A and D or the arrow keys. Hold Shift to run. Walking uses time. Press E at a door to enter a shop."],
  ["Benches", "Rest on a bench to get composure back. Rest takes 30 minutes. You can hear gossip there."],
  ["Duel", "Break the debtor's resolve to collect. If anger gets to the top, the debtor throws you out."],
  ["Tactics", "Each debtor has hidden traits. Use Read to find them. Match the tactic to the trait. Chain tactics for combos."],
  ["Say it", "Type your own line. The AI judge reads the tactic and the fit with the debtor. Use intel in your line for a bonus."],
  ["Intel", "A debtor who pays tells you gossip. A secret unlocks Leverage. A hardship makes Charm and Offer stronger."],
  ["Heat", "Pressure and threats add heat. At full heat a patrol stops you. You lose one hour."],
  ["Reputation", "Fear and grace change how the next debtors react. They also decide the ending."],
];

export class TitleScene implements Scene {
  private t = 0;
  private fx = new WeatherFx("rain", 0.8, H + 40);
  private help = false;
  private hasSave = false;

  enter() {
    this.hasSave = !!load();
    audio.playMusic("mus_theme", 2);
    audio.playAmb("amb_rain");
  }

  update(dt: number) {
    this.t += dt;
    this.fx.update(dt);
    if (this.help && (input.pressed("back") || input.pressed("ok"))) this.help = false;
    else if (!this.help && input.pressed("ok")) this.start(this.hasSave);
  }

  private start(cont: boolean) {
    audio.unlock();
    audio.sfx("ui_ok");
    if (cont) flow.continueGame();
    else flow.newGame();
  }

  draw(ctx: CanvasRenderingContext2D) {
    const bg = img("cine_rooftop");
    if (bg) {
      const z = 1.12 - Math.min(1, this.t / 30) * 0.06;
      const cover = Math.max(W / bg.width, H / bg.height) * z;
      const dw = bg.width * cover, dh = bg.height * cover;
      ctx.drawImage(bg, (W - dw) / 2, (H - dh) / 2 + Math.sin(this.t * 0.2) * 3, dw, dh);
    }
    this.fx.draw(ctx);
    const g = ctx.createLinearGradient(0, 0, W * 0.6, 0);
    g.addColorStop(0, "rgba(6,4,12,0.85)");
    g.addColorStop(1, "rgba(6,4,12,0)");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
    vignette(ctx, 0.6);
    letterbox(ctx, 1, 22);
    const a = Math.min(1, this.t / 1.5);
    // logo with a slow neon flicker
    const flick = Math.sin(this.t * 23) > 0.97 ? 0.6 : 1;
    ctx.globalAlpha = a;
    text(ctx, "CITY", 36, 60, { font: "big", color: COL.paper, shadow: "#3a0a14" });
    text(ctx, "LADY", 36, 108, { font: "big", color: COL.crimson, shadow: "#1a0006", alpha: flick });
    ctx.fillStyle = COL.gold;
    ctx.fillRect(38, 160, 186, 1);
    text(ctx, "TEN NIGHTS. TEN DISTRICTS. ONE LEDGER.", 38, 166, { font: "small", color: COL.gold });

    if (!this.help) {
      let y = 178;
      if (this.hasSave) {
        if (button(ctx, "cont", "Continue", 36, y, 160, 22, { key: "E" })) this.start(true);
        y += 27;
      }
      if (button(ctx, "new", "New game", 36, y, 160, 22, { key: this.hasSave ? undefined : "E" })) this.start(false);
      y += 27;
      if (button(ctx, "help", "How to play", 36, y, 160, 22, {})) this.help = true;
      y += 27;
      const muted = audio.volumes.master === 0;
      if (button(ctx, "snd", muted ? "Sound: off" : "Sound: on", 36, y, 160, 22, { key: "M" })) {
        audio.unlock();
        audio.volumes.master = muted ? 0.9 : 0;
        audio.applyVolumes();
      }
      y += 27;
      const analog = (post?.amount ?? 0) > 0;
      if (button(ctx, "vhs", analog ? "Analog look: on" : "Analog look: off", 36, y, 160, 22, { key: "V" })) setAnalog(analog ? 0 : 1);
      text(ctx, ai.status === "online" ? "AI judge: Jev online" : ai.status === "checking" ? "AI judge: checking" : "AI judge: local rules", 36, 318, { font: "small", color: ai.status === "online" ? COL.violet : COL.dim });
    } else {
      panel(ctx, 24, 30, W - 48, H - 60, COL.gold, "rgba(14,9,20,0.96)");
      text(ctx, "HOW TO PLAY", 38, 38, { font: "title", color: COL.gold });
      let y = 62;
      for (const [h, body] of HELP) {
        text(ctx, h.toUpperCase(), 38, y + 1, { font: "small", color: COL.crimson });
        y += para(ctx, body, 120, y, W - 170, { color: COL.paper }) + 5;
      }
      if (button(ctx, "back", "Back", W - 110, H - 56, 80, 20, { key: "ESC" })) this.help = false;
    }
    ctx.globalAlpha = 1;
    grain(ctx, 0.07);
  }
}
