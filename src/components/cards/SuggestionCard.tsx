"use client";

import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import type { ActionCard } from "@/types";

interface SuggestionCardProps {
  card: ActionCard;
  onAction: (cardId: string, action: "approve" | "dismiss") => Promise<void>;
}

export function SuggestionCard({ card, onAction }: SuggestionCardProps) {
  const payload = card.payload as { suggestion: string };

  if (card.status !== "pending") {
    return null; // suggestions collapse fully when resolved
  }

  return (
    <Card className="mt-2 p-3 border-dashed">
      <p className="text-[var(--text-muted)] font-mono text-xs mb-1.5">💡 SUGGESTION</p>
      <p className="text-[var(--text-secondary)] text-sm mb-3">{payload.suggestion}</p>
      <div className="flex gap-2">
        <Button size="sm" variant="ghost" onClick={() => onAction(card.id, "approve")}>Act on it</Button>
        <Button size="sm" variant="ghost" onClick={() => onAction(card.id, "dismiss")}>Dismiss</Button>
      </div>
    </Card>
  );
}
