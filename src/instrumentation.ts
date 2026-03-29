export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  const { runWithLock, shouldRunDaily } = await import("@/lib/engine/scheduler");
  const { enforceRetentionPolicy } = await import("@/lib/engine/retention");
  const { runSummarizationJob } = await import("@/lib/engine/summarizer");
  const { evaluateDailyClosure } = await import("@/lib/engine/closure");

  // Every 6 hours: retention policy
  setInterval(
    async () => {
      await runWithLock("retention", enforceRetentionPolicy).catch((err) =>
        console.error("[cron] retention error:", err)
      );
    },
    6 * 60 * 60 * 1000
  );

  // Check every minute for daily jobs
  setInterval(async () => {
    // 23:30 — summarization + profile update
    if (shouldRunDaily("summarization", 23)) {
      const now = new Date();
      if (now.getHours() === 23 && now.getMinutes() >= 30) {
        await runWithLock("summarization", runSummarizationJob).catch((err) =>
          console.error("[cron] summarization error:", err)
        );
      }
    }

    // 23:55 — daily closure
    if (shouldRunDaily("closure", 23)) {
      const now = new Date();
      if (now.getHours() === 23 && now.getMinutes() >= 55) {
        await runWithLock("closure", () => evaluateDailyClosure(new Date())).catch((err) =>
          console.error("[cron] closure error:", err)
        );
      }
    }
  }, 60 * 1000);
}
