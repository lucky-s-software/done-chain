"use client";

import { useEffect, useState } from "react";
import type { Task } from "@/types";

export function UpcomingSection() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/tasks?status=active")
      .then((r) => r.json())
      .then((data) => {
        const now = new Date();
        const todayEnd = new Date(now);
        todayEnd.setHours(23, 59, 59, 999);
        const weekEnd = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

        // Tasks due in next 7 days but NOT today
        const upcoming = (data.tasks ?? []).filter((t: Task) => {
          if (!t.dueAt) return false;
          const due = new Date(t.dueAt);
          return due > todayEnd && due <= weekEnd;
        });
        setTasks(upcoming);
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  // Group by day
  const grouped = tasks.reduce<Record<string, Task[]>>((acc, task) => {
    const key = new Date(task.dueAt!).toLocaleDateString("en-US", {
      weekday: "short", month: "short", day: "numeric",
    });
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
      <div className="px-4 py-3 text-xs text-[var(--text-muted)] font-mono">— nothing in next 7 days</div>
    </div>
  );

  return (
    <div>
      <div className="px-4 py-2 border-b border-[var(--border)]">
        <span className="font-mono text-xs tracking-widest text-[var(--text-muted)] uppercase">Upcoming</span>
        <span className="ml-2 text-xs font-mono text-[var(--text-muted)]">{tasks.length}</span>
      </div>
      <div className="divide-y divide-[var(--border)]">
        {Object.entries(grouped).map(([day, dayTasks]) => (
          <div key={day} className="px-4 py-2">
            <p className="text-[10px] font-mono text-[var(--accent)] mb-1.5 tracking-wide uppercase">{day}</p>
            <ul className="space-y-1">
              {dayTasks.map((task) => (
                <li key={task.id} className="text-sm text-[var(--text-secondary)] flex items-center gap-2">
                  <span className="w-1 h-1 rounded-full bg-[var(--border)] shrink-0" />
                  <span className="truncate">{task.title}</span>
                  {task.dueType === "hard" && (
                    <span className="text-[10px] font-mono text-[var(--danger)] shrink-0">HARD</span>
                  )}
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </div>
  );
}
