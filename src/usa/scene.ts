// One scene shows either map: the whole country, where the shapes are states, or one state, where
// they are counties. Shapes and the stars on capitals can be pointed at and clicked; what a click
// means is decided by the page (./index.ts), not here.

import Phaser from "phaser";
import { PALETTE } from "../world/art";
import { panZoom, type PanZoom } from "../world/camera";
import { CELL, SEA, drawLand, drawSea, drawStar } from "./art";
import type { Shape, Sheet } from "./sheet";

/** A name on the map. Squares are the sheet's own; a name with no place of its own goes on its shape, when it fits. */
export interface NameSpec {
  /** The shape it names. */
  id: string;
  /** What to write when there is room for the whole name, and when there is less ("" to leave it off then). */
  full: string;
  short: string;
  /** A fixed place for it, beside a shape too broken up to hold it. */
  at?: { x: number; y: number };
  /** Its place, from the top, in the column of names out at sea, each with a line back to its shape. */
  column?: number;
  /** Leave it off when the view is further out than this, because it would run into its neighbours. */
  hideBelow?: number;
}

export interface StarSpec {
  /** Whose capital it is. */
  id: string;
  x: number;
  y: number;
  /** A gold star: there is a world behind it. */
  gold: boolean;
  /** Drawn larger: the one capital on a state's own map, or one with a world. */
  big: boolean;
}

export interface SheetView {
  sheet: Sheet;
  names: NameSpec[];
  stars: StarSpec[];
  /** Where the column of names at sea stands: its middle, in squares. */
  column?: { x: number; y: number };
  /** A heading that belongs on the map itself. */
  heading?: { text: string; x: number; y: number };
  /** A shape with fewer squares than this is hard to hit, so a click beside it counts. */
  tiny: number;
  /** Anything else to paint on the land. */
  extras?(ctx: CanvasRenderingContext2D): void;
  /** What to say beside the pointer when it is over something. */
  caption(hit: Hit): string;
}

export type Hit = { kind: "place" | "star"; id: string };

export interface AtlasHooks {
  /** Something was clicked: a shape, a capital's star, or (null) the sea. */
  onPick(hit: Hit | null): void;
  /** How much of the top of the view is covered by the page's own title and buttons, in pixels. */
  covered?(): number;
  onReady(): void;
}

const FONT = '"Trebuchet MS", "Verdana", sans-serif';
const DEPTH = { sea: 0, land: 1, glow: 2, outline: 3, line: 4, star: 5, name: 6, caption: 7 };
const MIN_ZOOM = 0.12;
const MAX_ZOOM = 5;
const NEAR = 11; // screen pixels: how close to a very small shape a click may fall
const INK = Phaser.Display.Color.HexStringToColor(PALETTE.ink).color;
const YELLOW = Phaser.Display.Color.HexStringToColor(PALETTE.yellow).color;

interface Name {
  spec: NameSpec;
  text: Phaser.GameObjects.Text;
  shape: Shape;
  short: { w: number; h: number };
  full: { w: number; h: number };
  showing: "short" | "full" | "none";
}

interface Star {
  spec: StarSpec;
  image: Phaser.GameObjects.Image;
  /** How near a click must be, in screen pixels. */
  reach: number;
}

export class AtlasScene extends Phaser.Scene {
  private view?: SheetView;
  private pan!: PanZoom;
  private land?: Phaser.GameObjects.Image;
  private glow!: Phaser.GameObjects.Graphics;
  private outline!: Phaser.GameObjects.Graphics;
  private lines!: Phaser.GameObjects.Graphics;
  private caption!: Phaser.GameObjects.Text;
  private heading?: Phaser.GameObjects.Text;
  private names: Name[] = [];
  private stars: Star[] = [];
  private hovered: Hit | null = null;
  private selected: string | null = null;
  private marked: string | null = null;
  private lastZoom = -1;
  /** The whole map is on show and the visitor has not moved it, so it stays whole when the window changes size. */
  private whole = true;

  constructor(private hooks: AtlasHooks) {
    super("atlas");
  }

