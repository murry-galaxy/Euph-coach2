import React, { useEffect, useMemo, useRef, useState } from "react";
import StaffNote from "./StaffNote.jsx";

/* ---------------- Popup ---------------- */
function ResultPopup({ visible, ok, text }) {
  if (!visible) return null;
  const bg = ok ? "rgba(34,197,94,0.95)" : "rgba(220,38,38,0.95)"; // green / red
  const emoji = ok ? "✅" : "❌";
  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "rgba(0,0,0,0.25)",
        zIndex: 50,
      }}
    >
      <div
        style={{
          padding: "20px 28px",
          borderRadius: 14,
          color: "white",
          background: bg,
          boxShadow: "0 10px 30px rgba(0,0,0,0.25)",
          fontSize: 24,
          fontWeight: 700,
          display: "flex",
          gap: 12,
          alignItems: "center",
          minWidth: 260,
          justifyContent: "center",
        }}
      >
        <span style={{ fontSize: 28 }}>{emoji}</span>
        <span>{text}</span>
      </div>
    </div>
  );
}

export default function App() {
  /* -------- Modes & basic UI -------- */
  const [mode, setMode] = useState("flashcards"); // "flashcards" | "scales"
  const [listening, setListening] = useState(false);
  const [feedback, setFeedback] = useState("Press Start Listening, then play the note.");

  /* -------- Notes & valves (4th octave only) -------- */
  const [currentNote, setCurrentNote] = useState("C4"); // written (treble-Bb), constrained to C4..B4
  const [valveInput, setValveInput] = useState(""); // e.g., "13" or "" for open
  const NOTE_NAMES = ["C","C#","D","D#","E","F","F#","G","G#","A","A#","B"];

  // 4th-octave only (C4..B4), written treble-Bb, 3-valve
  const VALVES_BY_NOTE = {
    "C4":  ["0"],
    "C#4": ["12"],  // Db4
    "D4":  ["1"],
    "D#4": ["2"],   // Eb4
    "E4":  ["0"],
    "F4":  ["1"],
    "F#4": ["23"],  // Gb4
    "G4":  ["0"],
    "G#4": ["23"],  // Ab4
    "A4":  ["12"],
    "A#4": ["1"],   // Bb4
    "B4":  ["2"]
  };

  const PRACTICE_POOL = useMemo(() => {
    const nameFromMidi = (m)=>NOTE_NAMES[(m%12+12)%12];
    const octaveFromMidi = (m)=>Math.floor(m/12)-1;
    const arr = [];
    for (let m = 60; m <= 71; m++) { // C4 (60) .. B4 (71)
      arr.push(`${nameFromMidi(m)}${octaveFromMidi(m)}`);
    }
    return arr;
  }, []);

  function parseWritten(note) {
    const m = note.match(/([A-G](?:#|b)?)(\d)/);
    if (!m) return { name: "C", octave: 4 };
    let name = m[1];
    const FLAT_TO_SHARP = { Ab: "G#", Bb: "A#", Db: "C#", Eb: "D#", Gb: "F#" };
    if (name.includes("b")) name = FLAT_TO_SHARP[name] || name;
    return { name, octave: Number(m[2]) };
  }
  function normalizeToSharp(name) {
    const FLAT_TO_SHARP = { Ab:"G#", Bb:"A#", Db:"C#", Eb:"D#", Gb:"F#" };
    return name.includes("b") ? (FLAT_TO_SHARP[name] || name) : name;
  }
  function expectedValvesFor(note) {
    const m = String(note).match(/^([A-G](?:#|b)?)(\d)$/);
    if (!m) return ["0"];
    const name = normalizeToSharp(m[1]);
    const oct  = m[2];
    return VALVES_BY_NOTE[`${name}${oct}`] || ["0"];
  }
  function normalizeInput(vIn) {
    const v = vIn || "0";
    return v === "0" ? "0" : v.split("").sort().join("");
  }

  /* -------- Scale mode (written major) — clamped to 4th octave -------- */
  const WRITTEN_TONICS = ["C","G","D","F","Bb","A","E","Eb"];
  const [selectedTonic, setSelectedTonic] = useState("C");
  const [scaleIndex, setScaleIndex] = useState(0);
  const [scaleAsc, setScaleAsc] = useState(true);
  const SCALE_STEPS = [2,2,1,2,2,2,1]; // W W H W W W H

  function midiFromNoteName(name, octave){ const idx=NOTE_NAMES.indexOf(name); return (octave+1)*12+idx; }
  function nameFromMidi(m){ return NOTE_NAMES[(m%12+12)%12]; }
  function octaveFromMidi(m){ return Math.floor(m/12)-1; }

  function buildWrittenScale4(tonic) {
    const MAP = { Bb:"A#", Eb:"D#" };
    const tonicSharp = MAP[tonic] || tonic;
    const tMidi = midiFromNoteName(tonicSharp, 4); // start in 4th octave
    const seq = [tMidi];
    let cur = tMidi;
    for (const s of SCALE_STEPS) { cur += s; seq.push(cur); }
    const CLAMP_MAX = 71; // B4
    const clamped = seq.filter(m => m <= CLAMP_MAX);
    const safe = clamped.length ? clamped : [tMidi];
    return safe.map(m => `${nameFromMidi(m)}${octaveFromMidi(m)}`);
  }

  const currentScale = useMemo(() => buildWrittenScale4(selectedTonic), [selectedTonic]);

  function nextFlashcard() {
    const n = PRACTICE_POOL[Math.floor(Math.random()*PRACTICE_POOL.length)];
    setCurrentNote(n);
    setValveInput("");
    setFeedback("Play the note and press your valves!");
  }
  function nextScaleStep() {
    const seq = currentScale;
    if (!seq.length) return;
    let idx = scaleIndex + (scaleAsc ? 1 : -1);
    if (idx >= seq.length) { setScaleAsc(false); idx = Math.max(0, seq.length - 2); }
    if (idx < 0)            { setScaleAsc(true);  idx = 0; }
    setScaleIndex(idx);
    setCurrentNote(seq[idx]);
    setValveInput("");
    setFeedback(`Scale: ${selectedTonic} major — degree ${idx + 1}/${seq.length}`);
  }

  /* -------- Pitch detection -------- */
  const audioCtxRef = useRef(null);
  const analyserRef = useRef(null);
  const bufferRef = useRef(null);
  const rafRef = useRef(null);

  const [liveCents, setLiveCents] = useState(0);
  const [livePlayed, setLivePlayed] = useState(null);
  const [liveOK, setLiveOK] = useState(false); // drives StaffNote colour

  function freqToMidiAndCents(freq){
    const A4 = 440;
    const midi = Math.round(12 * Math.log2(freq / A4)) + 69;
    const est = A4 * Math.pow(2, (midi - 69) / 12);
    const cents = Math.round(1200 * Math.log2(freq / est));
    return { midi, cents };
  }
  function autoCorrelate(buf, sr){
    let SIZE = buf.length, rms = 0;
    for (let i=0;i<SIZE;i++) rms += buf[i]*buf[i];
    rms = Math.sqrt(rms/SIZE);
    if (rms < 0.008) return -1;
    const c = new Float32Array(SIZE);
    for (let i=0;i<SIZE;i++){ let sum=0; for(let j=0;j<SIZE-i;j++){ sum += buf[j]*buf[j+i]; } c[i]=sum; }
    let d=0; while (c[d] > c[d+1]) d++;
    let maxval=-1, maxpos=-1;
    for (let i=d;i<SIZE;i++){ if (c[i] > maxval){ maxval = c[i]; maxpos = i; } }
    const T0 = maxpos;
    return T0 <= 0 ? -1 : sr / T0;
  }

  async function startListening(){
    if (listening) return;
    try{
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation:false, noiseSuppression:false }
      });
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      audioCtxRef.current = ctx;
      const analyser = ctx.createAnalyser(); analyser.fftSize = 2048; analyserRef.current = analyser;
      const src = ctx.createMediaStreamSource(stream); src.connect(analyser);
      bufferRef.current = new Float32Array(analyser.fftSize);
      setListening(true); loop();
    }catch(e){ console.error(e); setFeedback("Microphone permission denied."); }
  }
  function stopListening(){
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    setListening(false);
  }

  function loop(){
    const analyser = analyserRef.current, buf = bufferRef.current, sr = audioCtxRef.current?.sampleRate || 44100;
    if (!analyser || !buf) return;
    analyser.getFloatTimeDomainData(buf);
    const freq = autoCorrelate(buf, sr);
    if (freq > 0 && freq < 1500) {
      const { midi, cents } = freqToMidiAndCents(freq);
      const writtenMidi = midi + 2; // CONCERT → WRITTEN (treble Bb) = +2 semitones
      const playedNameWritten = nameFromMidi(writtenMidi);
      const targetName = parseWritten(currentNote).name;
      setLiveCents(cents);
      setLivePlayed(playedNameWritten);
      setLiveOK(Math.abs(cents) <= 25 && playedNameWritten === targetName);
    }
    rafRef.current = requestAnimationFrame(loop);
  }

  useEffect(() => () => { stopListening(); audioCtxRef.current?.close?.(); }, []);

  /* -------- Scoring & popup -------- */
  const [attempts, setAttempts] = useState(0);
  const [pitchOK, setPitchOK] = useState(0);
  const [valvesOK, setValvesOK] = useState(0);
  const [bothOK, setBothOK] = useState(0);
  const [streak, setStreak] = useState(0);

  // Popup state
  const [showResult, setShowResult] = useState(false);
  const [resultOK, setResultOK] = useState(false);
  const [resultText, setResultText] = useState("");
  const popupTimerRef = useRef(null);

  /* -------- Valve input handlers -------- */
  function pressValve(v){
    let nv = valveInput.includes(v) ? valveInput.replace(v,"") : valveInput + v;
    nv = nv.split("").sort().join("");
    setValveInput(nv);

    const expectedList = expectedValvesFor(currentNote);
    const nvNorm = normalizeInput(nv);
    const valvesGood = expectedList.includes(nvNorm);

    setFeedback(
      valvesGood
        ? `✅ Valves OK (${nvNorm})`
        : `Valves ${nvNorm || "0"} — expected ${expectedList.join(" or ")}`
    );
  }

  // Explicit Open (0) handler
  function setOpenValves() {
    setValveInput("");
    const expectedList = expectedValvesFor(currentNote);
    const ok = expectedList.includes("0");
    setFeedback(ok ? "✅ Valves OK (0)" : `Valves 0 — expected ${expectedList.join(" or ")}`);
  }

  // Optional: keyboard shortcut "0" to set Open
  useEffect(() => {
    function onKey(e) {
      if (e.key === "0") setOpenValves();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  function submitAttempt(){
    const expectedList = expectedValvesFor(currentNote);
    const valvesGood = expectedList.includes(normalizeInput(valveInput)); // "" means open (0)
    const targetName = parseWritten(currentNote).name;
    const pitchGood = livePlayed === targetName && Math.abs(liveCents) <= 25;
    const bothGood = valvesGood && pitchGood;

    setAttempts(a => a + 1);
    if (valvesGood) setValvesOK(v => v + 1);
    if (pitchGood)  setPitchOK(p => p + 1);
    if (bothGood)   { setBothOK(b => b + 1); setStreak(s => s + 1); } else { setStreak(0); }

    setFeedback(
      bothGood
        ? `✅ Nailed it! (${targetName}, ${liveCents}¢)`
        : `Keep refining: ${targetName} (${liveCents}¢) — valves ${valvesGood ? "OK" : "check"}`
    );

    // Show popup for ~1.2s
    setResultOK(bothGood);
    setResultText(bothGood ? "Correct!" : "Incorrect");
    setShowResult(true);
    if (popupTimerRef.current) clearTimeout(popupTimerRef.current);
    popupTimerRef.current = setTimeout(() => setShowResult(false), 1200);

    // advance
    mode === "flashcards" ? nextFlashcard() : nextScaleStep();
  }

  function resetSession(){
    setAttempts(0); setPitchOK(0); setValvesOK(0); setBothOK(0); setStreak(0);
    setScaleIndex(0); setScaleAsc(true);
  }

  // init target
  useEffect(() => {
    if (mode === "flashcards") nextFlashcard();
    else {
      setScaleIndex(0); setScaleAsc(true);
      setCurrentNote(currentScale[0]);
      setFeedback(`Scale: ${selectedTonic} major — degree 1/${currentScale.length}`);
    }
    // eslint-disable-next-line
  }, [mode, selectedTonic]);

  const acc      = attempts ? Math.round((bothOK/attempts)*100)  : 0;
  const valveAcc = attempts ? Math.round((valvesOK/attempts)*100): 0;
  const pitchAcc = attempts ? Math.round((pitchOK/attempts)*100) : 0;

  /* -------- UI -------- */
  return (
    <div style={{ padding:16, maxWidth:900, margin:"0 auto", fontFamily:"system-ui, sans-serif" }}>
      <h1 style={{ fontSize:24, fontWeight:700, marginBottom:12 }}>🎺 Euph Coach — Treble Bb (3-valve)</h1>

      {/* Controls */}
      <div style={{ display:"flex", gap:8, flexWrap:"wrap", alignItems:"center", marginBottom:12 }}>
        <Segmented value={mode} onChange={setMode} options={[{label:"Flashcards", value:"flashcards"},{label:"Scales", value:"scales"}]} />
        {mode==="scales" && (
          <div style={{ display:"flex", gap:8, alignItems:"center" }}>
            <label style={{ fontSize:12 }}>Written key:</label>
            <select value={selectedTonic} onChange={e=>setSelectedTonic(e.target.value)}>
              {WRITTEN_TONICS.map(k=> <option key={k} value={k}>{k} major</option>)}
            </select>
          </div>
        )}
        <button onClick={startListening} style={btnPrimary}>{listening ? "Listening…" : "Start Listening"}</button>
        {listening && <button onClick={stopListening} style={btn}>Stop</button>}
        <button onClick={resetSession} style={btn}>Reset Session</button>
      </div>

      {/* Target note on treble staff (colour = green when liveOK) */}
      <div style={{ display: "flex", justifyContent: "center", marginBottom: 12 }}>
        <StaffNote note={currentNote} ok={liveOK} />
      </div>
      <div style={{ textAlign: "center", fontSize: 12, color: "#555", marginTop: -6, marginBottom: 12 }}>
        Target: {currentNote} • Pitch window: ±25¢ • Use 1/2/3 or <b>Open (0)</b>
      </div>

      {/* Valve pad */}
      <div style={{ display:"flex", justifyContent:"center", gap:16, marginBottom:12, flexWrap:"wrap" }}>
        {["1","2","3"].map(v=>(
          <button
            key={v}
            onClick={()=>pressValve(v)}
            style={{
              ...circleBtn,
              background: valveInput.includes(v) ? "#2563eb" : "white",
              color: valveInput.includes(v) ? "white" : "black"
            }}
          >
            {v}
          </button>
        ))}
        {/* Explicit open option */}
        <button
          onClick={setOpenValves}
          title="Open (no valves)"
          style={{
            ...circleBtn,
            width: 88,
            background: valveInput === "" ? "#0ea5e9" : "white",
            color: valveInput === "" ? "white" : "black"
          }}
        >
          Open<br/>(0)
        </button>
      </div>

      {/* Live meter */}
      <div style={{ display:"flex", justifyContent:"center", gap:8, marginBottom:12 }}>
        <Badge label={`Heard: ${livePlayed ?? "–"}`} ok={liveOK} />
        <Badge label={`${liveCents>0?"+":""}${liveCents}¢`} ok={Math.abs(liveCents)<=25} />
      </div>

      {/* Actions */}
      <div style={{ display:"flex", justifyContent:"center", gap:8, marginBottom:16 }}>
        {mode==="flashcards" ? (
          <button onClick={nextFlashcard} style={btnSuccess}>Next Note</button>
        ) : (
          <button onClick={nextScaleStep} style={btnSuccess}>Next Degree</button>
        )}
        <button onClick={submitAttempt} style={btnPurple}>Submit</button>
      </div>

      {/* Scorecards */}
      <div style={{ display:"grid", gridTemplateColumns:"repeat(4, minmax(0, 1fr))", gap:8, marginBottom:12 }}>
        <Stat label="Attempts"  value={attempts} />
        <Stat label="Both OK"   value={`${bothOK} (${acc}%)`} />
        <Stat label="Valves OK" value={`${valvesOK} (${valveAcc}%)`} />
        <Stat label="Pitch OK"  value={`${pitchOK} (${pitchAcc}%)`} />
      </div>
      <div style={{ textAlign:"center", marginBottom:16 }}>
        Streak: <span style={{ fontWeight:600 }}>{streak}</span>
      </div>

      {/* Popup overlay */}
      <ResultPopup visible={showResult} ok={resultOK} text={resultText} />

      <p style={{ fontSize:12, color:"#555", marginTop:8 }}>
        Tip: Open in a new tab/window so the browser shows the mic permission prompt.
      </p>
    </div>
  );
}

/* ------- tiny UI bits ------- */
function Segmented({ value, onChange, options }) {
  return (
    <div style={{ display:"inline-flex", border:"1px solid #ddd", borderRadius:12, overflow:"hidden" }}>
      {options.map(opt=>(
        <button
          key={opt.value}
          onClick={()=>onChange(opt.value)}
          style={{
            padding:"6px 10px",
            background:value===opt.value?"#111827":"white",
            color:value===opt.value?"white":"black",
            borderRight:"1px solid #eee"
          }}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}
function Stat({ label, value }) {
  return (
    <div style={{ border:"1px solid #eee", borderRadius:12, padding:12, textAlign:"center", boxShadow:"0 1px 2px rgba(0,0,0,0.03)" }}>
      <div style={{ fontSize:11, textTransform:"uppercase", color:"#6b7280" }}>{label}</div>
      <div style={{ fontSize:18, fontWeight:600 }}>{value}</div>
    </div>
  );
}
function Badge({ label, ok }) {
  return (
    <span style={{ padding:"4px 8px", borderRadius:999, fontSize:12, border:"1px solid "+(ok?"#bbf7d0":"#e5e7eb"), background: ok?"#f0fdf4":"#f9fafb" }}>
      {label}
    </span>
  );
}

/* ------- styles ------- */
const btn = { padding:"8px 12px", borderRadius:8, border:"1px solid #ddd", background:"white" };
const btnPrimary = { ...btn, background:"#2563eb", color:"white", border:"none" };
const btnSuccess = { ...btn, background:"#16a34a", color:"white", border:"none" };
const btnPurple  = { ...btn, background:"#7c3aed", color:"white", border:"none" };
const circleBtn  = { height:64, width:64, borderRadius:"9999px", fontSize:20, fontWeight:700, border:"2px solid #e5e7eb", lineHeight:"1.1", textAlign:"center" };
