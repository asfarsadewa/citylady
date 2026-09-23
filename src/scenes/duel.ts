// The negotiation duel: an over-the-shoulder confrontation with a debtor, turn by turn.
import { W, H, img, input, pointer, kick, time, clamp, easeOut, lerp, type Scene } from "../engine/core";
import { audio } from "../engine/audio";
import { text, para, measure, lineHeight } from "../engine/text";
import { DISTRICTS, TRAITS } from "../game/data";
import { gossip, intelText, rng, clock, type Night, type Run, type Shop, type Intel } from "../game/state";
import {
  TACTICS, act, allowedMoves, applyMove, applyOpening, intelFor, localMoveWeights, sample, startDuel,
  type Duel, type Move, type Tactic, type Opening,
} from "../game/negotiation";
import { judgeLine, counterMoves, ai } from "../game/ai";
import { COL, panel, bar, button, letterbox, vignette, grain, floatText, drawFloats, clearFloats, keycap } from "../ui/widgets";
import { shade, withAlpha } from "./street";
import artmeta from "../data/artmeta.json";
import * as flow from "./flow";
import { t, sub as subtitle, type Key } from "../i18n";

const META = artmeta as Record<string, { w: number; h: number }>;
type Phase = "intro" | "opening" | "player" | "typing" | "busy" | "end";

const VELA_LINES: Record<string, string[]> = {
  charm: ["charm_1", "charm_2", "charm_3"],
  press: ["press_1", "press_2", "press_3"],
  reason: ["reason_1", "reason_2", "reason_3"],
  leverage: ["leverage_1", "leverage_2", "leverage_3"],
  offer: ["offer_1", "offer_2"],
  read: ["read_1", "read_2"],
};
const VELA_FACE: Record<string, string> = {
  charm: "vela_smirk", press: "vela_cold", reason: "vela_face", leverage: "vela_cold", offer: "vela_soft", read: "vela_face", improvise: "vela_smirk",
};
const MOVE_CAT: Record<Move, string> = { stall: "refuse", plead: "plead", bluster: "angry", bargain: "bargain", crack: "", pay: "pay" };
const COUNTS: Record<string, number> = { refuse: 3, plead: 2, angry: 2, bargain: 1, pay: 2 };

export class DuelScene implements Scene {
  d: Duel;
  phase: Phase = "intro";
  private t = 0;
  private bg!: HTMLCanvasElement;
  private r = rng((Date.now() ^ 0x9e37) >>> 0);
  private sub: { who: string; text: string; t: number; color: string } | null = null;
  private velaFace: string | null = null;
  private velaFaceT = 0;
  private hitT = 9;
  private flash = 0;
  private stampT = -1;
  private stampText = "";
  private stampColor = COL.crimson;
  private resolveGhost = 1;
  // judge verdicts and combos stack, so a combo never hides what Jev decided
  private banners: { text: string; t: number; color: string }[] = [];
  private note = "";
  private sleepLeft = 0;
  private sleepRes: (() => void) | null = null;
  private field: HTMLInputElement | null = null;
  private outcome: { title: string; lines: string[]; color: string; intel?: Intel | null } | null = null;
  private zoom = 1.18;
  private bokeh: { x: number; y: number; r: number; s: number; a: number }[] = [];
  private portraitKey: string;
  private district = DISTRICTS[0];

  constructor(public run: Run, public night: Night, public shop: Shop, private back: { enter(): void } | null, banker = false) {
    this.d = startDuel(run, shop, banker);
    this.district = DISTRICTS[run.district];
    this.portraitKey = shop.portrait;
    const stash = night.intel.some((i) => i.shopId === shop.id && i.kind === "stash");
    if (stash && !banker && !shop.stashFound) {
      shop.cash += Math.round(shop.debt * 0.5);
      shop.stashFound = true;
    }
    if (shop.visits > 1) {
      this.d.resolve += 10 * (shop.visits - 1);
      this.d.maxResolve = this.d.resolve;
    }
    for (let i = 0; i < 18; i++) this.bokeh.push({ x: Math.random() * W, y: Math.random() * 220, r: 3 + Math.random() * 9, s: 2 + Math.random() * 6, a: 0.05 + Math.random() * 0.12 });
    this.buildBg();
  }

