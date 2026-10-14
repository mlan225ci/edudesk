"use client";

import Link from "next/link";
import { createContext, useCallback, useContext, useState } from "react";
import { CheckCircle2, AlertCircle, MessageSquare, X } from "lucide-react";

type TypeToast = "succes" | "erreur" | "message";
type Toast = { id: number; message: string; type: TypeToast; lien?: string };

const ToastContext = createContext<(message: string, type?: TypeToast, lien?: string) => void>(() => {});

export function useToast() {
  return useContext(ToastContext);
}

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const retirer = useCallback((id: number) => setToasts((liste) => liste.filter((toast) => toast.id !== id)), []);
  const afficher = useCallback(
    (message: string, type: TypeToast = "succes", lien?: string) => {
      const id = Date.now() + Math.random();
      setToasts((liste) => [...liste.slice(-3), { id, message, type, lien }]);
      setTimeout(() => retirer(id), type === "message" ? 6000 : 3500);
    },
    [retirer],
  );

  return (
    <ToastContext.Provider value={afficher}>
      {children}
      <div className="no-print pointer-events-none fixed right-4 bottom-4 z-[70] grid w-[min(360px,calc(100vw-2rem))] gap-2" aria-live="polite">
        {toasts.map((toast) => (
          <div
            key={toast.id}
            className="pointer-events-auto flex animate-entree items-start gap-3 rounded-2xl border border-ink/10 bg-white px-4 py-3 text-sm shadow-xl shadow-ink/10"
          >
            {toast.type === "succes" ? (
              <CheckCircle2 size={20} className="mt-px shrink-0 text-vert" />
            ) : toast.type === "message" ? (
              <MessageSquare size={20} className="mt-px shrink-0 text-desk" />
            ) : (
              <AlertCircle size={20} className="mt-px shrink-0 text-cap" />
            )}
            {toast.lien ? (
              <Link href={toast.lien} onClick={() => retirer(toast.id)} className="flex-1 font-medium whitespace-pre-line hover:text-desk">
                {toast.message}
              </Link>
            ) : (
              <p className="flex-1 font-medium">{toast.message}</p>
            )}
            <button onClick={() => retirer(toast.id)} className="text-ink/40 hover:text-ink" aria-label="Fermer">
              <X size={16} />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}
