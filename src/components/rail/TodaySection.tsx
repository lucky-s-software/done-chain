"use client";

import { useCallback, useEffect, useState } from "react";
import type { Task } from "@/types";
import {
  formatTimeInTimeZone,
  getDateKeyInTimeZone,
  getDatePartsInTimeZone,
  zonedDateTimeToUtc,
} from "@/lib/timezone";

interface TodaySectionProps {
  onTaskUpdate?: () => void;
  timezone: string;
}

function parseDate(value: string | null | undefined): Date | null {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function toTimeInputValue(value: string | null | undefined, timezone: string): string {
  const date = parseDate(value);
  if (!date) return "09:00";
  const parts = getDatePartsInTimeZone(date, timezone);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(parts.hour)}:${pad(parts.minute)}`;
}

function toDateInputValue(value: string | null | undefined, timezone: string): string {
  const date = parseDate(value);
  if (!date) return getDateKeyInTimeZone(new Date(), timezone);
  return getDateKeyInTimeZone(date, timezone);
}

export function TodaySection({ onTaskUpdate, timezone }: TodaySectionProps) {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyTaskId, setBusyTaskId] = useState<string | null>(null);

  const [editingTaskId, setEditingTaskId] = useState<string | null>(null);
  const [editHasStart, setEditHasStart] = useState(false);
  const [editStartDate, setEditStartDate] = useState("");
  const [editStartTime, setEditStartTime] = useState("09:00");
  const [editEstimate, setEditEstimate] = useState("");

  const [deletingTaskId, setDeletingTaskId] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/tasks?status=active");
      const data = await res.json();

      const todayKey = getDateKeyInTimeZone(new Date(), timezone);
      const todayTasks = (data.tasks ?? [])
        .filter((task: Task) => {
          const executionStartAt = parseDate(task.executionStartAt);
          if (!executionStartAt) return true;
          return getDateKeyInTimeZone(executionStartAt, timezone) === todayKey;
        })
        .sort((a: Task, b: Task) => {
          const aStart = parseDate(a.executionStartAt);
          const bStart = parseDate(b.executionStartAt);
          if (aStart && bStart) return aStart.getTime() - bStart.getTime();
          if (aStart) return -1;
          if (bStart) return 1;
          return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
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
    void load();
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
    const executionStartAt = parseDate(task.executionStartAt);

    setEditingTaskId(task.id);
    setDeletingTaskId(null);
    setEditHasStart(Boolean(executionStartAt));
    setEditStartDate(
      executionStartAt
        ? toDateInputValue(task.executionStartAt, timezone)
        : getDateKeyInTimeZone(new Date(), timezone)
    );
    setEditStartTime(
      executionStartAt ? toTimeInputValue(task.executionStartAt, timezone) : "09:00"
    );
    setEditEstimate(
      typeof task.estimatedMinutes === "number" && task.estimatedMinutes > 0
        ? String(task.estimatedMinutes)
        : ""
    );
  };

  const saveEdit = async (taskId: string) => {
    const parsedEstimate = Number.parseInt(editEstimate, 10);
    const nextExecutionStartAt =
      editHasStart && editStartDate
        ? zonedDateTimeToUtc(editStartDate, editStartTime || "09:00", timezone).toISOString()
        : null;

    await patchTask({
      id: taskId,
      edits: {
        executionStartAt: nextExecutionStartAt,
        estimatedMinutes:
          Number.isFinite(parsedEstimate) && parsedEstimate > 0
            ? Math.max(1, parsedEstimate)
            : null,
      },
    });

    setEditingTaskId(null);
  };

  if (loading) {
    return (
      <div className="px-4 py-2 text-xs font-mono text-[var(--text-muted)]">loading...</div>
    );
  }

  return (
    <div>
      <div className="px-4 py-2 border-b border-[var(--border)]">
        <span className="font-mono text-xs tracking-widest text-[var(--text-muted)] uppercase">
          Today
        </span>
        {tasks.length > 0 && (
          <span className="ml-2 text-xs font-mono text-[var(--accent)]">{tasks.length}</span>
        )}
      </div>

      {tasks.length === 0 ? (
        <div className="px-4 py-3 text-xs text-[var(--text-muted)] font-mono">
          — nothing planned for today
        </div>
      ) : (
        <ul className="divide-y divide-[var(--border)]">
          {tasks.map((task) => {
            const executionStartAt = parseDate(task.executionStartAt);
            const busy = busyTaskId === task.id;

            return (
              <li key={task.id} className="px-4 py-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm truncate text-[var(--text-primary)]">{task.title}</p>
                    {executionStartAt ? (
                      <p className="text-xs font-mono mt-0.5 text-[var(--accent)]">
                        start {formatTimeInTimeZone(executionStartAt, timezone)}
                      </p>
                    ) : (
                      <p className="text-xs font-mono mt-0.5 text-[var(--text-muted)]">
                        unscheduled
                      </p>
                    )}
                    {typeof task.estimatedMinutes === "number" && task.estimatedMinutes > 0 && (
                      <p className="text-xs font-mono mt-0.5 text-[var(--text-muted)]">
                        ~{task.estimatedMinutes}m
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
                      onClick={() => {
                        setDeletingTaskId(task.id);
                        setEditingTaskId(null);
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
                    {task.tags.map((tag) => (
                      <span
                        key={tag}
                        className="text-[10px] font-mono text-[var(--text-muted)] border border-[var(--border)] px-1"
                      >
                        #{tag}
                      </span>
                    ))}
                  </div>
                )}

                {editingTaskId === task.id && (
                  <div className="mt-2 flex flex-wrap items-center gap-1.5">
                    <span className="text-[10px] font-mono text-[var(--text-muted)] mr-1">
                      Start
                    </span>
                    <label className="inline-flex items-center gap-1 text-[10px] font-mono text-[var(--text-muted)]">
                      <input
                        type="checkbox"
                        checked={editHasStart}
                        onChange={(event) => {
                          const enabled = event.target.checked;
                          setEditHasStart(enabled);
                          if (enabled && !editStartDate) {
                            setEditStartDate(getDateKeyInTimeZone(new Date(), timezone));
                          }
                        }}
                      />
                      set
                    </label>
                    <input
                      type="date"
                      value={editStartDate}
                      onChange={(event) => setEditStartDate(event.target.value)}
                      disabled={!editHasStart}
                      className="bg-[var(--bg-primary)] border border-[var(--border)] text-[10px] font-mono text-[var(--text-secondary)] px-1.5 py-1 disabled:opacity-50"
                    />
                    <input
                      type="time"
                      value={editStartTime}
                      onChange={(event) => setEditStartTime(event.target.value)}
                      disabled={!editHasStart}
                      className="bg-[var(--bg-primary)] border border-[var(--border)] text-[10px] font-mono text-[var(--text-secondary)] px-1.5 py-1 disabled:opacity-50"
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
