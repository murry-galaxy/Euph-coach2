import React, { useState, useRef, useEffect, useCallback } from "react";

// ─── Note helpers ─────────────────────────────────────────────────────────────
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

// Bb treble transposition: written midi − 2 = concert midi
function writtenToConcert(noteStr) {
  return midiFromWritten(noteStr) - 2;
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

// ─── Autocorrelation ──────────────────────────────────────────────────────────
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

// ─── Melodies (written treble Bb, C4–B5) ─────────────────────────────────────
// Each note: { note: "G4", dur: 2 }  dur: 4=whole, 2=half, 1=quarter
const MELODIES = [
  {
    // Full transcription from uploaded sheet music (Andy Norman arr.)
    // Key of Bb, treble clef, 3rd Bb part — already written for Bb instrument
    // Bars 1–38, rests omitted (coach moves to next note after each held note)
    title: "When the Saints Go Marching In",
    notes: [
      // Bars 1–5: opening theme "Oh when the saints go marching in"
      {note:"G4", dur:1},{note:"G4", dur:1},{note:"A4", dur:1},{note:"Bb4",dur:2},
      {note:"Eb5",dur:2},{note:"D5", dur:2},
      {note:"D5", dur:2},{note:"Bb4",dur:1},
      {note:"G4", dur:2},{note:"A4", dur:2},
      {note:"Bb4",dur:4},
      // Bars 6–10: "Oh when the saints go marching in"
      {note:"G4", dur:1},{note:"F4", dur:1},{note:"Eb4",dur:1},{note:"F4", dur:1},
      {note:"G4", dur:1},{note:"A4", dur:1},{note:"Bb4",dur:1},
      {note:"A4", dur:2},{note:"Bb4",dur:2},
      // Bars 11–15 (A section repeat): "Oh Lord I want to be in that number"
      {note:"Bb4",dur:2},{note:"Bb4",dur:2},
      {note:"C5", dur:2},{note:"Bb4",dur:2},
      {note:"Bb4",dur:2},{note:"A4", dur:2},
      {note:"G4", dur:2},{note:"A4", dur:2},
      {note:"Bb4",dur:4},
      // Bars 16–20: chromatic/accidental passage
      {note:"Bb4",dur:2},
      {note:"Eb4",dur:2},{note:"F4", dur:2},
      {note:"G4", dur:2},{note:"Ab4",dur:2},
      {note:"G4", dur:2},{note:"F4", dur:2},{note:"Eb4",dur:2},
      {note:"D4", dur:2},{note:"Eb4",dur:2},
      // Bars 21–24: chromatic descending
      {note:"Eb4",dur:2},{note:"E4", dur:2},
      {note:"G4", dur:2},{note:"F4", dur:2},
      {note:"Eb4",dur:2},{note:"D4", dur:2},
      {note:"C4", dur:2},
      // Bars 25–30 (B section): "When the saints go marching in" reprise
      {note:"A4", dur:2},{note:"G4", dur:1},{note:"G4", dur:1},{note:"G4", dur:1},
      {note:"Bb4",dur:2},
      {note:"A4", dur:2},{note:"G4", dur:1},{note:"G4", dur:1},{note:"G4", dur:1},
      {note:"Bb4",dur:2},
      {note:"G4", dur:1},{note:"G4", dur:1},{note:"G4", dur:1},
      {note:"Bb4",dur:2},
      // Bars 31–35: running quarter note passage
      {note:"C4", dur:1},{note:"C4", dur:1},
      {note:"C4", dur:1},{note:"C#4",dur:1},{note:"D4", dur:1},
      {note:"C4", dur:1},{note:"C4", dur:1},
      {note:"A4", dur:1},{note:"Bb4",dur:2},
      {note:"Ab4",dur:2},{note:"G4", dur:4},
      // Bars 36–38: final bars
      {note:"C#4",dur:1},{note:"C4", dur:1},{note:"C#4",dur:1},
      {note:"G4", dur:1},{note:"F4", dur:1},{note:"Eb4",dur:1},{note:"D4", dur:1},
      {note:"Bb4",dur:2},
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
];

// ─── Staff renderer (inline SVG, no external dep) ─────────────────────────────
function MelodyStaff({ notes, currentIdx, results }) {
  const LINE_GAP   = 10;
  const STAFF_TOP  = 30;
  const LEFT_PAD   = 48;
  const NOTE_STEP  = 44;
  const staffWidth = LEFT_PAD + notes.length * NOTE_STEP + 20;

  const LETTER_INDEX = { C:0, D:1, E:2, F:3, G:4, A:5, B:6 };
  function notePos(noteStr) {
    const m = noteStr.match(/^([A-G](?:#|b)?)(\d)$/);
    if (!m) return 0;
    const letter = m[1][0].toUpperCase();
    const oct    = parseInt(m[2], 10);
    const E4abs  = 7 * 4 + LETTER_INDEX["E"];
    const abs    = 7 * oct + LETTER_INDEX[letter];
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
        {/* Staff lines */}
        {staffYs.map((y, i) => (
          <line key={i} x1={LEFT_PAD - 8} x2={staffWidth - 8}
            y1={y} y2={y} stroke="#374151" strokeWidth="1.2" />
        ))}

        {/* Treble clef */}
        <text x={4} y={STAFF_TOP + LINE_GAP * 4.2}
          fontSize="48" fontFamily="serif" fill="#374151">{"\uD834\uDD1E"}</text>

        {/* Notes */}
        {notes.map((n, i) => {
          const pos  = notePos(n.note);
          const ny   = posToY(pos);
          const nx   = LEFT_PAD + i * NOTE_STEP + 14;
          const stemUp = pos <= 4;
          const stemX  = nx + (stemUp ? 6 : -6);
          const stemY2 = stemUp ? ny - 28 : ny + 28;

          // Colour
          const isCurrent = i === currentIdx;
          const res = results[i];
          const fill = res === "correct" ? "#16a34a"
                     : res === "wrong"   ? "#dc2626"
                     : isCurrent         ? "#2563eb"
                     : i < currentIdx    ? "#9ca3af"
                     :                     "#111827";

          // Ledger lines
          const ledgers = [];
          const minI = Math.min(pos, 0), maxI = Math.max(pos, 8);
          for (let li = minI; li <= maxI; li++) {
            if (li % 2 === 0 && (li < 0 || li > 8)) ledgers.push(li);
          }

          // Duration flag: whole=open, half=open+stem, quarter=filled+stem
          const isOpen = n.dur >= 4; // whole note: open, no stem
          const isHalf = n.dur === 2;
          const isFilled = n.dur === 1;

          const accMatch = n.note.match(/^[A-G]([#b])/);
          const acc = accMatch ? accMatch[1] : null;

          return (
            <g key={i}>
              {/* Ledger lines */}
              {ledgers.map(li => (
                <line key={li} x1={nx-10} x2={nx+10}
                  y1={posToY(li)} y2={posToY(li)} stroke="#374151" strokeWidth="1.2" />
              ))}

              {/* Accidental */}
              {acc === "#" && <text x={nx-14} y={ny+4} fontSize="13" fontFamily="serif" fill={fill}>#</text>}
              {acc === "b" && <text x={nx-14} y={ny+4} fontSize="13" fontFamily="serif" fill={fill}>b</text>}

              {/* Notehead */}
              <ellipse cx={nx} cy={ny} rx={7} ry={5}
                fill={isOpen || isHalf ? (isCurrent ? "#dbeafe" : "white") : fill}
                stroke={fill} strokeWidth="1.5"
                transform={`rotate(-15 ${nx} ${ny})`}
              />

              {/* Stem (half + quarter) */}
              {!isOpen && (
                <line x1={stemX} y1={ny} x2={stemX} y2={stemY2}
                  stroke={fill} strokeWidth="1.5" />
              )}

              {/* Current indicator dot below */}
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

// ─── Score summary ────────────────────────────────────────────────────────────
function ScoreSummary({ results, notes, onRetry, onNext }) {
  const correct = results.filter(r => r === "correct").length;
  const total   = notes.length;
  const pct     = Math.round((correct / total) * 100);
  const grade   = pct === 100 ? "🌟 Perfect!" : pct >= 80 ? "🎉 Great!" : pct >= 60 ? "👍 Good" : "💪 Keep practising";

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

      {/* Per-note breakdown */}
      <div style={{ display:"flex", gap:4, justifyContent:"center", flexWrap:"wrap", marginBottom:20 }}>
        {notes.map((n, i) => (
          <div key={i} style={{
            padding:"4px 8px", borderRadius:8, fontSize:12, fontWeight:600,
            background: results[i] === "correct" ? "#dcfce7" : "#fee2e2",
            color:       results[i] === "correct" ? "#16a34a" : "#dc2626",
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
          Next Melody →
        </button>
      </div>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────
export default function ScoreCoach() {
  const [melodyIdx, setMelodyIdx]     = useState(0);
  const [noteIdx, setNoteIdx]         = useState(0);       // current note index
  const [results, setResults]         = useState([]);      // "correct"|"wrong"|null per note
  const [listening, setListening]     = useState(false);
  const [done, setDone]               = useState(false);
  const [detectedNote, setDetectedNote] = useState(null);
  const [holdStatus, setHoldStatus]   = useState(null);    // "holding"|"locked"
  const [centsOff, setCentsOff]       = useState(0);

  const melody = MELODIES[melodyIdx];
  const notes  = melody.notes;
  const target = notes[noteIdx];

  // Mic refs
  const audioCtxRef  = useRef(null);
  const analyserRef  = useRef(null);
  const sourceRef    = useRef(null);
  const rafRef       = useRef(null);
  const holdFrames   = useRef(0);    // frames held on correct note
  const silFrames    = useRef(0);    // frames of silence after a note
  const noteResults  = useRef([]);
  const currentIdx   = useRef(0);
  const isDone       = useRef(false);

  // Required hold frames to confirm a note (≈ 0.5s at 60fps)
  const HOLD_REQUIRED = 30;
  // Frames of silence before accepting next note
  const SIL_REQUIRED  = 8;

  // ── Audio loop ──────────────────────────────────────────
  const startLoop = useCallback((analyser, sampleRate) => {
    const buf = new Float32Array(analyser.fftSize);

    function tick() {
      if (isDone.current) return;
      analyser.getFloatTimeDomainData(buf);
      const freq = autoCorrelate(buf, sampleRate);

      if (freq > 50 && freq < 1500) {
        silFrames.current = 0;
        const detMidi = freqToMidi(freq);
        const note    = notes[currentIdx.current];
        if (!note) return;
        const targetMidi = writtenToConcert(note.note);
        const cents  = freqToCents(freq, targetMidi);
        const inTune = detMidi === targetMidi && Math.abs(cents) <= 20;

        // Display
        const writtenMidi = detMidi + 2;
        const name = NOTE_NAMES[(writtenMidi % 12 + 12) % 12];
        const oct  = Math.floor(writtenMidi / 12) - 1;
        setDetectedNote(`${name}${oct}`);
        setCentsOff(cents);

        if (inTune) {
          holdFrames.current++;
          const progress = Math.min(holdFrames.current / HOLD_REQUIRED, 1);
          setHoldStatus(progress < 1 ? "holding" : "locked");

          if (holdFrames.current >= HOLD_REQUIRED) {
            // Confirm note as correct
            noteResults.current = [...noteResults.current, "correct"];
            setResults([...noteResults.current]);
            holdFrames.current = 0;
            const next = currentIdx.current + 1;
            if (next >= notes.length) {
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
          setHoldStatus(null);
        }
      } else {
        // Silence
        silFrames.current++;
        holdFrames.current = 0;
        setHoldStatus(null);
        if (silFrames.current > 20) {
          setDetectedNote(null);
          setCentsOff(0);
        }
      }

      rafRef.current = requestAnimationFrame(tick);
    }
    tick();
  }, [notes]);

  // ── Mic toggle ──────────────────────────────────────────
  async function toggleListen() {
    if (listening) {
      stopListening();
    } else {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio:true, video:false });
        const ctx    = new (window.AudioContext || window.webkitAudioContext)();
        const analyser = ctx.createAnalyser();
        analyser.fftSize = 2048;
        const source = ctx.createMediaStreamSource(stream);
        source.connect(analyser);
        audioCtxRef.current = ctx;
        analyserRef.current = analyser;
        sourceRef.current   = source;
        isDone.current = false;
        startLoop(analyser, ctx.sampleRate);
        setListening(true);
      } catch {
        alert("Microphone access denied. Please allow mic access and try again.");
      }
    }
  }

  function stopListening() {
    if (rafRef.current)      cancelAnimationFrame(rafRef.current);
    if (sourceRef.current)   sourceRef.current.disconnect();
    if (audioCtxRef.current) audioCtxRef.current.close();
    audioCtxRef.current = analyserRef.current = sourceRef.current = null;
    setListening(false);
    setDetectedNote(null);
    setCentsOff(0);
    setHoldStatus(null);
  }

  function reset(idx) {
    stopListening();
    setMelodyIdx(idx);
    setNoteIdx(0);
    setResults([]);
    setDone(false);
    setDetectedNote(null);
    noteResults.current = [];
    currentIdx.current  = 0;
    isDone.current      = false;
    holdFrames.current  = 0;
    silFrames.current   = 0;
  }

  function handleNext() {
    reset((melodyIdx + 1) % MELODIES.length);
  }

  useEffect(() => () => stopListening(), []);

  // ── Hold progress bar ───────────────────────────────────
  const holdProgress = holdStatus
    ? Math.min((holdFrames.current / HOLD_REQUIRED) * 100, 100)
    : 0;

  // ── Styles ──────────────────────────────────────────────
  const card = {
    background:"white", border:"1px solid #e5e7eb",
    borderRadius:16, padding:16, marginBottom:12,
  };

  const inTune  = holdStatus != null;
  const targetConcert = writtenToConcert(target?.note || "C4");
  const targetName = NOTE_NAMES[(targetConcert % 12 + 12) % 12];

  return (
    <div style={{ maxWidth:520, margin:"0 auto" }}>
      <h2 style={{ fontSize:18, fontWeight:700, marginBottom:4 }}>Score Coach</h2>
      <p style={{ fontSize:12, color:"#6b7280", marginBottom:12 }}>
        Play each note — hold it steady to confirm · Treble clef Bb
      </p>

      {/* Melody selector */}
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

      {/* Staff */}
      <div style={card}>
        <div style={{ fontSize:12, color:"#6b7280", marginBottom:8, fontWeight:600 }}>
          {melody.title} — note {Math.min(noteIdx + 1, notes.length)} of {notes.length}
        </div>
        <MelodyStaff notes={notes} currentIdx={noteIdx} results={results} />
      </div>

      {/* Current target + what you're playing */}
      {!done && (
        <div style={{ ...card, textAlign:"center" }}>
          <div style={{ display:"flex", justifyContent:"space-around", alignItems:"center" }}>
            <div>
              <div style={{ fontSize:11, color:"#9ca3af", marginBottom:2 }}>Play this note</div>
              <div style={{ fontSize:44, fontWeight:800, letterSpacing:-2, color:"#2563eb", lineHeight:1 }}>
                {target?.note}
              </div>
            </div>
            <div style={{ fontSize:24, color:"#d1d5db" }}>→</div>
            <div>
              <div style={{ fontSize:11, color:"#9ca3af", marginBottom:2 }}>You're playing</div>
              <div style={{
                fontSize:44, fontWeight:800, letterSpacing:-2, lineHeight:1,
                color: inTune ? "#16a34a" : detectedNote ? "#f5
