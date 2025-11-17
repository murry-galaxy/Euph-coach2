import React, { useState, useRef, useEffect } from "react";

// ---------------------------------------------------------
// Basic note helpers
// ---------------------------------------------------------
const NOTE_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];

// Written note pool (treble clef Bb euphonium, roughly C4–B5)
const PRACTICE_NOTES = [
  "C4","C#4","D4","D#4","E4","F4","F#4","G4","G#4","A4","A#4","B4",
  "C5","C#5","D5","D#5","E5","F5","F#5","G5","G#5","A5","A#5","B5"
];

// 3-valve treble-Bb fingering map, same pattern as trumpet
const VALVE_MAP = {
  C: "0",
  "C#": "12",
  D: "13",
  "D#": "23",
  E: "12",
  F: "1",
  "F#": "123",
  G: "13",
  "G#": "23",
  A: "12",
  "A#": "1", // Bb
  B: "2"
};

// Parse written note like "C#4" → { name: "C#", octave: 4 }
function parseWrittenNote(noteStr) {
  const match = noteStr.match(/^([A-G](?:#|b)?)(\d)$/);
  if (!match) {
    return { name: "C", octave: 4 };
  }
  let name = match[1];
  const octave = Number(match[2]);

  // convert flats to sharps for internal consistency
  const FLAT_TO_SHARP = {
    Ab: "G#",
    Bb: "A#",
    Db: "C#",
    Eb: "D#",
    Gb: "F#"
  };
  if (name.includes("b")) {
    name = FLAT_TO_SHARP[name] || name;
  }

  return { name, octave };
}

function midiFromNote(name, octave) {
  const idx = NOTE_NAMES.indexOf(name);
  return (octave + 1) * 12 + idx; // standard MIDI formula
}

function midiToName(midi) {
  return NOTE_NAMES[(midi % 12 + 12) % 12];
}

function midiToOctave(midi) {
  return Math.floor(midi / 12) - 1;
}

// Bb treble: written note sounds a major second lower (−2 semitones)
function writtenToConcertMidi(noteStr) {
  const { name, octave } = parseWrittenNote(noteStr);
  const writtenMidi = midiFromNote(name, octave);
  return writtenMidi - 2; // down a tone
}

// Convert frequency to nearest MIDI + cents error
function freqToMidiAndCents(freq) {
  const A4 = 440;
  const midi = Math.round(12 * Math.log2(freq / A4)) + 69;
  const estFreq = A4 * Math.pow(2, (midi - 69) / 12);
  const cents = Math.round(1200 * Math.log2(freq / estFreq));
  return { midi, cents };
}

// Simple autocorrelation pitch detector
function autoCorrelate(buffer, sampleRate) {
  const SIZE = buffer.length;
  let rms = 0;

  for (let i = 0; i < SIZE; i++) {
    const v = buffer[i];
    rms += v * v;
  }
  rms = Math.sqrt(rms / SIZE);

  // too quiet – treat as no pitch
  if (rms < 0.008) return -1;

  const c = new Float32Array(SIZE);

  for (let i = 0; i < SIZE; i++) {
    let sum = 0;
    for (let j = 0; j < SIZE - i; j++) {
      sum += buffer[j] * buffer[j + i];
    }
    c[i] = sum;
  }

  let
