"use client";

import { createContext, useContext, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { X } from "lucide-react";

const TiroirContext = createContext<(() => void) | null>(null);

export function useFermerTiroir() {
  return useContext(TiroirContext);
}

export function Tiroir({
  label,
  icone,
  titre,
  description,
  variante = "principal",
  ouvertParDefaut = false,
  children,
}: {
  label: string;
  icone?: React.ReactNode;
  titre: string;
  description?: string;
  variante?: "principal" | "second";
  ouvertParDefaut?: boolean;
  children: React.ReactNode;
}) {
  const [ouvert, setOuvert] = useState(ouvertParDefaut);
  const [monte, setMonte] = useState(false);
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();

  const fermer = () => {
    setOuvert(false);
    if (params.get("nouveau")) {
      const suite = new URLSearchParams(params);
      suite.delete("nouveau");
      router.replace(suite.size ? `${pathname}?${suite}` : pathname, { scroll: false });
    }
  };

  useEffect(() => setMonte(true), []);

  useEffect(() => {
    if (ouvertParDefaut) setOuvert(true);
  }, [ouvertParDefaut]);

  useEffect(() => {
    if (!ouvert) return;
    const surTouche = (event: KeyboardEvent) => {
      if (event.key === "Escape") fermer();
    };
    document.addEventListener("keydown", surTouche);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", surTouche);
      document.body.style.overflow = "";
    };
  });

  return (
    <>
      <button type="button" className={variante === "principal" ? "bouton" : "bouton-second"} onClick={() => setOuvert(true)}>
        {icone}
        {label}
      </button>
      {ouvert && monte
        ? createPortal(
        <div className="fixed inset-0 z-50 flex justify-end" role="dialog" aria-modal="true" aria-label={titre}>
          <div className="absolute inset-0 animate-apparition bg-ink/30 backdrop-blur-[2px]" onClick={fermer} />
          <aside className="relative flex h-full w-full max-w-md animate-glisse-droite flex-col bg-white shadow-2xl">
            <div className="flex items-start justify-between gap-4 border-b border-ink/[0.06] px-6 py-5">
              <div>
                <h2 className="text-lg font-bold">{titre}</h2>
                {description ? <p className="mt-0.5 text-sm text-ink/55">{description}</p> : null}
              </div>
              <button type="button" onClick={fermer} className="rounded-lg p-1.5 text-ink/40 transition hover:bg-ink/5 hover:text-ink" aria-label="Fermer">
                <X size={20} />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto px-6 py-5">
              <TiroirContext.Provider value={fermer}>{children}</TiroirContext.Provider>
            </div>
          </aside>
        </div>,
            document.body,
          )
        : null}
    </>
  );
}