  create() {
    this.textures.addCanvas("sea", drawSea());
    this.textures.addCanvas("star", drawStar(1, PALETTE.white));
    this.textures.addCanvas("star-big", drawStar(2, PALETTE.white));
    this.textures.addCanvas("star-gold", drawStar(2, PALETTE.yellow));
    const far = 4096; // sea out past the edges, enough for the widest screen and the largest sheet
    this.add.tileSprite(-far, -far, far * 3, far * 3, "sea").setOrigin(0).setDepth(DEPTH.sea);
    this.glow = this.add.graphics().setDepth(DEPTH.glow);
    this.outline = this.add.graphics().setDepth(DEPTH.outline);
    this.lines = this.add.graphics().setDepth(DEPTH.line);
    this.caption = this.text("", 12).setOrigin(0.5, 1).setDepth(DEPTH.caption).setVisible(false);
    this.makeCamera();
    this.hooks.onReady();
  }

  private text(value: string, size: number) {
    return this.add
      .text(0, 0, value, { fontFamily: FONT, fontSize: `${size}px`, fontStyle: "bold", color: "#ffffff", stroke: PALETTE.ink, strokeThickness: 3, align: "center" })
      .setResolution(3)
      .setDepth(DEPTH.name);
  }

  private makeCamera() {
    const camera = this.cameras.main;
    camera.setRoundPixels(true);
    this.pan = panZoom(this, MIN_ZOOM, MAX_ZOOM);
    this.scale.on("resize", (size: Phaser.Structs.Size, _base: unknown, _display: unknown, previousWidth: number, previousHeight: number) => {
      if (this.whole) return this.fitWorld(0);
      camera.scrollX -= (size.width - previousWidth) / 2;
      camera.scrollY -= (size.height - previousHeight) / 2;
    });
    this.input.on("pointermove", (pointer: Phaser.Input.Pointer) => {
      if (pointer.isDown && pointer.getDistance() > 8) this.whole = false;
      this.hover(pointer.isDown ? null : this.pick(pointer), pointer);
    });
    this.input.on("wheel", () => (this.whole = false));
    this.input.on("gameout", () => this.hover(null));
    this.input.on("pointerup", (pointer: Phaser.Input.Pointer) => {
      // Phaser hears mouse-up on the whole window, so ignore clicks that began on the panel or the buttons.
      if (pointer.downElement !== this.game.canvas || pointer.upElement !== this.game.canvas) return;
      if (pointer.getDistance() > 8) return;
      const hit = this.pick(pointer);
      this.hover(null);
      this.hooks.onPick(hit);
    });
  }

  // ── Putting a sheet on show ────────────────────────────────────────────────

  /** Show a map: the country, or a state. Whatever was on show is taken down. */
  show(view: SheetView) {
    this.land?.destroy();
    this.heading?.destroy();
    this.heading = undefined;
    for (const name of this.names) name.text.destroy();
    for (const star of this.stars) star.image.destroy();
    this.names = [];
    this.stars = [];
    if (this.textures.exists("land")) this.textures.remove("land");
    this.glow.clear();
    this.hovered = null;
    this.selected = null;
    this.marked = null;
    this.caption.setVisible(false);
    this.view = view;

    const { sheet } = view;
    this.textures.addCanvas("land", drawLand(sheet, view.extras));
    this.land = this.add.image(0, 0, "land").setOrigin(0).setDepth(DEPTH.land);
    for (const spec of view.names) {
      const shape = sheet.shapes.get(spec.id);
      if (!shape) continue;
      const text = this.text("", spec.at || spec.column !== undefined ? 13 : 12);
      const sizeOf = (value: string) => {
        text.setText(value || " ");
        return { w: value ? text.width : 0, h: text.height };
      };
      const full = sizeOf(spec.full);
      const short = sizeOf(spec.short);
      if (spec.column !== undefined) text.setOrigin(0, 0.5);
      else text.setOrigin(0.5);
      if (spec.at) text.setPosition(spec.at.x * CELL, spec.at.y * CELL);
      this.names.push({ spec, text, shape, full, short, showing: "short" });
    }
    if (view.heading) this.heading = this.text(view.heading.text, 11).setOrigin(0.5, 0).setPosition(view.heading.x * CELL, view.heading.y * CELL);
    for (const spec of view.stars) {
      const image = this.add.image(spec.x * CELL, spec.y * CELL, spec.gold ? "star-gold" : spec.big ? "star-big" : "star").setDepth(DEPTH.star);
      this.stars.push({ spec, image, reach: spec.big ? 14 : 9 });
    }

    const pad = 1200; // room to centre the map in a tall or wide window
    this.cameras.main.setBounds(-pad, -pad, sheet.w * CELL + pad * 2, sheet.h * CELL + pad * 2);
    this.fitWorld(0);
    this.lastZoom = -1; // so that the names are laid out for this sheet
  }

