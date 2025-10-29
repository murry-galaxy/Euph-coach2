import React, { useMemo, useState, useRef, useEffect } from "react";
import StaffNote from "../StaffNote.jsx";

/* Popup */
function ResultPopup({ visible, ok, text }) {
  if (!visible) return null;
  const bg = ok ? "rgba(34,197,94,0.95)" : "rgba(220,38,38,0.95)";
  const emoji = ok ? "✅" : "❌";
  return (
    <div style={{ position: "fixed", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(0,0,0,0.25)", zIndex: 50 }}>
      <div style={{ padding: "20px 28px", borderRadius: 14, color: "white", background: bg, boxShadow: "0 10px 30px rgba(0,0,0,0.25)", fontSize: 24, fontWeight: 700, display: "flex", gap: 12, alignItems: "center", minWidth: 260, justifyContent: "center" }}>
        <span style={{ fontSize: 28 }}>{emoji}</span>
        <span>{text}</span>
      </div>
    </div>
  );
}

export default function ValveCoach() {
  const [mode, setMode] = useState("flashcards"); // "flashcards" | "scales"
  const [feedback, setFeedback] = useState("Pick the correct valves for the note.");

  const [currentNote, setCurrentNote] = useState("C4");
  const [valveInput, setValveInput] = useState(""); // "" means open
  const NOTE_NAMES = ["C","C#","D","D#","E","F","F#","G","G#","A","A#","B"];

  // 4th-octave (C4..B4) — Dave’s custom 3-valve map
const VALVES_BY_NOTE = {
  "C4":  ["0"],

  "C#4": ["123"], "Db4": ["123"],
  "D4":  ["13"],
  "D#4": ["23"],  "Eb4": ["23"],
  "E4":  ["12"],

  "F4":  ["1"],
  "F#4": ["2"],   "Gb4": ["2"],
  "G4":  ["0"],
  "G#4": ["23"],  "Ab4": ["23"],
  "A4":  ["12"],
  "A#4": ["1"],   "Bb4": ["1"],
  "B4":  ["2"]
};


  const PRACTICE_POOL = useMemo(() => {
    const nameFromMidi = (m)=>NOTE_NAMES[(m%12+12)%12];
    const octaveFromMidi = (m)=>Math.floor(m/12)-1;
    const arr = [];
    for (let m = 60; m <= 71; m++) arr.push(`${nameFromMidi(m)}${octaveFromMidi(m)}`);
    return arr;
  }, []);

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

  // Scale mode (4th octave clamp)
  const WRITTEN_TONICS = ["C","G","D","F","Bb","A","E","Eb"];
  const [selectedTonic, setSelectedTonic] = useState("C");
  const [scaleIndex, setScaleIndex] = useState(0);
  const [scaleAsc, setScaleAsc] = useState(true);
  const SCALE_STEPS = [2,2,1,2,2,2,1];

  function midiFromNoteName(name, octave){ const idx=NOTE_NAMES.indexOf(name); return (octave+1)*12+idx; }
  function nameFromMidi(m){ return NOTE_NAMES[(m%12+12)%12]; }
  function octaveFromMidi(m){ return Math.floor(m/12)-1; }

  function buildWrittenScale4(tonic) {
    const MAP = { Bb:"A#", Eb:"D#" };
    const tonicSharp = MAP[tonic] || tonic;
    const tMidi = midiFromNoteName(tonicSharp, 4);
    const seq = [tMidi]; let cur = tMidi;
    for (const s of SCALE_STEPS) { cur += s; seq.push(cur); }
    const CLAMP_MAX = 71;
    const clamped = seq.filter(m => m <= CLAMP_MAX);
    const safe = clamped.length ? clamped : [tMidi];
    return safe.map(m => `${nameFromMidi(m)}${octaveFromMidi(m)}`);
  }

  const currentScale = useMemo(() => buildWrittenScale4(selectedTonic), [selectedTonic]);

  function nextFlashcard() {
    const n = PRACTICE_POOL[Math.floor(Math.random()*PRACTICE_POOL.length)];
    setCurrentNote(n);
    setValveInput("");
    setFeedback("Pick the correct valves for the note.");
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
    setFeedback(`Scale: ${selectedTonic} — degree ${idx + 1}/${seq.length}`);
  }

  // Popup state
  const [showResult, setShowResult] = useState(false);
  const [resultOK, setResultOK] = useState(false);
  const [resultText, setResultText] = useState("");
  const popupTimerRef = useRef(null);

  // Progress-aware press logic
  function pressValve(v) {
    let nv = valveInput.includes(v) ? valveInput.replace(v, "") : valveInput + v;
    nv = nv.split("").sort().join("");
    setValveInput(nv);

    const expectedList = expectedValvesFor(currentNote);
    const expected = expectedList[0];
    const nvNorm = normalizeInput(nv);

    const isSubset = (a, b) => {
      if (a === "0") return b === "0";
      const A = new Set(a.split(""));
      const B = new Set(b.split(""));
      for (const d of A) if (!B.has(d)) return false;
      return true;
    };

    if (expected === "0") {
      setFeedback(nvNorm === "0" ? "✅ Valves OK (0)" : "Valves " + nvNorm + " — expected 0 (open)");
      return;
    }
    if (nvNorm === expected) {
      setFeedback(`✅ Valves OK (${nvNorm})`);
      return;
    }
    if (nvNorm !== "0" && nvNorm.length < expected.length && isSubset(nvNorm, expected)) {
      setFeedback(`…good — keep going (${nvNorm} → ${expected})`);
      return;
    }
    setFeedback(`Valves ${nvNorm === "0" ? "0" : nvNorm} — expected ${expected}`);
  }

  function setOpenValves() {
    setValveInput("");
    const expected = expectedValvesFor(currentNote)[0];
    setFeedback(expected === "0" ? "✅ Valves OK (0)" : `Valves 0 — expected ${expected}`);
  }

  useEffect(() => {
    function onKey(e) { if (e.key === "0") setOpenValves(); }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  function submitAttempt() {
    const expectedList = expectedValvesFor(currentNote);
    const ok = expectedList.includes(normalizeInput(valveInput));
    setResultOK(ok);
    setResultText(ok ? "Correct!" : "Incorrect");
    setShowResult(true);
    if (popupTimerRef.current) clearTimeout(popupTimerRef.current);
    popupTimerRef.current = setTimeout(() => setShowResult(false), 1200);
    mode === "flashcards" ? nextFlashcard() : nextScaleStep();
  }

  const WRAP = { display:"flex", gap:8, flexWrap:"wrap", alignItems:"center", marginBottom:12 };
  const btn = { padding:"8px 12px", borderRadius:8, border:"1px solid #ddd", background:"white" };
  const btnPrimary = { ...btn, background:"#2563eb", color:"white", border:"none" };
  const btnSuccess = { ...btn, background:"#16a34a", color:"white", border:"none" };
  const circleBtn  = { height:64, width:64, borderRadius:"9999px", fontSize:20, fontWeight:700, border:"2px solid #e5e7eb", lineHeight:"1.1", textAlign:"center" };

  return (
    <div>
      <h2 style={{ fontSize:18, fontWeight:700, marginBottom:8 }}>Valve Coach</h2>
      <div style={WRAP}>
        <Segmented value={mode} onChange={setMode} options={[{label:"Flashcards", value:"flashcards"},{label:"Scales", value:"scales"}]} />
        {mode==="scales" && (
          <div style={{ display:"flex", gap:8, alignItems:"center" }}>
            <label style={{ fontSize:12 }}>Written key:</label>
            <select value={selectedTonic} onChange={e=>setSelectedTonic(e.target.value)}>
              {WRITTEN_TONICS.map(k=> <option key={k} value={k}>{k} major</option>)}
            </select>
          </div>
        )}
        {mode==="flashcards"
          ? <button onClick={nextFlashcard} style={btnPrimary}>Next Note</button>
          : <button onClick={nextScaleStep} style={btnPrimary}>Next Degree</button>}
        <button onClick={submitAttempt} style={btnSuccess}>Submit</button>
      </div>

      {/* Staff target */}
      <div style={{ display:"flex", justifyContent:"center", marginBottom: 12 }}>
        <StaffNote note={currentNote} ok={false} />
      </div>
      <div style={{ textAlign:"center", fontSize:12, color:"#555", marginTop:-6, marginBottom:12 }}>
        Target: {currentNote} • Use 1/2/3 or <b>Open (0)</b>
      </div>

      {/* Valve pad */}
      <div style={{ display:"flex", justifyContent:"center", gap:16, marginBottom:12, flexWrap:"wrap" }}>
        {["1","2","3"].map(v=>(
          <button
            key={v}
            onClick={()=>pressValve(v)}
            style={{ ...circleBtn, background: valveInput.includes(v) ? "#2563eb" : "white", color: valveInput.includes(v) ? "white" : "black" }}
          >
            {v}
          </button>
        ))}
        <button
          onClick={setOpenValves}
          title="Open (no valves)"
          style={{ ...circleBtn, width: 88, background: valveInput === "" ? "#0ea5e9" : "white", color: valveInput === "" ? "white" : "black" }}
        >
          Open<br/>(0)
        </button>
      </div>

      <p style={{ textAlign:"center", minHeight:24 }}>{feedback}</p>

      <ResultPopup visible={showResult} ok={resultOK} text={resultText} />
    </div>
  );
}

/* Small UI bits */
function Segmented({ value, onChange, options }) {
  return (
    <div style={{ display:"inline-flex", border:"1px solid #ddd", borderRadius:12, overflow:"hidden" }}>
      {options.map(opt=>(
        <button key={opt.value} onClick={()=>onChange(opt.value)}
          style={{ padding:"6px 10px", background:value===opt.value?"#111827":"white", color:value===opt.value?"white":"black", borderRight:"1px solid #eee" }}>
          {opt.label}
        </button>
      ))}
    </div>
  );
}

