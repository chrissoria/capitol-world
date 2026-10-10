import Phaser from "phaser";
import { loadCommittees } from "../data/load";
import { liveMeeting, meetingTime } from "../data/meetings";
import type { Bill, Member, MoveEvent, World } from "../data/types";
import { locKey } from "../data/types";
import {
  PALETTE,
  SPRITE_H,
  drawBadges,
  drawBelt,
  drawCrate,
  drawForest,
  drawGround,
  drawMembers,
  drawPaper,
  drawRing,
  drawRobot,
} from "./art";
import type { Wing } from "./building";
import { InteriorScene } from "./interior";
import { MAP_H, MAP_W, TILE, anchorOf, buildLayout, route, siteKeyFor, type Layout, type Site } from "./layout";

export type Target =
  | { type: "bill"; id: string }
  | { type: "member"; id: string }
  | { type: "site"; id: string };

export interface SceneHooks {
  onSelect(target: Target | null): void;
  onClock(label: string | null, progress: number): void;
  /** The view moved inside a building, or back out to the map (null). */
  onPlace(inside: PlaceInfo | null): void;
  /** The wall calendar in a committee's room was clicked. */
  onCalendar(code: string): void;
  onReady(): void;
}

export interface PlaceInfo {
  /** "House", "Senate", or a committee code. */
  place: string;
  /** How to name it after "Inside". */
  label: string;
  note: string;
}

export interface Filter {
  party: string;
  policyArea: string;
  stage: string;
  /** Only bills that are dead (vetoed, voted down, or expired). */
  dead: boolean;
}

const FONT = '"Trebuchet MS", "Verdana", sans-serif';
const DEPTH = { ground: 0, belt: 1, zone: 2, dock: 5, member: 10, mover: 40, ring: 9, label: 50 };
const ROBOT_SPEED = 430; // pixels per second
const WALK_SPEED = 300;
const BELT_SPEED = 150;
const MIN_ZOOM = 0.2;
const MAX_ZOOM = 4;

interface DockView {
  papers: Phaser.GameObjects.Image[];
  crate?: Phaser.GameObjects.Image;
  more?: Phaser.GameObjects.Text;
}

type Point = { x: number; y: number };

interface Trip {
  actor: string | null;
  role: string;
  from: Site | null;
  to: Site;
  bills: string[];
}

interface Walker {
  tag: Phaser.GameObjects.Text;
  paper: Phaser.GameObjects.Image;
  count?: Phaser.GameObjects.Text;
}

interface SiteView {
  site: Site;
  label: Phaser.GameObjects.Text;
  count: Phaser.GameObjects.Text;
  major: boolean;
}

export class WorldScene extends Phaser.Scene {
  private layout!: Layout;
  private bills = new Map<string, Bill>();
  private members = new Map<string, Member>();
  private finalSite = new Map<string, string>();
  private currentSite = new Map<string, string | null>();
  private atSite = new Map<string, string[]>();
  private docks = new Map<string, DockView>();
  private siteViews = new Map<string, SiteView>();
  /** Legislators out on the map carrying a bill. Everyone else is inside their chamber. */
  private memberSprites = new Map<string, Phaser.GameObjects.Image>();
  private hints: Phaser.GameObjects.Text[] = [];
  private inside: string | null = null;
  /** The place plus the meeting being re-staged there, if any. */
  private view: string | null = null;
  private belts: { sprite: Phaser.GameObjects.TileSprite; direction: number }[] = [];
  private ring!: Phaser.GameObjects.Image;
  private outline!: Phaser.GameObjects.Graphics;
  private movers = new Set<Phaser.GameObjects.Container>();
  private walkers = new Map<string, Walker>();
  private timers: Phaser.Time.TimerEvent[] = [];
  private selected: Target | null = null;
  private filter: Filter = { party: "", policyArea: "", stage: "", dead: false };
  private lastZoom = -1;
  private pinch = 0;
  private replaying = false;

  constructor(
    private world: World,
    private hooks: SceneHooks,
  ) {
    super("world");
  }

  // ── Setup ──────────────────────────────────────────────────────────────────

  create() {
    this.layout = buildLayout(this.world.committees);
    for (const member of this.world.members) this.members.set(member.id, member);
    for (const bill of this.world.bills) {
      this.bills.set(bill.id, bill);
      // A bill stopped by an event (a veto, a lost vote) is laid at the memorial; the rest stay where they stood.
      const stopped = bill.fate === "v" || bill.fate === "f";
      const key = stopped ? "memorial" : siteKeyFor(locKey(bill.loc), this.layout.sites, bill.loc.chamber)!;
      this.finalSite.set(bill.id, key);
      this.currentSite.set(bill.id, key);
    }

    this.makeTextures();
    // Woods all round the map, far enough out to fill the widest screen.
    const woods = 4096;
    this.add
      .tileSprite(-woods, -woods, MAP_W * TILE + woods * 2, MAP_H * TILE + woods * 2, "forest")
      .setOrigin(0)
      .setDepth(DEPTH.ground - 1);
    this.add.image(0, 0, "ground").setOrigin(0).setDepth(DEPTH.ground);
    this.makeBelts();
    this.makeSites();
    this.outline = this.add.graphics().setDepth(DEPTH.ring);
    this.ring = this.add.image(0, 0, "ring").setDepth(DEPTH.ring).setVisible(false);
    this.tweens.add({ targets: this.ring, scale: 1.25, duration: 500, yoyo: true, repeat: -1 });
    this.rebuildOccupancy();
    this.makeCamera();
    this.hooks.onReady();
  }

