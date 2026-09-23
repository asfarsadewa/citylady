// City Lady: boot, load fonts and art, then show the title screen.
import { start, go, loadImages, debugState, W, H, type Scene } from "./engine/core";
import { loadFonts, text } from "./engine/text";
import { audio } from "./engine/audio";
import { DISTRICTS, SHOP_TYPES, PORTRAITS } from "./game/data";
import { initAI } from "./game/ai";
import { TitleScene } from "./scenes/title";
import * as flow from "./scenes/flow";
import { newRun } from "./game/state";
import { COL, bar } from "./ui/widgets";

const IMAGES = [
  ...DISTRICTS.map((d) => d.sky),
  ...SHOP_TYPES.map((s) => s.sprite), "shop_bank", "shop_flat", "shop_shutter", "shop_alley",
  ...Object.keys(PORTRAITS), "d_banker",
  "vela_atlas", "npc_atlas", "vela_face", "vela_smirk", "vela_cold", "vela_soft", "vela_tired", "vela_shoulder",
  "cine_ledger", "cine_banker", "cine_rooftop", "cine_street", "cine_hall", "cine_dawn", "cine_throne", "cine_fail",
];

class Loading implements Scene {
  p = 0;
  update() {}
  draw(ctx: CanvasRenderingContext2D) {
    text(ctx, "CITY LADY", W / 2, H / 2 - 30, { font: "title", color: COL.crimson, align: "center" });
    bar(ctx, W / 2 - 80, H / 2, 160, 3, this.p, COL.gold);
  }
}

async function boot() {
  const canvas = document.getElementById("game") as HTMLCanvasElement;
  await loadFonts();
  const loading = new Loading();
  start(canvas);
  go(loading);
  await loadImages(IMAGES, (f) => (loading.p = f));
  console.info("[boot] images", IMAGES.length);
  initAI();
  const unlock = () => {
    audio.unlock();
    audio.preload(["audio/music/mus_walk.m4a", "audio/music/mus_duel.m4a", "audio/sfx/ui_ok.mp3", "audio/sfx/ui_move.mp3"]);
  };
  addEventListener("pointerdown", unlock, { once: true });
  addEventListener("keydown", unlock, { once: true });
  if (import.meta.env.DEV) {
    const w = window as unknown as Record<string, unknown>;
    w.__dbg = debugState;
    w.__flow = flow;
    const hold = (code: string, ms: number) =>
      new Promise((r) => {
        dispatchEvent(new KeyboardEvent("keydown", { code }));
        setTimeout(() => { dispatchEvent(new KeyboardEvent("keyup", { code })); r("ok"); }, ms);
      });
    w.hold = hold;
    w.tap = (code: string) => hold(code, 60);
    w.sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
  }
  const q = new URLSearchParams(location.search);
  if (import.meta.env.DEV && q.has("vela")) {
    const { VelaViewer } = await import("./dev");
    return go(new VelaViewer(), 3);
  }
  if (import.meta.env.DEV && q.has("district")) {
    const run = newRun();
    run.district = Number(q.get("district")) || 0;
    run.purse = 3000;
    return flow.startDistrict(run);
  }
  go(new TitleScene(), 1.2);
}

boot();
