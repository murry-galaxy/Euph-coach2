import React, { useMemo, useRef, useState, useEffect } from "react";
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

export default function PitchCoach() {
  // UI state
  const [mode, setMode] = useState("flashcards"); // "flashcards" | "scales"
  const [listening, setListening] = useState(false);
  const [currentNote, setCurrentNote] = useState("C4"); // WRITTEN target. NO TRANSPOSITION.
  const [errMsg, setErrMsg] = useState("");

  // Note helpers
  const NOTE_NAMES = ["C","C#","D","D#","E","F","F#","G","G#","A","A#","B"];
  const PRACTICE_POOL = useMemo(() => {
    const nameFromMidi = (m)=>NOTE_NAMES[(m%12+12)%12];
    const octaveFromMidi = (m)=>Math.floor(m/12)-1;
    const arr = [];
    for (let m = 60; m <= 71; m++) arr.push(`${nameFromMidi(m)}${octaveFromMidi(m)}`); // C4..B4
    return arr;
  }, []);
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
  }
  function nextScaleStep() {
    const seq = currentScale;
    if (!seq.length) return;
    let idx = scaleIndex + (scaleAsc ? 1 : -1);
    if (idx >= seq.length) { setScaleAsc(false); idx = Math.max(0, seq.length - 2); }
    if (idx < 0)            { setScaleAsc(true);  idx = 0; }
    setScaleIndex(idx);
    setCurrentNote(seq[idx]);
  }

  // -------- Pitch detection (NO TRANSPOSITION) ----------
  const audioCtxRef = useRef(null);
  const analyserRef = useRef(null);
  const bufferRef = useRef(null);
  const rafRef = useRef(null);
  const mediaStreamRef = useRef(null);

  const [liveCents, setLiveCents] = useState(0);
  const [detFreq, setDetFreq] = useState(null);
  const [micLevel, setMicLevel] = useState(0); // 0..1 RMS (debug)

  // Device selection
  const [devices, setDevices] = useState([]);
  const [deviceId, setDeviceId] = useState("");

  useEffect(() => {
    // enumerate devices after any permission is granted
    (async () => {
      try {
        const list = await navigator.mediaDevices.enumerateDevices?.();
        const inputs = (list || []).filter(d => d.kind === "audioinput");
        setDevices(inputs);
        if (!deviceId && inputs[0]?.deviceId) setDeviceId(inputs[0].deviceId);
      } catch (e) {
        // enumeration may fail before permission
      }
    })();
  }, [listening]); // after start we’ll have perms, so this populates

  function midiToFreq(midi){
    return 440 * Math.pow(2, (midi - 69) / 12);
  }
  function centsFromTarget(freqDetected, targetMidi){
    const targetFreq = midiToFreq(targetMidi);
    return Math.round(1200 * Math.log2(freqDetected / targetFreq));
  }

  const NOISE_GATE = 0.003; // lowered gate so brass onsets register

  function autoCorrelate(buf, sr){
    // support byte or float data arrays
    let SIZE = buf.length, rms = 0;
    for (let i=0;i<SIZE;i++) rms += buf[i]*buf[i];
    rms = Math.sqrt(rms/SIZE);
    setMicLevel(rms);

    if (rms < NOISE_GATE) return -1;

    // naive ACF
    const c = new Float32Array(SIZE);
    for (let i=0;i<SIZE;i++){ let sum=0; for(let j=0;j<SIZE-i;j++){ sum += buf[j]*buf[j+i]; } c[i]=sum; }
    let d=0; while (d+1 < SIZE && c[d] > c[d+1]) d++;
    let maxval=-1, maxpos=-1;
    for (let i=d;i<SIZE;i++){ if (c[i] > maxval){ maxval = c[i]; maxpos = i; } }
    const T0 = maxpos;
    return T0 <= 0 ? -1 : sr / T0;
  }

  function targetWrittenMidi(noteStr){
    const m = noteStr.match(/^([A-G](?:#|b)?)(\d)$/);
    if (!m) return 60; // C4
    const [_, raw, octStr] = m;
    const FLAT_TO_SHARP = { Ab:"G#", Bb:"A#", Db:"C#", Eb:"D#", Gb:"F#" };
    const name = raw.includes("b") ? (FLAT_TO_SHARP[raw] || raw) : raw;
    const oct = Number(octStr);
    const idx = NOTE_NAMES.indexOf(name);
    return (oct + 1) * 12 + idx;
  }

  async function startListening(){
    if (listening) return;
    setErrMsg("");
    try{
      const Ctx = window.AudioContext || window.webkitAudioContext;
      if (!Ctx) throw new Error("WebAudio not supported in this browser.");
      const ctx = new Ctx();
      audioCtxRef.current = ctx;

      if (ctx.state === "suspended") await ctx.resume();
      const resumeOnce = () => ctx.resume();
      document.body.addEventListener("touchstart", resumeOnce, { once: true });

      // request specific device if chosen
      const constraints = {
        audio: {
          deviceId: deviceId ? { exact: deviceId } : undefined,
          echoCancellation: false,
          noiseSuppression: false,
          autoGainControl: false
        }
      };

      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      mediaStreamRef.current = stream;

      // Build graph
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 2048;
      analyserRef.current = analyser;

      const src = ctx.createMediaStreamSource(stream);
      src.connect(analyser);

      bufferRef.current = new Float32Array(analyser.fftSize);

      // Populate device list after permission
      try {
        const list = await navigator.mediaDevices.enumerateDevices();
        const inputs = (list || []).filter(d => d.kind === "audioinput");
        setDevices(inputs);
      } catch {}

      setListening(true);
      rafRef.current = requestAnimationFrame(loop);
    }catch(e){
      console.error(e);
      setErrMsg((e && e.message) ? e.message : String(e));
      alert("Microphone blocked or unavailable for this domain. Click the padlock → Site settings → Microphone → Allow, then reload.");
    }
  }

  function stopListening(){
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    rafRef.current = null;
    setListening(false);

    try { mediaStreamRef.current?.getTracks?.().forEach(t => t.stop()); } catch {}
    mediaStreamRef.current = null;

    try { audioCtxRef.current?.close?.(); } catch {}
    audioCtxRef.current = null;
    analyserRef.current = null;
    bufferRef.current = null;
  }

  function loop(){
    const analyser = analyserRef.current, buf = bufferRef.current, ctx = audioCtxRef.current;
    if (!listening || !analyser || !buf || !ctx) return;

    // get data (fallback if Float API is quirky)
    try {
      analyser.getFloatTimeDomainData(buf);
    } catch {
      const bytes = new Uint8Array(analyser.fftSize);
      analyser.getByteTimeDomainData(bytes);
      for (let i=0;i<bytes.length;i++) buf[i] = (bytes[i]-128)/128;
    }

    const freq = autoCorrelate(buf, ctx.sampleRate || 44100);
    if (freq > 0 && freq < 1500) {
      setDetFreq(freq);
      const targetMidi = targetWrittenMidi(currentNote);
      const cents = centsFromTarget(freq, targetMidi);
      setLiveCents(Math.max(-100, Math.min(100, cents)));
    } else {
      setDetFreq(null);
    }
    rafRef.current = requestAnimationFrame(loop);
  }

  useEffect(() => () => { stopListening(); }, []);

  // Popup state
  const [showResult, setShowResult] = useState(false);
  const [resultOK, setResultOK] = useState(false);
  const [resultText, setResultText] = useState("");
  const popupTimerRef = useRef(null);

  function submitAttempt() {
    const ok = Math.abs(liveCents) <= 25;
    setResultOK(ok);
    setResultText(ok ? "In tune!" : "Out of tune");
    setShowResult(true);
    if (popupTimerRef.current) clearTimeout(popupTimerRef.current);
    popupTimerRef.current = setTimeout(() => setShowResult(false), 1200);
    mode === "flashcards" ? nextFlashcard() : nextScaleStep();
  }

  // UI styles
  const WRAP = { display:"flex", gap:8, flexWrap:"wrap", alignItems:"center", marginBottom:12 };
  const btn = { padding:"8px 12px", borderRadius:8, border:"1px solid #ddd", background:"white" };
  const btnPrimary = { ...btn, background:"#2563eb", color:"white", border:"none" };
  const btnSuccess = { ...btn, background:"#16a34a", color:"white", border:"none" };

  const clamped = Math.max(-100, Math.min(100, liveCents || 0));
  const pct = (clamped + 100) / 200 * 100;

  const targetWMidi = targetWrittenMidi(currentNote);
  const targetHz = Math.round(midiToFreq(targetWMidi) * 10) / 10;

  // simple test beep to verify AudioContext output path
  function testBeep() {
    try {
      const Ctx = window.AudioContext || window.webkitAudioContext;
      const ctx = new Ctx();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      gain.gain.value = 0.07;
      osc.frequency.value = 440;
      osc.connect(gain).connect(ctx.destination);
      osc.start();
      setTimeout(() => { osc.stop(); ctx.close(); }, 500);
    } catch {}
  }

  return (
    <div>
      <h2 style={{ fontSize:18, fontWeight:700, marginBottom:8 }}>Pitch Coach</h2>

      {/* Controls */}
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
          ? <button onClick={nextFlashcard} style={btn}>Next Note</button>
          : <button onClick={nextScaleStep} style={btn}>Next Degree</button>}

        {/* Device picker */}
        <select
          value={deviceId}
          onChange={(e)=>setDeviceId(e.target.value)}
          style={{ ...btn, minWidth:220 }}
          title="Input device"
        >
          {devices.length === 0 ? <option>Default mic (grant permission)</option> :
            devices.map(d => <option key={d.deviceId} value={d.deviceId}>{d.label || `Mic ${d.deviceId.slice(0,6)}…`}</option>)}
        </select>

        <button onClick={startListening} style={btnPrimary}>{listening ? "Listening…" : "Start Listening"}</button>
        {listening && <button onClick={stopListening} style={btn}>Stop</button>}
        <button onClick={submitAttempt} style={btnSuccess}>Submit</button>
        <button onClick={testBeep} style={btn}>Test Beep</button>
      </div>

      {/* Target staff */}
      <div style={{ display:"flex", justifyContent:"center", marginBottom: 12 }}>
        <StaffNote note={currentNote} ok={Math.abs(liveCents) <= 25} />
      </div>

      {/* Big tuning meter */}
      <div style={{ margin:"12px auto 4px", maxWidth:560 }}>
        <div style={{ display:"flex", justifyContent:"space-between", fontSize:12, color:"#6b7280", marginBottom:6 }}>
          <span>-100¢</span><span>0¢</span><span>+100¢</span>
        </div>
        <div style={{ position:"relative", height:18, background:"#f3f4f6", borderRadius:999 }}>
          <div style={{ position:"absolute", left:"37.5%", width:"25%", top:0, bottom:0, background:"rgba(34,197,94,0.25)", borderRadius:999 }}/>
          <div style={{ position:"absolute", left:`calc(${pct}% - 1px)`, top:-6, bottom:-6, width:2, background:"#111827", borderRadius:2, boxShadow:"0 0 0 2px rgba(0,0,0,0.03)", transition:"left 60ms linear" }}/>
        </div>
      </div>

      {/* Diagnostics / readout */}
      <div style={{ textAlign:"center", fontSize:13, color:"#374151", marginTop:8 }}>
        Target {currentNote} • ≈ {targetHz} Hz &nbsp;|&nbsp; Detected {detFreq ? `${detFreq.toFixed(1)} Hz` : "—"} &nbsp;|&nbsp; Offset {liveCents>0?"+":""}{liveCents ?? 0}¢
        <br/>
        Mic level (RMS): {micLevel.toFixed(3)} {micLevel < 0.003 ? "— (too low / no input)" : ""}
        {errMsg ? <div style={{ color:"#b91c1c", marginTop:6 }}>Error: {errMsg}</div> : null}
      </div>
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
