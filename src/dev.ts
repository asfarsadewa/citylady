// Dev-only viewer: Vela at 4x, walking and idling, for tuning the sprite rig.
import { W, H, input, type Scene } from "./engine/core";
import { Vela } from "./game/vela";
import { text } from "./engine/text";

export class VelaViewer implements Scene {
  private v = new Vela(80, 80);
  private small = document.createElement("canvas");
  private t = 0;
  private auto = true;
  constructor() {
    this.small.width = 160;
    this.small.height = 90;
  }
  update(dt: number) {
    this.t += dt;
    let vx = 0;
    if (input.down("left")) { vx = -58; this.auto = false; }
    if (input.down("right")) { vx = 58; this.auto = false; }
    if (input.down("run")) vx *= 1.65;
    if (this.auto) {
      const ph = this.t % 8;
      vx = ph < 2.5 ? 58 : ph < 4 ? 0 : ph < 6.5 ? -58 : 0;
    }
    this.v.update(dt, vx);
    if (this.v.x > 130) this.v.x = 130;
    if (this.v.x < 30) this.v.x = 30;
  }
  draw(ctx: CanvasRenderingContext2D) {
    const g = this.small.getContext("2d")!;
    g.fillStyle = "#2a2140";
    g.fillRect(0, 0, 160, 90);
    g.fillStyle = "#1a1428";
    g.fillRect(0, 80, 160, 10);
    this.v.draw(g, this.v.x, 80);
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(this.small, 0, 0, 160, 90, 0, 0, W, H);
    text(ctx, "A/D walk, SHIFT run", 8, 8, { font: "small" });
  }
}
