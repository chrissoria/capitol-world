// The side panel: everything on the map is also reachable here with a keyboard.

import { loadSearch } from "../data/load";
import type { Bill, Member, SearchIndex, World } from "../data/types";
import { billLabel } from "../data/types";
import type { Site } from "../world/layout";
import type { Filter, Target } from "../world/scene";
import { add, el, niceDate, put } from "./dom";
import { explainSite, explainStage } from "./explain";
import { createStats } from "./stats";

export const STAGES: Record<string, string> = {
  hopper: "Just introduced",
  referral_desk: "Referred (committee not identified)",
  committee: "In committee",
  calendar: "On a calendar",
  floor: "On the floor",
  other_chamber: "Sent to the other chamber",
  conference: "Resolving differences",
  president: "Headed to the President",
  law: "Became law",
  vetoed: "Vetoed",
  adopted: "Resolution adopted",
};
const STAGE_ORDER = Object.keys(STAGES);
const SLUGS: Record<string, string> = {
  hr: "house-bill",
  s: "senate-bill",
  hres: "house-resolution",
  sres: "senate-resolution",
  hjres: "house-joint-resolution",
  sjres: "senate-joint-resolution",
  hconres: "house-concurrent-resolution",
  sconres: "senate-concurrent-resolution",
};

export interface PanelActions {
  select(target: Target | null): void;
  filter(filter: Filter): void;
  billsAt(siteKey: string): Bill[];
  siteOf(billId: string): Site | undefined;
  siteByKey(key: string): Site | undefined;
}

function congressUrl(id: string): string {
  const [congress, type, number] = id.split("-");
  return `https://www.congress.gov/bill/${congress}th-congress/${SLUGS[type] ?? "house-bill"}/${number}`;
}

