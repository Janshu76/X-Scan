"use client";

import { createContext, useContext, useEffect, useMemo, useState } from "react";

export type ViewMode = "public" | "research";
const ViewModeContext = createContext<{ mode: ViewMode; setMode: (mode: ViewMode) => void } | null>(null);

export function ViewModeProvider({ children }: { children: React.ReactNode }) {
  const [mode, setModeState] = useState<ViewMode>("public");
  useEffect(() => {
    const stored = localStorage.getItem("terrawatch-view-mode");
    if (stored === "public" || stored === "research") setModeState(stored);
  }, []);
  const value = useMemo(() => ({
    mode,
    setMode(next: ViewMode) { setModeState(next); localStorage.setItem("terrawatch-view-mode", next); },
  }), [mode]);
  return <ViewModeContext.Provider value={value}>{children}</ViewModeContext.Provider>;
}

export function useViewMode() {
  const value = useContext(ViewModeContext);
  if (!value) throw new Error("useViewMode must be used inside ViewModeProvider");
  return value;
}

export function ViewModeSelector() {
  const { mode, setMode } = useViewMode();
  return <div className="view-mode-selector" role="group" aria-label="Choose presentation view">
    <button type="button" aria-pressed={mode === "public"} onClick={() => setMode("public")}>Public View</button>
    <button type="button" aria-pressed={mode === "research"} onClick={() => setMode("research")}>Research View</button>
  </div>;
}
