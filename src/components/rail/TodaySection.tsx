"use client";

import { useCallback, useEffect, useState } from "react";
import type { Task } from "@/types";
import {
  formatTimeInTimeZone,
  getDateKeyInTimeZone,
  getDatePartsInTimeZone,
  shiftDateKey,
  zonedDateTimeToUtc,
} from "@/lib/timezone";

interface TodaySectionProps {
  onTaskUpdate?: () => void;
  timezone: string;
}

function toTimeInputValue(value: string | null | undefined, timezone: string): string {
  if (!value) return "09:00";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "09:00";
  const parts = getDatePartsInTimeZone(date, timezone);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(parts.hour)}:${pad(parts.minute)}`;
}

function toDateInputValue(value: string | null | undefined, timezone: string): string {
  if (!value) return getDateKeyInTimeZone(new Date(), timezone);
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return getDateKeyInTimeZone(new Date(), timezone);
  return getDateKeyInTimeZone(date, timezone);
}

export function TodaySection({ onTaskUpdate, timezone }: TodaySectionProps) {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyTaskId, setBusyTaskId] = useState<string | null>(null);

  const [editingTaskId, setEditingTaskId] = useState<string | null>(null);
  const [editDueDate, setEditDueDate] = useState("");
  const [editDueTime, setEditDueTime] = useState("09:00");
  const [editEstimate, setEditEstimate] = useState("");

  const [postponingTaskId, setPostponingTaskId] = useState<string | null>(null);
  const [postponeDate, setPostponeDate] = useState("");
  const [postponeTime, setPostponeTime] = useState("09:00");

  const [deletingTaskId, setDeletingTaskId] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/tasks?status=active");
      const data = await res.json();

      const todayKey = getDateKeyInTimeZone(new Date(), timezone);
      const todayTasks = (data.tasks ?? []).filter((t: Task) => {
        if (!t.dueAt) return true;
        const due = new Date(t.dueAt);
        return getDateKeyInTimeZone(due, timezone) <= todayKey;
      });
      setTasks(todayTasks);
    } catch {
      // silent
    } finally {
      setLoading(false);
    }
  }, [timezone]);

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

  const deleteTask = useCallback(
    async (id: string) => {
      setBusyTaskId(id);
      try {
        await fetch("/api/tasks", {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id }),
        });
        setDeletingTaskId(null);
        await load();
        onTaskUpdate?.();
      } finally {
        setBusyTaskId(null);
      }
    },
    [load, onTaskUpdate]
  );

  const startEdit = (task: Task) => {
    setEditingTaskId(task.id);
    setPostponingTaskId(null);
    setDeletingTaskId(null);
    setEditDueDate(toDateInputValue(task.dueAt, timezone));
    setEditDueTime(toTimeInputValue(task.dueAt, timezone));
    setEditEstimate(
      typeof task.estimatedMinutes === "number" && task.estimatedMinutes > 0
        ? String(task.estimatedMinutes)
        : ""
    );
  };

  const saveEdit = async (taskId: string) => {
    const parsedEstimate = Number.parseInt(editEstimate, 10);
    const nextDueAt = editDueDate
      ? zonedDateTimeToUtc(editDueDate, editDueTime || "09:00", timezone).toISOString()
      : null;

    await patchTask({
      id: taskId,
      edits: {
        dueAt: nextDueAt,
        estimatedMinutes:
          Number.isFinite(parsedEstimate) && parsedEstimate > 0
            ? Math.max(1, parsedEstimate)
            : null,
      },
    });

    setEditingTaskId(null);
  };

  const startPostpone = (task: Task) => {
    const baseDate = task.dueAt ? new Date(task.dueAt) : new Date();
    const nextDate = new Date(baseDate.getTime());
    nextDate.setDate(nextDate.getDate() + 1);

    setPostponingTaskId(task.id);
    setEditingTaskId(null);
    setDeletingTaskId(null);
    setPostponeDate(getDateKeyInTimeZone(nextDate, timezone));
    setPostponeTime(toTimeInputValue(task.dueAt, timezone));
  };

  const applyPostpone = async (taskId: string, dateKey: string) => {
    const postponeTo = zonedDateTimeToUtc(dateKey, postponeTime || "09:00", timezone).toISOString();
    await patchTask({ id: taskId, action: "postpone", postponeTo });
    setPostponingTaskId(null);
  };

  const now = new Date();
  const todayKey = getDateKeyInTimeZone(now, timezone);

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
            const dueAt = task.dueAt ? new Date(task.dueAt) : null;
            const dueKey = dueAt ? getDateKeyInTimeZone(dueAt, timezone) : null;
            const overdue = Boolean(
              dueAt &&
                dueKey &&
                (dueKey < todayKey || (dueKey === todayKey && dueAt.getTime() < now.getTime()))
            );
            const busy = busyTaskId === task.id;

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
                        {dueAt ? formatTimeInTimeZone(dueAt, timezone) : ""}
                      </p>
                    )}
                  </div>

                  <div className="flex gap-1 shrink-0">
                    <button
                      type="button"
                      onClick={() => patchTask({ id: task.id, action: "complete" })}
                      disabled={busy}
                      className="w-6 h-6 flex items-center justify-center border border-[var(--success)] text-[var(--success)] hover:bg-[var(--success)]/10 text-xs transition-colors disabled:opacity-50"
                      title="Complete"
                      aria-label="Complete"
                    >
                      ✓
                    </button>
                    <button
                      type="button"
                      onClick={() => startEdit(task)}
                      disabled={busy}
                      className="w-6 h-6 flex items-center justify-center border border-[var(--border)] text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-tertiary)] text-xs transition-colors disabled:opacity-50"
                      title="Edit"
                      aria-label="Edit"
                    >
                      ✎
                    </button>
                    <button
                      type="button"
                      onClick={() => startPostpone(task)}
                      disabled={busy}
                      className="w-6 h-6 flex items-center justify-center border border-[var(--border)] text-[var(--text-muted)] hover:text-[var(--accent)] hover:bg-[var(--bg-tertiary)] text-xs transition-colors disabled:opacity-50"
                      title="Postpone"
                      aria-label="Postpone"
                    >
                      ↷
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setDeletingTaskId(task.id);
                        setEditingTaskId(null);
                        setPostponingTaskId(null);
                      }}
                      disabled={busy}
                      className="w-6 h-6 flex items-center justify-center border border-[var(--border)] text-[var(--text-muted)] hover:text-[var(--danger)] hover:bg-[var(--danger)]/10 text-xs transition-colors disabled:opacity-50"
                      title="Delete"
                      aria-label="Delete"
                    >
                      ✕
                    </button>
                  </div>
                </div>

                {task.tags.length > 0 && (
                  <div className="flex gap-1 mt-1 flex-wrap">
                    {task.tags.map((t) => (
                      <span key={t} className="text-[10px] font-mono text-[var(--text-muted)] border border-[var(--border)] px-1">
                        #{t}
                      </span>
                    ))}
                  </div>
                )}

                {editingTaskId === task.id && (
                  <div className="mt-2 flex flex-wrap items-center gap-1.5">
                    <input
                      type="date"
                      value={editDueDate}
                      onChange={(event) => setEditDueDate(event.target.value)}
                      className="bg-[var(--bg-primary)] border border-[var(--border)] text-[10px] font-mono text-[var(--text-secondary)] px-1.5 py-1"
                    />
                    <input
                      type="time"
                      value={editDueTime}
                      onChange={(event) => setEditDueTime(event.target.value)}
                      className="bg-[var(--bg-primary)] border border-[var(--border)] text-[10px] font-mono text-[var(--text-secondary)] px-1.5 py-1"
                    />
                    <input
                      type="number"
                      min={1}
                      step={1}
                      inputMode="numeric"
                      value={editEstimate}
                      onChange={(event) => setEditEstimate(event.target.value)}
                      className="w-20 bg-[var(--bg-primary)] border border-[var(--border)] text-[10px] font-mono text-[var(--text-secondary)] px-1.5 py-1"
                      placeholder="mins"
                    />
                    <button
                      type="button"
                      onClick={() => saveEdit(task.id)}
                      disabled={busy}
                      className="px-2 py-1 border border-[var(--accent)] text-[10px] font-mono text-[var(--accent)] hover:bg-[var(--accent)]/10 disabled:opacity-50"
                    >
                      Save
                    </button>
                    <button
                      type="button"
                      onClick={() => setEditingTaskId(null)}
                      className="px-2 py-1 border border-[var(--border)] text-[10px] font-mono text-[var(--text-muted)]"
                    >
                      Cancel
                    </button>
                  </div>
                )}

                {postponingTaskId === task.id && (
                  <div className="mt-2 flex flex-wrap items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => applyPostpone(task.id, shiftDateKey(todayKey, 1))}
                      disabled={busy}
                      className="px-2 py-1 border border-[var(--accent)] text-[10px] font-mono text-[var(--accent)] hover:bg-[var(--accent)]/10 disabled:opacity-50"
                    >
                      Tomorrow
                    </button>
                    <input
                      type="date"
                      value={postponeDate}
                      onChange={(event) => setPostponeDate(event.target.value)}
                      className="bg-[var(--bg-primary)] border border-[var(--border)] text-[10px] font-mono text-[var(--text-secondary)] px-1.5 py-1"
                    />
                    <input
                      type="time"
                      value={postponeTime}
                      onChange={(event) => setPostponeTime(event.target.value)}
                      className="bg-[var(--bg-primary)] border border-[var(--border)] text-[10px] font-mono text-[var(--text-secondary)] px-1.5 py-1"
                    />
                    <button
                      type="button"
                      onClick={() => applyPostpone(task.id, postponeDate)}
                      disabled={busy || !postponeDate}
                      className="px-2 py-1 border border-[var(--border)] text-[10px] font-mono text-[var(--text-secondary)] hover:text-[var(--text-primary)] disabled:opacity-50"
                    >
                      Apply
                    </button>
                    <button
                      type="button"
                      onClick={() => setPostponingTaskId(null)}
                      className="px-2 py-1 border border-[var(--border)] text-[10px] font-mono text-[var(--text-muted)]"
                    >
                      Cancel
                    </button>
                  </div>
                )}

                {deletingTaskId === task.id && (
                  <div className="mt-2 flex flex-wrap items-center gap-1.5 text-[10px] font-mono text-[var(--text-muted)]">
                    <span className="text-[var(--danger)]">Delete this task?</span>
                    <button
                      type="button"
                      onClick={() => deleteTask(task.id)}
                      disabled={busy}
                      className="px-2 py-1 border border-[var(--danger)] text-[var(--danger)] hover:bg-[var(--danger)]/10 disabled:opacity-50"
                    >
                      Confirm
                    </button>
                    <button
                      type="button"
                      onClick={() => setDeletingTaskId(null)}
                      className="px-2 py-1 border border-[var(--border)] text-[var(--text-muted)]"
                    >
                      Cancel
                    </button>
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
