import { formatDateInTimeZone, getDateKeyInTimeZone, shiftDateKey } from "@/lib/timezone";

interface DayDividerProps {
  date: Date;
  timezone: string;
}

function formatDayLabel(date: Date, timezone: string): string {
  const today = new Date();
  const todayKey = getDateKeyInTimeZone(today, timezone);
  const dateKey = getDateKeyInTimeZone(date, timezone);
  if (dateKey === todayKey) return "Today";
  if (dateKey === shiftDateKey(todayKey, -1)) return "Yesterday";

  const sameYear = dateKey.slice(0, 4) === todayKey.slice(0, 4);

  return formatDateInTimeZone(date, timezone, {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: sameYear ? undefined : "numeric",
  });
}

export function DayDivider({ date, timezone }: DayDividerProps) {
  return (
    <div className="flex items-center gap-3 my-4">
      <hr className="flex-1 border-[var(--border)]" />
      <span className="font-mono text-[10px] text-[var(--text-muted)] shrink-0 tracking-widest uppercase">
        {formatDayLabel(date, timezone)}
      </span>
      <hr className="flex-1 border-[var(--border)]" />
    </div>
  );
}
