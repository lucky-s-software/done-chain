"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type DragEvent,
} from "react";
import type { Task } from "@/types";
import {
  formatDateKeyLabel,
  formatTimeInTimeZone,
  getDateKeyInTimeZone,
  getDatePartsInTimeZone,
  shiftDateKey,
  zonedDateTimeToUtc,
} from "@/lib/timezone";
import {
  buildDefaultTimelinePreferences,
  normalizeTimelinePreferences,
  TIMELINE_SCHEDULE_STORAGE_KEY,
  upsertTimelineScheduleBlock,
  WEEKDAY_LABELS,
  WEEKDAY_ORDER,
  type TimeWindowPreference,
  type TimelineSchedulePreferences,
  type WeekdayKey,
} from "@/lib/schedulePreferences";

interface TimelineSectionProps {
  timezone: string;
  refreshPulse?: number;
  onTaskUpdate?: () => void;
}

interface TimedTask {
  task: Task;
  startAt: Date;
  endAt: Date;
  durationMinutes: number;
  startMinutes: number;
}

interface PendingMove {
  taskId: string;
  title: string;
  executionStartAt: string;
}

interface DayScopedTask {
  task: Task;
  executionStartAt: Date | null;
  executionDayKey: string | null;
  matchesExecutionDay: boolean;
  hasEstimate: boolean;
}

const DROP_MINUTE_STEP = 5;
const TIMELINE_HOUR_HEIGHT_PX = 44;
const TIMELINE_VISIBLE_HOURS = 8;

function toTimeInputValue(date: Date, timezone: string): string {
  const parts = getDatePartsInTimeZone(date, timezone);
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${pad(parts.hour)}:${pad(parts.minute)}`;
}

function toTimeValue(hour: number, minute: number): string {
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${pad(hour)}:${pad(minute)}`;
}

function parseDate(value: string | null | undefined): Date | null {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function toMinutes(time: string): number {
  const [rawHour, rawMinute] = time.split(":");
  const hour = Number.parseInt(rawHour, 10);
  const minute = Number.parseInt(rawMinute, 10);
  return hour * 60 + minute;
}

function isMinuteInWindow(minute: number, window: TimeWindowPreference): boolean {
  if (!window.enabled) return false;
  const start = toMinutes(window.start);
  const end = toMinutes(window.end);
  if (start === end) return true;
  if (start < end) return minute >= start && minute < end;
  return minute >= start || minute < end;
}

function getWeekdayKeyForDate(dateKey: string, timezone: string): WeekdayKey {
  const probe = zonedDateTimeToUtc(dateKey, "12:00", timezone);
  const shortLabel = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    weekday: "short",
  })
    .format(probe)
    .slice(0, 3)
    .toLowerCase();

  const mapping: Record<string, WeekdayKey> = {
    mon: "mon",
    tue: "tue",
    wed: "wed",
    thu: "thu",
    fri: "fri",
    sat: "sat",
    sun: "sun",
  };

  return mapping[shortLabel] ?? "mon";
}

function schedulePreview(window: TimeWindowPreference): string {
  return window.enabled ? `${window.start}-${window.end}` : "off";
}

function getSortMinutes(scope: DayScopedTask, timezone: string): number {
  if (scope.matchesExecutionDay && scope.executionStartAt) {
    const parts = getDatePartsInTimeZone(scope.executionStartAt, timezone);
    return parts.hour * 60 + parts.minute;
  }
  return Number.MAX_SAFE_INTEGER;
}

function addMinutes(date: Date, minutes: number): Date {
  return new Date(date.getTime() + minutes * 60 * 1000);
}

