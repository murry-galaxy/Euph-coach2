import React from "react";
import { BrowserRouter, Routes, Route, NavLink } from "react-router-dom";
import ValveCoach from "./pages/ValveCoach.jsx";
import PitchCoach from "./pages/PitchCoach.jsx";

export default function App() {
  return (
    <BrowserRouter>
      <div style={{ maxWidth: 960, margin: "0 auto", padding: 16, fontFamily: "system-ui, sans-serif" }}>
        {/* Header */}
        <header style={{ marginBottom: 16 }}>
          <h1 style={{ fontSize: 24, fontWeight: 700, marginBottom: 4 }}>Euphonium Coach</h1>
          <div style={{ fontSize: 12, color: "#6b7280" }}>you can view it at dave.ltd</div>
        </header>

        {/* Nav */}
        <nav style={{ display: "flex", gap: 8, marginBottom: 16 }}>
          <NavLink
            to="/"
            end
            style={({ isActive }) => ({
              padding: "8px 12px",
              borderRadius: 8,
              textDecoration: "none",
              background: isActive ? "#111827" : "white",
              color: isActive ? "white" : "black",
              border: "1px solid #ddd"
            })}
          >
            Valve Coach
          </NavLink>
          <NavLink
            to="/pitch"
            style={({ isActive }) => ({
              padding: "8px 12px",
              borderRadius: 8,
              textDecoration: "none",
              background: isActive ? "#111827" : "white",
              color: isActive ? "white" : "black",
              border: "1px solid #ddd"
            })}
          >
            Pitch Coach
          </NavLink>
        </nav>

        {/* Routes */}
        <Routes>
          <Route path="/" element={<ValveCoach />} />
          <Route path="/pitch" element={<PitchCoach />} />
        </Routes>
      </div>
    </BrowserRouter>
  );
}
