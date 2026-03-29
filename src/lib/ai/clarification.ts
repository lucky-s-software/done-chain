type ClarificationState = "none" | "round_1" | "round_2" | "resolved";

interface ClarificationEntry {
  state: ClarificationState;
  originalMessage: string;
  previousQuestions: string[];
  lastActivity: number;
}

const EXPIRE_MS = 10 * 60 * 1000; // 10 minutes

const clarificationMap = new Map<string, ClarificationEntry>();

function pruneExpired() {
  const now = Date.now();
  for (const [key, entry] of clarificationMap) {
    if (now - entry.lastActivity > EXPIRE_MS) {
      clarificationMap.delete(key);
    }
  }
}

export function getClarificationState(topicKey: string): ClarificationState {
  pruneExpired();
  return clarificationMap.get(topicKey)?.state ?? "none";
}

export function startClarification(topicKey: string, originalMessage: string, questions: string[]) {
  clarificationMap.set(topicKey, {
    state: "round_1",
    originalMessage,
    previousQuestions: questions,
    lastActivity: Date.now(),
  });
}

export function advanceClarification(topicKey: string, newQuestions: string[]) {
  const entry = clarificationMap.get(topicKey);
  if (!entry) return;

  if (entry.state === "round_1") {
    clarificationMap.set(topicKey, {
      ...entry,
      state: "round_2",
      previousQuestions: [...entry.previousQuestions, ...newQuestions],
      lastActivity: Date.now(),
    });
  } else if (entry.state === "round_2") {
    resolveClarification(topicKey);
  }
}

export function resolveClarification(topicKey: string) {
  const entry = clarificationMap.get(topicKey);
  if (entry) {
    clarificationMap.set(topicKey, {
      ...entry,
      state: "resolved",
      lastActivity: Date.now(),
    });
  }
}

export function getClarificationContext(topicKey: string): {
  originalMessage: string;
  previousQuestions: string[];
  state: ClarificationState;
} | null {
  pruneExpired();
  const entry = clarificationMap.get(topicKey);
  if (!entry) return null;
  return {
    originalMessage: entry.originalMessage,
    previousQuestions: entry.previousQuestions,
    state: entry.state,
  };
}

export function clearClarification(topicKey: string) {
  clarificationMap.delete(topicKey);
}

/** Derive a stable topic key from the first few words of a message */
export function deriveTopicKey(message: string): string {
  return message
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, "")
    .split(/\s+/)
    .slice(0, 4)
    .join("-");
}
