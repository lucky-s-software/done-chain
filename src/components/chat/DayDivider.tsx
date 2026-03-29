interface DayDividerProps {
  date: Date;
}

function formatDayLabel(date: Date): string {
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);

  const sameDay = (a: Date, b: Date) =>
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate();

  if (sameDay(date, today)) return "Today";
  if (sameDay(date, yesterday)) return "Yesterday";

  return date.toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: date.getFullYear() !== today.getFullYear() ? "numeric" : undefined,
  });
}

export function DayDivider({ date }: DayDividerProps) {
  return (
    <div className="flex items-center gap-3 my-4">
      <hr className="flex-1 border-[var(--border)]" />
      <span className="font-mono text-[10px] text-[var(--text-muted)] shrink-0 tracking-widest uppercase">
        {formatDayLabel(date)}
      </span>
      <hr className="flex-1 border-[var(--border)]" />
    </div>
  );
}
