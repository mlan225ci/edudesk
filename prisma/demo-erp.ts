import type { CategorieDepense, ModePaiement, Prisma, TypePaiement } from "@prisma/client";
import { prisma } from "../src/lib/db";
import { creerDossier, enregistrerDepense, enregistrerPaiement } from "../src/server/engine";
import type { SessionUser } from "../src/server/permissions";

const TARIFS: Record<string, number> = {
  IRLANDE: 950000,
  CANADA: 1500000,
  FRANCE_PUBLIC: 650000,
  FRANCE_PRIVE: 900000,
  RP: 1200000,
  VISITEUR: 350000,
};

const PREFIXE_CLIENTS = "+22507074440";

const CLIENTS: {
  prenom: string;
  nom: string;
  procedure: string;
  mois: number;
  partenaire?: boolean;
  paiements: [number, number, ModePaiement][];
}[] = [
  { prenom: "Fatou", nom: "Kone", procedure: "FRANCE_PRIVE", mois: -5, partenaire: true, paiements: [[-5, 300000, "MOBILE_MONEY"], [-3, 400000, "VIREMENT"], [-1, 200000, "ESPECES"]] },
  { prenom: "Ibrahim", nom: "Traore", procedure: "CANADA", mois: -5, paiements: [[-5, 500000, "VIREMENT"], [-2, 600000, "VIREMENT"]] },
  { prenom: "Aminata", nom: "Diallo", procedure: "IRLANDE", mois: -4, paiements: [[-4, 450000, "MOBILE_MONEY"], [-1, 500000, "VIREMENT"]] },
  { prenom: "Jean-Marc", nom: "Kouassi", procedure: "FRANCE_PUBLIC", mois: -4, paiements: [[-4, 250000, "ESPECES"], [-2, 400000, "MOBILE_MONEY"]] },
  { prenom: "Mariame", nom: "Ouattara", procedure: "RP", mois: -3, paiements: [[-3, 600000, "VIREMENT"], [0, 300000, "MOBILE_MONEY"]] },
  { prenom: "Serge", nom: "Yao", procedure: "FRANCE_PUBLIC", mois: -2, partenaire: true, paiements: [[-2, 350000, "ESPECES"]] },
  { prenom: "Grace", nom: "Bamba", procedure: "CANADA", mois: -1, paiements: [[-1, 700000, "VIREMENT"], [0, 400000, "VIREMENT"]] },
  { prenom: "Moussa", nom: "Coulibaly", procedure: "FRANCE_PRIVE", mois: 0, paiements: [[0, 300000, "MOBILE_MONEY"]] },
];

const CHARGES_MENSUELLES: { categorie: CategorieDepense; libelle: string; montant: number; mode: ModePaiement; jour: number; fournisseur?: string; tousLes?: number }[] = [
  { categorie: "LOYER", libelle: "Loyer des bureaux", montant: 250000, mode: "VIREMENT", jour: 2, fournisseur: "SCI Plateau" },
  { categorie: "SALAIRES", libelle: "Salaires du personnel", montant: 520000, mode: "VIREMENT", jour: 28 },
  { categorie: "TELECOM", libelle: "Internet fibre et forfaits", montant: 45000, mode: "MOBILE_MONEY", jour: 5, fournisseur: "Orange CI" },
  { categorie: "TRANSPORT", libelle: "Courses ambassades et écoles", montant: 35000, mode: "ESPECES", jour: 12 },
  { categorie: "FOURNITURES", libelle: "Papeterie et impressions", montant: 25000, mode: "ESPECES", jour: 9, fournisseur: "Librairie de France" },
  { categorie: "MARKETING", libelle: "Campagne réseaux sociaux", montant: 120000, mode: "MOBILE_MONEY", jour: 15, fournisseur: "Meta", tousLes: 2 },
  { categorie: "FRAIS_BANCAIRES", libelle: "Frais de tenue de compte", montant: 8000, mode: "VIREMENT", jour: 30 },
];

const SOLDES_OUVERTURE: { compte: string; montant: number }[] = [
  { compte: "521", montant: 4000000 },
  { compte: "571", montant: 250000 },
  { compte: "558", montant: 150000 },
];

