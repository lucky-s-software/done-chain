"use client";

import { useState } from "react";

interface QuickActionsProps {
  suggestions: string[];
  onSelect: (text: string) => void;
}

const STATIC_DEFAULTS = [
  "What is the highest-leverage next step for this right now?",
  "Commit to one concrete action in the next 30 minutes.",
  "Define the success signal you'll check by tonight.",
];

export function QuickActions({ suggestions, onSelect }: QuickActionsProps) {
  const [collapsed, setCollapsed] = useState(false);
  const chips = suggestions.length > 0 ? suggestions : STATIC_DEFAULTS;

  return (
    <div className="px-4 pt-2 pb-1 bg-[var(--bg-primary)]">
      <div className="flex items-center justify-between mb-2">
        <p className="text-[10px] font-mono uppercase tracking-widest text-[var(--text-muted)]">
          Recommended Prompts
        </p>
        <button
          type="button"
          onClick={() => setCollapsed((prev) => !prev)}
          className="text-[10px] font-mono text-[var(--text-muted)] hover:text-[var(--accent)] transition-colors"
          aria-label={collapsed ? "Expand recommended prompts" : "Collapse recommended prompts"}
          title={collapsed ? "Expand" : "Collapse"}
        >
          {collapsed ? "▸" : "▾"}
        </button>
      </div>

      {!collapsed && (
        <div className="flex flex-wrap gap-2">
          {chips.slice(0, 3).map((s) => (
            <button
              key={s}
              onClick={() => onSelect(s)}
              className="px-2.5 py-1 text-xs font-mono text-[var(--text-muted)] border border-[var(--border)] bg-[var(--bg-tertiary)] hover:text-[var(--accent)] hover:border-[var(--accent)] transition-colors duration-150"
            >
              {s}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
