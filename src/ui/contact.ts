// "Write to this member", inside a member's card.
//
// The app sends nothing. A message leaves the page in one of two ways, both of them the visitor's own doing: as a
// mailto link handed to their mail program (where an office publishes an address, which is rare), or on their
// clipboard, to be pasted into the office's own contact form, which opens in a new tab. The only thing kept is the
// unsent draft, in this browser's localStorage.

import { DRAFTS_KEY, channelsOf, copyWith, mailtoLink, memoryStore, readDraft, writeDraft, type ContactInfo, type Draft, type Store } from "../data/contact";
import type { Member } from "../data/types";
import { add, el, put, type Child } from "./dom";
import "./contact.css";

export type { ContactInfo } from "../data/contact";

export interface ContactOptions {
  /** Start unfolded. Left out, the box is folded unless there is a draft to come back to. */
  open?: boolean;
}

const FIND_YOURS: Record<string, string> = {
  House: "https://www.house.gov/representatives/find-your-representative",
  Senate: "https://www.senate.gov/senators/senators-contact.htm",
};

/** Drafts for a browser that will not store them: they last until the page is closed. */
const forThisVisit = memoryStore();

function browserStore(): Store | null {
  try {
    const store = window.localStorage;
    store.getItem(DRAFTS_KEY);
    return store;
  } catch {
    return null;
  }
}

/** The older way to copy: put the text in a box off screen, select it, and ask the browser to copy the selection. */
function copyBySelection(text: string): boolean {
  const before = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  const box = el("textarea", { readonly: "", tabindex: "-1", "aria-hidden": "true", style: "position:fixed;top:0;left:0;width:1px;height:1px;padding:0;border:0;opacity:0;font-size:16px" });
  box.value = text;
  document.body.append(box);
  try {
    box.select();
    box.setSelectionRange(0, text.length);
    return document.execCommand("copy");
  } finally {
    box.remove();
    before?.focus();
  }
}

function copy(text: string): Promise<boolean> {
  const clipboard = window.isSecureContext ? navigator.clipboard : undefined;
  return copyWith({ write: clipboard?.writeText ? (value) => clipboard.writeText(value) : undefined, legacy: copyBySelection }, text);
}

const outside = (href: string, text: string) => el("a", { href, target: "_blank", rel: "noopener" }, text);

/** "www.sanders.senate.gov/contact" for a link's text, so that the visitor can see where it goes. */
function shown(href: string): string {
  const url = new URL(href);
  const path = url.pathname.replace(/\/$/, "");
  return `${url.hostname}${path.length > 28 ? `${path.slice(0, 26)}…` : path}`;
}

/**
 * A folded box for writing to a member, for the member's card. `info` is the member's record in world/members.json.
 * Returns null where there is nothing to show (no record, or a record with no usable channel), so it can be passed
 * straight to `put` or `add`.
 */