  private makeTextures() {
    this.textures.addCanvas("ground", drawGround(this.layout));
    this.textures.addCanvas("forest", drawForest());
    const sheet = drawMembers(this.world.members);
    const texture = this.textures.addCanvas("members", sheet.canvas)!;
    for (const [id, frame] of sheet.frames) texture.add(id, 0, frame.x, frame.y, frame.w, frame.h);
    this.textures.addCanvas("paper-House", drawPaper(PALETTE.house));
    this.textures.addCanvas("paper-Senate", drawPaper(PALETTE.senate));
    this.textures.addCanvas("crate", drawCrate());
    this.textures.addCanvas("robot", drawRobot());
    this.textures.addCanvas("belt", drawBelt());
    this.textures.addCanvas("ring", drawRing());
    const badges = drawBadges();
    const badgeTexture = this.textures.addCanvas("badges", badges.canvas)!;
    for (let n = 1; n < 100; n++) {
      const frame = badges.frame(n);
      badgeTexture.add(String(n), 0, frame.x, frame.y, frame.w, frame.h);
    }
  }

  private makeBelts() {
    for (const belt of Object.values(this.layout.conveyors)) {
      const x1 = Math.min(belt.from.x, belt.to.x) * TILE;
      const width = Math.abs(belt.to.x - belt.from.x) * TILE;
      const sprite = this.add
        .tileSprite(x1, belt.from.y * TILE - 6, width, 12, "belt")
        .setOrigin(0)
        .setDepth(DEPTH.belt);
      const direction = belt.to.x > belt.from.x ? 1 : -1;
      sprite.setFlipX(direction < 0);
      this.belts.push({ sprite, direction });
    }
  }

  private text(x: number, y: number, value: string, size: number, color = "#ffffff") {
    return this.add
      .text(x, y, value, {
        fontFamily: FONT,
        fontSize: `${size}px`,
        fontStyle: "bold",
        color,
        stroke: PALETTE.ink,
        strokeThickness: 3,
        align: "center",
      })
      .setResolution(3)
      .setDepth(DEPTH.label);
  }

  private makeSites() {
    for (const site of this.layout.sites.values()) {
      const px = site.rect.x * TILE;
      const py = site.rect.y * TILE;
      const pw = site.rect.w * TILE;
      const major = site.style !== "committee";
      const label = this.text(px + pw / 2, py + (site.style === "chamber" ? 34 : 10), site.short, major ? 11 : 9)
        .setOrigin(0.5, 0)
        .setWordWrapWidth(pw + 20);
      const count = this.text(px + pw / 2, py + site.rect.h * TILE * 0.5, "", 13, PALETTE.yellow).setOrigin(0.5);
      this.siteViews.set(site.key, { site, label, count, major });

      // Clicking the building (or its dock) lists what is inside.
      const zone = this.add
        .zone(px, py, pw, (site.rect.h + 1) * TILE)
        .setOrigin(0)
        .setDepth(DEPTH.zone)
        .setInteractive({ cursor: "pointer" });
      zone.setData("target", { type: "site", id: site.key } satisfies Target);
    }
    for (const chamber of ["House", "Senate"] as const) {
      const rect = this.layout.chambers[chamber];
      const total = this.world.members.filter((m) => m.chamber === chamber).length;
      this.hints.push(
        this.text((rect.x + rect.w / 2) * TILE, (rect.y - 0.6) * TILE, `${chamber.toUpperCase()} · ${total} members`, 12).setOrigin(0.5, 1),
      );
    }
  }

