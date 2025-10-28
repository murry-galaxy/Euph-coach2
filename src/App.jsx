import React, { useEffect, useMemo, useRef, useState } from "react";
import StaffNote from "./StaffNote.jsx";

export default function App() {
  const [mode, setMode] = useState("flashcards");
  const [listening, setListening] = useState(false);
  const [feedback, setFeedback] = useState("Press Start Listening, then play the note.");

  const [currentNote, setCurrentNote] = useState("C4");
  const [valveInput, setValveInput] = useState("");

  const NOTE_NAMES = ["C","C#","D","D#","E","F","F#","G","G#","A","A#","B"];
  const VALVE_MAP = { C:"0","C#":"12", D:"13","D#":"23", E:"12", F:"1","F#":"123", G:"13","G#":"23", A:"12","A#":"1", B:"2" };

  const PRACTICE_POOL = useMemo(() => {
    const nameFromMidi = (m)=>NOTE_NAMES[(m%12+12)%12];
    const octaveFromMidi = (m)=>Math.floor(m/12)-1;
    const arr=[]; for(let m=60;m<=83;m++) arr.push(`${nameFromMidi(m)}${octaveFromMidi(m)}`);
    return arr;
  }, []);

  function parseWritten(note) {
    const m = note.match(/([A-G](?:#|b)?)(\d)/);
    if (!m) return { name:"C", octave:4 };
    let name = m[1];
    const FLAT_TO_SHARP = { Ab:"G#", Bb:"A#", Db:"C#", Eb:"D#", Gb:"F#" };
    if (name.includes("b")) name = FLAT_TO_SHARP[name] || name;
    return { name, octave: Number(m[2]) };
  }

  const WRITTEN_TONICS = ["C","G","D","F","Bb","A","E","Eb"];
  const [selectedTonic, setSelectedTonic] = useState("C");
  const [scaleIndex, setScaleIndex] = useState(0);
  const [scaleAsc, setScaleAsc] = useState(true);
  const SCALE_STEPS = [2,2,1,2,2,2,1];

  function midiFromNoteName(name, octave){ const idx=NOTE_NAMES.indexOf(name); return (octave+1)*12+idx; }
  function nameFromMidi(m){ return NOTE_NAMES[(m%12+12)%12]; }
  function octaveFromMidi(m){ return Math.floor(m/12)-1; }

  function buildWrittenScale(tonic, octave=4){
    const MAP={ Bb:"A#", Eb:"D#" };
    const tonicSharp = MAP[tonic] || tonic;
    const tMidi = midiFromNoteName(tonicSharp, octave);
    const seq=[tMidi]; let cur=tMidi;
    for(const s of SCALE_STEPS){ cur+=s; seq.push(cur); }
    return seq.map(m=>`${nameFromMidi(m)}${octaveFromMidi(m)}`);
  }

  const currentScale = useMemo(()=>{
    const startOct = (selectedTonic==="A"||selectedTonic==="B") ? 3 : 4;
    return buildWrittenScale(selectedTonic, startOct);
  },[selectedTonic]);

  function nextFlashcard(){
    const n = PRACTICE_POOL[Math.floor(Math.random()*PRACTICE_POOL.length)];
    setCurrentNote(n); setValveInput(""); setFeedback("Play the note and press your valves!");
  }
  function nextScaleStep(){
    const seq = currentScale;
    let idx = scaleIndex + (scaleAsc?1:-1);
    if (idx >= seq.length){ setScaleAsc(false); idx = seq.length - 2; }
    if (idx < 0){ setScaleAsc(true); idx = 0; }
    setScaleIndex(idx);
    setCurrentNote(seq[idx]);
    setValveInput("");
    setFeedback(`Scale: ${selectedTonic} major — degree ${idx+1}/${seq.length}`);
  }

  const audioCtxRef = useRef(null);
  const analyserRef = useRef(null);
  const bufferRef = useRef(null);
  const rafRef = useRef(null);

  const [liveCents, setLiveCents] = useState(0);
  const [livePlayed, setLivePlayed] = useState(null);
  const [liveOK, setLiveOK] = useState(false);

  function freqToMidiAndCents(freq){
    const A4=440; const midi=Math.round(12*Math.log2(freq/A4))+69; const est=A4*Math.pow(2,(midi-69)/12);
    const cents=Math.round(1200*Math.log2(freq/est)); return {midi,cents};
  }
  function autoCorrelate(buf, sr){
    let SIZE=buf.length, rms=0; for(let i=0;i<SIZE;i++) rms+=buf[i]*buf[i];
    rms=Math.sqrt(rms/SIZE); if(rms<0.008) return -1;
    const c=new Float32Array(SIZE);
    for(let i=0;i<SIZE;i++){ let sum=0; for(let j=0;j<SIZE-i;j++){ sum+=buf[j]*buf[j+i]; } c[i]=sum; }
    let d=0; while(c[d]>c[d+1]) d++; let maxval=-1,maxpos=-1;
    for(let i=d;i<SIZE;i++){ if(c[i]>maxval){ maxval=c[i]; maxpos=i; } }
    const T0=maxpos; return T0<=0?-1:sr/T0;
  }

  async function startListening(){
    if (listening) return;
    try{
      const stream = await navigator.mediaDevices.getUserMedia({ audio:{ echoCancellation:false, noiseSuppression:false }});
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      audioCtxRef.current = ctx;
      const analyser = ctx.createAnalyser(); analyser.fftSize=2048; analyserRef.current = analyser;
      const src = ctx.createMediaStreamSource(stream); src.connect(analyser);
      bufferRef.current = new Float32Array(analyser.fftSize);
      setListening(true); loop();
    }catch(e){ console.error(e); setFeedback("Microphone permission denied."); }
  }
  function stopListening(){ if(rafRef.current) cancelAnimationFrame(rafRef.current); setListening(false); }

  function loop(){
    const analyser=analyserRef.current, buf=bufferRef.current, sr=audioCtxRef.current?.sampleRate||44100;
    if(!analyser||!buf) return;
    analyser.getFloatTimeDomainData(buf);
    const freq = autoCorrelate(buf, sr);
    if (freq>0 && freq<1500){
      const {midi,cents} = freqToMidiAndCents(freq);
      const writtenMidi = midi + 2; // CONCERT -> WRITTEN Bb treble
      const playedNameWritten = nameFromMidi(writtenMidi);
      const targetName = parseWritten(currentNote).name;
      setLiveCents(cents);
      setLivePlayed(playedNameWritten);
      setLiveOK(Math.abs(cents)<=25 && playedNameWritten===targetName);
    }
    rafRef.current = requestAnimationFrame(loop);
  }

  useEffect(()=>()=>{ stopListening(); audioCtxRef.current?.close?.(); },[]);

  const [attempts, setAttempts] = useState(0);
  const [pitchOK, setPitchOK] = useState(0);
  const [valvesOK, setValvesOK] = useState(0);
  const [bothOK, setBothOK] = useState(0);
  const [streak, setStreak] = useState(0);
  const [history, setHistory] = useState([]);

  function pressValve(v){
    let nv = valveInput.includes(v) ? valveInput.replace(v,"") : valveInput + v;
    nv = nv.split("").sort().join("");
    setValveInput(nv);
    const targetName = parseWritten(currentNote).name;
    const expected = VALVE_MAP[targetName];
    setFeedback(nv===expected ? `✅ Valves OK (${nv||"0"})` : `Valves ${nv||"0"} — expected ${expected}`);
  }

  function submitAttempt(){
    const targetName = parseWritten(currentNote).name;
    const expected = VALVE_MAP[targetName];
    const valvesGood = (valveInput || "0") === expected;
    const pitchGood = livePlayed === targetName && Math.abs(liveCents) <= 25;
    const bothGood = valvesGood && pitchGood;

    setAttempts(a=>a+1);
    if (valvesGood) setValvesOK(v=>v+1);
    if (pitchGood) setPitchOK(p=>p+1);
    if (bothGood){ setBothOK(b=>b+1); setStreak(s=>s+1); } else { setStreak(0); }

    setHistory(h=>[{ ts:Date.now(), note:currentNote, inTune:pitchGood, valves:valvesGood, cents:liveCents }, ...h].slice(0,100));
    setFeedback(bothGood ? `✅ Nailed it! (${targetName}, ${liveCents}¢)` : `Keep refining: ${targetName} (${liveCents}¢) — valves ${valvesGood?"OK":"check"}`);

    mode==="flashcards" ? nextFlashcard() : nextScaleStep();
  }

  function resetSession(){
    setAttempts(0); setPitchOK(0); setValvesOK(0); setBothOK(0); setStreak(0); setHistory([]);
    setScaleIndex(0); setScaleAsc(true);
  }

  useEffect(()=>{
    if (mode==="flashcards") nextFlashcard();
    else { setScaleIndex(0); setScaleAsc(true); setCurrentNote(currentScale[0]); setFeedback(`Scale: ${selectedTonic} major — degree 1/${currentScale.length}`); }
    // eslint-disable-next-line
  },[mode, selectedTonic]);

  const acc      = attempts ? Math.round((bothOK/attempts)*100)  : 0;
  const valveAcc = attempts ? Math.round((valvesOK/attempts)*100): 0;
  const pitchAcc = attempts ? Math.round((pitchOK/attempts)*100) : 0;

  return (
    <div style={{ padding:16, maxWidth:900, margin:"0 auto", fontFamily:"system-ui, sans-serif" }}>
      <h1 style={{ fontSize:24, fontWeight:700, marginBottom:12 }}>🎺 Euph Coach — Treble Bb (3-valve)</h1>

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
        <button onClick={startListening} style={btnPrimary}>{listening?"Listening…":"Start Listening"}</button>
        {listening && <button onClick={stopListening} style={btn}>Stop</button>}
        <button onClick={resetSession} style={btn}>Reset Session</button>
      </div>

      <div style={{ textAlign:"center", marginBottom:12 }}>
        <div style={{ fontSize:48, fontFamily:"monospace" }}>{currentNote}</div>
        <div style={{ fontSize:12, color:"#555", marginTop:4 }}>
          Pitch window: ±25¢ | Press valves, then play & Submit
        </div>
      </div>

      <div style={{ display:"flex", justifyContent:"center", gap:16, marginBottom:12 }}>
        {["1","2","3"].map(v=>(
          <button key={v} onClick={()=>pressValve(v)} style={{...circleBtn, background: valveInput.includes(v)?"#2563eb":"white", color: valveInput.includes(v)?"white":"black"}}>{v}</button>
        ))}
      </div>

      <div style={{ display:"flex", justifyContent:"center", gap:8, marginBottom:12 }}>
        <Badge label={`Heard: ${livePlayed ?? "–"}`} ok={liveOK} />
        <Badge label={`${liveCents>0?"+":""}${liveCents}¢`} ok={Math.abs(liveCents)<=25} />
      </div>

      <div style={{ display:"flex", justifyContent:"center", gap:8, marginBottom:16 }}>
        {mode==="flashcards" ? (
          <button onClick={nextFlashcard} style={btnSuccess}>Next Note</button>
        ) : (
          <button onClick={nextScaleStep} style={btnSuccess}>Next Degree</button>
        )}
        <button onClick={submitAttempt} style={btnPurple}>Submit</button>
      </div>

      <div style={{ display:"grid", gridTemplateColumns:"repeat(4, minmax(0, 1fr))", gap:8, marginBottom:12 }}>
        <Stat label="Attempts"  value={attempts} />
        <Stat label="Both OK"   value={`${bothOK} (${acc}%)`} />
        <Stat label="Valves OK" value={`${valvesOK} (${valveAcc}%)`} />
        <Stat label="Pitch OK"  value={`${pitchOK} (${pitchAcc}%)`} />
      </div>
      <div style={{ textAlign:"center", marginBottom:16 }}>Streak: <span style={{ fontWeight:600 }}>{streak}</span></div>

      <div style={{ maxHeight:220, overflow:"auto", border:"1px solid #ddd", borderRadius:8 }}>
        <table style={{ width:"100%", fontSize:13, borderCollapse:"collapse" }}>
          <thead style={{ background:"#f9fafb" }}>
            <tr>
              <th style={th}>When</th><th style={th}>Note</th><th style={th}>Valves</th><th style={th}>Pitch</th><th style={{...th, textAlign:"right"}}>¢</th>
            </tr>
          </thead>
          <tbody>
          {history.map((h,i)=>(
            <tr key={i} style={{ borderTop:"1px solid #eee" }}>
              <td style={td}>{new Date(h.ts).toLocaleTimeString()}</td>
              <td style={td}>{h.note}</td>
              <td style={{...td, textAlign:"center"}}>{h.valves?"✅":"—"}</td>
              <td style={{...td, textAlign:"center"}}>{h.inTune?"✅":"—"}</td>
              <td style={{...td, textAlign:"right"}}>{h.cents>0?"+":""}{Math.round(h.cents)}</td>
            </tr>
          ))}
          {history.length===0 && <tr><td style={{padding:8, textAlign:"center"}} colSpan={5}>No attempts yet.</td></tr>}
          </tbody>
        </table>
      </div>

      <p style={{ fontSize:12, color:"#555", marginTop:8 }}>Tip: Open preview in a new window (↗︎) so the browser shows the mic permission prompt.</p>
    </div>
  );
}

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

const btn = { padding:"8px 12px", borderRadius:8, border:"1px solid #ddd", background:"white" };
const btnPrimary = { ...btn, background:"#2563eb", color:"white", border:"none" };
const btnSuccess = { ...btn, background:"#16a34a", color:"white", border:"none" };
const btnPurple  = { ...btn, background:"#7c3aed", color:"white", border:"none" };
const circleBtn  = { height:64, width:64, borderRadius:"9999px", fontSize:20, fontWeight:700, border:"2px solid #e5e7eb" };
const th = { padding:8, textAlign:"left", fontWeight:600, fontSize:12, color:"#374151" };
const td = { padding:8 };
