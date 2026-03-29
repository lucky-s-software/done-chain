"use client";

interface CardProps {
  children: React.ReactNode;
  className?: string;
  accent?: boolean;
}

export function Card({ children, className = "", accent = false }: CardProps) {
  return (
    <div
      className={`rounded-none border bg-[var(--bg-secondary)] ${
        accent
          ? "border-l-2 border-l-[var(--accent)] border-t-[var(--border)] border-r-[var(--border)] border-b-[var(--border)]"
          : "border-[var(--border)]"
      } ${className}`}
    >
      {children}
    </div>
  );
}
