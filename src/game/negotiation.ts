// Negotiation rules: tactics, trait multipliers, combos, debtor counter-moves and outcomes.
import { TRAITS, type Trait } from "./data";
import { t as tr, type Key } from "../i18n";
import { has, type Intel, type Night, type Run, type Shop } from "./state";

export type Tactic = "charm" | "press" | "reason" | "leverage" | "offer" | "read" | "improvise";
export type Move = "stall" | "plead" | "bluster" | "bargain" | "crack" | "pay";

// names are English for the AI judge; the UI shows tac.<id> from the i18n tables
export const TACTICS: { id: Tactic; name: string; cost: number }[] = [
  { id: "charm", name: "Charm", cost: 4 },
  { id: "press", name: "Pressure", cost: 8 },
  { id: "reason", name: "Reason", cost: 4 },
  { id: "offer", name: "Offer", cost: 3 },
  { id: "leverage", name: "Leverage", cost: 10 },
  { id: "read", name: "Read", cost: 2 },
  { id: "improvise", name: "Say it", cost: 6 },
];

// id is the i18n suffix: combo.<id>
export const COMBOS: Record<string, { id: string; mult: number }> = {
  "press>charm": { id: "velvet", mult: 1.45 },
  "reason>offer": { id: "close", mult: 1.35 },
  "leverage>press": { id: "checkmate", mult: 1.5 },
  "charm>leverage": { id: "honey", mult: 1.3 },
  "read>leverage": { id: "coldread", mult: 1.25 },
};

export interface LineJudgment {
  tactic: Exclude<Tactic, "read" | "improvise"> | "nonsense";
  fit: number; // 0..1
  usesFact: number;
  abusive: number;
  source: "jev" | "local";
}

export interface Duel {
  shop: Shop;
  banker: boolean;
  resolve: number;
  maxResolve: number;
  temper: number;
  demanded: number;
  offer: number | null;
  history: Tactic[];
  transcript: string[];
  lastMove: Move | null;
  readBonus: boolean;
  discount: number;
  /** the "half tonight" opening: the other half becomes a note */
  half: boolean;
  lastPlead: boolean;
  done: null | "paid" | "settled" | "thrown" | "left" | "closed";
  paid: number;
}

export function startDuel(run: Run, shop: Shop, banker = false): Duel {
  const t = shop.traits;
  let resolve = banker ? 160 : 100;
  // reputation travels ahead of Vela
  resolve -= (run.fear / 100) * t.fear * 8;
  resolve += (run.fear / 100) * t.pride * 5;
  resolve -= (run.grace / 100) * t.heart * 8;
  resolve += (run.grace / 100) * t.greed * 4;
  return {
    shop, banker,
    resolve: Math.round(resolve), maxResolve: Math.round(resolve),
    temper: banker ? 10 : 0,
    demanded: shop.debt, offer: null, history: [], transcript: [], lastMove: null,
    readBonus: false, discount: 0, half: false, lastPlead: false, done: null, paid: 0,
  };
}

export type Opening = "debt" | "fee" | "half";
export function applyOpening(run: Run, d: Duel, o: Opening) {
  if (o === "fee") {
    d.demanded = Math.round((d.shop.debt * 1.25) / 10) * 10;
    d.resolve += 15;
    d.maxResolve += 15;
    run.fear = Math.min(100, run.fear + 2);
  } else if (o === "half") {
    d.demanded = Math.round((d.shop.debt * 0.5) / 10) * 10;
    d.half = true;
    d.resolve -= 25;
    run.grace = Math.min(100, run.grace + 3);
  }
}

export function intelFor(night: Night, d: Duel): Intel[] {
  return night.intel.filter((i) => (d.banker ? i.shopId === -1 : i.shopId === d.shop.id));
}

export interface ActionResult {
  damage: number;
  temper: number;
  combo: string | null;
  note: string;
  revealed?: Trait;
  effectiveness: number; // multiplier shown to the player
}

