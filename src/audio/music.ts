// Chiptune background music, synthesised in the browser: no audio files.
// The tunes are in the public domain ("Yankee Doodle", traditional; "America the
// Beautiful", Samuel A. Ward, 1882) and the arrangements and bridge were written
// for this project, so there is nothing to license.

export type TrackName = "map" | "inside";

type Wave = "pulse" | "square" | "triangle";

interface Voice {
  wave: Wave;
  gain: number;
  /** Share of each note's length that actually sounds. */
  gate: number;
}

interface Note {
  at: number; // sixteenths from the start of the song
  length: number;
  pitches: number[]; // MIDI numbers; for drums, 0 kick, 1 snare, 2 hat
}

interface Song {
  /** Quarter notes per minute. */
  bpm: number;
  length: number;
  voices: { lead: Voice; harmony: Voice; bass: Voice };
  lead: Note[];
  harmony: Note[];
  bass: Note[];
  drums: Note[];
}

const SEMITONE: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
const DRUM: Record<string, number> = { k: 0, s: 1, h: 2 };
const CHORDS: Record<string, [string, string, string]> = {
  C: ["C", "E", "G"],
  F: ["F", "A", "C"],
  G: ["G", "B", "D"],
  Dm: ["D", "F", "A"],
  A: ["A", "C#", "E"],
  D: ["D", "F#", "A"],
};

function midi(name: string): number {
  const octave = Number(name.slice(-1));
  const letter = name[0];
  const accidental = name.length === 3 ? (name[1] === "#" ? 1 : -1) : 0;
  return 12 * (octave + 1) + SEMITONE[letter] + accidental;
}

/** "C5/2 E4+G4/2 -/4": pitches (joined by + for a chord) or a rest, then a length in sixteenths. */
function parse(score: string, shift = 0): { notes: Note[]; length: number } {
  const notes: Note[] = [];
  let at = 0;
  for (const token of score.trim().split(/\s+/)) {
    const [what, lengthText] = token.split("/");
    const length = Number(lengthText);
    if (what !== "-") {
      const pitches = what.split("+").map((name) => (name in DRUM ? DRUM[name] : midi(name) + shift));
      notes.push({ at, length, pitches });
    }
    at += length;
  }
  return { notes, length: at };
}

/** A chord tone at or just above an octave, so voicings stay close together. */
const above = (note: string, root: string, octave: number) => `${note}${SEMITONE[note[0]] < SEMITONE[root[0]] ? octave + 1 : octave}`;
const low = (note: string) => `${note}${SEMITONE[note[0]] >= 7 ? 2 : 3}`;

/** Oom-pah for a march: one chord per beat, bass on the beat and a stab after it. */
function march(chords: string[]): { bass: string; harmony: string } {
  const bass: string[] = [];
  const harmony: string[] = [];
  chords.forEach((name, beat) => {
    const [root, third, fifth] = CHORDS[name];
    bass.push(`${low(beat % 2 ? fifth : root)}/2 -/2`);
    harmony.push(`-/2 ${above(third, root, 3)}+${above(fifth, root, 3)}/2`);
  });
  return { bass: bass.join(" "), harmony: harmony.join(" ") };
}

/** Rolling accompaniment for a slow tune: one chord per half bar. */
function rolling(chords: string[]): { bass: string; harmony: string } {
  const bass: string[] = [];
  const harmony: string[] = [];
  for (const name of chords) {
    const [root, third, fifth] = CHORDS[name];
    bass.push(`${low(root)}/8`);
    harmony.push(`${above(root, root, 3)}/2 ${above(fifth, root, 3)}/2 ${above(third, root, 4)}/2 ${above(fifth, root, 3)}/2`);
  }
  return { bass: bass.join(" "), harmony: harmony.join(" ") };
}

