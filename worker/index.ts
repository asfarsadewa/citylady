/// <reference types="@cloudflare/workers-types" />
// City Lady API worker: Turnstile-gated sessions and TypeSafe Jev judgments for negotiations.
// Static assets are served by the assets binding; /api/* and the page itself (for share-card URLs) reach this code.

export interface Env {
  ASSETS: Fetcher;
  TYPESAFE_API_KEY: string;
  TURNSTILE_SECRET_KEY: string;
  TURNSTILE_SITE_KEY: string;
  SESSION_SECRET: string;
  JUDGE_LIMIT?: RateLimit;
}

const COOKIE = "cl_s";
const SESSION_TTL = 6 * 3600;
const MOVES: Record<string, string> = {
  stall: "Stalls for time: changes the subject, asks for patience, delays.",
  plead: "Pleads with an emotional story about hardship to make the collector feel guilty.",
  bluster: "Gets angry, insults or threatens the collector, raises their voice.",
  bargain: "Offers a partial payment right now to end the conversation.",
  crack: "Loses composure and lets slip what they really feel or fear.",
  pay: "Gives in and pays what is demanded.",
};

const json = (data: unknown, status = 200, headers: HeadersInit = {}) =>
  new Response(JSON.stringify(data), { status, headers: { "content-type": "application/json", "cache-control": "no-store", ...headers } });

async function hmac(secret: string, data: string): Promise<string> {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(data));
  return btoa(String.fromCharCode(...new Uint8Array(sig))).replace(/[+/=]/g, (c) => ({ "+": "-", "/": "_", "=": "" })[c]!);
}

async function readSession(req: Request, env: Env): Promise<string | null> {
  const m = (req.headers.get("cookie") ?? "").match(new RegExp(`${COOKIE}=([\\w.-]+)`));
  if (!m) return null;
  const [id, exp, sig] = m[1].split(".");
  if (!id || !exp || !sig || Number(exp) < Date.now() / 1000) return null;
  const expected = await hmac(env.SESSION_SECRET, `${id}.${exp}`);
  return expected === sig ? id : null;
}

async function startSession(req: Request, env: Env): Promise<Response> {
  const body = (await req.json().catch(() => ({}))) as { token?: string };
  if (!body.token || body.token.length > 2048) return json({ ok: false, error: "missing token" }, 400);
  const form = new FormData();
  form.append("secret", env.TURNSTILE_SECRET_KEY);
  form.append("response", body.token);
  const ip = req.headers.get("CF-Connecting-IP");
  if (ip) form.append("remoteip", ip);
  const res = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", { method: "POST", body: form });
  const out = (await res.json()) as { success: boolean; "error-codes"?: string[] };
  if (!out.success) return json({ ok: false, error: "verification failed", codes: out["error-codes"] }, 403);
  const id = crypto.randomUUID().replace(/-/g, "").slice(0, 16);
  const exp = Math.floor(Date.now() / 1000) + SESSION_TTL;
  const sig = await hmac(env.SESSION_SECRET, `${id}.${exp}`);
  const secure = new URL(req.url).protocol === "https:" ? "; Secure" : "";
  return json({ ok: true }, 200, { "set-cookie": `${COOKIE}=${id}.${exp}.${sig}; Path=/api; HttpOnly; SameSite=Strict; Max-Age=${SESSION_TTL}${secure}` });
}

interface JudgeInput {
  debtor: { name: string; shop: string; temperament: string[]; mood: string; facts: string[] };
  resolve: number;
  temper: number;
  lastAction: string;
  history: string[];
  allowed: string[];
  line?: string;
  known: string[];
  /** "line" judges the typed line; "move" picks the counter-move from the state after the tactic lands. */
  want: "line" | "move" | "both";
}

const clip = (s: unknown, n: number) => String(s ?? "").slice(0, n);

function sanitize(raw: any): JudgeInput | null {
  if (!raw || typeof raw !== "object" || !raw.debtor) return null;
  const arr = (a: unknown, n: number, len: number) => (Array.isArray(a) ? a.slice(0, n).map((x) => clip(x, len)) : []);
  const allowed = arr(raw.allowed, 6, 12).filter((m) => m in MOVES);
  if (!allowed.length) return null;
  return {
    debtor: {
      name: clip(raw.debtor.name, 40),
      shop: clip(raw.debtor.shop, 40),
      temperament: arr(raw.debtor.temperament, 5, 60),
      mood: clip(raw.debtor.mood, 60),
      facts: arr(raw.debtor.facts, 6, 160),
    },
    resolve: Math.max(0, Math.min(100, Number(raw.resolve) || 0)),
    temper: Math.max(0, Math.min(100, Number(raw.temper) || 0)),
    lastAction: clip(raw.lastAction, 200),
    history: arr(raw.history, 8, 200),
    allowed,
    line: raw.line ? clip(raw.line, 180) : undefined,
    known: arr(raw.known, 6, 160),
    want: raw.want === "line" || raw.want === "move" ? raw.want : "both",
  };
}

