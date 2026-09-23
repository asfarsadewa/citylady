// Client for the worker's Jev judge. Turnstile unlocks a session; without one the game uses local judgment.
import { localJudge, localMoveWeights, allowedMoves, type Duel, type LineJudgment } from "./negotiation";
import { traitWords } from "./state";

declare global {
  interface Window {
    turnstile?: {
      render(el: HTMLElement, o: Record<string, unknown>): string;
      remove(id: string): void;
    };
  }
}

export const ai = {
  status: "offline" as "offline" | "checking" | "online",
  lastSource: "local" as "jev" | "local",
};

/** Starts Turnstile in the background. The game never waits for it. */
export async function initAI() {
  ai.status = "checking";
  try {
    const cfg: { siteKey?: string; session?: boolean } = await fetch("/api/config").then((r) => (r.ok ? r.json() : Promise.reject(r.status)));
    if (cfg.session) {
      ai.status = "online";
      return;
    }
    if (!cfg.siteKey) throw new Error("no site key");
    await new Promise<void>((res, rej) => {
      const s = document.createElement("script");
      s.src = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
      s.async = true;
      s.onload = () => res();
      s.onerror = () => rej(new Error("turnstile script"));
      document.head.appendChild(s);
    });
    const box = document.getElementById("turnstile")!;
    const token = await new Promise<string>((res, rej) => {
      window.turnstile!.render(box, {
        sitekey: cfg.siteKey,
        theme: "dark",
        appearance: "interaction-only",
        callback: (t: string) => res(t),
        "error-callback": () => rej(new Error("turnstile error")),
      });
    });
    const ok = await fetch("/api/session", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ token }) }).then((r) => r.ok);
    ai.status = ok ? "online" : "offline";
  } catch {
    ai.status = "offline";
  }
}

const MOODS = (d: Duel) =>
  d.temper > 70 ? "furious" : d.temper > 40 ? "irritated" : d.resolve < 30 ? "cornered and worn down" : d.resolve < 60 ? "wavering" : "defiant";

type Want = "line" | "move";
interface JudgeOut {
  move?: { p: Record<string, number> };
  line?: { tactic: LineJudgment["tactic"]; fit: number; usesFact: number; abusive: number };
}

/** One call to the worker. Returns null on any failure so callers fall back to local rules. */
async function ask(d: Duel, want: Want, lastAction: string, known: string[], line?: string): Promise<JudgeOut | null> {
  if (ai.status !== "online") return null;
  const facts = [`${d.shop.hardship}`, `${d.shop.owner} ${d.shop.secret}`];
  const body = {
    want,
    debtor: {
      name: d.shop.owner,
      shop: `${d.shop.label} called ${d.shop.name}`,
      temperament: d.banker ? ["very proud", "cold and calculating", "greedy"] : traitWords(d.shop.traits),
      mood: MOODS(d),
      facts: d.banker ? ["runs the Lantern Bank", "was Vela's mother's employer"] : facts,
    },
    resolve: (d.resolve / d.maxResolve) * 100,
    temper: d.temper,
    lastAction,
    history: d.transcript.slice(-6),
    allowed: allowedMoves(d),
    line,
    known,
  };
  try {
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), 4000);
    const res = await fetch("/api/judge", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body), signal: ctl.signal });
    clearTimeout(timer);
    if (res.status === 401) ai.status = "offline";
    if (!res.ok) return null;
    return (await res.json()) as JudgeOut;
  } catch {
    return null;
  }
}

/** Judges what the player typed, against the state before the tactic lands. */
export async function judgeLine(d: Duel, known: string[], line: string): Promise<LineJudgment> {
  const out = await ask(d, "line", line, known, line);
  if (!out?.line) {
    ai.lastSource = "local";
    return localJudge(line, d, known);
  }
  ai.lastSource = "jev";
  const L = out.line;
  return { tactic: L.tactic, fit: L.fit, usesFact: L.usesFact, abusive: L.abusive, source: "jev" };
}

/**
 * Counter-move weights from the state after the tactic lands, so a threshold the tactic
 * just crossed (bargain, bluster, pay) is possible on this answer.
 */
export async function counterMoves(d: Duel, lastAction: string, known: string[]): Promise<Record<string, number>> {
  const local = localMoveWeights(d);
  const out = await ask(d, "move", lastAction, known);
  ai.lastSource = out?.move ? "jev" : "local";
  if (!out?.move) return local;
  // blend Jev's calibrated probabilities with the rules so every allowed move stays possible
  const lsum = Object.values(local).reduce((a, b) => a + b, 0);
  const w: Record<string, number> = {};
  for (const m of Object.keys(local)) w[m] = 0.55 * (out.move.p[m] ?? 0) + 0.45 * (local[m] / lsum);
  return w;
}
