// Inside the House or Senate building. The members are real; what they are seen
// doing here (eating, reading, chatting) is ambient animation, not a record.

import Phaser from "phaser";
import type { Member, World } from "../data/types";
import { PALETTE, SPRITE_H, box, canvas, drawFigures, framed, type Look } from "./art";
import { T, buildBuilding, buildCommitteeRoom, findPath, spotXY, type Building, type CommitteeRoomSpec, type Spot, type SpotKind, type Wing } from "./building";
import { panZoom, type PanZoom } from "./camera";

export interface InteriorHooks {
  /** A legislator was clicked. */
  pick(memberId: string): void;
  /** The pile of bills on the clerk's desk was clicked. */
  pile(place: string): void;
  /** How many bills are in that pile, and what to call it. */
  pileInfo(place: string): { count: number; label: string };
  /** The wall calendar in a committee room was clicked. */
  calendar(place: string): void;
}

/** What to show inside: a chamber by name, or a committee's hearing room. */
export interface InteriorPlace {
  place: string; // "House", "Senate", or a committee code
  committee?: CommitteeRoomSpec;
}

const FONT = '"Trebuchet MS", "Verdana", sans-serif';
const DEPTH = { ground: 0, sorted: 10, ring: 44, emote: 46, label: 50 };
const WALK_SPEED = 70; // pixels per second, a little over four tiles
const PAGE_SPEED = 92;
const MIN_ZOOM = 0.25;
const MAX_ZOOM = 4;

/** What a member might get up to do, how likely, and for how many seconds. */
const OUTINGS: { kind: SpotKind; weight: number; stay: [number, number] }[] = [
  { kind: "eat", weight: 22, stay: [20, 40] },
  { kind: "desk", weight: 18, stay: [20, 50] },
  { kind: "sofa", weight: 18, stay: [18, 40] },
  { kind: "chat", weight: 14, stay: [10, 22] },
  { kind: "hearing", weight: 9, stay: [25, 50] },
  { kind: "read", weight: 8, stay: [16, 34] },
  { kind: "gym", weight: 4, stay: [14, 28] },
  { kind: "speak", weight: 4, stay: [10, 20] },
  { kind: "press", weight: 3, stay: [10, 20] },
  { kind: "preside", weight: 3, stay: [30, 60] },
];
const TOTAL_WEIGHT = OUTINGS.reduce((sum, outing) => sum + outing.weight, 0);
const EMOTES: Partial<Record<SpotKind, string>> = {
  sofa: "talk",
  chat: "talk",
  press: "talk",
  speak: "talk",
  desk: "note",
  read: "book",
};

const STAFF: { key: string; look: Look }[] = [
  ...[0, 1, 2].map((i) => ({ key: `clerk-${i}`, look: { seed: `clerk-${i}`, party: null } })),
  ...[0, 1].map((i) => ({ key: `server-${i}`, look: { seed: `server-${i}`, party: null, coat: "#f2f2f2", cap: "#ffffff" } })),
  ...[0, 1, 2, 3, 4, 5].map((i) => ({ key: `reporter-${i}`, look: { seed: `reporter-${i}`, party: null } })),
  { key: "guard-0", look: { seed: "guard-0", party: null, coat: "#2c3a5a", cap: "#1f2a44" } },
  { key: "librarian-0", look: { seed: "librarian-0", party: null, coat: "#7a4f6a" } },
  ...[0, 1, 2, 3, 4, 5, 6, 7].map((i) => ({ key: `guest-${i}`, look: { seed: `guest-${i}`, party: null } })),
  ...[0, 1, 2, 3, 4].map((i) => ({ key: `page-${i}`, look: { seed: `page-${i}`, party: null, coat: "#2f4a7a" } })),
];

interface Agent {
  id: string;
  member: Member | null;
  frame: string;
  sprite: Phaser.GameObjects.Image;
  home: Spot;
  at: Spot;
  path: { x: number; y: number }[];
  moving: boolean;
  until: number;
  stay: number;
  steps: { spot: Spot; stay: number }[];
  emote: Phaser.GameObjects.Image | null;
  prop: Phaser.GameObjects.Image | null;
  badge: Phaser.GameObjects.Image | null;
  speed: number;
  phase: number;
  bob: boolean;
}

