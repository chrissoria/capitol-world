// A member's public contact channels, and the links and drafts built from them.
// Nothing here touches the page or the network, so it can be checked on its own (tests/contact.test.ts).

/** One member's record in world/members.json. Every field may be missing or empty. */
export interface ContactInfo {
  url?: string | null;
  contact_form?: string | null;
  email?: string | null;
  phone?: string | null;
  office?: string | null;
  address?: string | null;
}

/** The channels of a record that are fit to show: empty where there is none, or where the value is not what it should be. */
export interface Channels {
  form: string;
  site: string;
  email: string;
  phone: string;
  tel: string;
  office: string;
}

export interface Draft {
  subject: string;
  body: string;
}

/** A web address, only if it is an ordinary http(s) one; anything else (a typo, a script) is dropped. */
export function webAddress(raw: string | null | undefined): string {
  const text = (raw ?? "").trim();
  if (!/^https?:\/\//i.test(text)) return "";
  try {
    const url = new URL(text);
    return url.hostname.includes(".") && !url.username && !url.password ? url.href : "";
  } catch {
    return "";
  }
}

/** One plain email address, or nothing: no lists, no display names, no characters that could add headers to a mailto link. */
export function emailAddress(raw: string | null | undefined): string {
  const text = (raw ?? "").trim().replace(/^mailto:/i, "");
  return /^[A-Za-z0-9._+-]+@[A-Za-z0-9-]+(\.[A-Za-z0-9-]+)+$/.test(text) && text.length <= 254 ? text : "";
}

/** A `tel:` link for a U.S. number, or nothing if it is not ten digits (with or without the leading 1). */
export function telLink(raw: string | null | undefined): string {
  const digits = (raw ?? "").replace(/\D/g, "");
  const ten = digits.length === 11 && digits.startsWith("1") ? digits.slice(1) : digits;
  return ten.length === 10 ? `tel:+1${ten}` : "";
}

export function channelsOf(info: ContactInfo | null | undefined): Channels {
  const phone = (info?.phone ?? "").trim();
  const tel = telLink(phone);
  return {
    form: webAddress(info?.contact_form),
    site: webAddress(info?.url),
    email: emailAddress(info?.email),
    phone: tel ? phone : "",
    tel,
    office: (info?.address || info?.office || "").trim(),
  };
}

/**
 * The longest mailto link handed to a mail program. Windows passes a link to a program in a command line that holds
 * about 2,000 characters, and what does not fit is cut off without a word, so a longer message is copied instead.
 */
export const MAILTO_MAX = 1900;

export interface Mailto {
  href: string;
  /** False when the message was too long for a link: the link then carries the subject alone. */
  carriesBody: boolean;
}

/** Percent-encoding as mail links want it (RFC 6068): spaces as %20, never "+", and line breaks as CR LF. */
function field(text: string): string {
  return encodeURIComponent(text.replace(/\r\n?|\n/g, "\r\n")).replace(/[!'()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`);
}

/** A mailto link for one address, with the subject and, if it fits, the message. Empty if the address is not one. */
export function mailtoLink(email: string, subject: string, body: string, max = MAILTO_MAX): Mailto {
  const to = emailAddress(email);
  if (!to) return { href: "", carriesBody: false };
  // The address is known to hold only letters, digits and . _ + - @, and of those only "+" needs encoding.
  const base = `mailto:${to.replace(/\+/g, "%2B")}`;
  const build = (parts: [string, string][]) => {
    const query = parts.filter(([, value]) => value.trim()).map(([key, value]) => `${key}=${field(value.trim())}`).join("&");
    return query ? `${base}?${query}` : base;
  };
  const whole = build([["subject", subject], ["body", body]]);
  if (whole.length <= max) return { href: whole, carriesBody: true };
  const short = build([["subject", subject]]);
  return { href: short.length <= max ? short : base, carriesBody: false };
}

// ── Unsent drafts ──
// One entry in the browser's own storage, holding the latest few drafts by member. It is never sent anywhere.

export const DRAFTS_KEY = "capitol-world-drafts";
/** Drafts kept at once; the one touched longest ago goes first. */
export const DRAFTS_KEPT = 12;

/** The part of `localStorage` used here, so that a stand-in can be passed where there is none. */
export type Store = Pick<Storage, "getItem" | "setItem" | "removeItem">;

type Saved = Record<string, { subject: string; body: string; at: number }>;

function saved(store: Store): Saved {
  try {
    const parsed: unknown = JSON.parse(store.getItem(DRAFTS_KEY) ?? "{}");
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    const out: Saved = {};
    for (const [id, value] of Object.entries(parsed as Record<string, Partial<Saved[string]> | null>)) {
      if (value && typeof value.subject === "string" && typeof value.body === "string") out[id] = { subject: value.subject, body: value.body, at: Number(value.at) || 0 };
    }
    return out;
  } catch {
    return {};
  }
}

export function readDraft(store: Store, memberId: string): Draft {
  const found = saved(store)[memberId];
  return { subject: found?.subject ?? "", body: found?.body ?? "" };
}

/** Keep a draft, or forget it if it is empty. Returns false if the browser would not store it. */
export function writeDraft(store: Store, memberId: string, draft: Draft, now = Date.now()): boolean {
  try {
    const all = saved(store);
    if (draft.subject.trim() || draft.body.trim()) all[memberId] = { subject: draft.subject, body: draft.body, at: now };
    else delete all[memberId];
    const kept = Object.entries(all).sort((a, b) => b[1].at - a[1].at).slice(0, DRAFTS_KEPT);
    if (kept.length) store.setItem(DRAFTS_KEY, JSON.stringify(Object.fromEntries(kept)));
    else store.removeItem(DRAFTS_KEY);
    return true;
  } catch {
    return false;
  }
}

/** A stand-in for `localStorage` that lasts for the visit, for a browser that refuses to store anything. */
export function memoryStore(): Store {
  const held = new Map<string, string>();
  return {
    getItem: (key) => held.get(key) ?? null,
    setItem: (key, value) => void held.set(key, value),
    removeItem: (key) => void held.delete(key),
  };
}

// ── Copying ──

/** What copying needs from the page, so that it can be checked without one. */
export interface CopyTools {
  /** The browser's clipboard, where it offers one (it does not on a page served without https). */
  write?: (text: string) => Promise<void>;
  /** The older way: select the text in a hidden box and ask the browser to copy the selection. */
  legacy: (text: string) => boolean;
}

/** Copy text, by the clipboard if the browser allows it and by the older way if not. False if neither worked. */
export async function copyWith(tools: CopyTools, text: string): Promise<boolean> {
  if (tools.write) {
    try {
      await tools.write(text);
      return true;
    } catch {
      // Refused (no permission, or the page lost focus): try the older way.
    }
  }
  try {
    return tools.legacy(text);
  } catch {
    return false;
  }
}
