"use client";

import { useEffect, useMemo, useState } from "react";
import type { Task } from "@/types";
import {
  formatDateKeyLabel,
  formatTimeInTimeZone,
  getDateKeyInTimeZone,
  getDatePartsInTimeZone,
  isMidnightInTimeZone,
  shiftDateKey,
  zonedDateTimeToUtc,
} from "@/lib/timezone";

interface TimelineSectionProps {
  timezone: string;
  refreshPulse?: number;
  onTaskUpdate?: () => void;
}

interface TimedTask {
  task: Task;
  startAt: Date;
  startMinutes: number;
  source: "execution" | "due";
}

function toTimeInputValue(date: Date, timezone: string): string {
  const parts = getDatePartsInTimeZone(date, timezone);
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${pad(parts.hour)}:${pad(parts.minute)}`;
}

export function TimelineSection({ timezone, refreshPulse, onTaskUpdate }: TimelineSectionProps) {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedDate, setSelectedDate] = useState(() => getDateKeyInTimeZone(new Date(), timezone));
  const [showDateInput, setShowDateInput] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editingTaskId, setEditingTaskId] = useState<string | null>(null);
  const [draftTime, setDraftTime] = useState("09:00");
  const [draftEstimate, setDraftEstimate] = useState("");

  const load = async () => {
    try {
      const response = await fetch("/api/tasks?status=active,done");
      const data = await response.json();
      setTasks(Array.isArray(data.tasks) ? data.tasks : []);
    } catch (error) {
      console.error("[timeline] load error", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    setSelectedDate(getDateKeyInTimeZone(new Date(), timezone));
  }, [timezone]);

  useEffect(() => {
    setLoading(true);
    load();
  }, [refreshPulse]);

  const { timedTasks, untimedTasks } = useMemo(() => {
    const timed: TimedTask[] = [];
    const untimed: Task[] = [];

    for (const task of tasks) {
      if (task.status !== "active" && task.status !== "done") continue;

      const executionStartAt = task.executionStartAt ? new Date(task.executionStartAt) : null;
      const dueAt = task.dueAt ? new Date(task.dueAt) : null;
      const sourceDate = executionStartAt ?? dueAt;
      if (!sourceDate) continue;

      const dayKey = getDateKeyInTimeZone(sourceDate, timezone);
      if (dayKey !== selectedDate) continue;

      if (!executionStartAt && dueAt && isMidnightInTimeZone(dueAt, timezone)) {
        untimed.push(task);
        continue;
      }

      const parts = getDatePartsInTimeZone(sourceDate, timezone);
      timed.push({
        task,
        startAt: sourceDate,
        startMinutes: parts.hour * 60 + parts.minute,
        source: executionStartAt ? "execution" : "due",
      });
    }

    timed.sort((a, b) => a.startMinutes - b.startMinutes);
    untimed.sort((a, b) => {
      if (a.status !== b.status) return a.status === "active" ? -1 : 1;
      return a.title.localeCompare(b.title);
    });

    return { timedTasks: timed, untimedTasks: untimed };
  }, [selectedDate, tasks, timezone]);

  const timedByHour = useMemo(() => {
    const hourMap = new Map<number, TimedTask[]>();
    for (let hour = 0; hour < 24; hour++) {
      hourMap.set(hour, []);
    }

    for (const item of timedTasks) {
      const hour = Math.max(0, Math.min(23, Math.floor(item.startMinutes / 60)));
      hourMap.get(hour)?.push(item);
    }

    return hourMap;
  }, [timedTasks]);

  const patchTask = async (payload: Record<string, unknown>) => {
    setSaving(true);
    try {
      await fetch("/api/tasks", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      await load();
      onTaskUpdate?.();
    } finally {
      setSaving(false);
    }
  };

  const startPlanning = (task: Task, fallbackDate: Date | null) => {
    const sourceDate = task.executionStartAt
      ? new Date(task.executionStartAt)
      : fallbackDate;

    setEditingTaskId(task.id);
    setDraftTime(sourceDate ? toTimeInputValue(sourceDate, timezone) : "09:00");
    setDraftEstimate(
      typeof task.estimatedMinutes === "number" && task.estimatedMinutes > 0
        ? String(task.estimatedMinutes)
        : ""
    );
  };

  const savePlan = async (taskId: string) => {
    const executionStartAt = zonedDateTimeToUtc(selectedDate, draftTime, timezone).toISOString();
    const parsedEstimate = Number.parseInt(draftEstimate, 10);

    await patchTask({
      id: taskId,
      edits: {
        executionStartAt,
        estimatedMinutes:
          Number.isFinite(parsedEstimate) && parsedEstimate > 0
            ? Math.max(1, parsedEstimate)
            : null,
      },
    });

    setEditingTaskId(null);
  };

  const clearExecutionTime = async (taskId: string) => {
    await patchTask({ id: taskId, edits: { executionStartAt: null } });
  };

  const markDone = async (taskId: string) => {
    await patchTask({ id: taskId, action: "complete" });
  };

  if (loading) {
    return <div className="px-4 py-3 text-xs font-mono text-[var(--text-muted)]">loading timeline...</div>;
  }

  return (
    <div>
      <div className="px-4 py-2 border-b border-[var(--border)]">
        <div className="flex items-center justify-between gap-2">
          <span className="font-mono text-xs tracking-widest text-[var(--text-muted)] uppercase">Timeline</span>
          <span className="text-[10px] font-mono text-[var(--text-muted)]">{timezone}</span>
        </div>

        <div className="mt-2 flex items-center gap-1.5">
          <button
            type="button"
            className="px-2 py-1 text-[10px] font-mono border border-[var(--border)] text-[var(--text-muted)] hover:text-[var(--text-primary)]"
            onClick={() => setSelectedDate((prev) => shiftDateKey(prev, -1))}
          >
            Prev
          </button>
          <button
            type="button"
            className="px-2 py-1 text-[10px] font-mono border border-[var(--border)] text-[var(--accent)] hover:opacity-90"
            onClick={() => setShowDateInput((prev) => !prev)}
          >
            {formatDateKeyLabel(selectedDate, timezone)}
          </button>
          <button
            type="button"
            className="px-2 py-1 text-[10px] font-mono border border-[var(--border)] text-[var(--text-muted)] hover:text-[var(--text-primary)]"
            onClick={() => setSelectedDate((prev) => shiftDateKey(prev, 1))}
          >
            Next
          </button>
          <button
            type="button"
            className="ml-auto px-2 py-1 text-[10px] font-mono border border-[var(--border)] text-[var(--text-muted)] hover:text-[var(--text-primary)]"
            onClick={() => setSelectedDate(getDateKeyInTimeZone(new Date(), timezone))}
          >
            Today
          </button>
        </div>

        {showDateInput && (
          <input
            type="date"
            className="mt-2 bg-[var(--bg-primary)] border border-[var(--border)] text-[var(--text-secondary)] text-xs font-mono px-2 py-1 focus:outline-none focus:border-[var(--accent)]"
            value={selectedDate}
            onChange={(event) => setSelectedDate(event.target.value)}
          />
        )}
      </div>

      <div className="border-b border-[var(--border)]">
        {Array.from({ length: 24 }).map((_, hour) => {
          const hourTasks = timedByHour.get(hour) ?? [];
          const hourLabel = String(hour).padStart(2, "0") + ":00";

          return (
            <div key={hour} className="flex border-b last:border-b-0 border-[var(--border)]/60">
              <div className="w-14 shrink-0 px-2 py-2 text-[10px] font-mono text-[var(--text-muted)] border-r border-[var(--border)]/60">
                {hourLabel}
              </div>
              <div className="flex-1 min-h-10 px-2 py-1.5 space-y-1">
                {hourTasks.map((item) => (
                  <div
                    key={item.task.id}
                    className={`border px-2 py-1.5 text-xs ${
                      item.task.status === "done"
                        ? "border-[var(--border)] text-[var(--text-muted)] bg-[var(--bg-tertiary)]/20"
                        : "border-[var(--accent)]/30 bg-[var(--accent-soft)]"
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="min-w-0">
                        <p className={`${item.task.status === "done" ? "line-through" : ""} truncate`}>
                          {item.task.title}
                        </p>
                        <p className="text-[10px] font-mono text-[var(--text-muted)] mt-0.5">
                          {formatTimeInTimeZone(item.startAt, timezone)}
                          {item.source === "execution" ? " · plan" : " · due"}
                          {typeof item.task.estimatedMinutes === "number" && item.task.estimatedMinutes > 0
                            ? ` · ${item.task.estimatedMinutes}m`
                            : ""}
                        </p>
                      </div>
                      {item.task.status === "active" && (
                        <div className="flex items-center gap-1 shrink-0">
                          <button
                            type="button"
                            onClick={() => markDone(item.task.id)}
                            disabled={saving}
                            className="w-6 h-6 border border-[var(--success)] text-[var(--success)] hover:bg-[var(--success)]/10"
                            title="Mark done"
                          >
                            ✓
                          </button>
                          <button
                            type="button"
                            onClick={() => startPlanning(item.task, item.startAt)}
                            disabled={saving}
                            className="px-1.5 h-6 border border-[var(--border)] text-[10px] font-mono text-[var(--text-muted)] hover:text-[var(--text-primary)]"
                            title="Set execution time"
                          >
                            Plan
                          </button>
                          {item.task.executionStartAt && (
                            <button
                              type="button"
                              onClick={() => clearExecutionTime(item.task.id)}
                              disabled={saving}
                              className="px-1.5 h-6 border border-[var(--border)] text-[10px] font-mono text-[var(--text-muted)] hover:text-[var(--danger)]"
                              title="Clear execution time"
                            >
                              Clear
                            </button>
                          )}
                        </div>
                      )}
                    </div>

                    {editingTaskId === item.task.id && item.task.status === "active" && (
                      <div className="mt-2 flex items-center gap-1.5">
                        <input
                          type="time"
                          value={draftTime}
                          onChange={(event) => setDraftTime(event.target.value)}
                          className="bg-[var(--bg-primary)] border border-[var(--border)] text-[10px] font-mono text-[var(--text-secondary)] px-1.5 py-1"
                        />
                        <input
                          type="number"
                          min={1}
                          step={1}
                          value={draftEstimate}
                          onChange={(event) => setDraftEstimate(event.target.value)}
                          className="w-20 bg-[var(--bg-primary)] border border-[var(--border)] text-[10px] font-mono text-[var(--text-secondary)] px-1.5 py-1"
                          placeholder="mins"
                        />
                        <button
                          type="button"
                          onClick={() => savePlan(item.task.id)}
                          disabled={saving}
                          className="px-2 py-1 border border-[var(--accent)] text-[10px] font-mono text-[var(--accent)] hover:bg-[var(--accent)]/10"
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
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>

      <div>
        <div className="px-4 py-2 border-b border-[var(--border)]">
          <span className="font-mono text-xs tracking-widest text-[var(--text-muted)] uppercase">Untimed</span>
          {untimedTasks.length > 0 && (
            <span className="ml-2 text-xs font-mono text-[var(--text-muted)]">{untimedTasks.length}</span>
          )}
        </div>

        {untimedTasks.length === 0 ? (
          <div className="px-4 py-3 text-xs text-[var(--text-muted)] font-mono">— no untimed tasks on this day</div>
        ) : (
          <ul className="divide-y divide-[var(--border)]">
            {untimedTasks.map((task) => (
              <li key={task.id} className="px-4 py-2.5">
                <div className="flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <p className={`text-sm truncate ${task.status === "done" ? "line-through text-[var(--text-muted)]" : "text-[var(--text-primary)]"}`}>
                      {task.title}
                    </p>
                    <p className="text-[10px] font-mono text-[var(--text-muted)] mt-0.5">
                      {typeof task.estimatedMinutes === "number" && task.estimatedMinutes > 0
                        ? `estimate ${task.estimatedMinutes}m`
                        : "no estimate"}
                    </p>
                  </div>

                  {task.status === "active" && (
                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => markDone(task.id)}
                        disabled={saving}
                        className="w-6 h-6 border border-[var(--success)] text-[var(--success)] hover:bg-[var(--success)]/10"
                        title="Mark done"
                      >
                        ✓
                      </button>
                      <button
                        type="button"
                        onClick={() => startPlanning(task, null)}
                        disabled={saving}
                        className="px-1.5 h-6 border border-[var(--border)] text-[10px] font-mono text-[var(--text-muted)] hover:text-[var(--text-primary)]"
                        title="Set execution time"
                      >
                        Set Time
                      </button>
                    </div>
                  )}
                </div>

                {editingTaskId === task.id && task.status === "active" && (
                  <div className="mt-2 flex items-center gap-1.5">
                    <input
                      type="time"
                      value={draftTime}
                      onChange={(event) => setDraftTime(event.target.value)}
                      className="bg-[var(--bg-primary)] border border-[var(--border)] text-[10px] font-mono text-[var(--text-secondary)] px-1.5 py-1"
                    />
                    <input
                      type="number"
                      min={1}
                      step={1}
                      value={draftEstimate}
                      onChange={(event) => setDraftEstimate(event.target.value)}
                      className="w-20 bg-[var(--bg-primary)] border border-[var(--border)] text-[10px] font-mono text-[var(--text-secondary)] px-1.5 py-1"
                      placeholder="mins"
                    />
                    <button
                      type="button"
                      onClick={() => savePlan(task.id)}
                      disabled={saving}
                      className="px-2 py-1 border border-[var(--accent)] text-[10px] font-mono text-[var(--accent)] hover:bg-[var(--accent)]/10"
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
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
