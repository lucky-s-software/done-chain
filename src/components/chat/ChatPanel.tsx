"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { MessageBubble } from "./MessageBubble";
import { DayDivider } from "./DayDivider";
import { ChatInput } from "./ChatInput";
import { QuickActions } from "./QuickActions";
import type { Message, ActionCard } from "@/types";

interface ChatPanelProps {
  onDataChange?: () => void;
}

export function ChatPanel({ onDataChange }: ChatPanelProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(false);
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [memoriesBanner, setMemoriesBanner] = useState<number>(0);
  const [selectedMessageId, setSelectedMessageId] = useState<string | null>(null);
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
      const data = await res.json();

      // Replace optimistic message + add real user msg + assistant msg
      setMessages((prev) => {
        const without = prev.filter((m) => m.id !== tempId);
        return [...without, data.message];
      });

      if (data.suggestedActions?.length) {
        setSuggestions(data.suggestedActions);
      }

      if (data.memoriesCreated > 0) {
        setMemoriesBanner(data.memoriesCreated);
        setTimeout(() => setMemoriesBanner(0), 5000);
      }

      if (data.memoriesCreated > 0 || data.message.actionCards?.length > 0) {
        onDataChange?.();
      }

      // Reload to get actual saved user message with correct id
      const histRes = await fetch("/api/messages?limit=50");
      const histData = await histRes.json();
      if (histData.messages) setMessages(histData.messages);
    } catch (err) {
      console.error("[chat send]", err);
      setMessages((prev) => prev.filter((m) => m.id !== tempId));
    } finally {
      setLoading(false);
    }
  }, [onDataChange]);

  const handleQuickAction = useCallback((text: string) => {
    if (text === "Summarize session") {
      setLoading(true);
      fetch("/api/summary", { method: "POST" })
        .then((r) => r.json())
        .then(async (data) => {
          const histRes = await fetch("/api/messages?limit=50");
          const histData = await histRes.json();
          if (histData.messages) {
            setMessages(histData.messages);
          } else if (data.message) {
            setMessages((prev) => [...prev, data.message]);
          }
          onDataChange?.();
        })
        .catch((err) => {
          console.error("[summary quick action]", err);
        })
        .finally(() => {
          setLoading(false);
        });
      return;
    }

    handleSend(text);
  }, [handleSend, onDataChange]);

  const handleCardAction = useCallback(async (
    cardId: string,
    action: "approve" | "reject" | "dismiss",
    edits?: { title?: string; dueAt?: string; tags?: string[] }
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
  }, []);

  const selectedIndex = selectedMessageId ? messages.findIndex((m) => m.id === selectedMessageId) : -1;
  const deleteCount = selectedIndex >= 0 ? selectedIndex + 1 : 0;

  const handleBulkDelete = useCallback(async () => {
    if (!selectedMessageId) return;
    setDeletingUpTo(true);
    try {
      await fetch("/api/messages/bulk-delete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ upToMessageId: selectedMessageId }),
      });
      const histRes = await fetch("/api/messages?limit=50");
      const histData = await histRes.json();
      if (histData.messages) setMessages(histData.messages);
      setSelectedMessageId(null);
      onDataChange?.();
    } catch (err) {
      console.error("[bulk delete]", err);
    } finally {
      setDeletingUpTo(false);
    }
  }, [selectedMessageId, onDataChange]);

  return (
    <div className="flex flex-col h-full">
      {/* Memory banner */}
      {memoriesBanner > 0 && (
        <div className="px-4 py-2 bg-[var(--info)]/10 border-b border-[var(--info)]/30 text-xs font-mono text-[var(--info)] flex items-center justify-between">
          <span>🧠 {memoriesBanner} {memoriesBanner === 1 ? "memory" : "memories"} created</span>
          <button onClick={() => setMemoriesBanner(0)} className="text-[var(--text-muted)] hover:text-[var(--text-primary)]">✕</button>
        </div>
      )}

      {/* Bulk delete confirmation bar */}
      {selectedMessageId && (
        <div className="px-4 py-2 bg-[var(--bg-tertiary)] border-b border-[var(--border)] text-xs font-mono flex items-center justify-between gap-3">
          <span className="text-[var(--text-muted)]">Delete {deleteCount} message{deleteCount !== 1 ? "s" : ""} up to this point?</span>
          <div className="flex gap-2">
            <button
              onClick={handleBulkDelete}
              disabled={deletingUpTo}
              className="text-red-500 hover:text-red-400 disabled:opacity-50"
            >
              {deletingUpTo ? "Deleting…" : "Confirm"}
            </button>
            <button onClick={() => setSelectedMessageId(null)} className="text-[var(--text-muted)] hover:text-[var(--text-primary)]">
              Cancel
            </button>
          </div>
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
        <ChatInput onSend={handleSend} disabled={loading} />
      </div>
    </div>
  );
}