  enter() {
    clearFloats();
    audio.playMusic("mus_duel", 1);
    audio.playAmb("amb_shop");
    audio.sfx("whoosh", { vol: 0.6 });
    audio.sfx("braam", { vol: this.d.banker ? 0.9 : 0.55 });
    this.run_(this.introSeq());
  }

  leave() {
    this.removeField();
  }

  private buildBg() {
    const c = document.createElement("canvas");
    c.width = W; c.height = H;
    const g = c.getContext("2d")!;
    const f = img(this.shop.sprite);
    const d = this.district;
    g.fillStyle = shade(d.fog, -0.5);
    g.fillRect(0, 0, W, H);
    if (f) {
      g.filter = "blur(3px) brightness(0.55) saturate(1.2)";
      const s = (H * 1.9) / f.height;
      g.drawImage(f, (W - f.width * s) / 2 + 60, H - f.height * s * 0.92, f.width * s, f.height * s);
      g.filter = "none";
    }
    g.globalCompositeOperation = "multiply";
    g.fillStyle = d.tint;
    g.fillRect(0, 0, W, H);
    g.globalCompositeOperation = "source-over";
    const grad = g.createLinearGradient(0, 0, W, 0);
    grad.addColorStop(0, "rgba(6,4,12,0.85)");
    grad.addColorStop(0.45, "rgba(6,4,12,0.2)");
    grad.addColorStop(1, "rgba(6,4,12,0.5)");
    g.fillStyle = grad;
    g.fillRect(0, 0, W, H);
    this.bg = c;
  }

  // ---------- sequencing helpers ----------
  private sleep(s: number) {
    return new Promise<void>((res) => {
      this.sleepLeft = s;
      this.sleepRes = res;
    });
  }

  private async run_(p: Promise<void>) {
    try { await p; } catch (e) { console.error(e); }
  }

  private async say(who: string, textStr: string, voiceId: string | null, color: string, min = 1.3) {
    this.sub = { who, text: textStr, t: 0, color };
    const dur = voiceId ? await audio.voice(voiceId) : 0;
    await this.sleep(Math.max(min, dur + 0.25, textStr.length / 30));
  }

  private velaSay(id: string, face: string) {
    this.velaFace = face;
    this.velaFaceT = 0;
    return this.say(t("name.vela"), subtitle(id), id, COL.crimson);
  }

  private debtorBark(move: Move): Promise<void> {
    const shop = this.shop;
    if (this.d.banker) {
      const id = move === "pay" ? "hale_yield" : move === "crack" ? "hale_crack" : `hale_duel_${this.r.int(1, 3)}`;
      return this.say(t("name.hale"), subtitle(id), id, COL.gold);
    }
    const cat = MOVE_CAT[move];
    if (!cat) {
      audio.sfx("gasp", { vol: 0.8 });
      return this.say(shop.owner, "...", null, COL.gold, 1.1);
    }
    const id = `${shop.voice}_${cat}_${this.r.int(1, COUNTS[cat])}`;
    return this.say(shop.owner, subtitle(id) || "...", id, COL.gold);
  }

  // ---------- sequences ----------
  private async introSeq() {
    await this.sleep(0.9);
    if (this.d.banker) {
      await this.say(t("name.hale"), subtitle("fin_1"), "fin_1", COL.gold);
      await this.velaSay("fin_2", "vela_cold");
      await this.say(t("name.hale"), subtitle("fin_3"), "fin_3", COL.gold);
      await this.velaSay("fin_4", "vela_cold");
      this.d.demanded = 100000;
      this.phase = "player";
      return;
    }
    const forced = import.meta.env.DEV ? (window as unknown as { __greet?: number }).__greet : undefined;
    await this.velaSay(`greet_${forced ?? this.r.int(1, 3)}`, "vela_face");
    this.phase = "opening";
  }

  private chooseOpening(o: Opening) {
    audio.sfx("ui_ok", { vol: 0.7 });
    applyOpening(this.run, this.d, o);
    this.resolveGhost = this.d.resolve / this.d.maxResolve;
    if (o === "half") this.note = t("note.half");
    else if (o === "fee") this.note = t("note.fee");
    else this.note = "";
    this.phase = "player";
  }