  private makeCamera() {
    const camera = this.cameras.main;
    const pad = 900; // room to centre the map in a tall or wide window
    camera.setBounds(-pad, -pad, MAP_W * TILE + pad * 2, MAP_H * TILE + pad * 2);
    camera.setRoundPixels(true);
    this.fitWorld(0);
    this.scale.on("resize", (size: Phaser.Structs.Size, _base: unknown, _display: unknown, previousWidth: number, previousHeight: number) => {
      // Keep looking at the same spot when the window (or the panel) changes size.
      if (camera.panEffect.isRunning && this.selected) this.select(this.selected);
      else {
        camera.scrollX -= (size.width - previousWidth) / 2;
        camera.scrollY -= (size.height - previousHeight) / 2;
      }
      this.applyLod(true);
    });

    this.input.addPointer(1);
    this.input.on("pointermove", (pointer: Phaser.Input.Pointer) => {
      const a = this.input.pointer1;
      const b = this.input.pointer2;
      if (a.isDown && b.isDown) {
        const distance = Phaser.Math.Distance.Between(a.x, a.y, b.x, b.y);
        if (this.pinch > 0) this.zoomAt((a.x + b.x) / 2, (a.y + b.y) / 2, camera.zoom * (distance / this.pinch));
        this.pinch = distance;
        return;
      }
      this.pinch = 0;
      if (!pointer.isDown) return;
      camera.scrollX -= (pointer.x - pointer.prevPosition.x) / camera.zoom;
      camera.scrollY -= (pointer.y - pointer.prevPosition.y) / camera.zoom;
    });
    this.input.on("pointerup", () => (this.pinch = 0));
    this.input.on("wheel", (pointer: Phaser.Input.Pointer, _over: unknown, _dx: number, dy: number) => {
      this.zoomAt(pointer.x, pointer.y, camera.zoom * (dy > 0 ? 0.88 : 1.14));
    });
    this.input.on("gameobjectup", (pointer: Phaser.Input.Pointer, object: Phaser.GameObjects.GameObject) => {
      // Phaser hears mouse-up on the whole window, so ignore clicks that began on the panel or HUD.
      if (pointer.downElement !== this.game.canvas || pointer.upElement !== this.game.canvas) return;
      if (pointer.getDistance() > 8) return;
      const target = object.getData("target") as Target | undefined;
      if (target) this.select(target, false);
    });
  }

  // ── Camera ─────────────────────────────────────────────────────────────────

  private zoomAt(screenX: number, screenY: number, zoom: number) {
    const camera = this.cameras.main;
    const next = Phaser.Math.Clamp(zoom, MIN_ZOOM, MAX_ZOOM);
    const before = camera.getWorldPoint(screenX, screenY);
    camera.setZoom(next);
    camera.preRender();
    const after = camera.getWorldPoint(screenX, screenY);
    camera.scrollX += before.x - after.x;
    camera.scrollY += before.y - after.y;
  }

  zoomBy(factor: number) {
    if (this.inside) return this.interior.zoomBy(factor);
    const camera = this.cameras.main;
    this.zoomAt(camera.width / 2, camera.height / 2, camera.zoom * factor);
  }

  fitWorld(duration = 500) {
    if (this.inside) return this.interior.fit(duration);
    const camera = this.cameras.main;
    const zoom = Phaser.Math.Clamp(Math.min(camera.width / (MAP_W * TILE), camera.height / (MAP_H * TILE)), MIN_ZOOM, MAX_ZOOM);
    this.flyTo((MAP_W * TILE) / 2, (MAP_H * TILE) / 2, zoom, duration);
  }

  private flyTo(x: number, y: number, zoom: number, duration = 600) {
    const camera = this.cameras.main;
    if (duration <= 0) {
      camera.setZoom(zoom);
      camera.centerOn(x, y);
      return;
    }
    camera.pan(x, y, duration, "Sine.easeInOut", true);
    camera.zoomTo(zoom, duration, "Sine.easeInOut", true);
  }

  // ── Bills at their sites ───────────────────────────────────────────────────

  private matchesBill(bill: Bill): boolean {
    const f = this.filter;
    if (f.policyArea && bill.policy_area !== f.policyArea) return false;
    if (f.stage && bill.loc.kind !== f.stage) return false;
    if (f.dead && !bill.fate) return false;
    if (f.party && this.members.get(bill.sponsor)?.party !== f.party) return false;
    return true;
  }

  private matchesMember(member: Member): boolean {
    return !this.filter.party || member.party === this.filter.party;
  }

  private filtering(): boolean {
    return Boolean(this.filter.party || this.filter.policyArea || this.filter.stage || this.filter.dead);
  }

  private rebuildOccupancy() {
    this.atSite.clear();
    for (const [id, key] of this.currentSite) {
      if (!key) continue;
      if (!this.atSite.has(key)) this.atSite.set(key, []);
      this.atSite.get(key)!.push(id);
    }
    for (const key of this.layout.sites.keys()) this.placeDock(key);
  }

  billsAt(siteKey: string): Bill[] {
    const list = (this.atSite.get(siteKey) ?? []).map((id) => this.bills.get(id)!);
    return list.sort(
      (a, b) =>
        Number(this.matchesBill(b)) - Number(this.matchesBill(a)) || b.last_action.date.localeCompare(a.last_action.date) || a.id.localeCompare(b.id),
    );
  }