  // ── Pointing and clicking ──────────────────────────────────────────────────

  /** What is under the pointer: a star, a name that stands apart from its shape, the shape itself, or a very small shape nearby. */
  private pick(pointer: Phaser.Input.Pointer): Hit | null {
    if (!this.view) return null;
    const camera = this.cameras.main;
    const point = camera.getWorldPoint(pointer.x, pointer.y);
    let star: Star | undefined;
    let nearest = Infinity;
    for (const candidate of this.stars) {
      const distance = Phaser.Math.Distance.Between(point.x, point.y, candidate.image.x, candidate.image.y) * camera.zoom;
      if (distance <= candidate.reach && distance < nearest) {
        nearest = distance;
        star = candidate;
      }
    }
    if (star) return { kind: "star", id: star.spec.id };
    for (const name of this.names) {
      if ((name.spec.at || name.spec.column !== undefined) && name.text.visible && name.text.getBounds().contains(point.x, point.y)) return { kind: "place", id: name.spec.id };
    }
    const { sheet, tiny } = this.view;
    const over = sheet.at(point.x / CELL, point.y / CELL);
    if (over && sheet.shapes.get(over)!.cells < tiny) return { kind: "place", id: over };
    let small: string | null = null;
    let reach = NEAR / camera.zoom;
    for (const shape of sheet.shapes.values()) {
      if (shape.cells >= tiny) continue;
      const distance = Phaser.Math.Distance.Between(point.x, point.y, (shape.box.x + shape.box.w / 2) * CELL, (shape.box.y + shape.box.h / 2) * CELL);
      if (distance < reach) {
        reach = distance;
        small = shape.id;
      }
    }
    const id = small ?? over;
    return id ? { kind: "place", id } : null;
  }

  private hover(hit: Hit | null, pointer?: Phaser.Input.Pointer) {
    const zoom = this.cameras.main.zoom;
    if (hit && pointer) {
      const point = this.cameras.main.getWorldPoint(pointer.x, pointer.y);
      this.caption.setPosition(point.x, point.y - 16 / zoom).setScale(1 / zoom);
    }
    if (hit?.kind === this.hovered?.kind && hit?.id === this.hovered?.id) return;
    this.hovered = hit;
    this.input.setDefaultCursor(hit ? "pointer" : "default");
    this.glow.clear();
    for (const star of this.stars) star.image.setScale((hit?.kind === "star" && hit.id === star.spec.id ? 1.35 : 1) / zoom);
    const label = hit && this.view ? this.view.caption(hit) : "";
    this.caption.setText(label).setVisible(Boolean(label));
    const shape = hit?.kind === "place" ? this.view?.sheet.shapes.get(hit.id) : undefined;
    if (!shape) return;
    this.glow.fillStyle(0xffffff, 0.3);
    for (const run of shape.runs) this.glow.fillRect(run.x1 * CELL, run.y * CELL, (run.x2 - run.x1 + 1) * CELL, CELL);
  }

