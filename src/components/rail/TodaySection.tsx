"use client";

import { useEffect, useState } from "react";
import type { Task } from "@/types";

interface TodaySectionProps {
  onTaskUpdate?: () => void;
}

export function TodaySection({ onTaskUpdate }: TodaySectionProps) {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    try {
      const res = await fetch("/api/tasks?status=active");
      const data = await res.json();

      const now = new Date();
      const todayEnd = new Date(now);
      todayEnd.setHours(23, 59, 59, 999);

      const todayTasks = (data.tasks ?? []).filter((t: Task) => {
        if (!t.dueAt) return true;
        const due = new Date(t.dueAt);
        return due <= todayEnd;
      });
      setTasks(todayTasks);
    } catch {
      // silent
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const act = async (id: string, action: "complete" | "snooze") => {
    await fetch("/api/tasks", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, action }),
    });
    await load();
    onTaskUpdate?.();
  };

  const now = new Date();

  if (loading) {
    return (
      <div className="px-4 py-2 text-xs font-mono text-[var(--text-muted)]">loading...</div>
    );
  }

  return (
    <div>
      <div className="px-4 py-2 border-b border-[var(--border)]">
        <span className="font-mono text-xs tracking-widest text-[var(--text-muted)] uppercase">Today</span>
        {tasks.length > 0 && (
          <span className="ml-2 text-xs font-mono text-[var(--accent)]">{tasks.length}</span>
        )}
      </div>

      {tasks.length === 0 ? (
        <div className="px-4 py-3 text-xs text-[var(--text-muted)] font-mono">— nothing due today</div>
      ) : (
        <ul className="divide-y divide-[var(--border)]">
          {tasks.map((task) => {
            const overdue = task.dueAt && new Date(task.dueAt) < now;
            return (
              <li key={task.id} className={`px-4 py-3 ${overdue ? "bg-[var(--danger)]/5" : ""}`}>
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <p className={`text-sm truncate ${overdue ? "text-[var(--danger)]" : "text-[var(--text-primary)]"}`}>
                      {task.title}
                    </p>
                    {task.dueAt && (
                      <p className={`text-xs font-mono mt-0.5 ${overdue ? "text-[var(--danger)]" : "text-[var(--text-muted)]"}`}>
                        {overdue ? "⚠ " : ""}
                        {new Date(task.dueAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                      </p>
                    )}
                  </div>
                  <div className="flex gap-1 shrink-0">
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
                </div>
                {task.tags.length > 0 && (
                  <div className="flex gap-1 mt-1 flex-wrap">
                    {task.tags.map((t) => (
                      <span key={t} className="text-[10px] font-mono text-[var(--text-muted)] border border-[var(--border)] px-1">#{t}</span>
                    ))}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