  private async turn(tactic: Tactic, line?: string) {
    if (this.phase !== "player" && this.phase !== "typing") return;
    this.phase = "busy";
    this.note = "";
    const n = this.night;
    const known = intelFor(n, this.d).map((i) => intelText(i, n, "en"));
    const lastAction = line ?? TACTICS.find((tac) => tac.id === tactic)!.name;
    // judge the typed line while Vela is speaking, so the latency hides behind her line
    const pending = line ? judgeLine(this.d, known, line) : Promise.resolve(undefined);
    audio.sfx("cloth", { vol: 0.4 });
    if (line) {
      this.velaFace = VELA_FACE.improvise;
      this.velaFaceT = 0;
      await this.say(t("name.vela"), line, null, COL.crimson, 1.6);
    } else {
      const lines = VELA_LINES[tactic];
      await this.velaSay(lines[this.r.int(0, lines.length - 1)], VELA_FACE[tactic]);
    }
    const L = await pending;
    this.d.transcript.push(`Vela: ${line ?? lastAction}`);
    const res = act(this.run, n, this.d, tactic, this.r.next, L);
    n.minutes += 12;
    // the debtor reacts to the state after the tactic lands; ask now, behind the hit animation
    const counter = this.d.resolve <= 0 || this.d.temper >= 100 ? null : counterMoves(this.d, lastAction, known);
    if (L) {
      const tname = L.tactic === "nonsense" ? t("banner.no_tactic") : t(`tac.${L.tactic}` as Key);
      this.banners.push({ text: t("banner.judge", { src: L.source === "jev" ? "JEV" : "LOCAL", tactic: tname, fit: Math.round(L.fit * 100) }) + (L.usesFact > 0.6 ? t("banner.uses_intel") : ""), t: 0, color: COL.violet });
    }
    if (res.combo) {
      this.banners.push({ text: t("banner.combo", { name: t(`combo.${res.combo}` as Key).toUpperCase() }), t: 0, color: COL.gold });
      audio.sfx("impact", { vol: 0.8 });
    }
    if (res.damage > 0) this.hit(res.damage, res.effectiveness);
    else if (res.revealed) audio.sfx("paper", { vol: 0.6 });
    if (res.temper > 10) floatText(492, 108, t("float.anger", { v: Math.round(res.temper) }), COL.red, "bold");
    if (res.note) this.note = res.note;
    await this.sleep(0.8);
    if (await this.checkEnd()) return;
    // the debtor answers
    const moveW = counter ? await counter : localMoveWeights(this.d);
    const allowed = allowedMoves(this.d);
    for (const k of Object.keys(moveW)) if (!allowed.includes(k as Move)) delete moveW[k];
    const move = sample(Object.keys(moveW).length ? moveW : { stall: 1 }, this.r.next) as Move;
    const mr = applyMove(n, this.d, move, this.r.next);
    this.d.transcript.push(`${this.shop.owner}: ${move}`);
    if (move === "bluster") {
      kick(3);
      audio.sfx("slam", { vol: 0.7 });
    }
    await this.debtorBark(move);
    this.note = mr.note + (mr.revealed ? ` ${t(`trait.${mr.revealed}` as Key)}.` : "");
    if (await this.checkEnd()) return;
    if (n.minutes >= this.shop.closes && !this.d.banker) {
      this.note = t("note.closing");
      await this.sleep(1.2);
      return this.finish("closed");
    }
    this.phase = "player";
  }

  private hit(dmg: number, eff: number) {
    const before = this.d.resolve + dmg;
    this.resolveGhost = before / this.d.maxResolve;
    this.hitT = 0;
    this.flash = Math.min(1, dmg / 30);
    kick(Math.min(7, 2 + dmg / 8));
    audio.sfx(dmg > 25 ? "impact" : "stamp", { vol: 0.5 + Math.min(0.5, dmg / 60) });
    const tag = eff >= 1.5 ? t("float.crushing") : eff >= 1.1 ? t("float.strong") : eff < 0.6 ? t("float.weak") : "";
    floatText(492, 130, t("float.resolve", { v: dmg }), dmg > 25 ? COL.gold : COL.paper);
    if (tag) floatText(492, 150, tag, eff < 0.6 ? COL.dim : COL.crimson, "bold");
    if (this.d.resolve / this.d.maxResolve < 0.3) audio.sfx("heartbeat", { vol: 0.7 });
  }

  private async checkEnd(): Promise<boolean> {
    if (this.d.resolve <= 0) {
      if (this.d.lastMove !== "pay") await this.debtorBark("pay");
      await this.finish("paid");
      return true;
    }
    if (this.d.temper >= 100) {
      audio.sfx("glass_break");
      kick(8);
      await this.debtorBark("bluster");
      await this.finish("thrown");
      return true;
    }
    return false;
  }

