"use client";

import { useEffect, useState } from "react";
import { getStreakInfo } from "@/lib/engine/closure";

interface StreakData {
  chainDay: number;
  todayStatus: "clean" | "partial" | "missed" | "pending";
}

export function StreakDisplay() {
  const [streak, setStreak] = useState<StreakData | null>(null);

  useEffect(() => {
    fetch("/api/streak")
      .then((r) => r.json())
      .then(setStreak)
      .catch(() => setStreak({ chainDay: 0, todayStatus: "pending" }));
  }, []);

  if (!streak) return null;

  const icon =
    streak.todayStatus === "clean"
      ? "🔥"
      : streak.todayStatus === "partial"
      ? "⚡"
      : streak.todayStatus === "missed"
      ? "💔"
      : "◎";

  const statusColor =
    streak.todayStatus === "clean"
      ? "text-[var(--accent)]"
      : streak.todayStatus === "partial"
      ? "text-[var(--info)]"
      : streak.todayStatus === "missed"
      ? "text-[var(--danger)]"
      : "text-[var(--text-muted)]";

  return (
    <div className="px-4 py-3 border-b border-[var(--border)]">
      <div className="flex items-center justify-between">
        <span className="font-mono text-xs tracking-widest text-[var(--text-muted)] uppercase">Chain</span>
        <div className={`flex items-center gap-1.5 ${statusColor}`}>
          <span className="text-lg">{icon}</span>
          <span className="font-mono text-2xl font-bold">{streak.chainDay}</span>
        </div>
      </div>
      <p className="text-[10px] font-mono text-[var(--text-muted)] mt-0.5 text-right capitalize">
        {streak.todayStatus === "pending" ? "today pending" : `today: ${streak.todayStatus}`}
      </p>
    </div>
  );
}