  private placeDock(siteKey: string) {
    const site = this.layout.sites.get(siteKey)!;
    const old = this.docks.get(siteKey);
    old?.papers.forEach((paper) => paper.destroy());
    old?.crate?.destroy();
    old?.more?.destroy();

    const list = this.billsAt(siteKey);
    const view: DockView = { papers: [] };
    const y = site.dock.y * TILE + 9;
    const shown = list.slice(0, site.capacity);
    const startX = site.dock.x * TILE + 8;
    shown.forEach((bill, index) => {
      const paper = this.add
        .image(startX + index * 12, y, `paper-${bill.type.startsWith("S") ? "Senate" : "House"}`)
        .setDepth(DEPTH.dock)
        .setInteractive(new Phaser.Geom.Rectangle(-2, -3, 13, 17), Phaser.Geom.Rectangle.Contains);
      paper.input!.cursor = "pointer";
      paper.setData("target", { type: "bill", id: bill.id } satisfies Target);
      paper.setData("bill", bill.id);
      if (this.filtering() && !this.matchesBill(bill)) paper.setAlpha(0.25);
      view.papers.push(paper);
    });
    if (list.length > shown.length) {
      const cx = site.dock.x * TILE + site.dock.w * TILE - 10;
      view.crate = this.add.image(cx, y, "crate").setDepth(DEPTH.dock);
      view.more = this.text(cx, y - 8, `+${list.length - shown.length}`, 7).setOrigin(0.5, 1);
    }
    this.docks.set(siteKey, view);

    const siteView = this.siteViews.get(siteKey)!;
    let matching = this.filtering() ? list.filter((bill) => this.matchesBill(bill)).length : list.length;
    // The memorial stands for every dead bill of the Congress, not only the ones laid at its door.
    if (site.style === "memorial" && !this.filtering()) matching = Object.values(this.world.counts.dead ?? {}).reduce((sum, n) => sum + n, 0) || matching;
    siteView.count.setText(matching > 0 ? matching.toLocaleString() : "");
    this.applyLod(true);
  }

  private moveBill(billId: string, to: string | null) {
    const from = this.currentSite.get(billId) ?? null;
    if (from) {
      const list = this.atSite.get(from);
      if (list) list.splice(list.indexOf(billId), 1);
      this.placeDock(from);
    }
    this.currentSite.set(billId, to);
    if (to) {
      if (!this.atSite.has(to)) this.atSite.set(to, []);
      this.atSite.get(to)!.push(billId);
      this.placeDock(to);
    }
    if (this.selected?.type === "bill" && this.selected.id === billId) this.drawSelection();
  }

  siteOf(billId: string): Site | undefined {
    const key = this.currentSite.get(billId) ?? this.finalSite.get(billId);
    return key ? this.layout.sites.get(key) : undefined;
  }

  siteByKey(key: string): Site | undefined {
    return this.layout.sites.get(key);
  }

  // ── Selection and filters ──────────────────────────────────────────────────

  select(target: Target | null, fly = true) {
    this.selected = target;
    // Go to wherever the thing is: legislators are inside their chamber unless they are out carrying a bill.
    if (target?.type === "member") {
      // A click on someone inside a building selects them where they are; anything else goes to their chamber.
      const chamber = this.members.get(target.id)?.chamber;
      if (this.memberSprites.has(target.id)) this.leave();
      else if (fly && (chamber === "House" || chamber === "Senate")) this.enter(chamber);
    } else if (target?.type === "site" && target.id.startsWith("floor:")) this.enter(target.id.endsWith("Senate") ? "Senate" : "House");
    else if (target?.type === "site" && target.id.startsWith("committee:")) this.enter(target.id.slice("committee:".length));
    else if (target) this.leave();
    this.drawSelection();
    this.interior.setSelected(target?.type === "member" ? target.id : null);
    this.hooks.onSelect(target);
    if (!target || !fly) return;
    if (this.inside) {
      if (target.type === "member") this.interior.focus(target.id);
      return;
    }
    const zoomIn = Math.max(this.cameras.main.zoom, 2);
    if (target.type === "member") {
      const sprite = this.memberSprites.get(target.id);
      if (sprite) this.flyTo(sprite.x, sprite.y - 12, Math.max(zoomIn, 2.6));
    } else if (target.type === "bill") {
      // Centre on the sheet itself when it is one of those laid out, otherwise on its building's dock.
      const site = this.siteOf(target.id);
      const paper = site ? this.docks.get(site.key)?.papers.find((sheet) => sheet.getData("bill") === target.id) : undefined;
      if (paper) this.flyTo(paper.x, paper.y - 24, zoomIn);
      else if (site) this.flyTo(anchorOf(site).x, anchorOf(site).y - 30, zoomIn);
    } else {
      const site = this.layout.sites.get(target.id);
      if (site) this.flyTo((site.rect.x + site.rect.w / 2) * TILE, (site.rect.y + site.rect.h / 2) * TILE, zoomIn);
    }
  }

  // ── Going inside the chambers ──────────────────────────────────────────────

  private get interior(): InteriorScene {
    return this.scene.get("interior") as InteriorScene;
  }

  get place(): string | null {
    return this.inside;
  }

