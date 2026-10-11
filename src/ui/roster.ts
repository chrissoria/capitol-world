// The Roster tab: every member of Congress, where their figure is in the world
// right now, and a click to go there.

import type { Member, World } from "../data/types";
import { add, el, put } from "./dom";

export function createRoster(section: HTMLElement, world: World, whereIs: (id: string) => string, pick: (id: string) => void, other?: { title: string; items: string; note?: string }, chambers = { House: "House", Senate: "Senate" }, seatWord = "state") {
  const select = (id: string, options: [string, string][]) => {
    const node = el("select", { id });
    for (const [value, label] of options) node.append(el("option", { value }, label));
    return node;
  };
  const search = el("input", { type: "search", id: "r-search", placeholder: other ? "Name or post" : `Name or ${seatWord}`, autocomplete: "off" });
  const chamber = select("r-chamber", [["", "Both chambers"], ["House", chambers.House], ["Senate", chambers.Senate]]);
  const party = select("r-party", [["", "Any party"], ["D", "Democrats"], ["R", "Republicans"], ["I", "Independents"]]);
  const sort = select("r-sort", [["name", "Sort by last name"], ["state", `Sort by ${seatWord}`], ["bills", "Sort by active bills"]]);
  const summary = el("p", { class: "note" });
  const list = el("ul", { class: "list" });
  add(
    section,
    el("h2", {}, other?.title ?? "Roster"),
    el("p", { class: "note" }, other
      ? other.note ?? "Pick anyone to go to them. Rooms are where the figure is in this map’s animation, not the person’s real whereabouts. The cabinet comes from Senate confirmations; the White House staff from Wikidata, which is less authoritative and not complete."
      : "Pick anyone to go to them. Rooms are where the figure is in this map’s animation, not the member’s real whereabouts."),
    el("label", { for: "r-search" }, other ? "Find someone" : "Find a member"),
    search,
    // A world without chambers or party seats has nothing to choose here.
    ...(other ? [] : [el("div", { class: "row-of-selects" }, chamber, party), sort]),
    summary,
    list,
  );

  const lastName = (member: Member) => member.name.split(" ").slice(-1)[0];
  const seat = (member: Member) => `${member.party ? `${member.party}-` : ""}${member.state}${member.chamber === "House" && member.district ? `-${member.district}` : ""}`;
  const places = new Map<string, HTMLElement>();

  function render() {
    const words = search.value.trim().toLowerCase().split(/\s+/).filter(Boolean);
    const shown = world.members
      .filter(
        (member) =>
          (!chamber.value || member.chamber === chamber.value) &&
          (!party.value || member.party === party.value || (party.value === "I" && member.party !== "D" && member.party !== "R")) &&
          words.every((word) => `${member.name} ${member.state}`.toLowerCase().includes(word)),
      )
      .sort((a, b) =>
        sort.value === "bills"
          ? b.n_world - a.n_world || lastName(a).localeCompare(lastName(b))
          : sort.value === "state"
            ? a.state.localeCompare(b.state, undefined, { numeric: true }) || lastName(a).localeCompare(lastName(b))
            : lastName(a).localeCompare(lastName(b)) || a.name.localeCompare(b.name),
      );
    places.clear();
    put(
      list,
      ...shown.map((member) => {
        const place = el("span", { class: "where" }, whereIs(member.id));
        places.set(member.id, place);
        const facts = [member.role, member.n_world ? (other ? `${member.n_world} ${other.items}`.replace(/^1 (\w+)s\b/, "1 $1") : `${member.n_world} active bill${member.n_world === 1 ? "" : "s"}`) : ""].filter(Boolean).join(" · ");
        const button = el(
          "button",
          { type: "button" },
          el("span", { class: "row-title" }, el("span", { class: `pin ${member.party}` }), `${member.name}${member.state ? ` (${seat(member)})` : ""}`),
          el("span", { class: "row-sub" }, place, facts ? ` · ${facts}` : ""),
        );
        button.addEventListener("click", () => pick(member.id));
        return el("li", {}, button);
      }),
    );
    summary.textContent = `${shown.length.toLocaleString()} of ${world.members.length.toLocaleString()} ${other ? "people" : "members"}.`;
  }

  for (const node of [chamber, party, sort]) node.addEventListener("change", render);
  search.addEventListener("input", render);

  // People move about, so keep the places current while the tab is open.
  const timer = setInterval(() => {
    if (!section.isConnected) return clearInterval(timer); // another Congress was opened
    if (section.hidden || document.hidden) return;
    for (const [id, node] of places) {
      const now = whereIs(id);
      if (node.textContent !== now) node.textContent = now;
    }
  }, 1500);

  let opened = false;
  return {
    open() {
      if (!opened) render();
      opened = true;
    },
  };
}