  private async settle() {
    if (this.phase !== "player" || this.d.offer === null) return;
    this.phase = "busy";
    this.run.grace = Math.min(100, this.run.grace + 2);
    await this.finish("settled");
  }

  private async leave_() {
    if (this.phase !== "player" && this.phase !== "opening") return;
    this.phase = "busy";
    await this.velaSay("leave_1", "vela_face");
    this.night.minutes += 5;
    this.finish("left");
  }

  private async finish(kind: Exclude<Duel["done"], null>) {
    const d = this.d, s = this.shop, n = this.night, run = this.run;
    d.done = kind;
    this.phase = "end";
    this.sub = null;
    if (d.banker) {
      await this.sleep(0.6);
      if (kind === "paid") {
        this.stamp(t("stamp.settled"), COL.gold);
        audio.sfx("success");
        await this.sleep(2.4);
        flow.toEnding(run.grace >= run.fear ? "grace" : "fear");
      } else {
        this.stamp(kind === "thrown" ? t("stamp.denied") : t("stamp.unsettled"), COL.red);
        audio.sfx("fail");
        await this.sleep(2.4);
        flow.toEnding("fail");
      }
      return;
    }
    const lines: string[] = [];
    let intel: Intel | null = null;
    if (kind === "paid" || kind === "settled") {
      const want = kind === "paid" ? d.demanded : d.offer ?? 0;
      const paid = Math.min(want, s.cash);
      s.cash -= paid;
      s.collected += paid;
      n.collected += paid;
      run.total += paid;
      s.status = kind === "paid" ? "paid" : "partial";
      audio.sfx("coins");
      setTimeout(() => audio.sfx("register", { vol: 0.7 }), 400);
      this.stamp(kind === "paid" ? t("stamp.paid") : t("stamp.settled"), kind === "paid" ? COL.crimson : COL.teal);
      await this.velaSay(`paid_${this.r.int(1, 3)}`, "vela_smirk");
      lines.push(t("out.paid_line", { owner: s.owner, v: paid }));
      const rest = (kind === "paid" ? d.demanded : 0) - paid;
      const halfNote = kind === "paid" && d.half ? s.debt - d.demanded : 0;
      const owed = Math.max(0, rest) + halfNote;
      if (owed > 0) {
        const rel = clamp(0.45 + 0.1 * s.traits.heart + 0.1 * s.traits.logic + (halfNote ? 0.2 : 0), 0.3, 0.92);
        run.notes.push({ from: s.owner, amount: owed, reliability: rel });
        lines.push(t("out.note_line", { owner: s.owner, v: owed, p: Math.round(rel * 100) }));
      }
      if (kind === "paid") {
        intel = gossip(run, n, s, this.r);
        if (intel) lines.push(t("out.gossip"));
      }
      this.outcome = { title: kind === "paid" ? t("out.collected") : t("out.settled"), lines, color: kind === "paid" ? COL.gold : COL.teal, intel };
    } else if (kind === "thrown") {
      s.status = "banned";
      n.heat += 15;
      run.fear = Math.min(100, run.fear + 2);
      this.stamp(t("stamp.thrown"), COL.red);
      audio.sfx("fail");
      await this.velaSay(`out_${this.r.int(1, 2)}`, "vela_tired");
      this.outcome = { title: t("out.thrown"), lines: [t("out.banned", { owner: s.owner }), t("out.heat")], color: COL.red };
    } else if (kind === "closed") {
      this.outcome = { title: t("out.closing"), lines: [t("out.closed")], color: COL.dim };
    } else {
      this.outcome = { title: t("out.walk"), lines: [t("out.left")], color: COL.dim };
    }
  }

  private stamp(t: string, color: string) {
    this.stampT = 0;
    this.stampText = t;
    this.stampColor = color;
    kick(9);
    audio.sfx("stamp", { vol: 1 });
  }

  private exit() {
    audio.sfx("door_close", { vol: 0.7 });
    if (this.back) flow.backToStreet(this.back);
  }