const seconds = (min: number, max: number) => (min + Math.random() * (max - min)) * 1000;

function drawEmote(kind: "talk" | "note" | "book"): HTMLCanvasElement {
  const [element, ctx] = canvas(13, 12);
  box(ctx, 1, 0, 11, 9, PALETTE.ink);
  box(ctx, 0, 1, 13, 7, PALETTE.ink);
  box(ctx, 1, 1, 11, 7, PALETTE.white);
  box(ctx, 3, 9, 3, 1, PALETTE.ink);
  box(ctx, 3, 10, 2, 1, PALETTE.ink);
  box(ctx, 4, 8, 1, 1, PALETTE.white);
  if (kind === "talk") for (const x of [3, 6, 9]) box(ctx, x, 4, 1, 2, PALETTE.ink);
  if (kind === "note") {
    box(ctx, 3, 3, 7, 1, PALETTE.steelDark);
    box(ctx, 3, 5, 5, 1, PALETTE.steelDark);
    box(ctx, 9, 5, 1, 1, PALETTE.orange);
  }
  if (kind === "book") {
    box(ctx, 3, 3, 3, 4, PALETTE.partyD);
    box(ctx, 7, 3, 3, 4, PALETTE.partyD);
    box(ctx, 6, 3, 1, 4, PALETTE.ink);
  }
  return element;
}

function drawTray(): HTMLCanvasElement {
  const [element, ctx] = canvas(10, 6);
  framed(ctx, 0, 0, 10, 6, "#c8ced6");
  box(ctx, 2, 2, 3, 2, PALETTE.orange);
  box(ctx, 6, 2, 2, 2, PALETTE.grass);
  return element;
}

export class InteriorScene extends Phaser.Scene {
  ready = false;
  wing: Wing = "House";
  private place = "House";
  private committee: CommitteeRoomSpec | undefined;
  private speaker: Agent | null = null;
  private nextSpeakerAt = 0;
  private plans = new Map<Wing, Building>();
  private b!: Building;
  private agents = new Map<string, Agent>();
  private byKind = new Map<SpotKind, Spot[]>();
  private majority = "R";
  private clock = 0;
  private pz!: PanZoom;
  private ring!: Phaser.GameObjects.Image;
  private roomLabels: Phaser.GameObjects.Text[] = [];
  private nameLabels: Phaser.GameObjects.Text[] = [];
  private lastZoom = -1;
  private lastLabelPass = 0;
  private selectedId: string | null = null;
  private hoverId: string | null = null;
  private pendingFocus: string | null = null;
  private party = "";
  private onResize?: (size: Phaser.Structs.Size, base: unknown, display: unknown, previousWidth: number, previousHeight: number) => void;

  constructor(
    private world: World,
    private hooks: InteriorHooks,
  ) {
    super({ key: "interior", active: false });
  }

  init(data: Partial<InteriorPlace>) {
    this.place = data.place ?? "House";
    this.committee = data.committee;
    this.wing = this.committee ? (this.committee.chamber === "Senate" ? "Senate" : "House") : this.place === "Senate" ? "Senate" : "House";
  }

  // ── Setup ──────────────────────────────────────────────────────────────────

