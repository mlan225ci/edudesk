import { prisma } from "@/lib/db";
import { cleMois, labelMois, nomComplet } from "@/lib/format";
import { CATEGORIES_DEPENSE, MODES, TYPES_PAIEMENT, labelSource } from "@/lib/labels";

export type TypePeriode = "semaine" | "mois" | "trimestre" | "semestre" | "annee";

export const TYPES_PERIODE: { value: TypePeriode; label: string }[] = [
  { value: "semaine", label: "Semaine" },
  { value: "mois", label: "Mois" },
  { value: "trimestre", label: "Trimestre" },
  { value: "semestre", label: "Semestre" },
  { value: "annee", label: "Année" },
];

export type Periode = { type: TypePeriode; cle: string; libelle: string; debut: Date; fin: Date };

const utc = (annee: number, mois: number, jour = 1) => new Date(Date.UTC(annee, mois, jour));

function lundiIso(annee: number, semaine: number) {
  const quatreJanvier = utc(annee, 0, 4);
  const decalage = (quatreJanvier.getUTCDay() + 6) % 7;
  return new Date(quatreJanvier.getTime() - decalage * 864e5 + (semaine - 1) * 7 * 864e5);
}

function semaineIso(date: Date) {
  const jour = utc(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
  const jeudi = new Date(jour.getTime() + (3 - ((jour.getUTCDay() + 6) % 7)) * 864e5);
  const annee = jeudi.getUTCFullYear();
  return { annee, semaine: Math.floor((jeudi.getTime() - lundiIso(annee, 1).getTime()) / (7 * 864e5)) + 1 };
}

const jourCourt = (date: Date) => new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "short", timeZone: "UTC" }).format(date);

export function construirePeriode(type: TypePeriode, debut: Date): Periode {
  const annee = debut.getUTCFullYear();
  const mois = debut.getUTCMonth();
  switch (type) {
    case "semaine": {
      const { annee: a, semaine } = semaineIso(debut);
      const lundi = lundiIso(a, semaine);
      const fin = new Date(lundi.getTime() + 7 * 864e5);
      return {
        type,
        cle: `${a}-W${String(semaine).padStart(2, "0")}`,
        libelle: `Semaine ${semaine} · ${jourCourt(lundi)} – ${jourCourt(new Date(fin.getTime() - 864e5))} ${a}`,
        debut: lundi,
        fin,
      };
    }
    case "mois":
      return { type, cle: cleMois(debut), libelle: labelMois(utc(annee, mois), true), debut: utc(annee, mois), fin: utc(annee, mois + 1) };
    case "trimestre": {
      const t = Math.floor(mois / 3);
      return { type, cle: `${annee}-T${t + 1}`, libelle: `${t + 1}${t ? "e" : "er"} trimestre ${annee}`, debut: utc(annee, t * 3), fin: utc(annee, t * 3 + 3) };
    }
    case "semestre": {
      const s = Math.floor(mois / 6);
      return { type, cle: `${annee}-S${s + 1}`, libelle: `${s + 1}${s ? "e" : "er"} semestre ${annee}`, debut: utc(annee, s * 6), fin: utc(annee, s * 6 + 6) };
    }
    default:
      return { type: "annee", cle: String(annee), libelle: `Année ${annee}`, debut: utc(annee, 0), fin: utc(annee + 1, 0) };
  }
}

export function lirePeriode(type: string | undefined, cle: string | undefined): Periode {
  const genre = (TYPES_PERIODE.find((item) => item.value === type)?.value ?? "mois") as TypePeriode;
  const valeur = cle ?? "";
  let debut = new Date();
  let trouve: RegExpExecArray | null;
  if ((trouve = /^(\d{4})-W(\d{2})$/.exec(valeur))) debut = lundiIso(Number(trouve[1]), Number(trouve[2]));
  else if ((trouve = /^(\d{4})-(\d{2})$/.exec(valeur))) debut = utc(Number(trouve[1]), Number(trouve[2]) - 1);
  else if ((trouve = /^(\d{4})-T([1-4])$/.exec(valeur))) debut = utc(Number(trouve[1]), (Number(trouve[2]) - 1) * 3);
  else if ((trouve = /^(\d{4})-S([12])$/.exec(valeur))) debut = utc(Number(trouve[1]), (Number(trouve[2]) - 1) * 6);
  else if ((trouve = /^(\d{4})$/.exec(valeur))) debut = utc(Number(trouve[1]), 0);
  return construirePeriode(genre, debut);
}

