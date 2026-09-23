// Run state, seeded RNG, procedural district generation and save/load.
import artmeta from "../data/artmeta.json";
import { DISTRICTS, SHOP_TYPES, PORTRAITS, SECRETS, STASH_SPOTS, BANKER_SECRETS, TRAITS, type Trait, type Voice } from "./data";

export function rng(seed: number) {
  let s = seed >>> 0 || 1;
  const next = () => {
    s ^= s << 13; s >>>= 0;
    s ^= s >> 17;
    s ^= s << 5; s >>>= 0;
    return s / 4294967296;
  };
  return {
    next,
    int: (a: number, b: number) => a + Math.floor(next() * (b - a + 1)),
    pick: <T>(arr: T[]): T => arr[Math.floor(next() * arr.length)],
    chance: (p: number) => next() < p,
    shuffle: <T>(arr: T[]): T[] => {
      const a = arr.slice();
      for (let i = a.length - 1; i > 0; i--) {
        const j = Math.floor(next() * (i + 1));
        [a[i], a[j]] = [a[j], a[i]];
      }
      return a;
    },
  };
}
export type Rng = ReturnType<typeof rng>;

export interface Intel {
  shopId: number; // -1 = the Banker
  kind: "secret" | "hardship" | "stash";
  text: string;
}

export interface Shop {
  id: number;
  type: string;
  label: string;
  name: string;
  sprite: string;
  owner: string;
  portrait: string;
  voice: Voice;
  traits: Record<Trait, number>;
  revealed: Trait[];
  debt: number;
  cash: number;
  opens: number; // minutes after 20:00
  closes: number;
  x: number; // door centre in street coordinates
  width: number;
  status: "open" | "paid" | "partial" | "banned";
  collected: number;
  secret: string;
  hardship: string;
  stash: string;
  visits: number;
}

export interface Note {
  from: string;
  amount: number;
  reliability: number;
}

export interface Night {
  seed: number;
  shops: Shop[];
  fillers: { x: number; sprite: string; width: number }[];
  benches: number[];
  lamps: number[];
  length: number;
  quota: number;
  minutes: number; // elapsed since 20:00
  endMinutes: number;
  collected: number;
  heat: number;
  composure: number;
  maxComposure: number;
  intel: Intel[];
  x: number;
  notesPaid: number;
  log: string[];
}

export interface Run {
  district: number;
  purse: number;
  total: number;
  fear: number;
  grace: number;
  perks: string[];
  notes: Note[];
  bankerIntel: string[];
  seed: number;
  night: Night | null;
  aiUsed: number;
}

export const SHOP_W = 190;
const META = artmeta as Record<string, { w: number }>;
const spriteW = (k: string, fallback: number) => Math.min(300, META[k]?.w ?? fallback);
const SAVE_KEY = "citylady.save.v1";

export function newRun(): Run {
  return { district: 0, purse: 0, total: 0, fear: 0, grace: 0, perks: [], notes: [], bankerIntel: [], seed: (Math.random() * 1e9) | 0, night: null, aiUsed: 0 };
}

export const has = (run: Run, perk: string) => run.perks.includes(perk);

export function traitWords(t: Record<Trait, number>): string[] {
  const words: Record<Trait, string[]> = {
    pride: ["", "a little proud", "proud", "very proud and easily offended"],
    fear: ["", "a little nervous", "fearful", "terrified of trouble"],
    greed: ["", "careful with money", "greedy", "loves a good deal above all"],
    heart: ["", "kind", "soft-hearted", "deeply sentimental"],
    logic: ["", "practical", "rational", "cold and calculating"],
  };
  return TRAITS.filter((k) => t[k] > 0).sort((a, b) => t[b] - t[a]).map((k) => words[k][t[k]]);
}

