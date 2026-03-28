import React, { useState, useRef, useEffect, useCallback } from "react";

// ─── Note helpers ─────────────────────────────────────────────────────────────
const NOTE_NAMES = ["C","C#","D","D#","E","F","F#","G","G#","A","A#","B"];

function midiFromWritten(noteStr) {
  const m = noteStr.match(/^([A-G](?:#|b)?)(\d)$/);
  if (!m) return 48;
  let name = m[1];
  const oct = Number(m[2]);
  const FLAT = { Ab:"G#", Bb:"A#", Db:"C#", Eb:"D#", Gb:"F#" };
  if (name.includes("b")) name = FLAT[name] || name;
  return (oct + 1) * 12 + NOTE_NAMES.indexOf(name);
}

// Bb treble euphonium: written - 14 semitones = concert pitch
function writtenToConcert(noteStr) {
  return midiFromWritten(noteStr) - 14;
}

function midiToFreq(midi) {
  return 440 * Math.pow(2, (midi - 69) / 12);
}

function freqToMidi(freq) {
  if (!freq || freq <= 0) return null;
  return Math.round(12 * Math.log2(freq / 440) + 69);
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

// ─── Play a note via Web Audio ────────────────────────────────────────────────
function playNote(audioCtx, midi, durationSec, startTime) {
  const freq = midiToFreq(midi);
  const osc = audioCtx.createOscillator();
  const gain = audioCtx.createGain();
  osc.type = "sine";
  osc.frequency.setValueAtTime(freq, startTime);
  gain.gain.setValueAtTime(0.4, startTime);
  gain.gain.setValueAtTime(0.4, startTime + durationSec * 0.8);
  gain.gain.linearRampToValueAtTime(0, startTime + durationSec);
  osc.connect(gain);
  gain.connect(audioCtx.destination);
  osc.start(startTime);
  osc.stop(startTime + durationSec);
}

// ─── AI transcription via Anthropic API ──────────────────────────────────────
async function transcribeSheetMusic(base64Image, mediaType) {
  const systemPrompt = `You are an expert music transcriber. The user will show you a photo of sheet music for a Bb treble clef instrument (euphonium, trumpet, etc).

Your job is to transcribe EVERY note in the score into a JSON array.

Rules:
- Written notes only (do not transpose)
- Use scientific pitch notation: C4 = middle C on the written part
- For Bb treble euphonium, the comfortable range is roughly Bb3 to Bb5 written
- Accidentals: use # for sharp (C#4), b for flat (Bb4, Eb4, Ab4, Db4, Gb4)
- Durations: 4 = whole note, 2 = half note, 1 = quarter note, 0.5 = eighth note
- Skip rests (the coach will pause naturally between notes)
- Return ONLY valid JSON, no explanation, no markdown fences

Format:
{"title":"Song Title","notes":[{"note":"C4","dur":2},{"note":"D4","dur":1},...]}

Important: Include ALL notes from the entire page including repeats if written out.`;

  const response = await fetch("https://euph-coach-api.david-murat.workers.dev/", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "claude-sonnet-4-20250514",
      max_tokens: 4000,
      system: systemPrompt,
      messages: [{
        role: "user",
        content: [
          {
            type: "image",
            source: { type: "base64", media_type: mediaType, data: base64Image }
          },
          {
            type: "text",
            text: "Please transcribe all the notes from this sheet music into the JSON format specified."
          }
        ]
      }]
    })
  });

  if (!response.ok) throw new Error("API error: " + response.status);
  const data = await response.json();
  const text = data.content.find(b => b.type === "text")?.text || "";

  // Strip any accidental markdown fences
  const clean = text.replace(/```json|```/g, "").trim();
  const parsed = JSON.parse(clean);
  return parsed;
}

// ─── Mini staff display ───────────────────────────────────────────────────────
function MiniStaff({ notes, currentIdx, results }) {
  const LINE_GAP = 10;
  const STAFF_TOP = 28;
  const LEFT_PAD = 44;
  const NOTE_STEP = 40;
  const staffWidth = LEFT_PAD + notes.length * NOTE_STEP + 20;

  const LETTER_INDEX = { C:0, D:1, E:2, F:3, G:4, A:5, B:6 };
  function notePos(noteStr) {
    const m = noteStr.match(/^([A-G](?:#|b)?)(\d)$/);
    if (!m) return 0;
    const letter = m[1][0].toUpperCase();
    const oct = parseInt(m[2], 10);
    const E4abs = 7 * 4 + LETTER_INDEX["E"];
    return 7 * oct + LETTER_INDEX[letter] - E4abs;
  }
  function posToY(pos) {
    return STAFF_TOP + 4 * LINE_GAP - pos * (LINE_GAP / 2);
  }
  const staffYs = [0,1,2,3,4].map(i => STAFF_TOP + i * LINE_GAP);

  return (
    <div style={{ overflowX:"auto", paddingBottom:4 }}>
      <svg width={Math.max(staffWidth, 300)} height={100} style={{ display:"block" }}>
        {staffYs.map((y,i) => (
          <line key={i} x1={LEFT_PAD-6} x2={Math.max(staffWidth,300)-8} y1={y} y2={y} stroke="#374151" strokeWidth="1.2" />
        ))}
        <text x={2} y={STAFF_TOP + LINE_GAP * 4.2} fontSize="44" fontFamily="serif" fill="#374151">{"\uD834\uDD1E"}</text>
        {notes.map((n, i) => {
          const pos = notePos(n.note);
          const ny = posToY(pos);
          const nx = LEFT_PAD + i * NOTE_STEP + 12;
          const stemUp = pos <= 4;
          const stemX = nx + (stemUp ? 6 : -6);
          const isCurrent = i === currentIdx;
          const res = results[i];
          const fill = res === "correct" ? "#16a34a"
            : res === "wrong" ? "#dc2626"
            : isCurrent ? "#2563eb"
            : i < currentIdx ? "#9ca3af"
            : "#374151";
          const isOpen = n.dur >= 4;
          const ledgers = [];
          const minI = Math.min(pos, 0), maxI = Math.max(pos, 8);
          for (let li = minI; li <= maxI; li++) {
            if (li % 2 === 0 && (li < 0 || li > 8)) ledgers.push(li);
          }
          const acc = n.note.match(/^[A-G]([#b])/)?.[1] || null;
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

// ─── Main component ───────────────────────────────────────────────────────────
export default function SheetCoach() {
  // Stages: "upload" | "transcribing" | "review" | "playback" | "practice" | "done"
  const [stage, setStage] = useState("upload");
  const [melody, setMelody] = useState(null);       // { title, notes }
  const [error, setError] = useState(null);
  const [imagePreview, setImagePreview] = useState(null);

  // Playback state
  const [tempo, setTempo] = useState(80);           // BPM
  const [isPlaying, setIsPlaying] = useState(false);
  const [playheadIdx, setPlayheadIdx] = useState(0);
  const playbackCtxRef = useRef(null);

  // Practice state
  const [noteIdx, setNoteIdx] = useState(0);
  const [results, setResults] = useState([]);
  const [listening, setListening] = useState(false);
  const [detectedNote, setDetectedNote] = useState(null);
  const [holdStatus, setHoldStatus] = useState(null);
  const [holdPct, setHoldPct] = useState(0);
  const [centsOff, setCentsOff] = useState(0);
  const [practiceDone, setPracticeDone] = useState(false);

  // Audio refs
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

  // ── Upload & transcribe ────────────────────────────────
  async function handleImageUpload(e) {
    const file = e.target.files[0];
    if (!file) return;

    // Preview
    const reader = new FileReader();
    reader.onload = ev => setImagePreview(ev.target.result);
    reader.readAsDataURL(file);

    setStage("transcribing");
    setError(null);

    try {
      // Convert to base64
      const base64 = await new Promise((res, rej) => {
        const r = new FileReader();
        r.onload = () => res(r.result.split(",")[1]);
        r.onerror = rej;
        r.readAsDataURL(file);
      });

      const mediaType = file.type || "image/jpeg";
      const result = await transcribeSheetMusic(base64, mediaType);

      if (!result.notes || result.notes.length === 0) {
        throw new Error("No notes found in the image. Please try a clearer photo.");
      }

      setMelody(result);
      notesRef.current = result.notes;
      setStage("review");
    } catch (err) {
      setError(err.message || "Failed to transcribe. Please try again.");
      setStage("upload");
    }
  }

  // ── Playback ───────────────────────────────────────────
  async function startPlayback() {
    if (isPlaying) return;
    setIsPlaying(true);
    setPlayheadIdx(0);

    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    playbackCtxRef.current = ctx;

    const beatDur = 60 / tempo;        // seconds per beat (quarter note)
    let time = ctx.currentTime + 0.1;

    melody.notes.forEach((n, i) => {
      const concertMidi = writtenToConcert(n.note);
      const durSec = n.dur * beatDur;

      // Schedule the note
      playNote(ctx, concertMidi, durSec * 0.9, time);

      // Animate playhead
      const noteTime = time;
      setTimeout(() => {
        setPlayheadIdx(i);
      }, (noteTime - ctx.currentTime) * 1000);

      time += durSec;
    });

    // Done
    const totalDur = melody.notes.reduce((s, n) => s + n.dur * (60 / tempo), 0);
    setTimeout(() => {
      setIsPlaying(false);
      setPlayheadIdx(-1);
      if (playbackCtxRef.current) playbackCtxRef.current.close();
    }, (totalDur + 0.5) * 1000);
  }

  function stopPlayback() {
    if (playbackCtxRef.current) playbackCtxRef.current.close();
    setIsPlaying(false);
    setPlayheadIdx(-1);
  }

  // ── Practice mic loop ──────────────────────────────────
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
        const inTune = Math.abs(detMidi - targetMidi) <= 1;

        const writtenMidi = detMidi + 14;
        const name = NOTE_NAMES[(writtenMidi % 12 + 12) % 12];
        const oct = Math.floor(writtenMidi / 12) - 1;
        setDetectedNote(name + oct);

        const centsVal = Math.round((12 * Math.log2(freq / (440 * Math.pow(2, (targetMidi - 69) / 12)))) * 100);
        setCentsOff(centsVal);

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
              setPracticeDone(true);
              stopPractice();
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
      audioCtxRef.current = ctx;
      analyserRef.current = analyser;
      sourceRef.current = src;
      isDone.current = false;
      startLoop(analyser, ctx.sampleRate);
      setListening(true);
    } catch {
      alert("Microphone access denied.");
    }
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
    setNoteIdx(0);
    setResults([]);
    setPracticeDone(false);
    setDetectedNote(null);
    setHoldPct(0);
    setHoldStatus(null);
    noteResults.current = [];
    currentIdx.current = 0;
    isDone.current = false;
    holdFrames.current = 0;
    silFrames.current = 0;
  }

  useEffect(() => () => { stopPractice(); stopPlayback(); }, []);

  // ── Styles ─────────────────────────────────────────────
  const card = {
    background:"white", border:"1px solid #e5e7eb",
    borderRadius:16, padding:20, marginBottom:14,
  };

  const notes = melody?.notes || [];
  const target = notes[noteIdx];
  const inTune = holdStatus != null;
  const correct = results.filter(r => r === "correct").length;

  // ── RENDER ─────────────────────────────────────────────
  return (
    <div style={{ maxWidth:540, margin:"0 auto" }}>
      <h2 style={{ fontSize:18, fontWeight:700, marginBottom:4 }}>Sheet Coach</h2>
      <p style={{ fontSize:12, color:"#6b7280", marginBottom:16 }}>
        Upload your sheet music — AI reads it, plays it back, then coaches you through it
      </p>

      {/* ── UPLOAD ── */}
      {stage === "upload" && (
        <div style={{ ...card, textAlign:"center" }}>
          <div style={{ fontSize:48, marginBottom:12 }}>📷</div>
          <div style={{ fontSize:15, fontWeight:600, marginBottom:8 }}>Upload Sheet Music</div>
          <div style={{ fontSize:12, color:"#6b7280", marginBottom:20 }}>
            Take a photo or scan of your part. Works best with clear printed music on a flat surface.
          </div>
          {error && (
            <div style={{ background:"#fef2f2", color:"#dc2626", borderRadius:8, padding:"10px 14px", fontSize:13, marginBottom:16 }}>
              {error}
            </div>
          )}
          <div style={{ display:"flex", gap:10, justifyContent:"center", flexWrap:"wrap" }}>
            <label style={{
              display:"inline-block", padding:"12px 24px", borderRadius:10,
              background:"#2563eb", color:"white", fontWeight:700, fontSize:14,
              cursor:"pointer",
            }}>
              📁 Choose from Gallery
              <input type="file" accept="image/*"
                onChange={handleImageUpload} style={{ display:"none" }} />
            </label>
            <label style={{
              display:"inline-block", padding:"12px 24px", borderRadius:10,
              background:"#7c3aed", color:"white", fontWeight:700, fontSize:14,
              cursor:"pointer",
            }}>
              📷 Take a Photo
              <input type="file" accept="image/*" capture="environment"
                onChange={handleImageUpload} style={{ display:"none" }} />
            </label>
          </div>
          <div style={{ fontSize:11, color:"#9ca3af", marginTop:12 }}>
            JPG, PNG or HEIC — printed treble clef music only
          </div>
        </div>
      )}

      {/* ── TRANSCRIBING ── */}
      {stage === "transcribing" && (
        <div style={{ ...card, textAlign:"center" }}>
          {imagePreview && (
            <img src={imagePreview} alt="Sheet music"
              style={{ width:"100%", borderRadius:8, marginBottom:16, maxHeight:300, objectFit:"contain" }} />
          )}
          <div style={{ fontSize:32, marginBottom:12 }}>
            <span style={{ display:"inline-block", animation:"spin 1s linear infinite" }}>🎵</span>
          </div>
          <div style={{ fontSize:15, fontWeight:600, marginBottom:4 }}>Reading your music...</div>
          <div style={{ fontSize:12, color:"#6b7280" }}>
            AI is transcribing every note — this takes about 10 seconds
          </div>
          <style>{`@keyframes spin { from{transform:rotate(0deg)} to{transform:rotate(360deg)} }`}</style>
        </div>
      )}

      {/* ── REVIEW ── */}
      {stage === "review" && melody && (
        <>
          <div style={{ ...card }}>
            <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:12 }}>
              <div>
                <div style={{ fontSize:16, fontWeight:700 }}>{melody.title}</div>
                <div style={{ fontSize:12, color:"#6b7280" }}>{notes.length} notes transcribed</div>
              </div>
              <button onClick={() => { setStage("upload"); setMelody(null); setImagePreview(null); }}
                style={{ fontSize:12, color:"#6b7280", background:"none", border:"1px solid #e5e7eb", borderRadius:8, padding:"6px 12px", cursor:"pointer" }}>
                Re-upload
              </button>
            </div>
            {imagePreview && (
              <img src={imagePreview} alt="Sheet music"
                style={{ width:"100%", borderRadius:8, marginBottom:12, maxHeight:200, objectFit:"contain" }} />
            )}
            <MiniStaff notes={notes} currentIdx={-1} results={[]} />
          </div>

          {/* Tempo + playback */}
          <div style={{ ...card }}>
            <div style={{ fontSize:13, fontWeight:600, marginBottom:12 }}>Listen first — hear the tune before you play</div>
            <div style={{ display:"flex", alignItems:"center", gap:12, marginBottom:16 }}>
              <label style={{ fontSize:12, color:"#6b7280", minWidth:50 }}>Tempo:</label>
              <input type="range" min={40} max={160} value={tempo}
                onChange={e => setTempo(Number(e.target.value))}
                style={{ flex:1 }} />
              <span style={{ fontSize:13, fontWeight:700, minWidth:40 }}>{tempo} BPM</span>
            </div>
            <div style={{ display:"flex", gap:10 }}>
              <button
                onClick={isPlaying ? stopPlayback : startPlayback}
                style={{
                  flex:1, padding:"12px 0", borderRadius:10, border:"none",
                  background: isPlaying ? "#dc2626" : "#7c3aed",
                  color:"white", fontWeight:700, fontSize:14, cursor:"pointer",
                }}>
                {isPlaying ? "Stop" : "Play it back"}
              </button>
              <button
                onClick={() => { resetPractice(); setStage("practice"); }}
                style={{
                  flex:1, padding:"12px 0", borderRadius:10, border:"none",
                  background:"#16a34a", color:"white", fontWeight:700, fontSize:14, cursor:"pointer",
                }}>
                Practise it
              </button>
            </div>
          </div>

          {/* Playback staff with moving highlight */}
          {isPlaying && (
            <div style={card}>
              <div style={{ fontSize:12, color:"#6b7280", marginBottom:8 }}>Playing...</div>
              <MiniStaff notes={notes} currentIdx={playheadIdx} results={[]} />
            </div>
          )}
        </>
      )}

      {/* ── PRACTICE ── */}
      {stage === "practice" && melody && (
        <>
          {/* Score header */}
          <div style={{ ...card, display:"flex", justifyContent:"space-between", alignItems:"center" }}>
            <div>
              <div style={{ fontSize:15, fontWeight:700 }}>{melody.title}</div>
              <div style={{ fontSize:12, color:"#6b7280" }}>
                Note {Math.min(noteIdx + 1, notes.length)} of {notes.length}
                {results.length > 0 && ` · ${correct}/${results.length} correct`}
              </div>
            </div>
            <div style={{ display:"flex", gap:8 }}>
              <button onClick={() => setStage("review")}
                style={{ fontSize:12, color:"#6b7280", background:"none", border:"1px solid #e5e7eb", borderRadius:8, padding:"6px 10px", cursor:"pointer" }}>
                Listen again
              </button>
              <button onClick={resetPractice}
                style={{ fontSize:12, color:"#6b7280", background:"none", border:"1px solid #e5e7eb", borderRadius:8, padding:"6px 10px", cursor:"pointer" }}>
                Restart
              </button>
            </div>
          </div>

          {/* Staff */}
          <div style={card}>
            <MiniStaff notes={notes} currentIdx={noteIdx} results={results} />
          </div>

          {/* Target vs detected */}
          {!practiceDone && target && (
            <div style={{ ...card, textAlign:"center" }}>
              <div style={{ display:"flex", justifyContent:"space-around", alignItems:"center" }}>
                <div>
                  <div style={{ fontSize:11, color:"#9ca3af", marginBottom:2 }}>Play this</div>
                  <div style={{ fontSize:48, fontWeight:800, letterSpacing:-2, color:"#2563eb", lineHeight:1 }}>
                    {target.note}
                  </div>
                </div>
                <div style={{ fontSize:22, color:"#d1d5db" }}>→</div>
                <div>
                  <div style={{ fontSize:11, color:"#9ca3af", marginBottom:2 }}>You're playing</div>
                  <div style={{
                    fontSize:48, fontWeight:800, letterSpacing:-2, lineHeight:1,
                    color: inTune ? "#16a34a" : detectedNote ? "#f59e0b" : "#d1d5db",
                  }}>
                    {detectedNote || "—"}
                  </div>
                  {detectedNote && (
                    <div style={{ fontSize:11, marginTop:2, color: inTune ? "#16a34a" : "#9ca3af" }}>
                      {inTune ? "in tune" : (centsOff > 0 ? "+" : "") + centsOff + "c"}
                    </div>
                  )}
                </div>
              </div>
              {/* Hold bar */}
              <div style={{ height:8, borderRadius:4, background:"#f3f4f6", margin:"12px 0 0", overflow:"hidden" }}>
                <div style={{
                  height:"100%", borderRadius:4, width: holdPct + "%",
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

          {/* Done summary */}
          {practiceDone && (
            <div style={{ ...card, textAlign:"center" }}>
              <div style={{ fontSize:32, marginBottom:4 }}>
                {correct === notes.length ? "Perfect!" : correct >= notes.length * 0.8 ? "Great!" : "Keep going!"}
              </div>
              <div style={{ fontSize:48, fontWeight:800, color:"#111827", lineHeight:1 }}>
                {Math.round((correct / notes.length) * 100)}%
              </div>
              <div style={{ fontSize:14, color:"#6b7280", marginBottom:16 }}>
                {correct} / {notes.length} notes correct
              </div>
              <div style={{ display:"flex", gap:10, justifyContent:"center" }}>
                <button onClick={resetPractice}
                  style={{ padding:"12px 24px", borderRadius:10, border:"none", background:"#2563eb", color:"white", fontWeight:700, cursor:"pointer" }}>
                  Try Again
                </button>
                <button onClick={() => setStage("review")}
                  style={{ padding:"12px 24px", borderRadius:10, border:"1px solid #e5e7eb", background:"white", color:"#374151", fontWeight:700, cursor:"pointer" }}>
                  Back to Score
                </button>
              </div>
            </div>
          )}

          {/* Mic button */}
          {!practiceDone && (
            <button
              onClick={listening ? stopPractice : startPractice}
              style={{
                width:"100%", padding:"14px 0", borderRadius:12, border:"none",
                background: listening ? "#dc2626" : "#2563eb",
                color:"white", fontSize:16, fontWeight:700, cursor:"pointer",
                marginBottom:12,
              }}>
              {listening ? "Stop Listening" : "Start Listening"}
            </button>
          )}
        </>
      )}
    </div>
  );
}
