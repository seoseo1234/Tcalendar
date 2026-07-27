"use client";

import { X } from "lucide-react";
import { useEffect } from "react";

export function Modal({ title, open, onClose, children, wide = false }: { title: string; open: boolean; onClose: () => void; children: React.ReactNode; wide?: boolean }) {
  useEffect(() => {
    if (!open) return;
    const close = (event: KeyboardEvent) => event.key === "Escape" && onClose();
    document.addEventListener("keydown", close);
    return () => document.removeEventListener("keydown", close);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <section className={`modal ${wide ? "modal-wide" : ""}`} role="dialog" aria-modal="true" aria-labelledby="modal-title">
        <header><h2 id="modal-title">{title}</h2><button className="icon-button" onClick={onClose} aria-label="닫기"><X /></button></header>
        {children}
      </section>
    </div>
  );
}
