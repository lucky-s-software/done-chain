export const TIMEZONE_STORAGE_KEY = "donechain.timezone";

export function isValidTimeZone(timeZone: string): boolean {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone });
    return true;
  } catch {
    return false;
  }
}

export function detectUserTimeZone(): string {
  try {
    const detected = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
    return isValidTimeZone(detected) ? detected : "UTC";
  } catch {
    return "UTC";
  }
}

export function getDatePartsInTimeZone(date: Date, timeZone: string) {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
    hour12: false,
  });

  const partMap: Record<string, string> = {};
  for (const part of formatter.formatToParts(date)) {
    if (part.type !== "literal") {
      partMap[part.type] = part.value;
    }
  }

  return {
    year: Number(partMap.year),
    month: Number(partMap.month),
    day: Number(partMap.day),
    hour: Number(partMap.hour),
    minute: Number(partMap.minute),
    second: Number(partMap.second),
  };
}

export function getDateKeyInTimeZone(date: Date, timeZone: string): string {
  const parts = getDatePartsInTimeZone(date, timeZone);
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${parts.year}-${pad(parts.month)}-${pad(parts.day)}`;
}

export function shiftDateKey(dateKey: string, deltaDays: number): string {
  const [year, month, day] = dateKey.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  date.setUTCDate(date.getUTCDate() + deltaDays);
  return date.toISOString().slice(0, 10);
}

export function formatDateKeyLabel(
  dateKey: string,
  timeZone: string,
  locale = "en-US"
): string {
  const [year, month, day] = dateKey.split("-").map(Number);
  const anchor = new Date(Date.UTC(year, month - 1, day, 12, 0, 0));
  return anchor.toLocaleDateString(locale, {
    timeZone,
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export function formatTimeInTimeZone(
  date: Date,
  timeZone: string,
  locale = "en-US"
): string {
  return date.toLocaleTimeString(locale, {
    timeZone,
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function formatDateInTimeZone(
  date: Date,
  timeZone: string,
  options: Intl.DateTimeFormatOptions = {
    weekday: "short",
    month: "short",
    day: "numeric",
  },
  locale = "en-US"
): string {
  return date.toLocaleDateString(locale, {
    timeZone,
    ...options,
  });
}

export function isMidnightInTimeZone(date: Date, timeZone: string): boolean {
  const parts = getDatePartsInTimeZone(date, timeZone);
  return parts.hour === 0 && parts.minute === 0 && parts.second === 0;
}

function getTimeZoneOffsetMs(date: Date, timeZone: string): number {
  const parts = getDatePartsInTimeZone(date, timeZone);
  const asUtc = Date.UTC(
    parts.year,
    parts.month - 1,
    parts.day,
    parts.hour,
    parts.minute,
    parts.second
  );
  return asUtc - date.getTime();
}

export function zonedDateTimeToUtc(dateKey: string, time: string, timeZone: string): Date {
  const [year, month, day] = dateKey.split("-").map(Number);
  const [hour, minute] = time.split(":").map(Number);

  let guess = new Date(Date.UTC(year, month - 1, day, hour, minute, 0));
  for (let i = 0; i < 3; i++) {
    const offsetMs = getTimeZoneOffsetMs(guess, timeZone);
    const candidate = new Date(Date.UTC(year, month - 1, day, hour, minute, 0) - offsetMs);
    if (Math.abs(candidate.getTime() - guess.getTime()) < 1000) {
      return candidate;
    }
    guess = candidate;
  }

  return guess;
}

export function listSelectableTimeZones(current?: string): string[] {
  const intlWithSupported = Intl as typeof Intl & {
    supportedValuesOf?: (key: string) => string[];
  };

  const common = [
    current,
    detectUserTimeZone(),
    "UTC",
    "Europe/Istanbul",
    "Europe/London",
    "America/New_York",
    "America/Los_Angeles",
    "Asia/Tokyo",
  ].filter((value): value is string => Boolean(value));

  const supported =
    typeof intlWithSupported.supportedValuesOf === "function"
      ? intlWithSupported.supportedValuesOf("timeZone")
      : [];

  return Array.from(new Set([...common, ...supported]));
}
