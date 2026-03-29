"use client";

import { TodaySection } from "./TodaySection";
import { UpcomingSection } from "./UpcomingSection";
import { StreakDisplay } from "./StreakDisplay";
import { CreditCounter } from "./CreditCounter";
import { useState, useCallback } from "react";

interface ActionRailProps {
  memoryPulse?: number; // increments when memories are created to force refetch if needed
}

export function ActionRail({ memoryPulse }: ActionRailProps) {
  const [pulse, setPulse] = useState(0);

  const forceUpdate = useCallback(() => {
    setPulse((p) => p + 1);
  }, []);

  return (
    <div className="flex flex-col h-full bg-[var(--bg-secondary)] border-l border-[var(--border)] overflow-y-auto">
      {/* Top section: Streaks & Counters */}
      <div className="shrink-0 bg-[var(--bg-tertiary)]/30 border-b border-[var(--border)] mb-4">
        <StreakDisplay key={`streak-${pulse}-${memoryPulse}`} />
        <CreditCounter key={`credits-${pulse}-${memoryPulse}`} />
      </div>

      {/* Main task lists */}
      <div className="flex-1 flex flex-col gap-6 pb-8">
        <TodaySection key={`today-${pulse}`} onTaskUpdate={forceUpdate} />
        <UpcomingSection key={`upcoming-${pulse}`} />
      </div>

      {/* Footer minimal branding */}
      <div className="shrink-0 px-4 py-3 border-t border-[var(--border)] text-right">
        <span className="font-mono text-[10px] tracking-widest text-[var(--text-muted)] uppercase">DONECHAIN v0.1.0</span>
      </div>
    </div>
  );
}
