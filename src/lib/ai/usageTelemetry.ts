import type { DeepSeekUsage } from "@/lib/deepseek";

export interface AiUsageSummary {
  requestCount: number;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  promptCacheHitTokens: number;
  promptCacheMissTokens: number;
  cacheHitRate: number;
  totalLatencyMs: number;
  avgLatencyMs: number;
}

export interface AiUsageReport {
  totals: AiUsageSummary;
  byStage: Record<string, AiUsageSummary>;
}

function emptySummary(): AiUsageSummary {
  return {
    requestCount: 0,
    promptTokens: 0,
    completionTokens: 0,
    totalTokens: 0,
    promptCacheHitTokens: 0,
    promptCacheMissTokens: 0,
    cacheHitRate: 0,
    totalLatencyMs: 0,
    avgLatencyMs: 0,
  };
}

function finalizeSummary(summary: AiUsageSummary): AiUsageSummary {
  const promptBase = summary.promptCacheHitTokens + summary.promptCacheMissTokens;
  const cacheHitRate = promptBase > 0 ? summary.promptCacheHitTokens / promptBase : 0;
  const avgLatencyMs = summary.requestCount > 0 ? summary.totalLatencyMs / summary.requestCount : 0;

  return {
    ...summary,
    cacheHitRate: Number(cacheHitRate.toFixed(4)),
    avgLatencyMs: Math.round(avgLatencyMs),
  };
}

export function createAiUsageCollector() {
  const events: DeepSeekUsage[] = [];

  return {
    push: (usage: DeepSeekUsage) => {
      events.push(usage);
    },
    report: (): AiUsageReport => {
      const totals = emptySummary();
      const byStage: Record<string, AiUsageSummary> = {};

      for (const event of events) {
        const stage = event.stage?.trim() || "unknown";
        const stageSummary = byStage[stage] ?? emptySummary();

        stageSummary.requestCount += 1;
        stageSummary.promptTokens += event.promptTokens;
        stageSummary.completionTokens += event.completionTokens;
        stageSummary.totalTokens += event.totalTokens;
        stageSummary.promptCacheHitTokens += event.promptCacheHitTokens;
        stageSummary.promptCacheMissTokens += event.promptCacheMissTokens;
        stageSummary.totalLatencyMs += event.latencyMs;
        byStage[stage] = stageSummary;

        totals.requestCount += 1;
        totals.promptTokens += event.promptTokens;
        totals.completionTokens += event.completionTokens;
        totals.totalTokens += event.totalTokens;
        totals.promptCacheHitTokens += event.promptCacheHitTokens;
        totals.promptCacheMissTokens += event.promptCacheMissTokens;
        totals.totalLatencyMs += event.latencyMs;
      }

      return {
        totals: finalizeSummary(totals),
        byStage: Object.fromEntries(
          Object.entries(byStage).map(([stage, summary]) => [stage, finalizeSummary(summary)])
        ),
      };
    },
  };
}
