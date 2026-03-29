"use client";

import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import type { ActionCard } from "@/types";

interface ClarificationCardProps {
  card: ActionCard;
  onAction: (cardId: string, action: "approve" | "dismiss", edits?: { title?: string }) => Promise<void>;
}

export function ClarificationCard({ card, onAction }: ClarificationCardProps) {
  const payload = card.payload as { question: string; options: string[] };

  if (card.status !== "pending") {
    return (
      <div className="mt-2 px-3 py-1.5 border border-[var(--border)] bg-[var(--bg-tertiary)] text-xs font-mono text-[var(--text-muted)]">
        Clarified.
      </div>
    );
  }

  return (
    <Card className="mt-2 p-3">
      <p className="text-[var(--text-muted)] font-mono text-xs mb-1.5">❓ CLARIFICATION</p>
      <p className="text-[var(--text-secondary)] text-sm mb-3">{payload.question}</p>
      <div className="flex flex-wrap gap-2">
        {payload.options?.map((opt, i) => (
          <Button
            key={i}
            size="sm"
            variant="ghost"
            onClick={() => onAction(card.id, "approve", { title: opt })}
          >
            {opt}
          </Button>
        ))}
        <Button size="sm" variant="ghost" onClick={() => onAction(card.id, "dismiss")}>Skip</Button>
      </div>
    </Card>
  );
}
