// The whiteboard in the Library of Congress: one chart at a time, drawn stroke by
// stroke with marker pens. The Stats tab chooses which measures are counted (the
// Congresses, the period, the kind of measure); the board chooses what to plot
// and how to split it.

import { ordinal } from "../data/types";
import { drawFigures } from "../world/art";
import { el } from "./dom";

export interface BoardRow {
  congress: number;
  introduced: string;
  party: string;
  stage: number;
  area: string;
}

export interface BoardData {
  ready: boolean;
  rows: BoardRow[];
  /** "bills and joint resolutions introduced in the 118th Congress". */
  caption: string;
}

/** What a world's whiteboard can plot, where it differs from the Capitol's. */
export interface BoardConfig {
  /** The words on the way out, where there is no map to go back to. */
  back?: string;
  /** The pictures on the wall, as class names (see .wb-pics in style.css), where they are not the Library of Congress's. */
  pictures?(): string[];
  /** [key, label, the stage a row must have reached to count; 0 counts every row]. */
  measures: [BoardSpec["measure"], string, number][];
  /** Labels for the four ways to split, in the order party, time, period, area. */
  across: [BoardSpec["across"], string][];
  /** The name of one period in a chart: "118th", "Obama". */
  group(period: number): string;
  /** False where the items have no party: one line for all of them, and nobody to pick. */
  parties?: boolean;
}

export interface BoardSpec {
  measure: "introduced" | "reported" | "voted" | "passed" | "law";
  across: "party" | "time" | "congress" | "area";
  who: "" | "R" | "D" | "I";
}

export const MEASURES: [BoardSpec["measure"], string, number][] = [
  ["introduced", "How many were introduced", 0],
  ["reported", "Share that got out of committee", 1],
  ["voted", "Share that got a floor vote", 2],
  ["passed", "Share that passed a chamber", 3],
  ["law", "Share that became law", 5],
];
export const ACROSS: [BoardSpec["across"], string][] = [
  ["party", "by sponsor’s party"],
  ["time", "over time"],
  ["congress", "by Congress"],
  ["area", "by policy area"],
];
const WHO: [BoardSpec["who"], string][] = [
  ["", "everyone"],
  ["D", "Democrats only"],
  ["R", "Republicans only"],
  ["I", "Independents only"],
];
const PEN = { black: "#2e2a44", R: "#d8433b", D: "#3a6fd8", I: "#3f8f4a", grey: "#8d98a8" };
const HAND = '"Marker Felt", "Chalkboard SE", "Comic Sans MS", "Segoe Print", cursive';

interface Stroke {
  points: [number, number][];
  color: string;
  width: number;
  length: number;
}
interface Note {
  text: string;
  x: number;
  y: number;
  size: number;
  color: string;
  align: CanvasTextAlign;
  /** The note is written once this many strokes are down. */
  after: number;
}
interface Bar {
  label: string;
  value: number;
  count: number;
  color: string;
}

