import React from "react";
import { BrowserRouter, Routes, Route, NavLink } from "react-router-dom";
import ValveCoach from "./pages/ValveCoach.jsx";
import PitchCoach from "./pages/PitchCoach.jsx";
import ScoreCoach from "./pages/ScoreCoach.jsx";
import SheetCoach from "./pages/SheetCoach.jsx";

const navStyle = ({ isActive }) => ({
  padding: "8px 12px",
  borderRadius: 8,
  textDecoration: "none",
  background: isActive ? "#111827" : "white",
  color: isActive ? "white" : "black",
  border: "1px solid #ddd",
  fontSize: 14,
  fontWeight: 500,
});

export default function App() {
  return (
    <BrowserRouter>
      <div style={{ maxWidth: 960, margin: "0 auto", padding: 16, fontFamily: "system-ui, sans-serif" }}>
        <header style={{ marginBottom: 16 }}>
          <h1 style={{ fontSize: 24, fontWeight: 700, marginBottom: 4 }}>Euphonium Coach</h1>
          <div style={{ fontSize: 12, color: "#6b7280" }}>Valve · Pitch · Score · Sheet</div>
        </header>
        <nav style={{ display: "flex", gap: 8, marginBottom: 16, flexWrap: "wrap" }}>
          <NavLink to="/"       end  style={navStyle}>Valve Coach</NavLink>
          <NavLink to="/pitch"       style={navStyle}>Pitch Coach</NavLink>
          <NavLink to="/score"       style={navStyle}>Score Coach</NavLink>
          <NavLink to="/sheet"       style={navStyle}>Sheet Coach</NavLink>
        </nav>
        <Routes>
          <Route path="/"       element={<ValveCoach />} />
          <Route path="/pitch"  element={<PitchCoach />} />
          <Route path="/score"  element={<ScoreCoach />} />
          <Route path="/sheet"  element={<SheetCoach />} />
        </Routes>
      </div>
    </BrowserRouter>
  );
}
