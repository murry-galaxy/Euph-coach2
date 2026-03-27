import React, { useState, useRef, useEffect, useMemo } from "react";
import StaffNote from "../StaffNote.jsx";

// ─── Result popup ─────────────────────────────────────────────────────────────
function ResultPopup({ visible, ok, text }) {
  if (!visible) return null;
  return (
    <div style={{
      position:"fixed", inset:0, display:"flex", alignItems:"center",
      justifyContent:"center", background:"rgba(0,0,0,0.3)", zIndex:50,
    }}>
      <div style={{
        padding:"24px 36px", borderRadius:20,
        background: ok ? "#16a34a" : "#dc2626",
        color:"white", fontSize:28, fontWeight:800,
        display:"flex", gap:14, alignItems:"center",
        boxShadow:"0 20px 60px rgba(0,0,0,0.3)",
        animation:"popIn 0.15s ease-out",
      }}>
        <span style={{ fontSize:36 }}>{ok ? "✅" : "❌"}</span>
        {text}
      </div>
      <style>{`@keyframes popIn { from { transform:scale(0.8); opacity:0 } to { transform:scale(1); opacity:1 } }`}</style>
    </div>
  );
}

// ─── Valve diagram — three cylinders showing pressed/unpressed ────────────────
function ValveDiagram({ pressed }) {
  // pressed: e.g. "13" means valves 1 and 3 are down
  const valves = ["1","2","3"];
  return (
    <div style={{ display:"flex", gap:10, justifyContent:"center", alignItems:"flex-end" }}>
      {valves.map(v => {
        const isDown = pressed !== "0" && pressed.includes(v);
        return (
          <div key={v} style={{ display:"flex", flexDirection:"column", alignItems:"center", gap:4 }}>
            {/* Label */}
            <div style={{ fontSize:11, fontWeight:600, color:"#6b7280" }}>{v}</div>
            {/* Outer casing */}
            <div style={{
              width:32, height:70, borderRadius:16,
              background:"#e5e7eb", border:"2px solid #d1d5db",
              position:"relative", overflow:"hidden",
            }}>
              {/* Piston */}
              <div style={{
                position:"absolute", left:4, right:4,
                height:32, borderRadius:12,
                background: isDown
                  ? "linear-gradient(180deg,#2563eb,#1d4ed8)"
                  : "linear-gradient(180deg,#f9fafb,#e5e7eb)",
                border: isDown ? "2px solid #1e40af" : "2px solid #d1d5db",
                top: isDown ? 26 : 4,
                transition:"top 0.15s ease, background 0.15s",
                boxShadow: isDown ? "inset 0 2px 4px rgba(0,0,0,0.2)" : "0 2px 4px rgba(0,0,0,0.1)",
              }} />
            </div>
            {/* Down indicator dot */}
            <div style={{
              width:8, height:8, borderRadius:"50%",
              background: isDown ? "#2563eb" : "#e5e7eb",
              transition:"background 0.15s",
            }} />
          </div>
        );
      })}
    </div>
  );
}

// ─── Data ─────────────────────────────────────────────────────────────────────
const NOTE_NAMES = ["C","C#","D","D#","E","F","F#","G","G#","A","A#","B"];

const VALVES_BY_NOTE = {
  "C4":["0"],
  "C#4":["123"],"Db4":["123"],
  "D4":["13"],
  "D#4":["23"],"Eb4":["23"],
  "E4":["12"],
  "F4":["1"],
  "F#4":["2"],"Gb4":["2"],
  "G4":["0"],
  "G#4":["23"],"Ab4":["23"],
  "A4":["12"],
  "A#4":["1"],"Bb4":["1"],
  "B4":["2"],
};

const WRITTEN_TONICS = ["C","G","D","F","Bb","A","E","Eb"];
const SCALE_STEPS    = [2,2,1,2,2,2,1];