export function contactBox(member: Member, info: ContactInfo | null | undefined, options: ContactOptions = {}): HTMLElement | null {
  const channels = channelsOf(info);
  if (!channels.form && !channels.site && !channels.email && !channels.tel && !channels.office) return null;

  const store = browserStore();
  const stored = store ? readDraft(store, member.id) : { subject: "", body: "" };
  const draft: Draft = stored.subject || stored.body ? stored : readDraft(forThisVisit, member.id);

  const id = (part: string) => `contact-${part}-${member.id}`;
  const subject = el("input", { type: "text", id: id("subject"), maxlength: "200", autocomplete: "off", spellcheck: "true", placeholder: "What it is about" });
  const body = el("textarea", { id: id("body"), rows: "7", spellcheck: "true", placeholder: "Say who you are, what you are asking for, and why." });
  subject.value = draft.subject;
  body.value = draft.body;

  const status = el("p", { class: "note contact-status", role: "status", "aria-live": "polite" });
  const say = (...parts: Child[]) => put(status, ...parts);
  const count = el("span", {});
  const kept = el("p", { class: "note", id: id("kept") });
  body.setAttribute("aria-describedby", id("kept"));

  // The web: the office's contact form if the record has one, or else its official site, where the form is.
  const web = channels.form || channels.site;
  const webName = channels.form ? "contact form" : "website";
  const webLink = (text: string) => outside(web, `${text} their ${webName} ↗`);

  // ── Actions ──

  const mail = channels.email ? el("a", { class: "go", href: `mailto:${channels.email}` }) : null;
  const toWeb = web ? el("button", { type: "button", class: "go" }, `Copy message and open their ${webName}`) : null;
  const copySubject = el("button", { type: "button", class: "quiet" }, "Copy subject");
  const copyMessage = el("button", { type: "button", class: "quiet" }, "Copy message");
  const clear = el("button", { type: "button", class: "quiet" }, "Clear draft");

  const current = () => mailtoLink(channels.email, subject.value, body.value);

  function refresh() {
    const length = body.value.length;
    count.textContent = length ? `${length.toLocaleString()} character${length === 1 ? "" : "s"}. ` : "";
    if (!mail) return;
    const link = current();
    mail.href = link.href;
    // Too long for a link: say before the click that this one copies.
    mail.textContent = link.carriesBody ? "Open in your mail app" : "Copy message and open your mail app";
  }

  function keep() {
    const now: Draft = { subject: subject.value, body: body.value };
    const inBrowser = store ? writeDraft(store, member.id, now) : false;
    writeDraft(forThisVisit, member.id, inBrowser ? { subject: "", body: "" } : now);
    kept.replaceChildren(count, inBrowser
      ? "Your unsent draft is kept in this browser only, until you clear it."
      : "This browser is not storing drafts, so yours lasts only until you close the page.");
    refresh();
  }
  for (const box of [subject, body]) box.addEventListener("input", keep);

  /** Copy the message, or say how to do it by hand. */
  async function copyOr(text: string, done: Child[], field: HTMLInputElement | HTMLTextAreaElement = body): Promise<boolean> {
    if (await copy(text)) {
      say(...done);
      return true;
    }
    field.focus();
    field.select();
    say("Your browser would not copy it. It is selected: copy it yourself (Ctrl or ⌘ and C).");
    return false;
  }

  mail?.addEventListener("click", (event) => {
    const link = current();
    const fallback: Child[] = [" If no mail app opened, your browser has none set up: ", copyAddress(), " and write from your usual email."];
    if (link.carriesBody) {
      // The link itself does the work. Nothing is sent until the visitor presses send in their own mail program.
      say("Handed to your mail app, where you can read it over and send it.", ...fallback);
      return;
    }
    event.preventDefault();
    void copyOr(body.value, ["Your message is too long to hand over in a link, so it has been copied. Paste it into the email that opens.", ...fallback]).then((copied) => {
      if (copied) window.location.href = link.href;
    });
  });

  function copyAddress(): HTMLButtonElement {
    const button = el("button", { type: "button", class: "quiet inline" }, "copy the address");
    button.addEventListener("click", () => void copy(channels.email).then((ok) => say(ok ? `Copied ${channels.email}.` : `Your browser would not copy it. The address is ${channels.email}.`)));
    return button;
  }

  toWeb?.addEventListener("click", () => {
    if (!body.value.trim()) {
      body.focus();
      say("There is no message to copy yet. Write one above, or ", webLink("open"), " without one.");
      return;
    }
    void copyOr(body.value, [`Message copied. Their ${webName} is opening in a new tab: paste it there. If no tab opened, `, webLink("open"), " yourself."]).then((copied) => {
      // The office's own page, in a tab that cannot reach back into this one. What is typed there is between the visitor and the office.
      if (copied) window.open(web, "_blank", "noopener");
      else add(status, " Then ", webLink("open"), " and paste it there.");
    });
  });

  copySubject.addEventListener("click", () => {
    if (subject.value.trim()) void copyOr(subject.value.trim(), ["Subject copied."], subject);
    else say("There is no subject to copy yet.");
  });
  copyMessage.addEventListener("click", () => {
    if (body.value.trim()) void copyOr(body.value, ["Message copied."]);
    else say("There is no message to copy yet.");
  });
  clear.addEventListener("click", () => {
    const was: Draft = { subject: subject.value, body: body.value };
    if (!was.subject && !was.body) return say("There is no draft to clear.");
    subject.value = "";
    body.value = "";
    keep();
    // A slip of the finger should not cost a letter: the words stay in this page's memory until it is closed.
    const undo = el("button", { type: "button", class: "quiet inline" }, "Put it back");
    undo.addEventListener("click", () => {
      subject.value = was.subject;
      body.value = was.body;
      keep();
      say("Draft put back.");
      body.focus();
    });
    say("Draft cleared from this browser. ", undo);
  });

  // ── Their channels, as they publish them ──

  const rows: [string, Child][] = [];
  if (channels.form) rows.push(["Contact form", outside(channels.form, `${shown(channels.form)} ↗`)]);
  if (channels.site) rows.push(["Website", outside(channels.site, `${shown(channels.site)} ↗`)]);
  if (channels.email) rows.push(["Email", el("a", { href: `mailto:${channels.email}` }, channels.email)]);
  if (channels.tel) rows.push(["Phone", el("a", { href: channels.tel }, channels.phone)]);
  if (channels.office) rows.push(["Office", channels.office]);

  const findYours = FIND_YOURS[member.chamber];
  const box = el(
    "details",
    { class: "explain contact" },
    el("summary", {}, `Write to ${member.name}`),
    el("p", { class: "note" },
      "Capitol World sends nothing itself. ",
      channels.email
        ? "It hands your message to your own mail app, or copies it for you to paste into the office’s own form. "
        : web
          ? `Like most offices, this one gives no public email address: your message is copied, and you paste and send it on the ${channels.form ? "office’s own contact form" : "form on the office’s own website"}. `
          : "This office lists no email address or web form here, so the message can only be copied. ",
      "Most offices answer only the people they represent, and ask for your name and address to check.",
      findYours ? " " : null,
      findYours ? outside(findYours, "Find who represents you ↗") : null,
    ),
    el("label", { for: id("subject") }, "Subject"),
    subject,
    el("label", { for: id("body") }, "Message"),
    body,
    kept,
    el("div", { class: "contact-actions" }, mail, toWeb),
    el("div", { class: "contact-small" }, copySubject, copyMessage, clear),
    status,
    el("dl", { class: "contact-channels" }, ...rows.flatMap(([name, value]) => [el("dt", {}, name), el("dd", {}, value)])),
  );
  if (options.open ?? Boolean(draft.subject || draft.body)) box.setAttribute("open", "");
  keep();
  return box;
}
