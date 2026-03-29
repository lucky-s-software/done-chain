"use client";

import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Card } from "@/components/ui/Card";
import type { ActionCard } from "@/types";

interface SummaryNoticeCardProps {
  card: ActionCard;
  onAction: (cardId: string, action: "approve" | "dismiss") => Promise<void>;
}

export function SummaryNoticeCard({ card, onAction }: SummaryNoticeCardProps) {
  const payload = card.payload as {
    messagesProcessed: number;
    entriesCreated: number;
    tags?: string[];
    summaryText?: string;
  };

  if (card.status !== "pending") {
    return (
      <div className="mt-2 px-3 py-1.5 border border-[var(--border)] bg-[var(--bg-tertiary)] text-xs font-mono text-[var(--text-muted)]">
        📋 Session summary reviewed.
      </div>
    );
  }

  return (
    <Card className="mt-2 p-3 border-l-2 border-l-[var(--success)]">
      <p className="text-[var(--success)] font-mono text-xs tracking-widest mb-2">📋 SESSION SUMMARIZED</p>
      <div className="text-sm text-[var(--text-secondary)] mb-2 space-y-0.5">
        <p>{payload.messagesProcessed} messages → 1 summary</p>
        <p>{payload.entriesCreated} memories extracted</p>
        {payload.tags && payload.tags.length > 0 && (
          <div className="flex flex-wrap gap-1 mt-1.5">
            {payload.tags.map((t) => <Badge key={t} variant="default">#{t}</Badge>)}
          </div>
        )}
      </div>
      {payload.summaryText && (
        <p className="text-xs text-[var(--text-muted)] border-t border-[var(--border)] pt-2 mt-2 italic">{payload.summaryText}</p>
      )}
      <div className="flex gap-2 mt-3">
        <Button size="sm" variant="ghost" onClick={() => onAction(card.id, "approve")}>View Summary</Button>
        <Button size="sm" variant="ghost" onClick={() => onAction(card.id, "dismiss")}>Dismiss</Button>
      </div>
    </Card>
  );
}