export function createWhiteboard(root: HTMLElement, onChange: (open: boolean) => void, outside: () => CanvasImageSource | null = () => null, config?: BoardConfig) {
  const measures = config?.measures ?? MEASURES;
  const splits = config?.across ?? ACROSS;
  const group = config?.group ?? ((period: number) => ordinal(period));
  const still = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const pick = <T extends string>(id: string, options: [T, string][]) => {
    const node = el("select", { id, "aria-label": id });
    for (const [value, label] of options) node.append(el("option", { value }, label));
    return node;
  };
  const measure = pick("wb-measure", measures.map(([key, label]) => [key, label] as [BoardSpec["measure"], string]));
  const across = pick("wb-across", splits);
  const who = pick("wb-who", WHO);
  const partisan = config?.parties !== false;
  who.hidden = !partisan;
  // The years to plot, for a closer look at part of what the Stats panel has chosen.
  const fromYear = el("select", { id: "wb-from", "aria-label": "From year" });
  const toYear = el("select", { id: "wb-to", "aria-label": "To year" });
  const years = el("span", { class: "wb-years" }, fromYear, el("span", {}, "to"), toYear);
  const zoom = el("button", { type: "button", class: "wb-zoom" });
  const pane = el("canvas", { width: "160", height: "120" });
  let known = "";
  /** Offer the years the measures span, and say which of them are wanted. */
  function yearRange(rows: BoardRow[]) {
    const all = [...new Set(rows.map((row) => row.introduced.slice(0, 4)).filter(Boolean))].sort();
    if (all.join() !== known) {
      known = all.join();
      // A different span of years: start again from the whole of it.
      for (const [node, whole] of [[fromYear, all[0]], [toYear, all[all.length - 1]]] as const) {
        node.replaceChildren(...all.map((year) => el("option", { value: year }, year)));
        node.value = whole ?? "";
      }
      years.hidden = all.length < 2;
    }
    let [low, high] = [fromYear.value, toYear.value];
    if (low > high) [low, high] = [high, low];
    return { low, high, narrowed: all.length > 1 && (low !== all[0] || high !== all[all.length - 1]) };
  }
  const sheet = el("canvas", { role: "img" });
  const close = el("button", { type: "button", class: "wb-close" }, config?.back ?? "← Back to the map");
  // The room: pictures on the wall, a plant, and a teacher at the left of the board who does the drawing.
  const teacher = el("canvas", { class: "wb-teacher", width: "28", height: "26", "aria-hidden": "true" });
  const plant = el("canvas", { class: "wb-plant", width: "14", height: "22", "aria-hidden": "true" });
  const figure = drawFigures([{ key: "teacher", look: { seed: "the-teacher", party: null } }]);
  const from = figure.frames.get("teacher")!;
  const sleeve = (() => {
    const [r, g, b] = figure.canvas.getContext("2d")!.getImageData(from.x + 8, from.y + 16, 1, 1).data;
    return `rgb(${r}, ${g}, ${b})`;
  })();
  /** 0: arms down. 1 and 2: the marker on the board, high and low. */
  function pose(arm: 0 | 1 | 2) {
    const g = teacher.getContext("2d")!;
    g.clearRect(0, 0, teacher.width, teacher.height);
    g.drawImage(figure.canvas, from.x, from.y, from.w, from.h, 2, 2, from.w, from.h);
    if (!arm) return;
    const rise = arm === 1 ? 1 : 0.45;
    for (let i = 0; i < 9; i++) {
      g.fillStyle = PEN.black;
      g.fillRect(13 + i, 14 - Math.round(i * rise), 3, 3);
    }
    for (let i = 0; i < 9; i++) {
      g.fillStyle = sleeve;
      g.fillRect(14 + i, 15 - Math.round(i * rise), 1, 1);
    }
    const tip = 15 - Math.round(8 * rise);
    g.fillStyle = PEN.black;
    g.fillRect(23, tip - 3, 4, 4);
    g.fillStyle = PEN.R;
    g.fillRect(24, tip - 2, 2, 2);
  }
  {
    const g = plant.getContext("2d")!;
    const leaf = (x: number, y: number, w: number, h: number, color = "#3f8f4a") => {
      g.fillStyle = color;
      g.fillRect(x, y, w, h);
    };
    leaf(6, 2, 2, 12, "#2f6f3a");
    leaf(2, 4, 4, 3);
    leaf(8, 2, 4, 3);
    leaf(1, 9, 5, 3);
    leaf(8, 7, 5, 3);
    leaf(5, 0, 3, 3, "#58a85f");
    leaf(3, 5, 2, 1, "#58a85f");
    leaf(9, 8, 2, 1, "#58a85f");
    leaf(2, 14, 10, 2, "#8a4b2a");
    leaf(3, 16, 8, 6, "#b9643a");
  }
  pose(0);
  let scribble = 0;
  const teach = (on: boolean) => {
    clearInterval(scribble);
    if (!on) return pose(1); // finished: pointing at the board
    let high = true;
    scribble = window.setInterval(() => pose((high = !high) ? 1 : 2), 170);
  };

  root.replaceChildren(
    el("div", { class: "wb-pics", "aria-hidden": "true" }, ...(config?.pictures?.() ?? ["land", "flag", "seal", "land dusk"]).map((picture) => el("i", { class: picture }))),
    el("div", { class: "wb-window", "aria-hidden": "true" }, pane),
    teacher,
    plant,
    el("div", { class: "wb-frame" },
      el("div", { class: "wb-bar" }, measure, across, who, years, zoom, close),
      el("p", { class: "wb-hint" }, config ? "Which periods are counted is chosen in the Stats panel." : "Which Congresses, period, kind of measure and chamber are counted is chosen in the Stats panel."),
      sheet,
      el("div", { class: "wb-tray" }, el("i", { class: "R" }), el("i", { class: "D" }), el("i", { class: "I" }), el("i", {}), el("b", {}))),
  );

  let source: () => BoardData = () => ({ ready: false, rows: [], caption: "" });
  let frame = 0;
  let seed = 1;
  const wobble = () => {
    seed = (seed * 16807) % 2147483647;
    return (seed / 2147483647 - 0.5) * 1.6;
  };

  function plan(width: number, height: number): { strokes: Stroke[]; notes: Note[]; summary: string } {
    const strokes: Stroke[] = [];
    const notes: Note[] = [];
    const line = (points: [number, number][], color: string, w = 2.5) => {
      // A hand never draws a straight line: break it up and nudge each point.
      const out: [number, number][] = [];
      for (let i = 0; i < points.length - 1; i++) {
        const [ax, ay] = points[i];
        const [bx, by] = points[i + 1];
        const steps = Math.max(1, Math.round(Math.hypot(bx - ax, by - ay) / 24));
        for (let s = i === 0 ? 0 : 1; s <= steps; s++) out.push([ax + ((bx - ax) * s) / steps + wobble(), ay + ((by - ay) * s) / steps + wobble()]);
      }
      let length = 0;
      for (let i = 1; i < out.length; i++) length += Math.hypot(out[i][0] - out[i - 1][0], out[i][1] - out[i - 1][1]);
      strokes.push({ points: out, color, width: w, length });
    };
    const write = (text: string, x: number, y: number, size: number, color = PEN.black, align: CanvasTextAlign = "center") =>
      notes.push({ text, x, y, size, color, align, after: strokes.length });

    const data = source();
    const spec: BoardSpec = { measure: measure.value as BoardSpec["measure"], across: across.value as BoardSpec["across"], who: who.value as BoardSpec["who"] };
    const [, title, stage] = measures.find(([key]) => key === spec.measure) ?? measures[0];
    const split = splits.find(([key]) => key === spec.across)![1];
    const only = spec.who && spec.across !== "party" ? `, ${WHO.find(([key]) => key === spec.who)![1]}` : "";
    const small = Math.max(11, Math.min(15, width / 42));
    write(`${title} ${split}${only}`, 18, 30, Math.max(15, Math.min(24, width / 26)), PEN.black, "left");
    const range = data.ready ? yearRange(data.rows) : { low: "", high: "", narrowed: false };
    const span = range.narrowed ? `, ${range.low === range.high ? range.low : `${range.low} to ${range.high}`} only` : "";
    write(data.caption + span, 18, 30 + small * 1.5, small, PEN.grey, "left");
    if (!data.ready) {
      write("Counting…", width / 2, height / 2, 22, PEN.grey);
      return { strokes, notes, summary: "Loading" };
    }
    const rows = data.rows.filter((row) => {
      const year = row.introduced.slice(0, 4);
      return year >= range.low && year <= range.high && (!spec.who || spec.across === "party" || row.party === spec.who);
    });
    if (!rows.length) {
      write("Nothing to count here.", width / 2, height / 2, 20, PEN.grey);
      return { strokes, notes, summary: "No measures match" };
    }
    const share = spec.measure !== "introduced";
    const valueOf = (group: BoardRow[]) => (share ? (group.length ? (100 * group.filter((row) => row.stage >= stage).length) / group.length : 0) : group.length);
    const show = (value: number) => (share ? `${value > 0 && value < 10 ? value.toFixed(1) : Math.round(value)}%` : Math.round(value).toLocaleString());
    const left = 56;
    const right = width - 20;
    const top = 30 + small * 1.5 + 34;
    // The parties are named once, in a key along the bottom, rather than on the chart.
    const keyed = spec.across === "time" || spec.across === "party";
    const bottom = height - (keyed ? 66 : 44);
    const partyName = (party: string) => (party === "R" ? "Republicans" : party === "D" ? "Democrats" : "Independents");
    const legend = (parties: string[]) => {
      const widths = parties.map((party) => 26 + partyName(party).length * small * 0.56);
      let x = Math.max(left, (width - widths.reduce((sum, w) => sum + w + 18, -18)) / 2);
      parties.forEach((party, i) => {
        const y = height - 16;
        line([[x, y - 5], [x + 18, y - 5]], penOf(party), 5);
        write(partyName(party), x + 24, y, small, penOf(party), "left");
        x += widths[i] + 18;
      });
    };
    const penOf = (party: string) => (party === "R" ? PEN.R : party === "D" ? PEN.D : party === "I" ? PEN.I : PEN.black);
    const groupBy = (key: (row: BoardRow) => string) => {
      const groups = new Map<string, BoardRow[]>();
      for (const row of rows) {
        const k = key(row);
        if (!k) continue;
        if (!groups.has(k)) groups.set(k, []);
        groups.get(k)!.push(row);
      }
      return groups;
    };
    const axes = (max: number) => {
      line([[left, top - 6], [left, bottom], [right, bottom]], PEN.black, 3);
      for (const part of [0.5, 1]) {
        const y = bottom - (bottom - top) * part;
        line([[left - 5, y], [left + 5, y]], PEN.black, 2);
        write(show(max * part), left - 9, y + 4, small * 0.9, PEN.grey, "right");
      }
    };
    const summary: string[] = [];

    if (spec.across === "time") {
      const years = [...new Set(rows.map((row) => row.introduced.slice(0, 4)))].sort();
      const byYear = years.length > 4;
      const key = (row: BoardRow) => row.introduced.slice(0, byYear ? 4 : 7);
      const keys = [...new Set(rows.map(key))].filter(Boolean).sort();
      const series = spec.who ? [spec.who] : partisan ? ["R", "D"] : [""];
      const points = series.map((party) => {
        const groups = groupBy((row) => (!party || row.party === party ? key(row) : ""));
        return keys.map((k) => valueOf(groups.get(k) ?? []));
      });
      const max = Math.max(1e-9, ...points.flat()) * 1.1;
      axes(max);
      const xOf = (i: number) => left + 14 + ((right - left - 28) * i) / Math.max(1, keys.length - 1);
      series.forEach((party, s) => {
        const path = points[s].map((value, i) => [xOf(i), bottom - ((bottom - top) * value) / max] as [number, number]);
        line(path, penOf(party), 3.5);
        summary.push(`${party || "All"}: ${points[s].map((value, i) => `${keys[i]} ${show(value)}`).join(", ")}`);
      });
      const every = Math.max(1, Math.ceil(keys.length / Math.max(2, Math.floor((right - left) / 62))));
      keys.forEach((k, i) => {
        if (i % every === 0) write(byYear ? k : new Date(`${k}-15T12:00:00`).toLocaleDateString(undefined, { month: "short", year: "2-digit" }), xOf(i), bottom + 18, small * 0.9, PEN.grey);
      });
      if (partisan) legend(series);
      return { strokes, notes, summary: summary.join(". ") };
    }

    let bars: Bar[];
    if (spec.across === "party") {
      const groups = groupBy((row) => row.party);
      bars = (["R", "D", "I"] as const)
        .filter((party) => groups.get(party)?.length)
        .map((party) => ({ label: party === "R" ? "Republicans" : party === "D" ? "Democrats" : "Independents", value: valueOf(groups.get(party)!), count: groups.get(party)!.length, color: penOf(party) }));
    } else if (spec.across === "congress") {
      const groups = groupBy((row) => String(row.congress));
      bars = [...groups.keys()].sort((a, b) => Number(a) - Number(b)).map((k) => ({ label: group(Number(k)), value: valueOf(groups.get(k)!), count: groups.get(k)!.length, color: penOf(spec.who) }));
    } else {
      const groups = groupBy((row) => row.area);
      bars = [...groups.entries()]
        .filter(([, group]) => !share || group.length >= 40) // a share of a handful means little
        .map(([area, group]) => ({ label: area, value: valueOf(group), count: group.length, color: penOf(spec.who) }))
        .sort((a, b) => b.value - a.value)
        .slice(0, 8);
    }
    if (!bars.length) {
      write("Nothing to count here.", width / 2, height / 2, 20, PEN.grey);
      return { strokes, notes, summary: "No measures match" };
    }
    const max = Math.max(1e-9, ...bars.map((bar) => bar.value)) * 1.12;
    const hatch = (x: number, y: number, w: number, h: number, color: string) => {
      line([[x, y + h], [x, y], [x + w, y], [x + w, y + h]], color, 3);
      for (let d = -h + 7; d < w; d += 8) {
        const sx = Math.max(x, x + d);
        const ex = Math.min(x + w, x + d + h);
        line([[sx, y + h - (sx - x - d)], [ex, y + h - (ex - x - d)]], color, 1.6);
      }
    };
    if (spec.across === "area") {
      // Sideways, so the long names fit.
      const rowH = (bottom - top + 10) / bars.length;
      const x0 = Math.min(width * 0.42, 230);
      line([[x0, top - 8], [x0, bottom + 4]], PEN.black, 3);
      bars.forEach((bar, i) => {
        const y = top - 4 + i * rowH;
        const w = ((right - x0 - 56) * bar.value) / max;
        write(bar.label.length > 30 ? `${bar.label.slice(0, 29)}…` : bar.label, x0 - 8, y + rowH * 0.55, small * 0.95, PEN.black, "right");
        line([[x0, y + 3], [x0 + w, y + 3], [x0 + w, y + rowH - 7], [x0, y + rowH - 7]], bar.color, 3);
        for (let d = 6; d < w; d += 8) line([[x0 + d, y + rowH - 7], [Math.min(x0 + w, x0 + d + rowH - 10), y + 3 + Math.max(0, x0 + d + rowH - 10 - (x0 + w))]], bar.color, 1.6);
        write(show(bar.value), x0 + w + 8, y + rowH * 0.55, small, bar.color, "left");
      });
    } else {
      axes(max);
      const slot = (right - left - 16) / bars.length;
      const barW = Math.min(slot * 0.62, 110);
      bars.forEach((bar, i) => {
        const x = left + 8 + slot * i + (slot - barW) / 2;
        const h = ((bottom - top) * bar.value) / max;
        hatch(x, bottom - h, barW, h, bar.color);
        write(show(bar.value), x + barW / 2, bottom - h - 8, small * 1.1, bar.color);
        if (spec.across !== "party") write(bar.label, x + barW / 2, bottom + 18, small * 0.95, PEN.black);
        if (share) write(`of ${bar.count.toLocaleString()}`, x + barW / 2, bottom + (spec.across === "party" ? 16 : 18 + small * 1.1), small * 0.8, PEN.grey);
      });
    }
    if (spec.across === "party") legend((["R", "D", "I"] as const).filter((party) => bars.some((bar) => bar.label === partyName(party))));
    return { strokes, notes, summary: bars.map((bar) => `${bar.label}: ${show(bar.value)}`).join(", ") };
  }

  function draw(animate = true) {
    cancelAnimationFrame(frame);
    const box = sheet.getBoundingClientRect();
    if (box.width < 40 || box.height < 40) return;
    const ratio = Math.min(2, devicePixelRatio || 1);
    sheet.width = Math.round(box.width * ratio);
    sheet.height = Math.round(box.height * ratio);
    const ctx = sheet.getContext("2d")!;
    seed = 20261010;
    const { strokes, notes, summary } = plan(box.width, box.height);
    sheet.setAttribute("aria-label", `${notes[0]?.text ?? "Chart"}. ${summary}`);
    const total = strokes.reduce((sum, stroke) => sum + stroke.length, 0);
    const started = performance.now();
    const duration = animate && !still ? Math.min(2600, 700 + total * 0.4) : 0;
    teach(duration > 0);
    const paint = (now: number) => {
      const reach = duration ? Math.min(1, (now - started) / duration) * total : total;
      ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
      ctx.clearRect(0, 0, box.width, box.height);
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      let used = 0;
      let done = 0;
      for (const stroke of strokes) {
        const budget = reach - used;
        if (budget <= 0) break;
        ctx.strokeStyle = stroke.color;
        ctx.lineWidth = stroke.width;
        ctx.beginPath();
        ctx.moveTo(stroke.points[0][0], stroke.points[0][1]);
        let run = 0;
        for (let i = 1; i < stroke.points.length; i++) {
          const [ax, ay] = stroke.points[i - 1];
          const [bx, by] = stroke.points[i];
          const piece = Math.hypot(bx - ax, by - ay);
          if (run + piece > budget) {
            const part = (budget - run) / piece;
            ctx.lineTo(ax + (bx - ax) * part, ay + (by - ay) * part);
            break;
          }
          ctx.lineTo(bx, by);
          run += piece;
        }
        ctx.stroke();
        used += stroke.length;
        if (used <= reach) done++;
      }
      for (const note of notes) {
        if (note.after > done) continue;
        // A line that would run off the board is written smaller.
        const room = note.align === "left" ? box.width - note.x - 10 : note.align === "right" ? note.x - 4 : Infinity;
        let size = note.size;
        ctx.font = `${size}px ${HAND}`;
        while (size > 9 && ctx.measureText(note.text).width > room) ctx.font = `${--size}px ${HAND}`;
        ctx.textAlign = note.align;
        ctx.fillStyle = note.color;
        ctx.fillText(note.text, note.x, note.y);
      }
      if (reach < total) frame = requestAnimationFrame(paint);
      else teach(false);
    };
    paint(started);
  }

  for (const node of [measure, across, who, fromYear, toYear]) node.addEventListener("change", () => draw());
  // "Just the board" hides the room for anyone who wants the chart as large as it will go.
  const ZOOM_KEY = "capitol-world-board";
  const setZoom = (on: boolean) => {
    root.classList.toggle("just-board", on);
    zoom.textContent = on ? "Show the room" : "Just the board";
    zoom.setAttribute("aria-pressed", String(on));
    try {
      localStorage.setItem(ZOOM_KEY, on ? "board" : "room");
    } catch {
      // Not remembered, but it still works for this visit.
    }
  };
  let wanted = false;
  try {
    wanted = localStorage.getItem(ZOOM_KEY) === "board";
  } catch {
    // The room, then.
  }
  setZoom(wanted);
  zoom.addEventListener("click", () => setZoom(!root.classList.contains("just-board")));
  new ResizeObserver(() => !root.hidden && draw(false)).observe(sheet);
  const shut = () => {
    if (root.hidden) return;
    root.hidden = true;
    cancelAnimationFrame(frame);
    clearInterval(scribble);
    onChange(false);
  };
  close.addEventListener("click", shut);
  // Escape closes the board before anything else hears it. The listener goes when the page is rebuilt.
  const onKey = (event: KeyboardEvent) => {
    if (!root.isConnected) return document.removeEventListener("keydown", onKey, true);
    if (event.key !== "Escape" || root.hidden) return;
    event.stopPropagation();
    shut();
  };
  document.addEventListener("keydown", onKey, true);

  return {
    get isOpen() {
      return !root.hidden;
    },
    /** Where the board gets the measures to count: the Stats tab's current choice. */
    setSource(next: () => BoardData) {
      source = next;
    },
    /** Show the board, optionally with a particular chart. */
    open(spec: Partial<BoardSpec> = {}) {
      if (spec.measure && measures.some(([key]) => key === spec.measure)) measure.value = spec.measure;
      // A world's board may not have every way to split (the Court's has no parties): fall back to its first.
      if (spec.across) across.value = splits.some(([key]) => key === spec.across) ? spec.across : splits[0][0];
      if (spec.who !== undefined) who.value = partisan ? spec.who : "";
      if (root.hidden) {
        // The window looks out on the Capitol.
        const world = outside();
        const glass = pane.getContext("2d");
        if (world && glass) {
          glass.imageSmoothingEnabled = false;
          glass.drawImage(world, 392, 290, 560, 420, 0, 0, pane.width, pane.height); // the House chamber, dome to steps
        }
        root.hidden = false;
        onChange(true);
      }
      draw();
    },
    /** Draw again because the measures being counted have changed. */
    refresh() {
      if (!root.hidden) draw();
    },
    close: shut,
  };
}

export type Whiteboard = ReturnType<typeof createWhiteboard>;