/** Applies a tactic. For "improvise", pass the judgment. Returns what happened. */
export function act(run: Run, night: Night, d: Duel, tactic: Tactic, rand: () => number, j?: LineJudgment): ActionResult {
  const t = d.shop.traits;
  const intel = intelFor(night, d);
  const hasSecret = intel.some((i) => i.kind === "secret");
  const hasHardship = intel.some((i) => i.kind === "hardship");
  const last = d.history[d.history.length - 1];
  let eff = 1;
  let base = 0;
  let temper = 0;
  let note = "";
  let combo: string | null = null;
  let revealed: Trait | undefined;
  const cost = TACTICS.find((x) => x.id === tactic)!.cost;
  night.composure = Math.max(0, night.composure - cost);

  let kind: string = tactic;
  if (tactic === "improvise" && j) {
    kind = j.tactic;
    if (j.tactic === "nonsense") {
      d.history.push(tactic);
      return { damage: 0, temper: 4, combo: null, note: tr("note.nonsense"), effectiveness: 0 };
    }
  }

  switch (kind) {
    case "charm":
      base = 14;
      eff = 0.55 + 0.35 * t.heart + 0.15 * t.pride - 0.1 * t.logic;
      if (hasHardship) eff *= 1.35;
      if (has(run, "silk")) eff *= 1.3;
      temper = -5;
      run.grace = Math.min(100, run.grace + 1);
      break;
    case "press":
      base = 20;
      eff = 0.45 + 0.45 * t.fear - 0.15 * t.pride;
      temper = (10 + 9 * t.pride - 3 * t.fear) * (has(run, "stare") ? 0.6 : 1);
      night.heat += 5;
      run.fear = Math.min(100, run.fear + 1.5);
      if (d.lastPlead) {
        run.fear = Math.min(100, run.fear + 2);
        run.grace = Math.max(0, run.grace - 2);
      }
      break;
    case "reason":
      base = 15;
      eff = 0.55 + 0.4 * t.logic + 0.1 * t.greed - 0.1 * t.heart;
      if (has(run, "card")) eff *= 1.3;
      temper = -2;
      break;
    case "offer":
      base = 17;
      eff = 0.5 + 0.45 * t.greed + 0.1 * t.logic;
      if (hasHardship) eff *= 1.25;
      temper = -6;
      if (d.discount < 3 && tactic === "offer") {
        d.discount++;
        d.demanded = Math.round((d.demanded * 0.85) / 10) * 10;
      }
      run.grace = Math.min(100, run.grace + 1.5);
      break;
    case "leverage":
      base = 34;
      eff = hasSecret ? 1 + 0.2 * t.pride + 0.2 * t.fear : 0.25;
      if (!hasSecret) note = tr("note.no_secret");
      if (d.banker && hasSecret) eff *= 1 + 0.35 * intel.length;
      temper = 12;
      night.heat += 3;
      run.fear = Math.min(100, run.fear + 2);
      break;
    case "read": {
      const hidden = TRAITS.filter((k) => !d.shop.revealed.includes(k)).sort((a, b) => d.shop.traits[b] - d.shop.traits[a]);
      if (hidden.length) {
        revealed = hidden[0];
        d.shop.revealed.push(revealed);
        note = t[revealed] > 0
          ? tr("note.read_is", { trait: tr(`deg.${revealed}.${t[revealed]}` as Key) })
          : tr("note.read_not", { trait: tr(`trait.${revealed}` as Key).toLowerCase() });
      } else note = tr("note.read_known");
      d.readBonus = true;
      d.history.push("read");
      return { damage: 0, temper: 0, combo: null, note, revealed, effectiveness: 0 };
    }
  }

  // improvised lines: Jev decides how well the words fit this debtor
  if (tactic === "improvise" && j) {
    const fitMult = 0.3 + 1.9 * j.fit;
    eff = Math.max(0.2, eff * 0.5 + fitMult * 0.7);
    if (j.usesFact > 0.6) eff *= 1.3;
    if (has(run, "velvet")) eff *= 1.25;
    if (j.abusive > 0.6) {
      temper += 40;
      eff *= 0.3;
      night.heat += 10;
      run.fear = Math.min(100, run.fear + 3);
      note = tr("note.abusive");
    }
  }

  // repetition and combos
  const reps = d.history.filter((h) => h === tactic).length;
  if (tactic !== "improvise") {
    if (last === tactic) eff *= 0.55;
    else if (reps >= 2) eff *= 0.75;
  }
  const lastKind = last;
  const key = `${lastKind}>${kind}`;
  if (COMBOS[key]) {
    combo = COMBOS[key].id;
    eff *= COMBOS[key].mult;
  }
  if (d.readBonus) {
    eff *= 1.3;
    d.readBonus = false;
  }
  if (night.composure <= 0) eff *= 0.6;
  const damage = Math.max(0, Math.round(base * eff * (0.88 + rand() * 0.24)));
  d.resolve -= damage;
  d.temper = Math.max(0, Math.min(100, d.temper + temper));
  d.history.push(tactic);
  return { damage, temper, combo, note, effectiveness: eff };
}


