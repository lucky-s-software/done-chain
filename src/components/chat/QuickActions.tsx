"use client";

interface QuickActionsProps {
  suggestions: string[];
  onSelect: (text: string) => void;
}

const STATIC_DEFAULTS = [
  "Add a reminder",
  "Take a note",
  "What's due today?",
  "Summarize session",
];

export function QuickActions({ suggestions, onSelect }: QuickActionsProps) {
  const chips = suggestions.length > 0 ? suggestions : STATIC_DEFAULTS;

  return (
    <div className="flex flex-wrap gap-2 px-4 py-2 border-t border-[var(--border)]">
      {chips.slice(0, 4).map((s) => (
        <button
          key={s}
          onClick={() => onSelect(s)}
          className="px-2.5 py-1 text-xs font-mono text-[var(--text-muted)] border border-[var(--border)] bg-[var(--bg-tertiary)] hover:text-[var(--accent)] hover:border-[var(--accent)] transition-colors duration-150"
        >
          {s}
        </button>
      ))}
    </div>
  );
}