export function generateNight(run: Run): Night {
  const d = DISTRICTS[run.district];
  const seed = (run.seed + run.district * 7919) >>> 0;
  const r = rng(seed);
  const types = r.shuffle(SHOP_TYPES.filter((t) => t.id !== "cabaret" || run.district >= 1));
  const usedPortraits = new Set<string>();
  const shops: Shop[] = [];
  const fillers: Night["fillers"] = [];
  const lamps: number[] = [];
  const benches: number[] = [];
  let x = 260;
  const n = d.shops;
  for (let i = 0; i < n; i++) {
    const t = types[i % types.length];
    const portrait = t.portraits.find((p) => !usedPortraits.has(p)) ?? r.pick(Object.keys(PORTRAITS).filter((p) => !usedPortraits.has(p)));
    usedPortraits.add(portrait);
    const pd = PORTRAITS[portrait];
    const traits = { pride: 0, fear: 0, greed: 0, heart: 0, logic: 0 } as Record<Trait, number>;
    const [major, minor] = r.shuffle(TRAITS);
    traits[major] = 3;
    traits[minor] = 2;
    for (const k of TRAITS) {
      if (k !== major && k !== minor) traits[k] = r.chance(0.35) ? 1 : 0;
      traits[k] = Math.min(3, traits[k] + ((t.bias[k] ?? 0) + (pd.bias[k] ?? 0) >= 2 && traits[k] < 2 ? 1 : 0));
    }
    const debt = Math.round((r.int(140, 340) * d.debtScale) / 10) * 10;
    const cashRatio = r.chance(0.25) ? r.next() * 0.4 + 0.45 : r.next() * 0.7 + 1.0;
    const late = t.late || r.chance(0.18);
    const sw = spriteW(t.sprite, SHOP_W) + 6;
    const early = !late && r.chance(0.22);
    shops.push({
      id: i,
      type: t.id,
      label: t.label,
      name: r.pick(t.names),
      sprite: t.sprite,
      owner: r.pick(pd.names),
      portrait,
      voice: pd.voice,
      traits,
      revealed: [],
      debt,
      cash: Math.round((debt * cashRatio) / 10) * 10,
      opens: late ? 180 : 0,
      closes: late ? 540 : early ? 180 : 390,
      x: x + sw / 2,
      width: sw,
      status: "open",
      collected: 0,
      secret: r.pick(SECRETS),
      hardship: r.pick(t.hardship),
      stash: r.pick(STASH_SPOTS),
      visits: 0,
    });
    lamps.push(x - 6);
    x += sw;
    if (i < n - 1) {
      const f = r.pick(["shop_flat", "shop_shutter", "shop_alley"]);
      const fw = spriteW(f, 120) + 4;
      fillers.push({ x: x + fw / 2, sprite: f, width: fw });
      if (r.chance(0.55) || i === 1) benches.push(x + fw / 2);
      x += fw;
    }
  }
  lamps.push(x + 10);
  const length = x + 260;
  const quota = Math.round((shops.reduce((s, sh) => s + sh.debt, 0) * d.quotaRatio) / 50) * 50;
  const maxComposure = 100 + (has(run, "lipstick") ? 30 : 0);
  const night: Night = {
    seed, shops, fillers, benches, lamps, length, quota,
    minutes: 0,
    endMinutes: 540 + (has(run, "watch") ? 45 : 0),
    collected: 0,
    heat: 0,
    composure: maxComposure,
    maxComposure,
    intel: [],
    x: 120,
    notesPaid: 0,
    log: [],
  };
  // promissory notes from the last night resolve now
  for (const note of run.notes) {
    if (r.chance(note.reliability)) {
      night.notesPaid += note.amount;
      night.log.push(`${note.from} paid a note of ${note.amount}.`);
    } else night.log.push(`${note.from} did not pay a note of ${note.amount}.`);
  }
  run.notes = [];
  if (has(run, "informant")) {
    for (const s of r.shuffle(shops).slice(0, 2)) night.intel.push(makeIntel(s, r.chance(0.5) ? "secret" : "hardship"));
  }
  return night;
}

export function makeIntel(s: Shop, kind: Intel["kind"]): Intel {
  const text =
    kind === "secret" ? `${s.owner} ${s.secret}.` :
    kind === "hardship" ? `At ${s.name}, ${s.hardship}.` :
    `${s.owner} keeps extra cash in a ${s.stash}.`;
  return { shopId: s.id, kind, text };
}

/** Gossip a paid debtor shares about someone else; may be about the Banker late in the game. */
export function gossip(run: Run, night: Night, from: Shop, r: Rng): Intel | null {
  if (run.district >= 7 && run.bankerIntel.length < BANKER_SECRETS.length && r.chance(0.45)) {
    const text = BANKER_SECRETS[run.bankerIntel.length];
    run.bankerIntel.push(text);
    return { shopId: -1, kind: "secret", text: text.charAt(0).toUpperCase() + text.slice(1) + "." };
  }
  const targets = night.shops.filter((s) => s.id !== from.id && s.status === "open");
  if (!targets.length) return null;
  for (const t of r.shuffle(targets)) {
    const kinds = (["secret", "hardship", "stash"] as const).filter((k) => !night.intel.some((i) => i.shopId === t.id && i.kind === k));
    if (kinds.length) {
      const it = makeIntel(t, r.pick([...kinds]));
      night.intel.push(it);
      return it;
    }
  }
  return null;
}

export function clock(minutes: number): string {
  const total = 20 * 60 + Math.floor(minutes);
  const h = Math.floor(total / 60) % 24;
  const m = total % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

export function save(run: Run) {
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify({ ...run, night: null }));
  } catch { /* storage unavailable */ }
}

export function load(): Run | null {
  try {
    const s = localStorage.getItem(SAVE_KEY);
    return s ? (JSON.parse(s) as Run) : null;
  } catch {
    return null;
  }
}

export function clearSave() {
  try { localStorage.removeItem(SAVE_KEY); } catch { /* ignore */ }
}
