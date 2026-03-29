type JobName = "retention" | "summarization" | "closure" | "profileUpdate";

interface JobRecord {
  lastRunAt: Date | null;
  running: boolean;
}

const jobs = new Map<JobName, JobRecord>([
  ["retention", { lastRunAt: null, running: false }],
  ["summarization", { lastRunAt: null, running: false }],
  ["closure", { lastRunAt: null, running: false }],
  ["profileUpdate", { lastRunAt: null, running: false }],
]);

export function getJobStatus(): Record<string, { lastRunAt: string | null; running: boolean }> {
  const result: Record<string, { lastRunAt: string | null; running: boolean }> = {};
  for (const [name, record] of jobs) {
    result[name] = {
      lastRunAt: record.lastRunAt?.toISOString() ?? null,
      running: record.running,
    };
  }
  return result;
}

export async function runWithLock<T>(jobName: JobName, fn: () => Promise<T>): Promise<T | null> {
  const record = jobs.get(jobName);
  if (!record) throw new Error(`Unknown job: ${jobName}`);
  if (record.running) {
    console.log(`[scheduler] ${jobName} already running, skipping`);
    return null;
  }

  record.running = true;
  try {
    const result = await fn();
    record.lastRunAt = new Date();
    return result;
  } finally {
    record.running = false;
  }
}

export function shouldRunDaily(jobName: JobName, targetHour: number): boolean {
  const record = jobs.get(jobName);
  if (!record) return false;

  const now = new Date();
  if (now.getHours() < targetHour) return false;

  const lastRun = record.lastRunAt;
  if (!lastRun) return true;

  const startOfToday = new Date(now);
  startOfToday.setHours(0, 0, 0, 0);
  return lastRun < startOfToday;
}