  create() {
    const wing = this.wing;
    let members: Member[];
    let plan: Building | undefined;
    if (this.committee) {
      // A committee room is drawn afresh each visit: it differs with the meeting being shown.
      const known = new Map(this.world.members.map((member) => [member.id, member]));
      const spec = { ...this.committee, seats: this.committee.seats.filter((seat) => known.has(seat.id)) };
      plan = buildCommitteeRoom(spec);
      members = spec.session ? spec.seats.map((seat) => known.get(seat.id)!) : [];
    } else {
      members = this.world.members.filter((member) => member.chamber === wing);
      plan = this.plans.get(wing);
      if (!plan) {
        const leaders: Record<string, string> = this.world.roles?.leaders ?? {};
        plan = buildBuilding(wing, members, { speaker: leaders.speaker, majority: leaders[wing] });
        this.plans.set(wing, plan);
      }
    }
    const b = (this.b = plan);
    this.speaker = null;
    this.nextSpeakerAt = 0;
    this.clock = 0;
    this.hoverId = null;
    this.agents.clear();
    this.byKind.clear();
    for (const spot of b.spots) {
      spot.taken = null;
      if (!this.byKind.has(spot.kind)) this.byKind.set(spot.kind, []);
      this.byKind.get(spot.kind)!.push(spot);
    }
    const republicans = members.filter((member) => member.party === "R").length;
    this.majority = republicans * 2 >= members.length ? "R" : "D";

    this.makeTextures();
    this.add.image(0, 0, `inside-${b.key}`).setOrigin(0).setDepth(DEPTH.ground);
    for (let row = 0; row < b.h; row++) {
      this.add
        .image(0, row * T, `furniture-${b.key}`, row)
        .setOrigin(0)
        .setDepth(DEPTH.sorted + ((row + 1) * T) / 10000);
    }
    this.roomLabels = b.rooms.map((room) =>
      this.text((room.x + room.w / 2) * T, room.y * T + 9, room.label, room.key === "chamber" ? 12 : 10).setOrigin(0.5),
    );
    this.nameLabels = [];
    for (let i = 0; i < 70; i++) this.nameLabels.push(this.text(0, 0, "", 7).setOrigin(0.5, 0).setVisible(false));

    for (const person of b.staff) {
      const at = spotXY(person);
      this.add
        .image(at.x, at.y, "staff", person.face === "up" ? `${person.frame}:b` : person.frame)
        .setOrigin(0.5, 1)
        .setDepth(DEPTH.sorted + at.y / 10000);
    }
    this.makeFloorPile();
    if (b.calendar) {
      const { x, y } = b.calendar;
      this.text(x, y - 18, "Calendar", 7, PALETTE.yellow).setOrigin(0.5, 1).setDepth(DEPTH.emote);
      const board = this.add.zone(x - 26, y - 18, 52, 34).setOrigin(0).setDepth(DEPTH.label).setInteractive({ cursor: "pointer" });
      board.setData("calendar", true);
    }
    this.makeMembers(members);
    this.makePages();

    this.ring = this.add.image(0, 0, "ring").setDepth(DEPTH.ring).setVisible(false);
    this.tweens.add({ targets: this.ring, scale: 1.25, duration: 500, yoyo: true, repeat: -1 });
    this.makeCamera();
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.ready = false;
      if (this.onResize) this.scale.off("resize", this.onResize);
      if (this.committee) {
        // Committee rooms are one-offs; do not keep their artwork in memory.
        this.textures.remove(`inside-${b.key}`);
        this.textures.remove(`furniture-${b.key}`);
      }
    });

    this.ready = true;
    this.lastZoom = -1;
    this.setFilter(this.party);
    this.setSelected(this.selectedId);
    if (this.pendingFocus) this.focus(this.pendingFocus, 0);
    this.pendingFocus = null;
  }

  private makeTextures() {
    const b = this.b;
    if (!this.textures.exists(`inside-${b.key}`)) {
      this.textures.addCanvas(`inside-${b.key}`, b.ground);
      const furniture = this.textures.addCanvas(`furniture-${b.key}`, b.over)!;
      for (let row = 0; row < b.h; row++) furniture.add(row, 0, 0, row * T, b.w * T, T);
    }
    if (this.textures.exists("staff")) return;
    const sheet = drawFigures(STAFF);
    const staff = this.textures.addCanvas("staff", sheet.canvas)!;
    for (const [key, frame] of sheet.frames) staff.add(key, 0, frame.x, frame.y, frame.w, frame.h);
    for (const kind of ["talk", "note", "book"] as const) this.textures.addCanvas(`emote-${kind}`, drawEmote(kind));
    this.textures.addCanvas("tray", drawTray());
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

  /** The bills on this chamber's floor, piled on the clerks' desk. */
  private makeFloorPile() {
    const { count, label: caption } = this.hooks.pileInfo(this.place);
    const { x, y } = this.b.clerk;
    const depth = DEPTH.sorted + (y + 24) / 10000;
    for (let i = 0; i < Math.min(count, 7); i++) {
      this.add.image(x - 30 + i * 10, y - (i % 2) * 2, `paper-${this.wing}`).setDepth(depth);
    }
    const label = this.text(x, y - 9, count ? `${count} ${caption}` : "", 7, PALETTE.yellow).setOrigin(0.5, 1);
    label.setDepth(DEPTH.emote);
    const zone = this.add
      .zone(x - 40, y - 12, 80, 22)
      .setOrigin(0)
      .setDepth(DEPTH.label)
      .setInteractive({ cursor: "pointer" });
    zone.setData("floor", true);
  }

  private makeAgent(id: string, member: Member | null, texture: string, home: Spot, speed: number): Agent {
    const at = spotXY(home);
    const frame = home.face === "up" ? `${id}:b` : id;
    const sprite = this.add
      .image(at.x, at.y, texture, frame)
      .setOrigin(0.5, 1)
      .setDepth(DEPTH.sorted + at.y / 10000);
    const agent: Agent = {
      id,
      member,
      frame,
      sprite,
      home,
      at: home,
      path: [],
      moving: false,
      until: 0,
      stay: 0,
      steps: [],
      emote: null,
      prop: null,
      badge: null,
      speed,
      phase: Math.random() * 5000,
      bob: false,
    };
    this.agents.set(id, agent);
    return agent;
  }

  private makeMembers(members: Member[]) {
    for (const member of members) {
      const home = this.b.seats.get(member.id);
      if (!home) continue;
      const agent = this.makeAgent(member.id, member, "members", home, WALK_SPEED * (0.9 + Math.random() * 0.25));
      agent.sprite.setInteractive({ cursor: "pointer" });
      agent.sprite.setData("member", member.id);
      agent.sprite.on("pointerover", () => (this.hoverId = member.id));
      agent.sprite.on("pointerout", () => {
        if (this.hoverId === member.id) this.hoverId = null;
      });
      if (member.n_world > 0) {
        agent.badge = this.add
          .image(agent.sprite.x, agent.sprite.y - SPRITE_H - 1, "badges", String(Math.min(member.n_world, 99)))
          .setOrigin(0.5, 1)
          .setDepth(DEPTH.emote - 1);
      }
      if (this.committee) {
        agent.until = Number.POSITIVE_INFINITY; // in a meeting, members stay at the dais
        continue;
      }
      // Start with the building already busy rather than everyone in their seat.
      if (Math.random() < 0.45 && this.planOuting(agent)) {
        const last = agent.steps.pop()!;
        for (const step of agent.steps) step.spot.taken = null;
        agent.steps = [];
        agent.at = last.spot;
        agent.stay = last.stay * (0.3 + 0.7 * Math.random());
        this.arrive(agent);
      } else agent.until = seconds(2, 90);
    }
  }

  /** Pages carry papers between the offices and the rostrum. */
  private makePages() {
    const errands = this.byKind.get("errand") ?? [];
    for (let i = 0; i < Math.min(this.b.pages, errands.length); i++) {
      const home = errands[Math.floor((i * errands.length) / this.b.pages)];
      home.taken = `page-${i}`;
      const agent = this.makeAgent(`page-${i}`, null, "staff", home, PAGE_SPEED);
      agent.prop = this.add.image(agent.sprite.x, agent.sprite.y - SPRITE_H - 4, `paper-${this.wing}`).setDepth(DEPTH.emote - 1);
      agent.until = seconds(1, 8);
    }
  }

  private makeCamera() {
    const camera = this.cameras.main;
    const pad = 700;
    camera.setBackgroundColor(PALETTE.ink);
    camera.setBounds(-pad, -pad, this.b.w * T + pad * 2, this.b.h * T + pad * 2);
    camera.setRoundPixels(true);
    this.pz = panZoom(this, MIN_ZOOM, MAX_ZOOM);
    this.fit(0);
    this.onResize = (size, _base, _display, previousWidth, previousHeight) => {
      camera.scrollX -= (size.width - previousWidth) / 2;
      camera.scrollY -= (size.height - previousHeight) / 2;
      this.lastZoom = -1;
    };
    this.scale.on("resize", this.onResize);
    this.input.on("gameobjectup", (pointer: Phaser.Input.Pointer, object: Phaser.GameObjects.GameObject) => {
      if (pointer.downElement !== this.game.canvas || pointer.upElement !== this.game.canvas) return;
      if (pointer.getDistance() > 8) return;
      const member = object.getData("member") as string | undefined;
      if (member) this.hooks.pick(member);
      else if (object.getData("floor")) this.hooks.pile(this.place);
      else if (object.getData("calendar")) this.hooks.calendar(this.place);
    });
  }

  // ── Called from the map scene ──────────────────────────────────────────────

  /** The room a member's figure is in, or null when they are not in this building. */
  whereIs(id: string): string | null {
    if (!this.ready) return null;
    const agent = this.agents.get(id);
    if (!agent?.member) return null;
    if (this.committee) return "At the dais";
    const room = agent.at.room === "corridor" ? "Corridor" : (this.b.rooms.find((entry) => entry.key === agent.at.room)?.label ?? "");
    if (agent.moving) return agent.at === agent.home ? "Walking back to their seat" : `Walking to the ${room}`;
    return agent.at === agent.home ? "At their seat" : room;
  }

  setSelected(id: string | null) {
    this.selectedId = id;
    if (this.ready) this.ring.setVisible(Boolean(id && this.agents.has(id)));
  }

  focus(id: string, duration = 600) {
    if (!this.ready) {
      this.pendingFocus = id;
      return;
    }
    const agent = this.agents.get(id);
    if (agent) this.pz.flyTo(agent.sprite.x, agent.sprite.y - 12, Math.max(this.cameras.main.zoom, 2.6), duration);
  }

  setFilter(party: string) {
    this.party = party;
    if (!this.ready) return;
    for (const agent of this.agents.values()) {
      const dim = Boolean(party && agent.member && agent.member.party !== party);
      agent.sprite.setAlpha(dim ? 0.25 : 1);
      agent.badge?.setAlpha(dim ? 0.25 : 1);
    }
  }

  zoomBy(factor: number) {
    if (this.ready) this.pz.zoomBy(factor);
  }

  fit(duration = 500) {
    const camera = this.cameras.main;
    const width = this.b.w * T;
    const height = this.b.h * T;
    // Leave room at the top for the title and buttons that sit over the view.
    const header = Math.min(96, camera.height * 0.22);
    const zoom = Math.min(camera.width / (width + 48), (camera.height - header) / (height + 32));
    this.pz.flyTo(width / 2, height / 2 - header / 2 / zoom, zoom, duration);
  }

  // ── The daily bustle ───────────────────────────────────────────────────────

  private free(kind: SpotKind, agent: Agent): Spot | null {
    const party = agent.member?.party === "R" ? "R" : "D";
    let own: Spot | null = null;
    const open: Spot[] = [];
    for (const spot of this.byKind.get(kind) ?? []) {
      if (spot.taken || spot === agent.at) continue;
      if (spot.party && spot.party !== party) continue;
      if (spot.owner) {
        if (spot.owner === agent.id) own = spot;
        continue;
      }
      open.push(spot);
    }
    return own ?? (open.length ? open[Math.floor(Math.random() * open.length)] : null);
  }

  /** Decide where to go next and hold the places. False when everywhere suitable is full. */
  private planOuting(agent: Agent): boolean {
    for (let attempt = 0; attempt < 3; attempt++) {
      let roll = Math.random() * TOTAL_WEIGHT;
      const outing = OUTINGS.find((entry) => (roll -= entry.weight) < 0) ?? OUTINGS[0];
      if (outing.kind === "preside" && agent.member?.party !== this.majority) continue;
      const spot = this.free(outing.kind, agent);
      if (!spot) continue;
      if (outing.kind === "eat") {
        const line = this.free("queue", agent);
        if (line) {
          line.taken = agent.id;
          agent.steps.push({ spot: line, stay: seconds(2, 5) });
        }
      }
      spot.taken = agent.id;
      agent.steps.push({ spot, stay: seconds(outing.stay[0], outing.stay[1]) });
      if (outing.kind !== "chat" && Math.random() < 0.25) {
        const chat = this.free("chat", agent);
        if (chat) {
          chat.taken = agent.id;
          agent.steps.push({ spot: chat, stay: seconds(5, 12) });
        }
      }
      return true;
    }
    return false;
  }

  private next(agent: Agent) {
    if (!agent.steps.length) {
      if (!agent.member) {
        const errand = this.free("errand", agent);
        if (errand) {
          errand.taken = agent.id;
          agent.steps.push({ spot: errand, stay: seconds(3, 9) });
        }
      } else if (agent.at !== agent.home) agent.steps.push({ spot: agent.home, stay: seconds(25, 100) });
      else this.planOuting(agent);
    }
    const step = agent.steps.shift();
    if (!step) {
      agent.until = this.clock + seconds(8, 20);
      return;
    }
    if (agent.member) {
      agent.emote?.destroy();
      agent.prop?.destroy();
      agent.emote = agent.prop = null;
    }
    agent.bob = false;
    if (agent.at !== agent.home || !agent.member) agent.at.taken = null;
    const tiles = findPath(this.b, agent.at.tx, agent.at.ty, step.spot.tx, step.spot.ty) ?? [];
    agent.path = tiles.map((tile) => spotXY(tile));
    const end = spotXY(step.spot);
    if (agent.path.length) agent.path[agent.path.length - 1] = end;
    else agent.path.push(end);
    agent.at = step.spot;
    agent.stay = step.stay;
    agent.moving = true;
  }

  private setFrame(agent: Agent, back: boolean, flip = false) {
    const frame = back ? `${agent.id}:b` : agent.id;
    if (frame !== agent.frame) {
      agent.frame = frame;
      agent.sprite.setFrame(frame);
    }
    agent.sprite.setFlipX(flip);
  }

  private arrive(agent: Agent) {
    const spot = agent.at;
    const at = spotXY(spot);
    agent.moving = false;
    agent.path = [];
    agent.until = this.clock + agent.stay;
    agent.sprite.setPosition(at.x, at.y).setOrigin(0.5, 1).setDepth(DEPTH.sorted + at.y / 10000);
    this.setFrame(agent, spot.face === "up");
    this.attach(agent);
    if (!agent.member) return;
    agent.bob = spot.kind === "gym";
    const emote = EMOTES[spot.kind] ?? (spot.kind === "hearing" && spot.face === "down" ? "talk" : undefined);
    if (emote) agent.emote = this.add.image(at.x + 7, at.y - SPRITE_H, `emote-${emote}`).setOrigin(0.5, 1).setDepth(DEPTH.emote);
    if (spot.kind === "eat" && spot.table !== undefined) {
      const y = spot.table * T + (spot.face === "down" ? -3 : 3);
      agent.prop = this.add.image(at.x, y, "tray").setDepth(DEPTH.sorted + ((spot.table + 1) * T + 0.5) / 10000);
    }
  }

  /** Keep the things a figure carries (badge, papers) with it. */
  private attach(agent: Agent) {
    const { x, y } = agent.sprite;
    agent.badge?.setPosition(x, y - SPRITE_H - 1);
    if (!agent.member) agent.prop?.setPosition(x, y - SPRITE_H - 4);
  }

  private walk(agent: Agent, dt: number) {
    const sprite = agent.sprite;
    let remaining = agent.speed * dt;
    while (remaining > 0 && agent.path.length) {
      const target = agent.path[0];
      const dx = target.x - sprite.x;
      const dy = target.y - sprite.y;
      const distance = Math.hypot(dx, dy);
      if (distance <= remaining) {
        sprite.setPosition(target.x, target.y);
        agent.path.shift();
        remaining -= distance;
        continue;
      }
      sprite.setPosition(sprite.x + (dx / distance) * remaining, sprite.y + (dy / distance) * remaining);
      const vertical = Math.abs(dy) > Math.abs(dx);
      this.setFrame(agent, vertical && dy < 0, !vertical && dx < 0);
      remaining = 0;
    }
    if (!agent.path.length) return this.arrive(agent);
    sprite.setDepth(DEPTH.sorted + sprite.y / 10000);
    this.attach(agent);
  }

  update(time: number, delta: number) {
    const dt = Math.min(delta, 100) / 1000;
    this.clock += dt * 1000;
    const step = Math.floor(this.clock / 150);
    const showEmotes = this.cameras.main.zoom >= 0.9;
    for (const agent of this.agents.values()) {
      if (agent.moving) this.walk(agent, dt);
      else if (this.clock >= agent.until) this.next(agent);
      if (agent.moving || agent.bob) agent.sprite.setOrigin(0.5, 1 + ((step + Math.floor(agent.phase)) % 2) * 0.045);
      if (agent.emote) {
        const talking = agent.emote.texture.key === "emote-talk";
        agent.emote.setVisible(showEmotes && (!talking || (this.clock + agent.phase) % 2600 < 1300));
      }
    }
    if (this.committee?.session && this.clock >= this.nextSpeakerAt) this.passTheFloor();
    this.applyLod();
    if (this.selectedId) {
      const agent = this.agents.get(this.selectedId);
      if (agent) this.ring.setPosition(agent.sprite.x, agent.sprite.y - 2);
    }
    if (time - this.lastLabelPass > 160) {
      this.lastLabelPass = time;
      this.placeNameLabels();
    }
  }

  /** In a meeting, one member at a time has the floor. */
  private passTheFloor() {
    const seated = [...this.agents.values()].filter((agent) => agent.member);
    this.speaker?.emote?.destroy();
    if (this.speaker) this.speaker.emote = null;
    this.speaker = seated.length ? seated[Math.floor(Math.random() * seated.length)] : null;
    if (this.speaker) {
      const { x, y } = this.speaker.sprite;
      this.speaker.emote = this.add.image(x + 7, y - SPRITE_H, "emote-talk").setOrigin(0.5, 1).setDepth(DEPTH.emote);
    }
    this.nextSpeakerAt = this.clock + seconds(2.5, 6);
  }

  // ── Level of detail ────────────────────────────────────────────────────────

  private applyLod() {
    const zoom = this.cameras.main.zoom;
    if (Math.abs(zoom - this.lastZoom) < 0.001) return;
    this.lastZoom = zoom;
    const showBadges = zoom >= 1.6;
    for (const agent of this.agents.values()) agent.badge?.setVisible(showBadges);
    const scale = Phaser.Math.Clamp(1 / zoom, 0.6, 2.4);
    for (const label of this.roomLabels) label.setScale(scale).setVisible(zoom < 2.4);
  }

  /** Names for whoever is pointed at or selected, and, close up, for everyone on the move. */
  private placeNameLabels() {
    const camera = this.cameras.main;
    this.nameLabels.forEach((label) => label.setVisible(false));
    const view = camera.worldView;
    let used = 0;
    const show = (agent: Agent | undefined, scale: number) => {
      if (!agent?.member || used >= this.nameLabels.length) return;
      const last = agent.member.name.split(" ").slice(-1)[0];
      this.nameLabels[used++]
        .setText(`${last}\n${agent.member.state}`)
        .setPosition(agent.sprite.x, agent.sprite.y)
        .setScale(scale)
        .setAlpha(agent.sprite.alpha)
        .setVisible(true);
    };
    const featured = Phaser.Math.Clamp(1.5 / camera.zoom, 0.6, 2.4);
    if (this.hoverId) show(this.agents.get(this.hoverId), featured);
    if (this.selectedId && this.selectedId !== this.hoverId) show(this.agents.get(this.selectedId), featured);
    if (camera.zoom < 2.2) return;
    const scale = Phaser.Math.Clamp(2.4 / camera.zoom, 0.5, 1);
    for (const agent of this.agents.values()) {
      if (!agent.moving) continue; // seats and tables are too close together for names
      if (agent.id === this.hoverId || agent.id === this.selectedId) continue;
      if (view.contains(agent.sprite.x, agent.sprite.y)) show(agent, scale);
    }
  }
}
