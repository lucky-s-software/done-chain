"use client";

import { ActionCardRenderer } from "@/components/cards/ActionCardRenderer";
import type { Message, ActionCard } from "@/types";
import { formatTimeInTimeZone } from "@/lib/timezone";

interface MessageBubbleProps {
  message: Message;
  timezone: string;
  selected?: boolean;
  onCardAction: (
    cardId: string,
    action: "approve" | "reject" | "dismiss",
    edits?: {
      title?: string;
      dueAt?: string | null;
      tags?: string[];
      estimatedMinutes?: number | null;
      executionStartAt?: string | null;
    }
  ) => Promise<void>;
  onClick?: (messageId: string) => void;
}

export function MessageBubble({
  message,
  timezone,
  selected,
  onCardAction,
  onClick,
}: MessageBubbleProps) {
  const isUser = message.role === "user";

  return (
    <div
      className={`flex flex-col ${isUser ? "items-end" : "items-start"} mb-4 rounded transition-colors ${
        selected ? "bg-[var(--accent)]/8" : "cursor-pointer hover:bg-[var(--bg-secondary)]/40"
      }`}
      onClick={() => onClick?.(message.id)}
    >
      {/* Role label */}
      <span className="text-[10px] font-mono text-[var(--text-muted)] mb-1 px-1 tracking-widest uppercase">
        {isUser ? "you" : "donechain"}
      </span>

      {/* Bubble */}
      <div
        className={`max-w-[85%] px-3.5 py-2.5 text-sm leading-relaxed ${
          isUser
            ? "bg-[var(--bg-tertiary)] text-[var(--text-primary)] border border-[var(--border)]"
            : "bg-transparent text-[var(--text-primary)]"
        }`}
        style={{ whiteSpace: "pre-wrap" }}
      >
        {message.content}
      </div>

      {/* Action cards rendered inline below assistant message */}
      {!isUser && message.actionCards && message.actionCards.length > 0 && (
        <div className="w-full max-w-[85%] flex flex-col gap-1 mt-1">
          {message.actionCards.map((card: ActionCard) => (
            <ActionCardRenderer key={card.id} card={card} onAction={onCardAction} timezone={timezone} />
          ))}
        </div>
      )}

      {/* Timestamp */}
      <span className="text-[10px] text-[var(--text-muted)] mt-1 px-1 font-mono">
        {formatTimeInTimeZone(new Date(message.createdAt), timezone)}
      </span>
    </div>
  );
}
