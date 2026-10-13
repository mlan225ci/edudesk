"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { CornerDownLeft, FolderOpen, Loader2, Search, User, UserPlus } from "lucide-react";
import type { SectionNavigation } from "@/server/permissions";
import { Icone } from "@/components/icones";

type Resultat = { href: string; titre: string; detail?: string; groupe: string; icone: React.ReactNode };
type Reponse = {
  clients: { id: string; nom: string; telephone: string }[];
  dossiers: { id: string; reference: string; client: string; destination: string }[];
  prospects: { id: string; nom: string; telephone: string }[];
};

function normaliser(texte: string) {
  return texte.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
}

export default function Recherche({ sections, fermer }: { sections: SectionNavigation[]; fermer: () => void }) {
  const [requete, setRequete] = useState("");
  const [donnees, setDonnees] = useState<Reponse | null>(null);
  const [chargement, setChargement] = useState(false);
  const [actif, setActif] = useState(0);
  const router = useRouter();
  const champ = useRef<HTMLInputElement>(null);

  useEffect(() => {
    champ.current?.focus();
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = "";
    };
  }, []);

  useEffect(() => {
    const terme = requete.trim();
    if (terme.length < 2) {
      setDonnees(null);
      return;
    }
    setChargement(true);
    const controleur = new AbortController();
    const minuteur = setTimeout(async () => {
      try {
        const reponse = await fetch(`/api/recherche?q=${encodeURIComponent(terme)}`, { signal: controleur.signal });
        if (reponse.ok) setDonnees(await reponse.json());
      } catch {
        return;
      } finally {
        setChargement(false);
      }
    }, 180);
    return () => {
      clearTimeout(minuteur);
      controleur.abort();
    };
  }, [requete]);

  const resultats = useMemo<Resultat[]>(() => {
    const terme = normaliser(requete.trim());
    const pages = sections
      .flatMap((section) => section.liens)
      .filter((lien) => !terme || normaliser(lien.label).includes(terme))
      .slice(0, terme ? 5 : 8)
      .map((lien) => ({ href: lien.href, titre: lien.label, groupe: "Aller à", icone: <Icone nom={lien.icone} size={16} /> }));
    if (!donnees) return pages;
    return [
      ...donnees.dossiers.map((dossier) => ({
        href: `/dossiers/${dossier.id}`,
        titre: dossier.client,
        detail: `${dossier.reference} · ${dossier.destination}`,
        groupe: "Dossiers",
        icone: <FolderOpen size={16} />,
      })),
      ...donnees.clients.map((client) => ({ href: `/clients/${client.id}`, titre: client.nom, detail: client.telephone, groupe: "Clients", icone: <User size={16} /> })),
      ...donnees.prospects.map((prospect) => ({
        href: `/prospects/${prospect.id}`,
        titre: prospect.nom,
        detail: prospect.telephone,
        groupe: "Prospects",
        icone: <UserPlus size={16} />,
      })),
      ...pages,
    ];
  }, [donnees, requete, sections]);

  useEffect(() => setActif(0), [resultats.length]);

  const ouvrir = (resultat: Resultat | undefined) => {
    if (!resultat) return;
    fermer();
    router.push(resultat.href);
  };

  let groupePrecedent = "";

  return (
    <div className="fixed inset-0 z-[60] flex items-start justify-center px-4 pt-[12vh]" role="dialog" aria-modal="true">
      <div className="absolute inset-0 animate-apparition bg-ink/40 backdrop-blur-sm" onClick={fermer} />
      <div className="relative w-full max-w-xl animate-zoom overflow-hidden rounded-2xl bg-white shadow-2xl">
        <div className="flex items-center gap-3 border-b border-ink/[0.06] px-4">
          {chargement ? <Loader2 size={19} className="animate-spin text-desk" /> : <Search size={19} className="text-ink/40" />}
          <input
            ref={champ}
            value={requete}
            onChange={(event) => setRequete(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Escape") fermer();
              if (event.key === "ArrowDown") {
                event.preventDefault();
                setActif((index) => Math.min(index + 1, resultats.length - 1));
              }
              if (event.key === "ArrowUp") {
                event.preventDefault();
                setActif((index) => Math.max(index - 1, 0));
              }
              if (event.key === "Enter") ouvrir(resultats[actif]);
            }}
            placeholder="Nom, téléphone, référence de dossier, page…"
            className="h-14 flex-1 bg-transparent text-[15px] outline-none placeholder:text-ink/35"
          />
          <kbd className="rounded-md border border-ink/10 px-1.5 py-0.5 text-[11px] text-ink/40">Échap</kbd>
        </div>
        <ul className="max-h-[50vh] overflow-y-auto p-2">
          {resultats.map((resultat, index) => {
            const entete = resultat.groupe !== groupePrecedent ? resultat.groupe : null;
            groupePrecedent = resultat.groupe;
            return (
              <li key={`${resultat.groupe}-${resultat.href}`}>
                {entete ? <p className="px-3 pt-3 pb-1 text-[11px] font-semibold tracking-wider text-ink/40 uppercase">{entete}</p> : null}
                <button
                  onMouseEnter={() => setActif(index)}
                  onClick={() => ouvrir(resultat)}
                  className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm transition ${index === actif ? "bg-desk/[0.07] text-ink" : "text-ink/75"}`}
                >
                  <span className={`grid h-8 w-8 place-items-center rounded-lg ${index === actif ? "bg-desk text-white" : "bg-paper text-ink/50"}`}>{resultat.icone}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium">{resultat.titre}</span>
                    {resultat.detail ? <span className="block truncate text-xs text-ink/50">{resultat.detail}</span> : null}
                  </span>
                  {index === actif ? <CornerDownLeft size={15} className="text-ink/40" /> : null}
                </button>
              </li>
            );
          })}
          {resultats.length === 0 && !chargement ? <li className="px-3 py-8 text-center text-sm text-ink/50">Aucun résultat pour « {requete} ».</li> : null}
        </ul>
        <div className="flex gap-4 border-t border-ink/[0.06] bg-paper/60 px-4 py-2.5 text-[11px] text-ink/45">
          <span>↑ ↓ naviguer</span>
          <span>Entrée ouvrir</span>
          <span>Échap fermer</span>
        </div>
      </div>
    </div>
  );
}
