// Signs of the times: a few small objects on the lawns that place each Congress
// in its years. They are scenery with a caption, not data, and each caption is
// a plain statement of something that happened while that Congress sat.

import { box, DIGITS, framed, PALETTE, type LawnMarker } from "./art";

type Ctx = CanvasRenderingContext2D;
type Draw = (ctx: Ctx, x: number, y: number) => void;

function digits(ctx: Ctx, text: string, x: number, y: number, color: string) {
  [...text].forEach((digit, i) => {
    const bits = DIGITS[Number(digit)];
    for (let b = 0; b < 15; b++) if (bits[b] === "1") box(ctx, x + i * 4 + (b % 3), y + Math.floor(b / 3), 1, 1, color);
  });
}

const barricade: Draw = (ctx, x, y) => {
  framed(ctx, x + 13, y + 3, 6, 6, PALETTE.yellow);
  framed(ctx, x + 2, y + 9, 28, 8, PALETTE.white);
  for (let i = 0; i < 5; i++) box(ctx, x + 4 + i * 6, y + 10, 3, 6, PALETTE.orange);
  for (const lx of [5, 25]) {
    box(ctx, x + lx, y + 17, 2, 11, PALETTE.ink);
    box(ctx, x + lx - 2, y + 27, 6, 2, PALETTE.ink);
  }
};

const ballot = (year: string): Draw => (ctx, x, y) => {
  framed(ctx, x + 12, y + 3, 8, 11, PALETTE.white);
  box(ctx, x + 14, y + 6, 4, 1, PALETTE.ink);
  box(ctx, x + 14, y + 8, 3, 1, PALETTE.ink);
  framed(ctx, x + 5, y + 12, 22, 17, PALETTE.slate);
  box(ctx, x + 6, y + 13, 20, 3, PALETTE.slateDark);
  box(ctx, x + 11, y + 14, 10, 1, PALETTE.ink);
  digits(ctx, year, x + 9, y + 20, PALETTE.white);
};

const scissors: Draw = (ctx, x, y) => {
  framed(ctx, x + 5, y + 2, 22, 9, "#a9d79a");
  box(ctx, x + 15, y + 4, 2, 5, "#3f8f4a");
  for (let i = 0; i < 11; i++) {
    box(ctx, x + 9 + i, y + 9 + i, 3, 2, PALETTE.steelDark);
    box(ctx, x + 20 - i, y + 9 + i, 3, 2, PALETTE.steel);
  }
  for (const hx of [3, 19]) {
    framed(ctx, x + hx, y + 20, 10, 9, PALETTE.partyR);
    box(ctx, x + hx + 3, y + 23, 4, 3, PALETTE.grass);
  }
};

const laptop: Draw = (ctx, x, y) => {
  framed(ctx, x + 5, y + 5, 22, 16, PALETTE.white);
  box(ctx, x + 14, y + 8, 4, 10, PALETTE.partyR);
  box(ctx, x + 11, y + 11, 10, 4, PALETTE.partyR);
  framed(ctx, x + 2, y + 21, 28, 5, PALETTE.steel);
  box(ctx, x + 12, y + 23, 8, 1, PALETTE.steelDark);
};

const phone: Draw = (ctx, x, y) => {
  framed(ctx, x + 10, y + 2, 12, 27, "#1c1c28");
  box(ctx, x + 12, y + 5, 8, 18, PALETTE.waterLight);
  box(ctx, x + 14, y + 8, 4, 2, PALETTE.white);
  box(ctx, x + 13, y + 12, 6, 1, PALETTE.slate);
  box(ctx, x + 13, y + 15, 6, 1, PALETTE.slate);
  box(ctx, x + 13, y + 18, 4, 1, PALETTE.slate);
  box(ctx, x + 15, y + 25, 2, 2, PALETTE.steel);
};

