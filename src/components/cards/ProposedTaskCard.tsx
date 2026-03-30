"use client";

import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Card } from "@/components/ui/Card";
import { MAX_TAGS, normalizeTags } from "@/lib/tags";
import {
  formatDateInTimeZone,
  formatTimeInTimeZone,
  getDatePartsInTimeZone,
  zonedDateTimeToUtc,
} from "@/lib/timezone";
import type { ActionCard } from "@/types";

interface ProposedTaskCardProps {
  card: ActionCard;
  timezone: string;
  onAction: (
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
}

function toTimeZoneDateTimeInput(value: string | null | undefined, timezone: string): string {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const parts = getDatePartsInTimeZone(date, timezone);
  const pad = (n: number) => String(n).padStart(2, "0");
  const year = parts.year;
  const month = pad(parts.month);
  const day = pad(parts.day);
  const hour = pad(parts.hour);
  const minute = pad(parts.minute);
  return `${year}-${month}-${day}T${hour}:${minute}`;
}

function toUtcIsoFromDateTimeInput(value: string, timezone: string): string | null {
  if (!value) return null;
  const [dateKey, time] = value.split("T");
  if (!dateKey || !time) return null;
  return zonedDateTimeToUtc(dateKey, time.slice(0, 5), timezone).toISOString();
}

export function ProposedTaskCard({ card, onAction, timezone }: ProposedTaskCardProps) {
  const payload = card.payload as {
    title: string;
    content?: string;
    dueAt?: string | null;
    executionStartAt?: string | null;
    estimatedMinutes?: number | null;
    dueType?: string;
    tags?: string[];
    person?: string;
    confidence?: number;
    proposalMode?: "create" | "update";
    existingTaskTitle?: string;
    proposedEdits?: {
      title?: string;
      dueAt?: string | null;
      tags?: string[];
      estimatedMinutes?: number | null;
      executionStartAt?: string | null;
      personId?: string | null;
      projectId?: string | null;
    };
  };
  const isUpdateProposal = payload.proposalMode === "update";

  const [loading, setLoading] = useState(false);
  const [editing, setEditing] = useState(false);
  const [editTitle, setEditTitle] = useState(payload.title);
  const [editExecutionStart, setEditExecutionStart] = useState(
    toTimeZoneDateTimeInput(payload.executionStartAt, timezone)
  );
  const [editEstimated, setEditEstimated] = useState(
    typeof payload.estimatedMinutes === "number" && payload.estimatedMinutes > 0
      ? String(payload.estimatedMinutes)
      : ""
  );
  const [editTags, setEditTags] = useState<string[]>(() => normalizeTags(payload.tags ?? []));
  const [tagInput, setTagInput] = useState("");
  const [tagError, setTagError] = useState<string | null>(null);
  const [extractingTags, setExtractingTags] = useState(false);
  const [editingTagIndex, setEditingTagIndex] = useState<number | null>(null);
  const [editingTagValue, setEditingTagValue] = useState("");

  const confidencePct = Math.round((payload.confidence ?? 0.5) * 100);
  const originalTags = normalizeTags(payload.tags ?? []);
  const hasTagChanges = originalTags.join("|") !== normalizeTags(editTags).join("|");

  const addTag = (rawValue: string) => {
    const next = normalizeTags([...editTags, rawValue]);
    if (next.length === editTags.length) {
      if (editTags.length >= MAX_TAGS) {
        setTagError(`Maximum ${MAX_TAGS} tags.`);
      }
      return;
    }
    setTagError(null);
    setEditTags(next);
    setTagInput("");
  };

  const removeTag = (index: number) => {
    setTagError(null);
    setEditTags((prev) => prev.filter((_, i) => i !== index));
    if (editingTagIndex === index) {
      setEditingTagIndex(null);
      setEditingTagValue("");
    } else if (editingTagIndex !== null && editingTagIndex > index) {
      setEditingTagIndex(editingTagIndex - 1);
    }
  };

  const startInlineTagEdit = (index: number) => {
    setTagError(null);
    setEditingTagIndex(index);
    setEditingTagValue(editTags[index]);
  };

  const saveInlineTagEdit = () => {
    if (editingTagIndex === null) return;
    const nextWithoutCurrent = editTags.filter((_, i) => i !== editingTagIndex);
    const nextDraft = [...nextWithoutCurrent];
    nextDraft.splice(editingTagIndex, 0, editingTagValue);
    const next = normalizeTags(nextDraft);
    setEditTags(next);
    setEditingTagIndex(null);
    setEditingTagValue("");
  };

  const extractTags = async () => {
    setExtractingTags(true);
    setTagError(null);
    try {
      const res = await fetch("/api/tags/extract", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: editTitle || payload.title,
          content: payload.content || payload.title,
          existingTags: editTags,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Failed to extract tags");
      }

      const next = normalizeTags(Array.isArray(data.tags) ? data.tags : []);
      if (next.length === 0) {
        setTagError("No semantic tags found for this task.");
        return;
      }

      setEditTags(next);
    } catch (err) {
      console.error("[task tags extract]", err);
      setTagError("AI tag extraction failed. You can still edit tags manually.");
    } finally {
      setExtractingTags(false);
    }
  };

  const handleApprove = async () => {
    try {
      setLoading(true);
      const edits: {
        title?: string;
        dueAt?: string | null;
        tags?: string[];
        estimatedMinutes?: number | null;
        executionStartAt?: string | null;
      } = {};

      if (editing) {
        const trimmedTitle = editTitle.trim();
        if (trimmedTitle && trimmedTitle !== payload.title) {
          edits.title = trimmedTitle;
        }

        const originalExecutionStart = toTimeZoneDateTimeInput(payload.executionStartAt, timezone);
        if (editExecutionStart !== originalExecutionStart) {
          edits.executionStartAt = toUtcIsoFromDateTimeInput(editExecutionStart, timezone);
        }

        const originalEstimate =
          typeof payload.estimatedMinutes === "number" && payload.estimatedMinutes > 0
            ? String(payload.estimatedMinutes)
            : "";
        if (editEstimated !== originalEstimate) {
          const parsed = Number.parseInt(editEstimated, 10);
          edits.estimatedMinutes =
            Number.isFinite(parsed) && parsed > 0 ? Math.max(1, parsed) : null;
        }
      }

      if (hasTagChanges) {
        edits.tags = normalizeTags(editTags);
      }

      await onAction(card.id, "approve", Object.keys(edits).length > 0 ? edits : undefined);
    } finally {
      setLoading(false);
    }
  };

  if (card.status !== "pending") {
    return (
      <div className="mt-2 px-3 py-2 border border-[var(--border)] bg-[var(--bg-tertiary)] text-xs font-mono text-[var(--text-muted)] flex items-center gap-2">
        {card.status === "approved" ? (
          <>
            <span className="text-[var(--success)]">✓</span>
            {isUpdateProposal ? "Task updated" : "Task added"}: &quot;{payload.title}&quot;
          </>
        ) : card.status === "rejected" ? (
          <>
            <span className="text-[var(--danger)]">✗</span>
            {isUpdateProposal ? "Task update rejected." : "Task rejected."}
          </>
        ) : (
          <><span className="text-[var(--text-muted)]">—</span> Dismissed.</>
        )}
      </div>
    );
  }

  return (
    <div onClick={(event) => event.stopPropagation()}>
      <Card accent className="mt-2 p-3">
      <div className="flex items-center gap-2 mb-2">
        <span className="text-[var(--accent)] font-mono text-xs tracking-widest">
          {isUpdateProposal ? "◉ TASK UPDATE PROPOSED" : "◉ TASK PROPOSED"}
        </span>
        <Badge variant="accent">{confidencePct}%</Badge>
      </div>
      {isUpdateProposal && payload.existingTaskTitle && (
        <p className="mb-2 text-[10px] font-mono text-[var(--text-muted)]">
          updating existing task: &quot;{payload.existingTaskTitle}&quot;
        </p>
      )}

      {editing ? (
        <div className="mb-2 flex flex-col gap-1.5">
          <input
            className="w-full bg-[var(--bg-primary)] border border-[var(--border)] text-[var(--text-primary)] text-sm font-mono px-2 py-1.5 focus:outline-none focus:border-[var(--accent)]"
            value={editTitle}
            onChange={(e) => setEditTitle(e.target.value)}
          />
          <input
            type="datetime-local"
            className="bg-[var(--bg-primary)] border border-[var(--border)] text-[var(--text-secondary)] text-xs font-mono px-2 py-1 focus:outline-none focus:border-[var(--accent)]"
            value={editExecutionStart}
            onChange={(e) => setEditExecutionStart(e.target.value)}
          />
          <input
            type="number"
            min={1}
            step={1}
            inputMode="numeric"
            className="bg-[var(--bg-primary)] border border-[var(--border)] text-[var(--text-secondary)] text-xs font-mono px-2 py-1 focus:outline-none focus:border-[var(--accent)]"
            placeholder="Estimated minutes (optional)"
            value={editEstimated}
            onChange={(e) => setEditEstimated(e.target.value)}
          />
        </div>
      ) : (
        <div className="mb-2">
          <p className="text-[var(--text-primary)] text-sm font-mono mb-1">&quot;{payload.title}&quot;</p>
          {payload.content &&
            payload.content.trim() &&
            payload.content.trim().toLowerCase() !== payload.title.trim().toLowerCase() && (
              <p className="text-xs text-[var(--text-secondary)] mb-1.5 leading-relaxed">
                {payload.content}
              </p>
            )}
          <div className="flex flex-wrap gap-1.5 text-xs text-[var(--text-muted)]">
            {payload.executionStartAt && (
              <span>
                ⏱{" "}
                {formatDateInTimeZone(new Date(payload.executionStartAt), timezone, {
                  month: "short",
                  day: "numeric",
                })}{" "}
                {formatTimeInTimeZone(new Date(payload.executionStartAt), timezone)}
              </span>
            )}
            {typeof payload.estimatedMinutes === "number" && payload.estimatedMinutes > 0 && (
              <span>≈ {payload.estimatedMinutes}m</span>
            )}
            {payload.person && <span>👤 {payload.person}</span>}
          </div>
        </div>
      )}

      <div className="mb-2">
        <div className="flex items-center justify-between mb-1">
          <span className="text-[10px] uppercase tracking-widest font-mono text-[var(--text-muted)]">Tags</span>
          <button
            type="button"
            onClick={extractTags}
            disabled={loading || extractingTags}
            className="text-[10px] font-mono text-[var(--accent)] hover:opacity-80 disabled:opacity-50"
          >
            {extractingTags ? "AI tagging…" : "AI tags"}
          </button>
        </div>

        <div className="flex flex-wrap gap-1.5 items-center">
          {editTags.map((tag, index) =>
            editingTagIndex === index ? (
              <input
                key={`editing-${tag}-${index}`}
                autoFocus
                className="min-w-[110px] bg-[var(--bg-primary)] border border-[var(--accent)] text-[var(--text-primary)] text-xs font-mono px-1.5 py-0.5 focus:outline-none"
                value={editingTagValue}
                onChange={(e) => setEditingTagValue(e.target.value)}
                onBlur={saveInlineTagEdit}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    saveInlineTagEdit();
                  } else if (e.key === "Escape") {
                    setEditingTagIndex(null);
                    setEditingTagValue("");
                  }
                }}
              />
            ) : (
              <Badge key={`${tag}-${index}`} variant="default" className="pr-0.5">
                <button
                  type="button"
                  onClick={() => startInlineTagEdit(index)}
                  className="hover:text-[var(--text-primary)]"
                  title="Edit tag"
                >
                  #{tag}
                </button>
                <button
                  type="button"
                  onClick={() => removeTag(index)}
                  className="ml-0.5 text-[var(--text-muted)] hover:text-[var(--danger)]"
                  title="Remove tag"
                  aria-label={`Remove tag ${tag}`}
                >
                  ✕
                </button>
              </Badge>
            )
          )}

          {editTags.length < MAX_TAGS && (
            <input
              className="min-w-[140px] bg-[var(--bg-primary)] border border-[var(--border)] text-[var(--text-secondary)] text-xs font-mono px-2 py-1 focus:outline-none focus:border-[var(--accent)]"
              value={tagInput}
              onChange={(e) => {
                setTagError(null);
                setTagInput(e.target.value);
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === ",") {
                  e.preventDefault();
                  addTag(tagInput);
                } else if (e.key === "Backspace" && tagInput === "" && editTags.length > 0) {
                  removeTag(editTags.length - 1);
                }
              }}
              placeholder={editTags.length === 0 ? "Add tag…" : "+ add tag"}
            />
          )}
        </div>

        <p className="mt-1 text-[10px] font-mono text-[var(--text-muted)]">
          {editTags.length}/{MAX_TAGS} tags
        </p>
        {tagError && <p className="mt-1 text-[10px] font-mono text-[var(--danger)]">{tagError}</p>}
      </div>

      <div className="flex gap-2 mt-3">
        <Button size="sm" variant="success" onClick={handleApprove} disabled={loading}>
          {isUpdateProposal ? "✓ Apply update" : "✓ Approve"}
        </Button>
        <Button size="sm" variant="ghost" onClick={() => setEditing(!editing)} disabled={loading}>✎ Edit</Button>
        <Button size="sm" variant="danger" onClick={() => onAction(card.id, "reject")} disabled={loading}>
          {isUpdateProposal ? "✗ Reject update" : "✗ Reject"}
        </Button>
      </div>
      </Card>
    </div>
  );
}