  /** Go inside a chamber ("House", "Senate") or a committee's room (its code). */
  enter(place: string, meetingId?: string) {
    const view = meetingId ? `${place}@${meetingId}` : place;
    if (this.view === view) return;
    if (this.replaying) this.skipReplay();
    if (this.inside) this.scene.stop("interior");
    this.inside = place;
    this.view = view;
    // The scene changes over on the next frame; until then it must queue, not act on, what it is told.
    this.interior.ready = false;
    const chamber = place === "House" || place === "Senate";
    const site = this.layout.sites.get(chamber ? `floor:${place}` : `committee:${place}`);
    if (site) {
      // Leave the map looking at this building, so coming back out lands beside it.
      const x = (site.rect.x + site.rect.w / 2) * TILE;
      const y = (site.rect.y + site.rect.h / 2) * TILE;
      if (!this.cameras.main.worldView.contains(x, y)) this.flyTo(x, y, chamber ? 0.9 : 2, 0);
    }
    this.scene.sleep();
    if (chamber) {
      this.scene.launch("interior", { place });
      this.hooks.onPlace({ place, label: `the ${place}`, note: "the comings and goings are animation" });
      return;
    }
    const label = `the ${site?.label ?? "committee room"}`;
    this.hooks.onPlace({ place, label, note: "opening the room…" });
    void loadCommittees()
      .then((file) => file.committees[place], () => undefined)
      .then((info) => {
        if (this.view !== view) return; // the visitor has moved on
        const meeting = info && (meetingId ? info.meetings.find((entry) => entry.id === meetingId) : liveMeeting(info));
        this.scene.launch("interior", {
          place,
          committee: {
            code: place,
            name: site?.label ?? info?.name ?? place,
            chamber: info?.chamber ?? site?.wing ?? "House",
            seats: info?.members ?? [],
            session: meeting ? { id: meeting.id, witnesses: meeting.n_witnesses } : null,
          },
        });
        const note = !meeting
          ? this.world.final ? "this Congress has ended" : "not meeting right now"
          : meetingId
            ? `re-staging the ${meeting.type.toLowerCase()} of ${meetingTime(meeting).split(",").slice(0, 2).join(",")}`
            : "in session now";
        this.hooks.onPlace({ place, label, note });
      });
  }

  /** Where a member's figure is right now, in a few words. */
  whereIs(memberId: string): string {
    if (this.memberSprites.has(memberId)) return "Out on the map, carrying a bill";
    const chamber = this.members.get(memberId)?.chamber || "Capitol";
    const inside = this.inside ? this.interior.whereIs(memberId) : null;
    if (!inside) return `In the ${chamber}`;
    const building = this.inside === "House" || this.inside === "Senate" ? this.inside : (this.layout.sites.get(`committee:${this.inside}`)?.short ?? "Committee");
    return `${building} · ${inside}`;
  }

  /** Show a committee's room as it would have been for one of its meetings. */
  stage(code: string, meetingId: string) {
    this.enter(code, meetingId);
  }

  leave() {
    if (!this.inside) return;
    this.inside = null;
    this.view = null;
    this.interior.ready = false;
    this.scene.stop("interior");
    this.scene.wake();
    this.hooks.onPlace(null);
  }

  private drawSelection() {
    this.outline.clear();
    this.ring.setVisible(false);
    const target = this.selected;
    if (!target) return;
    const frame = (site: Site, width = 2) => {
      this.outline.lineStyle(width, 0xffd84a, 1);
      this.outline.strokeRect(site.rect.x * TILE - 4, site.rect.y * TILE - 4, site.rect.w * TILE + 8, (site.rect.h + 1) * TILE + 8);
    };
    if (target.type === "member") {
      const sprite = this.memberSprites.get(target.id);
      if (sprite) this.ring.setPosition(sprite.x, sprite.y - 2).setVisible(true);
      const keys = new Set<string>();
      for (const bill of this.bills.values()) {
        if (bill.sponsor !== target.id) continue;
        const key = this.currentSite.get(bill.id);
        if (key) keys.add(key);
      }
      for (const key of keys) frame(this.layout.sites.get(key)!, 1);
    } else if (target.type === "bill") {
      const key = this.currentSite.get(target.id);
      const paper = key ? this.docks.get(key)?.papers.find((p) => p.getData("bill") === target.id) : undefined;
      if (paper) this.ring.setPosition(paper.x, paper.y + 4).setVisible(true);
      else if (key) frame(this.layout.sites.get(key)!);
    } else {
      const site = this.layout.sites.get(target.id);
      if (site) frame(site);
    }
  }

  setFilter(filter: Filter) {
    this.filter = filter;
    for (const [id, sprite] of this.memberSprites) sprite.setAlpha(this.matchesMember(this.members.get(id)!) ? 1 : 0.25);
    this.interior.setFilter(filter.party);
    for (const key of this.layout.sites.keys()) this.placeDock(key);
    this.drawSelection();
  }

  // ── Level of detail ────────────────────────────────────────────────────────

  private applyLod(force = false) {
    const zoom = this.cameras.main.zoom;
    if (!force && Math.abs(zoom - this.lastZoom) < 0.001) return;
    this.lastZoom = zoom;
    const showPapers = zoom >= 0.7;
    const labelScale = Phaser.Math.Clamp(1 / zoom, 0.55, 2.6);

    for (const view of this.docks.values()) {
      view.papers.forEach((paper) => paper.setVisible(showPapers));
      view.crate?.setVisible(showPapers);
      view.more?.setVisible(zoom >= 1.1);
    }
    for (const hint of this.hints) hint.setScale(Phaser.Math.Clamp(1 / zoom, 0.7, 3));
    for (const view of this.siteViews.values()) {
      const isChamber = view.site.style === "chamber";
      if (view.major) view.label.setVisible(!isChamber).setScale(Math.min(labelScale, 2.4));
      else view.label.setVisible(zoom >= 0.85).setScale(Phaser.Math.Clamp(1 / zoom, 0.6, 1.1));
      view.count.setVisible(!showPapers && !isChamber).setScale(labelScale);
    }
  }

