"use client";

import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import type { ActionCard } from "@/types";

interface ConfirmCommitmentCardProps {
  card: ActionCard;
  onAction: (cardId: string, action: "approve" | "reject") => Promise<void>;
}

export function ConfirmCommitmentCard({ card, onAction }: ConfirmCommitmentCardProps) {
  const payload = card.payload as { question: string };

  if (card.status !== "pending") {
    return (
      <div className="mt-2 px-3 py-2 border border-[var(--border)] bg-[var(--bg-tertiary)] text-xs font-mono text-[var(--text-muted)]">
        {card.status === "approved" ? "✓ Committed." : "✗ Declined."}
      </div>
    );
  }

  return (
    <Card accent className="mt-2 p-3">
      <p className="text-[var(--accent)] font-mono text-xs tracking-widest mb-2">◈ COMMIT?</p>
      <p className="text-[var(--text-primary)] text-sm mb-3">{payload.question}</p>
      <div className="flex gap-2">
        <Button size="sm" variant="primary" onClick={() => onAction(card.id, "approve")}>Yes — commit</Button>
        <Button size="sm" variant="ghost" onClick={() => onAction(card.id, "reject")}>Not now</Button>
      </div>
    </Card>
  );
}
