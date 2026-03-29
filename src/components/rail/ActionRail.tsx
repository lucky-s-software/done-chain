"use client";

import { TodaySection } from "./TodaySection";
import { UpcomingSection } from "./UpcomingSection";
import { StreakDisplay } from "./StreakDisplay";
import { CreditCounter } from "./CreditCounter";
import { MemorySection } from "./MemorySection";
import { TimelineSection } from "./TimelineSection";
import { listSelectableTimeZones } from "@/lib/timezone";
import {
  applyThemeMode,
  isThemeMode,
  THEME_STORAGE_KEY,
  type ThemeMode,
} from "@/lib/theme";
import { useState, useCallback, useEffect, useMemo } from "react";

interface ActionRailProps {
  refreshPulse?: number;
  timezone: string;
  onTimezoneChange: (timezone: string) => void;
}

export function ActionRail({ refreshPulse, timezone, onTimezoneChange }: ActionRailProps) {
  const [pulse, setPulse] = useState(0);
  const [activeTab, setActiveTab] = useState<"tasks" | "memories" | "timeline">("tasks");
  const [themeMode, setThemeMode] = useState<ThemeMode>("system");

  const forceUpdate = useCallback(() => {
    setPulse((p) => p + 1);
  }, []);

  const timezoneOptions = useMemo(() => listSelectableTimeZones(timezone), [timezone]);
  const themeOptions: Array<{ value: ThemeMode; label: string }> = useMemo(
    () => [
      { value: "system", label: "◐ SYSTEM" },
      { value: "dark", label: "☾ DARK" },
      { value: "light", label: "☼ LIGHT" },
    ],
    []
  );

  useEffect(() => {
    const stored = window.localStorage.getItem(THEME_STORAGE_KEY);
    const initial = isThemeMode(stored) ? stored : "system";
    setThemeMode(initial);
    applyThemeMode(initial);
  }, []);

  useEffect(() => {
    window.localStorage.setItem(THEME_STORAGE_KEY, themeMode);
    applyThemeMode(themeMode);
  }, [themeMode]);

  useEffect(() => {
    if (themeMode !== "system") return;
    const media = window.matchMedia("(prefers-color-scheme: light)");
    const onChange = () => applyThemeMode("system");

    if (typeof media.addEventListener === "function") {
      media.addEventListener("change", onChange);
      return () => media.removeEventListener("change", onChange);
    }

    media.addListener(onChange);
    return () => media.removeListener(onChange);
  }, [themeMode]);

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
            <TodaySection
              key={`today-${pulse}-${refreshPulse}-${timezone}`}
              onTaskUpdate={forceUpdate}
              timezone={timezone}
            />
            <UpcomingSection
              key={`upcoming-${pulse}-${refreshPulse}-${timezone}`}
              onTaskUpdate={forceUpdate}
              timezone={timezone}
            />
          </>
        ) : activeTab === "timeline" ? (
          <TimelineSection
            key={`timeline-${pulse}-${refreshPulse}-${timezone}`}
            refreshPulse={pulse + (refreshPulse ?? 0)}
            timezone={timezone}
            onTaskUpdate={forceUpdate}
          />
        ) : (
          <MemorySection key={`memories-${pulse}-${refreshPulse}-${timezone}`} timezone={timezone} />
        )}
      </div>

      {/* Footer minimal branding + controls */}
      <div className="shrink-0 px-4 py-3 border-t border-[var(--border)] flex justify-between items-center gap-3">
        <div className="flex items-center gap-2">
          <label className="text-[10px] font-mono uppercase tracking-widest text-[var(--text-muted)]">Theme</label>
          <select
            value={themeMode}
            onChange={(event) => setThemeMode(event.target.value as ThemeMode)}
            className="w-24 bg-[var(--bg-primary)] border border-[var(--border)] text-[10px] font-mono text-[var(--text-secondary)] px-1.5 py-1 focus:outline-none focus:border-[var(--accent)]"
            title="Theme mode"
          >
            {themeOptions.map((theme) => (
              <option key={theme.value} value={theme.value}>
                {theme.label}
              </option>
            ))}
          </select>
          <label className="text-[10px] font-mono uppercase tracking-widest text-[var(--text-muted)]">TZ</label>
          <select
            value={timezone}
            onChange={(event) => onTimezoneChange(event.target.value)}
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