export function allowedMoves(d: Duel): Move[] {
  const t = d.shop.traits;
  const m: Move[] = ["stall"];
  if (d.resolve <= 18) m.push("pay");
  if (d.resolve <= 65 && d.offer === null) m.push("bargain");
  if (TRAITS.some((k) => !d.shop.revealed.includes(k) && t[k] > 0) && d.resolve < 75) m.push("crack");
  if (d.temper >= 25) m.push("bluster");
  if (!d.banker && (t.heart >= 1 || t.fear >= 2)) m.push("plead");
  return m;
}

/** Local counter-move model, used when Jev is not available. */
export function localMoveWeights(d: Duel): Record<string, number> {
  const t = d.shop.traits;
  const w: Record<string, number> = {};
  for (const m of allowedMoves(d)) {
    w[m] =
      m === "stall" ? 1 + t.logic * 0.3 + d.resolve / 60 :
      m === "pay" ? 1.5 + (18 - d.resolve) / 6 :
      m === "bargain" ? 0.8 + t.greed * 0.5 + t.logic * 0.2 :
      m === "crack" ? 0.6 + t.fear * 0.4 :
      m === "bluster" ? 0.4 + t.pride * 0.5 + d.temper / 40 :
      0.5 + t.heart * 0.5 + t.fear * 0.2;
  }
  return w;
}

export function sample(w: Record<string, number>, rand: () => number): string {
  const entries = Object.entries(w).filter(([, v]) => v > 0);
  const total = entries.reduce((s, [, v]) => s + v, 0);
  let r = rand() * total;
  for (const [k, v] of entries) {
    r -= v;
    if (r <= 0) return k;
  }
  return entries[0]?.[0] ?? "stall";
}

export interface MoveResult {
  move: Move;
  note: string;
  revealed?: Trait;
}

export function applyMove(night: Night, d: Duel, move: Move, rand: () => number): MoveResult {
  const t = d.shop.traits;
  d.lastMove = move;
  d.lastPlead = move === "plead";
  switch (move) {
    case "stall":
      d.resolve += 4 + t.logic * 1.5;
      return { move, note: tr("move.stall") };
    case "plead":
      night.composure = Math.max(0, night.composure - 7);
      return { move, note: tr("move.plead") };
    case "bluster":
      d.temper = Math.min(100, d.temper + 8);
      night.composure = Math.max(0, night.composure - 8);
      night.heat += 2;
      return { move, note: tr("move.bluster") };
    case "bargain": {
      const frac = Math.max(0.2, Math.min(0.9, 1 - d.resolve / d.maxResolve));
      const amt = Math.min(d.shop.cash, Math.round((d.demanded * frac * (0.9 + rand() * 0.2)) / 10) * 10);
      d.offer = Math.max(10, amt);
      return { move, note: tr("move.bargain", { v: d.offer }) };
    }
    case "crack": {
      const hidden = TRAITS.filter((k) => !d.shop.revealed.includes(k) && t[k] > 0).sort((a, b) => t[b] - t[a]);
      const revealed = hidden[0];
      if (revealed) d.shop.revealed.push(revealed);
      d.resolve -= 4;
      return { move, note: tr("move.crack"), revealed };
    }
    case "pay":
      d.resolve = 0;
      return { move, note: tr("move.pay") };
  }
}

