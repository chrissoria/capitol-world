// The wall calendar from a committee's room, taken down and held up close:
// every meeting of the Congress by month, in the map's own paper-and-ink look.

import { meetingUrl, type CommitteeInfo, type CommitteeMeeting } from "../data/meetings";
import { el, put } from "./dom";

export interface CalendarActions {
  committee(code: string): Promise<CommitteeInfo | undefined>;
  /** Show the room as it would have been for one meeting. */
  stage(code: string, meetingId: string): void;
}

const WEEKDAYS = ["S", "M", "T", "W", "T", "F", "S"];
const dayKey = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;

export function createCalendar(root: HTMLElement, actions: CalendarActions) {
  let code = "";
  let info: CommitteeInfo | undefined;
  let byDay = new Map<string, CommitteeMeeting[]>();
  let year = 0;
  let month = 0;
  let chosen = "";
  let first = new Date();
  let last = new Date();

  function close() {
    root.hidden = true;
    root.replaceChildren();
  }

  function show(date: Date) {
    year = date.getFullYear();
    month = date.getMonth();
    chosen = byDay.has(dayKey(date)) ? dayKey(date) : "";
    render();
  }

  function step(by: number) {
    const next = new Date(year, month + by, 1);
    if (next < new Date(first.getFullYear(), first.getMonth(), 1) || next > new Date(last.getFullYear(), last.getMonth(), 1)) return;
    year = next.getFullYear();
    month = next.getMonth();
    // Land on the month's first meeting, so there is always something to read.
    chosen = [...byDay.keys()].filter((key) => key.startsWith(`${year}-${String(month + 1).padStart(2, "0")}`)).sort()[0] ?? "";
    render();
  }

  function note(meeting: CommitteeMeeting) {
    const when = new Date(meeting.date);
    const past = when.getTime() < Date.now();
    const facts = [when.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit", timeZoneName: "short" }), meeting.type];
    if (meeting.sub && info) facts.push(info.subcommittees[meeting.sub] ?? "Subcommittee");
    if (meeting.n_bills) facts.push(`${meeting.n_bills} bill${meeting.n_bills === 1 ? "" : "s"}`);
    if (meeting.n_witnesses) facts.push(`${meeting.n_witnesses} witness${meeting.n_witnesses === 1 ? "" : "es"}`);
    const stage = past ? el("button", { type: "button" }, "▶ Re-stage in the room") : null;
    stage?.addEventListener("click", () => {
      actions.stage(code, meeting.id);
      close();
    });
    return el(
      "li",
      { class: past ? "held" : "coming" },
      el("strong", {}, meeting.title || meeting.type),
      el("span", { class: "facts" }, facts.join(" · ")),
      ...(meeting.outcomes ?? []).slice(0, 3).map((line) => el("span", { class: "outcome" }, line)),
      el("span", { class: "acts" }, stage, el("a", { href: meetingUrl(meeting, info?.chamber ?? "House"), target: "_blank", rel: "noopener" }, "Congress.gov ↗")),
    );
  }

  function render() {
    if (!info) return;
    const today = dayKey(new Date());
    const title = new Date(year, month, 1).toLocaleDateString(undefined, { month: "long", year: "numeric" });
    const previous = el("button", { type: "button", "aria-label": "Previous month" }, "‹");
    const next = el("button", { type: "button", "aria-label": "Next month" }, "›");
    const shut = el("button", { type: "button", class: "shut", "aria-label": "Put the calendar back" }, "✕");
    previous.addEventListener("click", () => step(-1));
    next.addEventListener("click", () => step(1));
    shut.addEventListener("click", close);
    previous.disabled = year === first.getFullYear() && month === first.getMonth();
    next.disabled = year === last.getFullYear() && month === last.getMonth();

    const cells: HTMLElement[] = WEEKDAYS.map((letter) => el("span", { class: "weekday" }, letter));
    for (let blank = new Date(year, month, 1).getDay(); blank > 0; blank--) cells.push(el("span", { class: "day blank" }));
    const days = new Date(year, month + 1, 0).getDate();
    let inMonth = 0;
    for (let day = 1; day <= days; day++) {
      const key = dayKey(new Date(year, month, day));
      const meetings = byDay.get(key);
      const classes = ["day", key === today ? "today" : "", key === chosen ? "chosen" : ""];
      if (!meetings) {
        cells.push(el("span", { class: classes.join(" ") }, String(day)));
        continue;
      }
      inMonth += meetings.length;
      classes.push(key > today ? "coming" : "held");
      const cell = el(
        "button",
        { type: "button", class: classes.join(" "), "aria-label": `${new Date(year, month, day).toDateString()}: ${meetings.length} meeting${meetings.length === 1 ? "" : "s"}` },
        String(day),
        el("span", { class: "marks" }, ...meetings.slice(0, 3).map(() => el("i", {})), meetings.length > 3 ? "+" : ""),
      );
      cell.addEventListener("click", () => {
        chosen = key;
        render();
      });
      cells.push(cell);
    }

    const picked = byDay.get(chosen) ?? [];
    const upcoming = [...byDay.keys()].filter((key) => key > today).sort()[0];
    const latest = [...byDay.keys()].filter((key) => key <= today).sort().pop();
    const jump = (label: string, key: string | undefined) => {
      if (!key) return null;
      const button = el("button", { type: "button" }, label);
      button.addEventListener("click", () => show(new Date(`${key}T12:00:00`)));
      return button;
    };
    put(
      root,
      el(
        "div",
        { class: `sheet ${info.chamber === "Senate" ? "senate" : "house"}`, role: "dialog", "aria-label": `${info.name} calendar` },
        el("div", { class: "rings" }, ...Array.from({ length: 9 }, () => el("i", {}))),
        el("div", { class: "band" }, previous, el("div", {}, el("small", {}, info.name), el("strong", {}, title)), next, shut),
        el("div", { class: "grid" }, ...cells),
        el("div", { class: "legend" }, el("span", { class: "held" }, el("i", {}), "met"), el("span", { class: "coming" }, el("i", {}), "scheduled"), el("span", { class: "count" }, `${inMonth} this month`), jump("Latest", latest), jump("Next", upcoming)),
        picked.length
          ? el("div", { class: "notes" }, el("h3", {}, new Date(`${chosen}T12:00:00`).toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" })), el("ul", {}, ...picked.map(note)))
          : el("p", { class: "notes empty" }, inMonth ? "Pick a marked day to see what was on." : "Nothing on the calendar this month."),
      ),
    );
    root.hidden = false;
  }

  return {
    get isOpen() {
      return !root.hidden;
    },
    close,
    open(committeeCode: string) {
      void actions.committee(committeeCode).then((found) => {
        if (!found) return;
        code = committeeCode;
        info = found;
        byDay = new Map();
        for (const meeting of found.meetings) {
          const key = dayKey(new Date(meeting.date));
          byDay.set(key, [...(byDay.get(key) ?? []), meeting].sort((a, b) => a.date.localeCompare(b.date)));
        }
        const keys = [...byDay.keys()].sort();
        const now = new Date();
        first = keys.length ? new Date(`${keys[0]}T12:00:00`) : now;
        last = keys.length && keys[keys.length - 1] > dayKey(now) ? new Date(`${keys[keys.length - 1]}T12:00:00`) : now;
        // Open on the next meeting if one is scheduled, otherwise on the latest one held.
        const today = dayKey(now);
        const start = keys.find((key) => key > today) ?? keys.filter((key) => key <= today).pop();
        show(start ? new Date(`${start}T12:00:00`) : now);
      });
    },
  };
}