const gavel: Draw = (ctx, x, y) => {
  framed(ctx, x + 4, y + 4, 18, 9, PALETTE.wood);
  box(ctx, x + 7, y + 5, 2, 7, PALETTE.woodDark);
  box(ctx, x + 17, y + 5, 2, 7, PALETTE.woodDark);
  for (let i = 0; i < 12; i++) {
    box(ctx, x + 12 + i, y + 12 + i, 4, 4, PALETTE.ink);
    box(ctx, x + 13 + i, y + 13 + i, 2, 2, PALETTE.woodDark);
  }
  framed(ctx, x + 2, y + 24, 16, 5, PALETTE.woodDark);
};

const courtChair: Draw = (ctx, x, y) => {
  framed(ctx, x + 9, y + 2, 14, 19, "#3a2f45");
  box(ctx, x + 11, y + 4, 10, 13, "#5a4a6a");
  framed(ctx, x + 6, y + 19, 20, 5, PALETTE.door);
  for (const lx of [7, 23]) box(ctx, x + lx, y + 24, 2, 6, PALETTE.ink);
  box(ctx, x + 4, y + 14, 3, 6, PALETTE.door);
  box(ctx, x + 25, y + 14, 3, 6, PALETTE.door);
};

const schoolBus: Draw = (ctx, x, y) => {
  framed(ctx, x + 1, y + 9, 30, 15, PALETTE.yellow);
  for (let i = 0; i < 5; i++) framed(ctx, x + 3 + i * 5, y + 11, 5, 6, PALETTE.window);
  box(ctx, x + 2, y + 19, 28, 1, PALETTE.ink);
  box(ctx, x + 28, y + 20, 2, 2, PALETTE.partyR);
  for (const wx of [5, 21]) {
    framed(ctx, x + wx, y + 22, 7, 7, PALETTE.ink);
    box(ctx, x + wx + 2, y + 24, 3, 3, PALETTE.steel);
  }
};

const turbine: Draw = (ctx, x, y) => {
  framed(ctx, x + 14, y + 12, 4, 18, PALETTE.white);
  framed(ctx, x + 14, y + 1, 4, 12, PALETTE.white);
  for (let i = 0; i < 10; i++) {
    box(ctx, x + 17 + i, y + 13 + Math.floor(i / 2), 3, 3, PALETTE.ink);
    box(ctx, x + 12 - i, y + 13 + Math.floor(i / 2), 3, 3, PALETTE.ink);
  }
  for (let i = 0; i < 9; i++) {
    box(ctx, x + 18 + i, y + 14 + Math.floor(i / 2), 1, 1, PALETTE.white);
    box(ctx, x + 13 - i, y + 14 + Math.floor(i / 2), 1, 1, PALETTE.white);
  }
  framed(ctx, x + 13, y + 10, 6, 6, PALETTE.stone);
};

const eclipse: Draw = (ctx, x, y) => {
  // The sun behind the moon, and a telescope set up to watch.
  box(ctx, x + 19, y + 1, 10, 12, PALETTE.yellow);
  box(ctx, x + 18, y + 2, 12, 10, PALETTE.yellow);
  box(ctx, x + 20, y + 3, 8, 8, PALETTE.ink);
  box(ctx, x + 21, y + 2, 6, 10, PALETTE.ink);
  for (let i = 0; i < 9; i++) {
    box(ctx, x + 5 + i, y + 16 - i, 5, 5, PALETTE.ink);
    box(ctx, x + 6 + i, y + 17 - i, 3, 3, PALETTE.steel);
  }
  for (let i = 0; i < 10; i++) {
    box(ctx, x + 10 - Math.floor(i / 2), y + 19 + i, 2, 1, PALETTE.ink);
    box(ctx, x + 11 + Math.floor(i / 2), y + 19 + i, 2, 1, PALETTE.ink);
  }
};

const calculator: Draw = (ctx, x, y) => {
  framed(ctx, x + 8, y + 2, 16, 27, PALETTE.slate);
  framed(ctx, x + 10, y + 4, 12, 7, "#cfe8c0");
  for (let row = 0; row < 4; row++) for (let col = 0; col < 3; col++) box(ctx, x + 10 + col * 4, y + 13 + row * 4, 3, 3, col === 2 && row === 3 ? PALETTE.orange : PALETTE.white);
};