  /** A line round the shape that is picked and a ring round the star that is, the same thickness on screen at any zoom. */
  private drawOutline() {
    this.outline.clear();
    if (!this.view) return;
    const { sheet } = this.view;
    const zoom = this.cameras.main.zoom;
    const shape = this.selected ? sheet.shapes.get(this.selected) : undefined;
    if (shape) {
      const other = (x: number, y: number) => x < 0 || y < 0 || x >= sheet.w || y >= sheet.h || sheet.grid[y * sheet.w + x] !== shape.index;
      for (const [color, thickness] of [[INK, 6 / zoom], [YELLOW, 3 / zoom]] as const) {
        this.outline.fillStyle(color, 1);
        const half = thickness / 2;
        for (const run of shape.runs) {
          for (let x = run.x1; x <= run.x2; x++) {
            const px = x * CELL;
            const py = run.y * CELL;
            if (other(x, run.y - 1)) this.outline.fillRect(px - half, py - half, CELL + thickness, thickness);
            if (other(x, run.y + 1)) this.outline.fillRect(px - half, py + CELL - half, CELL + thickness, thickness);
            if (other(x - 1, run.y)) this.outline.fillRect(px - half, py - half, thickness, CELL + thickness);
            if (other(x + 1, run.y)) this.outline.fillRect(px + CELL - half, py - half, thickness, CELL + thickness);
          }
        }
      }
    }
    const star = this.stars.find((candidate) => candidate.spec.id === this.marked);
    if (star) {
      for (const [color, thickness] of [[INK, 6 / zoom], [YELLOW, 3 / zoom]] as const) {
        this.outline.lineStyle(thickness, color, 1);
        this.outline.strokeCircle(star.image.x, star.image.y, (star.spec.big ? 19 : 12) / zoom);
      }
    }
  }

  /**
   * Names and stars stay the same size on screen. A name on its shape is spelled out when there is room,
   * shortened when there is less, and left off when there is none; it steps aside for a star. The names
   * out at sea stand in a column that spreads as the view draws back, so that they never run together.
   */
  private relabel() {
    if (!this.view) return;
    const zoom = this.cameras.main.zoom;
    this.caption.setScale(1 / zoom);
    this.heading?.setScale(1 / zoom);
    for (const star of this.stars) star.image.setScale(1 / zoom);
    this.lines.clear();
    const inColumn = this.names.filter((name) => name.spec.column !== undefined).sort((a, b) => a.spec.column! - b.spec.column!);
    const placed: { name: Name; x: number; y: number; w: number; h: number }[] = [];
    for (const name of this.names) {
      const { spec, text, shape } = name;
      text.setScale(1 / zoom);
      if (spec.column !== undefined && this.view.column) {
        const step = Math.max(8 * CELL, (name.short.h + 1) / zoom);
        const x = this.view.column.x * CELL;
        const y = this.view.column.y * CELL + (inColumn.indexOf(name) - (inColumn.length - 1) / 2) * step;
        text.setPosition(x, y);
        const from = { x: (shape.heart.x + 0.5) * CELL, y: (shape.heart.y + 0.5) * CELL };
        this.lines.lineStyle(1.5 / zoom, INK, 0.85);
        this.lines.lineBetween(from.x, from.y, x - 5 / zoom, y);
        this.lines.fillStyle(INK, 1);
        this.lines.fillCircle(from.x, from.y, 2.5 / zoom);
        continue;
      }
      if (spec.at) {
        text.setVisible(zoom >= (spec.hideBelow ?? 0));
        continue;
      }
      const across = shape.halfWidth * 2 * CELL * zoom;
      const down = (shape.depth * 2 - 1) * CELL * zoom;
      const next = name.full.w && name.full.w + 8 <= across && name.full.h <= down ? "full" : name.short.w && name.short.w + 2 <= across && name.short.h * 0.7 <= down ? "short" : "none";
      if (next !== name.showing) {
        name.showing = next;
        if (next !== "none") text.setText(next === "full" ? spec.full : spec.short);
      }
      text.setVisible(next !== "none");
      if (next === "none") continue;
      // On its shape's heart, unless a star is there: then just clear of the star, on the heart's side of it.
      const size = next === "full" ? name.full : name.short;
      const x = (shape.heart.x + 0.5) * CELL;
      let y = (shape.heart.y + 0.5) * CELL;
      for (const star of this.stars) {
        const radius = star.spec.big ? 12 : 7;
        if (Math.abs(star.image.x - x) * zoom >= size.w / 2 + radius || Math.abs(star.image.y - y) * zoom >= size.h / 2 + radius - 3) continue;
        y = star.image.y + ((y <= star.image.y ? -1 : 1) * (size.h / 2 + radius - 2)) / zoom;
      }
      text.setPosition(x, y);
      placed.push({ name, x, y, w: size.w / zoom, h: (size.h * 0.7) / zoom });
    }
    // Where two names would still run together, the larger shape keeps its name.
    placed.sort((a, b) => b.name.shape.cells - a.name.shape.cells);
    const kept: typeof placed = [];
    for (const one of placed) {
      if (kept.some((other) => Math.abs(other.x - one.x) < (other.w + one.w) / 2 && Math.abs(other.y - one.y) < (other.h + one.h) / 2)) one.name.text.setVisible(false);
      else kept.push(one);
    }
  }

