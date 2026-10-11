// Checks for the parts of the contact box that need no page: links, drafts and copying.
// Run with `npm test` (Node 23.6 or later, which reads TypeScript as it is).

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import {
  DRAFTS_KEPT,
  DRAFTS_KEY,
  MAILTO_MAX,
  channelsOf,
  copyWith,
  emailAddress,
  mailtoLink,
  memoryStore,
  readDraft,
  telLink,
  webAddress,
  writeDraft,
  type ContactInfo,
} from "../src/data/contact.ts";

const sample: { members: Record<string, ContactInfo> } = JSON.parse(readFileSync(new URL("./fixtures/members.sample.json", import.meta.url), "utf8"));

/** What a mail program would read back out of a mailto link. */
function parts(href: string) {
  const [to, query = ""] = href.replace(/^mailto:/, "").split("?");
  const fields = Object.fromEntries(query.split("&").filter(Boolean).map((pair) => pair.split("=").map(decodeURIComponent)));
  return { to: decodeURIComponent(to), subject: fields.subject as string | undefined, body: fields.body as string | undefined, names: Object.keys(fields) };
}

test("a mailto link carries the subject and message back out unchanged", () => {
  const subject = "Please vote for H.R. 1234 & S. 56: 100% of us ask";
  const body = "Dear Senator,\n\nI’m a constituent in Montpelier (05602). Café owners + farmers need this?\n#urgent = yes; a+b\n\nThank you,\nJosé";
  const link = mailtoLink("office@example.org", subject, body);
  assert.equal(link.carriesBody, true);
  const read = parts(link.href);
  assert.equal(read.to, "office@example.org");
  assert.equal(read.subject, subject);
  assert.equal(read.body, body.replace(/\n/g, "\r\n"));
  assert.deepEqual(read.names, ["subject", "body"]);
});