export function createPanel(world: World, actions: PanelActions) {
  const members = new Map(world.members.map((member) => [member.id, member]));
  const bills = new Map(world.bills.map((bill) => [bill.id, bill]));
  const tabs = [...document.querySelectorAll<HTMLButtonElement>("#tabs button")];
  const sections = {
    inspect: document.getElementById("tab-inspect")!,
    search: document.getElementById("tab-search")!,
    filters: document.getElementById("tab-filters")!,
    stats: document.getElementById("tab-stats")!,
    about: document.getElementById("tab-about")!,
  };

  function showTab(name: keyof typeof sections) {
    for (const tab of tabs) tab.setAttribute("aria-selected", String(tab.dataset.tab === name));
    for (const [key, section] of Object.entries(sections)) section.hidden = key !== name;
    if (name === "stats") stats.open();
  }
  for (const tab of tabs) tab.addEventListener("click", () => showTab(tab.dataset.tab as keyof typeof sections));

  const pin = (party: string) => el("span", { class: `pin ${party}`, title: partyName(party) });
  const partyName = (party: string) => (party === "R" ? "Republican" : party === "D" ? "Democrat" : "Independent");
  const memberLine = (member: Member) =>
    `${member.name} (${member.party}-${member.state}${member.chamber === "House" && member.district ? `-${member.district}` : ""})`;

  function billRow(bill: Bill, sub?: string) {
    const button = el(
      "button",
      { type: "button" },
      el("span", { class: "row-title" }, `${billLabel(bill)} · ${bill.title}`),
      el("span", { class: "row-sub" }, sub ?? `${actions.siteOf(bill.id)?.label ?? STAGES[bill.loc.kind]} · ${niceDate(bill.last_action.date)}`),
    );
    button.addEventListener("click", () => actions.select({ type: "bill", id: bill.id }));
    return el("li", {}, button);
  }

  const backButton = () => {
    const button = el("button", { type: "button", class: "back" }, "← Overview");
    button.addEventListener("click", () => actions.select(null));
    return button;
  };

  // ── Inspect ────────────────────────────────────────────────────────────────

  function showOverview() {
    const byStage = new Map<string, number>();
    for (const bill of world.bills) byStage.set(bill.loc.kind, (byStage.get(bill.loc.kind) ?? 0) + 1);
    const rows = STAGE_ORDER.filter((kind) => byStage.get(kind)).map((kind) => {
      const button = el("button", { type: "button" }, el("span", { class: "bar-row" }, el("span", { class: "row-title" }, STAGES[kind]), el("span", { class: "count" }, String(byStage.get(kind)))));
      button.addEventListener("click", () => showStage(kind));
      return el("li", {}, button);
    });
    put(sections.inspect, 
      el("h2", {}, "What Congress is working on"),
      el(
        "p",
        {},
        `${world.counts.world.toLocaleString()} bills had an action in the 30 days up to ${niceDate(world.data_through)}. `,
        "Each sheet of paper on the map is one of them, sitting where its latest action left it.",
      ),
      el("p", { class: "note" }, "Click a paper or a building. Click the House or the Senate to go inside and meet the members. Drag to move around; scroll or pinch to zoom."),
      el("h3", {}, "Where those bills are"),
      el("ul", { class: "list" }, ...rows),
      el("p", { class: "note" }, `Pick a stage to list its bills. The other ${(world.counts.total - world.counts.world).toLocaleString()} bills of this Congress are in Search.`),
    );
  }

  /** Every bill at one stage, without having to find its building on the map. */
  function showStage(kind: string) {
    const inStage = world.bills.filter((bill) => bill.loc.kind === kind).sort((a, b) => b.last_action.date.localeCompare(a.last_action.date) || a.id.localeCompare(b.id));
    const places = new Map<string, { site: Site; count: number }>();
    for (const bill of inStage) {
      const site = actions.siteOf(bill.id);
      if (!site) continue;
      const entry = places.get(site.key) ?? { site, count: 0 };
      entry.count++;
      places.set(site.key, entry);
    }
    // A stage with one building is that building: show it exactly as a click on the map would.
    if (places.size === 1) return actions.select({ type: "site", id: [...places.keys()][0] });
    const placeRows = [...places.values()]
      .sort((a, b) => b.count - a.count || a.site.label.localeCompare(b.site.label))
      .map(({ site, count }) => {
        const button = el("button", { type: "button" }, el("span", { class: "bar-row" }, el("span", { class: "row-title" }, site.label), el("span", { class: "count" }, String(count))));
        button.addEventListener("click", () => actions.select({ type: "site", id: site.key }));
        return el("li", {}, button);
      });
    const shown = inStage.slice(0, 200);
    put(sections.inspect,
      backButton(),
      el("div", { class: "kicker" }, "Stage"),
      el("h2", {}, STAGES[kind] ?? kind),
      el("p", {}, `${inStage.length.toLocaleString()} active bill${inStage.length === 1 ? "" : "s"} in ${places.size} places. Pick a place to go there, or a bill to find it on the map.`),
      explainStage([...places.values()].map((place) => place.site).sort((a, b) => a.wing.localeCompare(b.wing))),
      el("h3", {}, "Places"),
      el("ul", { class: "list" }, ...placeRows),
      el("h3", {}, inStage.length > shown.length ? `The ${shown.length} most recent bills` : "Bills"),
      el("ul", { class: "list" }, ...shown.map((bill) => billRow(bill))),
      inStage.length > shown.length ? el("p", { class: "note" }, `Showing ${shown.length} of ${inStage.length.toLocaleString()}. Pick a place above to see all of its bills.`) : null,
    );
    sections.inspect.scrollTop = 0;
  }

  function showBill(bill: Bill) {
    const sponsor = members.get(bill.sponsor);
    const site = actions.siteOf(bill.id);
    const sponsorButton = sponsor ? el("button", { type: "button" }, pin(sponsor.party), memberLine(sponsor)) : null;
    sponsorButton?.addEventListener("click", () => actions.select({ type: "member", id: bill.sponsor }));
    put(sections.inspect, 
      backButton(),
      el("div", { class: "kicker" }, billLabel(bill)),
      el("h2", {}, bill.title),
      el("p", {}, el("span", { class: "chip stage" }, STAGES[bill.loc.kind] ?? bill.loc.kind), site ? el("span", { class: "chip" }, site.label) : null, bill.policy_area ? el("span", { class: "chip" }, bill.policy_area) : null),
      site ? explainSite(site) : null,
      el("h3", {}, "Latest action"),
      el("p", {}, el("strong", {}, niceDate(bill.last_action.date)), " — ", bill.last_action.text),
      el("h3", {}, "Sponsor"),
      sponsorButton ? el("ul", { class: "list" }, el("li", {}, sponsorButton)) : el("p", {}, "Unknown"),
      el("p", { class: "note" }, `${bill.cosponsors} cosponsor${bill.cosponsors === 1 ? "" : "s"} · introduced ${niceDate(bill.introduced)}`),
      bill.summary ? el("h3", {}, "Summary") : null,
      bill.summary ? el("p", {}, bill.summary) : null,
      bill.summary ? el("p", { class: "note" }, "Written by an AI model from the bill text. It may describe an earlier version of the bill.") : null,
      el("p", {}, el("a", { href: bill.url || congressUrl(bill.id), target: "_blank", rel: "noopener" }, "Read it on Congress.gov ↗")),
    );
  }

  function showMember(member: Member) {
    const theirs = world.bills.filter((bill) => bill.sponsor === member.id).sort((a, b) => b.last_action.date.localeCompare(a.last_action.date));
    put(sections.inspect, 
      backButton(),
      el("div", { class: "kicker" }, member.role || (member.chamber === "Senate" ? "Senator" : "Representative")),
      el("h2", {}, pin(member.party), member.name),
      el("p", {}, el("span", { class: "chip" }, partyName(member.party)), el("span", { class: "chip" }, member.chamber === "House" && member.district ? `${member.state}-${member.district}` : member.state)),
      el("p", {}, `Sponsor of ${member.n_total.toLocaleString()} bill${member.n_total === 1 ? "" : "s"} this Congress, ${theirs.length} with an action in the last 30 days.`),
      theirs.length ? el("h3", {}, "Active bills") : null,
      el("ul", { class: "list" }, ...theirs.map((bill) => billRow(bill))),
      theirs.length ? el("p", { class: "note" }, "The buildings holding these bills are outlined on the map.") : null,
      el("p", { class: "note" }, "The character is generated at random and is not a likeness. What it does inside the building is animation, not a record of the member’s day."),
    );
  }

  function showSite(site: Site) {
    const here = actions.billsAt(site.key);
    const chair = members.get(world.roles?.chairs[site.key.replace("committee:", "")] ?? "");
    const chairButton = chair ? el("button", { type: "button" }, pin(chair.party), `Chair: ${memberLine(chair)}`) : null;
    chairButton?.addEventListener("click", () => actions.select({ type: "member", id: chair!.id }));
    put(sections.inspect, 
      backButton(),
      el("div", { class: "kicker" }, site.wing === "Center" ? "Shared" : site.wing),
      el("h2", {}, site.label),
      explainSite(site),
      chairButton ? el("ul", { class: "list" }, el("li", {}, chairButton)) : null,
      el("p", {}, here.length ? `${here.length} active bill${here.length === 1 ? "" : "s"} here.` : "No bills with an action in the last 30 days are here."),
      el("ul", { class: "list" }, ...here.slice(0, 200).map((bill) => billRow(bill, `${members.get(bill.sponsor)?.name ?? ""} · ${niceDate(bill.last_action.date)}`))),
      here.length > 200 ? el("p", { class: "note" }, `Showing the 200 most recent of ${here.length}.`) : null,
    );
  }

  function showOutside(id: string, index: SearchIndex) {
    const at = index.id.indexOf(id);
    if (at < 0) return showOverview();
    const [, type, number] = id.split("-");
    const sponsor = members.get(index.sponsors[index.sponsor[at]] ?? "");
    put(sections.inspect, 
      backButton(),
      el("div", { class: "kicker" }, billLabel({ type: type.toUpperCase(), number })),
      el("h2", {}, index.title[at]),
      el("p", {}, el("span", { class: "chip stage" }, index.statuses[index.status[at]] ?? ""), index.policy_areas[index.policy_area[at]] ? el("span", { class: "chip" }, index.policy_areas[index.policy_area[at]]) : null),
      el("p", {}, `Last action ${niceDate(index.date[at])}. It has not moved in the last 30 days, so it is not on the map.`),
      sponsor ? el("p", {}, "Sponsor: ", pin(sponsor.party), memberLine(sponsor)) : null,
      el("p", {}, el("a", { href: congressUrl(id), target: "_blank", rel: "noopener" }, "Read it on Congress.gov ↗")),
    );
  }

  // ── Search ─────────────────────────────────────────────────────────────────

  const searchBox = el("input", { type: "search", id: "search-box", placeholder: "Bill number, title words, or a name", autocomplete: "off" });
  const searchResults = el("div", {});
  sections.search.append(el("label", { for: "search-box" }, "Search all bills and members"), searchBox, searchResults);
  let searchRun = 0;

  async function runSearch() {
    const run = ++searchRun;
    const query = searchBox.value.trim().toLowerCase();
    if (query.length < 2) return put(searchResults, el("p", { class: "note" }, `Type at least two characters. All ${world.counts.total.toLocaleString()} bills are searchable.`));
    const words = query.split(/\s+/);
    const people = world.members.filter((member) => words.every((word) => `${member.name} ${member.state}`.toLowerCase().includes(word))).slice(0, 8);
    const peopleRows = people.map((member) => {
      const button = el("button", { type: "button" }, el("span", { class: "row-title" }, pin(member.party), memberLine(member)), el("span", { class: "row-sub" }, `${member.n_world} active bills`));
      button.addEventListener("click", () => actions.select({ type: "member", id: member.id }));
      return el("li", {}, button);
    });
    put(searchResults, peopleRows.length ? el("h3", {}, "Members") : null, el("ul", { class: "list" }, ...peopleRows), el("p", { class: "note" }, "Searching bills…"));

    let index: SearchIndex;
    try {
      index = await loadSearch();
    } catch {
      if (run === searchRun) searchResults.append(el("p", { class: "note" }, "The bill index could not be loaded."));
      return;
    }
    if (run !== searchRun) return;
    const compact = query.replace(/[\s.]/g, "");
    const hits: number[] = [];
    for (let i = 0; i < index.id.length && hits.length < 60; i++) {
      const [, type, number] = index.id[i].split("-");
      if (`${type}${number}` === compact || words.every((word) => index.title[i].toLowerCase().includes(word))) hits.push(i);
    }
    const rows = hits.map((i) => {
      const id = index.id[i];
      const [, type, number] = id.split("-");
      const onMap = bills.has(id);
      const button = el(
        "button",
        { type: "button" },
        el("span", { class: "row-title" }, `${billLabel({ type: type.toUpperCase(), number })} · ${index.title[i]}`),
        el("span", { class: "row-sub" }, `${index.statuses[index.status[i]] ?? ""} · ${niceDate(index.date[i])}${onMap ? " · on the map" : ""}`),
      );
      button.addEventListener("click", () => {
        if (onMap) actions.select({ type: "bill", id });
        else {
          showOutside(id, index);
          showTab("inspect");
          history.replaceState(null, "", `#bill=${id}`);
        }
      });
      return el("li", {}, button);
    });
    put(searchResults, 
      peopleRows.length ? el("h3", {}, "Members") : null,
      el("ul", { class: "list" }, ...peopleRows),
      el("h3", {}, hits.length === 60 ? "Bills (first 60)" : `Bills (${hits.length})`),
      rows.length ? el("ul", { class: "list" }, ...rows) : el("p", { class: "note" }, "No bill matches."),
    );
  }
  searchBox.addEventListener("input", () => void runSearch());
  void runSearch();

  // ── Filters ────────────────────────────────────────────────────────────────

  const select = (id: string, options: [string, string][]) => {
    const node = el("select", { id });
    for (const [value, label] of options) node.append(el("option", { value }, label));
    return node;
  };
  const areas = [...new Set(world.bills.map((bill) => bill.policy_area).filter(Boolean))].sort();
  const kinds = STAGE_ORDER.filter((kind) => world.bills.some((bill) => bill.loc.kind === kind));
  const party = select("f-party", [["", "Any party"], ["D", "Democrats"], ["R", "Republicans"], ["I", "Independents"]]);
  const area = select("f-area", [["", "Any policy area"], ...areas.map((a) => [a, a] as [string, string])]);
  const stage = select("f-stage", [["", "Any stage"], ...kinds.map((k) => [k, STAGES[k]] as [string, string])]);
  const summary = el("p", { class: "note" });
  const reset = el("button", { type: "button" }, "Clear filters");
  const applyFilters = () => {
    const filter: Filter = { party: party.value, policyArea: area.value, stage: stage.value };
    actions.filter(filter);
    const n = world.bills.filter(
      (bill) => (!filter.policyArea || bill.policy_area === filter.policyArea) && (!filter.stage || bill.loc.kind === filter.stage) && (!filter.party || members.get(bill.sponsor)?.party === filter.party),
    ).length;
    summary.textContent = filter.party || filter.policyArea || filter.stage ? `${n.toLocaleString()} of ${world.bills.length.toLocaleString()} active bills match. Everything else is dimmed.` : "Nothing is filtered.";
  };
  for (const node of [party, area, stage]) node.addEventListener("change", applyFilters);
  reset.addEventListener("click", () => {
    party.value = area.value = stage.value = "";
    applyFilters();
  });
  sections.filters.append(
    el("label", { for: "f-party" }, "Sponsor's party"), party,
    el("label", { for: "f-area" }, "Policy area"), area,
    el("label", { for: "f-stage" }, "Stage"), stage,
    summary, reset,
  );
  summary.textContent = "Nothing is filtered.";

  const stats = createStats(sections.stats, world, (id) => actions.select({ type: "member", id }));

  // ── About ──────────────────────────────────────────────────────────────────

  add(sections.about, 
    el("h2", {}, "About this map"),
    el("p", {}, "Capitol World shows where the bills of the ", `${world.congress}th`, " U.S. Congress are in the legislative process. Bills start in a hopper at the bottom and move up: to a committee, onto a calendar, to the floor, across to the other chamber, and on to the White House."),
    el("h3", {}, "The data"),
    el("p", {}, "Everything comes from the Congress.gov API through the public dataset ", el("a", { href: "https://huggingface.co/datasets/chrissoria/federal-bills-active", target: "_blank", rel: "noopener" }, "chrissoria/federal-bills-active"), ", refreshed each morning."),
    el("p", {}, `Data through ${niceDate(world.data_through)}. The map shows the ${world.counts.world.toLocaleString()} bills with an action in the last 30 days; all ${world.counts.total.toLocaleString()} are searchable.`),
    world.counts.guessed_locations ? el("p", { class: "note" }, `${world.counts.guessed_locations.toLocaleString()} bills are placed from their last action alone, because their full history has not been collected yet.`) : null,
    el("h3", {}, "How to read it"),
    el("p", {}, "Teal roofs are the House side and purple roofs the Senate side. Paper with a teal band started in the House; a purple band, the Senate. A number over a legislator's head is how many active bills they sponsor."),
    el("p", {}, "Party is shown by the pin on each figure and in this panel: ", pin("D"), "Democrat, ", pin("R"), "Republican, ", pin("I"), "Independent."),
    el("p", {}, "The figures are generated at random from each member's ID. They are not likenesses."),
    el("p", {}, "Click the House or the Senate to step inside. The floor plan is invented, and what the figures do there (eating, reading, talking, presiding) is ambient animation, not a record of anyone’s day. Only the bills, their locations and who carried them come from the data."),
    el("p", {}, "Bill summaries are written by an AI model and may describe an earlier version of a bill. Where a bill sits says nothing about its merit."),
    el("h3", {}, "Music"),
    el("p", {}, "The music is made in your browser in the style of an old game console: “Yankee Doodle” on the map and “America the Beautiful” inside the buildings, both long in the public domain. The ♪ button turns it off, and the choice is remembered."),
    el("p", { class: "note" }, "Made by Chris Soria. Not affiliated with Congress."),
  );

  // ── Public ─────────────────────────────────────────────────────────────────

  showOverview();
  return {
    show(target: Target | null) {
      if (!target) showOverview();
      else if (target.type === "bill") {
        const bill = bills.get(target.id);
        if (bill) showBill(bill);
        else void loadSearch().then((index) => showOutside(target.id, index)).catch(showOverview);
      } else if (target.type === "member") {
        const member = members.get(target.id);
        if (member) showMember(member);
      } else {
        const site = actions.siteByKey(target.id);
        if (site) showSite(site);
      }
      if (target) showTab("inspect");
    },
    refresh(target: Target | null) {
      // Called when bills move during the replay, so open lists stay current.
      if (target?.type === "site") {
        const site = actions.siteByKey(target.id);
        if (site && !sections.inspect.hidden) showSite(site);
      }
    },
  };
}
