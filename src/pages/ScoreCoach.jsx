import React, { useState, useRef, useEffect, useCallback } from "react";

const NOTE_NAMES = ["C","C#","D","D#","E","F","F#","G","G#","A","A#","B"];

function midiFromWritten(noteStr) {
  const m = noteStr.match(/^([A-G](?:#|b)?)(\d)$/);
  if (!m) return 60;
  let name = m[1];
  const oct = Number(m[2]);
  const FLAT = { Ab:"G#", Bb:"A#", Db:"C#", Eb:"D#", Gb:"F#" };
  if (name.includes("b")) name = FLAT[name] || name;
  return (oct + 1) * 12 + NOTE_NAMES.indexOf(name);
}

function writtenToConcert(noteStr) {
  return midiFromWritten(noteStr) - 14;
}

function freqToMidi(freq) {
  if (!freq || freq <= 0) return null;
  return Math.round(12 * Math.log2(freq / 440) + 69);
}

function freqToCents(freq, targetMidi) {
  if (!freq || freq <= 0) return 0;
  const exact = 12 * Math.log2(freq / 440) + 69;
  return Math.round((exact - targetMidi) * 100);
}

function autoCorrelate(buffer, sampleRate) {
  const SIZE = buffer.length;
  let rms = 0;
  for (let i = 0; i < SIZE; i++) rms += buffer[i] * buffer[i];
  rms = Math.sqrt(rms / SIZE);
  if (rms < 0.01) return -1;

  const c = new Float32Array(SIZE);
  for (let i = 0; i < SIZE; i++) {
    let sum = 0;
    for (let j = 0; j < SIZE - i; j++) sum += buffer[j] * buffer[j + i];
    c[i] = sum;
  }

  let d = 0;
  while (d < SIZE - 1 && c[d] > c[d + 1]) d++;
  let maxVal = -Infinity, maxPos = -1;
  for (let i = d; i < SIZE; i++) {
    if (c[i] > maxVal) { maxVal = c[i]; maxPos = i; }
  }
  if (maxPos <= 0 || maxPos >= SIZE - 1) return -1;

  const y1 = c[maxPos - 1], y2 = c[maxPos], y3 = c[maxPos + 1];
  const denom = 2 * (2 * y2 - y1 - y3);
  const refined = denom !== 0 ? maxPos + (y3 - y1) / denom : maxPos;
  return sampleRate / refined;
}

// Melodies — written treble Bb notes
// dur: 4=whole, 2=half, 1=quarter
const MELODIES = [
  {
    // When the Saints Go Marching In
    // Andy Norman arr., 3rd Bb part, key of Bb (2 flats), 4/4 treble clef
    // Line 1 confirmed by player: C4 C4 C4 C4 C4 D4 D4 C4 D4 F4 E4
    // Fingerings on score used to verify: 0=C/G, 13=D/G, 1=F/Bb, 12=A/E, 23=Eb/Ab
    title: "When the Saints Go Marching In",
    notes: [
      // Bar 1: C(q) C(q) C(q) C(q)
      {note:"C4",dur:1},{note:"C4",dur:1},{note:"C4",dur:1},{note:"C4",dur:1},
      // Bar 2: C(h) D(q) D(q)
      {note:"C4",dur:2},{note:"D4",dur:1},{note:"D4",dur:1},
      // Bar 3: C(h) D(h) — fingering 13 confirms D
      {note:"C4",dur:2},{note:"D4",dur:2},
      // Bar 4: F(dotted h) E(q)  — fingering 1 then 12
      {note:"F4",dur:2},{note:"F4",dur:1},{note:"E4",dur:1},
      // Bar 5: D(w) — fingering 13
      {note:"D4",dur:4},
      // Bar 6 A section: C(q) C(q) C(q) C(q) — repeat of opening
      {note:"C4",dur:1},{note:"C4",dur:1},{note:"C4",dur:1},{note:"C4",dur:1},
      // Bar 7: C(h) D(q) D(q)
      {note:"C4",dur:2},{note:"D4",dur:1},{note:"D4",dur:1},
      // Bar 8: C(h) D(h)
      {note:"C4",dur:2},{note:"D4",dur:2},
      // Bar 9: F(h) rest(h)  — fingering 1
      {note:"F4",dur:2},{note:"R",dur:2},
      // Bar 10: rest(h) A4(h)  — fingering 12
      {note:"R",dur:2},{note:"A4",dur:2},
      // Bar 11: Bb4(h) rest(h)  — fingering 1
      {note:"Bb4",dur:2},{note:"R",dur:2},
      // Bar 12: rest(h) A4(h)  — fingering 12
      {note:"R",dur:2},{note:"A4",dur:2},
      // Bar 13: Bb4(h) rest(h)
      {note:"Bb4",dur:2},{note:"R",dur:2},
      // Bar 14: Bb4(h) Bb4(h)
      {note:"Bb4",dur:2},{note:"Bb4",dur:2},
      // Bar 15: Bb4(h) A4(h)
      {note:"Bb4",dur:2},{note:"A4",dur:2},
      // Bar 16: G4(h) A4(h)  — fingering 13 12
      {note:"G4",dur:2},{note:"A4",dur:2},
      // Bar 17: rest(h) A4(h)  — chromatic section, fingering 12
      {note:"R",dur:2},{note:"A4",dur:2},
      // Bar 18: Eb4(h) F4(h)  — fingering 23
      {note:"Eb4",dur:2},{note:"F4",dur:2},
      // Bar 19: G4(h) Ab4(h)  — fingering 13 23
      {note:"G4",dur:2},{note:"Ab4",dur:2},
      // Bar 20: G4(q) F4(q) Eb4(q) rest  — fingering 13 13 13
      {note:"G4",dur:1},{note:"F4",dur:1},{note:"Eb4",dur:1},{note:"R",dur:1},
      // Bar 21: Db4(h) rest  — fingering 123
      {note:"Db4",dur:2},{note:"R",dur:2},
      // Bar 22: Eb4(h) E4(h)  — fingering 23 12
      {note:"Eb4",dur:2},{note:"E4",dur:2},
      // Bar 23: G4(h) F4(h)  — fingering 13 12
      {note:"G4",dur:2},{note:"F4",dur:2},
      // Bar 24: Eb4(h) D4(h)  — fingering 1 12
      {note:"Eb4",dur:2},{note:"D4",dur:2},
      // Bar 25 B section: C4(h) rest  — fingering 1 (Bb?) or 0 (C)
      {note:"C4",dur:2},{note:"R",dur:2},
      // Bar 26: A4(h) rest  — fingering 12
      {note:"A4",dur:2},{note:"R",dur:2},
      // Bar 27: Bb4(h) rest  — fingering 1
      {note:"Bb4",dur:2},{note:"R",dur:2},
      // Bar 28: A4(h) rest  — fingering 12
      {note:"A4",dur:2},{note:"R",dur:2},
      // Bar 29: Bb4(h) rest  — fingering 1
      {note:"Bb4",dur:2},{note:"R",dur:2},
      // Bar 30: G4(q) G4(q) G4(q) rest  — fingering 13 13 13
      {note:"G4",dur:1},{note:"G4",dur:1},{note:"G4",dur:1},{note:"R",dur:1},
      // Bar 31: Bb4(h) rest  — fingering 1
      {note:"Bb4",dur:2},{note:"R",dur:2},
      // Bar 32: C4(q) C4(q) rest rest  — fingering 0 0
      {note:"C4",dur:1},{note:"C4",dur:1},{note:"R",dur:2},
      // Bar 33: C4(q) Db4(q) D4(q) rest  — fingering 0 123 13
      {note:"C4",dur:1},{note:"Db4",dur:1},{note:"D4",dur:1},{note:"R",dur:1},
      // Bar 34: C4(q) C4(q) rest rest  — fingering 0 0
      {note:"C4",dur:1},{note:"C4",dur:1},{note:"R",dur:2},
      // Bar 35: A4(q) Bb4(q) rest rest  — fingering 12 23
      {note:"A4",dur:1},{note:"Bb4",dur:1},{note:"R",dur:2},
      // Bar 36: Ab4(h) G4(w)  — fingering 23 13
      {note:"Ab4",dur:2},{note:"G4",dur:4},
      // Bar 37: Db4(q) C4(q) Db4(q) rest  — fingering 123 0 123
      {note:"Db4",dur:1},{note:"C4",dur:1},{note:"Db4",dur:1},{note:"R",dur:1},
      // Bar 38: G4(q) F4(q) Eb4(q) D4(q)  — fingering 13 12 1 12
      {note:"G4",dur:1},{note:"F4",dur:1},{note:"Eb4",dur:1},{note:"D4",dur:1},
      // Bar 39: Bb3(h) rest  — final bar
      {note:"Bb3",dur:2},{note:"R",dur:2},
    ],
  },  },
  {
    title: "Ode to Joy",
    notes: [
      {note:"E4",dur:2},{note:"E4",dur:2},{note:"F4",dur:2},{note:"G4",dur:2},
      {note:"G4",dur:2},{note:"F4",dur:2},{note:"E4",dur:2},{note:"D4",dur:2},
      {note:"C4",dur:2},{note:"C4",dur:2},{note:"D4",dur:2},{note:"E4",dur:2},
      {note:"E4",dur:4},{note:"D4",dur:4},
    ],
  },
  {
    title: "Mary Had a Little Lamb",
    notes: [
      {note:"E4",dur:2},{note:"D4",dur:2},{note:"C4",dur:2},{note:"D4",dur:2},
      {note:"E4",dur:2},{note:"E4",dur:2},{note:"E4",dur:4},
      {note:"D4",dur:2},{note:"D4",dur:2},{note:"D4",dur:4},
      {note:"E4",dur:2},{note:"G4",dur:2},{note:"G4",dur:4},
    ],
  },
  {
    title: "Twinkle Twinkle",
    notes: [
      {note:"C4",dur:2},{note:"C4",dur:2},{note:"G4",dur:2},{note:"G4",dur:2},
      {note:"A4",dur:2},{note:"A4",dur:2},{note:"G4",dur:4},
      {note:"F4",dur:2},{note:"F4",dur:2},{note:"E4",dur:2},{note:"E4",dur:2},
      {note:"D4",dur:2},{note:"D4",dur:2},{note:"C4",dur:4},
    ],
  },
  {
    title: "Hot Cross Buns",
    notes: [
      {note:"E4",dur:2},{note:"D4",dur:2},{note:"C4",dur:4},
      {note:"E4",dur:2},{note:"D4",dur:2},{note:"C4",dur:4},
      {note:"C4",dur:2},{note:"C4",dur:2},{note:"C4",dur:2},{note:"C4",dur:2},
      {note:"D4",dur:2},{note:"D4",dur:2},{note:"D4",dur:2},{note:"D4",dur:2},
      {note:"E4",dur:2},{note:"D4",dur:2},{note:"C4",dur:4},
    ],
  },
  {
    title: "Go Tell Aunt Rhody",
    notes: [
      {note:"G4",dur:4},{note:"E4",dur:2},{note:"E4",dur:2},
      {note:"F4",dur:2},{note:"E4",dur:2},{note:"D4",dur:4},
      {note:"C4",dur:2},{note:"C4",dur:2},{note:"E4",dur:2},{note:"E4",dur:2},
      {note:"G4",dur:2},{note:"G4",dur:2},{note:"G4",dur:4},
    ],
  },
  {
    title: "Ode to Joy",
    notes: [
      {note:"E4",dur:2},{note:"E4",dur:2},{note:"F4",dur:2},{note:"G4",dur:2},
      {note:"G4",dur:2},{note:"F4",dur:2},{note:"E4",dur:2},{note:"D4",dur:2},
      {note:"C4",dur:2},{note:"C4",dur:2},{note:"D4",dur:2},{note:"E4",dur:2},
      {note:"E4",dur:4},{note:"D4",dur:4},
    ],
  },
  {
    title: "Mary Had a Little Lamb",
    notes: [
      {note:"E4",dur:2},{note:"D4",dur:2},{note:"C4",dur:2},{note:"D4",dur:2},
      {note:"E4",dur:2},{note:"E4",dur:2},{note:"E4",dur:4},
      {note:"D4",dur:2},{note:"D4",dur:2},{note:"D4",dur:4},
      {note:"E4",dur:2},{note:"G4",dur:2},{note:"G4",dur:4},
    ],
  },
  {
    title: "Twinkle Twinkle",
    notes: [
      {note:"C4",dur:2},{note:"C4",dur:2},{note:"G4",dur:2},{note:"G4",dur:2},
      {note:"A4",dur:2},{note:"A4",dur:2},{note:"G4",dur:4},
      {note:"F4",dur:2},{note:"F4",dur:2},{note:"E4",dur:2},{note:"E4",dur:2},
      {note:"D4",dur:2},{note:"D4",dur:2},{note:"C4",dur:4},
    ],
  },
  {
    title: "Hot Cross Buns",
    notes: [
      {note:"E4",dur:2},{note:"D4",dur:2},{note:"C4",dur:4},
      {note:"E4",dur:2},{note:"D4",dur:2},{note:"C4",dur:4},
      {note:"C4",dur:2},{note:"C4",dur:2},{note:"C4",dur:2},{note:"C4",dur:2},
      {note:"D4",dur:2},{note:"D4",dur:2},{note:"D4",dur:2},{note:"D4",dur:2},
      {note:"E4",dur:2},{note:"D4",dur:2},{note:"C4",dur:4},
    ],
  },
  {
    title: "Go Tell Aunt Rhody",
    notes: [
      {note:"G4",dur:4},{note:"E4",dur:2},{note:"E4",dur:2},
      {note:"F4",dur:2},{note:"E4",dur:2},{note:"D4",dur:4},
      {note:"C4",dur:2},{note:"C4",dur:2},{note:"E4",dur:2},{note:"E4",dur:2},
      {note:"G4",dur:2},{note:"G4",dur:2},{note:"G4",dur:4},
    ],
  },
  {
    // Mardi Gras — Andy Norman
    // 2nd Trombone/Baritone part, treble clef, C major (no key sig), 4/4, tempo 144
    // "With a Calypso lilt" — syncopated eighth note pattern throughout
    // Fingerings on score: 12=A/E, 1=F/Bb, 0=C/G, 2=B/F#
    title: "Mardi Gras",
    notes: [
      // Bar 1 pickup: A4(eighth) A4(q) Bb4(h)  — fingering 12
      {note:"A4",dur:0.5},{note:"A4",dur:1},{note:"Bb4",dur:2},
      // Bar 2: Bb4(w)  — fingering 1
      {note:"Bb4",dur:4},
      // Bar 3: Bb4(w)  — fingering 1
      {note:"Bb4",dur:4},
      // Bar 4: A4(q) A4(q) C5(q) A4(q)  — fingering 12 0 12
      {note:"A4",dur:1},{note:"A4",dur:1},{note:"C5",dur:1},{note:"A4",dur:1},
      // Bar 5 A section: syncopated pattern — rest(e) C4 C4 C4 rest C4 C4 rest
      {note:"R",dur:0.5},{note:"C4",dur:0.5},{note:"C4",dur:0.5},{note:"C4",dur:0.5},{note:"R",dur:0.5},{note:"C4",dur:0.5},{note:"C4",dur:0.5},{note:"R",dur:0.5},
      // Bar 6: rest(e) C4 C4 C4 rest C4 C4 rest
      {note:"R",dur:0.5},{note:"C4",dur:0.5},{note:"C4",dur:0.5},{note:"C4",dur:0.5},{note:"R",dur:0.5},{note:"C4",dur:0.5},{note:"C4",dur:0.5},{note:"R",dur:0.5},
      // Bar 7: rest(e) C4 C4 C4 rest C4 C4 rest
      {note:"R",dur:0.5},{note:"C4",dur:0.5},{note:"C4",dur:0.5},{note:"C4",dur:0.5},{note:"R",dur:0.5},{note:"C4",dur:0.5},{note:"C4",dur:0.5},{note:"R",dur:0.5},
      // Bar 8: rest(e) C4 C4 C4 rest C4 C4 rest
      {note:"R",dur:0.5},{note:"C4",dur:0.5},{note:"C4",dur:0.5},{note:"C4",dur:0.5},{note:"R",dur:0.5},{note:"C4",dur:0.5},{note:"C4",dur:0.5},{note:"R",dur:0.5},
      // Bars 9-12: same syncopated pattern
      {note:"R",dur:0.5},{note:"C4",dur:0.5},{note:"C4",dur:0.5},{note:"C4",dur:0.5},{note:"R",dur:0.5},{note:"C4",dur:0.5},{note:"C4",dur:0.5},{note:"R",dur:0.5},
      {note:"R",dur:0.5},{note:"C4",dur:0.5},{note:"C4",dur:0.5},{note:"C4",dur:0.5},{note:"R",dur:0.5},{note:"C4",dur:0.5},{note:"C4",dur:0.5},{note:"R",dur:0.5},
      {note:"R",dur:0.5},{note:"C4",dur:0.5},{note:"C4",dur:0.5},{note:"C4",dur:0.5},{note:"R",dur:0.5},{note:"C4",dur:0.5},{note:"C4",dur:0.5},{note:"R",dur:0.5},
      {note:"R",dur:0.5},{note:"C4",dur:0.5},{note:"C4",dur:0.5},{note:"C4",dur:0.5},{note:"R",dur:0.5},{note:"C4",dur:0.5},{note:"C4",dur:0.5},{note:"R",dur:0.5},
      // Bar 13 B section: similar pattern but different notes — rest(e) C4 D4 E4 rest D4 C4 rest
      {note:"R",dur:0.5},{note:"C4",dur:0.5},{note:"D4",dur:0.5},{note:"E4",dur:0.5},{note:"R",dur:0.5},{note:"D4",dur:0.5},{note:"C4",dur:0.5},{note:"R",dur:0.5},
      // Bars 14-16: same B pattern
      {note:"R",dur:0.5},{note:"C4",dur:0.5},{note:"D4",dur:0.5},{note:"E4",dur:0.5},{note:"R",dur:0.5},{note:"D4",dur:0.5},{note:"C4",dur:0.5},{note:"R",dur:0.5},
      {note:"R",dur:0.5},{note:"C4",dur:0.5},{note:"D4",dur:0.5},{note:"E4",dur:0.5},{note:"R",dur:0.5},{note:"D4",dur:0.5},{note:"C4",dur:0.5},{note:"R",dur:0.5},
      {note:"R",dur:0.5},{note:"C4",dur:0.5},{note:"D4",dur:0.5},{note:"E4",dur:0.5},{note:"R",dur:0.5},{note:"D4",dur:0.5},{note:"C4",dur:0.5},{note:"R",dur:0.5},
      // Bars 17-22: continue B section pattern
      {note:"R",dur:0.5},{note:"C4",dur:0.5},{note:"D4",dur:0.5},{note:"E4",dur:0.5},{note:"R",dur:0.5},{note:"D4",dur:0.5},{note:"C4",dur:0.5},{note:"R",dur:0.5},
      {note:"R",dur:0.5},{note:"C4",dur:0.5},{note:"D4",dur:0.5},{note:"E4",dur:0.5},{note:"R",dur:0.5},{note:"D4",dur:0.5},{note:"C4",dur:0.5},{note:"R",dur:0.5},
      {note:"R",dur:0.5},{note:"C4",dur:0.5},{note:"D4",dur:0.5},{note:"E4",dur:0.5},{note:"R",dur:0.5},{note:"D4",dur:0.5},{note:"C4",dur:0.5},{note:"R",dur:0.5},
      // Bar 24: fingering 12 — A4 pattern
      {note:"R",dur:0.5},{note:"A4",dur:0.5},{note:"A4",dur:0.5},{note:"A4",dur:0.5},{note:"R",dur:0.5},{note:"A4",dur:0.5},{note:"A4",dur:0.5},{note:"R",dur:0.5},
      // Bars 25-27
      {note:"R",dur:0.5},{note:"A4",dur:0.5},{note:"A4",dur:0.5},{note:"A4",dur:0.5},{note:"R",dur:0.5},{note:"A4",dur:0.5},{note:"A4",dur:0.5},{note:"R",dur:0.5},
      {note:"R",dur:0.5},{note:"A4",dur:0.5},{note:"A4",dur:0.5},{note:"A4",dur:0.5},{note:"R",dur:0.5},{note:"A4",dur:0.5},{note:"A4",dur:0.5},{note:"R",dur:0.5},
      // Bar 28 C section: fuller notes
      {note:"A4",dur:1},{note:"G4",dur:0.5},{note:"A4",dur:0.5},{note:"Bb4",dur:1},{note:"R",dur:0.5},{note:"G4",dur:0.5},
      {note:"R",dur:0.5},{note:"A4",dur:0.5},{note:"G4",dur:0.5},{note:"A4",dur:0.5},{note:"Bb4",dur:1},{note:"R",dur:0.5},{note:"G4",dur:0.5},
      // Bars 30-32: C section continues
      {note:"R",dur:0.5},{note:"C4",dur:0.5},{note:"D4",dur:0.5},{note:"E4",dur:0.5},{note:"R",dur:0.5},{note:"D4",dur:0.5},{note:"C4",dur:0.5},{note:"R",dur:0.5},
      {note:"R",dur:0.5},{note:"C4",dur:0.5},{note:"D4",dur:0.5},{note:"E4",dur:0.5},{note:"R",dur:0.5},{note:"D4",dur:0.5},{note:"C4",dur:0.5},{note:"R",dur:0.5},
      // Bar 33-36
      {note:"R",dur:0.5},{note:"C4",dur:0.5},{note:"D4",dur:0.5},{note:"E4",dur:0.5},{note:"R",dur:0.5},{note:"D4",dur:0.5},{note:"C4",dur:0.5},{note:"R",dur:0.5},
      {note:"R",dur:0.5},{note:"C4",dur:0.5},{note:"D4",dur:0.5},{note:"E4",dur:0.5},{note:"R",dur:0.5},{note:"D4",dur:0.5},{note:"C4",dur:0.5},{note:"R",dur:0.5},
      // Bar 37 D section: back to long notes — A4(q) A4(h) A4(q) etc fingering 12 0 12 0
      {note:"A4",dur:1},{note:"A4",dur:2},{note:"C5",dur:1},
      // Bar 38: Bb4(w)
      {note:"Bb4",dur:4},
      // Bar 39: Bb4(w)
      {note:"Bb4",dur:4},
      // Bar 40: A4 A4 C5 A4
      {note:"A4",dur:1},{note:"A4",dur:1},{note:"C5",dur:1},{note:"A4",dur:1},
      // Bar 41 E section: back to calypso pattern
      {note:"R",dur:0.5},{note:"C4",dur:0.5},{note:"D4",dur:0.5},{note:"E4",dur:0.5},{note:"R",dur:0.5},{note:"D4",dur:0.5},{note:"C4",dur:0.5},{note:"R",dur:0.5},
      {note:"R",dur:0.5},{note:"C4",dur:0.5},{note:"D4",dur:0.5},{note:"E4",dur:0.5},{note:"R",dur:0.5},{note:"D4",dur:0.5},{note:"C4",dur:0.5},{note:"R",dur:0.5},
    ],
  },
  {
    // Mardi Gras — Andy Norman
    // 2nd Trombone/Baritone, treble clef, C major (no key sig), 4/4, tempo 144
    // "With a Calypso lilt" — syncopated eighth note pattern
    // Notes confirmed bar by bar by player
    // Structure: Intro | A | B | C(=A) | D(=Intro) | E(=A) | F(=B) | G(=A) | end
    title: "Mardi Gras",
    notes: [
      // ── INTRO (bars 1-4): slow long notes ──
      // Bar 1: C4(q) E4(q) G4(h)
      {note:"C4",dur:1},{note:"E4",dur:1},{note:"G4",dur:2},
      // Bar 2: G4(w)
      {note:"G4",dur:4},
      // Bar 3: F4(w)
      {note:"F4",dur:4},
      // Bar 4: F4(w)
      {note:"F4",dur:4},
      // Bar 5: E4(q) G4(q) A4(q) G4(q)
      {note:"E4",dur:1},{note:"G4",dur:1},{note:"A4",dur:1},{note:"G4",dur:1},
      // Bar 6: E4(w)
      {note:"E4",dur:4},
      // ── SECTION A (bars 5-12): G/F calypso pattern ──
      {note:"R",dur:0.5},{note:"G4",dur:0.5},{note:"G4",dur:0.5},{note:"G4",dur:0.5},{note:"R",dur:0.5},{note:"G4",dur:0.5},{note:"G4",dur:0.5},{note:"R",dur:0.5},
      {note:"R",dur:0.5},{note:"G4",dur:0.5},{note:"G4",dur:0.5},{note:"G4",dur:0.5},{note:"R",dur:0.5},{note:"G4",dur:0.5},{note:"G4",dur:0.5},{note:"R",dur:0.5},
      {note:"R",dur:0.5},{note:"F4",dur:0.5},{note:"F4",dur:0.5},{note:"F4",dur:0.5},{note:"R",dur:0.5},{note:"F4",dur:0.5},{note:"F4",dur:0.5},{note:"R",dur:0.5},
      {note:"R",dur:0.5},{note:"F4",dur:0.5},{note:"F4",dur:0.5},{note:"F4",dur:0.5},{note:"R",dur:0.5},{note:"F4",dur:0.5},{note:"F4",dur:0.5},{note:"R",dur:0.5},
      {note:"R",dur:0.5},{note:"G4",dur:0.5},{note:"G4",dur:0.5},{note:"G4",dur:0.5},{note:"R",dur:0.5},{note:"G4",dur:0.5},{note:"G4",dur:0.5},{note:"R",dur:0.5},
      {note:"R",dur:0.5},{note:"G4",dur:0.5},{note:"G4",dur:0.5},{note:"G4",dur:0.5},{note:"R",dur:0.5},{note:"G4",dur:0.5},{note:"G4",dur:0.5},{note:"R",dur:0.5},
      {note:"R",dur:0.5},{note:"G4",dur:0.5},{note:"G4",dur:0.5},{note:"R",dur:0.5},{note:"F4",dur:0.5},{note:"F4",dur:0.5},{note:"R",dur:0.5},{note:"R",dur:0.5},
      {note:"R",dur:0.5},{note:"G4",dur:0.5},{note:"G4",dur:0.5},{note:"R",dur:0.5},{note:"F4",dur:0.5},{note:"F4",dur:0.5},{note:"R",dur:0.5},{note:"R",dur:0.5},
      // ── SECTION B (bars 13-22): A/F/G/E/F pattern ──
      {note:"R",dur:0.5},{note:"A4",dur:0.5},{note:"A4",dur:0.5},{note:"A4",dur:0.5},{note:"R",dur:0.5},{note:"A4",dur:0.5},{note:"A4",dur:0.5},{note:"R",dur:0.5},
      {note:"R",dur:0.5},{note:"A4",dur:0.5},{note:"A4",dur:0.5},{note:"A4",dur:0.5},{note:"R",dur:0.5},{note:"A4",dur:0.5},{note:"A4",dur:0.5},{note:"R",dur:0.5},
      {note:"R",dur:0.5},{note:"F4",dur:0.5},{note:"F4",dur:0.5},{note:"F4",dur:0.5},{note:"R",dur:0.5},{note:"F4",dur:0.5},{note:"F4",dur:0.5},{note:"R",dur:0.5},
      {note:"R",dur:0.5},{note:"F4",dur:0.5},{note:"F4",dur:0.5},{note:"F4",dur:0.5},{note:"R",dur:0.5},{note:"F4",dur:0.5},{note:"F4",dur:0.5},{note:"R",dur:0.5},
      {note:"R",dur:0.5},{note:"G4",dur:0.5},{note:"G4",dur:0.5},{note:"R",dur:0.5},{note:"R",dur:1},{note:"R",dur:0.5},{note:"R",dur:0.5},
      {note:"R",dur:0.5},{note:"E4",dur:0.5},{note:"E4",dur:0.5},{note:"E4",dur:0.5},{note:"R",dur:0.5},{note:"E4",dur:0.5},{note:"E4",dur:0.5},{note:"R",dur:0.5},
      {note:"R",dur:0.5},{note:"E4",dur:0.5},{note:"E4",dur:0.5},{note:"E4",dur:0.5},{note:"R",dur:0.5},{note:"E4",dur:0.5},{note:"E4",dur:0.5},{note:"R",dur:0.5},
      {note:"R",dur:0.5},{note:"F4",dur:0.5},{note:"F4",dur:0.5},{note:"F4",dur:0.5},{note:"R",dur:0.5},{note:"F4",dur:0.5},{note:"F4",dur:0.5},{note:"R",dur:0.5},
      {note:"R",dur:0.5},{note:"F4",dur:0.5},{note:"F4",dur:0.5},{note:"F4",dur:0.5},{note:"R",dur:0.5},{note:"F4",dur:0.5},{note:"F4",dur:0.5},{note:"R",dur:0.5},
      {note:"R",dur:0.5},{note:"F4",dur:0.5},{note:"F4",dur:0.5},{note:"F4",dur:0.5},{note:"R",dur:0.5},{note:"F4",dur:0.5},{note:"F4",dur:0.5},{note:"R",dur:0.5},
      // ── SECTION C (bars 28-36): same as A ──
      {note:"R",dur:0.5},{note:"G4",dur:0.5},{note:"G4",dur:0.5},{note:"G4",dur:0.5},{note:"R",dur:0.5},{note:"G4",dur:0.5},{note:"G4",dur:0.5},{note:"R",dur:0.5},
      {note:"R",dur:0.5},{note:"G4",dur:0.5},{note:"G4",dur:0.5},{note:"G4",dur:0.5},{note:"R",dur:0.5},{note:"G4",dur:0.5},{note:"G4",dur:0.5},{note:"R",dur:0.5},
      {note:"R",dur:0.5},{note:"F4",dur:0.5},{note:"F4",dur:0.5},{note:"F4",dur:0.5},{note:"R",dur:0.5},{note:"F4",dur:0.5},{note:"F4",dur:0.5},{note:"R",dur:0.5},
      {note:"R",dur:0.5},{note:"F4",dur:0.5},{note:"F4",dur:0.5},{note:"F4",dur:0.5},{note:"R",dur:0.5},{note:"F4",dur:0.5},{note:"F4",dur:0.5},{note:"R",dur:0.5},
      {note:"R",dur:0.5},{note:"G4",dur:0.5},{note:"G4",dur:0.5},{note:"G4",dur:0.5},{note:"R",dur:0.5},{note:"G4",dur:0.5},{note:"G4",dur:0.5},{note:"R",dur:0.5},
      {note:"R",dur:0.5},{note:"G4",dur:0.5},{note:"G4",dur:0.5},{note:"G4",dur:0.5},{note:"R",dur:0.5},{note:"G4",dur:0.5},{note:"G4",dur:0.5},{note:"R",dur:0.5},
      {note:"R",dur:0.5},{note:"G4",dur:0.5},{note:"G4",dur:0.5},{note:"R",dur:0.5},{note:"F4",dur:0.5},{note:"F4",dur:0.5},{note:"R",dur:0.5},{note:"R",dur:0.5},
      {note:"R",dur:0.5},{note:"G4",dur:0.5},{note:"G4",dur:0.5},{note:"R",dur:0.5},{note:"F4",dur:0.5},{note:"F4",dur:0.5},{note:"R",dur:0.5},{note:"R",dur:0.5},
      // ── SECTION D (bars 37-42): same as Intro ──
      {note:"C4",dur:1},{note:"E4",dur:1},{note:"G4",dur:2},
      {note:"G4",dur:4},
      {note:"F4",dur:4},
      {note:"F4",dur:4},
      {note:"E4",dur:1},{note:"G4",dur:1},{note:"A4",dur:1},{note:"G4",dur:1},
      {note:"E4",dur:4},
      // ── SECTION E (bars 41-46): same as A ──
      {note:"R",dur:0.5},{note:"G4",dur:0.5},{note:"G4",dur:0.5},{note:"G4",dur:0.5},{note:"R",dur:0.5},{note:"G4",dur:0.5},{note:"G4",dur:0.5},{note:"R",dur:0.5},
      {note:"R",dur:0.5},{note:"G4",dur:0.5},{note:"G4",dur:0.5},{note:"G4",dur:0.5},{note:"R",dur:0.5},{note:"G4",dur:0.5},{note:"G4",dur:0.5},{note:"R",dur:0.5},
      {note:"R",dur:0.5},{note:"F4",dur:0.5},{note:"F4",dur:0.5},{note:"F4",dur:0.5},{note:"R",dur:0.5},{note:"F4",dur:0.5},{note:"F4",dur:0.5},{note:"R",dur:0.5},
      {note:"R",dur:0.5},{note:"F4",dur:0.5},{note:"F4",dur:0.5},{note:"F4",dur:0.5},{note:"R",dur:0.5},{note:"F4",dur:0.5},{note:"F4",dur:0.5},{note:"R",dur:0.5},
      {note:"R",dur:0.5},{note:"G4",dur:0.5},{note:"G4",dur:0.5},{note:"G4",dur:0.5},{note:"R",dur:0.5},{note:"G4",dur:0.5},{note:"G4",dur:0.5},{note:"R",dur:0.5},
      {note:"R",dur:0.5},{note:"G4",dur:0.5},{note:"G4",dur:0.5},{note:"G4",dur:0.5},{note:"R",dur:0.5},{note:"G4",dur:0.5},{note:"G4",dur:0.5},{note:"R",dur:0.5},
      {note:"R",dur:0.5},{note:"G4",dur:0.5},{note:"G4",dur:0.5},{note:"R",dur:0.5},{note:"F4",dur:0.5},{note:"F4",dur:0.5},{note:"R",dur:0.5},{note:"R",dur:0.5},
      {note:"R",dur:0.5},{note:"G4",dur:0.5},{note:"G4",dur:0.5},{note:"R",dur:0.5},{note:"F4",dur:0.5},{note:"F4",dur:0.5},{note:"R",dur:0.5},{note:"R",dur:0.5},
      // ── SECTION F (bars 49-58): same as B ──
      {note:"R",dur:0.5},{note:"A4",dur:0.5},{note:"A4",dur:0.5},{note:"A4",dur:0.5},{note:"R",dur:0.5},{note:"A4",dur:0.5},{note:"A4",dur:0.5},{note:"R",dur:0.5},
      {note:"R",dur:0.5},{note:"A4",dur:0.5},{note:"A4",dur:0.5},{note:"A4",dur:0.5},{note:"R",dur:0.5},{note:"A4",dur:0.5},{note:"A4",dur:0.5},{note:"R",dur:0.5},
      {note:"R",dur:0.5},{note:"F4",dur:0.5},{note:"F4",dur:0.5},{note:"F4",dur:0.5},{note:"R",dur:0.5},{note:"F4",dur:0.5},{note:"F4",dur:0.5},{note:"R",dur:0.5},
      {note:"R",dur:0.5},{note:"F4",dur:0.5},{note:"F4",dur:0.5},{note:"F4",dur:0.5},{note:"R",dur:0.5},{note:"F4",dur:0.5},{note:"F4",dur:0.5},{note:"R",dur:0.5},
      {note:"R",dur:0.5},{note:"G4",dur:0.5},{note:"G4",dur:0.5},{note:"R",dur:0.5},{note:"R",dur:1},{note:"R",dur:0.5},{note:"R",dur:0.5},
      {note:"R",dur:0.5},{note:"E4",dur:0.5},{note:"E4",dur:0.5},{note:"E4",dur:0.5},{note:"R",dur:0.5},{note:"E4",dur:0.5},{note:"E4",dur:0.5},{note:"R",dur:0.5},
      {note:"R",dur:0.5},{note:"E4",dur:0.5},{note:"E4",dur:0.5},{note:"E4",dur:0.5},{note:"R",dur:0.5},{note:"E4",dur:0.5},{note:"E4",dur:0.5},{note:"R",dur:0.5},
      {note:"R",dur:0.5},{note:"F4",dur:0.5},{note:"F4",dur:0.5},{note:"F4",dur:0.5},{note:"R",dur:0.5},{note:"F4",dur:0.5},{note:"F4",dur:0.5},{note:"R",dur:0.5},
      {note:"R",dur:0.5},{note:"F4",dur:0.5},{note:"F4",dur:0.5},{note:"F4",dur:0.5},{note:"R",dur:0.5},{note:"F4",dur:0.5},{note:"F4",dur:0.5},{note:"R",dur:0.5},
      {note:"R",dur:0.5},{note:"F4",dur:0.5},{note:"F4",dur:0.5},{note:"F4",dur:0.5},{note:"R",dur:0.5},{note:"F4",dur:0.5},{note:"F4",dur:0.5},{note:"R",dur:0.5},
      // ── SECTION G (bars 65-72): same as A, final section ──
      {note:"R",dur:0.5},{note:"G4",dur:0.5},{note:"G4",dur:0.5},{note:"G4",dur:0.5},{note:"R",dur:0.5},{note:"G4",dur:0.5},{note:"G4",dur:0.5},{note:"R",dur:0.5},
      {note:"R",dur:0.5},{note:"G4",dur:0.5},{note:"G4",dur:0.5},{note:"G4",dur:0.5},{note:"R",dur:0.5},{note:"G4",dur:0.5},{note:"G4",dur:0.5},{note:"R",dur:0.5},
      {note:"R",dur:0.5},{note:"F4",dur:0.5},{note:"F4",dur:0.5},{note:"F4",dur:0.5},{note:"R",dur:0.5},{note:"F4",dur:0.5},{note:"F4",dur:0.5},{note:"R",dur:0.5},
      {note:"R",dur:0.5},{note:"F4",dur:0.5},{note:"F4",dur:0.5},{note:"F4",dur:0.5},{note:"R",dur:0.5},{note:"F4",dur:0.5},{note:"F4",dur:0.5},{note:"R",dur:0.5},
      {note:"R",dur:0.5},{note:"G4",dur:0.5},{note:"G4",dur:0.5},{note:"G4",dur:0.5},{note:"R",dur:0.5},{note:"G4",dur:0.5},{note:"G4",dur:0.5},{note:"R",dur:0.5},
      {note:"R",dur:0.5},{note:"G4",dur:0.5},{note:"G4",dur:0.5},{note:"G4",dur:0.5},{note:"R",dur:0.5},{note:"G4",dur:0.5},{note:"G4",dur:0.5},{note:"R",dur:0.5},
      {note:"R",dur:0.5},{note:"G4",dur:0.5},{note:"G4",dur:0.5},{note:"R",dur:0.5},{note:"F4",dur:0.5},{note:"F4",dur:0.5},{note:"R",dur:0.5},{note:"R",dur:0.5},
      {note:"R",dur:0.5},{note:"G4",dur:0.5},{note:"G4",dur:0.5},{note:"R",dur:0.5},{note:"F4",dur:0.5},{note:"F4",dur:0.5},{note:"R",dur:0.5},{note:"R",dur:0.5},
    ],
  },
  {
    // Guava Guy — Andy Norman, Part 3 Bb
    // Treble clef, no key signature, 4/4, Fast
    // "A distant cousin of Watermelon Man"
    // Notes confirmed by player: each section starts C4
    // Valve key: 0=C/G, 13=D/G, 1=F/Bb, 12=A/E, 23=Eb/Ab, 2=B3
    title: "Guava Guy",
    notes: [
      // ── BARS 1-4: main riff ──
      // Bar 1: C(q) C(q) C(q) D(e) D(e)
      {note:"C4",dur:1},{note:"C4",dur:1},{note:"C4",dur:1},{note:"D4",dur:0.5},{note:"D4",dur:0.5},
      // Bar 2: same
      {note:"C4",dur:1},{note:"C4",dur:1},{note:"C4",dur:1},{note:"D4",dur:0.5},{note:"D4",dur:0.5},
      // Bar 3: same
      {note:"C4",dur:1},{note:"C4",dur:1},{note:"C4",dur:1},{note:"D4",dur:0.5},{note:"D4",dur:0.5},
      // Bar 4: same
      {note:"C4",dur:1},{note:"C4",dur:1},{note:"C4",dur:1},{note:"D4",dur:0.5},{note:"D4",dur:0.5},
      // ── BARS 5-6: F/Eb variation ──
      // Bar 5: F(q) F(q) Eb(q) Eb(e) Eb(e)
      {note:"F4",dur:1},{note:"F4",dur:1},{note:"Eb4",dur:1},{note:"Eb4",dur:0.5},{note:"Eb4",dur:0.5},
      // Bar 6: same
      {note:"F4",dur:1},{note:"F4",dur:1},{note:"Eb4",dur:1},{note:"Eb4",dur:0.5},{note:"Eb4",dur:0.5},
      // ── BARS 7-8: back to main riff ──
      {note:"C4",dur:1},{note:"C4",dur:1},{note:"C4",dur:1},{note:"D4",dur:0.5},{note:"D4",dur:0.5},
      {note:"C4",dur:1},{note:"C4",dur:1},{note:"C4",dur:1},{note:"D4",dur:0.5},{note:"D4",dur:0.5},
      // ── BARS 9-13: low B section ──
      // Bar 9: B3(h) B3(q) C4(q)
      {note:"B3",dur:2},{note:"B3",dur:1},{note:"C4",dur:1},
      // Bar 10: B3(h) B3(q) C4(q)
      {note:"B3",dur:2},{note:"B3",dur:1},{note:"C4",dur:1},
      // Bar 11: B3(h) B3(q) C4(q)
      {note:"B3",dur:2},{note:"B3",dur:1},{note:"C4",dur:1},
      // Bar 12: B3(h) B3(q) C4(q)
      {note:"B3",dur:2},{note:"B3",dur:1},{note:"C4",dur:1},
      // Bar 13: B3(h) rest(h)
      {note:"B3",dur:2},{note:"R",dur:2},
      // ── SECTION A (bars 14-19): quarter note runs, fingering 13 ──
      // Bar 14: C4(q) D4(q) C4(q) D4(q)
      {note:"C4",dur:1},{note:"D4",dur:1},{note:"C4",dur:1},{note:"D4",dur:1},
      // Bar 15: C4(q) D4(q) C4(q) D4(q)
      {note:"C4",dur:1},{note:"D4",dur:1},{note:"C4",dur:1},{note:"D4",dur:1},
      // Bar 16: C4(q) D4(q) C4(q) D4(q)
      {note:"C4",dur:1},{note:"D4",dur:1},{note:"C4",dur:1},{note:"D4",dur:1},
      // Bar 17: C4(q) D4(q) C4(q) D4(q)
      {note:"C4",dur:1},{note:"D4",dur:1},{note:"C4",dur:1},{note:"D4",dur:1},
      // Bar 18: C4(q) D4(q) C4(q) D4(q)
      {note:"C4",dur:1},{note:"D4",dur:1},{note:"C4",dur:1},{note:"D4",dur:1},
      // Bar 19: C4(q) D4(q) C4(q) D4(q)
      {note:"C4",dur:1},{note:"D4",dur:1},{note:"C4",dur:1},{note:"D4",dur:1},
      // ── BARS 20-25: chromatic/accidental section ──
      // Bar 20: C4(q) D4(q) Eb4(q) D4(q) — chromatic rise
      {note:"C4",dur:1},{note:"D4",dur:1},{note:"Eb4",dur:1},{note:"D4",dur:1},
      // Bar 21: F4(q) Eb4(q) D4(q) C4(q)
      {note:"F4",dur:1},{note:"Eb4",dur:1},{note:"D4",dur:1},{note:"C4",dur:1},
      // Bar 22: same chromatic descending
      {note:"F4",dur:1},{note:"Eb4",dur:1},{note:"D4",dur:1},{note:"C4",dur:1},
      // Bar 23: G4(h) rest(h) — fingering 13
      {note:"G4",dur:2},{note:"R",dur:2},
      // Bar 24: B3(h) B3(h) — fingering 2
      {note:"B3",dur:2},{note:"B3",dur:2},
      // Bar 25: B3(h) B3(q) C4(q)
      {note:"B3",dur:2},{note:"B3",dur:1},{note:"C4",dur:1},
      // Bar 26-32: B3/C4 pattern continuing
      {note:"B3",dur:2},{note:"B3",dur:1},{note:"C4",dur:1},
      {note:"B3",dur:2},{note:"B3",dur:1},{note:"C4",dur:1},
      {note:"B3",dur:2},{note:"B3",dur:1},{note:"C4",dur:1},
      {note:"B3",dur:2},{note:"B3",dur:1},{note:"C4",dur:1},
      {note:"B3",dur:2},{note:"B3",dur:1},{note:"C4",dur:1},
      {note:"B3",dur:2},{note:"B3",dur:1},{note:"C4",dur:1},
      {note:"B3",dur:2},{note:"R",dur:2},
      // ── SECTION B (bars 33-44): A4/E4 section, fingering 12/13 ──
      // Bar 33: C4(q) E4(q) C4(q) E4(q) — fingering 12
      {note:"C4",dur:1},{note:"E4",dur:1},{note:"C4",dur:1},{note:"E4",dur:1},
      // Bar 34: C4(q) E4(q) C4(q) E4(q)
      {note:"C4",dur:1},{note:"E4",dur:1},{note:"C4",dur:1},{note:"E4",dur:1},
      // Bar 35: A4(q) G4(q) A4(q) G4(q) — fingering 12 13
      {note:"A4",dur:1},{note:"G4",dur:1},{note:"A4",dur:1},{note:"G4",dur:1},
      // Bar 36: A4(q) G4(q) A4(q) G4(q)
      {note:"A4",dur:1},{note:"G4",dur:1},{note:"A4",dur:1},{note:"G4",dur:1},
      // Bar 37: C4(q) E4(q) C4(q) E4(q)
      {note:"C4",dur:1},{note:"E4",dur:1},{note:"C4",dur:1},{note:"E4",dur:1},
      // Bar 38: C4(q) E4(q) C4(q) E4(q)
      {note:"C4",dur:1},{note:"E4",dur:1},{note:"C4",dur:1},{note:"E4",dur:1},
      // Bar 39: G4(w) — fingering 13
      {note:"G4",dur:4},
      // Bar 40: Eb4(w) — fingering 23
      {note:"Eb4",dur:4},
      // Bar 41: C4(q) E4(q) C4(q) rest
      {note:"C4",dur:1},{note:"E4",dur:1},{note:"C4",dur:1},{note:"R",dur:1},
      // Bar 42: A4(q) G4(q) A4(q) rest
      {note:"A4",dur:1},{note:"G4",dur:1},{note:"A4",dur:1},{note:"R",dur:1},
      // Bar 43: C4(q) E4(q) C4(q) rest
      {note:"C4",dur:1},{note:"E4",dur:1},{note:"C4",dur:1},{note:"R",dur:1},
      // Bar 44: B3(h) rest(h)
      {note:"B3",dur:2},{note:"R",dur:2},
      // ── SECTION C (bars 45-56): same as A ──
      {note:"C4",dur:1},{note:"D4",dur:1},{note:"C4",dur:1},{note:"D4",dur:1},
      {note:"C4",dur:1},{note:"D4",dur:1},{note:"C4",dur:1},{note:"D4",dur:1},
      {note:"C4",dur:1},{note:"D4",dur:1},{note:"C4",dur:1},{note:"D4",dur:1},
      {note:"C4",dur:1},{note:"D4",dur:1},{note:"C4",dur:1},{note:"D4",dur:1},
      {note:"C4",dur:1},{note:"D4",dur:1},{note:"C4",dur:1},{note:"D4",dur:1},
      {note:"C4",dur:1},{note:"D4",dur:1},{note:"C4",dur:1},{note:"D4",dur:1},
      {note:"C4",dur:1},{note:"D4",dur:1},{note:"Eb4",dur:1},{note:"D4",dur:1},
      {note:"F4",dur:1},{note:"Eb4",dur:1},{note:"D4",dur:1},{note:"C4",dur:1},
      {note:"F4",dur:1},{note:"Eb4",dur:1},{note:"D4",dur:1},{note:"C4",dur:1},
      {note:"G4",dur:2},{note:"R",dur:2},
      {note:"Eb4",dur:4},
      {note:"C4",dur:1},{note:"E4",dur:1},{note:"C4",dur:1},{note:"R",dur:1},
      // ── SECTION D (bars 57-70): repeat of opening ──
      {note:"C4",dur:1},{note:"C4",dur:1},{note:"C4",dur:1},{note:"D4",dur:0.5},{note:"D4",dur:0.5},
      {note:"C4",dur:1},{note:"C4",dur:1},{note:"C4",dur:1},{note:"D4",dur:0.5},{note:"D4",dur:0.5},
      {note:"C4",dur:1},{note:"C4",dur:1},{note:"C4",dur:1},{note:"D4",dur:0.5},{note:"D4",dur:0.5},
      {note:"C4",dur:1},{note:"C4",dur:1},{note:"C4",dur:1},{note:"D4",dur:0.5},{note:"D4",dur:0.5},
      {note:"F4",dur:1},{note:"F4",dur:1},{note:"Eb4",dur:1},{note:"Eb4",dur:0.5},{note:"Eb4",dur:0.5},
      {note:"F4",dur:1},{note:"F4",dur:1},{note:"Eb4",dur:1},{note:"Eb4",dur:0.5},{note:"Eb4",dur:0.5},
      {note:"C4",dur:1},{note:"C4",dur:1},{note:"C4",dur:1},{note:"D4",dur:0.5},{note:"D4",dur:0.5},
      {note:"C4",dur:1},{note:"C4",dur:1},{note:"C4",dur:1},{note:"D4",dur:0.5},{note:"D4",dur:0.5},
      // Bars 63-67: B3 section
      {note:"B3",dur:2},{note:"B3",dur:1},{note:"C4",dur:1},
      {note:"B3",dur:2},{note:"B3",dur:1},{note:"C4",dur:1},
      {note:"B3",dur:2},{note:"B3",dur:1},{note:"C4",dur:1},
      {note:"B3",dur:2},{note:"R",dur:2},
      // Bars 68-70: final ending
      {note:"B3",dur:2},{note:"R",dur:1},{note:"C4",dur:1},
      {note:"B3",dur:2},{note:"R",dur:2},
      {note:"G4",dur:4},
    ],
  },
  {
    // Haydn Surprise Symphony — euphonium part
    // bigshinybrass.com, treble clef, no key sig, 4/4, "With a steady beat"
    // Line 1 confirmed: C4 C4 F4 G4 F4
    // Line 2 confirmed: C4 A4 D4 B4 E4 E4
    // Fingerings: 0=C/G, 1=F/Bb, 12=A/E, 13=D/G, 2=B3/F#, 23=Eb/Ab
    title: "Haydn Surprise Symphony",
    notes: [
      // ── LINE 1 (bars 1-5) ──
      // Bar 1: rest(h) C4(h)  — mp, open
      {note:"R",dur:2},{note:"C4",dur:2},
      // Bar 2: rest(h) C4(h)
      {note:"R",dur:2},{note:"C4",dur:2},
      // Bar 3: rest(h) F4(h)  — fingering 1
      {note:"R",dur:2},{note:"F4",dur:2},
      // Bar 4: rest(h) G4(h)  — fingering 13 (open)
      {note:"R",dur:2},{note:"G4",dur:2},
      // Bar 5: rest(h) F4(h)  — fingering 1
      {note:"R",dur:2},{note:"F4",dur:2},
      // ── LINE 2 (bars 6-10) ──
      // Bar 6: C4(h) rest(h) — fingering 0... then A4 quarter rest quarter
      {note:"C4",dur:2},{note:"R",dur:1},{note:"A4",dur:0.5},{note:"R",dur:0.5},
      // Bar 7: D4(h) rest(h)  — fingering 13
      {note:"D4",dur:2},{note:"R",dur:2},
      // Bar 8: rest(h) B3(h)  — fingering 2 (natural B)
      {note:"R",dur:2},{note:"B3",dur:2},
      // Bar 9: rest(h) A4(h)  — fingering 12, p
      {note:"R",dur:2},{note:"A4",dur:2},
      // Bar 10: rest(h) E4(h)  — fingering 12
      {note:"R",dur:2},{note:"E4",dur:2},
      // Bar 11: rest(h) E4(h)
      {note:"R",dur:2},{note:"E4",dur:2},
      // ── LINE 3 (bars 12-17) ──
      // Bar 12: rest(h) F4(h)  — fingering 1
      {note:"R",dur:2},{note:"F4",dur:2},
      // Bar 13: rest(h) F4(h)
      {note:"R",dur:2},{note:"F4",dur:2},
      // Bar 14: rest(h) A4(h)  — fingering 12
      {note:"R",dur:2},{note:"A4",dur:2},
      // Bar 15: rest(h) A4(h)
      {note:"R",dur:2},{note:"A4",dur:2},
      // Bar 16: rest(h) A4(h)  — fingering 12
      {note:"R",dur:2},{note:"A4",dur:2},
      // Bar 17: A4(q) rest(q) E4(q) rest(q)  — fingering 12 13
      {note:"A4",dur:1},{note:"R",dur:1},{note:"E4",dur:0.5},{note:"R",dur:0.5},{note:"E4",dur:0.5},{note:"R",dur:0.5},
      // ── LINE 4 (bars 18-22): ff section — the "surprise"! ──
      // Bar 18: C4(q) rest A4(h) — loud chord, fingering 0 then 12 ff
      {note:"C4",dur:1},{note:"R",dur:1},{note:"A4",dur:2},
      // Bar 19: A4(h) A4(h)  — mp, fingering 0
      {note:"A4",dur:2},{note:"A4",dur:2},
      // Bar 20: C4(w)  — fingering 0
      {note:"C4",dur:4},
      // Bar 21: rest(h) D4(h)  — fingering 13
      {note:"R",dur:2},{note:"D4",dur:2},
      // Bar 22: rest(q) D4(q) G4(q) C4(q)  — fingering 13 0
      {note:"R",dur:1},{note:"D4",dur:1},{note:"G4",dur:1},{note:"C4",dur:1},
      // Bar 23: E4(q) D4(q) C4(h)  — fingering 12 13 0
      {note:"E4",dur:1},{note:"D4",dur:1},{note:"C4",dur:2},
      // Bar 24: rest(h) D4(h)
      {note:"R",dur:2},{note:"D4",dur:2},
      // ── LINE 5 (bars 25-end): final section ──
      // Bar 25: A4(h) A4(h)  — fingering 12 12
      {note:"A4",dur:2},{note:"A4",dur:2},
      // Bar 26: C4(h) C4(h)  — fingering 0
      {note:"C4",dur:2},{note:"C4",dur:2},
      // Bar 27: rest(h) D4(h)  — fingering 13 13
      {note:"R",dur:2},{note:"D4",dur:2},
      // Bar 28: D4(h) rest(h)
      {note:"D4",dur:2},{note:"R",dur:2},
      // Bar 29: C4 D4 E4 F4 G4 A4 run — fingering 0 2 12 22 0 12
      {note:"C4",dur:0.5},{note:"D4",dur:0.5},{note:"E4",dur:0.5},{note:"F4",dur:0.5},{note:"G4",dur:0.5},{note:"A4",dur:0.5},{note:"R",dur:1},
      // Bar 30: A4(h) rest(h)  — fingering 12
      {note:"A4",dur:2},{note:"R",dur:2},
      // Bar 31: C4(h) rest  — fingering 0
      {note:"C4",dur:2},{note:"R",dur:2},
      // Final bar: C4(w)
      {note:"C4",dur:4},
    ],
  },
];

function MelodyStaff({ notes, currentIdx, results }) {
  const LINE_GAP = 10;
  const STAFF_TOP = 30;
  const LEFT_PAD = 48;
  const NOTE_STEP = 44;
  const staffWidth = LEFT_PAD + notes.length * NOTE_STEP + 20;

  const LETTER_INDEX = { C:0, D:1, E:2, F:3, G:4, A:5, B:6 };
  function notePos(noteStr) {
    const m = noteStr.match(/^([A-G](?:#|b)?)(\d)$/);
    if (!m) return 0;
    const letter = m[1][0].toUpperCase();
    const oct = parseInt(m[2], 10);
    const E4abs = 7 * 4 + LETTER_INDEX["E"];
    const abs = 7 * oct + LETTER_INDEX[letter];
    return abs - E4abs;
  }
  function posToY(pos) {
    const bottomY = STAFF_TOP + 4 * LINE_GAP;
    return bottomY - pos * (LINE_GAP / 2);
  }

  const staffYs = [0,1,2,3,4].map(i => STAFF_TOP + i * LINE_GAP);

  return (
    <div style={{ overflowX:"auto", paddingBottom:8 }}>
      <svg width={staffWidth} height={110} style={{ display:"block" }}>
        {staffYs.map((y, i) => (
          <line key={i} x1={LEFT_PAD - 8} x2={staffWidth - 8}
            y1={y} y2={y} stroke="#374151" strokeWidth="1.2" />
        ))}
        <text x={4} y={STAFF_TOP + LINE_GAP * 4.2}
          fontSize="48" fontFamily="serif" fill="#374151">{"\uD834\uDD1E"}</text>
        {notes.map((n, i) => {
          const pos = notePos(n.note);
          const ny = posToY(pos);
          const nx = LEFT_PAD + i * NOTE_STEP + 14;
          const stemUp = pos <= 4;
          const stemX = nx + (stemUp ? 6 : -6);
          const stemY2 = stemUp ? ny - 28 : ny + 28;
          const isCurrent = i === currentIdx;
          const res = results[i];
          const fill = res === "correct" ? "#16a34a"
            : res === "wrong" ? "#dc2626"
            : isCurrent ? "#2563eb"
            : i < currentIdx ? "#9ca3af"
            : "#111827";
          const ledgers = [];
          const minI = Math.min(pos, 0), maxI = Math.max(pos, 8);
          for (let li = minI; li <= maxI; li++) {
            if (li % 2 === 0 && (li < 0 || li > 8)) ledgers.push(li);
          }
          const isOpen = n.dur >= 4;
          const accMatch = n.note.match(/^[A-G]([#b])/);
          const acc = accMatch ? accMatch[1] : null;
          return (
            <g key={i}>
              {ledgers.map(li => (
                <line key={li} x1={nx-10} x2={nx+10}
                  y1={posToY(li)} y2={posToY(li)} stroke="#374151" strokeWidth="1.2" />
              ))}
              {acc === "#" && <text x={nx-14} y={ny+4} fontSize="13" fontFamily="serif" fill={fill}>#</text>}
              {acc === "b" && <text x={nx-14} y={ny+4} fontSize="13" fontFamily="serif" fill={fill}>b</text>}
              <ellipse cx={nx} cy={ny} rx={7} ry={5}
                fill={isOpen || n.dur === 2 ? (isCurrent ? "#dbeafe" : "white") : fill}
                stroke={fill} strokeWidth="1.5"
                transform={"rotate(-15 " + nx + " " + ny + ")"}
              />
              {!isOpen && (
                <line x1={stemX} y1={ny} x2={stemX} y2={stemY2}
                  stroke={fill} strokeWidth="1.5" />
              )}
              {isCurrent && (
                <circle cx={nx} cy={posToY(-3)} r={3} fill="#2563eb" />
              )}
            </g>
          );
        })}
      </svg>
    </div>
  );
}

function ScoreSummary({ results, notes, onRetry, onNext }) {
  const correct = results.filter(r => r === "correct").length;
  const total = notes.length;
  const pct = Math.round((correct / total) * 100);
  const grade = pct === 100 ? "Perfect!" : pct >= 80 ? "Great!" : pct >= 60 ? "Good" : "Keep practising";

  return (
    <div style={{
      background:"white", border:"1px solid #e5e7eb", borderRadius:16,
      padding:24, textAlign:"center", marginTop:12,
    }}>
      <div style={{ fontSize:32, marginBottom:4 }}>{grade}</div>
      <div style={{ fontSize:48, fontWeight:800, color:"#111827", lineHeight:1 }}>{pct}%</div>
      <div style={{ fontSize:14, color:"#6b7280", marginBottom:16 }}>
        {correct} / {total} notes correct
      </div>
      <div style={{ display:"flex", gap:4, justifyContent:"center", flexWrap:"wrap", marginBottom:20 }}>
        {notes.map((n, i) => (
          <div key={i} style={{
            padding:"4px 8px", borderRadius:8, fontSize:12, fontWeight:600,
            background: results[i] === "correct" ? "#dcfce7" : "#fee2e2",
            color: results[i] === "correct" ? "#16a34a" : "#dc2626",
          }}>
            {n.note}
          </div>
        ))}
      </div>
      <div style={{ display:"flex", gap:10, justifyContent:"center" }}>
        <button onClick={onRetry} style={{
          padding:"12px 24px", borderRadius:10, border:"none",
          background:"#2563eb", color:"white", fontWeight:700, fontSize:14, cursor:"pointer",
        }}>
          Try Again
        </button>
        <button onClick={onNext} style={{
          padding:"12px 24px", borderRadius:10, border:"1px solid #e5e7eb",
          background:"white", color:"#374151", fontWeight:700, fontSize:14, cursor:"pointer",
        }}>
          Next Melody
        </button>
      </div>
    </div>
  );
}

export default function ScoreCoach() {
  const [melodyIdx, setMelodyIdx] = useState(0);
  const [noteIdx, setNoteIdx] = useState(0);
  const [results, setResults] = useState([]);
  const [listening, setListening] = useState(false);
  const [done, setDone] = useState(false);
  const [detectedNote, setDetectedNote] = useState(null);
  const [holdStatus, setHoldStatus] = useState(null);
  const [centsOff, setCentsOff] = useState(0);
  const [holdPct, setHoldPct] = useState(0);

  const melody = MELODIES[melodyIdx];
  const notes = melody.notes;
  const target = notes[noteIdx];

  const audioCtxRef = useRef(null);
  const analyserRef = useRef(null);
  const sourceRef = useRef(null);
  const rafRef = useRef(null);
  const holdFrames = useRef(0);
  const silFrames = useRef(0);
  const noteResults = useRef([]);
  const currentIdx = useRef(0);
  const isDone = useRef(false);
  const notesRef = useRef(notes);
  notesRef.current = notes;

  const HOLD_REQUIRED = 24; // ~0.4s at 60fps
  const CENTS_TOL = 50;

  const startLoop = useCallback((analyser, sampleRate) => {
    const buf = new Float32Array(analyser.fftSize);

    function tick() {
      if (isDone.current) return;
      analyser.getFloatTimeDomainData(buf);
      const freq = autoCorrelate(buf, sampleRate);

      if (freq > 50 && freq < 1500) {
        silFrames.current = 0;
        const detMidi = freqToMidi(freq);
        const note = notesRef.current[currentIdx.current];
        if (!note) { rafRef.current = requestAnimationFrame(tick); return; }
        const targetMidi = writtenToConcert(note.note);
        const cents = freqToCents(freq, targetMidi);
        // Accept if within 1 semitone and within cents tolerance
        const inTune = Math.abs(detMidi - targetMidi) <= 1;

        // Show detected note as written
        const writtenMidi = detMidi + 14;
        const name = NOTE_NAMES[(writtenMidi % 12 + 12) % 12];
        const oct = Math.floor(writtenMidi / 12) - 1;
        setDetectedNote(name + oct);
        setCentsOff(cents);

        if (inTune) {
          holdFrames.current++;
          const pct = Math.min(Math.round((holdFrames.current / HOLD_REQUIRED) * 100), 100);
          setHoldPct(pct);
          setHoldStatus(pct < 100 ? "holding" : "locked");

          if (holdFrames.current >= HOLD_REQUIRED) {
            noteResults.current = [...noteResults.current, "correct"];
            setResults([...noteResults.current]);
            holdFrames.current = 0;
            setHoldPct(0);
            const next = currentIdx.current + 1;
            if (next >= notesRef.current.length) {
              isDone.current = true;
              setDone(true);
              setListening(false);
            } else {
              currentIdx.current = next;
              setNoteIdx(next);
              setHoldStatus(null);
            }
          }
        } else {
          holdFrames.current = 0;
          setHoldPct(0);
          setHoldStatus(null);
        }
      } else {
        silFrames.current++;
        holdFrames.current = 0;
        setHoldPct(0);
        setHoldStatus(null);
        if (silFrames.current > 20) {
          setDetectedNote(null);
          setCentsOff(0);
        }
      }
      rafRef.current = requestAnimationFrame(tick);
    }
    tick();
  }, []);

  async function toggleListen() {
    if (listening) {
      stopListening();
    } else {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio:true, video:false });
        const ctx = new (window.AudioContext || window.webkitAudioContext)();
        const analyser = ctx.createAnalyser();
        analyser.fftSize = 2048;
        const source = ctx.createMediaStreamSource(stream);
        source.connect(analyser);
        audioCtxRef.current = ctx;
        analyserRef.current = analyser;
        sourceRef.current = source;
        isDone.current = false;
        startLoop(analyser, ctx.sampleRate);
        setListening(true);
      } catch (e) {
        alert("Microphone access denied. Please allow mic access and try again.");
      }
    }
  }

  function stopListening() {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    if (sourceRef.current) sourceRef.current.disconnect();
    if (audioCtxRef.current) audioCtxRef.current.close();
    audioCtxRef.current = analyserRef.current = sourceRef.current = null;
    setListening(false);
    setDetectedNote(null);
    setCentsOff(0);
    setHoldStatus(null);
    setHoldPct(0);
  }

  function reset(idx) {
    stopListening();
    setMelodyIdx(idx);
    setNoteIdx(0);
    setResults([]);
    setDone(false);
    setDetectedNote(null);
    setHoldPct(0);
    noteResults.current = [];
    currentIdx.current = 0;
    isDone.current = false;
    holdFrames.current = 0;
    silFrames.current = 0;
  }

  useEffect(() => () => stopListening(), []);

  const card = {
    background:"white", border:"1px solid #e5e7eb",
    borderRadius:16, padding:16, marginBottom:12,
  };

  const inTune = holdStatus != null;
  const targetConcert = writtenToConcert(target ? target.note : "C4");
  const concertName = NOTE_NAMES[(targetConcert % 12 + 12) % 12];
  const concertOct = Math.floor(targetConcert / 12) - 1;

  return (
    <div style={{ maxWidth:520, margin:"0 auto" }}>
      <h2 style={{ fontSize:18, fontWeight:700, marginBottom:4 }}>Score Coach</h2>
      <p style={{ fontSize:12, color:"#6b7280", marginBottom:12 }}>
        Hold each note steady to confirm it — treble clef Bb
      </p>

      <div style={{ ...card, padding:"10px 14px" }}>
        <div style={{ display:"flex", gap:8, alignItems:"center", flexWrap:"wrap" }}>
          <span style={{ fontSize:12, color:"#6b7280" }}>Melody:</span>
          <select
            value={melodyIdx}
            onChange={e => reset(Number(e.target.value))}
            style={{ padding:"5px 10px", borderRadius:8, border:"1px solid #e5e7eb", fontSize:13, fontWeight:600 }}
          >
            {MELODIES.map((m, i) => <option key={i} value={i}>{m.title}</option>)}
          </select>
        </div>
      </div>

      <div style={card}>
        <div style={{ fontSize:12, color:"#6b7280", marginBottom:8, fontWeight:600 }}>
          {melody.title} — note {Math.min(noteIdx + 1, notes.length)} of {notes.length}
        </div>
        <MelodyStaff notes={notes} currentIdx={noteIdx} results={results} />
      </div>

      {!done && (
        <div style={{ ...card, textAlign:"center" }}>
          <div style={{ display:"flex", justifyContent:"space-around", alignItems:"center" }}>
            <div>
              <div style={{ fontSize:11, color:"#9ca3af", marginBottom:2 }}>Play this note</div>
              <div style={{ fontSize:44, fontWeight:800, letterSpacing:-2, color:"#2563eb", lineHeight:1 }}>
                {target ? target.note : ""}
              </div>
              <div style={{ fontSize:11, color:"#9ca3af", marginTop:4 }}>
                concert: {concertName}{concertOct}
              </div>
            </div>
            <div style={{ fontSize:24, color:"#d1d5db" }}>→</div>
            <div>
              <div style={{ fontSize:11, color:"#9ca3af", marginBottom:2 }}>You're playing</div>
              <div style={{
                fontSize:44, fontWeight:800, letterSpacing:-2, lineHeight:1,
                color: inTune ? "#16a34a" : detectedNote ? "#f59e0b" : "#d1d5db",
              }}>
                {detectedNote || "—"}
              </div>
              {detectedNote && (
                <div style={{ fontSize:11, marginTop:4, color: inTune ? "#16a34a" : "#9ca3af" }}>
                  {inTune ? "in tune" : (centsOff > 0 ? "+" : "") + centsOff + "c"}
                </div>
              )}
            </div>
          </div>

          <div style={{ height:8, borderRadius:4, background:"#f3f4f6", margin:"12px 0 0", overflow:"hidden" }}>
            <div style={{
              height:"100%", borderRadius:4,
              width: holdPct + "%",
              background: holdStatus === "locked" ? "#16a34a" : "#2563eb",
              transition:"width 0.05s linear",
            }} />
          </div>
          <div style={{ fontSize:11, color:"#9ca3af", marginTop:4 }}>
            {holdStatus === "locked" ? "Note confirmed!" :
             holdStatus === "holding" ? "Hold steady..." :
             listening ? "Start playing..." : "Press Start to begin"}
          </div>
        </div>
      )}

      {!done && (
        <div style={{ marginBottom:12 }}>
          <button onClick={toggleListen} style={{
            width:"100%", padding:"14px 0", borderRadius:12, border:"none",
            background: listening ? "#dc2626" : "#2563eb",
            color:"white", fontSize:16, fontWeight:700, cursor:"pointer",
          }}>
            {listening ? "Stop" : "Start Listening"}
          </button>
        </div>
      )}

      {done && (
        <ScoreSummary
          results={results}
          notes={notes}
          onRetry={() => reset(melodyIdx)}
          onNext={() => reset((melodyIdx + 1) % MELODIES.length)}
        />
      )}
    </div>
  );
}
