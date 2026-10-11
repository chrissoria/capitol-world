// Draws the contact box for each sample record, as it would sit in a member's card. Development only.

import type { Member } from "../src/data/types";
import { contactBox, type ContactInfo } from "../src/ui/contact";
import { el } from "../src/ui/dom";
import sample from "./fixtures/members.sample.json";

const WHO: Record<string, [name: string, chamber: Member["chamber"], party: string, state: string]> = {
  S000033: ["Bernard Sanders", "Senate", "I", "VT"],
  M001153: ["Lisa Murkowski", "Senate", "R", "AK"],
  S001150: ["Adam B. Schiff", "Senate", "D", "CA"],
  P000197: ["Nancy Pelosi", "House", "D", "CA"],
  O000172: ["Alexandria Ocasio-Cortez", "House", "D", "NY"],
  P000622: ["Jimmy Patronis", "House", "R", "FL"],
  F000484: ["Randy Fine", "House", "R", "FL"],
  X000000: ["Made-up Member (has an email)", "House", "I", "ZZ"],
  NONE: ["Someone with no record", "House", "D", "ZZ"],
};

const records: Record<string, ContactInfo> = sample.members;
const cards = document.getElementById("cards")!;
for (const [id, [name, chamber, party, state]] of Object.entries(WHO)) {
  const member: Member = { id, name, party, state, district: null, chamber, n_world: 0, n_total: 0 };
  cards.append(
    el("section", { class: "tab" },
      el("div", { class: "kicker" }, chamber === "Senate" ? "Senator" : "Representative"),
      el("h2", {}, el("span", { class: `pin ${party}` }), name),
      el("p", {}, el("span", { class: "chip" }, state)),
      contactBox(member, records[id], { open: id === "X000000" || id === "S000033" ? true : undefined }) ?? el("p", { class: "note" }, "No contact box: there is no record for this member."),
    ),
  );
}
