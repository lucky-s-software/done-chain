"use client";

interface BadgeProps {
  children: React.ReactNode;
  variant?: "default" | "accent" | "success" | "danger" | "info" | "muted";
  className?: string;
}

export function Badge({ children, variant = "default", className = "" }: BadgeProps) {
  const variants = {
    default: "bg-[var(--bg-tertiary)] text-[var(--text-secondary)] border-[var(--border)]",
    accent: "bg-[var(--accent-soft)] text-[var(--accent)] border-[var(--accent)]/30",
    success: "bg-[var(--success)]/10 text-[var(--success)] border-[var(--success)]/30",
    danger: "bg-[var(--danger)]/10 text-[var(--danger)] border-[var(--danger)]/30",
    info: "bg-[var(--info)]/10 text-[var(--info)] border-[var(--info)]/30",
    muted: "bg-transparent text-[var(--text-muted)] border-[var(--border)]",
  };

  return (
    <span
      className={`inline-flex items-center gap-1 px-1.5 py-0.5 text-xs font-mono border rounded ${variants[variant]} ${className}`}
    >
      {children}
    </span>
  );
}
