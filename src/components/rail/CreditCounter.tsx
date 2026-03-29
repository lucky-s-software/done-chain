"use client";

import { useEffect, useState } from "react";

export function CreditCounter() {
  const [credits, setCredits] = useState<number | null>(null);

  useEffect(() => {
    fetch("/api/credits")
      .then((r) => r.json())
      .then((d) => setCredits(d.total ?? 0))
      .catch(() => setCredits(0));
  }, []);

  if (credits === null) return null;

  return (
    <div className="px-4 py-2 flex items-center justify-between">
      <span className="font-mono text-[10px] tracking-widest text-[var(--text-muted)] uppercase">Credits</span>
      <span className="font-mono text-xs text-[var(--text-muted)]">{credits} this month</span>
    </div>
  );
}