const containers: Draw = (ctx, x, y) => {
  framed(ctx, x + 4, y + 3, 24, 12, "#3a7ca8");
  for (let i = 0; i < 5; i++) box(ctx, x + 7 + i * 4, y + 5, 1, 8, "#2b5f84");
  framed(ctx, x + 1, y + 15, 30, 13, "#c8553d");
  for (let i = 0; i < 7; i++) box(ctx, x + 4 + i * 4, y + 17, 1, 9, "#9c3f2c");
};

const mailbox: Draw = (ctx, x, y) => {
  framed(ctx, x + 12, y + 1, 9, 7, PALETTE.white);
  box(ctx, x + 14, y + 3, 5, 1, PALETTE.ink);
  box(ctx, x + 9, y + 6, 14, 2, PALETTE.ink);
  framed(ctx, x + 7, y + 7, 18, 18, "#2f5fa8");
  box(ctx, x + 10, y + 11, 12, 2, PALETTE.ink);
  box(ctx, x + 10, y + 16, 12, 5, PALETTE.white);
  box(ctx, x + 12, y + 18, 8, 1, "#2f5fa8");
  for (const lx of [9, 21]) box(ctx, x + lx, y + 25, 2, 5, PALETTE.ink);
};

const tent = (cross: string): Draw => (ctx, x, y) => {
  for (let i = 0; i < 8; i++) {
    box(ctx, x + 13 - 2 * i, y + 3 + i, 6 + 4 * i, 1, PALETTE.white);
    box(ctx, x + 12 - 2 * i, y + 3 + i, 2, 1, PALETTE.ink);
    box(ctx, x + 18 + 2 * i, y + 3 + i, 2, 1, PALETTE.ink);
  }
  box(ctx, x + 13, y + 2, 6, 1, PALETTE.ink);
  framed(ctx, x + 2, y + 11, 28, 17, PALETTE.white);
  box(ctx, x + 12, y + 17, 8, 10, "#d9e6f2");
  box(ctx, x + 15, y + 4, 2, 6, cross);
  box(ctx, x + 13, y + 6, 6, 2, cross);
};

const reliefCheck: Draw = (ctx, x, y) => {
  framed(ctx, x + 2, y + 8, 28, 17, PALETTE.white);
  box(ctx, x + 4, y + 10, 10, 1, PALETTE.stoneEdge);
  box(ctx, x + 4, y + 21, 14, 1, PALETTE.stoneEdge);
  const green = "#2e8b57";
  box(ctx, x + 21, y + 11, 5, 1, green);
  box(ctx, x + 20, y + 12, 1, 3, green);
  box(ctx, x + 21, y + 15, 4, 1, green);
  box(ctx, x + 25, y + 16, 1, 3, green);
  box(ctx, x + 20, y + 19, 5, 1, green);
  box(ctx, x + 22, y + 9, 1, 13, green);
};

const rocket: Draw = (ctx, x, y) => {
  box(ctx, x + 14, y + 1, 4, 2, PALETTE.ink);
  framed(ctx, x + 13, y + 2, 6, 5, PALETTE.partyR);
  framed(ctx, x + 12, y + 6, 8, 18, PALETTE.white);
  framed(ctx, x + 14, y + 9, 4, 4, PALETTE.window);
  framed(ctx, x + 8, y + 17, 5, 8, PALETTE.partyR);
  framed(ctx, x + 19, y + 17, 5, 8, PALETTE.partyR);
  box(ctx, x + 14, y + 24, 4, 4, PALETTE.orange);
  box(ctx, x + 15, y + 27, 2, 3, PALETTE.yellow);
};

