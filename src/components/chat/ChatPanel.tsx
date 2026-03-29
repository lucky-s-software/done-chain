"use client";

import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { MessageBubble } from "./MessageBubble";
import { DayDivider } from "./DayDivider";
import { ChatInput } from "./ChatInput";
import { QuickActions } from "./QuickActions";
import type { Message, ActionCard, SuggestedAction } from "@/types";

interface ChatPanelProps {
  onDataChange?: () => void;
}

export function ChatPanel({ onDataChange }: ChatPanelProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(false);
  const [composerValue, setComposerValue] = useState("");
  const [composerFocusSignal, setComposerFocusSignal] = useState(0);
  const [suggestions, setSuggestions] = useState<SuggestedAction[]>([]);
  const [memoriesBanner, setMemoriesBanner] = useState<number>(0);
  const [selectedMessageId, setSelectedMessageId] = useState<string | null>(null);
  const [selectionFlow, setSelectionFlow] = useState<"actions" | "confirm_delete">("actions");
  const [selectionFeedback, setSelectionFeedback] = useState<string | null>(null);
  const [deletingUpTo, setDeletingUpTo] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  // Load history on mount
  useEffect(() => {
    fetch("/api/messages?limit=50")
      .then((r) => r.json())
      .then((data) => {
        if (data.messages) setMessages(data.messages);
      })
      .catch(console.error);
  }, []);

  // Scroll to bottom whenever messages change
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const handleSend = useCallback(async (content: string) => {
    // Optimistic user message
    const tempId = `temp-${Date.now()}`;
    const optimisticMsg: Message = {
      id: tempId,
      role: "user",
      content,
      createdAt: new Date().toISOString(),
      expired: false,
      actionCards: [],
    };
    setMessages((prev) => [...prev, optimisticMsg]);
    setLoading(true);

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content }),
      });
      const data = await res.json().catch(() => ({}));
      const message = data?.message as Message | undefined;
      const memoriesCreated = typeof data?.memoriesCreated === "number" ? data.memoriesCreated : 0;

      if (!res.ok || !message) {
        throw new Error(data?.details || data?.error || "Failed to send message");
      }

      // Replace optimistic message + add real user msg + assistant msg
      setMessages((prev) => {
        const without = prev.filter((m) => m.id !== tempId);
        return [...without, message];
      });

      const normalizedSuggestions: SuggestedAction[] = Array.isArray(data.suggestedActions)
        ? data.suggestedActions
            .map((item: unknown): SuggestedAction | null => {
              if (typeof item === "string") {
                return {
                  text: item,
                  kind: item.includes("?") ? "question" : "action",
                };
              }

              if (!item || typeof item !== "object") return null;
              const candidate = item as {
                text?: unknown;
                kind?: unknown;
                estimatedMinutes?: unknown;
              };
              if (typeof candidate.text !== "string" || !candidate.text.trim()) return null;

              const normalized: SuggestedAction = {
                text: candidate.text.trim(),
                kind:
                  candidate.kind === "question" || candidate.kind === "action"
                    ? candidate.kind
                    : candidate.text.includes("?")
                    ? "question"
                    : "action",
              };

              if (
                normalized.kind === "action" &&
                typeof candidate.estimatedMinutes === "number" &&
                candidate.estimatedMinutes > 0
              ) {
                normalized.estimatedMinutes = Math.round(candidate.estimatedMinutes);
              }

              return normalized;
            })
            .filter((item: SuggestedAction | null): item is SuggestedAction => item !== null)
            .slice(0, 3)
        : [];

      setSuggestions(normalizedSuggestions);

      if (memoriesCreated > 0) {
        setMemoriesBanner(memoriesCreated);
        setTimeout(() => setMemoriesBanner(0), 5000);
      }

      if (memoriesCreated > 0 || (message.actionCards?.length ?? 0) > 0) {
        onDataChange?.();
      }

      // Reload to get actual saved user message with correct id
      const histRes = await fetch("/api/messages?limit=50");
      if (histRes.ok) {
        const histData = await histRes.json();
        if (histData.messages) setMessages(histData.messages);
      }
    } catch (err) {
      console.error("[chat send]", err);
      setMessages((prev) => prev.filter((m) => m.id !== tempId));
    } finally {
      setLoading(false);
    }
  }, [onDataChange]);

  const handleQuickAction = useCallback((text: string) => {
    setComposerValue((prev) => (prev.trim() ? `${prev}\n${text}` : text));
    setComposerFocusSignal((prev) => prev + 1);
  }, []);

  const handleCardAction = useCallback(async (
    cardId: string,
    action: "approve" | "reject" | "dismiss",
    edits?: {
      title?: string;
      dueAt?: string | null;
      tags?: string[];
      estimatedMinutes?: number | null;
      executionStartAt?: string | null;
    }
  ) => {
    const res = await fetch(`/api/cards/${cardId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action, edits }),
    });
    const data = await res.json();
    onDataChange?.();

    // Update card status inline — no page reload
    setMessages((prev) =>
      prev.map((msg) => ({
        ...msg,
        actionCards: msg.actionCards.map((c: ActionCard) =>
          c.id === data.card?.id ? { ...c, status: data.card.status, resolvedAt: data.card.resolvedAt } : c
        ),
      }))
    );
  }, [onDataChange]);

  const handleMessageClick = useCallback((messageId: string) => {
    setSelectedMessageId((prev) => (prev === messageId ? null : messageId));
    setSelectionFlow("actions");
    setSelectionFeedback(null);
  }, []);

  const selectedIndex = selectedMessageId ? messages.findIndex((m) => m.id === selectedMessageId) : -1;
  const selectedMessages = useMemo(
    () => (selectedIndex >= 0 ? messages.slice(selectedIndex) : []),
    [messages, selectedIndex]
  );
  const deleteCount = selectedMessages.length;

  const writeClipboard = useCallback(async (text: string, successMessage: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setSelectionFeedback(successMessage);
    } catch {
      const textarea = document.createElement("textarea");
      textarea.value = text;
      textarea.style.position = "fixed";
      textarea.style.left = "-9999px";
      document.body.appendChild(textarea);
      textarea.focus();
      textarea.select();
      const copied = document.execCommand("copy");
      document.body.removeChild(textarea);
      setSelectionFeedback(copied ? successMessage : "Copy failed.");
    }
  }, []);

  const handleCopySingle = useCallback(async () => {
    if (selectedIndex < 0) return;
    const selected = messages[selectedIndex];
    await writeClipboard(selected.content, "Copied selected message.");
  }, [messages, selectedIndex, writeClipboard]);

  const handleCopyStartingThis = useCallback(async () => {
    if (selectedMessages.length === 0) return;
    const transcript = selectedMessages
      .map((msg) => `${msg.role === "user" ? "You" : "Donechain"}: ${msg.content}`)
      .join("\n\n");
    await writeClipboard(transcript, `Copied ${selectedMessages.length} message${selectedMessages.length !== 1 ? "s" : ""}.`);
  }, [selectedMessages, writeClipboard]);

  const handleBulkDelete = useCallback(async () => {
    if (!selectedMessageId || deleteCount <= 0) return;
    setDeletingUpTo(true);
    try {
      await fetch("/api/messages/bulk-delete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fromMessageId: selectedMessageId, includeSelected: true }),
      });
      const histRes = await fetch("/api/messages?limit=50");
      const histData = await histRes.json();
      if (histData.messages) setMessages(histData.messages);
      setSelectedMessageId(null);
      setSelectionFlow("actions");
      setSelectionFeedback(null);
      onDataChange?.();
    } catch (err) {
      console.error("[bulk delete]", err);
    } finally {
      setDeletingUpTo(false);
    }
  }, [selectedMessageId, deleteCount, onDataChange]);

  const menuItemClass =
    "px-3.5 text-[11px] font-mono whitespace-nowrap transition-colors duration-150 disabled:opacity-50 disabled:cursor-not-allowed";

  return (
    <div className="flex flex-col h-full">
      {/* Memory banner */}
      {memoriesBanner > 0 && (
        <div className="px-4 py-2 bg-[var(--info)]/10 border-b border-[var(--info)]/30 text-xs font-mono text-[var(--info)] flex items-center justify-between">
          <span>🧠 {memoriesBanner} {memoriesBanner === 1 ? "memory" : "memories"} created</span>
          <button onClick={() => setMemoriesBanner(0)} className="text-[var(--text-muted)] hover:text-[var(--text-primary)]">✕</button>
        </div>
      )}

      {/* Selection actions bar */}
      {selectedMessageId && (
        <div className="px-4 bg-[var(--bg-tertiary)] border-b border-[var(--border)] text-xs font-mono flex items-stretch justify-between gap-3 min-h-10">
          <span className="text-[var(--text-muted)] flex items-center py-2">
            {selectionFlow === "confirm_delete"
              ? `${deleteCount} message${deleteCount !== 1 ? "s" : ""} will be deleted: confirm`
              : "Selected message actions"}
          </span>
          <div className="flex self-stretch divide-x divide-[var(--border)] border-x border-[var(--border)] bg-[var(--bg-secondary)]">
            {selectionFlow === "confirm_delete" ? (
              <>
                <button
                  onClick={handleBulkDelete}
                  disabled={deletingUpTo || deleteCount <= 0}
                  className={`${menuItemClass} text-[var(--danger)] bg-[var(--danger)]/12 hover:bg-[var(--danger)]/20`}
                >
                  {deletingUpTo ? "Deleting…" : "Confirm"}
                </button>
                <button
                  onClick={() => setSelectionFlow("actions")}
                  className={`${menuItemClass} text-[var(--accent)] bg-[var(--accent)]/12 hover:bg-[var(--accent)]/20`}
                >
                  Back
                </button>
                <button
                  onClick={() => setSelectedMessageId(null)}
                  className={`${menuItemClass} text-[var(--text-secondary)] bg-[var(--bg-primary)] hover:text-[var(--text-primary)]`}
                >
                  Cancel
                </button>
              </>
            ) : (
              <>
                <button
                  onClick={handleCopySingle}
                  className={`${menuItemClass} text-[var(--info)] bg-[var(--info)]/12 hover:bg-[var(--info)]/20`}
                >
                  Copy
                </button>
                <button
                  onClick={handleCopyStartingThis}
                  disabled={deleteCount <= 0}
                  className={`${menuItemClass} text-[var(--accent)] bg-[var(--accent)]/12 hover:bg-[var(--accent)]/20`}
                >
                  Copy starting this
                </button>
                <button
                  onClick={() => setSelectionFlow("confirm_delete")}
                  disabled={deleteCount <= 0}
                  className={`${menuItemClass} text-[var(--danger)] bg-[var(--danger)]/12 hover:bg-[var(--danger)]/20`}
                >
                  Delete starting this
                </button>
                <button
                  onClick={() => setSelectedMessageId(null)}
                  className={`${menuItemClass} text-[var(--text-secondary)] bg-[var(--bg-primary)] hover:text-[var(--text-primary)]`}
                >
                  Cancel
                </button>
              </>
            )}
          </div>
        </div>
      )}
      {selectedMessageId && selectionFeedback && (
        <div className="px-4 py-1 bg-[var(--bg-tertiary)] border-b border-[var(--border)] text-[10px] font-mono text-[var(--info)]">
          {selectionFeedback}
        </div>
      )}

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-4 py-4">
        {messages.length === 0 && !loading && (
          <div className="h-full flex flex-col items-center justify-center text-[var(--text-muted)]">
            <p className="font-mono text-4xl mb-3 text-[var(--accent)]">⬡</p>
            <p className="font-mono text-sm">DONECHAIN</p>
            <p className="text-xs mt-1">Dump your thoughts. I&apos;ll extract the commitments.</p>
          </div>
        )}

        {messages.map((msg, idx) => {
          const prevMsg = messages[idx - 1];
          const msgDate = new Date(msg.createdAt);
          const prevDate = prevMsg ? new Date(prevMsg.createdAt) : null;
          const showDivider =
            !prevDate ||
            prevDate.getFullYear() !== msgDate.getFullYear() ||
            prevDate.getMonth() !== msgDate.getMonth() ||
            prevDate.getDate() !== msgDate.getDate();

          return (
            <div key={msg.id}>
              {showDivider && <DayDivider date={msgDate} />}
              <MessageBubble
                message={msg}
                selected={msg.id === selectedMessageId}
                onCardAction={handleCardAction}
                onClick={handleMessageClick}
              />
            </div>
          );
        })}

        {loading && (
          <div className="flex items-start mb-4">
            <div className="flex gap-1 px-3 py-2.5">
              <span className="w-1.5 h-1.5 rounded-full bg-[var(--accent)] animate-bounce" style={{ animationDelay: "0ms" }} />
              <span className="w-1.5 h-1.5 rounded-full bg-[var(--accent)] animate-bounce" style={{ animationDelay: "150ms" }} />
              <span className="w-1.5 h-1.5 rounded-full bg-[var(--accent)] animate-bounce" style={{ animationDelay: "300ms" }} />
            </div>
          </div>
        )}

        <div ref={bottomRef} />
      </div>

      {/* Quick actions + input */}
      <div className="shrink-0">
        <QuickActions suggestions={suggestions} onSelect={handleQuickAction} />
        <ChatInput
          value={composerValue}
          onValueChange={setComposerValue}
          onSend={handleSend}
          disabled={loading}
          focusSignal={composerFocusSignal}
        />
      </div>
    </div>
  );
}