function buildMap(): Song {
  // Yankee Doodle in C, in 2/4: eight sixteenths to the bar.
  const tune = `
    C5/2 C5/2 D5/2 E5/2   C5/2 E5/2 D5/2 G4/2   C5/2 C5/2 D5/2 E5/2   C5/4 B4/4
    C5/2 C5/2 D5/2 E5/2   F5/2 E5/2 D5/2 C5/2   B4/2 G4/2 A4/2 B4/2   C5/4 C5/4
    A4/3 B4/1 A4/2 G4/2   A4/2 B4/2 C5/4        G4/3 A4/1 G4/2 F4/2   E4/4 G4/4
    A4/3 B4/1 A4/2 G4/2   A4/2 B4/2 C5/2 A4/2   G4/2 C5/2 B4/2 D5/2   C5/4 C5/4`;
  const tuneChords = "C C C G C C C G  C C F C G G C C  F F F F C C C C  F F F F C G C C".split(/\s+/);
  // A bridge written for this arrangement.
  const bridge = `
    E5/2 G5/2 G5/1 A5/1 G5/2   F5/2 A5/2 A5/4        D5/2 F5/2 F5/1 G5/1 F5/2   E5/2 G5/2 E5/4
    E5/2 G5/2 C6/2 G5/2        A5/2 F5/2 A5/2 C6/2   B5/2 G5/2 A5/2 B5/2        C6/4 G5/2 -/2`;
  const bridgeChords = "C C F F G G C C  C C F F G G C C".split(/\s+/);
  const beat = "k/2 s/1 s/1 k/2 s/2";
  const fill = "s/1 s/1 s/1 s/1 s/2 s/2";
  const drumsFor = (bars: number) =>
    Array.from({ length: bars }, (_, bar) => (bar % 8 === 7 ? fill : beat)).join(" ");

  const song: Song = {
    bpm: 118,
    length: 0,
    voices: {
      lead: { wave: "pulse", gain: 0.3, gate: 0.82 },
      harmony: { wave: "square", gain: 0.09, gate: 0.7 },
      bass: { wave: "triangle", gain: 0.5, gate: 0.85 },
    },
    lead: [],
    harmony: [],
    bass: [],
    drums: [],
  };
  // The tune, the bridge, then the tune again a fourth higher.
  const sections: { melody: string; chords: string[]; shift: number }[] = [
    { melody: tune, chords: tuneChords, shift: 0 },
    { melody: bridge, chords: bridgeChords, shift: 0 },
    { melody: tune, chords: tuneChords, shift: 5 },
  ];
  for (const { melody, chords, shift } of sections) {
    const backing = march(chords);
    const lead = parse(melody, shift);
    const place = (notes: Note[]) => notes.map((note) => ({ ...note, at: note.at + song.length }));
    song.lead.push(...place(lead.notes));
    song.harmony.push(...place(parse(backing.harmony, shift).notes));
    song.bass.push(...place(parse(backing.bass, shift).notes));
    song.drums.push(...place(parse(drumsFor(lead.length / 8)).notes));
    song.length += lead.length;
  }
  return song;
}

function buildInside(): Song {
  // America the Beautiful in C, in 4/4: sixteen sixteenths to the bar. The last
  // beat of each line is the pick-up to the next.
  const tune = `
    G4/6 E4/2 E4/4 G4/4    G4/6 D4/2 D4/4 E4/4    F4/4 G4/4 A4/4 B4/4    G4/12 G4/4
    G4/6 E4/2 E4/4 G4/4    G4/6 D4/2 D4/4 D5/4    C#5/4 D5/4 E5/4 A4/4   D5/12 G4/4
    E5/6 E5/2 D5/4 C5/4    C5/6 B4/2 B4/4 C5/4    D5/4 B4/4 A4/4 G4/4    C5/12 C5/4
    C5/6 A4/2 A4/4 C5/4    C5/6 G4/2 G4/4 G4/4    A4/4 C5/4 G4/4 D5/4    C5/12 G4/4`;
  const chords = "C C G G Dm G C C  C C G G A D G G  C C G G G G C C  F F C C F G C C".split(/\s+/);
  const backing = rolling(chords);
  const lead = parse(tune);
  return {
    bpm: 84,
    length: lead.length,
    voices: {
      lead: { wave: "square", gain: 0.2, gate: 0.94 },
      harmony: { wave: "triangle", gain: 0.3, gate: 0.9 },
      bass: { wave: "triangle", gain: 0.42, gate: 0.95 },
    },
    lead: lead.notes,
    harmony: parse(backing.harmony).notes,
    bass: parse(backing.bass).notes,
    drums: [],
  };
}

