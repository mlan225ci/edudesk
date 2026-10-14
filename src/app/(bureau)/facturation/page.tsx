import Link from "next/link";
import { redirect } from "next/navigation";
import type { Prisma } from "@prisma/client";
import { AlarmClock, FilePlus2, FileSignature, FileSpreadsheet, Hourglass, ReceiptText, Search, SearchX, Wallet } from "lucide-react";
import { prisma } from "@/lib/db";
import { ETATS_DEVIS, ETATS_FACTURE, etatDevis, etatFacture } from "@/lib/facturation";
import { formatJour, xof } from "@/lib/format";
import { EnteteDocument } from "@/components/choix-dossier";
import { Filtres } from "@/components/filtres";
import { Formulaire } from "@/components/formulaire";
import { Kpi } from "@/components/graphiques";
import { Tiroir } from "@/components/tiroir";
import { Badge, Champ, EnTete, Onglets, Vide } from "@/components/ui";
import { nouveauDevis } from "@/server/devis-actions";
import { CHAMPS_DOSSIER_FACTURABLE, versDossierFacturable } from "@/server/dossiers-facturables";
import { nouvelleFacture } from "@/server/facturation-actions";
import { lireDocuments } from "@/server/parametres";
import { peutDevis, peutFacturer, voitFinance } from "@/server/permissions";
import { requireUser } from "@/server/session";

export const metadata = { title: "Devis et factures" };

const AFFICHES = 200;

function correspond(recherche: string | undefined, ...valeurs: (string | null | undefined)[]) {
  if (!recherche) return true;
  const cible = recherche.toLocaleLowerCase("fr");
  return valeurs.some((valeur) => valeur?.toLocaleLowerCase("fr").includes(cible));
}