  // ---------- improvise input ----------
  private openField() {
    this.phase = "typing";
    const el = document.createElement("input");
    el.className = "say-field";
    el.maxLength = 160;
    el.placeholder = t("say.placeholder");
    document.body.appendChild(el);
    el.focus();
    input.typing = true;
    el.addEventListener("keydown", (e) => {
      e.stopPropagation();
      if (e.key === "Enter" && el.value.trim().length > 1) {
        const v = el.value.trim();
        this.removeField();
        this.run.aiUsed++;
        this.turn("improvise", v);
      } else if (e.key === "Escape") {
        this.removeField();
        this.phase = "player";
      }
    });
    this.field = el;
  }

  private removeField() {
    this.field?.remove();
    this.field = null;
    input.typing = false;
  }

  // ---------- update ----------
  update(dt: number) {
    this.t += dt;
    this.hitT += dt;
    this.flash = Math.max(0, this.flash - dt * 3);
    this.velaFaceT += dt;
    if (this.sub) this.sub.t += dt;
    for (const b of this.banners) b.t += dt;
    this.banners = this.banners.filter((b) => b.t < 3.2);
    if (this.stampT >= 0) this.stampT += dt;
    this.resolveGhost = lerp(this.resolveGhost, this.d.resolve / this.d.maxResolve, dt * 1.5);
    const pressure = 1 - clamp(this.d.resolve / this.d.maxResolve, 0, 1);
    this.zoom = lerp(this.zoom, 1 + pressure * 0.1, dt * 2);
    for (const b of this.bokeh) {
      b.y -= b.s * dt;
      if (b.y < -20) { b.y = 240; b.x = Math.random() * W; }
    }
    if (this.sleepRes) {
      this.sleepLeft -= dt;
      const skip = (pointer.clicked && pointer.y < 260) || input.pressed("ok");
      if (this.sleepLeft <= 0 || (skip && this.phase !== "end" && this.sub && this.sub.t > 0.3)) {
        if (skip) audio.stopVoice();
        const r = this.sleepRes;
        this.sleepRes = null;
        r();
      }
    }
    if (this.phase === "player") {
      const keys: Tactic[] = ["charm", "press", "reason", "offer", "leverage", "read", "improvise"];
      keys.forEach((k, i) => {
        if (input.pressed(String(i + 1)) && this.canUse(k)) this.pick(k);
      });
      if (input.pressed("back") && !this.d.banker) this.leave_();
    } else if (this.phase === "opening") {
      if (input.pressed("1")) this.chooseOpening("debt");
      if (input.pressed("2")) this.chooseOpening("fee");
      if (input.pressed("3")) this.chooseOpening("half");
      if (input.pressed("back")) this.leave_();
    } else if (this.phase === "end" && this.outcome && (input.pressed("ok") || input.pressed("back"))) this.exit();
  }

  private canUse(t: Tactic) {
    const n = this.night;
    if (t === "leverage" && n.composure < 10) return false;
    if (t === "press" && n.composure < 8) return false;
    return true;
  }

  private pick(t: Tactic) {
    audio.sfx("ui_ok", { vol: 0.5 });
    if (t === "improvise") this.openField();
    else this.turn(t);
  }

