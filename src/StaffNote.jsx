import React from "react";

/**
 * StaffNote: render a treble-clef staff and a single notehead for a written note (e.g., "Bb4", "C#5").
 * - If ok===true → notehead turns green
 * - If ok===false → notehead turns red
 * - Otherwise (undefined) → black
 */
export default function StaffNote({ note, ok, width = 420, height = 160 }) {
  const leftPadding = 60;
  const rightPadding = 30;
  const staffTop = 40;
  const lineGap = 12;
  const staffLines = 5;
  const noteX = leftPadding + 220;
  const noteHeadW = 16, noteHeadH = 12;
  const stroke = "#111827";

  const m = String(note).match(/^([A-Ga-g])([#b]?)(\d)$/);
  const letter = m ? m[1].toUpperCase() : "C";
  const accidental = m ? m[2] : "";
  const octave = m ? parseInt(m[3], 10) : 4;

  const LETTER_INDEX = { C: 0, D: 1, E: 2, F: 3, G: 4, A: 5, B: 6 };
  const absDiatonic = (L, oct) => 7 * oct + LETTER_INDEX[L];

  // Bottom line E4 is index 0 on our staff (each diatonic step = 1/2 lineGap)
  const E4_abs = absDiatonic("E", 4);
  const noteAbs = absDiatonic(letter, octave);
  const pos = noteAbs - E4_abs;

  const idxToY = (i) => {
    const bottomLineY = staffTop + (staffLines - 1) * lineGap;
    return bottomLineY - i * (lineGap / 2);
  };
  const staffYs = Array.from({ length: staffLines }, (_, i) => staffTop + i * lineGap);
  const noteY = idxToY(pos);

  const stemUp = pos <= 4;
  const stemLen = 36;
  const stemX = noteX + (stemUp ? noteHeadW / 2 - 1 : -noteHeadW / 2 + 1);
  const stemY1 = noteY;
  const stemY2 = stemUp ? noteY - stemLen : noteY + stemLen;

  const neededLedgerIndices = [];
  const minIdx = Math.min(pos, 0);
  const maxIdx = Math.max(pos, 8);
  for (let i = minIdx; i <= maxIdx; i++) {
    const isLine = i % 2 === 0;
    const outside = i < 0 || i > 8;
    if (isLine && outside) neededLedgerIndices.push(i);
  }

  const fillColor =
    ok === true ? "#22c55e" : ok === false ? "#dc2626" : stroke; // green / red / black

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      role="img"
      aria-label={`Treble staff note ${note}`}
    >
      {/* Staff lines */}
      {staffYs.map((y, i) => (
        <line key={i} x1={leftPadding} x2={width - rightPadding} y1={y} y2={y} stroke={stroke} strokeWidth="1.5" />
      ))}

      {/* G clef (𝄞) */}
      <text x={leftPadding - 40} y={staffTop + lineGap * 4.2} fontSize="58" fontFamily="serif" fill={stroke}>
        {"\uD834\uDD1E"}
      </text>

      {/* Accidental text */}
      {accidental === "#" && (
        <text x={noteX - 26} y={noteY + 5} fontSize="18" fontFamily="serif" fill={stroke}>#</text>
      )}
      {accidental === "b" && (
        <text x={noteX - 26} y={noteY + 5} fontSize="18" fontFamily="serif" fill={stroke}>b</text>
      )}

      {/* Ledger lines */}
      {neededLedgerIndices.map((i, k) => (
        <line key={`ledger-${i}-${k}`} x1={noteX - 18} x2={noteX + 18} y1={idxToY(i)} y2={idxToY(i)} stroke={stroke} strokeWidth="1.5" />
      ))}

      {/* Colour-coded notehead */}
      <ellipse
        cx={noteX}
        cy={noteY}
        rx={noteHeadW / 2}
        ry={noteHeadH / 2}
        fill={fillColor}
        transform={`rotate(-15 ${noteX} ${noteY})`}
      />

      {/* Stem */}
      <line x1={stemX} y1={stemY1} x2={stemX} y2={stemY2} stroke={stroke} strokeWidth="2" />
    </svg>
  );
}