const scales: Draw = (ctx, x, y) => {
  framed(ctx, x + 14, y + 4, 4, 22, PALETTE.gold);
  framed(ctx, x + 3, y + 6, 26, 3, PALETTE.gold);
  for (const px of [1, 21]) {
    box(ctx, x + px + 4, y + 9, 1, 7, PALETTE.ink);
    framed(ctx, x + px, y + 16, 10, 3, PALETTE.gold);
  }
  framed(ctx, x + 8, y + 25, 16, 4, PALETTE.goldDark);
};

const fence: Draw = (ctx, x, y) => {
  for (let i = 0; i < 11; i++) box(ctx, x + 1 + i * 3, y + 5, 1, 22, PALETTE.ink);
  for (let row = 0; row < 4; row++) box(ctx, x, y + 7 + row * 6, 32, 1, PALETTE.steelDark);
  box(ctx, x, y + 5, 32, 2, PALETTE.ink);
  for (const fx of [2, 24]) framed(ctx, x + fx, y + 26, 7, 4, PALETTE.stone);
};

const cones: Draw = (ctx, x, y) => {
  framed(ctx, x + 17, y + 1, 12, 12, PALETTE.yellow);
  box(ctx, x + 21, y + 4, 4, 2, PALETTE.ink);
  box(ctx, x + 22, y + 6, 2, 4, PALETTE.ink);
  box(ctx, x + 22, y + 13, 2, 15, PALETTE.steelDark);
  for (const cx of [2, 9]) {
    box(ctx, x + cx + 3, y + 13, 2, 4, PALETTE.orange);
    box(ctx, x + cx + 2, y + 17, 4, 4, PALETTE.orange);
    box(ctx, x + cx + 2, y + 19, 4, 1, PALETTE.white);
    box(ctx, x + cx + 1, y + 21, 6, 4, PALETTE.orange);
    box(ctx, x + cx, y + 25, 8, 2, PALETTE.ink);
  }
};

const chip: Draw = (ctx, x, y) => {
  for (let i = 0; i < 4; i++) {
    box(ctx, x + 10 + i * 4, y + 3, 2, 5, PALETTE.gold);
    box(ctx, x + 10 + i * 4, y + 24, 2, 5, PALETTE.gold);
    box(ctx, x + 3, y + 10 + i * 4, 5, 2, PALETTE.gold);
    box(ctx, x + 24, y + 10 + i * 4, 5, 2, PALETTE.gold);
  }
  framed(ctx, x + 7, y + 7, 18, 18, "#2d3b2f");
  framed(ctx, x + 11, y + 11, 10, 10, "#3f5a44");
  box(ctx, x + 14, y + 14, 4, 4, PALETTE.gold);
};

const server: Draw = (ctx, x, y) => {
  framed(ctx, x + 7, y + 1, 18, 29, "#3a3f4d");
  for (let i = 0; i < 5; i++) {
    box(ctx, x + 9, y + 4 + i * 5, 14, 3, "#22252e");
    box(ctx, x + 10, y + 5 + i * 5, 1, 1, i % 2 ? "#5fe08a" : PALETTE.waterLight);
    box(ctx, x + 12, y + 5 + i * 5, 1, 1, "#5fe08a");
    box(ctx, x + 16, y + 5 + i * 5, 6, 1, PALETTE.steelDark);
  }
};

const coins: Draw = (ctx, x, y) => {
  framed(ctx, x + 2, y + 1, 28, 4, PALETTE.steelDark);
  for (let i = 0; i < 5; i++) framed(ctx, x + 8, y + 24 - i * 4, 16, 5, PALETTE.gold);
  box(ctx, x + 15, y + 6, 2, 3, PALETTE.ink);
  box(ctx, x + 14, y + 6, 4, 1, PALETTE.ink);
};

