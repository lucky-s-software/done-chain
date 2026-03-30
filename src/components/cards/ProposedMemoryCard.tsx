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
  const payload = card.payload as { content: string; tags?: string[]; entryId?: string };
  const [loading, setLoading] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [deleted, setDeleted] = useState(false);
  const [busyDelete, setBusyDelete] = useState(false);

  const compact = payload.content.length > 82 ? `${payload.content.slice(0, 82).trimEnd()}...` : payload.content;

  if (card.status === "dismissed") {
    return null;
  }

  const hideCard = async () => {
    setLoading(true);
    await onAction(card.id, "dismiss");
    setLoading(false);
  };

  const deleteMemory = async () => {
    if (!payload.entryId) return;
    setBusyDelete(true);
    try {
      const res = await fetch(`/api/entries/${payload.entryId}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Failed to delete memory");
      setDeleted(true);
      await onAction(card.id, "dismiss");
      window.dispatchEvent(new Event("donechain:open-memories"));
    } catch (err) {
      console.error("[memory card delete]", err);
    } finally {
      setBusyDelete(false);
    }
  };

  if (deleted) {
    return (
      <div className="mt-2 px-3 py-2 border border-[var(--border)] bg-[var(--bg-tertiary)] text-xs font-mono text-[var(--text-muted)]">
        Memory deleted.
      </div>
    );
  }

  return (
    <div onClick={(event) => event.stopPropagation()}>
      <Card className="mt-2 p-3 border-l-2 border-l-[var(--info)]">
        <div className="flex items-center gap-2 mb-1.5">
          <span className="text-[var(--info)] font-mono text-xs tracking-widest">🧠 MEMORY RECORDED</span>
        </div>
        <button
          type="button"
          className="w-full text-left"
          onClick={() => setExpanded((prev) => !prev)}
        >
          <p className="text-sm text-[var(--text-secondary)]">
            {expanded ? payload.content : compact}
          </p>
        </button>

        {expanded && payload.tags && payload.tags.length > 0 && (
          <div className="flex flex-wrap gap-1 mt-2.5">
            {payload.tags.map((tag) => <Badge key={tag} variant="info">#{tag}</Badge>)}
          </div>
        )}

        <div className="flex gap-2 mt-3">
          <Button
            size="sm"
            variant="ghost"
            onClick={() => window.dispatchEvent(new Event("donechain:open-memories"))}
          >
            Open Memories
          </Button>
          {payload.entryId && (
            <Button
              size="sm"
              variant="danger"
              onClick={deleteMemory}
              disabled={busyDelete}
            >
              {busyDelete ? "Deleting..." : "Delete"}
            </Button>
          )}
          <Button size="sm" variant="ghost" onClick={hideCard} disabled={loading}>
            Hide
          </Button>
        </div>
      </Card>
    </div>
  );
}