// ─── Helpers ──────────────────────────────────────────────────────────────────
function midiFromName(name, oct) {
  return (oct + 1) * 12 + NOTE_NAMES.indexOf(name);
}
function nameFromMidi(m) { return NOTE_NAMES[(m % 12 + 12) % 12]; }
function octFromMidi(m)  { return Math.floor(m / 12) - 1; }
function toSharp(name) {
  return { Ab:"G#",Bb:"A#",Db:"C#",Eb:"D#",Gb:"F#" }[name] || name;
}
function expectedValves(note) {
  const m = String(note).match(/^([A-G](?:#|b)?)(\d)$/);
  if (!m) return ["0"];
  return VALVES_BY_NOTE[`${toSharp(m[1])}${m[2]}`] || ["0"];
}
function normalizeInput(v) {
  if (!v) return "0";
  return v === "0" ? "0" : v.split("").sort().join("");
}

// ─── Main component ───────────────────────────────────────────────────────────
export default function ValveCoach() {
  const [mode, setMode]           = useState("flashcards");
  const [currentNote, setCurrentNote] = useState("C4");
  const [valveInput, setValveInput]   = useState("");
  const [feedback, setFeedback]       = useState(null); // null | "correct" | "wrong" | "partial"
  const [feedbackMsg, setFeedbackMsg] = useState("Select the valves for the note shown.");
  const [streak, setStreak]           = useState(0);
  const [bestStreak, setBestStreak]   = useState(0);

  // Scale mode
  const [selectedTonic, setSelectedTonic] = useState("C");
  const [scaleIndex, setScaleIndex]       = useState(0);
  const [scaleAsc, setScaleAsc]           = useState(true);

  // Popup
  const [showResult, setShowResult] = useState(false);
  const [resultOK, setResultOK]     = useState(false);
  const [resultText, setResultText] = useState("");
  const popupTimer = useRef(null);

  // Practice pool (C4–B4)
  const PRACTICE_POOL = useMemo(() => {
    const arr = [];
    for (let m = 60; m <= 71; m++) arr.push(`${nameFromMidi(m)}${octFromMidi(m)}`);
    return arr;
  }, []);

  // Scale builder
  const currentScale = useMemo(() => {
    const sharp = toSharp(selectedTonic);
    const tMidi = midiFromName(sharp, 4);
    const seq = [tMidi];
    let cur = tMidi;
    for (const s of SCALE_STEPS) { cur += s; seq.push(cur); }
    return seq.filter(m => m <= 71).map(m => `${nameFromMidi(m)}${octFromMidi(m)}`);
  }, [selectedTonic]);

  // Derived
  const expected   = expectedValves(currentNote)[0];
  const inputNorm  = normalizeInput(valveInput);
  const displayValves = valveInput || "0"; // what to show in diagram

  // ── Feedback logic on every valve press ───────────────
  function calcFeedback(nv) {
    const exp = expectedValves(currentNote)[0];
    const nvNorm = normalizeInput(nv);
    if (exp === "0") {
      if (nvNorm === "0") return { state:"correct", msg:"✓ Open — correct!" };
      return { state:"wrong", msg:`Expected open (0), got ${nvNorm}` };
    }
    if (nvNorm === exp) return { state:"correct", msg:`✓ ${exp} — correct!` };
    if (nvNorm !== "0" && nvNorm.length < exp.length) {
      const isSubset = nvNorm.split("").every(d => exp.includes(d));
      if (isSubset) return { state:"partial", msg:`Good start… keep going (need ${exp})` };
    }
    if (nvNorm !== "0") return { state:"wrong", msg:`Got ${nvNorm}, expected ${exp}` };
    return { state:null, msg:"Select the valves for the note shown." };
  }

  function pressValve(v) {
    let nv = valveInput.includes(v)
      ? valveInput.replace(v, "")
      : valveInput + v;
    nv = nv.split("").sort().join("");
    setValveInput(nv);
    const { state, msg } = calcFeedback(nv);
    setFeedback(state);
    setFeedbackMsg(msg);
  }

  function pressOpen() {
    setValveInput("");
    const { state, msg } = calcFeedback("");
    setFeedback(state);
    setFeedbackMsg(msg);
  }

  function nextFlashcard() {
    const n = PRACTICE_POOL[Math.floor(Math.random() * PRACTICE_POOL.length)];
    setCurrentNote(n);
    setValveInput("");
    setFeedback(null);
    setFeedbackMsg("Select the valves for the note shown.");
  }

  function nextScaleStep() {
    if (!currentScale.length) return;
    let idx = scaleIndex + (scaleAsc ? 1 : -1);
    if (idx >= currentScale.length) { setScaleAsc(false); idx = Math.max(0, currentScale.length - 2); }
    if (idx < 0)                    { setScaleAsc(true);  idx = 0; }
    setScaleIndex(idx);
    setCurrentNote(currentScale[idx]);
    setValveInput("");
    setFeedback(null);
    setFeedbackMsg(`${selectedTonic} major · note ${idx + 1} of ${currentScale.length}`);
  }

  function submitAttempt() {
    const ok = expectedValves(currentNote).includes(inputNorm);
    setResultOK(ok);
    setResultText(ok ? "Correct!" : `Expected ${expected}`);
    setShowResult(true);
    if (popupTimer.current) clearTimeout(popupTimer.current);
    popupTimer.current = setTimeout(() => setShowResult(false), 1100);

    if (ok) {
      const ns = streak + 1;
      setStreak(ns);
      setBestStreak(b => Math.max(b, ns));
    } else {
      setStreak(0);
    }
    mode === "flashcards" ? nextFlashcard() : nextScaleStep();
  }

  // Key shortcut: 0 = open
  useEffect(() => {
    function onKey(e) {
      if (e.key === "0") pressOpen();
      if (["1","2","3"].includes(e.key)) pressValve(e.key);
      if (e.key === "Enter") submitAttempt();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [valveInput, currentNote, mode, streak]);

  // ── Feedback bar colour ────────────────────────────────
  const feedbackColor = {
    correct: "#16a34a",
    partial: "#d97706",
    wrong:   "#dc2626",
    null:    "#6b7280",
  }[feedback] || "#6b7280";

  const feedbackBg = {
    correct: "#f0fdf4",
    partial: "#fffbeb",
    wrong:   "#fef2f2",
    null:    "#f9fafb",
  }[feedback] || "#f9fafb";

  // ── Styles ─────────────────────────────────────────────
  const card = {
    background:"white", border:"1px solid #e5e7eb",
    borderRadius:16, padding:20, marginBottom:14,
  };

  const segBtn = (active) => ({
    padding:"7px 16px",
    background: active ? "#111827" : "white",
    color: active ? "white" : "#374151",
    border:"none", fontWeight:600, fontSize:13, cursor:"pointer",
  });

  // ── Render ─────────────────────────────────────────────
  return (
    <div style={{ maxWidth:480, margin:"0 auto" }}>
      <h2 style={{ fontSize:18, fontWeight:700, marginBottom:4 }}>Valve Coach</h2>

      {/* ── Streak bar ── */}
      <div style={{ display:"flex", gap:12, marginBottom:14 }}>
        <div style={{ ...card, padding:"10px 16px", marginBottom:0, flex:1, textAlign:"center" }}>
          <div style={{ fontSize:11, color:"#9ca3af", marginBottom:2 }}>Streak</div>
          <div style={{ fontSize:26, fontWeight:800, color: streak > 0 ? "#f59e0b" : "#d1d5db" }}>
            {streak > 0 ? `🔥 ${streak}` : "0"}
          </div>
        </div>
        <div style={{ ...card, padding:"10px 16px", marginBottom:0, flex:1, textAlign:"center" }}>
          <div style={{ fontSize:11, color:"#9ca3af", marginBottom:2 }}>Best</div>
          <div style={{ fontSize:26, fontWeight:800, color:"#6b7280" }}>{bestStreak}</div>
        </div>
      </div>

      {/* ── Mode + scale selector ── */}
      <div style={{ ...card, padding:"12px 16px" }}>
        <div style={{ display:"flex", gap:10, alignItems:"center", flexWrap:"wrap" }}>
          <div style={{ display:"inline-flex", border:"1px solid #e5e7eb", borderRadius:10, overflow:"hidden" }}>
            <button style={segBtn(mode==="flashcards")} onClick={() => setMode("flashcards")}>Flashcards</button>
            <button style={segBtn(mode==="scales")}     onClick={() => setMode("scales")}>Scales</button>
          </div>
          {mode === "scales" && (
            <select
              value={selectedTonic}
              onChange={e => { setSelectedTonic(e.target.value); setScaleIndex(0); setScaleAsc(true); }}
              style={{ padding:"6px 10px", borderRadius:8, border:"1px solid #e5e7eb", fontSize:13 }}
            >
              {WRITTEN_TONICS.map(k => <option key={k} value={k}>{k} major</option>)}
            </select>
          )}
        </div>
      </div>

      {/* ── Staff + note display ── */}
      <div style={{ ...card, textAlign:"center" }}>
        <div style={{ display:"flex", justifyContent:"center", overflow:"hidden" }}>
          <StaffNote note={currentNote} ok={feedback === "correct" ? true : feedback === "wrong" ? false : undefined} />
        </div>
        <div style={{ fontSize:13, color:"#6b7280", marginTop:-4 }}>
          <strong style={{ color:"#111827", fontSize:16 }}>{currentNote}</strong>
          {" "}· expected valves: <strong>{expected}</strong>
        </div>
      </div>

      {/* ── Valve diagram ── */}
      <div style={{ ...card, textAlign:"center" }}>
        <div style={{ fontSize:11, color:"#9ca3af", marginBottom:10, textTransform:"uppercase", letterSpacing:1 }}>
          Valve positions
        </div>
        <ValveDiagram pressed={displayValves} />
        <div style={{ fontSize:12, color:"#9ca3af", marginTop:10 }}>
          {inputNorm === "0" ? "Open (no valves)" : `Valves ${inputNorm} pressed`}
        </div>
      </div>

      {/* ── Valve pad ── */}
      <div style={{ ...card }}>
        <div style={{ fontSize:11, color:"#9ca3af", marginBottom:12, textTransform:"uppercase", letterSpacing:1, textAlign:"center" }}>
          Press valves · keyboard: 1 2 3 0 · Enter to submit
        </div>
        <div style={{ display:"flex", justifyContent:"center", gap:14, marginBottom:0 }}>
          {["1","2","3"].map(v => {
            const active = valveInput.includes(v);
            return (
              <button key={v} onClick={() => pressValve(v)} style={{
                width:72, height:72, borderRadius:"50%",
                fontSize:24, fontWeight:800,
                background: active
                  ? "linear-gradient(180deg,#3b82f6,#2563eb)"
                  : "linear-gradient(180deg,#f9fafb,#e5e7eb)",
                color: active ? "white" : "#374151",
                border: active ? "3px solid #1d4ed8" : "3px solid #d1d5db",
                boxShadow: active
                  ? "0 4px 12px rgba(37,99,235,0.4), inset 0 2px 4px rgba(255,255,255,0.2)"
                  : "0 2px 4px rgba(0,0,0,0.08), inset 0 1px 2px rgba(255,255,255,0.8)",
                transform: active ? "translateY(2px)" : "none",
                transition:"all 0.1s ease",
                cursor:"pointer",
              }}>
                {v}
              </button>
            );
          })}
          <button onClick={pressOpen} style={{
            width:88, height:72, borderRadius:36,
            fontSize:13, fontWeight:700,
            background: !valveInput
              ? "linear-gradient(180deg,#0ea5e9,#0284c7)"
              : "linear-gradient(180deg,#f9fafb,#e5e7eb)",
            color: !valveInput ? "white" : "#374151",
            border: !valveInput ? "3px solid #0369a1" : "3px solid #d1d5db",
            boxShadow: !valveInput
              ? "0 4px 12px rgba(14,165,233,0.4)"
              : "0 2px 4px rgba(0,0,0,0.08)",
            transform: !valveInput ? "translateY(2px)" : "none",
            transition:"all 0.1s ease",
            cursor:"pointer",
          }}>
            Open<br/>(0)
          </button>
        </div>
      </div>

      {/* ── Feedback bar ── */}
      <div style={{
        borderRadius:12, padding:"12px 16px",
        background: feedbackBg,
        border:`1.5px solid ${feedbackColor}22`,
        color: feedbackColor,
        fontSize:14, fontWeight:600,
        textAlign:"center",
        marginBottom:14,
        transition:"all 0.2s",
        minHeight:44,
        display:"flex", alignItems:"center", justifyContent:"center",
      }}>
        {feedbackMsg}
      </div>

      {/* ── Submit + Next ── */}
      <div style={{ display:"flex", gap:10 }}>
        <button onClick={submitAttempt} style={{
          flex:1, padding:"14px 0", borderRadius:12, border:"none",
          background:"linear-gradient(180deg,#16a34a,#15803d)",
          color:"white", fontSize:16, fontWeight:700, cursor:"pointer",
          boxShadow:"0 4px 12px rgba(22,163,74,0.3)",
        }}>
          Submit ↵
        </button>
        <button
          onClick={mode === "flashcards" ? nextFlashcard : nextScaleStep}
          style={{
            padding:"14px 20px", borderRadius:12,
            border:"1px solid #e5e7eb", background:"white",
            color:"#374151", fontSize:14, fontWeight:600, cursor:"pointer",
          }}
        >
          Skip →
        </button>
      </div>

      <ResultPopup visible={showResult} ok={resultOK} text={resultText} />
    </div>
  );
}

/* Segmented control (kept for any future use) */
function Segmented({ value, onChange, options }) {
  return (
    <div style={{ display:"inline-flex", border:"1px solid #e5e7eb", borderRadius:10, overflow:"hidden" }}>
      {options.map(opt => (
        <button key={opt.value} onClick={() => onChange(opt.value)} style={{
          padding:"7px 14px",
          background: value === opt.value ? "#111827" : "white",
          color: value === opt.value ? "white" : "#374151",
          border:"none", fontWeight:600, fontSize:13, cursor:"pointer",
        }}>
          {opt.label}
        </button>
      ))}
    </div>
  );
}
