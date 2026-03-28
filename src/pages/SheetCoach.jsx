import React, { useState, useRef, useEffect, useCallback } from "react";

const NOTE_NAMES = ["C","C#","D","D#","E","F","F#","G","G#","A","A#","B"];
const DISPLAY_NAMES = ["C","C#","D","Eb","E","F","F#","G","Ab","A","Bb","B"];
const WORKER_URL = "https://euph-coach-api.david-murat.workers.dev/";

// All writable notes for euphonium treble Bb, from low to high
const ALL_NOTES = [
  "Bb2","B2",
  "C3","C#3","D3","Eb3","E3","F3","F#3","G3","Ab3","A3","Bb3","B3",
  "C4","C#4","D4","Eb4","E4","F4","F#4","G4","Ab4","A4","Bb4","B4",
  "C5","C#5","D5","Eb5","E5","F5","F#5","G5","Ab5","A5","Bb5","B5",
  "C6","R"
];

function midiFromWritten(noteStr) {
  if (!noteStr || noteStr === "R") return null;
  const m = noteStr.match(/^([A-G](?:#|b)?)(\d)$/);
  if (!m) return null;
  let name = m[1];
  const oct = Number(m[2]);
  const FLAT = { Ab:"G#", Bb:"A#", Db:"C#", Eb:"D#", Gb:"F#" };
  if (name.includes("b")) name = FLAT[name] || name;
  return (oct + 1) * 12 + NOTE_NAMES.indexOf(name);
}

function writtenToConcert(noteStr) {
  const m = midiFromWritten(noteStr);
  return m != null ? m - 14 : null;
}

function midiToFreq(midi) { return 440 * Math.pow(2, (midi - 69) / 12); }

function freqToMidi(freq) {
  if (!freq || freq <= 0) return null;
  return Math.round(12 * Math.log2(freq / 440) + 69);
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
  return sampleRate / (denom !== 0 ? maxPos + (y3 - y1) / denom : maxPos);
}

function playNote(audioCtx, midi, durationSec, startTime) {
  const freq = midiToFreq(midi);
  const osc = audioCtx.createOscillator();
  const gain = audioCtx.createGain();
  osc.type = "sine";
  osc.frequency.setValueAtTime(freq, startTime);
  gain.gain.setValueAtTime(0.0, startTime);
  gain.gain.linearRampToValueAtTime(0.4, startTime + 0.02);
  gain.gain.setValueAtTime(0.4, startTime + durationSec * 0.85);
  gain.gain.linearRampToValueAtTime(0.0, startTime + durationSec);
  osc.connect(gain);
  gain.connect(audioCtx.destination);
  osc.start(startTime);
  osc.stop(startTime + durationSec);
}

async function transcribeSheetMusic(base64Image, mediaType) {
  const response = await fetch(WORKER_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ _transcribe: true, imageBase64: base64Image, mediaType })
  });
  if (!response.ok) throw new Error("Network error " + response.status);
  const data = await response.json();
  if (!data.success) throw new Error(data.error || "Transcription failed.");
  const parsed = data.data;
  if (!parsed.notes || parsed.notes.length === 0) throw new Error("No notes found in image.");
  return parsed;
}

