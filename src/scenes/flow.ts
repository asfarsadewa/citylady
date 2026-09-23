// Scene routing for a run: intro, districts, duels, the ledger between nights, finale, endings.
import { go } from "../engine/core";
import { audio } from "../engine/audio";
import { DISTRICTS, BANKER_SECRETS } from "../game/data";
import { generateNight, newRun, save, load, clearSave, type Run, type Night, type Shop } from "../game/state";
import { CinematicScene, type Shot } from "./cinematic";
import { StreetScene } from "./street";
import { DuelScene } from "./duel";
import { NightEndScene } from "./nightend";
import { TitleScene } from "./title";
import { CreditsScene } from "./credits";
import { t, type Key } from "../i18n";

let street: StreetScene | null = null;

export function toTitle() {
  street = null;
  go(new TitleScene(), 1.5);
}

export function newGame() {
  const run = newRun();
  clearSave();
  const shots: Shot[] = [
    { img: "cine_ledger", from: [0, 0.3, 1.12], to: [0.1, -0.2, 1.02], line: "intro_1", weather: "rain", dur: 5 },
    { img: "cine_banker", from: [-0.4, 0, 1.15], to: [0.3, 0, 1.05], line: "intro_2", dur: 6 },
    { img: "cine_banker", from: [0.3, 0, 1.05], to: [0.5, -0.3, 1.3], line: "intro_3" },
    { img: "cine_rooftop", from: [0, 1, 1.3], to: [0, -0.2, 1.02], line: "intro_4", weather: "wind", dur: 7 },
    { img: "cine_street", from: [0, -0.6, 1.1], to: [0, 0.2, 1.25], line: "intro_5", weather: "rain" },
    { img: "cine_street", from: [0, 0.2, 1.25], to: [0, 0.4, 1.4], line: "intro_6", weather: "rain", sfx: "braam" },
  ];
  go(new CinematicScene(shots, () => startDistrict(run), "mus_theme"), 1.2);
}

export function continueGame() {
  const run = load();
  if (!run) return newGame();
  startDistrict(run);
}

export function startDistrict(run: Run) {
  save(run);
  const night = generateNight(run);
  night.collected += night.notesPaid;
  run.night = night;
  const d = DISTRICTS[run.district];
  street = new StreetScene(run, night);
  for (const l of night.log) street.toast(t(l.key, l.params), "#5ad1c8");
  const shots: Shot[] = [
    { img: d.sky, from: [-1, -0.2, 1.0], to: [-0.4, 0, 1.0], title: t(`district.${d.id}` as Key).toUpperCase(), sub: t("intro.night", { n: run.district + 1, q: night.quota }), dur: 4, weather: d.weather, sfx: "bell_toll" },
    { img: d.sky, from: [-0.4, 0, 1.0], to: [0.4, 0.2, 1.12], line: `d${run.district + 1}`, weather: d.weather },
  ];
  const s = street;
  go(new CinematicScene(shots, () => go(s, 2), "mus_theme"), 1.2);
}

export function toDuel(run: Run, night: Night, shop: Shop, back: StreetScene) {
  go(new DuelScene(run, night, shop, back), 3);
}

export function backToStreet(s: { enter(): void }) {
  go(s as StreetScene, 3);
}

export function toNightEnd(run: Run) {
  go(new NightEndScene(run), 1);
}

export function toFinale(run: Run) {
  const banker: Shop = {
    id: -1, type: "bank", label: "Bank", name: "The Lantern Bank", sprite: "shop_bank", owner: t("name.hale"),
    portrait: "d_banker", voice: "banker",
    traits: { pride: 3, fear: 0, greed: 2, heart: 0, logic: 3 }, revealed: [],
    debt: 100000, cash: 100000, opens: 0, closes: 9999, x: 0, width: 0, status: "open", collected: 0,
    secret: "", hardship: "", stash: "", secretIdx: 0, hardshipIdx: 0, stashIdx: 0, visits: 1,
  };
  const night = run.night!;
  // intel about the banker is carried as shopId -1
  night.intel = night.intel.filter((i) => i.shopId !== -1);
  for (const b of run.bankerIntel) night.intel.push({ shopId: -1, kind: "secret", idx: Math.max(0, BANKER_SECRETS.indexOf(b)) });
  night.composure = night.maxComposure;
  const shots: Shot[] = [
    { img: "cine_hall", from: [0, 0.6, 1.0], to: [0, -0.2, 1.35], dur: 6, weather: "embers", sfx: "braam" },
  ];
  go(new CinematicScene(shots, () => go(new DuelScene(run, night, banker, null, true), 1.5), "mus_duel"), 1);
}

export function toEnding(kind: "grace" | "fear" | "fail") {
  const shots: Shot[] =
    kind === "grace"
      ? [
          { img: "cine_dawn", from: [-0.6, 0, 1.2], to: [0.2, 0, 1.02], line: "end_grace_1", dur: 7 },
          { img: "cine_dawn", from: [0.2, 0, 1.02], to: [0.4, -0.2, 1.25], line: "end_grace_2", dur: 7 },
        ]
      : kind === "fear"
        ? [
            { img: "cine_throne", from: [0, 0.4, 1.3], to: [0, 0, 1.05], line: "end_fear_1", dur: 7 },
            { img: "cine_throne", from: [0, 0, 1.05], to: [0, -0.3, 1.2], line: "end_fear_2", dur: 7 },
          ]
        : [
            { img: "cine_fail", from: [0, 0, 1.25], to: [0, 0.2, 1.05], line: "end_fail_1", weather: "rain", dur: 6 },
            { img: "cine_fail", from: [0, 0.2, 1.05], to: [0, 0.3, 1.1], title: t("fail.title"), sub: t("fail.sub"), weather: "rain", dur: 5 },
          ];
  if (kind !== "fail") clearSave();
  const credits = () => go(new CreditsScene(kind === "grace" ? t("cr.ending_dawn") : t("cr.ending_chair"), toTitle), 0.8);
  go(new CinematicScene(shots, () => (kind === "fail" ? retryNight() : credits()), kind === "fail" ? null : "mus_dawn"), 0.8);
  if (kind === "fail") audio.playMusic(null);
}

export function retryNight() {
  const run = load();
  if (run) startDistrict(run);
  else toTitle();
}

export function currentStreet() {
  return street;
}
