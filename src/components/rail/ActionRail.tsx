"use client";

import { TodaySection } from "./TodaySection";
import { UpcomingSection } from "./UpcomingSection";
import { StreakDisplay } from "./StreakDisplay";
import { CreditCounter } from "./CreditCounter";
import { MemorySection } from "./MemorySection";
import { TimelineSection } from "./TimelineSection";
import {
  detectUserTimeZone,
  isValidTimeZone,
  listSelectableTimeZones,
  TIMEZONE_STORAGE_KEY,
} from "@/lib/timezone";
import { useState, useCallback, useEffect, useMemo } from "react";

interface ActionRailProps {
  refreshPulse?: number;
}

export function ActionRail({ refreshPulse }: ActionRailProps) {
  const [pulse, setPulse] = useState(0);
  const [activeTab, setActiveTab] = useState<"tasks" | "memories" | "timeline">("tasks");
  const [timezone, setTimezone] = useState("UTC");

  const forceUpdate = useCallback(() => {
    setPulse((p) => p + 1);
  }, []);

  const toggleTheme = useCallback(() => {
    document.documentElement.classList.toggle("light");
  }, []);

  useEffect(() => {
    const detected = detectUserTimeZone();
    const stored = window.localStorage.getItem(TIMEZONE_STORAGE_KEY);
    setTimezone(stored && isValidTimeZone(stored) ? stored : detected);
  }, []);

  useEffect(() => {
    if (!timezone) return;
    window.localStorage.setItem(TIMEZONE_STORAGE_KEY, timezone);
  }, [timezone]);

  const timezoneOptions = useMemo(() => listSelectableTimeZones(timezone), [timezone]);

  return (
    <div className="flex flex-col h-full bg-[var(--bg-secondary)] border-l border-[var(--border)] overflow-y-auto">
      {/* Top section: Streaks & Counters */}
      <div className="shrink-0 bg-[var(--bg-tertiary)]/30 border-b border-[var(--border)]">
        <StreakDisplay key={`streak-${pulse}-${refreshPulse}`} />
        <CreditCounter key={`credits-${pulse}-${refreshPulse}`} />
      </div>

      {/* Tabs */}
      <div className="shrink-0 flex divide-x divide-[var(--border)] border-b border-[var(--border)] mb-4">
        <button 
          onClick={() => setActiveTab("tasks")}
          className={`flex-1 py-1.5 text-[10px] font-mono tracking-widest uppercase transition-colors ${activeTab === "tasks" ? "bg-[var(--bg-tertiary)]/50 text-[var(--text-primary)]" : "text-[var(--text-muted)] hover:bg-[var(--bg-tertiary)]/20"}`}
        >TASKS</button>
        <button 
          onClick={() => setActiveTab("memories")}
          className={`flex-1 py-1.5 text-[10px] font-mono tracking-widest uppercase transition-colors ${activeTab === "memories" ? "bg-[var(--bg-tertiary)]/50 text-[var(--text-primary)]" : "text-[var(--text-muted)] hover:bg-[var(--bg-tertiary)]/20"}`}
        >MEMORIES</button>
        <button 
          onClick={() => setActiveTab("timeline")}
          className={`flex-1 py-1.5 text-[10px] font-mono tracking-widest uppercase transition-colors ${activeTab === "timeline" ? "bg-[var(--bg-tertiary)]/50 text-[var(--text-primary)]" : "text-[var(--text-muted)] hover:bg-[var(--bg-tertiary)]/20"}`}
        >TIMELINE</button>
      </div>

      {/* Main content area */}
      <div className="flex-1 flex flex-col gap-6 pb-8">
        {activeTab === "tasks" ? (
          <>
            <TodaySection key={`today-${pulse}-${refreshPulse}`} onTaskUpdate={forceUpdate} />
            <UpcomingSection key={`upcoming-${pulse}-${refreshPulse}`} onTaskUpdate={forceUpdate} />
          </>
        ) : activeTab === "timeline" ? (
          <TimelineSection
            key={`timeline-${pulse}-${refreshPulse}-${timezone}`}
            refreshPulse={pulse + (refreshPulse ?? 0)}
            timezone={timezone}
            onTaskUpdate={forceUpdate}
          />
        ) : (
          <MemorySection key={`memories-${pulse}-${refreshPulse}`} />
        )}
      </div>

      {/* Footer minimal branding & theme toggle */}
      <div className="shrink-0 px-4 py-3 border-t border-[var(--border)] flex justify-between items-center gap-3">
        <div className="flex items-center gap-2">
          <button onClick={toggleTheme} className="text-xs text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors" title="Toggle Light/Dark Theme">
            ☼ / ☾
          </button>
          <label className="text-[10px] font-mono uppercase tracking-widest text-[var(--text-muted)]">TZ</label>
          <select
            value={timezone}
            onChange={(event) => setTimezone(event.target.value)}
            className="w-36 bg-[var(--bg-primary)] border border-[var(--border)] text-[10px] font-mono text-[var(--text-secondary)] px-1.5 py-1 focus:outline-none focus:border-[var(--accent)]"
            title="Timeline timezone"
          >
            {timezoneOptions.map((zone) => (
              <option key={zone} value={zone}>
                {zone}
              </option>
            ))}
          </select>
        </div>
        <span className="font-mono text-[10px] tracking-widest text-[var(--text-muted)] uppercase">DONECHAIN v0.1.0</span>
      </div>
    </div>
  );
}
