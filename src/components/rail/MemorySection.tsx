"use client";

import { useEffect, useState } from "react";
import type { Entry } from "@/types";

export function MemorySection() {
  const [entries, setEntries] = useState<Entry[]>([]);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    try {
      const r = await fetch("/api/entries");
      const data = await r.json();
      setEntries(data.entries ?? []);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  if (loading) {
    return <div className="px-4 py-2 text-xs font-mono text-[var(--text-muted)]">loading memories...</div>;
  }

  return (
    <div>
      <div className="px-4 py-2 border-b border-[var(--border)]">
        <span className="font-mono text-xs tracking-widest text-[var(--text-muted)] uppercase">Memories</span>
        <span className="ml-2 text-xs font-mono text-[var(--text-muted)]">{entries.length}</span>
      </div>
      
      {entries.length === 0 ? (
        <div className="px-4 py-3 text-xs text-[var(--text-muted)] font-mono">— no memories stored</div>
      ) : (
        <ul className="divide-y divide-[var(--border)]">
          {entries.map((entry) => (
            <li key={entry.id} className="px-4 py-3 flex flex-col gap-1 hover:bg-[var(--bg-tertiary)]/20 transition-colors">
              <p className="text-sm text-[var(--text-primary)]">{entry.content}</p>
              
              <div className="flex items-center gap-2 mt-1">
                <span className="text-[10px] font-mono text-[var(--accent)] border border-[var(--accent)]/30 px-1">FACT</span>
                <span className="text-[10px] font-mono text-[var(--text-muted)]">
                  {new Date(entry.createdAt).toLocaleDateString()}
                </span>
                
                {entry.tags.length > 0 && (
                  <div className="flex gap-1 ml-auto">
                    {entry.tags.map((t) => (
                      <span key={t} className="text-[10px] font-mono text-[var(--text-muted)] before:content-['#']">
                        {t}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