export function periodePrecedente(periode: Periode) {
  return construirePeriode(periode.type, new Date(periode.debut.getTime() - 864e5));
}

export function periodesRecentes(type: TypePeriode, nombre: number) {
  const liste: Periode[] = [];
  let courante = construirePeriode(type, new Date());
  for (let index = 0; index < nombre; index++) {
    liste.push(courante);
    courante = periodePrecedente(courante);
  }
  return liste;
}

export function subdivisions(periode: Periode) {
  if (periode.type === "semaine" || periode.type === "mois") {
    const jours: { cle: string; label: string }[] = [];
    for (let t = periode.debut.getTime(); t < periode.fin.getTime(); t += 864e5) {
      const date = new Date(t);
      jours.push({
        cle: date.toISOString().slice(0, 10),
        label: periode.type === "semaine" ? new Intl.DateTimeFormat("fr-FR", { weekday: "short", day: "numeric", timeZone: "UTC" }).format(date) : String(date.getUTCDate()),
      });
    }
    return { cles: jours, cle: (date: Date) => date.toISOString().slice(0, 10) };
  }
  const mois: { cle: string; label: string }[] = [];
  for (let date = periode.debut; date < periode.fin; date = utc(date.getUTCFullYear(), date.getUTCMonth() + 1)) {
    mois.push({ cle: cleMois(date), label: labelMois(date) });
  }
  return { cles: mois, cle: cleMois };
}

const somme = (liste: { montant: number }[]) => liste.reduce((total, element) => total + element.montant, 0);

function regrouper<T>(elements: T[], cle: (element: T) => string, valeur: (element: T) => number = () => 1) {
  const totaux = new Map<string, number>();
  for (const element of elements) totaux.set(cle(element), (totaux.get(cle(element)) ?? 0) + valeur(element));
  return totaux;
}