  update(_time: number, delta: number) {
    for (const belt of this.belts) belt.sprite.tilePositionX -= (delta / 1000) * 40;
    this.applyLod();
    this.followWalkers();
  }

  // ── Replaying the latest day ───────────────────────────────────────────────

  get hasEvents(): boolean {
    return this.lastDayEvents().length > 0;
  }

  get isReplaying(): boolean {
    return this.replaying;
  }

  private lastDayEvents(): MoveEvent[] {
    const events = this.world.events.filter((event) => this.bills.has(event.bill));
    if (!events.length) return [];
    const last = events.reduce((latest, event) => (event.date > latest ? event.date : latest), "");
    return events.filter((event) => event.date === last).sort((a, b) => a.seq - b.seq);
  }

  private stopReplay() {
    this.timers.forEach((timer) => timer.remove());
    this.timers = [];
    for (const mover of this.movers) {
      this.tweens.killTweensOf(mover);
      mover.destroy();
    }
    this.movers.clear();
    for (const id of [...this.walkers.keys()]) this.sendHome(id);
    this.replaying = false;
  }

  /** Jump to today's state. */
  skipReplay() {
    this.stopReplay();
    for (const [id, key] of this.finalSite) this.currentSite.set(id, key);
    this.rebuildOccupancy();
    this.drawSelection();
    this.hooks.onClock(null, 1);
  }

  private siteFor(loc: string | null, billId: string): Site | null {
    const key = siteKeyFor(loc, this.layout.sites, this.bills.get(billId)!.loc.chamber);
    return key ? this.layout.sites.get(key)! : null;
  }

  /** Events grouped into trips: a legislator carries all their bills between two places in one walk. */
  private planTrips(events: MoveEvent[]): Trip[] {
    const trips: Trip[] = [];
    const shared = new Map<string, Trip>();
    for (const event of events) {
      const from = this.siteFor(event.from, event.bill);
      const to = this.siteFor(event.to, event.bill)!;
      const actor = event.actor && this.homeChamber(event.actor) ? event.actor : null;
      if (actor) {
        const key = `${actor}|${from?.key ?? ""}|${to.key}`;
        const existing = shared.get(key);
        if (existing) {
          existing.bills.push(event.bill);
          continue;
        }
        const trip: Trip = { actor, role: event.actor_role ?? "", from, to, bills: [event.bill] };
        shared.set(key, trip);
        trips.push(trip);
      } else trips.push({ actor: null, role: "", from, to, bills: [event.bill] });
    }
    return trips;
  }

  replay() {
    this.leave();
    this.stopReplay();
    const events = this.lastDayEvents();
    if (!events.length) return;
    this.replaying = true;
    const day = formatDay(events[0].date);

    // Rewind the bills that moved that day to where they started it.
    for (const [id, key] of this.finalSite) this.currentSite.set(id, key);
    const seen = new Set<string>();
    for (const event of events) {
      if (seen.has(event.bill)) continue;
      seen.add(event.bill);
      this.currentSite.set(event.bill, this.siteFor(event.from, event.bill)?.key ?? null);
    }
    this.rebuildOccupancy();

    const trips = this.planTrips(events);
    const span = Phaser.Math.Clamp(trips.length * 1100, 6000, 40000);
    const billFree = new Map<string, number>();
    const actorFree = new Map<string, number>();
    let end = 0;
    trips.forEach((trip, index) => {
      const timing = this.tripTiming(trip);
      const start = Math.max(
        (index / trips.length) * span,
        ...trip.bills.map((bill) => billFree.get(bill) ?? 0),
        trip.actor ? (actorFree.get(trip.actor) ?? 0) : 0,
      );
      for (const bill of trip.bills) billFree.set(bill, start + timing.delivered + 200);
      if (trip.actor) actorFree.set(trip.actor, start + timing.total + 200);
      end = Math.max(end, start + timing.total);
      this.timers.push(this.time.delayedCall(start, () => this.runTrip(trip)));
    });
    const total = end + 700;
    for (let at = 0; at < total; at += 400) {
      this.timers.push(this.time.delayedCall(at, () => this.hooks.onClock(day, at / total)));
    }
    this.timers.push(this.time.delayedCall(total, () => this.skipReplay()));
  }

  private pathLength(points: Point[]): number {
    let length = 0;
    for (let i = 1; i < points.length; i++) length += Math.abs(points[i].x - points[i - 1].x) + Math.abs(points[i].y - points[i - 1].y);
    return length;
  }

  private homeChamber(memberId: string): Wing | null {
    const chamber = this.members.get(memberId)?.chamber;
    return chamber === "House" || chamber === "Senate" ? chamber : null;
  }

