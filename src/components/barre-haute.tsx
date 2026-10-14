"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { Bell, ChevronDown, LogOut, Menu, Plus, Search, UserCog, X } from "lucide-react";
import type { Lien, SectionNavigation } from "@/server/permissions";
import { logout } from "@/server/actions";
import { Navigation } from "@/components/navigation";
import { Icone } from "@/components/icones";

const Recherche = dynamic(() => import("@/components/recherche"), { ssr: false });

function useFermeture<T extends HTMLElement>(ouvert: boolean, fermer: () => void) {
  const ref = useRef<T>(null);
  useEffect(() => {
    if (!ouvert) return;
    const surClic = (event: MouseEvent) => {
      if (ref.current && !ref.current.contains(event.target as Node)) fermer();
    };
    const surTouche = (event: KeyboardEvent) => event.key === "Escape" && fermer();
    document.addEventListener("mousedown", surClic);
    document.addEventListener("keydown", surTouche);
    return () => {
      document.removeEventListener("mousedown", surClic);
      document.removeEventListener("keydown", surTouche);
    };
  }, [ouvert, fermer]);
  return ref;
}

export function BarreHaute({
  sections,
  parametres,
  actions,
  nonLues,
  utilisateur,
  accueil,
}: {
  sections: SectionNavigation[];
  parametres: Lien[];
  actions: Lien[];
  nonLues: number;
  utilisateur: { nom: string; role: string; initiales: string };
  accueil: string;
}) {
  const [recherche, setRecherche] = useState(false);
  const [menuMobile, setMenuMobile] = useState(false);
  const [nouveau, setNouveau] = useState(false);
  const [profil, setProfil] = useState(false);
  const pathname = usePathname();
  const refNouveau = useFermeture<HTMLDivElement>(nouveau, () => setNouveau(false));
  const refProfil = useFermeture<HTMLDivElement>(profil, () => setProfil(false));

  useEffect(() => {
    const surTouche = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setRecherche(true);
      }
    };
    document.addEventListener("keydown", surTouche);
    return () => document.removeEventListener("keydown", surTouche);
  }, []);

  useEffect(() => {
    setMenuMobile(false);
    setNouveau(false);
    setProfil(false);
  }, [pathname]);

  return (
    <>
      <header className="no-print sticky top-0 z-30 flex items-center gap-2 border-b border-ink/[0.06] bg-white/80 px-4 py-3 backdrop-blur-xl md:px-8">
        <button className="bouton-fantome md:hidden" onClick={() => setMenuMobile(true)} aria-label="Ouvrir le menu">
          <Menu size={20} />
        </button>
        <button
          onClick={() => setRecherche(true)}
          className="group flex min-w-0 flex-1 items-center gap-2.5 rounded-xl border border-ink/[0.08] bg-paper/70 px-3.5 py-2 text-left text-sm text-ink/45 transition hover:border-ink/15 hover:bg-white md:max-w-md"
        >
          <Search size={17} className="shrink-0" />
          <span className="truncate">Rechercher un client, un dossier, une page…</span>
          <kbd className="ml-auto hidden rounded-md border border-ink/10 bg-white px-1.5 py-0.5 font-sans text-[11px] text-ink/45 sm:block">Ctrl K</kbd>
        </button>

        <div className="ml-auto flex items-center gap-1.5">
          {actions.length > 0 ? (
            <div className="relative" ref={refNouveau}>
              <button className="bouton px-3 sm:px-4" onClick={() => setNouveau((valeur) => !valeur)} aria-expanded={nouveau}>
                <Plus size={17} strokeWidth={2.5} />
                <span className="hidden sm:inline">Nouveau</span>
              </button>
              {nouveau ? (
                <div className="absolute right-0 mt-2 w-60 origin-top-right animate-zoom rounded-2xl border border-ink/[0.08] bg-white p-1.5 shadow-xl shadow-ink/10">
                  {actions.map((action) => (
                    <Link
                      key={action.href}
                      href={action.href}
                      onClick={() => setNouveau(false)}
                      className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition hover:bg-paper"
                    >
                      <span className="grid h-8 w-8 place-items-center rounded-lg bg-desk/10 text-desk">
                        <Icone nom={action.icone} size={16} />
                      </span>
                      {action.label}
                    </Link>
                  ))}
                </div>
              ) : null}
            </div>
          ) : null}

          <Link href="/notifications" className="relative grid h-10 w-10 place-items-center rounded-xl text-ink/60 transition hover:bg-ink/5 hover:text-ink" aria-label="Notifications">
            <Bell size={19} />
            {nonLues > 0 ? (
              <span className="absolute top-1.5 right-1.5 grid h-4 min-w-4 place-items-center rounded-full bg-cap px-1 text-[10px] font-bold text-white ring-2 ring-white">
                {nonLues > 9 ? "9+" : nonLues}
              </span>
            ) : null}
          </Link>

          <div className="relative" ref={refProfil}>
            <button onClick={() => setProfil((valeur) => !valeur)} className="flex items-center gap-2 rounded-xl py-1 pr-2 pl-1 transition hover:bg-ink/5" aria-expanded={profil}>
              <span className="grid h-8 w-8 place-items-center rounded-full bg-gradient-to-br from-desk to-ink text-xs font-bold text-white">{utilisateur.initiales}</span>
              <span className="hidden text-left leading-tight lg:block">
                <span className="block text-sm font-semibold">{utilisateur.nom}</span>
                <span className="block text-xs text-ink/50">{utilisateur.role}</span>
              </span>
              <ChevronDown size={15} className="hidden text-ink/40 lg:block" />
            </button>
            {profil ? (
              <div className="absolute right-0 mt-2 w-56 origin-top-right animate-zoom rounded-2xl border border-ink/[0.08] bg-white p-1.5 shadow-xl shadow-ink/10">
                <div className="px-3 py-2 lg:hidden">
                  <p className="text-sm font-semibold">{utilisateur.nom}</p>
                  <p className="text-xs text-ink/50">{utilisateur.role}</p>
                </div>
                <Link href="/profil" className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium hover:bg-paper">
                  <UserCog size={17} className="text-ink/50" />
                  Mon profil
                </Link>
                <form action={logout}>
                  <button className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-cap hover:bg-cap/5">
                    <LogOut size={17} />
                    Se déconnecter
                  </button>
                </form>
              </div>
            ) : null}
          </div>
        </div>
      </header>

      {menuMobile ? (
        <div className="fixed inset-0 z-50 md:hidden">
          <div className="absolute inset-0 animate-apparition bg-ink/40 backdrop-blur-[2px]" onClick={() => setMenuMobile(false)} />
          <aside className="relative flex h-full w-72 animate-glisse-gauche flex-col overflow-y-auto bg-ink px-4 py-5">
            <div className="mb-6 flex items-center justify-between">
              <Link href={accueil}>
                <img src="/logo-edudesk.png" alt="EduDesk" className="h-11 w-auto" />
              </Link>
              <button onClick={() => setMenuMobile(false)} className="rounded-lg p-1.5 text-white/60 hover:bg-white/10" aria-label="Fermer le menu">
                <X size={20} />
              </button>
            </div>
            <Navigation sections={sections} auClic={() => setMenuMobile(false)} />
          </aside>
        </div>
      ) : null}

      {recherche ? <Recherche sections={[...sections, { titre: "Paramètres", liens: parametres }]} fermer={() => setRecherche(false)} /> : null}
    </>
  );
}
