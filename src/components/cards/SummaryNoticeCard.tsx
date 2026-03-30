"use client";

import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Card } from "@/components/ui/Card";
import { Modal } from "@/components/ui/Modal";
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
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);

  const openSummary = async () => {
    if (card.status === "pending") {
      setLoading(true);
      try {
        await onAction(card.id, "approve");
      } finally {
        setLoading(false);
      }
    }
    setOpen(true);
  };

  return (
    <div onClick={(event) => event.stopPropagation()}>
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
          <p className="text-xs text-[var(--text-muted)] border-t border-[var(--border)] pt-2 mt-2 italic">
            {payload.summaryText.length > 160 ? `${payload.summaryText.slice(0, 160).trimEnd()}...` : payload.summaryText}
          </p>
        )}
        <div className="flex gap-2 mt-3">
          <Button size="sm" variant="ghost" onClick={openSummary} disabled={loading}>
            {loading ? "Opening..." : "View Summary"}
          </Button>
          {card.status === "pending" && (
            <Button size="sm" variant="ghost" onClick={() => onAction(card.id, "dismiss")}>
              Dismiss
            </Button>
          )}
        </div>
      </Card>
      <Modal open={open} onClose={() => setOpen(false)} title="Summary">
        {payload.summaryText ? (
          <p>{payload.summaryText}</p>
        ) : (
          <p className="text-[var(--text-muted)]">No summary text captured.</p>
        )}
      </Modal>
      {card.status !== "pending" && (
        <div className="mt-1 px-2 text-[10px] font-mono text-[var(--text-muted)]">
          Session summary reviewed.
        </div>
      )}
    </div>
  );
}
