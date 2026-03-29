// Shared TypeScript types matching Prisma models + API contracts

export type Role = "user" | "assistant" | "system";

export type ActionCardType =
  | "proposed_task"
  | "proposed_memory"
  | "confirm_commitment"
  | "suggestion"
  | "clarification"
  | "summary_notice";

export type CardStatus = "pending" | "approved" | "rejected" | "dismissed";

export type TaskStatus = "proposed" | "active" | "done" | "cancelled";

export type ApprovalState = "pending" | "approved" | "rejected";

export type DueType = "soft" | "hard";

export type EntrySource = "ai_extracted" | "user_created" | "summary";

export interface ActionCard {
  id: string;
  messageId: string;
  cardType: ActionCardType;
  payload: Record<string, unknown>;
  status: CardStatus;
  createdAt: string;
  resolvedAt: string | null;
}

export interface Message {
  id: string;
  role: Role;
  content: string;
  createdAt: string;
  expired: boolean;
  actionCards: ActionCard[];
}

export interface Task {
  id: string;
  title: string;
  status: TaskStatus;
  approvalState: ApprovalState;
  dueAt: string | null;
  dueType: DueType | null;
  reminderAt: string | null;
  tags: string[];
  projectId: string | null;
  personId: string | null;
  createdAt: string;
  completedAt: string | null;
}

export interface Entry {
  id: string;
  content: string;
  source: EntrySource;
  tags: string[];
  pinned: boolean;
  reviewed: boolean;
  createdAt: string;
}

// Extraction from AI parser
export interface RawExtraction {
  type: "task" | "memory" | "reminder";
  title: string;
  content?: string;
  dueAt?: string | null;
  dueType?: string | null;
  reminderAt?: string | null;
  tags?: string[];
  person?: string | null;
  confidence?: number;
}

export interface NormalizedExtraction {
  type: "task" | "memory" | "reminder";
  title: string;
  content: string;
  dueAt: Date | null;
  dueType: DueType | null;
  reminderAt: Date | null;
  tags: string[];
  person: string | null;
  confidence: number;
}

export interface ParseResult {
  reply: string;
  extractions: NormalizedExtraction[];
  followUpQuestions: string[];
  suggestedActions: string[];
}

// API response contracts
export interface ChatResponse {
  message: Message;
  memoriesCreated: number;
  followUpQuestions?: string[];
  suggestedActions?: string[];
}

export interface CardActionResponse {
  card: ActionCard;
  createdTask?: Task;
}

export interface SummaryResponse {
  summary: {
    id: string;
    summary: string;
    periodStart: string;
    periodEnd: string;
    tags: string[];
    createdAt: string;
  };
  entriesCreated: number;
  messagesProcessed: number;
  message?: Message;
}