const bunting: Draw = (ctx, x, y) => {
  for (const px of [1, 29]) box(ctx, x + px, y + 3, 2, 27, PALETTE.woodDark);
  box(ctx, x + 2, y + 4, 28, 1, PALETTE.ink);
  for (let i = 0; i < 7; i++) {
    const color = [PALETTE.partyR, PALETTE.white, PALETTE.partyD][i % 3];
    box(ctx, x + 3 + i * 4, y + 5, 3, 4, color);
    box(ctx, x + 4 + i * 4, y + 9, 1, 2, color);
  }
  framed(ctx, x + 8, y + 14, 16, 11, PALETTE.white);
  digits(ctx, "250", x + 11, y + 17, PALETTE.partyD);
};

const RED = PALETTE.partyR;
const BLUE = PALETTE.partyD;

export const ERA: Record<number, LawnMarker[]> = {
  113: [
    { draw: scissors, note: "March 2013: the sequester, automatic across-the-board budget cuts, takes effect." },
    { draw: phone, note: "June 2013: disclosures about the collection of phone records start a long debate over surveillance." },
    { draw: barricade, note: "October 2013: a 16-day government shutdown." },
    { draw: laptop, note: "October 2013: the health insurance marketplaces open." },
    { draw: ballot("2014"), note: "November 2014: midterm elections. Republicans win the Senate." },
  ],
  114: [
    { draw: gavel, note: "October 2015: Paul Ryan becomes Speaker after John Boehner resigns." },
    { draw: schoolBus, note: "December 2015: the Every Student Succeeds Act replaces No Child Left Behind." },
    { draw: turbine, note: "December 2015: the Paris climate agreement is adopted." },
    { draw: courtChair, note: "2016: a seat on the Supreme Court stays empty for most of the year." },
    { draw: ballot("2016"), note: "November 2016: presidential election." },
  ],
  115: [
    { draw: eclipse, note: "August 2017: a total solar eclipse crosses the country from coast to coast." },
    { draw: calculator, note: "December 2017: the Tax Cuts and Jobs Act." },
    { draw: containers, note: "2018: new tariffs on steel, aluminum and Chinese goods." },
    { draw: ballot("2018"), note: "November 2018: midterm elections. Democrats win the House." },
    { draw: barricade, note: "December 2018: a 35-day shutdown begins, the longest up to then." },
  ],
  116: [
    { draw: scales, note: "December 2019 to February 2020: the House impeaches the President and the Senate acquits him." },
    { draw: rocket, note: "December 2019: the Space Force is created." },
    { draw: tent(RED), note: "2020: the COVID-19 pandemic." },
    { draw: reliefCheck, note: "March 2020: the CARES Act, about $2.2 trillion in relief." },
    { draw: mailbox, note: "November 2020: presidential election, with a record share of votes cast by mail." },
  ],
  117: [
    { draw: fence, note: "January 2021: the Capitol is attacked. A security fence stands around it until July." },
    { draw: tent(BLUE), note: "2021: COVID-19 vaccines are rolled out." },
    { draw: cones, note: "November 2021: the Infrastructure Investment and Jobs Act." },
    { draw: chip, note: "August 2022: the CHIPS and Science Act." },
    { draw: ballot("2022"), note: "November 2022: midterm elections. Republicans win the House." },
  ],
  118: [
    { draw: gavel, note: "January 2023: it takes 15 ballots to elect a Speaker. In October the House removes him, a first." },
    { draw: coins, note: "June 2023: the debt limit is suspended days before the Treasury would have run short." },
    { draw: server, note: "2023: generative AI arrives, and Congress begins holding hearings on it." },
    { draw: phone, note: "April 2024: a law orders TikTok to be sold or banned." },
    { draw: ballot("2024"), note: "November 2024: presidential election." },
  ],
  119: [
    { draw: containers, note: "2025: sweeping new tariffs." },
    { draw: barricade, note: "October to November 2025: a 43-day shutdown, the longest on record." },
    { draw: server, note: "2025–26: an AI boom, and a rush to build data centers." },
    { draw: bunting, note: "July 4, 2026: the nation’s 250th birthday." },
    { draw: ballot("2026"), note: "November 2026: midterm elections." },
  ],
};
