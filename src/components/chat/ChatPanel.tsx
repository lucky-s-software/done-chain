"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { MessageBubble } from "./MessageBubble";
import { ChatInput } from "./ChatInput";
import { QuickActions } from "./QuickActions";
import type { Message, ActionCard } from "@/types";

interface ChatPanelProps {
  onMemoriesCreated?: (count: number) => void;
}

export function ChatPanel({ onMemoriesCreated }: ChatPanelProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(false);
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [memoriesBanner, setMemoriesBanner] = useState<number>(0);
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
        onMemoriesCreated?.(data.memoriesCreated);
        setTimeout(() => setMemoriesBanner(0), 5000);
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
  }, [onMemoriesCreated]);

  const handleQuickAction = useCallback((text: string) => {
    handleSend(text);
  }, [handleSend]);

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

    // Update card status inline — no page reload
    setMessages((prev) =>
      prev.map((msg) => ({
        ...msg,
        actionCards: msg.actionCards.map((c: ActionCard) =>
          c.id === data.card?.id ? { ...c, status: data.card.status, resolvedAt: data.card.resolvedAt } : c
        ),
      }))
    );
  }, []);

  return (
    <div className="flex flex-col h-full">
      {/* Memory banner */}
      {memoriesBanner > 0 && (
        <div className="px-4 py-2 bg-[var(--info)]/10 border-b border-[var(--info)]/30 text-xs font-mono text-[var(--info)] flex items-center justify-between">
          <span>🧠 {memoriesBanner} {memoriesBanner === 1 ? "memory" : "memories"} created</span>
          <button onClick={() => setMemoriesBanner(0)} className="text-[var(--text-muted)] hover:text-[var(--text-primary)]">✕</button>
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

        {messages.map((msg) => (
          <MessageBubble
            key={msg.id}
            message={msg}
            onCardAction={handleCardAction}
          />
        ))}

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