// ---- Staff display ----------------------------------------------------------
function MiniStaff({ notes, currentIdx, results }) {
  const LINE_GAP = 10;
  const STAFF_TOP = 28;
  const LEFT_PAD = 44;
  const NOTE_STEP = 38;
  const staffWidth = LEFT_PAD + notes.length * NOTE_STEP + 20;
  const LETTER_INDEX = { C:0, D:1, E:2, F:3, G:4, A:5, B:6 };

  function notePos(noteStr) {
    if (!noteStr || noteStr === "R") return -99;
    const m = noteStr.match(/^([A-G](?:#|b)?)(\d)$/);
    if (!m) return 0;
    const letter = m[1][0].toUpperCase();
    const oct = parseInt(m[2], 10);
    return 7 * oct + LETTER_INDEX[letter] - (7 * 4 + LETTER_INDEX["E"]);
  }
  function posToY(pos) { return STAFF_TOP + 4 * LINE_GAP - pos * (LINE_GAP / 2); }
  const staffYs = [0,1,2,3,4].map(i => STAFF_TOP + i * LINE_GAP);

  return (
    <div style={{ overflowX:"auto", paddingBottom:4 }}>
      <svg width={Math.max(staffWidth, 300)} height={100} style={{ display:"block" }}>
        {staffYs.map((y,i) => (
          <line key={i} x1={LEFT_PAD-6} x2={Math.max(staffWidth,300)-8} y1={y} y2={y} stroke="#374151" strokeWidth="1.2" />
        ))}
        <text x={2} y={STAFF_TOP + LINE_GAP * 4.2} fontSize="44" fontFamily="serif" fill="#374151">{"\uD834\uDD1E"}</text>
        {notes.map((n, i) => {
          const isRest = n.note === "R";
          const isCurrent = i === currentIdx;
          const res = results[i];
          const fill = res === "correct" ? "#16a34a"
            : res === "wrong" ? "#dc2626"
            : isCurrent ? "#2563eb"
            : i < currentIdx ? "#9ca3af"
            : "#374151";
          const nx = LEFT_PAD + i * NOTE_STEP + 12;
          const midY = STAFF_TOP + 2 * LINE_GAP;

          if (isRest) {
            return (
              <g key={i}>
                {isCurrent && <rect x={nx-8} y={STAFF_TOP} width={16} height={4*LINE_GAP} fill="#dbeafe" opacity={0.4} rx={2} />}
                {n.dur >= 4
                  ? <rect x={nx-8} y={midY - LINE_GAP} width={16} height={LINE_GAP / 2} fill={fill} />
                  : n.dur === 2
                  ? <rect x={nx-8} y={midY} width={16} height={LINE_GAP / 2} fill={fill} />
                  : <text x={nx-4} y={midY+4} fontSize="13" fill={fill} fontFamily="serif">z</text>
                }
              </g>
            );
          }

          const pos = notePos(n.note);
          const ny = posToY(pos);
          const stemUp = pos <= 4;
          const stemX = nx + (stemUp ? 6 : -6);
          const isOpen = n.dur >= 4;
          const acc = n.note.match(/^[A-G]([#b])/)?.[1] || null;
          const ledgers = [];
          const minI = Math.min(pos, 0), maxI = Math.max(pos, 8);
          for (let li = minI; li <= maxI; li++) {
            if (li % 2 === 0 && (li < 0 || li > 8)) ledgers.push(li);
          }

          return (
            <g key={i}>
              {ledgers.map(li => (
                <line key={li} x1={nx-9} x2={nx+9} y1={posToY(li)} y2={posToY(li)} stroke="#374151" strokeWidth="1.2" />
              ))}
              {acc === "#" && <text x={nx-13} y={ny+4} fontSize="12" fontFamily="serif" fill={fill}>#</text>}
              {acc === "b" && <text x={nx-13} y={ny+4} fontSize="12" fontFamily="serif" fill={fill}>b</text>}
              <ellipse cx={nx} cy={ny} rx={6} ry={4.5}
                fill={isOpen || n.dur === 2 ? (isCurrent ? "#dbeafe" : "white") : fill}
                stroke={fill} strokeWidth="1.5"
                transform={"rotate(-15 " + nx + " " + ny + ")"}
              />
              {!isOpen && (
                <line x1={stemX} y1={ny} x2={stemX} y2={stemUp ? ny-26 : ny+26} stroke={fill} strokeWidth="1.5" />
              )}
              {isCurrent && <circle cx={nx} cy={posToY(-3)} r={3} fill="#2563eb" />}
            </g>
          );
        })}
      </svg>
    </div>
  );
}

// ---- Note Editor ------------------------------------------------------------
function NoteEditor({ notes, onDone }) {
  const [editNotes, setEditNotes] = useState(notes.map((n, i) => ({ ...n, id: i })));
  const [selected, setSelected] = useState(0);

  function changeNote(idx, direction) {
    const current = editNotes[idx].note;
    const pos = ALL_NOTES.indexOf(current);
    const newPos = Math.max(0, Math.min(ALL_NOTES.length - 1, pos + direction));
    const updated = [...editNotes];
    updated[idx] = { ...updated[idx], note: ALL_NOTES[newPos] };
    setEditNotes(updated);
  }

  function changeDur(idx, dur) {
    const updated = [...editNotes];
    updated[idx] = { ...updated[idx], dur };
    setEditNotes(updated);
  }

  function deleteNote(idx) {
    const updated = editNotes.filter((_, i) => i !== idx);
    setEditNotes(updated);
    setSelected(Math.min(selected, updated.length - 1));
  }

  function addNote(idx) {
    const updated = [...editNotes];
    updated.splice(idx + 1, 0, { note: "C4", dur: 1, id: Date.now() });
    setEditNotes(updated);
    setSelected(idx + 1);
  }

  const sel = editNotes[selected];

  const card = { background:"white", border:"1px solid #e5e7eb", borderRadius:16, padding:16, marginBottom:12 };

  return (
    <div>
      <div style={{ background:"#fffbeb", border:"1px solid #fde68a", borderRadius:12, padding:"10px 14px", marginBottom:14, fontSize:13, color:"#92400e" }}>
        Check each note — tap a note to select it, then use the controls below to correct it.
      </div>

      {/* Staff with selectable notes */}
      <div style={{ ...card, padding:12 }}>
        <div style={{ fontSize:11, color:"#6b7280", marginBottom:6 }}>Tap a note to select it</div>
        <div style={{ overflowX:"auto" }}>
          <svg width={Math.max(LEFT_PAD + editNotes.length * 38 + 20, 300)} height={100} style={{ display:"block" }}
            onClick={e => {
              const rect = e.currentTarget.getBoundingClientRect();
              const x = e.clientX - rect.left;
              const LEFT_PAD = 44;
              const NOTE_STEP = 38;
              const idx = Math.floor((x - LEFT_PAD) / NOTE_STEP);
              if (idx >= 0 && idx < editNotes.length) setSelected(idx);
            }}
          >
            {[0,1,2,3,4].map(i => {
              const LINE_GAP = 10, STAFF_TOP = 28;
              const y = STAFF_TOP + i * LINE_GAP;
              return <line key={i} x1={38} x2={Math.max(44 + editNotes.length * 38 + 20, 300) - 8} y1={y} y2={y} stroke="#374151" strokeWidth="1.2" />;
            })}
            <text x={2} y={69} fontSize="44" fontFamily="serif" fill="#374151">{"\uD834\uDD1E"}</text>
            {editNotes.map((n, i) => {
              const LINE_GAP = 10, STAFF_TOP = 28, LEFT_PAD = 44, NOTE_STEP = 38;
              const LETTER_INDEX = { C:0, D:1, E:2, F:3, G:4, A:5, B:6 };
              const isRest = n.note === "R";
              const isSel = i === selected;
              const nx = LEFT_PAD + i * NOTE_STEP + 12;
              const midY = STAFF_TOP + 2 * LINE_GAP;
              const fill = isSel ? "#2563eb" : "#374151";
              const bg = isSel ? "#dbeafe" : "transparent";

              if (isRest) {
                return (
                  <g key={i}>
                    <rect x={nx-10} y={STAFF_TOP} width={20} height={4*LINE_GAP} fill={bg} rx={3} />
                    {n.dur >= 4
                      ? <rect x={nx-8} y={midY-LINE_GAP} width={16} height={LINE_GAP/2} fill={fill} />
                      : <rect x={nx-8} y={midY} width={16} height={LINE_GAP/2} fill={fill} />
                    }
                  </g>
                );
              }

              function notePos(noteStr) {
                const m = noteStr.match(/^([A-G](?:#|b)?)(\d)$/);
                if (!m) return 0;
                const letter = m[1][0].toUpperCase();
                const oct = parseInt(m[2], 10);
                return 7 * oct + LETTER_INDEX[letter] - (7 * 4 + LETTER_INDEX["E"]);
              }
              function posToY(pos) { return STAFF_TOP + 4 * LINE_GAP - pos * (LINE_GAP / 2); }

              const pos = notePos(n.note);
              const ny = posToY(pos);
              const isOpen = n.dur >= 4;
              const acc = n.note.match(/^[A-G]([#b])/)?.[1] || null;
              const stemUp = pos <= 4;
              const stemX = nx + (stemUp ? 6 : -6);

              return (
                <g key={i}>
                  <rect x={nx-10} y={STAFF_TOP} width={20} height={4*LINE_GAP} fill={bg} rx={3} opacity={0.5} />
                  {acc === "#" && <text x={nx-13} y={ny+4} fontSize="12" fontFamily="serif" fill={fill}>#</text>}
                  {acc === "b" && <text x={nx-13} y={ny+4} fontSize="12" fontFamily="serif" fill={fill}>b</text>}
                  <ellipse cx={nx} cy={ny} rx={6} ry={4.5}
                    fill={isOpen || n.dur === 2 ? (isSel ? "#dbeafe" : "white") : fill}
                    stroke={fill} strokeWidth="1.5"
                    transform={"rotate(-15 " + nx + " " + ny + ")"}
                  />
                  {!isOpen && <line x1={stemX} y1={ny} x2={stemX} y2={stemUp ? ny-26 : ny+26} stroke={fill} strokeWidth="1.5" />}
                </g>
              );
            })}
          </svg>
        </div>
        {/* Note index indicator */}
        <div style={{ fontSize:11, color:"#9ca3af", marginTop:4, textAlign:"center" }}>
          Note {selected + 1} of {editNotes.length} selected
        </div>
      </div>

      {/* Editor controls for selected note */}
      {sel && (
        <div style={card}>
          <div style={{ fontSize:13, fontWeight:700, marginBottom:12, color:"#374151" }}>
            Editing note {selected + 1}: <span style={{ color:"#2563eb" }}>{sel.note}</span>
          </div>

          {/* Pitch control */}
          <div style={{ marginBottom:14 }}>
            <div style={{ fontSize:11, color:"#6b7280", marginBottom:6 }}>Pitch</div>
            <div style={{ display:"flex", alignItems:"center", gap:10 }}>
              <button onClick={() => changeNote(selected, -1)} style={{ width:44, height:44, borderRadius:10, border:"1px solid #e5e7eb", background:"#f9fafb", fontSize:20, cursor:"pointer" }}>▼</button>
              <div style={{ flex:1, textAlign:"center", fontSize:28, fontWeight:800, color:"#111827" }}>{sel.note}</div>
              <button onClick={() => changeNote(selected, 1)} style={{ width:44, height:44, borderRadius:10, border:"1px solid #e5e7eb", background:"#f9fafb", fontSize:20, cursor:"pointer" }}>▲</button>
            </div>
            <div style={{ display:"flex", gap:6, marginTop:8, flexWrap:"wrap" }}>
              {/* Quick pitch buttons */}
              {["Bb3","C4","D4","Eb4","E4","F4","G4","Ab4","A4","Bb4","C5","D5","Eb5","F5","G5","R"].map(n => (
                <button key={n} onClick={() => { const updated=[...editNotes]; updated[selected]={...sel,note:n}; setEditNotes(updated); }}
                  style={{ padding:"4px 8px", borderRadius:6, fontSize:12, fontWeight:600,
                    border: sel.note === n ? "none" : "1px solid #e5e7eb",
                    background: sel.note === n ? "#2563eb" : "#f9fafb",
                    color: sel.note === n ? "white" : "#374151", cursor:"pointer" }}>
                  {n}
                </button>
              ))}
            </div>
          </div>

          {/* Duration control */}
          <div style={{ marginBottom:14 }}>
            <div style={{ fontSize:11, color:"#6b7280", marginBottom:6 }}>Duration</div>
            <div style={{ display:"flex", gap:8 }}>
              {[{label:"Whole",val:4},{label:"Half",val:2},{label:"Quarter",val:1},{label:"Eighth",val:0.5}].map(d => (
                <button key={d.val} onClick={() => changeDur(selected, d.val)}
                  style={{ flex:1, padding:"8px 4px", borderRadius:8, fontSize:12, fontWeight:600,
                    border:"none",
                    background: sel.dur === d.val ? "#2563eb" : "#f3f4f6",
                    color: sel.dur === d.val ? "white" : "#374151", cursor:"pointer" }}>
                  {d.label}
                </button>
              ))}
            </div>
          </div>

          {/* Actions */}
          <div style={{ display:"flex", gap:8 }}>
            <button onClick={() => addNote(selected)}
              style={{ flex:1, padding:"8px 0", borderRadius:8, border:"1px solid #e5e7eb", background:"white", fontSize:13, fontWeight:600, color:"#374151", cursor:"pointer" }}>
              + Insert after
            </button>
            <button onClick={() => deleteNote(selected)}
              style={{ flex:1, padding:"8px 0", borderRadius:8, border:"none", background:"#fef2f2", fontSize:13, fontWeight:600, color:"#dc2626", cursor:"pointer" }}>
              Delete
            </button>
          </div>
        </div>
      )}

      {/* Navigation */}
      <div style={{ display:"flex", gap:8, marginBottom:12 }}>
        <button onClick={() => setSelected(Math.max(0, selected - 1))}
          style={{ flex:1, padding:"10px 0", borderRadius:10, border:"1px solid #e5e7eb", background:"white", fontWeight:600, fontSize:14, cursor:"pointer" }}>
          ← Prev
        </button>
        <button onClick={() => setSelected(Math.min(editNotes.length - 1, selected + 1))}
          style={{ flex:1, padding:"10px 0", borderRadius:10, border:"1px solid #e5e7eb", background:"white", fontWeight:600, fontSize:14, cursor:"pointer" }}>
          Next →
        </button>
      </div>

      <button onClick={() => onDone(editNotes)}
        style={{ width:"100%", padding:"14px 0", borderRadius:12, border:"none", background:"#16a34a", color:"white", fontSize:16, fontWeight:700, cursor:"pointer", marginBottom:12 }}>
        Looks good — start practising
      </button>
    </div>
  );
}

const LEFT_PAD = 44;

// ---- Summary ----------------------------------------------------------------
function Summary({ results, notes, onRetry, onBack }) {
  const playable = notes.filter(n => n.note !== "R");
  const correct = results.filter(r => r === "correct").length;
  const pct = playable.length ? Math.round((correct / playable.length) * 100) : 0;
  const grade = pct === 100 ? "Perfect!" : pct >= 80 ? "Great!" : pct >= 60 ? "Good" : "Keep practising!";
  return (
    <div style={{ background:"white", border:"1px solid #e5e7eb", borderRadius:16, padding:24, textAlign:"center", marginTop:12 }}>
      <div style={{ fontSize:28, marginBottom:4 }}>{grade}</div>
      <div style={{ fontSize:48, fontWeight:800, lineHeight:1 }}>{pct}%</div>
      <div style={{ fontSize:14, color:"#6b7280", marginBottom:20 }}>{correct} / {playable.length} notes correct</div>
      <div style={{ display:"flex", gap:10, justifyContent:"center" }}>
        <button onClick={onRetry} style={{ padding:"12px 24px", borderRadius:10, border:"none", background:"#2563eb", color:"white", fontWeight:700, cursor:"pointer" }}>Try Again</button>
        <button onClick={onBack} style={{ padding:"12px 24px", borderRadius:10, border:"1px solid #e5e7eb", background:"white", color:"#374151", fontWeight:700, cursor:"pointer" }}>Back</button>
      </div>
    </div>
  );
}

// ---- Main -------------------------------------------------------------------
export default function SheetCoach() {
  const [stage, setStage] = useState("upload"); // upload|transcribing|edit|review|practice|done
  const [melody, setMelody] = useState(null);
  const [error, setError] = useState(null);
  const [imagePreview, setImagePreview] = useState(null);
  const [tempo, setTempo] = useState(80);
  const [isPlaying, setIsPlaying] = useState(false);
  const [playheadIdx, setPlayheadIdx] = useState(-1);

  const [noteIdx, setNoteIdx] = useState(0);
  const [results, setResults] = useState([]);
  const [listening, setListening] = useState(false);
  const [detectedNote, setDetectedNote] = useState(null);
  const [holdStatus, setHoldStatus] = useState(null);
  const [holdPct, setHoldPct] = useState(0);
  const [centsOff, setCentsOff] = useState(0);
  const [practiceDone, setPracticeDone] = useState(false);

  const playbackCtxRef = useRef(null);
  const audioCtxRef = useRef(null);
  const analyserRef = useRef(null);
  const sourceRef = useRef(null);
  const rafRef = useRef(null);
  const holdFrames = useRef(0);
  const silFrames = useRef(0);
  const noteResults = useRef([]);
  const currentIdx = useRef(0);
  const isDone = useRef(false);
  const notesRef = useRef([]);
  const HOLD_REQUIRED = 24;

  async function resizeImage(file, maxSize = 1600) {
    return new Promise((resolve) => {
      const img = new Image();
      const url = URL.createObjectURL(file);
      img.onload = () => {
        URL.revokeObjectURL(url);
        const scale = Math.min(1, maxSize / Math.max(img.width, img.height));
        const w = Math.round(img.width * scale);
        const h = Math.round(img.height * scale);
        const canvas = document.createElement("canvas");
        canvas.width = w; canvas.height = h;
        canvas.getContext("2d").drawImage(img, 0, 0, w, h);
        resolve(canvas.toDataURL("image/jpeg", 0.85).split(",")[1]);
      };
      img.src = url;
    });
  }

  async function handleUpload(e) {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = ev => setImagePreview(ev.target.result);
    reader.readAsDataURL(file);
    setStage("transcribing");
    setError(null);
    try {
      const base64 = await resizeImage(file, 1600);
      const result = await transcribeSheetMusic(base64, "image/jpeg");
      setMelody(result);
      setStage("edit"); // Go to editor first
    } catch (err) {
      setError(err.message || "Transcription failed. Please try again.");
      setStage("upload");
    }
  }

  function handleEditDone(correctedNotes) {
    const updated = { ...melody, notes: correctedNotes };
    setMelody(updated);
    notesRef.current = correctedNotes;
    setStage("review");
  }

  function startPlayback() {
    if (isPlaying) return;
    setIsPlaying(true);
    setPlayheadIdx(0);
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    playbackCtxRef.current = ctx;
    const beatDur = 60 / tempo;
    let time = ctx.currentTime + 0.1;
    let totalDur = 0;
    melody.notes.forEach((n, i) => {
      const durSec = n.dur * beatDur;
      const noteStart = time;
      setTimeout(() => setPlayheadIdx(i), (noteStart - ctx.currentTime) * 1000);
      if (n.note !== "R") {
        const cm = writtenToConcert(n.note);
        if (cm != null) playNote(ctx, cm, durSec * 0.9, time);
      }
      time += durSec;
      totalDur += durSec;
    });
    setTimeout(() => { setIsPlaying(false); setPlayheadIdx(-1); if (playbackCtxRef.current) playbackCtxRef.current.close(); }, (totalDur + 0.5) * 1000);
  }

  function stopPlayback() {
    if (playbackCtxRef.current) playbackCtxRef.current.close();
    setIsPlaying(false); setPlayheadIdx(-1);
  }

  function nextPlayableIdx(from, notes) {
    let i = from;
    while (i < notes.length && notes[i].note === "R") i++;
    return i;
  }

  const startLoop = useCallback((analyser, sampleRate) => {
    const buf = new Float32Array(analyser.fftSize);
    function tick() {
      if (isDone.current) return;
      analyser.getFloatTimeDomainData(buf);
      const freq = autoCorrelate(buf, sampleRate);
      if (freq > 40 && freq < 1400) {
        silFrames.current = 0;
        const detMidi = freqToMidi(freq);
        const note = notesRef.current[currentIdx.current];
        if (!note) { rafRef.current = requestAnimationFrame(tick); return; }
        const targetMidi = writtenToConcert(note.note);
        const inTune = targetMidi != null && Math.abs(detMidi - targetMidi) <= 1;
        const writtenMidi = detMidi + 14;
        const name = NOTE_NAMES[(writtenMidi % 12 + 12) % 12];
        const oct = Math.floor(writtenMidi / 12) - 1;
        setDetectedNote(name + oct);
        const centsVal = targetMidi != null ? Math.round((12 * Math.log2(freq / midiToFreq(targetMidi))) * 100) : 0;
        setCentsOff(centsVal);
        if (inTune) {
          holdFrames.current++;
          const pct = Math.min(Math.round((holdFrames.current / HOLD_REQUIRED) * 100), 100);
          setHoldPct(pct);
          setHoldStatus(pct < 100 ? "holding" : "locked");
          if (holdFrames.current >= HOLD_REQUIRED) {
            noteResults.current = [...noteResults.current, "correct"];
            setResults([...noteResults.current]);
            holdFrames.current = 0; setHoldPct(0);
            const next = nextPlayableIdx(currentIdx.current + 1, notesRef.current);
            if (next >= notesRef.current.length) { isDone.current = true; setPracticeDone(true); stopPractice(); }
            else { currentIdx.current = next; setNoteIdx(next); setHoldStatus(null); }
          }
        } else { holdFrames.current = 0; setHoldPct(0); setHoldStatus(null); }
      } else {
        silFrames.current++;
        holdFrames.current = 0; setHoldPct(0); setHoldStatus(null);
        if (silFrames.current > 20) { setDetectedNote(null); setCentsOff(0); }
      }
      rafRef.current = requestAnimationFrame(tick);
    }
    tick();
  }, []);

  async function startPractice() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio:true, video:false });
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 2048;
      const src = ctx.createMediaStreamSource(stream);
      src.connect(analyser);
      audioCtxRef.current = ctx; analyserRef.current = analyser; sourceRef.current = src;
      isDone.current = false;
      startLoop(analyser, ctx.sampleRate);
      setListening(true);
    } catch { alert("Microphone access denied."); }
  }

  function stopPractice() {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    if (sourceRef.current) sourceRef.current.disconnect();
    if (audioCtxRef.current) audioCtxRef.current.close();
    audioCtxRef.current = analyserRef.current = sourceRef.current = null;
    setListening(false);
  }

  function resetPractice() {
    stopPractice();
    const firstPlayable = melody ? nextPlayableIdx(0, melody.notes) : 0;
    setNoteIdx(firstPlayable); setResults([]); setPracticeDone(false);
    setDetectedNote(null); setHoldPct(0); setHoldStatus(null);
    noteResults.current = []; currentIdx.current = firstPlayable;
    isDone.current = false; holdFrames.current = 0; silFrames.current = 0;
  }

  useEffect(() => () => { stopPractice(); stopPlayback(); }, []);

  const card = { background:"white", border:"1px solid #e5e7eb", borderRadius:16, padding:20, marginBottom:14 };
  const notes = melody?.notes || [];
  const target = notes[noteIdx];
  const inTune = holdStatus != null;
  const targetConcert = target && target.note !== "R" ? writtenToConcert(target.note) : null;

  return (
    <div style={{ maxWidth:540, margin:"0 auto" }}>
      <h2 style={{ fontSize:18, fontWeight:700, marginBottom:4 }}>Sheet Coach</h2>
      <p style={{ fontSize:12, color:"#6b7280", marginBottom:16 }}>Upload sheet music — AI reads it, you correct it, then practise</p>

      {/* UPLOAD */}
      {stage === "upload" && (
        <div style={{ ...card, textAlign:"center" }}>
          <div style={{ fontSize:48, marginBottom:12 }}>📷</div>
          <div style={{ fontSize:15, fontWeight:700, marginBottom:8 }}>Upload Sheet Music</div>
          <div style={{ fontSize:12, color:"#6b7280", marginBottom:8 }}>AI will read the notes — you can then correct any mistakes before practising</div>
          {error && <div style={{ background:"#fef2f2", color:"#dc2626", borderRadius:8, padding:"10px 14px", fontSize:13, marginBottom:16 }}>{error}</div>}
          <div style={{ display:"flex", gap:10, justifyContent:"center", flexWrap:"wrap" }}>
            <label style={{ display:"inline-block", padding:"12px 22px", borderRadius:10, background:"#2563eb", color:"white", fontWeight:700, fontSize:14, cursor:"pointer" }}>
              From Gallery
              <input type="file" accept="image/*" onChange={handleUpload} style={{ display:"none" }} />
            </label>
            <label style={{ display:"inline-block", padding:"12px 22px", borderRadius:10, background:"#7c3aed", color:"white", fontWeight:700, fontSize:14, cursor:"pointer" }}>
              Take Photo
              <input type="file" accept="image/*" capture="environment" onChange={handleUpload} style={{ display:"none" }} />
            </label>
          </div>
          <div style={{ fontSize:11, color:"#9ca3af", marginTop:12 }}>Best results: flat surface, good lighting, full page visible</div>
        </div>
      )}

      {/* TRANSCRIBING */}
      {stage === "transcribing" && (
        <div style={{ ...card, textAlign:"center" }}>
          {imagePreview && <img src={imagePreview} alt="Sheet music" style={{ width:"100%", borderRadius:8, marginBottom:16, maxHeight:280, objectFit:"contain" }} />}
          <div style={{ fontSize:28, marginBottom:8 }}>🎵</div>
          <div style={{ fontSize:15, fontWeight:700, marginBottom:4 }}>Reading your music...</div>
          <div style={{ fontSize:12, color:"#6b7280" }}>About 15–20 seconds</div>
        </div>
      )}

      {/* EDIT */}
      {stage === "edit" && melody && (
        <>
          <div style={{ ...card, padding:"12px 16px" }}>
            <div style={{ fontSize:15, fontWeight:700 }}>{melody.title}</div>
            <div style={{ fontSize:12, color:"#6b7280" }}>{notes.filter(n=>n.note!=="R").length} notes · {notes.filter(n=>n.note==="R").length} rests · Check and correct before practising</div>
          </div>
          {imagePreview && (
            <div style={{ ...card, padding:12 }}>
              <img src={imagePreview} alt="Your sheet music" style={{ width:"100%", borderRadius:8, maxHeight:220, objectFit:"contain" }} />
              <div style={{ fontSize:11, color:"#9ca3af", marginTop:6, textAlign:"center" }}>Your original sheet — use this to check the notes</div>
            </div>
          )}
          <NoteEditor notes={notes} onDone={handleEditDone} />
        </>
      )}

      {/* REVIEW */}
      {stage === "review" && melody && (
        <>
          <div style={card}>
            <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:12 }}>
              <div>
                <div style={{ fontSize:16, fontWeight:700 }}>{melody.title}</div>
                <div style={{ fontSize:12, color:"#6b7280" }}>{notes.filter(n=>n.note!=="R").length} notes · {notes.filter(n=>n.note==="R").length} rests</div>
              </div>
              <div style={{ display:"flex", gap:8 }}>
                <button onClick={() => setStage("edit")} style={{ fontSize:12, color:"#6b7280", background:"none", border:"1px solid #e5e7eb", borderRadius:8, padding:"6px 10px", cursor:"pointer" }}>Edit notes</button>
                <button onClick={() => { setStage("upload"); setMelody(null); }} style={{ fontSize:12, color:"#6b7280", background:"none", border:"1px solid #e5e7eb", borderRadius:8, padding:"6px 10px", cursor:"pointer" }}>Re-upload</button>
              </div>
            </div>
            <MiniStaff notes={notes} currentIdx={playheadIdx} results={[]} />
          </div>
          <div style={card}>
            <div style={{ fontSize:13, fontWeight:600, marginBottom:12 }}>Listen first</div>
            <div style={{ display:"flex", alignItems:"center", gap:12, marginBottom:16 }}>
              <label style={{ fontSize:12, color:"#6b7280", minWidth:50 }}>Tempo:</label>
              <input type="range" min={30} max={160} value={tempo} onChange={e => setTempo(Number(e.target.value))} style={{ flex:1 }} />
              <span style={{ fontSize:13, fontWeight:700, minWidth:50 }}>{tempo} BPM</span>
            </div>
            <div style={{ display:"flex", gap:10 }}>
              <button onClick={isPlaying ? stopPlayback : startPlayback} style={{ flex:1, padding:"12px 0", borderRadius:10, border:"none", background: isPlaying ? "#dc2626" : "#7c3aed", color:"white", fontWeight:700, fontSize:14, cursor:"pointer" }}>
                {isPlaying ? "Stop" : "Play it back"}
              </button>
              <button onClick={() => { resetPractice(); setStage("practice"); }} style={{ flex:1, padding:"12px 0", borderRadius:10, border:"none", background:"#16a34a", color:"white", fontWeight:700, fontSize:14, cursor:"pointer" }}>
                Practise it
              </button>
            </div>
          </div>
        </>
      )}

      {/* PRACTICE */}
      {stage === "practice" && melody && (
        <>
          <div style={{ ...card, display:"flex", justifyContent:"space-between", alignItems:"center" }}>
            <div>
              <div style={{ fontSize:15, fontWeight:700 }}>{melody.title}</div>
              <div style={{ fontSize:12, color:"#6b7280" }}>Note {Math.min(noteIdx+1, notes.length)} of {notes.length}</div>
            </div>
            <div style={{ display:"flex", gap:8 }}>
              <button onClick={() => { stopPractice(); setStage("review"); }} style={{ fontSize:12, color:"#6b7280", background:"none", border:"1px solid #e5e7eb", borderRadius:8, padding:"6px 10px", cursor:"pointer" }}>Listen again</button>
              <button onClick={resetPractice} style={{ fontSize:12, color:"#6b7280", background:"none", border:"1px solid #e5e7eb", borderRadius:8, padding:"6px 10px", cursor:"pointer" }}>Restart</button>
            </div>
          </div>
          <div style={card}><MiniStaff notes={notes} currentIdx={noteIdx} results={results} /></div>

          {!practiceDone && target && (
            <div style={{ ...card, textAlign:"center" }}>
              {target.note === "R" ? (
                <div style={{ fontSize:20, color:"#9ca3af", padding:"12px 0" }}>Rest — wait...</div>
              ) : (
                <>
                  <div style={{ display:"flex", justifyContent:"space-around", alignItems:"center" }}>
                    <div>
                      <div style={{ fontSize:11, color:"#9ca3af", marginBottom:2 }}>Play this</div>
                      <div style={{ fontSize:48, fontWeight:800, letterSpacing:-2, color:"#2563eb", lineHeight:1 }}>{target.note}</div>
                      {targetConcert && <div style={{ fontSize:11, color:"#9ca3af", marginTop:4 }}>concert: {NOTE_NAMES[(targetConcert%12+12)%12]}{Math.floor(targetConcert/12)-1}</div>}
                    </div>
                    <div style={{ fontSize:22, color:"#d1d5db" }}>→</div>
                    <div>
                      <div style={{ fontSize:11, color:"#9ca3af", marginBottom:2 }}>You're playing</div>
                      <div style={{ fontSize:48, fontWeight:800, letterSpacing:-2, lineHeight:1, color: inTune ? "#16a34a" : detectedNote ? "#f59e0b" : "#d1d5db" }}>
                        {detectedNote || "—"}
                      </div>
                      {detectedNote && <div style={{ fontSize:11, marginTop:2, color: inTune ? "#16a34a" : "#9ca3af" }}>{inTune ? "in tune" : (centsOff>0?"+":"")+centsOff+"c"}</div>}
                    </div>
                  </div>
                  <div style={{ height:8, borderRadius:4, background:"#f3f4f6", margin:"12px 0 0", overflow:"hidden" }}>
                    <div style={{ height:"100%", borderRadius:4, width:holdPct+"%", background: holdStatus==="locked"?"#16a34a":"#2563eb", transition:"width 0.05s linear" }} />
                  </div>
                  <div style={{ fontSize:11, color:"#9ca3af", marginTop:4 }}>
                    {holdStatus==="locked"?"Note confirmed!":holdStatus==="holding"?"Hold steady...":listening?"Start playing...":"Press Start to begin"}
                  </div>
                </>
              )}
            </div>
          )}

          {practiceDone && <Summary results={results} notes={notes} onRetry={resetPractice} onBack={() => { stopPractice(); setStage("review"); }} />}

          {!practiceDone && (
            <button onClick={listening ? stopPractice : startPractice} style={{ width:"100%", padding:"14px 0", borderRadius:12, border:"none", background: listening?"#dc2626":"#2563eb", color:"white", fontSize:16, fontWeight:700, cursor:"pointer", marginBottom:12 }}>
              {listening ? "Stop Listening" : "Start Listening"}
            </button>
          )}
        </>
      )}
    </div>
  );
}