export default async function FacturationPage({
  searchParams,
}: {
  searchParams: Promise<{ vue?: string; q?: string; statut?: string; type?: string; dossier?: string; nouveau?: string }>;
}) {
  const user = await requireUser();
  if (!peutDevis(user.role)) redirect("/");
  const filtres = await searchParams;
  const finance = voitFinance(user.role);
  const vue = filtres.vue === "factures" && finance ? "factures" : "devis";
  const maintenant = new Date();
  const debutMois = new Date(maintenant.getFullYear(), maintenant.getMonth(), 1);

  const selectionDossier = { reference: true, client: { select: { prenom: true, nom: true } }, procedure: { select: { nom: true } } } satisfies Prisma.DossierSelect;
  const [reglages, dossierChoisi, devis, factures] = await Promise.all([
    lireDocuments(),
    filtres.dossier ? prisma.dossier.findUnique({ where: { id: filtres.dossier }, select: CHAMPS_DOSSIER_FACTURABLE }) : null,
    prisma.devis.findMany({
      include: { dossier: { select: selectionDossier }, facture: { select: { id: true, numero: true } } },
      orderBy: { creeLe: "desc" },
    }),
    finance
      ? prisma.facture.findMany({
          include: { dossier: { select: selectionDossier }, reglements: { select: { montant: true } }, devis: { select: { numero: true } } },
          orderBy: { creeLe: "desc" },
        })
      : Promise.resolve([]),
  ]);

  const lignesDevis = devis.map((item) => ({ ...item, etat: etatDevis(item, maintenant) }));
  const lignesFactures = factures.map((item) => {
    const regle = item.paiementId ? item.montant : item.reglements.reduce((somme, reglement) => somme + reglement.montant, 0);
    const etat = etatFacture({ montant: item.montant, regle, annuleeLe: item.annuleeLe, echeanceLe: item.echeanceLe }, maintenant);
    return { ...item, regle, reste: item.annuleeLe ? 0 : Math.max(item.montant - regle, 0), etat };
  });

  const enAttente = lignesDevis.filter((item) => item.etat.code === "EMIS");
  const decides = lignesDevis.filter((item) => ["ACCEPTE", "FACTURE", "REFUSE"].includes(item.etat.code));
  const gagnes = decides.filter((item) => item.etat.code !== "REFUSE");
  const facturesValides = lignesFactures.filter((item) => !item.annuleeLe);
  const ouvertes = facturesValides.filter((item) => item.reste > 0);
  const retards = ouvertes.filter((item) => item.etat.code === "EN_RETARD");
  const duMois = facturesValides.filter((item) => item.creeLe >= debutMois);

  const devisVisibles = lignesDevis.filter(
    (item) =>
      (!filtres.statut || item.etat.code === filtres.statut) &&
      correspond(filtres.q, item.numero, item.clientNom, item.objet, item.dossier.reference),
  );
  const facturesVisibles = lignesFactures.filter(
    (item) =>
      (!filtres.statut || item.etat.code === filtres.statut) &&
      (!filtres.type || (filtres.type === "recus") === Boolean(item.paiementId)) &&
      correspond(filtres.q, item.numero, item.clientNom, item.libelle, item.dossier.reference, item.devis?.numero),
  );

  const dossierInitial = dossierChoisi ? versDossierFacturable(dossierChoisi) : null;

  const actions = (
    <>
      <Tiroir
        label="Nouveau devis"
        variante={vue === "devis" ? "principal" : "second"}
        icone={<FileSignature size={16} />}
        titre="Nouveau devis"
        description="Le devis est numéroté, mis en page en PDF et peut partir aussitôt par e-mail au client."
        ouvertParDefaut={filtres.nouveau === "devis"}
      >
        <Formulaire action={nouveauDevis} submit="Établir le devis" succes="Devis établi" className="grid gap-4">
          <EnteteDocument initial={dossierInitial} placeholderObjet="Accompagnement admission Canada…" />
          <Champ label="Validité (jours)">
            <input className="champ" name="validite" inputMode="numeric" defaultValue={reglages.validiteDevis} />
          </Champ>
          <Champ label="Conditions" aide="Acompte, prestations exclues, délais…">
            <textarea className="champ" name="conditions" rows={3} defaultValue={reglages.conditionsDevis} />
          </Champ>
          <label className="flex items-center gap-2 text-sm text-ink/70">
            <input type="checkbox" name="envoyer" className="h-4 w-4 accent-desk" />
            Envoyer aussitôt au client par e-mail (adresse de la fiche client)
          </label>
        </Formulaire>
      </Tiroir>
      {peutFacturer(user.role) ? (
        <Tiroir
          label="Nouvelle facture"
          variante={vue === "factures" ? "principal" : "second"}
          icone={<FilePlus2 size={16} />}
          titre="Nouvelle facture"
          description="Facture directe, sans devis préalable. Elle se règle ensuite en une ou plusieurs fois."
          ouvertParDefaut={filtres.nouveau === "facture"}
        >
          <Formulaire action={nouvelleFacture} submit="Émettre la facture" succes="Facture émise" className="grid gap-4">
            <EnteteDocument initial={dossierInitial} placeholderObjet="Frais de procédure…" />
            <Champ label="Échéance (jours)" aide="Laissez vide pour une facture payable à réception.">
              <input className="champ" name="echeance" inputMode="numeric" defaultValue={reglages.echeanceFacture || ""} />
            </Champ>
            <Champ label="Conditions">
              <textarea className="champ" name="conditions" rows={2} placeholder="Facultatif" defaultValue={reglages.conditionsFacture} />
            </Champ>
          </Formulaire>
        </Tiroir>
      ) : null}
    </>
  );

  return (
    <section className="grid gap-6">
      <EnTete
        titre="Devis et factures"
        icone={FileSpreadsheet}
        description="Établissez vos devis, transformez-les en factures en un clic et suivez les règlements jusqu'au solde."
        actions={actions}
      />

      {finance ? (
        <Onglets
          actif={vue === "factures" ? "/facturation?vue=factures" : "/facturation"}
          onglets={[
            { href: "/facturation", label: "Devis", nombre: devis.length },
            { href: "/facturation?vue=factures", label: "Factures", nombre: factures.length },
          ]}
        />
      ) : null}

      {vue === "devis" ? (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <Kpi titre="En attente de réponse" valeur={enAttente.length} icone={Hourglass} ton="edu" detail={xof(enAttente.reduce((somme, item) => somme + item.total, 0))} />
          <Kpi titre="Taux d'acceptation" valeur={decides.length ? Math.round((gagnes.length / decides.length) * 100) : 0} format="pourcent" ton="vert" detail={`${gagnes.length} accepté(s) sur ${decides.length} décidé(s)`} />
          <Kpi titre="Montant accepté" valeur={gagnes.reduce((somme, item) => somme + item.total, 0)} format="xof" ton="desk" />
          <Kpi titre="Transformés en facture" valeur={lignesDevis.filter((item) => item.facture).length} icone={ReceiptText} ton="ink" />
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <Kpi titre="Facturé ce mois" valeur={duMois.reduce((somme, item) => somme + item.montant, 0)} format="xof" ton="desk" detail={`${duMois.length} facture(s)`} />
          <Kpi titre="Reste à encaisser" valeur={ouvertes.reduce((somme, item) => somme + item.reste, 0)} format="xof" icone={Wallet} ton="edu" detail={`${ouvertes.length} facture(s) ouverte(s)`} />
          <Kpi titre="En retard" valeur={retards.reduce((somme, item) => somme + item.reste, 0)} format="xof" icone={AlarmClock} ton="cap" detail={`${retards.length} facture(s) échue(s)`} />
          <Kpi titre="Encaissé ce mois" valeur={duMois.reduce((somme, item) => somme + item.regle, 0)} format="xof" ton="vert" />
        </div>
      )}

      <Filtres className="flex flex-wrap items-center gap-2" action="/facturation">
        {vue === "factures" ? <input type="hidden" name="vue" value="factures" /> : null}
        <div className="relative min-w-60 flex-1 sm:max-w-sm">
          <Search size={16} className="absolute top-1/2 left-3.5 -translate-y-1/2 text-ink/35" />
          <input className="champ pl-10" name="q" placeholder="Numéro, client, objet ou dossier" defaultValue={filtres.q ?? ""} />
        </div>
        <select className="champ w-auto" name="statut" defaultValue={filtres.statut ?? ""}>
          <option value="">Tous les statuts</option>
          {(vue === "devis" ? ETATS_DEVIS : ETATS_FACTURE).map((etat) => (
            <option key={etat.value} value={etat.value}>{etat.label}</option>
          ))}
        </select>
        {vue === "factures" ? (
          <select className="champ w-auto" name="type" defaultValue={filtres.type ?? ""}>
            <option value="">Factures et reçus</option>
            <option value="factures">Factures émises</option>
            <option value="recus">Reçus de paiement</option>
          </select>
        ) : null}
      </Filtres>

      {vue === "devis" ? (
        devisVisibles.length === 0 ? (
          <Vide
            icone={devis.length ? SearchX : FileSignature}
            titre={devis.length ? "Aucun devis ne correspond" : "Aucun devis pour l'instant"}
            texte={devis.length ? "Essayez d'élargir la recherche ou de retirer un filtre." : "Établissez votre premier devis avec le bouton « Nouveau devis »."}
          />
        ) : (
          <div className="carte overflow-x-auto p-0">
            <table className="tableau min-w-[820px]">
              <thead>
                <tr>
                  <th className="!pl-5">Devis</th>
                  <th>Objet</th>
                  <th>Établi le</th>
                  <th>Validité</th>
                  <th>Statut</th>
                  <th className="!pr-5 text-right">Montant</th>
                </tr>
              </thead>
              <tbody>
                {devisVisibles.slice(0, AFFICHES).map((item) => (
                  <tr key={item.id} className="group relative">
                    <td className="!pl-5">
                      <Link href={`/facturation/devis/${item.id}`} className="block after:absolute after:inset-0">
                        <span className="block font-semibold group-hover:text-desk">{item.clientNom}</span>
                        <span className="block text-xs text-ink/45">{item.numero} · {item.dossier.reference}</span>
                      </Link>
                    </td>
                    <td className="max-w-64 truncate text-ink/70">{item.objet}</td>
                    <td className="text-ink/70">{formatJour(item.creeLe)}</td>
                    <td className="text-ink/70">{item.validiteLe ? formatJour(item.validiteLe) : "—"}</td>
                    <td>
                      <Badge ton={item.etat.ton} point>{item.etat.label}</Badge>
                      {item.facture ? <span className="ml-1.5 text-xs text-ink/45">{item.facture.numero}</span> : null}
                    </td>
                    <td className="!pr-5 text-right font-semibold tabular-nums">{xof(item.total)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )
      ) : facturesVisibles.length === 0 ? (
        <Vide
          icone={factures.length ? SearchX : ReceiptText}
          titre={factures.length ? "Aucune facture ne correspond" : "Aucune facture pour l'instant"}
          texte={factures.length ? "Essayez d'élargir la recherche ou de retirer un filtre." : "Transformez un devis accepté en facture, ou émettez une facture directe."}
        />
      ) : (
        <div className="carte overflow-x-auto p-0">
          <table className="tableau min-w-[900px]">
            <thead>
              <tr>
                <th className="!pl-5">Facture</th>
                <th>Objet</th>
                <th>Émise le</th>
                <th>Échéance</th>
                <th>Statut</th>
                <th className="text-right">Montant</th>
                <th className="!pr-5 text-right">Reste</th>
              </tr>
            </thead>
            <tbody>
              {facturesVisibles.slice(0, AFFICHES).map((item) => (
                <tr key={item.id} className={`group relative ${item.annuleeLe ? "opacity-60" : ""}`}>
                  <td className="!pl-5">
                    <Link href={`/facturation/factures/${item.id}`} className="block after:absolute after:inset-0">
                      <span className="block font-semibold group-hover:text-desk">{item.clientNom}</span>
                      <span className="block text-xs text-ink/45">
                        {item.numero} · {item.dossier.reference}
                        {item.devis ? ` · ${item.devis.numero}` : ""}
                      </span>
                    </Link>
                  </td>
                  <td className="max-w-60 truncate text-ink/70">
                    {item.paiementId ? <span className="mr-1.5 text-xs font-semibold text-ink/40">Reçu</span> : null}
                    {item.libelle}
                  </td>
                  <td className="text-ink/70">{formatJour(item.creeLe)}</td>
                  <td className="text-ink/70">{item.paiementId ? "—" : item.echeanceLe ? formatJour(item.echeanceLe) : "À réception"}</td>
                  <td><Badge ton={item.etat.ton} point>{item.etat.label}</Badge></td>
                  <td className={`text-right font-semibold tabular-nums ${item.annuleeLe ? "line-through" : ""}`}>{xof(item.montant)}</td>
                  <td className={`!pr-5 text-right tabular-nums ${item.reste > 0 ? "font-semibold text-cap" : "text-ink/40"}`}>{item.reste > 0 ? xof(item.reste) : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {(vue === "devis" ? devisVisibles : facturesVisibles).length > AFFICHES ? (
        <p className="text-center text-xs text-ink/45">Seuls les {AFFICHES} documents les plus récents sont affichés : affinez la recherche pour retrouver les plus anciens.</p>
      ) : null}
    </section>
  );
}