/** Heuristic line judge for offline play. Keyword tactic plus trait fit. */
export function localJudge(line: string, d: Duel, known: string[]): LineJudgment {
  const s = line.toLowerCase();
  const score = (words: string[]) => words.reduce((n, w) => n + (s.includes(w) ? 1 : 0), 0);
  const kinds = {
    // English, Bahasa Indonesia and Chinese cues, so offline play understands all three languages
    charm: score(["please", "friend", "lovely", "like you", "trust", "sorry", "understand", "beautiful", "kind", "together", "help",
      "tolong", "teman", "cantik", "suka", "percaya", "maaf", "mengerti", "baik", "bersama", "bantu",
      "请", "朋友", "漂亮", "喜欢", "信任", "抱歉", "理解", "帮", "一起"]),
    press: score(["or else", "tomorrow", "regret", "consequence", "last chance", "police", "board", "lose", "burn", "break", "now!", "warning",
      "kalau tidak", "besok", "menyesal", "akibat", "kesempatan terakhir", "polisi", "sekarang", "awas",
      "否则", "明天", "后悔", "后果", "最后", "警察", "马上", "警告"]),
    reason: score(["interest", "contract", "numbers", "signed", "fair", "cost", "math", "percent", "law", "agreed", "sense",
      "bunga", "kontrak", "angka", "tanda tangan", "adil", "hitung", "persen", "hukum", "setuju", "masuk akal",
      "利息", "合同", "数字", "签", "公平", "成本", "百分", "法律", "道理"]),
    offer: score(["discount", "half", "deal", "plan", "forget the fee", "installment", "less", "off", "offer", "split",
      "diskon", "separuh", "setengah", "kesepakatan", "cicil", "potong", "tawar", "bagi",
      "折", "一半", "交易", "分期", "便宜", "让", "减"]),
    leverage: score(["secret", "i know", "heard", "rumor", "your wife", "your husband", "gamble", "stolen", "books", "hide",
      "rahasia", "aku tahu", "dengar", "gosip", "judi", "curian", "sembunyi",
      "秘密", "我知道", "听说", "传闻", "赌", "偷", "藏"]),
  };
  const best = (Object.entries(kinds) as [keyof typeof kinds, number][]).sort((a, b) => b[1] - a[1])[0];
  const tactic = best[1] === 0 ? (line.trim().length > 12 ? "reason" : "nonsense") : best[0];
  const t = d.shop.traits;
  const fitRaw: Record<string, number> = {
    charm: t.heart + t.pride * 0.5, press: t.fear - t.pride * 0.5, reason: t.logic, offer: t.greed, leverage: 2, nonsense: 0,
  };
  const fit = Math.max(0, Math.min(1, 0.25 + fitRaw[tactic] / 4));
  const usesFact = known.some((k) => k.toLowerCase().split(" ").filter((w) => w.length > 5).some((w) => s.includes(w))) ? 0.8 : 0.1;
  const abusive = score(["kill", "hurt you", "whore", "bitch", "die", "bunuh", "mati kau", "杀了你", "去死"]) > 0 ? 0.9 : 0;
  return { tactic: tactic as LineJudgment["tactic"], fit, usesFact, abusive, source: "local" };
}