test("a mailto link is plain ASCII with no raw spaces, plus signs, ampersands or line breaks in its fields", () => {
  const { href } = mailtoLink("office@example.org", "A & B + C", "one two\nthree&bcc=someone@example.com ‘quoted’ (x) *y* !");
  const query = href.split("?")[1];
  assert.match(href, /^[\x21-\x7e]+$/);
  assert.equal(query.split("&").length, 2);
  assert.ok(!/[+\s'()*!]/.test(query));
  assert.ok(query.includes("%0D%0A"));
  assert.ok(!/%0[AD]/.test(query.replace(/%0D%0A/g, "")));
  // The "&bcc=" in the message stays inside the message.
  assert.deepEqual(parts(href).names, ["subject", "body"]);
});

test("line breaks of every kind become CR LF once", () => {
  const { href } = mailtoLink("a@example.org", "", "one\r\ntwo\rthree\nfour");
  assert.equal(parts(href).body, "one\r\ntwo\r\nthree\r\nfour");
});

test("empty fields are left out of the link", () => {
  assert.equal(mailtoLink("a@example.org", "", "").href, "mailto:a@example.org");
  assert.equal(mailtoLink("a@example.org", "  ", "hello").href, "mailto:a@example.org?body=hello");
  assert.equal(mailtoLink("a@example.org", "hello", "\n").href, "mailto:a@example.org?subject=hello");
});

test("a plus sign in the address is encoded, so that it is not read as a space", () => {
  assert.equal(mailtoLink("press+mail@example.org", "", "").href, "mailto:press%2Bmail@example.org");
});

test("a message too long for a link is left out, and the link says so", () => {
  const long = "word ".repeat(600);
  const link = mailtoLink("office@example.org", "Subject line", long);
  assert.equal(link.carriesBody, false);
  assert.ok(link.href.length <= MAILTO_MAX);
  assert.equal(parts(link.href).subject, "Subject line");
  assert.equal(parts(link.href).body, undefined);
  // Right at the limit: one that fits is carried, one a character longer is not.
  const room = MAILTO_MAX - "mailto:office@example.org?body=".length;
  assert.equal(mailtoLink("office@example.org", "", "a".repeat(room)).carriesBody, true);
  assert.equal(mailtoLink("office@example.org", "", "a".repeat(room + 1)).carriesBody, false);
  // Characters that take several bytes count by what they become in the link, not by how they look.
  assert.equal(mailtoLink("office@example.org", "", "é".repeat(400)).carriesBody, false);
  // A subject that is itself too long leaves a bare address.
  assert.equal(mailtoLink("office@example.org", "s".repeat(3000), "x").href, "mailto:office@example.org");
});

test("only a single plain address makes a mailto link", () => {
  for (const bad of ["", "   ", "not an address", "a@b", "a@example.org?bcc=x@example.org", "a@example.org,b@example.org", "Name <a@example.org>", "a b@example.org", "a@example.org\nBcc: x@example.org", "javascript:alert(1)", "a@@example.org"]) {
    assert.equal(emailAddress(bad), "", bad);
    assert.equal(mailtoLink(bad, "s", "b").href, "", bad);
  }
  assert.equal(emailAddress(" Office@Example.org "), "Office@Example.org");
  assert.equal(emailAddress("mailto:office@example.org"), "office@example.org");
});

test("only http and https addresses are opened", () => {
  assert.equal(webAddress("https://www.sanders.senate.gov/contact/"), "https://www.sanders.senate.gov/contact/");
  assert.equal(webAddress("http://example.org"), "http://example.org/");
  for (const bad of ["", null, undefined, "hhttps://fine.house.gov/contact", "javascript:alert(1)", "data:text/html,hi", "//example.org", "www.example.org", "mailto:a@example.org", "https://", "https://localhost/x", "https://user:pw@example.org/"]) {
    assert.equal(webAddress(bad), "", String(bad));
  }
});

test("phone numbers become tel links only when they are whole", () => {
  assert.equal(telLink("202-224-5141"), "tel:+12022245141");
  assert.equal(telLink("(202) 224-5141"), "tel:+12022245141");
  assert.equal(telLink("1-202-224-5141"), "tel:+12022245141");
  assert.equal(telLink("224-5141"), "");
  assert.equal(telLink(""), "");
});

test("the sample records give the channels they should", () => {
  const sanders = channelsOf(sample.members.S000033);
  assert.equal(sanders.form, "https://www.sanders.senate.gov/contact/");
  assert.equal(sanders.email, "");
  assert.equal(sanders.tel, "tel:+12022245141");
  assert.equal(sanders.office, "332 Dirksen Senate Office Building Washington DC 20510");
  // A representative with no contact form in the data: the website stands in.
  const pelosi = channelsOf(sample.members.P000197);
  assert.equal(pelosi.form, "");
  assert.equal(pelosi.site, "https://pelosi.house.gov/");
  // The data's own typo ("hhttps://") is not opened; the website still is.
  const fine = channelsOf(sample.members.F000484);
  assert.ok(sample.members.F000484.contact_form?.startsWith("hhttps://"));
  assert.equal(fine.form, "");
  assert.equal(fine.site, "https://fine.house.gov/");
  // The made-up record, the only one with an address.
  assert.equal(channelsOf(sample.members.X000000).email, "office@example.org");
  // Real records carry no email at all.
  for (const [id, record] of Object.entries(sample.members)) if (id !== "X000000") assert.equal(channelsOf(record).email, "", id);
  // No record, an empty record, and nulls.
  for (const none of [undefined, null, {}, { url: null, contact_form: null, email: null, phone: null, office: null }]) {
    assert.deepEqual(channelsOf(none), { form: "", site: "", email: "", phone: "", tel: "", office: "" });
  }
});

test("a draft comes back as it was written, and an empty one is forgotten", () => {
  const store = memoryStore();
  assert.deepEqual(readDraft(store, "S000033"), { subject: "", body: "" });
  assert.equal(writeDraft(store, "S000033", { subject: "Hello", body: "Line one\nLine two  " }), true);
  assert.deepEqual(readDraft(store, "S000033"), { subject: "Hello", body: "Line one\nLine two  " });
  assert.deepEqual(readDraft(store, "P000197"), { subject: "", body: "" });
  writeDraft(store, "S000033", { subject: " ", body: "" });
  assert.equal(store.getItem(DRAFTS_KEY), null);
});

test("only the latest few drafts are kept", () => {
  const store = memoryStore();
  for (let i = 0; i < DRAFTS_KEPT + 5; i++) writeDraft(store, `M${i}`, { subject: "", body: `draft ${i}` }, 1000 + i);
  const kept = Object.keys(JSON.parse(store.getItem(DRAFTS_KEY)!));
  assert.equal(kept.length, DRAFTS_KEPT);
  assert.equal(readDraft(store, "M0").body, "");
  assert.equal(readDraft(store, `M${DRAFTS_KEPT + 4}`).body, `draft ${DRAFTS_KEPT + 4}`);
  // What is stored is the drafts and when they were touched, and nothing else.
  for (const value of Object.values(JSON.parse(store.getItem(DRAFTS_KEY)!))) assert.deepEqual(Object.keys(value as object).sort(), ["at", "body", "subject"]);
});

test("storage that is broken or refuses does not break the box", () => {
  const junk = memoryStore();
  for (const bad of ["not json", "[1,2]", "null", '{"S000033":"text"}', '{"S000033":{"subject":3}}']) {
    junk.setItem(DRAFTS_KEY, bad);
    assert.deepEqual(readDraft(junk, "S000033"), { subject: "", body: "" }, bad);
  }
  const refusing = {
    getItem: () => null,
    setItem: () => {
      throw new Error("QuotaExceededError");
    },
    removeItem: () => {},
  };
  assert.equal(writeDraft(refusing, "S000033", { subject: "a", body: "b" }), false);
  const closed = {
    getItem: (): string | null => {
      throw new Error("SecurityError");
    },
    setItem: () => {},
    removeItem: () => {},
  };
  assert.deepEqual(readDraft(closed, "S000033"), { subject: "", body: "" });
});

test("copying uses the clipboard, then the older way, and says when neither worked", async () => {
  const calls: string[] = [];
  const legacy = (ok: boolean) => (text: string) => {
    calls.push(`legacy:${text}`);
    return ok;
  };
  // The clipboard works: the older way is not touched.
  assert.equal(await copyWith({ write: async (text) => void calls.push(`write:${text}`), legacy: legacy(true) }, "one"), true);
  assert.deepEqual(calls, ["write:one"]);
  // The clipboard refuses (no permission, page not focused): the older way is tried.
  calls.length = 0;
  const refuse = async () => {
    throw new Error("NotAllowedError");
  };
  assert.equal(await copyWith({ write: refuse, legacy: legacy(true) }, "two"), true);
  assert.deepEqual(calls, ["legacy:two"]);
  // No clipboard at all (a page without https).
  calls.length = 0;
  assert.equal(await copyWith({ legacy: legacy(true) }, "three"), true);
  assert.deepEqual(calls, ["legacy:three"]);
  // Neither works, or the older way throws.
  assert.equal(await copyWith({ write: refuse, legacy: legacy(false) }, "four"), false);
  assert.equal(
    await copyWith({ write: refuse, legacy: () => {
      throw new Error("no");
    } }, "five"),
    false,
  );
});
