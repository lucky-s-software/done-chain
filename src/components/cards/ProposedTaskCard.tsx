"use client";

import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Card } from "@/components/ui/Card";
import type { ActionCard } from "@/types";

interface ProposedTaskCardProps {
  card: ActionCard;
  onAction: (cardId: string, action: "approve" | "reject" | "dismiss", edits?: { title?: string; dueAt?: string; tags?: string[] }) => Promise<void>;
}

export function ProposedTaskCard({ card, onAction }: ProposedTaskCardProps) {
  const payload = card.payload as {
    title: string;
    dueAt?: string;
    dueType?: string;
    tags?: string[];
    person?: string;
    confidence?: number;
  };

  const [loading, setLoading] = useState(false);
  const [editing, setEditing] = useState(false);
  const [editTitle, setEditTitle] = useState(payload.title);
  const [editDue, setEditDue] = useState(payload.dueAt ? payload.dueAt.split("T")[0] : "");

  const confidencePct = Math.round((payload.confidence ?? 0.5) * 100);

  const handleApprove = async () => {
    setLoading(true);
    await onAction(card.id, "approve", editing ? { title: editTitle, dueAt: editDue || undefined } : undefined);
    setLoading(false);
  };

  if (card.status !== "pending") {
    return (
      <div className="mt-2 px-3 py-2 border border-[var(--border)] bg-[var(--bg-tertiary)] text-xs font-mono text-[var(--text-muted)] flex items-center gap-2">
        {card.status === "approved" ? (
          <><span className="text-[var(--success)]">✓</span> Task added: &quot;{payload.title}&quot;{payload.dueAt ? ` — due ${new Date(payload.dueAt).toLocaleDateString()}` : ""}</>
        ) : card.status === "rejected" ? (
          <><span className="text-[var(--danger)]">✗</span> Task rejected.</>
        ) : (
          <><span className="text-[var(--text-muted)]">—</span> Dismissed.</>
        )}
      </div>
    );
  }

  return (
    <Card accent className="mt-2 p-3">
      <div className="flex items-center gap-2 mb-2">
        <span className="text-[var(--accent)] font-mono text-xs tracking-widest">◉ TASK PROPOSED</span>
        <Badge variant="accent">{confidencePct}%</Badge>
      </div>

      {editing ? (
        <div className="mb-2 flex flex-col gap-1.5">
          <input
            className="w-full bg-[var(--bg-primary)] border border-[var(--border)] text-[var(--text-primary)] text-sm font-mono px-2 py-1.5 focus:outline-none focus:border-[var(--accent)]"
            value={editTitle}
            onChange={(e) => setEditTitle(e.target.value)}
          />
          <input
            type="date"
            className="bg-[var(--bg-primary)] border border-[var(--border)] text-[var(--text-secondary)] text-xs font-mono px-2 py-1 focus:outline-none focus:border-[var(--accent)]"
            value={editDue}
            onChange={(e) => setEditDue(e.target.value)}
          />
        </div>
      ) : (
        <div className="mb-2">
          <p className="text-[var(--text-primary)] text-sm font-mono mb-1">&quot;{payload.title}&quot;</p>
          <div className="flex flex-wrap gap-1.5 text-xs text-[var(--text-muted)]">
            {payload.dueAt && <span>📅 {new Date(payload.dueAt).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })}</span>}
            {payload.person && <span>👤 {payload.person}</span>}
            {payload.tags?.map((t) => <Badge key={t} variant="default">#{t}</Badge>)}
            {payload.dueType && <Badge variant={payload.dueType === "hard" ? "danger" : "muted"}>{payload.dueType}</Badge>}
          </div>
        </div>
      )}

      <div className="flex gap-2 mt-3">
        <Button size="sm" variant="success" onClick={handleApprove} disabled={loading}>✓ Approve</Button>
        <Button size="sm" variant="ghost" onClick={() => setEditing(!editing)} disabled={loading}>✎ Edit</Button>
        <Button size="sm" variant="danger" onClick={() => onAction(card.id, "reject")} disabled={loading}>✗ Reject</Button>
      </div>
    </Card>
  );
}
