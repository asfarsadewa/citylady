// Localization: typed keys, {param} substitution, persisted language choice. English is the source.
import { en, type Key } from "./en";
import { id } from "./id";
import { zh } from "./zh";
import { voiceId } from "./voice.id";
import { voiceZh } from "./voice.zh";
import voiceEn from "../data/voice.json";

export type Lang = "en" | "id" | "zh";
export type { Key };
export const LANGS: Lang[] = ["en", "id", "zh"];

const TABLES: Record<Lang, Record<Key, string>> = { en, id, zh };
const VOICE: Record<Lang, Record<string, string>> = {
  en: Object.fromEntries(Object.entries(voiceEn as Record<string, { t: string }>).map(([k, v]) => [k, v.t])),
  id: voiceId,
  zh: voiceZh,
};
const STORE = "citylady.lang";

let current: Lang = "en";
try {
  const saved = localStorage.getItem(STORE) as Lang | null;
  if (saved && LANGS.includes(saved)) current = saved;
} catch { /* storage unavailable */ }

const listeners: (() => void)[] = [];

export function lang(): Lang {
  return current;
}

export function setLang(l: Lang) {
  current = l;
  try { localStorage.setItem(STORE, l); } catch { /* storage unavailable */ }
  document.documentElement.lang = l === "zh" ? "zh-Hans" : l;
  listeners.forEach((f) => f());
}

export function onLangChange(f: () => void) {
  listeners.push(f);
}

export function t(key: Key, params?: Record<string, string | number>, l: Lang = current): string {
  let s: string = TABLES[l][key] ?? en[key];
  if (params) for (const [k, v] of Object.entries(params)) s = s.split(`{${k}}`).join(String(v));
  return s;
}

/** Subtitle text for a voice line in the current language. */
export function sub(voiceId: string, l: Lang = current): string {
  return VOICE[l][voiceId] ?? VOICE.en[voiceId] ?? "";
}
