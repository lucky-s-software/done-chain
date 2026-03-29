"use client";

import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Card } from "@/components/ui/Card";
import type { ActionCard } from "@/types";

interface ProposedMemoryCardProps {
  card: ActionCard;
  onAction: (cardId: string, action: "approve" | "reject" | "dismiss") => Promise<void>;
}

export function ProposedMemoryCard({ card, onAction }: ProposedMemoryCardProps) {
  const payload = card.payload as { content: string; tags?: string[] };
  const [loading, setLoading] = useState(false);

  if (card.status !== "pending") {
    return (
      <div className="mt-2 px-3 py-2 border border-[var(--border)] bg-[var(--bg-tertiary)] text-xs font-mono text-[var(--text-muted)] flex items-center gap-2">
        <span className="text-[var(--info)]">🧠</span>
        {card.status === "approved" ? "Memory reviewed." : "Memory dismissed."}
      </div>
    );
  }

  const handleAction = async (action: "approve" | "dismiss") => {
    setLoading(true);
    await onAction(card.id, action);
    setLoading(false);
  };

  return (
    <Card className="mt-2 p-3 border-l-2 border-l-[var(--info)]">
      <div className="flex items-center gap-2 mb-2">
        <span className="text-[var(--info)] font-mono text-xs tracking-widest">🧠 MEMORY CREATED</span>
      </div>
      <p className="text-[var(--text-primary)] text-sm mb-2">&quot;{payload.content}&quot;</p>
      <div className="flex flex-wrap gap-1 mb-3">
        {payload.tags?.map((t) => <Badge key={t} variant="info">#{t}</Badge>)}
      </div>
      <div className="flex gap-2">
        <Button size="sm" variant="ghost" onClick={() => handleAction("approve")} disabled={loading}>Review</Button>
        <Button size="sm" variant="ghost" onClick={() => handleAction("dismiss")} disabled={loading}>Dismiss</Button>
      </div>
    </Card>
  );
}
