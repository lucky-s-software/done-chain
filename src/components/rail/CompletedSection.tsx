"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { Task } from "@/types";
import { formatDateKeyLabel, formatTimeInTimeZone, getDateKeyInTimeZone } from "@/lib/timezone";

interface CompletedSectionProps {
  onTaskUpdate?: () => void;
  timezone: string;
}

const MAX_COMPLETED_TASKS = 20;

function getSortTimestamp(task: Task): number {
  const candidate = task.completedAt ?? task.createdAt;
  const parsed = new Date(candidate).getTime();
  return Number.isFinite(parsed) ? parsed : 0;
}

export function CompletedSection({ onTaskUpdate, timezone }: CompletedSectionProps) {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyTaskId, setBusyTaskId] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const response = await fetch("/api/tasks?status=done");
      const data = await response.json();
      const doneTasks = Array.isArray(data.tasks)
        ? (data.tasks as Task[])
            .filter((task) => task.status === "done")
            .sort((a, b) => getSortTimestamp(b) - getSortTimestamp(a))
            .slice(0, MAX_COMPLETED_TASKS)
        : [];
      setTasks(doneTasks);
    } catch (error) {
      console.error("[completed] load error", error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    setLoading(true);
    load();
  }, [load]);

  const patchTask = useCallback(
    async (payload: Record<string, unknown>) => {
      const id = typeof payload.id === "string" ? payload.id : null;
      if (id) setBusyTaskId(id);
      try {
        await fetch("/api/tasks", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        await load();
        onTaskUpdate?.();
      } finally {
        setBusyTaskId(null);
      }
    },
    [load, onTaskUpdate]
  );

  const todayKey = useMemo(() => getDateKeyInTimeZone(new Date(), timezone), [timezone]);

  const getCompletionLabel = useCallback(
    (task: Task) => {
      if (!task.completedAt) return "completed";
      const completedAt = new Date(task.completedAt);
      if (Number.isNaN(completedAt.getTime())) return "completed";
      const completedKey = getDateKeyInTimeZone(completedAt, timezone);
      if (completedKey === todayKey) {
        return `completed ${formatTimeInTimeZone(completedAt, timezone)}`;
      }
      return `completed ${formatDateKeyLabel(completedKey, timezone)} ${formatTimeInTimeZone(
        completedAt,
        timezone
      )}`;
    },
    [timezone, todayKey]
  );

  return (
    <div>
      <div className="px-4 py-2 border-b border-[var(--border)]">
        <span className="font-mono text-xs tracking-widest text-[var(--text-muted)] uppercase">Completed</span>
        {tasks.length > 0 && (
          <span className="ml-2 text-xs font-mono text-[var(--text-muted)]">{tasks.length}</span>
        )}
      </div>

      {loading ? (
        <div className="px-4 py-3 text-xs font-mono text-[var(--text-muted)]">loading...</div>
      ) : tasks.length === 0 ? (
        <div className="px-4 py-3 text-xs text-[var(--text-muted)] font-mono">— no completed tasks yet</div>
      ) : (
        <ul className="divide-y divide-[var(--border)]">
          {tasks.map((task) => (
            <li key={task.id} className="px-4 py-2.5">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-sm line-through text-[var(--text-muted)] truncate">{task.title}</p>
                  <p className="text-[10px] font-mono text-[var(--text-muted)] mt-0.5">
                    {getCompletionLabel(task)}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => patchTask({ id: task.id, action: "reopen" })}
                  disabled={busyTaskId === task.id}
                  className="px-2 py-1 border border-[var(--accent)] text-[10px] font-mono text-[var(--accent)] hover:bg-[var(--accent)]/10 disabled:opacity-50"
                  title="Undo complete"
                  aria-label="Undo complete"
                >
                  Undo
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