  update() {
    const zoom = this.cameras.main.zoom;
    if (zoom === this.lastZoom) return;
    this.lastZoom = zoom;
    this.relabel();
    this.drawOutline();
  }

  // ── What the page can ask for ──────────────────────────────────────────────

  /** Draw a line round a shape (null for none). `fly` brings it into view, for a pick made from the panel or the address. */
  select(id: string | null, fly = false) {
    const shape = id ? this.view?.sheet.shapes.get(id) : undefined;
    this.selected = shape ? id : null;
    this.drawOutline();
    if (!shape || !fly) return;
    const camera = this.cameras.main;
    const zoom = Phaser.Math.Clamp(Math.min((camera.width * 0.4) / (shape.box.w * CELL), (camera.height * 0.4) / (shape.box.h * CELL)), this.fitZoom(), 2.2);
    this.whole = false;
    this.pan.flyTo((shape.box.x + shape.box.w / 2) * CELL, (shape.box.y + shape.box.h / 2) * CELL, zoom);
  }

  /** Ring a capital's star (null for none). */
  markStar(id: string | null) {
    this.marked = id;
    this.drawOutline();
  }

  private covered(): number {
    // Never more than half the view, or there would be nowhere to put the map.
    return Math.min(this.hooks.covered?.() ?? 0, this.cameras.main.height / 2);
  }

  private fitZoom(): number {
    const camera = this.cameras.main;
    const sheet = this.view?.sheet;
    if (!sheet) return 1;
    return Phaser.Math.Clamp(Math.min(camera.width / ((sheet.w + 2) * CELL), (camera.height - this.covered()) / ((sheet.h + 2) * CELL)), MIN_ZOOM, MAX_ZOOM);
  }

  fitWorld(duration = 500) {
    const sheet = this.view?.sheet;
    if (!sheet) return;
    this.whole = true;
    const zoom = this.fitZoom();
    // Centred in what is left of the view under the title.
    this.pan.flyTo((sheet.w * CELL) / 2, (sheet.h * CELL) / 2 - this.covered() / 2 / zoom, zoom, duration);
  }

  zoomBy(factor: number) {
    this.whole = false;
    this.pan.zoomBy(factor);
  }
}

export function startAtlas(parent: HTMLElement, hooks: AtlasHooks): AtlasScene {
  const scene = new AtlasScene(hooks);
  const game = new Phaser.Game({
    type: Phaser.AUTO,
    parent,
    backgroundColor: SEA,
    pixelArt: true,
    // A hidden tab reports a zero-size parent, and WebGL cannot start at zero size.
    scale: { mode: Phaser.Scale.RESIZE, width: Math.max(parent.clientWidth, 320), height: Math.max(parent.clientHeight, 240) },
    scene: [scene],
    banner: false,
    disableContextMenu: true,
  });
  // The pane or an iframe can change size without a window resize event.
  const resized = new ResizeObserver(() => {
    const width = parent.clientWidth;
    const height = parent.clientHeight;
    if (width > 0 && height > 0 && (width !== game.scale.width || height !== game.scale.height)) game.scale.resize(width, height);
  });
  resized.observe(parent);
  game.events.once(Phaser.Core.Events.DESTROY, () => resized.disconnect());
  return scene;
}