  // ---------- draw ----------
  draw(ctx: CanvasRenderingContext2D) {
    const d = this.d, n = this.night, s = this.shop;
    const intro = easeOut(Math.min(1, this.t / 1.1));
    // background with slow push
    const bz = 1.04 + Math.sin(this.t * 0.2) * 0.01 + (this.zoom - 1) * 0.5;
    ctx.drawImage(this.bg, -(W * (bz - 1)) / 2, -(H * (bz - 1)) / 2, W * bz, H * bz);
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    for (const b of this.bokeh) {
      ctx.fillStyle = withAlpha(this.district.glow, b.a);
      ctx.beginPath();
      ctx.arc(b.x, b.y, b.r, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
    // debtor portrait
    const p = img(this.portraitKey);
    const pressure = 1 - clamp(d.resolve / d.maxResolve, 0, 1);
    if (p) {
      const size = Math.round(250 * this.zoom);
      const shakeX = this.hitT < 0.35 ? Math.round(Math.sin(this.hitT * 60) * (1 - this.hitT / 0.35) * 6) : 0;
      const breathe = Math.round(Math.sin(this.t * 1.3) * 1.2);
      const px = Math.round(lerp(W + 40, 372 - (size - 250) / 2, intro)) + shakeX;
      const py = 18 + breathe - Math.round((size - 250) * 0.3);
      ctx.drawImage(p, px, py, size, size);
      // anger tints the debtor red; hits flash white
      if (d.temper > 30) {
        ctx.save();
        ctx.globalCompositeOperation = "multiply";
        ctx.globalAlpha = ((d.temper - 30) / 70) * (0.45 + Math.sin(this.t * 6) * 0.1);
        ctx.fillStyle = "#ff3a3a";
        ctx.fillRect(px, py, size, size);
        ctx.restore();
      }
      if (this.flash > 0) {
        ctx.save();
        ctx.globalCompositeOperation = "lighter";
        ctx.globalAlpha = this.flash * 0.5;
        ctx.drawImage(p, px, py, size, size);
        ctx.restore();
      }
      const fade = ctx.createLinearGradient(0, 200, 0, 280);
      fade.addColorStop(0, "rgba(6,4,12,0)");
      fade.addColorStop(1, "rgba(6,4,12,1)");
      ctx.fillStyle = fade;
      ctx.fillRect(px - 10, 200, size + 20, 80);
      const side = ctx.createLinearGradient(px, 0, px + 40, 0);
      side.addColorStop(0, "rgba(6,4,12,0.9)");
      side.addColorStop(1, "rgba(6,4,12,0)");
      ctx.fillStyle = side;
      ctx.fillRect(px, py, 40, size);
    }
    // Vela over the shoulder, hair rippling row by row
    const sh = img("vela_shoulder");
    if (sh) {
      const m = META.vela_shoulder ?? { w: sh.width, h: sh.height };
      const baseX = Math.round(lerp(-m.w, -40, intro));
      const baseY = H - m.h + 30 + Math.round(Math.sin(this.t * 1.1) * 1.5);
      for (let y = 0; y < m.h; y += 2) {
        const k = 1 - y / m.h;
        const off = Math.round(Math.sin(this.t * 2.1 + y * 0.045) * 2.2 * k + Math.sin(this.t * 0.9 + y * 0.02) * 1.5 * k);
        ctx.drawImage(sh, 0, y, m.w, 2, baseX + off, baseY + y, m.w, 2);
      }
    }
    const low = ctx.createLinearGradient(0, 230, 0, H);
    low.addColorStop(0, "rgba(6,4,12,0)");
    low.addColorStop(1, "rgba(6,4,12,0.95)");
    ctx.fillStyle = low;
    ctx.fillRect(0, 230, W, H - 230);
    if (pressure > 0.7) vignette(ctx, 0.35 + Math.sin(this.t * 5) * 0.1, "120,0,20");
    vignette(ctx, 0.5);

    // Vela's face inset
    if (this.velaFace && this.velaFaceT < 3.5) {
      const f = img(this.velaFace);
      if (f) {
        const a = Math.min(1, this.velaFaceT * 5, (3.5 - this.velaFaceT) * 3);
        ctx.globalAlpha = a;
        panel(ctx, 10, 46, 84, 84, COL.crimson);
        ctx.drawImage(f, 40, 30, 170, 170, 12, 48, 80, 80);
        ctx.globalAlpha = 1;
      }
    }

    // name card and meters
    const cx = 380, cy = 8;
    ctx.globalAlpha = intro;
    // rows stack by line height so larger CJK glyphs never collide
    const r1 = cy + lineHeight("title");
    const r2 = r1 + lineHeight("small") + 3;
    const r3 = r2 + lineHeight("small") + 3;
    const r4 = r3 + lineHeight("small") + 1;
    text(ctx, s.owner.toUpperCase(), cx, cy, { font: "title", color: COL.paper });
    text(ctx, d.banker ? t("shop.bank") : `${s.name} · ${t(`shop.${s.type}` as Key)}`, cx, r1, { font: "small", color: COL.dim });
    const labW = Math.max(measure(t("duel.resolve"), "small"), measure(t("duel.anger"), "small")) + 6;
    text(ctx, t("duel.resolve"), cx, r2, { font: "small", color: COL.gold });
    bar(ctx, cx + labW, r2 + 1, 244 - labW, 6, d.resolve / d.maxResolve, COL.gold, this.resolveGhost);
    text(ctx, t("duel.anger"), cx, r3, { font: "small", color: COL.red });
    bar(ctx, cx + labW, r3 + 1, 244 - labW, 4, d.temper / 100, d.temper > 70 ? COL.red : "#c0503c");
    const traits = TRAITS.filter((k) => s.revealed.includes(k) && s.traits[k] > 0).map((k) => t(`trait.${k}` as Key));
    const intel = intelFor(n, d);
    const tags = [...traits, ...intel.map((i) => t(`tag.${i.kind}` as Key))];
    text(ctx, tags.length ? tags.join(" · ") : t("duel.use_read"), cx, r4, { font: "small", color: tags.length ? COL.violet : "#6e6380" });
    const lastTrait = [...s.revealed].reverse().find((k) => s.traits[k] > 0);
    if (lastTrait) text(ctx, t(`hint.${lastTrait}` as Key), cx, r4 + lineHeight("small"), { font: "small", color: COL.dim });
    text(ctx, t("duel.demand", { v: d.demanded.toLocaleString("en-US") }), 12, 8, { font: "title", color: COL.gold });
    text(ctx, d.banker ? t("duel.final") : t("duel.time", { t: clock(n.minutes), c: clock(s.closes) }), 12, 8 + lineHeight("title"), { font: "small", color: COL.dim });
    ctx.globalAlpha = 1;

    // subtitle
    if (this.sub) {
      const sb = this.sub;
      const a = Math.min(1, sb.t * 6);
      ctx.globalAlpha = a;
      const w = 400;
      const x = 120;
      text(ctx, sb.who.toUpperCase(), x + w / 2, 212, { font: "small", color: sb.color, align: "center" });
      para(ctx, sb.text, x, 222, w, { chars: Math.floor(sb.t * 50), color: COL.paper, align: "center" });
      ctx.globalAlpha = 1;
    }
    if (this.note && this.phase !== "busy") text(ctx, this.note, W / 2, 262, { font: "small", color: COL.teal, align: "center" });
    this.banners.forEach((b, i) => {
      const a = Math.min(1, b.t * 6, (3.2 - b.t) * 3);
      const h = lineHeight("bold") + 5;
      const w = measure(b.text, "bold") + 24;
      const by = 176 - (this.banners.length - 1 - i) * (h + 3);
      ctx.globalAlpha = a;
      panel(ctx, (W - w) / 2, by, w, h, b.color, "rgba(30,14,44,0.95)");
      text(ctx, b.text, W / 2, by + 3, { font: "bold", color: b.color, align: "center" });
      ctx.globalAlpha = 1;
    });

    this.drawPanel(ctx);
    drawFloats(ctx, 1 / 60);

    // stamp
    if (this.stampT >= 0) {
      const t = this.stampT;
      const sc = t < 0.18 ? 3 - (t / 0.18) * 2 : 1;
      const a = Math.min(1, t * 8);
      ctx.save();
      ctx.globalAlpha = a;
      ctx.translate(W / 2, 120);
      ctx.rotate(-0.12);
      ctx.scale(sc, sc);
      const w = measure(this.stampText, "big") + 30;
      ctx.strokeStyle = this.stampColor;
      ctx.lineWidth = 4;
      ctx.strokeRect(-w / 2, -30, w, 62);
      ctx.strokeRect(-w / 2 + 6, -24, w - 12, 50);
      text(ctx, this.stampText, 0, -22, { font: "big", color: this.stampColor, align: "center", shadow: "#000" });
      ctx.restore();
    }
    letterbox(ctx, 1 - intro, 40);
    grain(ctx, 0.06);
  }

  private drawPanel(ctx: CanvasRenderingContext2D) {
    const n = this.night, d = this.d;
    const y0 = 276;
    if (this.phase === "opening") {
      text(ctx, t("duel.ask"), W / 2, y0 - 6, { font: "small", color: COL.gold, align: "center" });
      const opts: [Opening, string, string][] = [
        ["debt", t("open.debt", { v: this.shop.debt }), t("open.debt_sub")],
        ["fee", t("open.fee", { v: Math.round((this.shop.debt * 1.25) / 10) * 10 }), t("open.fee_sub")],
        ["half", t("open.half", { v: Math.round((this.shop.debt * 0.5) / 10) * 10 }), t("open.half_sub")],
      ];
      opts.forEach(([o, l, sub], i) => {
        if (button(ctx, `op${o}`, l, 20 + i * 204, y0 + 8, 196, 34, { key: String(i + 1), sub, accent: o === "fee" ? COL.crimson : o === "half" ? COL.teal : COL.gold })) this.chooseOpening(o);
      });
      if (button(ctx, "opleave", t("btn.leave"), W - 90, y0 + 50, 70, 20, { key: "ESC" })) this.leave_();
      return;
    }
    if (this.phase === "end" && this.outcome) {
      const o = this.outcome;
      panel(ctx, 110, 196, 420, 150, o.color, "rgba(16,10,22,0.96)");
      text(ctx, o.title.toUpperCase(), W / 2, 204, { font: "title", color: o.color, align: "center" });
      let yy = 228;
      for (const l of o.lines) yy += para(ctx, l, 126, yy, 388, { color: COL.paper }) + 2;
      if (o.intel) {
        yy += 4;
        text(ctx, o.intel.shopId === -1 ? t("out.banker_intel") : t("out.new_intel"), 126, yy, { font: "small", color: COL.violet });
        yy += 10;
        para(ctx, intelText(o.intel, this.night), 126, yy, 388, { font: "small", color: o.intel.kind === "secret" ? COL.crimson : COL.teal });
      }
      if (button(ctx, "exit", t("btn.back_street"), W / 2 - 80, 318, 160, 20, { key: "E" })) this.exit();
      return;
    }
    const active = this.phase === "player";
    let hover: string | null = null;
    TACTICS.forEach((tac, i) => {
      const x = 8 + i * 89, w = 86;
      const hasSecret = intelFor(n, d).some((k) => k.kind === "secret");
      const dis = !active || !this.canUse(tac.id);
      const accent = tac.id === "press" || tac.id === "leverage" ? COL.crimson : tac.id === "improvise" ? COL.violet : tac.id === "offer" || tac.id === "charm" ? COL.teal : COL.gold;
      const sub = tac.id === "leverage" && !hasSecret ? t("tac.no_secret") : tac.id === "improvise" ? (ai.status === "online" ? t("tac.jev") : t("tac.local")) : t("tac.cost", { v: tac.cost });
      if (button(ctx, `t${tac.id}`, t(`tac.${tac.id}` as Key), x, y0 + 4, w, 32, { key: String(i + 1), disabled: dis, accent, sub })) this.pick(tac.id);
      if (pointer.x >= x && pointer.x < x + w && pointer.y >= y0 + 4 && pointer.y < y0 + 36) hover = t(`tac.${tac.id}.d` as Key);
    });
    if (hover && active) {
      panel(ctx, 100, y0 - 22, 440, 16, COL.line);
      text(ctx, hover, W / 2, y0 - 20, { font: "small", color: COL.paper, align: "center" });
    }
    const by = y0 + 44;
    const bx = 10 + Math.max(measure(t("hud.composure"), "small"), measure(t("hud.heat"), "small")) + 6;
    text(ctx, t("hud.composure"), 10, by, { font: "small", color: COL.dim });
    bar(ctx, bx, by + 2, 84, 4, n.composure / n.maxComposure, COL.teal);
    text(ctx, t("hud.heat"), 10, by + 11, { font: "small", color: COL.dim });
    bar(ctx, bx, by + 13, 84, 4, n.heat / 100, n.heat > 70 ? COL.red : "#e08a3c");
    if (!d.banker) {
      if (d.offer !== null) {
        if (button(ctx, "settle", t("duel.settle", { v: d.offer }), 190, by - 2, 150, 22, { accent: COL.teal, disabled: !active, key: "S" })) this.settle();
      } else text(ctx, t("duel.no_offer"), 190, by + 4, { font: "small", color: "#6e6380" });
    }
    if (active && input.pressed("down")) this.settle();
    if (!d.banker && button(ctx, "leave", t("btn.leave"), W - 84, by - 2, 74, 22, { key: "ESC", disabled: !active })) this.leave_();
    if (!active && this.phase === "busy") {
      const dots = ".".repeat(1 + (Math.floor(time * 3) % 3));
      text(ctx, dots, W / 2, by + 4, { font: "bold", color: COL.dim, align: "center" });
    }
    if (this.phase === "typing") {
      panel(ctx, 60, 150, 520, 52, COL.violet, "rgba(20,10,30,0.96)");
      text(ctx, t("say.title"), 72, 156, { font: "small", color: COL.violet });
      text(ctx, t("say.body"), 72, 168, { font: "small", color: COL.dim });
      keycap(ctx, "ESC", 72, 184);
      text(ctx, t("say.cancel"), 96, 184, { font: "small", color: COL.dim });
    }
  }
}

