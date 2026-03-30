"use client";

import { useRef, KeyboardEvent, useEffect, useState } from "react";

interface ChatInputProps {
  value: string;
  onValueChange: (value: string) => void;
  onSend: (content: string, options: { thinkingMode: boolean }) => Promise<void>;
  disabled?: boolean;
  focusSignal?: number;
}

export function ChatInput({ value, onValueChange, onSend, disabled, focusSignal = 0 }: ChatInputProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const MAX_VISIBLE_LINES = 4;
  const [thinkingMode, setThinkingMode] = useState(false);

  const resizeTextarea = () => {
    const ta = textareaRef.current;
    if (!ta) return;

    ta.style.height = "auto";
    const computed = window.getComputedStyle(ta);
    const lineHeight = Number.parseFloat(computed.lineHeight) || 22;
    const paddingTop = Number.parseFloat(computed.paddingTop) || 0;
    const paddingBottom = Number.parseFloat(computed.paddingBottom) || 0;
    const borderTop = Number.parseFloat(computed.borderTopWidth) || 0;
    const borderBottom = Number.parseFloat(computed.borderBottomWidth) || 0;

    const maxHeight = Math.ceil(
      lineHeight * MAX_VISIBLE_LINES + paddingTop + paddingBottom + borderTop + borderBottom
    );
    const nextHeight = Math.min(ta.scrollHeight, maxHeight);

    ta.style.height = `${nextHeight}px`;
    ta.style.overflowY = ta.scrollHeight > maxHeight ? "auto" : "hidden";
  };

  useEffect(() => {
    resizeTextarea();
  }, [value]);

  useEffect(() => {
    const ta = textareaRef.current;
    if (!ta || disabled) return;
    ta.focus();
    try {
      const end = ta.value.length;
      ta.setSelectionRange(end, end);
    } catch {
      // Some environments may block selection updates on focus; focus is enough.
    }
  }, [focusSignal, disabled]);

  const handleSend = async () => {
    const trimmed = value.trim();
    if (!trimmed || disabled) return;
    const useThinkingMode = thinkingMode;
    onValueChange("");
    setThinkingMode(false);
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
    }
    await onSend(trimmed, { thinkingMode: useThinkingMode });
  };

  const handleKey = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey && !disabled) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div className="flex items-end gap-3 px-4 py-3 border-t border-[var(--border)] bg-[var(--bg-primary)]">
      <textarea
        ref={textareaRef}
        value={value}
        onChange={(e) => {
          onValueChange(e.target.value);
          resizeTextarea();
        }}
        onKeyDown={handleKey}
        placeholder="Dump your thoughts, commitments, reminders..."
        rows={1}
        className="flex-1 bg-[var(--bg-secondary)] border border-[var(--border)] text-[var(--text-primary)] text-sm placeholder:text-[var(--text-muted)] px-3 py-2.5 resize-none focus:outline-none focus:border-[var(--accent)] transition-colors duration-150 font-sans leading-relaxed disabled:opacity-50"
        style={{ minHeight: "44px" }}
      />
      <button
        type="button"
        onClick={() => setThinkingMode((prev) => !prev)}
        disabled={disabled}
        className={`shrink-0 h-10 px-2.5 border text-[10px] font-mono tracking-wide transition-all duration-150 ${
          thinkingMode
            ? "border-[var(--accent)] bg-[var(--accent)]/20 text-[var(--accent)]"
            : "border-[var(--border)] bg-[var(--bg-tertiary)] text-[var(--text-muted)] hover:text-[var(--text-primary)]"
        } disabled:opacity-30 disabled:cursor-not-allowed`}
        aria-pressed={thinkingMode}
        aria-label="Toggle thinking mode for this message"
        title="Use DeepSeek thinking mode for this message only"
      >
        THINK
      </button>
      <button
        type="button"
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
