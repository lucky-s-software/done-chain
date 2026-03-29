"use client";

import { useCallback, useEffect, useState } from "react";
import type { Task } from "@/types";
import { formatDateKeyLabel, getDateKeyInTimeZone } from "@/lib/timezone";

interface UpcomingSectionProps {
  onTaskUpdate?: () => void;
  timezone: string;
}

export function UpcomingSection({ onTaskUpdate, timezone }: UpcomingSectionProps) {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const r = await fetch("/api/tasks?status=active");
      const data = await r.json();
      const todayKey = getDateKeyInTimeZone(new Date(), timezone);
      // Tasks due after today in the selected timezone.
      const upcoming = (data.tasks ?? []).filter((t: Task) => {
        if (!t.dueAt) return false;
        const due = new Date(t.dueAt);
        return getDateKeyInTimeZone(due, timezone) > todayKey;
      });
      setTasks(upcoming);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [timezone]);

  useEffect(() => {
    setLoading(true);
    load();
  }, [load]);

  const act = async (id: string, action: "complete" | "snooze") => {
    await fetch("/api/tasks", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, action }),
    });
    await load();
    onTaskUpdate?.();
  };

  // Group by day
  const grouped = tasks.reduce<Record<string, Task[]>>((acc, task) => {
    const key = getDateKeyInTimeZone(new Date(task.dueAt!), timezone);
    if (!acc[key]) acc[key] = [];
    acc[key].push(task);
    return acc;
  }, {});

  if (loading) return null;
  if (tasks.length === 0) return (
    <div>
      <div className="px-4 py-2 border-b border-[var(--border)]">
        <span className="font-mono text-xs tracking-widest text-[var(--text-muted)] uppercase">Upcoming</span>
      </div>
      <div className="px-4 py-3 text-xs text-[var(--text-muted)] font-mono">— nothing scheduled after today</div>
    </div>
  );

  return (
    <div>
      <div className="px-4 py-2 border-b border-[var(--border)]">
        <span className="font-mono text-xs tracking-widest text-[var(--text-muted)] uppercase">Upcoming</span>
        <span className="ml-2 text-xs font-mono text-[var(--text-muted)]">{tasks.length}</span>
      </div>
      <div className="divide-y divide-[var(--border)]">
        {Object.entries(grouped)
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([dayKey, dayTasks]) => (
          <div key={dayKey} className="px-4 py-2">
            <p className="text-[10px] font-mono text-[var(--accent)] mb-1.5 tracking-wide uppercase">
              {formatDateKeyLabel(dayKey, timezone)}
            </p>
            <ul className="space-y-1">
              {dayTasks.map((task) => (
                <li key={task.id} className="text-sm text-[var(--text-secondary)] flex items-center justify-between gap-2 py-1 group">
                  <div className="flex-1 min-w-0 flex items-center gap-2">
                    <span className="w-1 h-1 rounded-full bg-[var(--border)] shrink-0" />
                    <span className="truncate">{task.title}</span>
                    {task.dueType === "hard" && (
                      <span className="text-[10px] font-mono text-[var(--danger)] shrink-0">HARD</span>
                    )}
                  </div>
                  <div className="flex gap-1 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button
                      onClick={() => act(task.id, "complete")}
                      className="w-6 h-6 flex items-center justify-center border border-[var(--success)] text-[var(--success)] hover:bg-[var(--success)]/10 text-xs transition-colors"
                      title="Complete"
                    >✓</button>
                    <button
                      onClick={() => act(task.id, "snooze")}
                      className="w-6 h-6 flex items-center justify-center border border-[var(--border)] text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-tertiary)] text-xs transition-colors"
                      title="Snooze 1 day"
                    >↷</button>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </div>
  );
}
