import React, { useState, useRef, useEffect, useCallback } from "react";

// ─── Note helpers ─────────────────────────────────────────────────────────────
const NOTE_NAMES = ["C","C#","D","D#","E","F","F#","G","G#","A","A#","B"];

const WRITTEN_NOTES = [
  "C3","D3","E3","F3","G3","A3","B3",
  "C4","D4","E4","F4","G4","A4","B4",
];

// Bb treble: written midi − 2 = concert midi
function writtenToConcertMidi(noteStr) {
  const m = noteStr.match(/^([A-G](?:#|b)?)(\d)$/);
  if (!m) return 60;
  let name = m[1];
  const oct = Number(m[2]);
  const FLAT = { Ab:"G#", Bb:"A#", Db:"C#", Eb:"D#", Gb:"F#" };
  if (name.includes("b")) name = FLAT[name] || name;
  const idx = NOTE_NAMES.indexOf(name);
  return (oct + 1) * 12 + idx - 14;
}

function midiToFreq(midi) {
  return 440 * Math.pow(2, (midi - 69) / 12);
}

function freqToMidiAndCents(freq) {
  if (!freq || freq <= 0) return { midi: 69, cents: 0 };
  const exactMidi = 12 * Math.log2(freq / 440) + 69;
  const midi = Math.round(exactMidi);
  const cents = Math.round((exactMidi - midi) * 100);
  return { midi, cents };
}

// Concert midi → written note string (add 2 semitones for Bb treble)
function concertMidiToWritten(midi) {
  const writtenMidi = midi + 14;
  const name = NOTE_NAMES[(writtenMidi % 12 + 12) % 12];
  const oct = Math.floor(writtenMidi / 12) - 1;
  return `${name}${oct}`;
}

// ─── Autocorrelation pitch detector (complete & working) ─────────────────────
function autoCorrelate(buffer, sampleRate) {
  const SIZE = buffer.length;

  // RMS check — ignore silence
  let rms = 0;
  for (let i = 0; i < SIZE; i++) rms += buffer[i] * buffer[i];
  rms = Math.sqrt(rms / SIZE);
  if (rms < 0.01) return -1;

  // Build autocorrelation array
  const c = new Float32Array(SIZE);
  for (let i = 0; i < SIZE; i++) {
    let sum = 0;
    for (let j = 0; j < SIZE - i; j++) sum += buffer[j] * buffer[j + i];
    c[i] = sum;
  }

  // Find first dip (end of initial falling edge)
  let d = 0;
  while (d < SIZE - 1 && c[d] > c[d + 1]) d++;

  // Find peak after the dip
  let maxVal = -Infinity, maxPos = -1;
  for (let i = d; i < SIZE; i++) {
    if (c[i] > maxVal) { maxVal = c[i]; maxPos = i; }
  }

  if (maxPos <= 0 || maxPos >= SIZE - 1) return -1;

  // Parabolic interpolation for sub-sample accuracy
  const y1 = c[maxPos - 1];
  const y2 = c[maxPos];
  const y3 = c[maxPos + 1];
  const denom = 2 * (2 * y2 - y1 - y3);
  const refined = denom !== 0 ? maxPos + (y3 - y1) / denom : maxPos;

  return sampleRate / refined;
}

// ─── Tuner needle ─────────────────────────────────────────────────────────────
function TunerNeedle({ cents, active }) {
  const angle = active ? Math.max(-45, Math.min(45, cents * 0.9)) : 0;
  const inTune = active && Math.abs(cents) <= 10;

  return (
    <div style={{ display:"flex", flexDirection:"column", alignItems:"center", gap:8 }}>
      <div style={{ position:"relative", width:200, height:110, overflow:"hidden" }}>
        <svg width="200" height="110" style={{ position:"absolute", top:0, left:0 }}>
          {/* Coloured zones */}
          <path d="M 100 100 L 10 20 A 92 92 0 0 1 55 8 Z" fill="rgba(59,130,246,0.12)" />
          <path d="M 100 100 L 70 5 A 92 92 0 0 1 130 5 Z" fill="rgba(34,197,94,0.18)" />
          <path d="M 100 100 L 145 8 A 92 92 0 0 1 190 20 Z" fill="rgba(239,68,68,0.12)" />
          {/* Arc */}
          <path d="M 10 100 A 90 90 0 0 1 190 100" fill="none" stroke="#e5e7eb" strokeWidth="2" />
          {/* Tick marks at −40, −20, 0, +20, +40 cents */}
          {[-40,-20,0,20,40].map(tick => {
            const a = ((tick / 50) * 90) * Math.PI / 180;
            const cx = 100 + 85 * Math.sin(a);
            const cy = 100 - 85 * Math.cos(a);
            return <circle key={tick} cx={cx} cy={cy} r={tick === 0 ? 3 : 2}
              fill={tick === 0 ? "#16a34a" : "#9ca3af"} />;
          })}
          {/* Labels */}
          <text x="6"  y="105" fontSize="10" fill="#9ca3af">♭</text>
          <text x="176" y="105" fontSize="10" fill="#9ca3af">♯</text>
        </svg>

        {/* Needle */}
        <div style={{
          position:"absolute", bottom:4, left:"50%",
          width:2, height:88,
          transformOrigin:"bottom center",
          transform:`translateX(-50%) rotate(${angle}deg)`,
          transition: active ? "transform 0.08s ease-out" : "transform 0.4s ease",
          background: inTune
            ? "linear-gradient(to top, #16a34a, #4ade80)"
            : "linear-gradient(to top, #374151, #9ca3af)",
          borderRadius:2,
        }} />

        {/* Pivot dot */}
        <div style={{
          position:"absolute", bottom:0, left:"50%",
          transform:"translateX(-50%)",
          width:12, height:12, borderRadius:"50%",
          background: inTune ? "#16a34a" : "#374151",
          transition:"background 0.2s",
        }} />
      </div>

      {/* Cents readout */}
      <div style={{
        fontSize:13, fontWeight:600, minHeight:20,
        color: inTune ? "#16a34a" : Math.abs(cents) > 25 ? "#dc2626" : "#92400e",
      }}>
        {active
          ? inTune
            ? "✓ In tune"
            : `${cents > 0 ? "+" : ""}${cents}¢ ${cents < 0 ? "(flat)" : "(sharp)"}`
          : "—"}
      </div>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────
export default function PitchCoach() {
  const [mode, setMode]             = useState("free");   // "free" | "target"
  const [listening, setListening]   = useState(false);
  const [detectedFreq, setDetectedFreq] = useState(null);
  const [detectedMidi, setDetectedMidi] = useState(null);
  const [cents, setCents]           = useState(0);

  // Target mode state
  const [targetNote, setTargetNote]   = useState("G3");
  const [matchCount, setMatchCount]   = useState(0);
  const [successFlash, setSuccessFlash] = useState(false);

  const audioCtxRef  = useRef(null);
  const analyserRef  = useRef(null);
  const sourceRef    = useRef(null);
  const rafRef       = useRef(null);
  const holdFrames   = useRef(0);
  const matchTimer   = useRef(null);

  // ── Audio polling loop ──────────────────────────────────
  const startLoop = useCallback((analyser, sampleRate) => {
    const buf = new Float32Array(analyser.fftSize);

    function tick() {
      analyser.getFloatTimeDomainData(buf);
      const freq = autoCorrelate(buf, sampleRate);

      if (freq > 50 && freq < 1500) {
        const { midi, cents: c } = freqToMidiAndCents(freq);
        setDetectedFreq(freq);
        setDetectedMidi(midi);
        setCents(c);
        holdFrames.current = 10;
      } else {
        holdFrames.current--;
        if (holdFrames.current <= 0) {
          setDetectedFreq(null);
          setDetectedMidi(null);
          setCents(0);
          holdFrames.current = 0;
        }
      }
      rafRef.current = requestAnimationFrame(tick);
    }
    tick();
  }, []);

  // ── Mic toggle ──────────────────────────────────────────
  async function toggleListen() {
    if (listening) {
      stopListening();
    } else {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
        const ctx = new (window.AudioContext || window.webkitAudioContext)();
        const analyser = ctx.createAnalyser();
        analyser.fftSize = 2048;
        const source = ctx.createMediaStreamSource(stream);
        source.connect(analyser);
        audioCtxRef.current = ctx;
        analyserRef.current = analyser;
        sourceRef.current   = source;
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
    setDetectedFreq(null);
    setDetectedMidi(null);
    setCents(0);
  }

  useEffect(() => () => stopListening(), []);

  // ── Target-note hit detection ────────────────────────────
  useEffect(() => {
    if (mode !== "target" || !listening || detectedMidi == null) return;
    const targetMidi = writtenToConcertMidi(targetNote);
    const hit = detectedMidi === targetMidi && Math.abs(cents) <= 15;

    if (hit) {
      if (!matchTimer.current) {
        matchTimer.current = setTimeout(() => {
          setMatchCount(n => n + 1);
          setSuccessFlash(true);
          setTimeout(() => setSuccessFlash(false), 600);
          const pool = WRITTEN_NOTES.filter(n => n !== targetNote);
          setTargetNote(pool[Math.floor(Math.random() * pool.length)]);
          matchTimer.current = null;
        }, 800);
      }
    } else {
      if (matchTimer.current) { clearTimeout(matchTimer.current); matchTimer.current = null; }
    }
    return () => { if (matchTimer.current) { clearTimeout(matchTimer.current); matchTimer.current = null; } };
  }, [detectedMidi, cents, mode, targetNote, listening]);

  // ── Derived display ─────────────────────────────────────
  const writtenDisplay  = detectedMidi != null ? concertMidiToWritten(detectedMidi) : null;
  const targetMidi      = writtenToConcertMidi(targetNote);
  const targetHz        = midiToFreq(targetMidi).toFixed(1);
  const concertNoteName = NOTE_NAMES[(targetMidi % 12 + 12) % 12];
  const concertOct      = Math.floor(targetMidi / 12) - 1;
  const isOnTarget      = mode === "target" && detectedMidi === targetMidi && Math.abs(cents) <= 15;

  // ── Style helpers ───────────────────────────────────────
  const card = {
    background:"white", border:"1px solid #e5e7eb",
    borderRadius:12, padding:16, marginBottom:12,
  };
  const segBtn = (active) => ({
    padding:"7px 14px",
    background: active ? "#111827" : "white",
    color: active ? "white" : "#374151",
    border:"none", fontWeight:500, fontSize:13, cursor:"pointer",
  });

  // ── Render ──────────────────────────────────────────────
  return (
    <div>
      <h2 style={{ fontSize:18, fontWeight:700, marginBottom:4 }}>Pitch Coach</h2>
      <p style={{ fontSize:12, color:"#6b7280", marginBottom:12 }}>
        Treble clef · Bb transposing · Written notes shown
      </p>

      {/* Mode tabs */}
      <div style={{ display:"inline-flex", border:"1px solid #e5e7eb", borderRadius:10, overflow:"hidden", marginBottom:16 }}>
        <button style={segBtn(mode === "free")}   onClick={() => setMode("free")}>Free Play</button>
        <button style={segBtn(mode === "target")} onClick={() => setMode("target")}>Target Note</button>
      </div>

      {/* Mic button */}
      <div style={{ marginBottom:16 }}>
        <button
          onClick={toggleListen}
          style={{
            padding:"10px 20px", borderRadius:8, border:"none", fontWeight:600,
            fontSize:14, cursor:"pointer",
            background: listening ? "#dc2626" : "#2563eb",
            color:"white",
          }}
        >
          {listening ? "⏹ Stop Listening" : "🎤 Start Listening"}
        </button>
        {!listening && (
          <span style={{ marginLeft:12, fontSize:12, color:"#9ca3af" }}>
            Requires microphone access
          </span>
        )}
      </div>

      {/* ── FREE PLAY ── */}
      {mode === "free" && (
        <div style={card}>
          <div style={{ textAlign:"center", marginBottom:12 }}>
            <div style={{ fontSize:12, color:"#6b7280", marginBottom:4 }}>You're playing (written)</div>
            <div style={{
              fontSize:56, fontWeight:800, letterSpacing:-2, lineHeight:1,
              color: listening && writtenDisplay ? "#111827" : "#d1d5db",
              minHeight:60,
            }}>
              {listening && writtenDisplay ? writtenDisplay : "—"}
            </div>
            {listening && detectedFreq && (
              <div style={{ fontSize:12, color:"#9ca3af", marginTop:4 }}>
                {detectedFreq.toFixed(1)} Hz (concert) · written {writtenDisplay}
              </div>
            )}
          </div>
          <TunerNeedle cents={cents} active={listening && detectedFreq != null} />
        </div>
      )}

      {/* ── TARGET NOTE ── */}
      {mode === "target" && (
        <>
          {/* Score row */}
          <div style={{ ...card, display:"flex", justifyContent:"space-between", alignItems:"center" }}>
            <div>
              <div style={{ fontSize:11, color:"#6b7280", marginBottom:2 }}>Notes hit</div>
              <div style={{ fontSize:28, fontWeight:800, color:"#2563eb" }}>{matchCount}</div>
            </div>
            <button onClick={() => setMatchCount(0)}
              style={{ fontSize:12, color:"#9ca3af", background:"none", border:"none", cursor:"pointer" }}>
              Reset
            </button>
          </div>

          {/* Target card */}
          <div style={{
            ...card, textAlign:"center",
            background: successFlash ? "#f0fdf4" : isOnTarget ? "#f0fdf4" : "white",
            borderColor: isOnTarget ? "#86efac" : "#e5e7eb",
            transition:"background 0.2s, border-color 0.2s",
          }}>
            <div style={{ fontSize:12, color:"#6b7280", marginBottom:4 }}>Play this written note</div>
            <div style={{
              fontSize:60, fontWeight:800, letterSpacing:-2, lineHeight:1,
              color: isOnTarget ? "#16a34a" : "#111827",
            }}>
              {targetNote}
            </div>
            <div style={{ fontSize:12, color:"#9ca3af", marginTop:4 }}>
              Concert: {concertNoteName}{concertOct} · {targetHz} Hz
            </div>
            <div style={{ marginTop:10, fontSize:14, fontWeight:500, minHeight:22 }}>
              {listening
                ? writtenDisplay
                  ? isOnTarget
                    ? <span style={{ color:"#16a34a" }}>✓ Locked on — hold it!</span>
                    : <span style={{ color:"#6b7280" }}>Playing: {writtenDisplay}</span>
                  : <span style={{ color:"#d1d5db" }}>Start playing…</span>
                : null}
            </div>
          </div>

          {/* Tuner */}
          <div style={card}>
            <div style={{ textAlign:"center", fontSize:12, color:"#6b7280", marginBottom:8 }}>Tuner</div>
            <TunerNeedle cents={cents} active={listening && detectedFreq != null} />
          </div>

          {/* Skip */}
          <div style={{ textAlign:"center" }}>
            <button
              onClick={() => {
                const pool = WRITTEN_NOTES.filter(n => n !== targetNote);
                setTargetNote(pool[Math.floor(Math.random() * pool.length)]);
              }}
              style={{
                fontSize:13, color:"#6b7280", background:"none",
                border:"1px solid #e5e7eb", borderRadius:8,
                padding:"6px 14px", cursor:"pointer",
              }}
            >
              Skip note →
            </button>
          </div>
        </>
      )}
    </div>
  );
}
