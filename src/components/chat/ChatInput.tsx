"use client";

import { useState, useRef, KeyboardEvent } from "react";

interface ChatInputProps {
  onSend: (content: string) => Promise<void>;
  disabled?: boolean;
}

export function ChatInput({ onSend, disabled }: ChatInputProps) {
  const [value, setValue] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const handleSend = async () => {
    const trimmed = value.trim();
    if (!trimmed || disabled) return;
    setValue("");
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
    }
    await onSend(trimmed);
  };

  const handleKey = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleInput = () => {
    const ta = textareaRef.current;
    if (!ta) return;
    ta.style.height = "auto";
    ta.style.height = Math.min(ta.scrollHeight, 160) + "px";
  };

  return (
    <div className="flex items-end gap-3 px-4 py-3 border-t border-[var(--border)] bg-[var(--bg-primary)]">
      <textarea
        ref={textareaRef}
        value={value}
        onChange={(e) => { setValue(e.target.value); handleInput(); }}
        onKeyDown={handleKey}
        disabled={disabled}
        placeholder="Dump your thoughts, commitments, reminders..."
        rows={1}
        className="flex-1 bg-[var(--bg-secondary)] border border-[var(--border)] text-[var(--text-primary)] text-sm placeholder:text-[var(--text-muted)] px-3 py-2.5 resize-none focus:outline-none focus:border-[var(--accent)] transition-colors duration-150 font-sans leading-relaxed disabled:opacity-50"
        style={{ minHeight: "44px" }}
      />
      <button
        onClick={handleSend}
        disabled={!value.trim() || disabled}
        className="shrink-0 w-10 h-10 flex items-center justify-center border border-[var(--border)] bg-[var(--bg-tertiary)] text-[var(--accent)] hover:bg-[var(--accent)] hover:text-black disabled:opacity-30 disabled:cursor-not-allowed transition-all duration-150 font-mono text-lg"
        aria-label="Send"
      >
        ↑
      </button>
    </div>
  );
}
