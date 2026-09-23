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

export interface Judgment {
  moveWeights: Record<string, number>;
  line?: LineJudgment;
}

const MOODS = (d: Duel) =>
  d.temper > 70 ? "furious" : d.temper > 40 ? "irritated" : d.resolve < 30 ? "cornered and worn down" : d.resolve < 60 ? "wavering" : "defiant";

export async function judge(d: Duel, lastAction: string, known: string[], line?: string): Promise<Judgment> {
  const fallback = (): Judgment => {
    ai.lastSource = "local";
    return { moveWeights: localMoveWeights(d), line: line ? localJudge(line, d, known) : undefined };
  };
  if (ai.status !== "online") return fallback();
  const facts = [`${d.shop.hardship}`, `${d.shop.owner} ${d.shop.secret}`];
  const body = {
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
    if (!res.ok) return fallback();
    const out = (await res.json()) as { move: { p: Record<string, number> }; line?: { tactic: LineJudgment["tactic"]; fit: number; usesFact: number; abusive: number } };
    ai.lastSource = "jev";
    // blend Jev's calibrated probabilities with the rules so every allowed move stays possible
    const local = localMoveWeights(d);
    const lsum = Object.values(local).reduce((a, b) => a + b, 0);
    const w: Record<string, number> = {};
    for (const m of Object.keys(local)) w[m] = 0.55 * (out.move.p[m] ?? 0) + 0.45 * (local[m] / lsum);
    return {
      moveWeights: w,
      line: out.line ? { tactic: out.line.tactic, fit: out.line.fit, usesFact: out.line.usesFact, abusive: out.line.abusive, source: "jev" } : undefined,
    };
  } catch {
    return fallback();
  }
}