const SONGS: Record<TrackName, () => Song> = { map: buildMap, inside: buildInside };
const VOLUME = 0.22;
const LOOKAHEAD = 0.25; // seconds of notes kept queued
const STORAGE_KEY = "capitol-world-music";

export interface Music {
  readonly enabled: boolean;
  setEnabled(on: boolean): void;
  setTrack(name: TrackName): void;
}

export function createMusic(): Music {
  let enabled = true;
  try {
    enabled = localStorage.getItem(STORAGE_KEY) !== "off";
  } catch {
    // Storage can be blocked (private windows, some embeds); the default stands.
  }
  let context: AudioContext | undefined;
  let pulse: PeriodicWave | undefined;
  let noise: AudioBuffer | undefined;
  let track: TrackName = "map";
  let playing: { song: Song; out: GainNode; startedAt: number; cursor: Record<"lead" | "harmony" | "bass" | "drums", number>; loop: number } | undefined;
  let timer: number | undefined;
  const songs = new Map<TrackName, Song>();

  function setUp(): AudioContext {
    if (context) return context;
    context = new AudioContext();
    // A 25% pulse wave, the sound of an old console's lead channel.
    const real = new Float32Array(32);
    for (let n = 1; n < 32; n++) real[n] = (2 / (n * Math.PI)) * Math.sin(n * Math.PI * 0.25);
    pulse = context.createPeriodicWave(real, new Float32Array(32));
    noise = context.createBuffer(1, context.sampleRate * 0.25, context.sampleRate);
    const samples = noise.getChannelData(0);
    for (let i = 0; i < samples.length; i++) samples[i] = Math.random() * 2 - 1;
    return context;
  }

  function tone(out: GainNode, voice: Voice, pitch: number, when: number, seconds: number) {
    const ctx = context!;
    const oscillator = ctx.createOscillator();
    if (voice.wave === "pulse") oscillator.setPeriodicWave(pulse!);
    else oscillator.type = voice.wave;
    oscillator.frequency.value = 440 * 2 ** ((pitch - 69) / 12);
    const gain = ctx.createGain();
    const end = when + Math.max(0.03, seconds * voice.gate);
    gain.gain.setValueAtTime(0, when);
    gain.gain.linearRampToValueAtTime(voice.gain, when + 0.006);
    gain.gain.setValueAtTime(voice.gain, end - 0.02);
    gain.gain.linearRampToValueAtTime(0, end);
    oscillator.connect(gain).connect(out);
    oscillator.start(when);
    oscillator.stop(end + 0.01);
  }

  function drum(out: GainNode, kind: number, when: number) {
    const ctx = context!;
    const gain = ctx.createGain();
    gain.connect(out);
    if (kind === 0) {
      const oscillator = ctx.createOscillator();
      oscillator.type = "triangle";
      oscillator.frequency.setValueAtTime(150, when);
      oscillator.frequency.exponentialRampToValueAtTime(50, when + 0.09);
      gain.gain.setValueAtTime(0.55, when);
      gain.gain.exponentialRampToValueAtTime(0.001, when + 0.11);
      oscillator.connect(gain);
      oscillator.start(when);
      oscillator.stop(when + 0.12);
      return;
    }
    const source = ctx.createBufferSource();
    source.buffer = noise!;
    const filter = ctx.createBiquadFilter();
    filter.type = kind === 1 ? "bandpass" : "highpass";
    filter.frequency.value = kind === 1 ? 2200 : 7000;
    const length = kind === 1 ? 0.07 : 0.025;
    gain.gain.setValueAtTime(kind === 1 ? 0.16 : 0.06, when);
    gain.gain.exponentialRampToValueAtTime(0.001, when + length);
    source.connect(filter).connect(gain);
    source.start(when);
    source.stop(when + length + 0.01);
  }

  /** Queue every note that falls inside the look-ahead window. */
  function schedule() {
    if (!context || !playing) return;
    const { song, out, cursor } = playing;
    const sixteenth = 60 / song.bpm / 4;
    const horizon = context.currentTime + LOOKAHEAD;
    for (;;) {
      const loopStart = playing.startedAt + playing.loop * song.length * sixteenth;
      for (const part of ["lead", "harmony", "bass", "drums"] as const) {
        const notes = song[part];
        while (cursor[part] < notes.length) {
          const note = notes[cursor[part]];
          const when = loopStart + note.at * sixteenth;
          if (when > horizon) break;
          cursor[part]++;
          if (when < context.currentTime - 0.05) continue; // too late to play (the timer was held up)
          for (const pitch of note.pitches) {
            if (part === "drums") drum(out, pitch, when);
            else tone(out, song.voices[part], pitch, when, note.length * sixteenth);
          }
        }
      }
      if (loopStart + song.length * sixteenth > horizon) break;
      playing.loop++;
      cursor.lead = cursor.harmony = cursor.bass = cursor.drums = 0;
    }
  }

  function stop(fade = 0.3) {
    if (!context || !playing) return;
    const out = playing.out;
    out.gain.cancelScheduledValues(context.currentTime);
    out.gain.setValueAtTime(out.gain.value, context.currentTime);
    out.gain.linearRampToValueAtTime(0, context.currentTime + fade);
    setTimeout(() => out.disconnect(), (fade + 0.4) * 1000);
    playing = undefined;
  }

  function start() {
    if (!enabled || document.hidden) return;
    const ctx = setUp();
    void ctx.resume();
    if (playing) return;
    if (!songs.has(track)) songs.set(track, SONGS[track]());
    const out = ctx.createGain();
    out.gain.setValueAtTime(0, ctx.currentTime);
    out.gain.linearRampToValueAtTime(VOLUME, ctx.currentTime + 0.4);
    out.connect(ctx.destination);
    playing = { song: songs.get(track)!, out, startedAt: ctx.currentTime + 0.35, cursor: { lead: 0, harmony: 0, bass: 0, drums: 0 }, loop: 0 };
    timer ??= window.setInterval(schedule, 60);
    schedule();
  }

  // Browsers only allow sound after the visitor has clicked or pressed a key.
  const unlock = () => start();
  addEventListener("pointerdown", unlock);
  addEventListener("keydown", unlock);
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) {
      stop(0.1);
      void context?.suspend();
    } else if (context) start();
  });

  return {
    get enabled() {
      return enabled;
    },
    setEnabled(on) {
      enabled = on;
      try {
        localStorage.setItem(STORAGE_KEY, on ? "on" : "off");
      } catch {
        // Not remembered, but it still works for this visit.
      }
      if (on) start();
      else stop();
    },
    setTrack(name) {
      if (name === track) return;
      track = name;
      if (!playing) return;
      stop();
      start();
    },
  };
}

/** For checking the scores: every part of a song must be exactly as long as its melody. */
export function songLengths(): Record<string, Record<string, number>> {
  const out: Record<string, Record<string, number>> = {};
  for (const [name, build] of Object.entries(SONGS)) {
    const song = build();
    const end = (notes: Note[]) => notes.reduce((max, note) => Math.max(max, note.at + note.length), 0);
    out[name] = { length: song.length, lead: end(song.lead), harmony: end(song.harmony), bass: end(song.bass), drums: end(song.drums) };
  }
  return out;
}
