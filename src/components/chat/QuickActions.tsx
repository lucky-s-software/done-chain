"use client";

import { useState } from "react";
import type { SuggestedAction } from "@/types";

interface QuickActionsProps {
  suggestions: SuggestedAction[];
  onSelect: (text: string) => void;
}

const STATIC_DEFAULTS: SuggestedAction[] = [
  { text: "Can you give me a quick view of my current commitments and biggest pain points right now?", kind: "question" },
  { text: "I am planning to ... in my next focus window. Help me expand this into realistic first steps.", kind: "action" },
  { text: "I may be late on ... (or it is already overdue). Help me triage what to do now, defer, or renegotiate.", kind: "action" },
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
              key={`${s.kind}-${s.text}`}
              type="button"
              onClick={() => onSelect(s.text)}
              className="px-2.5 py-1 text-xs font-mono text-[var(--text-muted)] border border-[var(--border)] bg-[var(--bg-tertiary)] hover:text-[var(--accent)] hover:border-[var(--accent)] transition-colors duration-150"
            >
              <span>{s.text}</span>
              {s.kind === "action" && typeof s.estimatedMinutes === "number" && s.estimatedMinutes > 0 && (
                <span className="ml-1 text-[10px] text-[var(--accent)]">· {s.estimatedMinutes}m</span>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