  /** Out of the legislator's chamber door and along the streets to a site. */
  private pathFromSeat(memberId: string, site: Site): Point[] {
    const chamber = this.homeChamber(memberId) ?? "House";
    const rect = this.layout.chambers[chamber];
    const door = { x: (rect.x + rect.w / 2) * TILE, y: (rect.y + rect.h) * TILE - 6 };
    const floor = this.layout.sites.get(`floor:${chamber}`)!;
    const points: Point[] = [door, ...(site.key === floor.key ? [anchorOf(floor)] : route(floor, site))];
    return points.filter((point, i) => i === 0 || point.x !== points[i - 1].x || point.y !== points[i - 1].y);
  }

  private robotLegs(trip: Trip): { points: Point[]; belt: boolean }[] {
    const bill = this.bills.get(trip.bills[0])!;
    const chamber = bill.type.startsWith("S") ? "Senate" : "House";
    const desk = this.layout.sites.get(`referral_desk:${chamber}`)!;
    if (!trip.from) return trip.to.style === "hopper" ? [] : [{ points: route(desk, trip.to), belt: false }];
    if (trip.from.style === "hopper") {
      const wing = trip.from.wing === "Senate" ? "Senate" : "House";
      const belt = this.layout.conveyors[wing];
      const ride = [
        { x: belt.from.x * TILE, y: belt.from.y * TILE },
        { x: belt.to.x * TILE, y: belt.to.y * TILE },
      ];
      const wingDesk = this.layout.sites.get(`referral_desk:${wing}`)!;
      const rest = trip.to.key === wingDesk.key ? [] : [{ points: route(wingDesk, trip.to), belt: false }];
      return [{ points: ride, belt: true }, ...rest];
    }
    return [{ points: route(trip.from, trip.to), belt: false }];
  }

  private tripTiming(trip: Trip): { delivered: number; total: number } {
    if (trip.actor) {
      const out = this.pathLength(this.pathFromSeat(trip.actor, trip.from ?? trip.to));
      const carry = trip.from ? this.pathLength(route(trip.from, trip.to)) : 0;
      const back = this.pathLength(this.pathFromSeat(trip.actor, trip.to));
      const ms = (length: number) => (length / WALK_SPEED) * 1000;
      return { delivered: ms(out + carry), total: ms(out + carry + back) };
    }
    const total = this.robotLegs(trip).reduce((sum, leg) => sum + (this.pathLength(leg.points) / (leg.belt ? BELT_SPEED : ROBOT_SPEED)) * 1000, 0);
    return { delivered: total, total };
  }

  private tweenAlong(
    target: Phaser.GameObjects.Components.Transform & Phaser.GameObjects.GameObject,
    points: Point[],
    speed: number,
    done: () => void,
    turn?: (dx: number, dy: number) => void,
  ) {
    const steps = points.slice(1).map((point, i) => ({
      x: point.x,
      y: point.y,
      duration: Math.max(1, (this.pathLength([points[i], point]) / speed) * 1000),
      onStart: () => turn?.(point.x - points[i].x, point.y - points[i].y),
    }));
    if (!steps.length) return done();
    this.tweens.chain({ targets: target, tweens: steps, onComplete: done });
  }

  private deliver(trip: Trip) {
    for (const bill of trip.bills) this.moveBill(bill, trip.to.key);
    this.pulse(trip.to.key);
  }

  private runTrip(trip: Trip) {
    if (trip.actor) return this.runWalk(trip);
    const legs = this.robotLegs(trip);
    const bill = this.bills.get(trip.bills[0])!;
    this.moveBill(bill.id, null);
    const paperKey = `paper-${bill.type.startsWith("S") ? "Senate" : "House"}`;
    const runLeg = (index: number) => {
      if (index >= legs.length) return this.deliver(trip);
      const leg = legs[index];
      const mover = this.add.container(leg.points[0].x, leg.points[0].y).setDepth(DEPTH.mover);
      if (leg.belt) mover.add(this.add.image(0, 0, paperKey));
      else mover.add([this.add.image(0, 0, "robot").setOrigin(0.5, 0.8), this.add.image(0, -17, paperKey)]);
      this.movers.add(mover);
      this.tweenAlong(mover, leg.points, leg.belt ? BELT_SPEED : ROBOT_SPEED, () => {
        this.movers.delete(mover);
        mover.destroy();
        runLeg(index + 1);
      });
    };
    runLeg(0);
  }