function dateDansMois(decalage: number, jour: number) {
  const maintenant = new Date();
  const base = new Date(Date.UTC(maintenant.getUTCFullYear(), maintenant.getUTCMonth() + decalage, 1));
  const dernier = new Date(Date.UTC(base.getUTCFullYear(), base.getUTCMonth() + 1, 0)).getUTCDate();
  const limite = decalage === 0 ? maintenant.getUTCDate() : dernier;
  return new Date(Date.UTC(base.getUTCFullYear(), base.getUTCMonth(), Math.max(1, Math.min(jour, limite)), 12));
}

export async function chargerDemoErp() {
  for (const [code, tarif] of Object.entries(TARIFS)) {
    await prisma.procedure.updateMany({ where: { code, tarifXof: 0 }, data: { tarifXof: tarif } });
  }

  const direction = (await prisma.user.findFirstOrThrow({ where: { role: "CEO" } })) as SessionUser;
  const comptable = ((await prisma.user.findFirst({ where: { role: "COMPTABLE" } })) ?? direction) as SessionUser;
  const partenaire = await prisma.partenaire.findFirst();
  const utilisateurs = await prisma.user.findMany({ where: { role: { not: "PARTENAIRE" } } });
  const parRole = (role: string) => utilisateurs.find((user) => user.role === role)?.id ?? null;

  if ((await prisma.ecriture.count({ where: { journal: "AN" } })) === 0) {
    const date = dateDansMois(-6, 1);
    await prisma.ecriture.createMany({
      data: SOLDES_OUVERTURE.flatMap(({ compte, montant }) => [
        { date, journal: "AN", compte, libelle: "Solde d'ouverture", debit: montant },
        { date, journal: "AN", compte: "101", libelle: "Solde d'ouverture", credit: montant },
      ]),
    });
  }

  if ((await prisma.client.count({ where: { telephone: { startsWith: PREFIXE_CLIENTS } } })) === 0) {
    let rang = 0;
    for (const fiche of CLIENTS) {
      rang += 1;
      const procedure = await prisma.procedure.findUnique({ where: { code: fiche.procedure } });
      if (!procedure?.actif) continue;
      const client = await prisma.client.create({
        data: {
          prenom: fiche.prenom,
          nom: fiche.nom,
          telephone: `${PREFIXE_CLIENTS}${String(rang).padStart(2, "0")}`,
          paysVise: procedure.destination,
          partenaireId: fiche.partenaire ? partenaire?.id : null,
        },
      });
      const cree = await creerDossier({ clientId: client.id, procedureId: procedure.id, actor: direction });
      if (!cree.ok || !cree.dossierId) continue;
      await prisma.dossier.update({ where: { id: cree.dossierId }, data: { ouvertLe: dateDansMois(fiche.mois, 3 + rang) } });
      let index = 0;
      for (const [mois, montant, mode] of fiche.paiements) {
        const type: TypePaiement = index === 0 ? "ACOMPTE_DOSSIER" : index === 1 ? "FRAIS" : "ACOMPTE_SCOLARITE";
        await enregistrerPaiement({
          dossierId: cree.dossierId,
          type,
          montant,
          mode: mode as "ESPECES" | "VIREMENT" | "MOBILE_MONEY",
          precision: mode === "MOBILE_MONEY" ? "Orange Money" : mode === "VIREMENT" ? "SGBCI" : undefined,
          dateEncaissement: dateDansMois(mois, 6 + rang + index * 5),
          actor: direction,
        });
        index += 1;
      }
    }
  }

  if ((await prisma.depense.count()) === 0) {
    for (let decalage = -5; decalage <= 0; decalage += 1) {
      for (const charge of CHARGES_MENSUELLES) {
        if (charge.tousLes && decalage % charge.tousLes !== 0) continue;
        if (decalage === 0 && charge.jour > new Date().getUTCDate()) continue;
        await enregistrerDepense({
          date: dateDansMois(decalage, charge.jour),
          categorie: charge.categorie,
          libelle: charge.libelle,
          montant: charge.montant + (decalage % 2 === 0 ? 0 : Math.round(charge.montant * 0.08)),
          mode: charge.mode,
          fournisseur: charge.fournisseur,
          actor: comptable,
        });
      }
    }
    if (partenaire) {
      await enregistrerDepense({
        date: dateDansMois(-1, 20),
        categorie: "COMMISSION",
        libelle: `Commission ${partenaire.nom}`,
        montant: 50000,
        mode: "MOBILE_MONEY",
        partenaireId: partenaire.id,
        actor: comptable,
      });
    }
  }

  const commercial = await prisma.user.findFirst({ where: { role: "COMMERCIAL" } });
  if (commercial && (await prisma.prospect.count({ where: { nom: "Prospect" } })) === 0) {
    const sources = ["RESEAUX_SOCIAUX", "RESEAUX_SOCIAUX", "APPEL", "TERRAIN", "APPORTEUR", "RESEAUX_SOCIAUX", "PARTENAIRE"] as const;
    const prenoms = ["Ange", "Christelle", "Didier", "Estelle", "Franck", "Habib", "Inès"];
    const convertis = await prisma.client.findMany({ where: { telephone: { startsWith: PREFIXE_CLIENTS } }, take: 3 });
    for (const [index, source] of sources.entries()) {
      const client = convertis[index];
      await prisma.prospect.create({
        data: {
          prenom: prenoms[index],
          nom: "Prospect",
          telephone: `+22507075550${index}`,
          source,
          partenaireId: source === "PARTENAIRE" ? partenaire?.id : null,
          relanceLe: client ? null : dateDansMois(0, new Date().getUTCDate() + (index % 3)),
          converti: Boolean(client),
          clientId: client?.id ?? null,
          creeParId: commercial.id,
          creeLe: dateDansMois(-(index % 4), 10),
        },
      });
    }
  }

  if ((await prisma.materiel.count()) === 0) {
    const materiels: Prisma.MaterielCreateManyInput[] = [
      { designation: "Ordinateur portable HP ProBook", categorie: "Informatique", numeroSerie: "HP-5CD1234", valeurXof: 450000, affecteAId: parRole("INFORMATICIEN_VISA"), localisation: "Bureau visas" },
      { designation: "Ordinateur portable Lenovo ThinkPad", categorie: "Informatique", numeroSerie: "LN-PF2X9", valeurXof: 420000, affecteAId: parRole("INFORMATICIEN_ECOLE"), localisation: "Bureau écoles" },
      { designation: "Imprimante multifonction Canon", categorie: "Informatique", numeroSerie: "CN-MF445", valeurXof: 280000, localisation: "Accueil" },
      { designation: "Climatiseur split 1,5 CV", categorie: "Climatisation", valeurXof: 320000, etat: "USAGE", localisation: "Salle d'attente" },
      { designation: "Bureau direction", categorie: "Mobilier", valeurXof: 180000, affecteAId: parRole("CEO"), localisation: "Direction" },
      { designation: "Téléphone Samsung A15", categorie: "Téléphonie", valeurXof: 95000, etat: "PANNE", affecteAId: parRole("COMMERCIAL") },
    ];
    await prisma.materiel.createMany({ data: materiels.map((item) => ({ ...item, acquisLe: dateDansMois(-8, 10) })) });
  }

  if ((await prisma.conge.count()) === 0) {
    const traducteur = parRole("TRADUCTEUR");
    const coach = parRole("COACH");
    const maintenant = Date.now();
    if (traducteur) {
      await prisma.conge.create({
        data: {
          userId: traducteur,
          type: "CONGE",
          debut: new Date(maintenant - 864e5),
          fin: new Date(maintenant + 3 * 864e5),
          statut: "VALIDE",
          traiteParId: direction.id,
        },
      });
    }
    if (coach) {
      await prisma.conge.create({
        data: { userId: coach, type: "PERMISSION", debut: new Date(maintenant + 7 * 864e5), fin: new Date(maintenant + 8 * 864e5), motif: "Évènement familial" },
      });
    }
  }

  console.log("Données de démonstration ERP à jour.");
}

if (process.argv[1]?.replace(/\\/g, "/").endsWith("prisma/demo-erp.ts")) {
  chargerDemoErp()
    .catch((error) => {
      console.error(error);
      process.exit(1);
    })
    .finally(async () => {
      await prisma.$disconnect();
    });
}