async function judge(req: Request, env: Env): Promise<Response> {
  const sid = await readSession(req, env);
  if (!sid) return json({ ok: false, error: "no session" }, 401);
  if (env.JUDGE_LIMIT) {
    const { success } = await env.JUDGE_LIMIT.limit({ key: sid });
    if (!success) return json({ ok: false, error: "slow down" }, 429);
  }
  const input = sanitize(await req.json().catch(() => null));
  if (!input) return json({ ok: false, error: "bad input" }, 400);
  if (input.want === "line" && !input.line) return json({ ok: false, error: "no line" }, 400);
  const wantMove = input.want !== "line";
  const wantLine = input.want !== "move" && !!input.line;

  const state = {
    debtor: {
      name: input.debtor.name,
      business: input.debtor.shop,
      temperament: input.debtor.temperament,
      current_mood: input.debtor.mood,
      private_facts: input.debtor.facts,
      willingness_to_resist: `${Math.round(input.resolve)} out of 100`,
      anger: `${Math.round(input.temper)} out of 100`,
    },
    collector: "Vela, a debt collector for the Lantern Bank",
    conversation_so_far: input.history,
    collector_latest: input.line ?? input.lastAction,
    collector_known_facts_about_debtor: input.known,
  };
  const questions: Record<string, unknown> = {};
  if (wantMove) {
    questions.move = {
      type: "choice",
      instructions:
        "The debtor must answer `collector_latest`. Given the debtor's temperament, mood, anger and willingness to resist, which response is the most believable in character right now?",
      criteria: Object.fromEntries(input.allowed.map((m) => [m, MOVES[m]])),
    };
  }
  if (wantLine) {
    questions.tactic = {
      type: "choice",
      instructions: "Which persuasion tactic does `collector_latest` mainly use on the debtor?",
      criteria: {
        charm: "Warmth, flattery, sympathy or personal rapport",
        press: "Intimidation, threats of consequences, pressure or ultimatums",
        reason: "Logic, numbers, the contract, fairness or self-interest",
        offer: "A discount, payment plan, deal or concession",
        leverage: "A secret, rumor or private fact used against the debtor",
        nonsense: "Off-topic, empty, unrelated to the debt, or gibberish",
      },
    };
    questions.fit = {
      type: "score",
      instructions: "How well does `collector_latest` work on this specific debtor's temperament and situation?",
      criteria: [
        "It backfires: it offends or hardens this debtor",
        "It has little effect on this debtor",
        "It somewhat moves this debtor",
        "It strongly moves this debtor",
        "It hits this debtor's exact weak point",
      ],
    };
    questions.uses_fact = {
      type: "noul",
      instructions: "Does `collector_latest` refer to one of the debtor's `private_facts` or `collector_known_facts_about_debtor`?",
    };
    questions.abusive = {
      type: "noul",
      instructions: "Is `collector_latest` hateful, sexual, or a threat of serious physical violence?",
    };
  }

  const res = await fetch("https://api.typesafe.ai/v1/systemone", {
    method: "POST",
    headers: { authorization: `Bearer ${env.TYPESAFE_API_KEY}`, "content-type": "application/json" },
    body: JSON.stringify({ model: "jev-latest", state, questions }),
  });
  if (!res.ok) return json({ ok: false, error: `judge ${res.status}` }, 502);
  const out = (await res.json()) as { answers: Record<string, any> };
  const a = out.answers;
  return json({
    ok: true,
    move: wantMove ? { choice: a.move.choice, p: a.move.probabilities } : undefined,
    line: wantLine
      ? {
          tactic: a.tactic.choice,
          tacticP: a.tactic.probabilities,
          fit: a.fit.score / 4,
          usesFact: a.uses_fact.noul,
          abusive: a.abusive.noul,
        }
      : undefined,
  });
}

/** Social scrapers need absolute URLs; the repo stays host-agnostic, so fill them in per request. */
async function page(req: Request, env: Env): Promise<Response> {
  const res = await env.ASSETS.fetch(req);
  if (!(res.headers.get("content-type") ?? "").includes("text/html")) return res;
  const origin = new URL(req.url).origin;
  const abs = (attr: string) => ({
    element(el: Element) {
      const v = el.getAttribute(attr);
      if (v && v.startsWith("/")) el.setAttribute(attr, origin + v);
    },
  });
  return new HTMLRewriter()
    .on('meta[property="og:url"]', abs("content"))
    .on('meta[property="og:image"]', abs("content"))
    .on('meta[name="twitter:image"]', abs("content"))
    .on("head", { element: (el) => void el.append(`<link rel="canonical" href="${origin}/" />`, { html: true }) })
    .transform(res);
}

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const url = new URL(req.url);
    if (url.pathname === "/" || url.pathname === "/index.html") return page(req, env);
    if (url.pathname === "/api/config") {
      return json({ siteKey: env.TURNSTILE_SITE_KEY, session: Boolean(await readSession(req, env)) });
    }
    if (req.method === "POST" && url.pathname === "/api/session") return startSession(req, env);
    if (req.method === "POST" && url.pathname === "/api/judge") return judge(req, env);
    return json({ error: "not found" }, 404);
  },
} satisfies ExportedHandler<Env>;