  /** A legislator comes out of their chamber, carries their bills to the next place, and walks back in. */
  private runWalk(trip: Trip) {
    const id = trip.actor!;
    this.sendHome(id); // in case an earlier walk of theirs is still finishing
    const member = this.members.get(id)!;
    const first = this.bills.get(trip.bills[0])!;
    const start = this.pathFromSeat(id, trip.from ?? trip.to)[0];
    const sprite = this.add
      .image(start.x, start.y, "members", id)
      .setOrigin(0.5, 1)
      .setDepth(DEPTH.mover)
      .setAlpha(this.matchesMember(member) ? 1 : 0.25)
      .setInteractive({ cursor: "pointer" });
    sprite.setData("target", { type: "member", id } satisfies Target);
    this.memberSprites.set(id, sprite);
    const walker: Walker = {
      tag: this.text(sprite.x, sprite.y, `${member.name.split(" ").slice(-1)[0]}${trip.role && trip.role !== "sponsor" ? `\n${trip.role}` : ""}`, 7).setOrigin(0.5, 0),
      paper: this.add.image(sprite.x, sprite.y, `paper-${first.type.startsWith("S") ? "Senate" : "House"}`).setDepth(DEPTH.mover + 1).setVisible(false),
      count: trip.bills.length > 1 ? this.text(sprite.x, sprite.y, `×${trip.bills.length}`, 7, PALETTE.yellow).setOrigin(0, 0.5).setVisible(false) : undefined,
    };
    this.walkers.set(id, walker);
    const carrying = (on: boolean) => {
      walker.paper.setVisible(on);
      walker.count?.setVisible(on);
    };
    // Show the figure's back when it walks away from us.
    const turn = (dx: number, dy: number) => {
      const away = Math.abs(dy) > Math.abs(dx) && dy < 0;
      sprite.setFrame(away ? `${id}:b` : id).setFlipX(!away && dx < 0);
    };

    const goHome = () => {
      carrying(false);
      this.tweenAlong(sprite, this.pathFromSeat(id, trip.to).reverse(), WALK_SPEED, () => this.sendHome(id), turn);
    };
    if (!trip.from) {
      // Introducing: carry the bill out and drop it.
      carrying(true);
      this.tweenAlong(sprite, this.pathFromSeat(id, trip.to), WALK_SPEED, () => {
        this.deliver(trip);
        goHome();
      }, turn);
      return;
    }
    const from = trip.from;
    this.tweenAlong(sprite, this.pathFromSeat(id, from), WALK_SPEED, () => {
      for (const bill of trip.bills) this.moveBill(bill, null);
      carrying(true);
      this.tweenAlong(sprite, route(from, trip.to), WALK_SPEED, () => {
        this.deliver(trip);
        goHome();
      }, turn);
    }, turn);
  }

  /** Back inside: the figure leaves the map. */
  private sendHome(id: string) {
    const walker = this.walkers.get(id);
    const sprite = this.memberSprites.get(id);
    if (!walker || !sprite) return;
    this.tweens.killTweensOf(sprite);
    sprite.destroy();
    this.memberSprites.delete(id);
    walker.tag.destroy();
    walker.paper.destroy();
    walker.count?.destroy();
    this.walkers.delete(id);
    if (this.selected?.type === "member" && this.selected.id === id) this.ring.setVisible(false);
  }

  private followWalkers() {
    for (const [id, walker] of this.walkers) {
      const sprite = this.memberSprites.get(id)!;
      walker.tag.setPosition(sprite.x, sprite.y + 1);
      walker.paper.setPosition(sprite.x, sprite.y - SPRITE_H - 5);
      walker.count?.setPosition(sprite.x + 6, sprite.y - SPRITE_H - 5);
    }
    if (this.selected?.type === "member" && this.walkers.has(this.selected.id)) {
      const sprite = this.memberSprites.get(this.selected.id)!;
      this.ring.setPosition(sprite.x, sprite.y - 2);
    }
  }

  private pulse(siteKey: string) {
    const site = this.layout.sites.get(siteKey);
    if (!site) return;
    const anchor = anchorOf(site);
    const flash = this.add.circle(anchor.x, anchor.y, 6, 0xffd84a, 0.8).setDepth(DEPTH.mover);
    this.tweens.add({ targets: flash, scale: 3, alpha: 0, duration: 450, onComplete: () => flash.destroy() });
  }
}

function formatDay(day: string): string {
  const date = new Date(`${day}T12:00:00`);
  return date.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
}

const siteKeyOfPlace = (place: string) => (place === "House" || place === "Senate" ? `floor:${place}` : `committee:${place}`);

export function startGame(parent: HTMLElement, world: World, hooks: SceneHooks): WorldScene {
  const scene = new WorldScene(world, hooks);
  const interior = new InteriorScene(world, {
    pick: (id) => scene.select({ type: "member", id }, false),
    pile: (place) => scene.select({ type: "site", id: siteKeyOfPlace(place) }, false),
    calendar: (place) => hooks.onCalendar(place),
    pileInfo: (place) => ({
      count: scene.billsAt(siteKeyOfPlace(place)).length,
      label: place === "House" || place === "Senate" ? "on the floor" : "with the committee",
    }),
  });
  const game = new Phaser.Game({
    type: Phaser.AUTO,
    parent,
    backgroundColor: PALETTE.grass,
    pixelArt: true,
    // A hidden tab reports a zero-size parent, and WebGL cannot start at zero size.
    scale: { mode: Phaser.Scale.RESIZE, width: Math.max(parent.clientWidth, 320), height: Math.max(parent.clientHeight, 240) },
    scene: [scene, interior],
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
