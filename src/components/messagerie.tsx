"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef } from "react";

export function RafraichissementAuto({ secondes = 8 }: { secondes?: number }) {
  const router = useRouter();
  useEffect(() => {
    const minuteur = window.setInterval(() => {
      if (document.visibilityState === "visible") router.refresh();
    }, secondes * 1000);
    return () => window.clearInterval(minuteur);
  }, [router, secondes]);
  return null;
}

export function FilMessages({ signature, children }: { signature: string; children: React.ReactNode }) {
  const fil = useRef<HTMLDivElement>(null);
  useEffect(() => {
    fil.current?.scrollTo({ top: fil.current.scrollHeight });
  }, [signature]);
  return (
    <div ref={fil} className="flex max-h-[58vh] min-h-72 flex-col gap-2 overflow-y-auto px-5 py-4 [scrollbar-width:thin]">
      {children}
    </div>
  );
}

export function ChampMessage() {
  return (
    <textarea
      className="champ min-h-11 flex-1 resize-none"
      name="texte"
      rows={2}
      placeholder="Écrire un message… (Entrée pour envoyer, Maj+Entrée pour aller à la ligne)"
      required
      autoFocus
      onKeyDown={(event) => {
        if (event.key === "Enter" && !event.shiftKey) {
          event.preventDefault();
          event.currentTarget.form?.requestSubmit();
        }
      }}
    />
  );
}
