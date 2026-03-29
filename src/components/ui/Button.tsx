"use client";

import { ButtonHTMLAttributes, forwardRef } from "react";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "ghost" | "danger" | "success";
  size?: "sm" | "md";
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ variant = "primary", size = "md", className = "", ...props }, ref) => {
    const base =
      "inline-flex items-center gap-1.5 font-mono font-medium transition-all duration-150 focus:outline-none focus:ring-1 focus:ring-[var(--accent)] disabled:opacity-40 disabled:cursor-not-allowed";

    const variants = {
      primary:
        "bg-[var(--accent)] text-black hover:brightness-110 border border-[var(--accent)]",
      ghost:
        "bg-transparent text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-tertiary)] border border-[var(--border)]",
      danger:
        "bg-transparent text-[var(--danger)] hover:bg-[var(--danger)]/10 border border-[var(--danger)]/40",
      success:
        "bg-transparent text-[var(--success)] hover:bg-[var(--success)]/10 border border-[var(--success)]/40",
    };

    const sizes = {
      sm: "px-2.5 py-1 text-xs",
      md: "px-3.5 py-1.5 text-sm",
    };

    return (
      <button
        ref={ref}
        className={`${base} ${variants[variant]} ${sizes[size]} ${className}`}
        {...props}
      />
    );
  }
);
Button.displayName = "Button";
