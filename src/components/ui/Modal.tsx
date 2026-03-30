"use client";

import { useEffect } from "react";

interface ModalProps {
  open: boolean;
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}

export function Modal({ open, title, onClose, children }: ModalProps) {
  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="absolute inset-0 bg-black/55" />
      <div
        className="relative w-full max-w-3xl max-h-[85vh] overflow-hidden border border-[var(--border)] bg-[var(--bg-primary)]"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--border)] bg-[var(--bg-secondary)]">
          <h3 className="text-sm font-mono tracking-widest uppercase text-[var(--text-primary)]">{title}</h3>
          <button
            type="button"
            onClick={onClose}
            className="w-7 h-7 border border-[var(--border)] text-xs text-[var(--text-muted)] hover:text-[var(--text-primary)]"
            aria-label="Close modal"
          >
            ✕
          </button>
        </div>
        <div className="px-4 py-3 overflow-y-auto max-h-[calc(85vh-56px)] text-sm text-[var(--text-primary)] whitespace-pre-wrap">
          {children}
        </div>
      </div>
    </div>
  );
}
