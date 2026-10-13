"use client";

import Form from "next/form";
import { useRef } from "react";

export function Filtres({ action, className, children }: { action: string; className?: string; children: React.ReactNode }) {
  const formulaire = useRef<HTMLFormElement>(null);
  const minuteur = useRef<number | undefined>(undefined);

  const envoyer = (delai: number) => {
    window.clearTimeout(minuteur.current);
    minuteur.current = window.setTimeout(() => {
      const form = formulaire.current;
      if (!form) return;
      const cible = new URLSearchParams(new FormData(form) as unknown as Record<string, string>).toString();
      if (`${action}?${cible}` === `${window.location.pathname}${window.location.search}`) return;
      window.dispatchEvent(new Event("edudesk:navigation"));
      form.requestSubmit();
    }, delai);
  };

  return (
    <Form
      ref={formulaire}
      action={action}
      className={className}
      onChange={(evenement) => {
        const type = (evenement.target as unknown as HTMLInputElement).type;
        envoyer(type === "text" || type === "search" ? 400 : 0);
      }}
    >
      {children}
    </Form>
  );
}