export function TimelineSection({ timezone, refreshPulse, onTaskUpdate }: TimelineSectionProps) {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedDate, setSelectedDate] = useState(() =>
    getDateKeyInTimeZone(new Date(), timezone)
  );
  const [showDateInput, setShowDateInput] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editingTaskId, setEditingTaskId] = useState<string | null>(null);
  const [draftTime, setDraftTime] = useState("09:00");
  const [draftEstimate, setDraftEstimate] = useState("");
  const [nowTick, setNowTick] = useState(() => Date.now());
  const [draggingTaskId, setDraggingTaskId] = useState<string | null>(null);
  const [dropPreview, setDropPreview] = useState<{ hour: number; minute: number } | null>(null);
  const [pendingMove, setPendingMove] = useState<PendingMove | null>(null);
  const [showScheduleSettings, setShowScheduleSettings] = useState(false);
  const [schedulePreferences, setSchedulePreferences] = useState<TimelineSchedulePreferences>(
    () => buildDefaultTimelinePreferences()
  );
  const [scheduleReady, setScheduleReady] = useState(false);

  const scrollContainerRef = useRef<HTMLDivElement | null>(null);
  const scrollByDateRef = useRef<Record<string, number>>({});
  const hasLoadedRef = useRef(false);

  const selectedWeekday = useMemo(
    () => getWeekdayKeyForDate(selectedDate, timezone),
    [selectedDate, timezone]
  );
  const selectedWorkWindow = schedulePreferences.work[selectedWeekday];
  const selectedSleepWindow = schedulePreferences.sleep[selectedWeekday];

  const load = useCallback(async (options?: { silent?: boolean }) => {
    const silent = Boolean(options?.silent);
    if (!silent) setLoading(true);

    try {
      const response = await fetch("/api/tasks?status=active,done");
      const data = await response.json();
      setTasks(Array.isArray(data.tasks) ? data.tasks : []);
      hasLoadedRef.current = true;
    } catch (error) {
      console.error("[timeline] load error", error);
    } finally {
      if (!silent) setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!hasLoadedRef.current) return;
    void load({ silent: true });
  }, [refreshPulse, load]);

  useEffect(() => {
    setSelectedDate(getDateKeyInTimeZone(new Date(), timezone));
    setPendingMove(null);
    setDropPreview(null);
    setDraggingTaskId(null);
  }, [timezone]);

  useEffect(() => {
    const intervalId = window.setInterval(() => setNowTick(Date.now()), 30_000);
    return () => window.clearInterval(intervalId);
  }, []);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(TIMELINE_SCHEDULE_STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as unknown;
        setSchedulePreferences(normalizeTimelinePreferences(parsed));
      }
    } catch (error) {
      console.warn("[timeline] failed to load local schedule settings", error);
    } finally {
      setScheduleReady(true);
    }
  }, []);

  useEffect(() => {
    if (!scheduleReady) return;
    try {
      window.localStorage.setItem(
        TIMELINE_SCHEDULE_STORAGE_KEY,
        JSON.stringify(schedulePreferences)
      );
    } catch (error) {
      console.warn("[timeline] failed to persist local schedule settings", error);
    }
  }, [schedulePreferences, scheduleReady]);

  useEffect(() => {
    if (!scheduleReady) return;

    let cancelled = false;
    const timeout = window.setTimeout(() => {
      void (async () => {
        try {
          const current = await fetch("/api/profile");
          const currentData = (await current.json()) as { content?: string };
          if (cancelled) return;

          const currentContent =
            typeof currentData.content === "string" ? currentData.content : "";
          const nextContent = upsertTimelineScheduleBlock(
            currentContent,
            schedulePreferences
          );
          if (nextContent === currentContent) return;

          await fetch("/api/profile", {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ content: nextContent }),
          });
        } catch (error) {
          console.warn("[timeline] profile schedule sync failed", error);
        }
      })();
    }, 700);

    return () => {
      cancelled = true;
      window.clearTimeout(timeout);
    };
  }, [schedulePreferences, scheduleReady]);

  useEffect(() => {
    const node = scrollContainerRef.current;
    if (!node) return;

    const frame = window.requestAnimationFrame(() => {
      const existingScroll = scrollByDateRef.current[selectedDate];
      if (typeof existingScroll === "number") {
        node.scrollTop = existingScroll;
        return;
      }

      const nowDate = new Date();
      const selectedIsToday = getDateKeyInTimeZone(nowDate, timezone) === selectedDate;
      const nowHour = getDatePartsInTimeZone(nowDate, timezone).hour;
      const defaultStartHour = selectedIsToday
        ? Math.max(0, nowHour - 2)
        : selectedWorkWindow.enabled
          ? Math.max(0, Number.parseInt(selectedWorkWindow.start.slice(0, 2), 10) - 1)
          : 8;
      node.scrollTop = defaultStartHour * TIMELINE_HOUR_HEIGHT_PX;
    });

    return () => window.cancelAnimationFrame(frame);
  }, [selectedDate, timezone, selectedWorkWindow.enabled, selectedWorkWindow.start]);

  const onTimelineScroll = () => {
    const node = scrollContainerRef.current;
    if (!node) return;
    scrollByDateRef.current[selectedDate] = node.scrollTop;
  };

  const scopedTasks = useMemo(() => {
    const items: DayScopedTask[] = [];

    for (const task of tasks) {
      if (task.status !== "active" && task.status !== "done") continue;

      const executionStartAt = parseDate(task.executionStartAt);
      const executionDayKey = executionStartAt
        ? getDateKeyInTimeZone(executionStartAt, timezone)
        : null;
      const matchesExecutionDay = executionDayKey === selectedDate;
      const unscheduledActive = task.status === "active" && !executionStartAt;
      if (!matchesExecutionDay && !unscheduledActive) continue;

      items.push({
        task,
        executionStartAt,
        executionDayKey,
        matchesExecutionDay,
        hasEstimate:
          typeof task.estimatedMinutes === "number" && task.estimatedMinutes > 0,
      });
    }

    return items;
  }, [selectedDate, tasks, timezone]);

  const timedTasks = useMemo(() => {
    const timed: TimedTask[] = [];

    for (const scoped of scopedTasks) {
      const { task, executionStartAt, matchesExecutionDay, hasEstimate } = scoped;
      if (!matchesExecutionDay || !executionStartAt || !hasEstimate) continue;

      const durationMinutes = Math.max(1, task.estimatedMinutes ?? 1);
      const parts = getDatePartsInTimeZone(executionStartAt, timezone);
      timed.push({
        task,
        startAt: executionStartAt,
        endAt: addMinutes(executionStartAt, durationMinutes),
        durationMinutes,
        startMinutes: parts.hour * 60 + parts.minute,
      });
    }

    timed.sort((a, b) => a.startMinutes - b.startMinutes);
    return timed;
  }, [scopedTasks, timezone]);

  const dayTaskList = useMemo(() => {
    return [...scopedTasks].sort((a, b) => {
      if (a.task.status !== b.task.status) return a.task.status === "active" ? -1 : 1;

      const aScheduled = a.matchesExecutionDay && Boolean(a.executionStartAt) && a.hasEstimate;
      const bScheduled = b.matchesExecutionDay && Boolean(b.executionStartAt) && b.hasEstimate;
      if (aScheduled !== bScheduled) return aScheduled ? -1 : 1;

      const minuteDiff = getSortMinutes(a, timezone) - getSortMinutes(b, timezone);
      if (minuteDiff !== 0) return minuteDiff;

      return a.task.title.localeCompare(b.task.title);
    });
  }, [scopedTasks, timezone]);

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

  const taskById = useMemo(
    () => new Map(tasks.map((task) => [task.id, task])),
    [tasks]
  );
  const nowDate = useMemo(() => new Date(nowTick), [nowTick]);
  const selectedIsToday = getDateKeyInTimeZone(nowDate, timezone) === selectedDate;
  const nowMarker = useMemo(() => {
    if (!selectedIsToday) return null;
    const parts = getDatePartsInTimeZone(nowDate, timezone);
    return {
      hour: parts.hour,
      minute: parts.minute,
      label: formatTimeInTimeZone(nowDate, timezone),
    };
  }, [nowDate, selectedIsToday, timezone]);

  const patchTask = async (payload: Record<string, unknown>) => {
    setSaving(true);
    try {
      await fetch("/api/tasks", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      await load({ silent: true });
      onTaskUpdate?.();
    } finally {
      setSaving(false);
    }
  };

  const startPlanning = (task: Task, fallbackDate: Date | null) => {
    const sourceDate = task.executionStartAt ? new Date(task.executionStartAt) : fallbackDate;

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

  const reopenTask = async (taskId: string) => {
    await patchTask({ id: taskId, action: "reopen" });
  };

  const minuteFromDropEvent = (event: DragEvent<HTMLDivElement>): number => {
    const bounds = event.currentTarget.getBoundingClientRect();
    const relativeY = event.clientY - bounds.top;
    const ratio = Math.min(0.9999, Math.max(0, relativeY / Math.max(1, bounds.height)));
    const minuteRaw = Math.floor((ratio * 60) / DROP_MINUTE_STEP) * DROP_MINUTE_STEP;
    return Math.min(55, Math.max(0, minuteRaw));
  };

  const stageMove = (taskId: string, hour: number, minute: number) => {
    const task = taskById.get(taskId);
    if (!task || task.status !== "active") return;
    const executionStartAt = zonedDateTimeToUtc(
      selectedDate,
      toTimeValue(hour, minute),
      timezone
    ).toISOString();
    setPendingMove({
      taskId,
      title: task.title,
      executionStartAt,
    });
  };

  const confirmMove = async () => {
    if (!pendingMove) return;
    await patchTask({
      id: pendingMove.taskId,
      edits: { executionStartAt: pendingMove.executionStartAt },
    });
    setPendingMove(null);
  };

  const cancelMove = () => {
    setPendingMove(null);
  };

  const onTaskDragStart = (taskId: string, event: DragEvent<HTMLElement>) => {
    if (saving) return;
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", taskId);
    setEditingTaskId(null);
    setPendingMove(null);
    setDraggingTaskId(taskId);
  };

  const onTaskDragEnd = () => {
    setDraggingTaskId(null);
    setDropPreview(null);
  };

  const onHourDragOver = (hour: number, event: DragEvent<HTMLDivElement>) => {
    const id = draggingTaskId || event.dataTransfer.getData("text/plain");
    if (!id || saving) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
    setDropPreview({ hour, minute: minuteFromDropEvent(event) });
  };

  const onHourDrop = (hour: number, event: DragEvent<HTMLDivElement>) => {
    const id = draggingTaskId || event.dataTransfer.getData("text/plain");
    setDraggingTaskId(null);
    setDropPreview(null);
    if (!id || saving) return;
    event.preventDefault();
    stageMove(id, hour, minuteFromDropEvent(event));
  };

  const updateScheduleWindow = (
    group: "work" | "sleep",
    day: WeekdayKey,
    updates: Partial<TimeWindowPreference>
  ) => {
    setSchedulePreferences((previous) => ({
      ...previous,
      [group]: {
        ...previous[group],
        [day]: {
          ...previous[group][day],
          ...updates,
        },
      },
    }));
  };

  if (loading) {
    return (
      <div className="px-4 py-3 text-xs font-mono text-[var(--text-muted)]">
        loading timeline...
      </div>
    );
  }

  return (
    <div className="overflow-x-hidden">
      <div className="px-4 py-2 border-b border-[var(--border)]">
        <div className="flex items-center justify-between gap-2">
          <span className="font-mono text-xs tracking-widest text-[var(--text-muted)] uppercase">
            Timeline
          </span>
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
            className="px-2 py-1 text-[10px] font-mono border border-[var(--border)] text-[var(--text-muted)] hover:text-[var(--text-primary)]"
            onClick={() => setShowScheduleSettings((prev) => !prev)}
          >
            Patterns
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

        <p className="mt-2 text-[10px] font-mono text-[var(--text-muted)]">
          8-hour preview with scroll. Drag active tasks into a time slot to reschedule.
        </p>
        <p className="mt-1 text-[10px] font-mono text-[var(--text-muted)]">
          {WEEKDAY_LABELS[selectedWeekday]} work {schedulePreview(selectedWorkWindow)} · sleep{" "}
          {schedulePreview(selectedSleepWindow)}
        </p>

        {showScheduleSettings && (
          <div className="mt-2 border border-[var(--border)] p-2">
            <p className="text-[10px] font-mono text-[var(--text-muted)] mb-2">
              Weekly recurring availability. Saved locally and synced into attention context.
            </p>
            <div className="grid grid-cols-[34px_1fr_1fr] gap-2 text-[10px] font-mono text-[var(--text-muted)]">
              <span />
              <span>Work</span>
              <span>Sleep (optional)</span>
              {WEEKDAY_ORDER.map((day) => (
                <div key={day} className="contents">
                  <span className="text-[var(--text-secondary)]">{WEEKDAY_LABELS[day]}</span>
                  <div className="flex items-center gap-1">
                    <input
                      type="checkbox"
                      checked={schedulePreferences.work[day].enabled}
                      onChange={(event) =>
                        updateScheduleWindow("work", day, { enabled: event.target.checked })
                      }
                    />
                    <input
                      type="time"
                      value={schedulePreferences.work[day].start}
                      onChange={(event) =>
                        updateScheduleWindow("work", day, { start: event.target.value })
                      }
                      className="bg-[var(--bg-primary)] border border-[var(--border)] text-[10px] font-mono text-[var(--text-secondary)] px-1 py-0.5"
                    />
                    <span>-</span>
                    <input
                      type="time"
                      value={schedulePreferences.work[day].end}
                      onChange={(event) =>
                        updateScheduleWindow("work", day, { end: event.target.value })
                      }
                      className="bg-[var(--bg-primary)] border border-[var(--border)] text-[10px] font-mono text-[var(--text-secondary)] px-1 py-0.5"
                    />
                  </div>
                  <div className="flex items-center gap-1">
                    <input
                      type="checkbox"
                      checked={schedulePreferences.sleep[day].enabled}
                      onChange={(event) =>
                        updateScheduleWindow("sleep", day, { enabled: event.target.checked })
                      }
                    />
                    <input
                      type="time"
                      value={schedulePreferences.sleep[day].start}
                      onChange={(event) =>
                        updateScheduleWindow("sleep", day, { start: event.target.value })
                      }
                      className="bg-[var(--bg-primary)] border border-[var(--border)] text-[10px] font-mono text-[var(--text-secondary)] px-1 py-0.5"
                    />
                    <span>-</span>
                    <input
                      type="time"
                      value={schedulePreferences.sleep[day].end}
                      onChange={(event) =>
                        updateScheduleWindow("sleep", day, { end: event.target.value })
                      }
                      className="bg-[var(--bg-primary)] border border-[var(--border)] text-[10px] font-mono text-[var(--text-secondary)] px-1 py-0.5"
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {pendingMove && (
        <div className="px-4 py-2 border-b border-[var(--border)] bg-[var(--accent-soft)]/50">
          <div className="flex flex-wrap items-center gap-2 text-[10px] font-mono">
            <span className="text-[var(--text-secondary)]">
              Move &quot;{pendingMove.title}&quot; to{" "}
              <span className="text-[var(--accent)]">
                {formatTimeInTimeZone(new Date(pendingMove.executionStartAt), timezone)}
              </span>{" "}
              on {formatDateKeyLabel(selectedDate, timezone)}?
            </span>
            <span className="text-[var(--text-muted)]">This will reschedule the start time.</span>
            <button
              type="button"
              onClick={confirmMove}
              disabled={saving}
              className="ml-auto px-2 py-1 border border-[var(--accent)] text-[var(--accent)] hover:bg-[var(--accent)]/10"
            >
              Confirm
            </button>
            <button
              type="button"
              onClick={cancelMove}
              className="px-2 py-1 border border-[var(--border)] text-[var(--text-muted)] hover:text-[var(--text-primary)]"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      <div className="border-b border-[var(--border)] overflow-x-hidden">
        <div
          ref={scrollContainerRef}
          onScroll={onTimelineScroll}
          className="overflow-y-auto overflow-x-hidden"
          style={{ maxHeight: `${TIMELINE_VISIBLE_HOURS * TIMELINE_HOUR_HEIGHT_PX}px` }}
        >
          {Array.from({ length: 24 }).map((_, hour) => {
            const hourTasks = timedByHour.get(hour) ?? [];
            const hourLabel = String(hour).padStart(2, "0") + ":00";
            const isDropTarget = dropPreview?.hour === hour;
            const dropPreviewTime =
              isDropTarget && dropPreview
                ? formatTimeInTimeZone(
                    zonedDateTimeToUtc(selectedDate, toTimeValue(hour, dropPreview.minute), timezone),
                    timezone
                  )
                : null;
            const hourMidpoint = hour * 60 + 30;
            const inWorkWindow = isMinuteInWindow(hourMidpoint, selectedWorkWindow);
            const inSleepWindow = isMinuteInWindow(hourMidpoint, selectedSleepWindow);

            return (
              <div
                key={hour}
                className={`flex border-b last:border-b-0 border-[var(--border)]/60 ${
                  inSleepWindow
                    ? "bg-[var(--bg-tertiary)]/40"
                    : inWorkWindow
                      ? "bg-[var(--accent-soft)]/25"
                      : ""
                } ${isDropTarget ? "ring-1 ring-inset ring-[var(--accent)]/40" : ""}`}
                style={{ minHeight: `${TIMELINE_HOUR_HEIGHT_PX}px` }}
              >
                <div className="w-14 shrink-0 px-2 py-2 text-[10px] font-mono text-[var(--text-muted)] border-r border-[var(--border)]/60">
                  {hourLabel}
                  {nowMarker?.hour === hour && (
                    <span className="ml-1 text-[var(--danger)]">• now</span>
                  )}
                  {inSleepWindow && (
                    <span className="block text-[9px] text-[var(--text-muted)]">sleep</span>
                  )}
                  {!inSleepWindow && inWorkWindow && (
                    <span className="block text-[9px] text-[var(--accent)]">work</span>
                  )}
                </div>
                <div
                  className="relative flex-1 min-h-10 min-w-0 px-2 py-1.5 space-y-1 overflow-x-hidden"
                  onDragOver={(event) => onHourDragOver(hour, event)}
                  onDrop={(event) => onHourDrop(hour, event)}
                >
                  {isDropTarget && dropPreviewTime && (
                    <p className="absolute right-2 top-1 text-[9px] font-mono text-[var(--accent)] pointer-events-none">
                      drop at {dropPreviewTime}
                    </p>
                  )}
                  {hourTasks.map((item) => (
                    <div
                      key={item.task.id}
                      className={`border px-2 py-1.5 text-xs ${
                        item.task.status === "done"
                          ? "border-[var(--border)] text-[var(--text-muted)] bg-[var(--bg-tertiary)]/20"
                          : "border-[var(--accent)]/30 bg-[var(--accent-soft)]"
                      } ${item.task.status === "active" ? "cursor-grab active:cursor-grabbing" : ""} max-w-full overflow-hidden`}
                      style={{
                        minHeight: `${Math.max(
                          24,
                          Math.round((item.durationMinutes / 60) * TIMELINE_HOUR_HEIGHT_PX)
                        )}px`,
                      }}
                      draggable={item.task.status === "active"}
                      onDragStart={(event) => onTaskDragStart(item.task.id, event)}
                      onDragEnd={onTaskDragEnd}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div className="min-w-0 flex-1">
                          <p className={`${item.task.status === "done" ? "line-through" : ""} break-words whitespace-normal`}>
                            {item.task.title}
                          </p>
                          <p className="text-[10px] font-mono text-[var(--text-muted)] mt-0.5">
                            {formatTimeInTimeZone(item.startAt, timezone)} -{" "}
                            {formatTimeInTimeZone(item.endAt, timezone)} · {item.durationMinutes}m
                          </p>
                        </div>
                        {item.task.status === "active" ? (
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
                              title="Edit schedule"
                            >
                              Edit
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
                        ) : (
                          <div className="flex items-center gap-1 shrink-0">
                            <button
                              type="button"
                              onClick={() => reopenTask(item.task.id)}
                              disabled={saving}
                              className="px-1.5 h-6 border border-[var(--accent)] text-[10px] font-mono text-[var(--accent)] hover:bg-[var(--accent)]/10"
                              title="Undo complete"
                            >
                              Undo
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                  {nowMarker?.hour === hour && (
                    <div
                      className="pointer-events-none absolute inset-x-1 z-10"
                      style={{ top: `${(nowMarker.minute / 60) * 100}%` }}
                    >
                      <div className="relative h-px bg-[var(--danger)]">
                        <span className="absolute -top-2 left-0 bg-[var(--bg-secondary)] px-1 text-[9px] font-mono text-[var(--danger)]">
                          {nowMarker.label}
                        </span>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div>
        <div className="px-4 py-2 border-b border-[var(--border)]">
          <span className="font-mono text-xs tracking-widest text-[var(--text-muted)] uppercase">
            Day Tasks
          </span>
          {dayTaskList.length > 0 && (
            <span className="ml-2 text-xs font-mono text-[var(--text-muted)]">
              {dayTaskList.length}
            </span>
          )}
        </div>

        {dayTaskList.length === 0 ? (
          <div className="px-4 py-3 text-xs text-[var(--text-muted)] font-mono">
            — no tasks related to this day
          </div>
        ) : (
          <ul className="divide-y divide-[var(--border)]">
            {dayTaskList.map((scoped) => {
              const { task, executionStartAt, matchesExecutionDay, hasEstimate } = scoped;
              const isScheduledOnDay =
                matchesExecutionDay && Boolean(executionStartAt) && hasEstimate;
              const isActive = task.status === "active";
              const scheduleFallback = zonedDateTimeToUtc(selectedDate, "09:00", timezone);

              return (
                <li key={task.id} className="px-4 py-2.5">
                  <div className="flex items-center justify-between gap-2">
                    <div className="min-w-0">
                      <p
                        className={`text-sm truncate ${
                          task.status === "done"
                            ? "line-through text-[var(--text-muted)]"
                            : "text-[var(--text-primary)]"
                        }`}
                      >
                        {task.title}
                      </p>
                      <p className="text-[10px] font-mono text-[var(--text-muted)] mt-0.5">
                        {isScheduledOnDay && executionStartAt
                          ? `scheduled ${formatTimeInTimeZone(executionStartAt, timezone)}`
                          : "not scheduled"}
                        {typeof task.estimatedMinutes === "number" && task.estimatedMinutes > 0
                          ? ` · ${task.estimatedMinutes}m`
                          : " · estimate needed"}
                      </p>
                    </div>

                    {isActive ? (
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
                        {isScheduledOnDay ? (
                          <>
                            <button
                              type="button"
                              onClick={() => startPlanning(task, executionStartAt ?? scheduleFallback)}
                              disabled={saving}
                              className="px-1.5 h-6 border border-[var(--border)] text-[10px] font-mono text-[var(--text-muted)] hover:text-[var(--text-primary)]"
                              title="Edit schedule"
                            >
                              Edit
                            </button>
                            <button
                              type="button"
                              onClick={() => clearExecutionTime(task.id)}
                              disabled={saving}
                              className="px-1.5 h-6 border border-[var(--border)] text-[10px] font-mono text-[var(--text-muted)] hover:text-[var(--danger)]"
                              title="Clear execution time"
                            >
                              Clear
                            </button>
                          </>
                        ) : (
                          <button
                            type="button"
                            onClick={() => startPlanning(task, scheduleFallback)}
                            disabled={saving}
                            className="px-1.5 h-6 border border-[var(--accent)] text-[10px] font-mono text-[var(--accent)] hover:bg-[var(--accent)]/10"
                            title="Set start time and estimate"
                          >
                            Schedule
                          </button>
                        )}
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={() => reopenTask(task.id)}
                        disabled={saving}
                        className="px-1.5 h-6 border border-[var(--accent)] text-[10px] font-mono text-[var(--accent)] hover:bg-[var(--accent)]/10"
                        title="Undo complete"
                      >
                        Undo
                      </button>
                    )}
                  </div>

                  {editingTaskId === task.id && isActive && (
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
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
