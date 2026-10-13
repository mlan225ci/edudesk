import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { cleMois, moisDepuisCle, nomComplet } from "@/lib/format";
import { STATUTS, labelCategorie, labelMode, labelSource, labelTypePaiement } from "@/lib/labels";
import { voitCompta, voitDepenses, voitFinance, voitRapports } from "@/server/permissions";
import { getUser } from "@/server/session";

type Ligne = (string | number | null | undefined)[];

function csv(entetes: string[], lignes: Ligne[]) {
  const cellule = (valeur: string | number | null | undefined) => {
    const texte = valeur == null ? "" : String(valeur);
    return /[;"\n\r]/.test(texte) ? `"${texte.replace(/"/g, '""')}"` : texte;
  };
  return "\uFEFF" + [entetes, ...lignes].map((ligne) => ligne.map(cellule).join(";")).join("\r\n");
}

const jour = (date: Date | null | undefined) => (date ? date.toISOString().slice(0, 10) : "");

export async function GET(request: Request, context: { params: Promise<{ type: string }> }) {
  const user = await getUser();
  if (!user || user.role === "PARTENAIRE") return new NextResponse("Non autorise", { status: 401 });
  const { type } = await context.params;
  const debut = moisDepuisCle(new URL(request.url).searchParams.get("mois") ?? undefined);
  const fin = new Date(Date.UTC(debut.getUTCFullYear(), debut.getUTCMonth() + 1, 1));
  const periode = { gte: debut, lt: fin };
  let contenu: string;

  if (type === "paiements") {
    if (!voitFinance(user.role)) return new NextResponse("Non autorise", { status: 403 });
    const paiements = await prisma.paiement.findMany({
      where: { dateEncaissement: periode },
      include: { client: true, dossier: true, facture: true },
      orderBy: { dateEncaissement: "asc" },
    });
    contenu = csv(
      ["Date", "Numéro", "Facture", "Client", "Dossier", "Type", "Moyen", "Précision", "Référence", "Montant XOF"],
      paiements.map((p) => [
        jour(p.dateEncaissement), p.numero, p.facture?.numero, nomComplet(p.client), p.dossier.reference,
        labelTypePaiement(p.type), labelMode(p.mode), p.precision, p.referenceExterne, p.montant,
      ]),
    );
  } else if (type === "depenses") {
    if (!voitDepenses(user.role) && !voitRapports(user.role)) return new NextResponse("Non autorise", { status: 403 });
    const depenses = await prisma.depense.findMany({ where: { date: periode }, include: { partenaire: true }, orderBy: { date: "asc" } });
    contenu = csv(
      ["Date", "Numéro", "Catégorie", "Motif", "Fournisseur", "Partenaire", "Moyen", "Référence", "Montant XOF"],
      depenses.map((d) => [
        jour(d.date), d.numero, labelCategorie(d.categorie), d.libelle, d.fournisseur, d.partenaire?.nom, labelMode(d.mode), d.reference, d.montant,
      ]),
    );
  } else if (type === "ecritures") {
    if (!voitCompta(user.role)) return new NextResponse("Non autorise", { status: 403 });
    const ecritures = await prisma.ecriture.findMany({ where: { date: periode }, orderBy: [{ date: "asc" }, { journal: "asc" }] });
    contenu = csv(
      ["Date", "Journal", "Compte", "Libellé", "Débit", "Crédit"],
      ecritures.map((e) => [jour(e.date), e.journal, e.compte, e.libelle, e.debit || "", e.credit || ""]),
    );
  } else if (type === "dossiers") {
    const dossiers = await prisma.dossier.findMany({
      include: { client: true, procedure: true, paiements: { select: { montant: true } } },
      orderBy: { ouvertLe: "asc" },
    });
    const finance = voitFinance(user.role);
    contenu = csv(
      ["Référence", "Ouvert le", "Client", "Téléphone", "Procédure", "Destination", "Statut", ...(finance ? ["Convenu XOF", "Payé XOF", "Reste XOF"] : [])],
      dossiers.map((d) => {
        const convenu = d.montantConvenu ?? d.procedure.tarifXof;
        const paye = d.paiements.reduce((somme, p) => somme + p.montant, 0);
        return [
          d.reference, jour(d.ouvertLe), nomComplet(d.client), d.client.telephone, d.procedure.nom, d.procedure.destination, STATUTS[d.statut],
          ...(finance ? [convenu, paye, Math.max(convenu - paye, 0)] : []),
        ];
      }),
    );
  } else if (type === "clients") {
    const clients = await prisma.client.findMany({ include: { partenaire: true, _count: { select: { dossiers: true } } }, orderBy: { nom: "asc" } });
    contenu = csv(
      ["Nom", "Prénom", "Téléphone", "E-mail", "Pays visé", "Partenaire", "Dossiers", "Créé le"],
      clients.map((c) => [c.nom, c.prenom, c.telephone, c.email, c.paysVise, c.partenaire?.nom, c._count.dossiers, jour(c.creeLe)]),
    );
  } else if (type === "prospects") {
    const prospects = await prisma.prospect.findMany({ include: { partenaire: true }, orderBy: { creeLe: "asc" } });
    contenu = csv(
      ["Nom", "Prénom", "Téléphone", "E-mail", "Source", "Partenaire", "Relance", "Converti", "Créé le"],
      prospects.map((p) => [p.nom, p.prenom, p.telephone, p.email, labelSource(p.source), p.partenaire?.nom, jour(p.relanceLe), p.converti ? "Oui" : "Non", jour(p.creeLe)]),
    );
  } else {
    return new NextResponse("Export inconnu", { status: 404 });
  }

  return new NextResponse(contenu, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="edudesk-${type}-${cleMois(debut)}.csv"`,
    },
  });
}
