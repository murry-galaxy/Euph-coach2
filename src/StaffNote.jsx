import React from "react";

/**
 * StaffNote: render a treble-clef staff and a single notehead for a written note (e.g., "Bb4", "C#5").
 * - Positions are DIATONIC: accidentals share the same line/space as their natural.
 * - Treble reference: bottom line = E4 (index 0). Each diatonic step = 1 position.
 * - Ledger lines drawn for even indices outside 0..8 (staff lines).
 */
export default function StaffNote({ note, width = 420, height = 160 }) {
  // Layout constants
  const leftPadding = 60;               // room for clef & accidental
  const rightPadding = 30;
  const staffTop = 40;                  // where the top line sits
  const lineGap = 12;                   // distance between staff lines
  const staffLines = 5;                 // treble staff
  const noteX = leftPadding + 220;      // note horizontal position
  const noteHeadW = 16, noteHeadH = 12; // ellipse radii*2 effectively
  const stroke = "#111827";

  // Parse "C#4" / "Bb4" etc.
  const m = String(note).match(/^([A-Ga-g])([#b]?)(\d)$/);
  const letter = m ? m[1].toUpperCase() : "C";
  const accidental = m ? m[2] : "";
  const octave = m ? parseInt(m[3], 10) : 4;

  // Diatonic maps
  const LETTER_INDEX = { C:0, D:1, E:2, F:3, G:4, A:5, B:6 };
  // Absolute diatonic number with Cn = 7*n
  const absDiatonic = (L, oct) => 7*oct + LETTER_INDEX[L];

  // Reference: bottom line E4 = index 0 on our staff
  const E4_abs = absDiatonic("E", 4);
  const noteAbs = absDiatonic(letter, octave);
  const pos = noteAbs - E4_abs; // diatonic steps from E4 (positive = up)

  // Staff vertical helpers
  // Lines (0..4) correspond to indices: 0,2,4,6,8
  const idxToY = (i) => {
    // index 0 (E4 line) has y = bottom line
    const bottomLineY = staffTop + (staffLines - 1) * lineGap;
    return bottomLineY - i * (lineGap / 2);
  };

  // Staff lines (the 5 main lines)
  const staffYs = Array.from({ length: staffLines }, (_, i) => staffTop + i*lineGap);

  // Notehead vertical position
  const noteY = idxToY(pos);

  // Stem direction: up for positions <= middle line (B4 = index 4)
  const stemUp = pos <= 4;
  const stemLen = 36;
  const stemX = noteX + (stemUp ? noteHeadW/2 - 1 : -noteHeadW/2 + 1);
  const stemY1 = noteY;                           // attach at notehead edge
  const stemY2 = stemUp ? (noteY - stemLen) : (noteY + stemLen);

  // Ledger lines: draw small lines for even indices outside the staff [0..8]
  const neededLedgerIndices = [];
  const minIdx = Math.min(pos, 0);
  const maxIdx = Math.max(pos, 8);
  for (let i = minIdx; i <= maxIdx; i++) {
    const isLine = (i % 2 === 0);
    const outside = (i < 0 || i > 8);
    if (isLine && outside) neededLedgerIndices.push(i);
  }

  // Render
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} role="img" aria-label={`Treble staff note ${note}`}>
      {/* Staff lines */}
      {staffYs.map((y, i) => (
        <line key={i} x1={leftPadding} x2={width - rightPadding} y1={y} y2={y} stroke={stroke} strokeWidth="1.5" />
      ))}

      {/* Treble clef (Unicode glyph). If it doesn't render nicely on your device, you can remove it. */}
      <text x={leftPadding - 40} y={staffTop + lineGap*4.2} fontSize="58" fontFamily="serif" fill={stroke}>
        {"\uD834\uDD1E" /* G clef 𝄞 */}
      </text>

      {/* Accidental (very simple text; left of note) */}
      {accidental === "#" && (
        <text x={noteX - 26} y={noteY + 5} fontSize="18" fontFamily="serif" fill={stroke}>#</text>
      )}
      {accidental === "b" && (
        <text x={noteX - 26} y={noteY + 5} fontSize="18" fontFamily="serif" fill={stroke}>b</text>
      )}

      {/* Ledger lines */}
      {neededLedgerIndices.map((i, k) => (
        <line
          key={`ledger-${i}-${k}`}
          x1={noteX - 18}
          x2={noteX + 18}
          y1={idxToY(i)}
          y2={idxToY(i)}
          stroke={stroke}
          strokeWidth="1.5"
        />
      ))}

      {/* Notehead */}
      <ellipse
        cx={noteX}
        cy={noteY}
        rx={noteHeadW/2}
        ry={noteHeadH/2}
        fill={stroke}
        transform={`rotate(-15 ${noteX} ${noteY})`}
      />

      {/* Stem */}
      <line x1={stemX} y1={stemY1} x2={stemX} y2={stemY2} stroke={stroke} strokeWidth="2" />
    </svg>
  );
}
