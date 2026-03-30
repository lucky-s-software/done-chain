"use client";

import { useEffect, useState } from "react";
import type { ConversationSummaryRecord, Entry } from "@/types";
import { formatDateInTimeZone } from "@/lib/timezone";
import { Modal } from "@/components/ui/Modal";

interface MemorySectionProps {
  timezone: string;
}

export function MemorySection({ timezone }: MemorySectionProps) {
  const [entries, setEntries] = useState<Entry[]>([]);
  const [summaries, setSummaries] = useState<ConversationSummaryRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedEntryId, setExpandedEntryId] = useState<string | null>(null);
  const [editingEntryId, setEditingEntryId] = useState<string | null>(null);
  const [editContent, setEditContent] = useState("");
  const [editTags, setEditTags] = useState("");
  const [busyEntryId, setBusyEntryId] = useState<string | null>(null);
  const [deleteEntryId, setDeleteEntryId] = useState<string | null>(null);
  const [activeSummary, setActiveSummary] = useState<ConversationSummaryRecord | null>(null);

  const truncate = (text: string, max = 96) =>
    text.length > max ? `${text.slice(0, max).trimEnd()}...` : text;

  const load = async () => {
    setLoading(true);
    try {
      const [entriesRes, summariesRes] = await Promise.all([
        fetch("/api/entries?limit=100"),
        fetch("/api/summaries?limit=3"),
      ]);

      const entriesData = await entriesRes.json().catch(() => ({}));
      const summariesData = await summariesRes.json().catch(() => ({}));

      setEntries(Array.isArray(entriesData.entries) ? entriesData.entries : []);
      setSummaries(Array.isArray(summariesData.summaries) ? summariesData.summaries : []);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const startEditing = (entry: Entry) => {
    setEditingEntryId(entry.id);
    setDeleteEntryId(null);
    setEditContent(entry.content);
    setEditTags(entry.tags.join(", "));
  };

  const saveMemory = async (entryId: string) => {
    const trimmed = editContent.trim();
    if (!trimmed) return;

    setBusyEntryId(entryId);
    try {
      const tags = editTags
        .split(",")
        .map((tag) => tag.trim())
        .filter(Boolean);

      const res = await fetch(`/api/entries/${entryId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: trimmed, tags }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data?.entry) {
        throw new Error(data?.error ?? "Failed to update memory");
      }

      setEntries((prev) => prev.map((entry) => (entry.id === entryId ? data.entry : entry)));
      setEditingEntryId(null);
    } catch (err) {
      console.error("[memory save]", err);
    } finally {
      setBusyEntryId(null);
    }
  };

  const removeMemory = async (entryId: string) => {
    setBusyEntryId(entryId);
    try {
      const res = await fetch(`/api/entries/${entryId}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Failed to delete memory");

      setEntries((prev) => prev.filter((entry) => entry.id !== entryId));
      setDeleteEntryId(null);
      if (expandedEntryId === entryId) setExpandedEntryId(null);
      if (editingEntryId === entryId) setEditingEntryId(null);
    } catch (err) {
      console.error("[memory delete]", err);
    } finally {
      setBusyEntryId(null);
    }
  };

  if (loading) {
    return <div className="px-4 py-2 text-xs font-mono text-[var(--text-muted)]">loading memories...</div>;
  }

  return (
    <div className="space-y-5">
      <section>
        <div className="px-4 py-2 border-b border-[var(--border)]">
          <span className="font-mono text-xs tracking-widest text-[var(--text-muted)] uppercase">Daily Summaries</span>
          <span className="ml-2 text-xs font-mono text-[var(--text-muted)]">{summaries.length}</span>
        </div>
        {summaries.length === 0 ? (
          <div className="px-4 py-3 text-xs text-[var(--text-muted)] font-mono">— no summaries yet</div>
        ) : (
          <ul className="divide-y divide-[var(--border)]">
            {summaries.map((summary) => (
              <li key={summary.id} className="px-4 py-2.5 hover:bg-[var(--bg-tertiary)]/20 transition-colors">
                <button
                  type="button"
                  onClick={() => setActiveSummary(summary)}
                  className="w-full text-left"
                >
                  <p className="text-[10px] font-mono text-[var(--accent)] tracking-wide uppercase">
                    {formatDateInTimeZone(new Date(summary.periodEnd), timezone)}
                  </p>
                  <p className="text-xs text-[var(--text-secondary)] mt-1">
                    {truncate(summary.summary, 130)}
                  </p>
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section>
        <div className="px-4 py-2 border-y border-[var(--border)]">
          <span className="font-mono text-xs tracking-widest text-[var(--text-muted)] uppercase">Memories</span>
          <span className="ml-2 text-xs font-mono text-[var(--text-muted)]">{entries.length}</span>
        </div>

        {entries.length === 0 ? (
          <div className="px-4 py-3 text-xs text-[var(--text-muted)] font-mono">— no memories stored</div>
        ) : (
          <ul className="divide-y divide-[var(--border)]">
            {entries.map((entry) => {
              const expanded = expandedEntryId === entry.id;
              const editing = editingEntryId === entry.id;
              const busy = busyEntryId === entry.id;

              return (
                <li key={entry.id} className="hover:bg-[var(--bg-tertiary)]/20 transition-colors">
                  <button
                    type="button"
                    onClick={() => {
                      setExpandedEntryId((prev) => (prev === entry.id ? null : entry.id));
                      setDeleteEntryId(null);
                      if (editingEntryId && editingEntryId !== entry.id) {
                        setEditingEntryId(null);
                      }
                    }}
                    className="w-full px-4 py-2.5 flex items-center gap-2 text-left"
                  >
                    <span className="text-[10px] font-mono text-[var(--info)] uppercase tracking-wide">Memory Recorded</span>
                    <span className="text-xs text-[var(--text-secondary)] truncate">
                      {truncate(entry.content, 72)}
                    </span>
                    <span className="ml-auto text-[10px] font-mono text-[var(--text-muted)]">
                      {expanded ? "▾" : "▸"}
                    </span>
                  </button>

                  {expanded && (
                    <div className="px-4 pb-3 space-y-2.5">
                      {editing ? (
                        <>
                          <textarea
                            value={editContent}
                            onChange={(event) => setEditContent(event.target.value)}
                            rows={3}
                            className="w-full bg-[var(--bg-primary)] border border-[var(--border)] text-sm text-[var(--text-primary)] px-2 py-1.5 focus:outline-none focus:border-[var(--accent)]"
                          />
                          <input
                            type="text"
                            value={editTags}
                            onChange={(event) => setEditTags(event.target.value)}
                            placeholder="tags, comma, separated"
                            className="w-full bg-[var(--bg-primary)] border border-[var(--border)] text-xs font-mono text-[var(--text-secondary)] px-2 py-1.5 focus:outline-none focus:border-[var(--accent)]"
                          />
                          <div className="flex items-center gap-1.5">
                            <button
                              type="button"
                              onClick={() => saveMemory(entry.id)}
                              disabled={busy || !editContent.trim()}
                              className="px-2 py-1 border border-[var(--accent)] text-[10px] font-mono text-[var(--accent)] hover:bg-[var(--accent)]/10 disabled:opacity-50"
                            >
                              {busy ? "Saving..." : "Save"}
                            </button>
                            <button
                              type="button"
                              onClick={() => setEditingEntryId(null)}
                              disabled={busy}
                              className="px-2 py-1 border border-[var(--border)] text-[10px] font-mono text-[var(--text-muted)]"
                            >
                              Cancel
                            </button>
                          </div>
                        </>
                      ) : (
                        <>
                          <p className="text-sm text-[var(--text-primary)]">{entry.content}</p>
                          <div className="flex items-center gap-2">
                            <span className="text-[10px] font-mono text-[var(--text-muted)]">
                              {formatDateInTimeZone(new Date(entry.createdAt), timezone)}
                            </span>
                            {entry.tags.length > 0 && (
                              <div className="flex gap-1 ml-auto">
                                {entry.tags.map((tag) => (
                                  <span key={tag} className="text-[10px] font-mono text-[var(--text-muted)] border border-[var(--border)] px-1">
                                    #{tag}
                                  </span>
                                ))}
                              </div>
                            )}
                          </div>
                          <div className="flex items-center gap-1.5">
                            <button
                              type="button"
                              onClick={() => startEditing(entry)}
                              disabled={busy}
                              className="px-2 py-1 border border-[var(--border)] text-[10px] font-mono text-[var(--text-muted)] hover:text-[var(--text-primary)]"
                            >
                              Edit
                            </button>
                            <button
                              type="button"
                              onClick={() => setDeleteEntryId(entry.id)}
                              disabled={busy}
                              className="px-2 py-1 border border-[var(--danger)] text-[10px] font-mono text-[var(--danger)] hover:bg-[var(--danger)]/10"
                            >
                              Delete
                            </button>
                          </div>
                        </>
                      )}

                      {deleteEntryId === entry.id && (
                        <div className="flex items-center gap-1.5 text-[10px] font-mono">
                          <span className="text-[var(--danger)]">Delete this memory?</span>
                          <button
                            type="button"
                            onClick={() => removeMemory(entry.id)}
                            disabled={busy}
                            className="px-2 py-1 border border-[var(--danger)] text-[var(--danger)] hover:bg-[var(--danger)]/10 disabled:opacity-50"
                          >
                            {busy ? "Deleting..." : "Confirm"}
                          </button>
                          <button
                            type="button"
                            onClick={() => setDeleteEntryId(null)}
                            disabled={busy}
                            className="px-2 py-1 border border-[var(--border)] text-[var(--text-muted)]"
                          >
                            Cancel
                          </button>
                        </div>
                      )}
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {activeSummary && (
        <Modal
          open={Boolean(activeSummary)}
          onClose={() => setActiveSummary(null)}
          title={`Summary - ${formatDateInTimeZone(new Date(activeSummary.periodEnd), timezone)}`}
        >
          <p className="text-xs font-mono text-[var(--text-muted)] mb-3">
            {formatDateInTimeZone(new Date(activeSummary.periodStart), timezone)} →{" "}
            {formatDateInTimeZone(new Date(activeSummary.periodEnd), timezone)}
          </p>
          <p>{activeSummary.summary}</p>
          {activeSummary.tags.length > 0 && (
            <div className="flex flex-wrap gap-1.5 mt-4">
              {activeSummary.tags.map((tag) => (
                <span key={tag} className="text-[10px] font-mono text-[var(--text-muted)] border border-[var(--border)] px-1.5 py-0.5">
                  #{tag}
                </span>
              ))}
            </div>
          )}
        </Modal>
      )}
    </div>
  );
}
