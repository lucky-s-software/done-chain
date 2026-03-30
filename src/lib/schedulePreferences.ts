export type WeekdayKey = "mon" | "tue" | "wed" | "thu" | "fri" | "sat" | "sun";

export interface TimeWindowPreference {
  enabled: boolean;
  start: string;
  end: string;
}

export interface TimelineSchedulePreferences {
  work: Record<WeekdayKey, TimeWindowPreference>;
  sleep: Record<WeekdayKey, TimeWindowPreference>;
}

export const WEEKDAY_ORDER: WeekdayKey[] = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"];

export const WEEKDAY_LABELS: Record<WeekdayKey, string> = {
  mon: "Mon",
  tue: "Tue",
  wed: "Wed",
  thu: "Thu",
  fri: "Fri",
  sat: "Sat",
  sun: "Sun",
};

export const TIMELINE_SCHEDULE_STORAGE_KEY = "donechain.timeline.schedule.preferences.v1";
export const TIMELINE_SCHEDULE_BLOCK_START = "[TIMELINE_SCHEDULE_BEGIN]";
export const TIMELINE_SCHEDULE_BLOCK_END = "[TIMELINE_SCHEDULE_END]";

function cloneWindow(window: TimeWindowPreference): TimeWindowPreference {
  return { enabled: window.enabled, start: window.start, end: window.end };
}

const DEFAULT_WORKDAY_WINDOW: TimeWindowPreference = { enabled: true, start: "09:00", end: "17:00" };
const DEFAULT_WEEKEND_WORK_WINDOW: TimeWindowPreference = { enabled: false, start: "10:00", end: "14:00" };
const DEFAULT_SLEEP_WINDOW: TimeWindowPreference = { enabled: false, start: "00:00", end: "07:00" };

function normalizeTime(value: unknown, fallback: string): string {
  if (typeof value !== "string") return fallback;
  const trimmed = value.trim();
  if (!/^\d{2}:\d{2}$/.test(trimmed)) return fallback;
  const [rawHour, rawMinute] = trimmed.split(":");
  const hour = Number.parseInt(rawHour, 10);
  const minute = Number.parseInt(rawMinute, 10);
  if (!Number.isInteger(hour) || hour < 0 || hour > 23) return fallback;
  if (!Number.isInteger(minute) || minute < 0 || minute > 59) return fallback;
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

function normalizeWindow(
  input: unknown,
  fallback: TimeWindowPreference
): TimeWindowPreference {
  const source = input && typeof input === "object" ? (input as Record<string, unknown>) : {};
  return {
    enabled: typeof source.enabled === "boolean" ? source.enabled : fallback.enabled,
    start: normalizeTime(source.start, fallback.start),
    end: normalizeTime(source.end, fallback.end),
  };
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function buildDefaultTimelinePreferences(): TimelineSchedulePreferences {
  return {
    work: {
      mon: cloneWindow(DEFAULT_WORKDAY_WINDOW),
      tue: cloneWindow(DEFAULT_WORKDAY_WINDOW),
      wed: cloneWindow(DEFAULT_WORKDAY_WINDOW),
      thu: cloneWindow(DEFAULT_WORKDAY_WINDOW),
      fri: cloneWindow(DEFAULT_WORKDAY_WINDOW),
      sat: cloneWindow(DEFAULT_WEEKEND_WORK_WINDOW),
      sun: cloneWindow(DEFAULT_WEEKEND_WORK_WINDOW),
    },
    sleep: {
      mon: cloneWindow(DEFAULT_SLEEP_WINDOW),
      tue: cloneWindow(DEFAULT_SLEEP_WINDOW),
      wed: cloneWindow(DEFAULT_SLEEP_WINDOW),
      thu: cloneWindow(DEFAULT_SLEEP_WINDOW),
      fri: cloneWindow(DEFAULT_SLEEP_WINDOW),
      sat: cloneWindow(DEFAULT_SLEEP_WINDOW),
      sun: cloneWindow(DEFAULT_SLEEP_WINDOW),
    },
  };
}

export function normalizeTimelinePreferences(input: unknown): TimelineSchedulePreferences {
  const defaults = buildDefaultTimelinePreferences();
  const source = input && typeof input === "object" ? (input as Record<string, unknown>) : {};
  const workSource = source.work && typeof source.work === "object" ? (source.work as Record<string, unknown>) : {};
  const sleepSource =
    source.sleep && typeof source.sleep === "object"
      ? (source.sleep as Record<string, unknown>)
      : {};

  const work = WEEKDAY_ORDER.reduce<Record<WeekdayKey, TimeWindowPreference>>((acc, day) => {
    acc[day] = normalizeWindow(workSource[day], defaults.work[day]);
    return acc;
  }, {} as Record<WeekdayKey, TimeWindowPreference>);

  const sleep = WEEKDAY_ORDER.reduce<Record<WeekdayKey, TimeWindowPreference>>((acc, day) => {
    acc[day] = normalizeWindow(sleepSource[day], defaults.sleep[day]);
    return acc;
  }, {} as Record<WeekdayKey, TimeWindowPreference>);

  return { work, sleep };
}

function formatWindow(window: TimeWindowPreference): string {
  return window.enabled ? `${window.start}-${window.end}` : "off";
}

export function buildTimelineScheduleSummary(preferences: TimelineSchedulePreferences): string {
  const workLines = WEEKDAY_ORDER.map(
    (day) => `- ${WEEKDAY_LABELS[day]}: ${formatWindow(preferences.work[day])}`
  ).join("\n");
  const sleepLines = WEEKDAY_ORDER.map(
    (day) => `- ${WEEKDAY_LABELS[day]}: ${formatWindow(preferences.sleep[day])}`
  ).join("\n");

  return [
    "Work windows (weekly):",
    workLines,
    "",
    "Sleep windows (weekly, optional):",
    sleepLines,
  ].join("\n");
}

export function stripTimelineScheduleBlock(profileContent: string): string {
  if (!profileContent) return "";
  const pattern = new RegExp(
    `${escapeRegExp(TIMELINE_SCHEDULE_BLOCK_START)}[\\s\\S]*?${escapeRegExp(
      TIMELINE_SCHEDULE_BLOCK_END
    )}\\n*`,
    "g"
  );
  return profileContent.replace(pattern, "").trim();
}

export function extractTimelineScheduleBlock(profileContent: string): string | null {
  if (!profileContent) return null;
  const pattern = new RegExp(
    `${escapeRegExp(TIMELINE_SCHEDULE_BLOCK_START)}\\n?([\\s\\S]*?)\\n?${escapeRegExp(
      TIMELINE_SCHEDULE_BLOCK_END
    )}`
  );
  const match = profileContent.match(pattern);
  if (!match) return null;
  const summary = (match[1] ?? "").trim();
  return summary || null;
}

export function upsertTimelineScheduleBlock(
  profileContent: string,
  preferences: TimelineSchedulePreferences
): string {
  const summary = buildTimelineScheduleSummary(preferences);
  const block = `${TIMELINE_SCHEDULE_BLOCK_START}\n${summary}\n${TIMELINE_SCHEDULE_BLOCK_END}`;
  const remainder = stripTimelineScheduleBlock(profileContent);
  return remainder ? `${block}\n\n${remainder}` : block;
}
