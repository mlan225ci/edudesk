import Link from "next/link";
import { redirect } from "next/navigation";
import { AlertCircle, CheckCircle2, CircleDollarSign, HandCoins, Search, Wallet } from "lucide-react";
import { nomComplet, xof } from "@/lib/format";
import { STATUTS, TON_STATUT } from "@/lib/labels";
import { Formulaire } from "@/components/formulaire";
import { Kpi } from "@/components/graphiques";
import { Avatar, Badge, EnTete, Onglets, Progression, Vide } from "@/components/ui";
import { modifierMontantConvenu } from "@/server/actions";
import { peutEncaisser, peutModifierMontant, voitFinance } from "@/server/permissions";
import { requireUser } from "@/server/session";
import { situationDossiers } from "@/server/stats";
import { Filtres } from "@/components/filtres";

export const metadata = { title: "Créances" };

export default async function CreancesPage({ searchParams }: { searchParams: Promise<{ filtre?: string; q?: string }> }) {
  const user = await requireUser();
  if (!voitFinance(user.role)) redirect("/tableau-de-bord");
  const { filtre = "impayes", q = "" } = await searchParams;
  const situation = await situationDossiers();
  const recherche = q.trim().toLowerCase();

  const regles: Record<string, (ligne: (typeof situation)[number]) => boolean> = {
    impayes: (ligne) => ligne.reste > 0,
    soldes: (ligne) => ligne.convenu > 0 && ligne.reste === 0,
    "sans-tarif": (ligne) => ligne.convenu === 0,
    tous: () => true,
  };
  const lignes = situation
    .filter(regles[filtre] ?? regles.impayes)
    .filter((ligne) =>
      recherche ? `${nomComplet(ligne.dossier.client)} ${ligne.dossier.reference} ${ligne.dossier.client.telephone}`.toLowerCase().includes(recherche) : true,
    )
    .sort((a, b) => b.reste - a.reste);

  const convenu = situation.reduce((somme, ligne) => somme + ligne.convenu, 0);
  const paye = situation.reduce((somme, ligne) => somme + Math.min(ligne.paye, ligne.convenu || ligne.paye), 0);
  const reste = situation.reduce((somme, ligne) => somme + ligne.reste, 0);
  const compter = (cle: string) => situation.filter(regles[cle]).length;
  const modifiable = peutModifierMontant(user.role);
  const encaissement = peutEncaisser(user.role);

  return (
    <section className="grid gap-6">
      <EnTete
        titre="Créances clients"
        icone={HandCoins}
        description="Ce que chaque client doit encore : montant convenu comparé aux paiements reçus."
      />

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Kpi titre="Montant convenu" valeur={convenu} format="xof" icone={CircleDollarSign} detail={`${situation.length} dossiers actifs`} />
        <Kpi titre="Encaissé" valeur={paye} format="xof" ton="vert" icone={CheckCircle2} detail={convenu ? `${Math.round((paye / convenu) * 100)}% recouvré` : undefined} />
        <Kpi titre="Reste à encaisser" valeur={reste} format="xof" ton="cap" icone={AlertCircle} />
        <Kpi titre="Dossiers à chiffrer" valeur={compter("sans-tarif")} ton="edu" href="/creances?filtre=sans-tarif" detail="sans montant convenu" />
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <Onglets
          actif={`/creances?filtre=${filtre}`}
          onglets={[
            { href: "/creances?filtre=impayes", label: "Reste à payer", nombre: compter("impayes") },
            { href: "/creances?filtre=soldes", label: "Soldés", nombre: compter("soldes") },
            { href: "/creances?filtre=sans-tarif", label: "À chiffrer", nombre: compter("sans-tarif") },
            { href: "/creances?filtre=tous", label: "Tous", nombre: situation.length },
          ]}
        />
        <Filtres className="relative w-full max-w-xs" action="/creances">
          <input type="hidden" name="filtre" value={filtre} />
          <Search size={16} className="absolute top-1/2 left-3.5 -translate-y-1/2 text-ink/35" />
          <input className="champ pl-10" name="q" placeholder="Client ou référence…" defaultValue={q} />
        </Filtres>
      </div>

      {lignes.length === 0 ? (
        <Vide icone={CheckCircle2} titre="Rien à afficher" texte="Aucun dossier ne correspond à ce filtre." />
      ) : (
        <div className="grid gap-2 entree-cascade">
          {lignes.map(({ dossier, convenu: du, paye: regle, reste: solde }) => {
            const ratio = du > 0 ? (regle / du) * 100 : 0;
            return (
              <article key={dossier.id} className="carte grid gap-4 py-4 md:grid-cols-[minmax(0,1fr)_200px_auto] md:items-center">
                <div className="flex min-w-0 items-center gap-3">
                  <Avatar prenom={dossier.client.prenom} nom={dossier.client.nom} />
                  <div className="min-w-0">
                    <Link href={`/dossiers/${dossier.id}`} className="block truncate font-semibold hover:text-desk">{nomComplet(dossier.client)}</Link>
                    <p className="flex flex-wrap items-center gap-1.5 text-xs text-ink/50">
                      {dossier.reference} · {dossier.procedure.destination}
                      <Badge ton={TON_STATUT[dossier.statut]}>{STATUTS[dossier.statut]}</Badge>
                    </p>
                  </div>
                </div>
                <div>
                  <div className="mb-1 flex justify-between text-xs">
                    <span className="text-ink/50">{xof(regle)} / {du ? xof(du) : "?"}</span>
                    <span className={`font-bold ${du === 0 ? "text-[#8a6500]" : solde > 0 ? "text-cap" : "text-vert"}`}>
                      {du === 0 ? "À chiffrer" : solde > 0 ? `− ${xof(solde)}` : "Soldé"}
                    </span>
                  </div>
                  <Progression valeur={ratio} ton={solde === 0 && du > 0 ? "vert" : "desk"} />
                </div>
                <div className="flex flex-wrap items-center gap-2 md:justify-end">
                  {modifiable ? (
                    <Formulaire action={modifierMontantConvenu} submit="OK" succes="Montant mis à jour" reinitialiser={false} className="flex items-center gap-1.5" boutonClassName="bouton-second px-3">
                      <input type="hidden" name="dossierId" value={dossier.id} />
                      <input className="champ w-32 py-2" name="montantConvenu" inputMode="numeric" defaultValue={du || ""} placeholder="Montant" aria-label="Montant convenu" />
                    </Formulaire>
                  ) : null}
                  {encaissement && solde > 0 ? (
                    <Link href={`/caisse?dossier=${dossier.id}`} className="bouton px-3" title="Encaisser">
                      <Wallet size={16} />
                    </Link>
                  ) : null}
                </div>
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}
