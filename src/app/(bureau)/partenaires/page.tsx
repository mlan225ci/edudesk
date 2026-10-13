import { redirect } from "next/navigation";
import { BadgeCheck, Coins, FolderOpen, Handshake, HandCoins, Mail, Phone, Plus } from "lucide-react";
import { prisma } from "@/lib/db";
import { xof } from "@/lib/format";
import { MODES } from "@/lib/labels";
import { Formulaire } from "@/components/formulaire";
import { Kpi } from "@/components/graphiques";
import { Tiroir } from "@/components/tiroir";
import { Badge, Champ, Choix, EnTete, Progression, Vide } from "@/components/ui";
import { creerPartenaire, verserCommission } from "@/server/actions";
import { voitDepenses, voitPartenaires } from "@/server/permissions";
import { requireUser } from "@/server/session";

export const metadata = { title: "Partenaires" };

export default async function PartenairesPage({ searchParams }: { searchParams: Promise<{ nouveau?: string }> }) {
  const user = await requireUser();
  if (!voitPartenaires(user.role)) redirect("/tableau-de-bord");
  const { nouveau } = await searchParams;
  const partenaires = await prisma.partenaire.findMany({
    orderBy: { nom: "asc" },
    include: {
      clients: { include: { dossiers: { include: { procedure: true } } } },
      depenses: { where: { categorie: "COMMISSION" }, select: { montant: true } },
      _count: { select: { prospects: true, utilisateurs: true } },
    },
  });
  const peutVerser = voitDepenses(user.role);

  const fiches = partenaires
    .map((partenaire) => {
      const dossiers = partenaire.clients.flatMap((client) => client.dossiers).filter((dossier) => dossier.statut !== "REORIENTE");
      const due = dossiers.reduce((somme, dossier) => somme + dossier.procedure.commissionXof, 0);
      const versee = partenaire.depenses.reduce((somme, depense) => somme + depense.montant, 0);
      return { partenaire, dossiers: dossiers.length, due, versee, solde: due - versee };
    })
    .sort((a, b) => b.dossiers - a.dossiers);
  const totalDu = fiches.reduce((somme, fiche) => somme + fiche.due, 0);
  const totalVerse = fiches.reduce((somme, fiche) => somme + fiche.versee, 0);
  const apportes = fiches.reduce((somme, fiche) => somme + fiche.dossiers, 0);

  return (
    <section className="grid gap-6">
      <EnTete
        titre="Partenaires"
        icone={Handshake}
        description="Apporteurs d'affaires, écoles et agences relais. La commission due = commission de la procédure × dossiers apportés."
        actions={
          <Tiroir label="Nouveau partenaire" icone={<Plus size={16} />} titre="Nouveau partenaire" ouvertParDefaut={nouveau === "1"}>
            <Formulaire action={creerPartenaire} submit="Créer le partenaire" succes="Partenaire créé" className="grid gap-4">
              <Champ label="Nom"><input className="champ" name="nom" required autoFocus /></Champ>
              <Champ label="Type"><input className="champ" name="type" placeholder="Apporteur, école, agence…" list="types-partenaire" /></Champ>
              <datalist id="types-partenaire">
                <option value="Apporteur" />
                <option value="École" />
                <option value="Agence" />
              </datalist>
              <Champ label="Téléphone"><input className="champ" name="telephone" defaultValue="+225" required /></Champ>
              <Champ label="E-mail"><input className="champ" name="email" type="email" placeholder="Facultatif" /></Champ>
            </Formulaire>
          </Tiroir>
        }
      />

      <div className="grid gap-3 sm:grid-cols-3">
        <Kpi titre="Dossiers apportés" valeur={apportes} icone={FolderOpen} detail={`par ${partenaires.length} partenaires`} />
        <Kpi titre="Commissions versées" valeur={totalVerse} format="xof" ton="vert" icone={BadgeCheck} />
        <Kpi titre="Reste à verser" valeur={Math.max(totalDu - totalVerse, 0)} format="xof" ton="cap" icone={HandCoins} />
      </div>

      {fiches.length === 0 ? (
        <Vide icone={Handshake} titre="Aucun partenaire" texte="Ajoutez vos apporteurs d'affaires pour suivre leurs commissions." />
      ) : (
        <div className="grid gap-4 md:grid-cols-2 entree-cascade">
          {fiches.map(({ partenaire, dossiers, due, versee, solde }) => (
            <article key={partenaire.id} className="carte grid gap-4">
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-3">
                  <span className="grid h-11 w-11 place-items-center rounded-2xl bg-gradient-to-br from-edu to-mission text-sm font-bold text-ink">
                    {partenaire.nom.slice(0, 2).toUpperCase()}
                  </span>
                  <div>
                    <p className="font-semibold">{partenaire.nom}</p>
                    <div className="flex flex-wrap gap-1.5">
                      <Badge ton="gris">{partenaire.type}</Badge>
                      {partenaire._count.utilisateurs ? <Badge ton="desk">Accès portail</Badge> : null}
                    </div>
                  </div>
                </div>
                <div className="text-right text-xs text-ink/50">
                  <p className="flex items-center justify-end gap-1"><Phone size={12} /> {partenaire.telephone}</p>
                  {partenaire.email ? <p className="flex items-center justify-end gap-1"><Mail size={12} /> {partenaire.email}</p> : null}
                </div>
              </div>

              <dl className="grid grid-cols-3 gap-2 rounded-xl bg-paper p-3 text-center text-sm">
                <div><dt className="text-xs text-ink/50">Prospects</dt><dd className="font-bold">{partenaire._count.prospects}</dd></div>
                <div><dt className="text-xs text-ink/50">Dossiers</dt><dd className="font-bold">{dossiers}</dd></div>
                <div><dt className="text-xs text-ink/50">Due</dt><dd className="font-bold tabular-nums">{xof(due)}</dd></div>
              </dl>

              <div>
                <div className="mb-1 flex justify-between text-xs">
                  <span className="text-ink/55">Versé {xof(versee)}</span>
                  <span className={`font-semibold ${solde > 0 ? "text-cap" : "text-vert"}`}>{solde > 0 ? `reste ${xof(solde)}` : "à jour"}</span>
                </div>
                <Progression valeur={due ? (versee / due) * 100 : 100} ton={solde > 0 ? "edu" : "vert"} />
              </div>

              {peutVerser && solde > 0 ? (
                <Tiroir label="Verser la commission" variante="second" icone={<Coins size={15} />} titre="Verser une commission" description={partenaire.nom}>
                  <Formulaire action={verserCommission} submit="Enregistrer le versement" succes="Commission versée" className="grid gap-4">
                    <input type="hidden" name="partenaireId" value={partenaire.id} />
                    <Champ label="Montant (F CFA)" aide={`Reste dû : ${xof(solde)}`}>
                      <input className="champ text-lg font-semibold" name="montant" inputMode="numeric" defaultValue={solde} />
                    </Champ>
                    <Choix label="Payé par" name="mode" options={MODES} />
                    <Champ label="Référence"><input className="champ" name="reference" placeholder="Facultatif" /></Champ>
                    <Champ label="Date"><input className="champ" type="date" name="date" defaultValue={new Date().toISOString().slice(0, 10)} /></Champ>
                  </Formulaire>
                </Tiroir>
              ) : null}
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