export async function calculerStatistiques(periode: Periode) {
  const intervalle = { gte: periode.debut, lt: periode.fin };
  const [paiements, depenses, prospects, clients, dossiers, etapes, admissions, visas, devisEmis, devisDecides, traductions, sms, mails, utilisateurs] = await Promise.all([
    prisma.paiement.findMany({ where: { dateEncaissement: intervalle }, select: { montant: true, type: true, mode: true, dateEncaissement: true } }),
    prisma.depense.findMany({ where: { date: intervalle }, select: { montant: true, categorie: true, date: true } }),
    prisma.prospect.findMany({ where: { creeLe: intervalle }, select: { source: true, converti: true } }),
    prisma.client.count({ where: { creeLe: intervalle } }),
    prisma.dossier.findMany({ where: { ouvertLe: intervalle }, select: { procedure: { select: { nom: true } } } }),
    prisma.dossierEtape.findMany({
      where: { statut: "CLOTUREE", clotureLe: intervalle },
      select: { responsableId: true, limiteLe: true, clotureLe: true, debutLe: true },
    }),
    prisma.candidature.count({ where: { statut: { in: ["ADMIS", "CHOISIE"] }, reponseLe: intervalle } }),
    prisma.audit.count({ where: { action: "CLOTURE_ETAPE", creeLe: intervalle, detail: { contains: "Visa accepté" } } }),
    prisma.devis.findMany({ where: { creeLe: intervalle }, select: { total: true } }),
    prisma.devis.findMany({ where: { decideLe: intervalle }, select: { total: true, statut: true } }),
    prisma.traduction.count({ where: { statut: "TERMINEE", termineLe: intervalle } }),
    prisma.notificationSms.count({ where: { creeLe: intervalle } }),
    prisma.notificationMail.count({ where: { creeLe: intervalle } }),
    prisma.user.findMany({ where: { role: { not: "PARTENAIRE" } }, select: { id: true, prenom: true, nom: true } }),
  ]);

  const produits = somme(paiements);
  const charges = somme(depenses);
  const aTemps = etapes.filter((etape) => !etape.limiteLe || (etape.clotureLe && etape.clotureLe <= etape.limiteLe)).length;
  const durees = etapes.filter((etape) => etape.debutLe && etape.clotureLe).map((etape) => (etape.clotureLe!.getTime() - etape.debutLe!.getTime()) / 36e5);
  const noms = new Map(utilisateurs.map((user) => [user.id, nomComplet(user)]));
  const parCollaborateur = new Map<string, { clotures: number; retards: number }>();
  for (const etape of etapes) {
    if (!etape.responsableId) continue;
    const ligne = parCollaborateur.get(etape.responsableId) ?? { clotures: 0, retards: 0 };
    ligne.clotures += 1;
    if (etape.limiteLe && etape.clotureLe && etape.clotureLe > etape.limiteLe) ligne.retards += 1;
    parCollaborateur.set(etape.responsableId, ligne);
  }
  const decoupage = subdivisions(periode);
  const acceptes = devisDecides.filter((devis) => devis.statut === "ACCEPTE");

  return {
    finances: {
      produits,
      charges,
      resultat: produits - charges,
      nombreEncaissements: paiements.length,
      parType: TYPES_PAIEMENT.map((type) => ({ label: type.label, montant: somme(paiements.filter((p) => p.type === type.value)) })),
      parMode: MODES.map((mode) => ({ label: mode.label, montant: somme(paiements.filter((p) => p.mode === mode.value)) })),
      parCategorie: CATEGORIES_DEPENSE.map((categorie) => ({
        label: `${categorie.compte} · ${categorie.label}`,
        montant: somme(depenses.filter((d) => d.categorie === categorie.value)),
      })).filter((ligne) => ligne.montant > 0),
      produitsParSubdivision: regrouper(paiements, (p) => decoupage.cle(p.dateEncaissement), (p) => p.montant),
      chargesParSubdivision: regrouper(depenses, (d) => decoupage.cle(d.date), (d) => d.montant),
      subdivisions: decoupage.cles,
    },
    commercial: {
      prospects: prospects.length,
      convertis: prospects.filter((prospect) => prospect.converti).length,
      parSource: [...regrouper(prospects, (prospect) => labelSource(prospect.source)).entries()].sort((a, b) => b[1] - a[1]),
      clients,
      dossiers: dossiers.length,
      parProcedure: [...regrouper(dossiers, (dossier) => dossier.procedure.nom).entries()].sort((a, b) => b[1] - a[1]),
      devisEmis: devisEmis.length,
      montantDevis: devisEmis.reduce((total, devis) => total + devis.total, 0),
      devisAcceptes: acceptes.length,
      montantAcceptes: acceptes.reduce((total, devis) => total + devis.total, 0),
      devisRefuses: devisDecides.length - acceptes.length,
    },
    operations: {
      etapesCloturees: etapes.length,
      aTemps,
      tauxATemps: etapes.length ? Math.round((aTemps / etapes.length) * 100) : null,
      dureeMoyenneHeures: durees.length ? Math.round(durees.reduce((a, b) => a + b, 0) / durees.length) : null,
      admissions,
      visas,
      traductions,
      sms,
      mails,
      equipe: [...parCollaborateur.entries()]
        .map(([id, ligne]) => ({ nom: noms.get(id) ?? "—", ...ligne }))
        .sort((a, b) => b.clotures - a.clotures),
    },
  };
}

export type Statistiques = Awaited<ReturnType<typeof calculerStatistiques>>;
