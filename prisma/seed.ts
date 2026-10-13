import bcrypt from "bcryptjs";
import type { Role } from "@prisma/client";
import { prisma } from "../src/lib/db";
import { creerDossier, cloturerEtape, enregistrerPaiement } from "../src/server/engine";
import type { SessionUser } from "../src/server/permissions";
import { chargerDemoErp } from "./demo-erp";
import { MODELES_SMS, PROCEDURES } from "./procedures";

const MOT_DE_PASSE = "Edudesk2026!";

const COMPTES: { prenom: string; nom: string; email: string; telephone: string; role: Role }[] = [
  { prenom: "Direction", nom: "Demo", email: "direction@edudesk.ci", telephone: "+2250707000001", role: "CEO" },
  { prenom: "Administrateur", nom: "Demo", email: "dga@edudesk.ci", telephone: "+2250707000002", role: "ADMINISTRATEUR" },
  { prenom: "Responsable", nom: "Demo", email: "commerciale@edudesk.ci", telephone: "+2250707000003", role: "RESPONSABLE_COMMERCIALE" },
  { prenom: "Commercial", nom: "Demo", email: "commercial@edudesk.ci", telephone: "+2250707000004", role: "COMMERCIAL" },
  { prenom: "Assistante", nom: "Demo", email: "assistante@edudesk.ci", telephone: "+2250707000005", role: "ASSISTANTE_ADMINISTRATIVE" },
  { prenom: "Visa", nom: "Demo", email: "visa@edudesk.ci", telephone: "+2250707000006", role: "INFORMATICIEN_VISA" },
  { prenom: "Ecole", nom: "Demo", email: "ecole@edudesk.ci", telephone: "+2250707000007", role: "INFORMATICIEN_ECOLE" },
  { prenom: "Coach", nom: "Demo", email: "coach@edudesk.ci", telephone: "+2250707000008", role: "COACH" },
  { prenom: "Coach RP", nom: "Demo", email: "coach.rp@edudesk.ci", telephone: "+2250707000009", role: "COACH_RP" },
  { prenom: "Traducteur", nom: "Demo", email: "traducteur@edudesk.ci", telephone: "+2250707000010", role: "TRADUCTEUR" },
  { prenom: "Community", nom: "Demo", email: "cm@edudesk.ci", telephone: "+2250707000011", role: "COMMUNITY_MANAGER" },
  { prenom: "Comptable", nom: "Demo", email: "comptable@edudesk.ci", telephone: "+2250707000012", role: "COMPTABLE" },
  { prenom: "Logistique", nom: "Demo", email: "logistique@edudesk.ci", telephone: "+2250707000013", role: "MOYENS_GENERAUX" },
  { prenom: "Partenaire", nom: "Demo", email: "partenaire@edudesk.ci", telephone: "+2250707000014", role: "PARTENAIRE" },
];

async function vider() {
  await prisma.notificationInterne.deleteMany();
  await prisma.notificationSms.deleteMany();
  await prisma.audit.deleteMany();
  await prisma.conge.deleteMany();
  await prisma.materiel.deleteMany();
  await prisma.ecriture.deleteMany();
  await prisma.depense.deleteMany();
  await prisma.facture.deleteMany();
  await prisma.paiement.deleteMany();
  await prisma.tacheDossier.deleteMany();
  await prisma.pieceDossier.deleteMany();
  await prisma.dossierIssue.deleteMany();
  await prisma.dossierEtape.deleteMany();
  await prisma.dossier.deleteMany();
  await prisma.prospect.deleteMany();
  await prisma.client.deleteMany();
  await prisma.issueModele.deleteMany();
  await prisma.tacheModele.deleteMany();
  await prisma.pieceModele.deleteMany();
  await prisma.etapeModele.deleteMany();
  await prisma.procedure.deleteMany();
  await prisma.modeleSms.deleteMany();
  await prisma.compteur.deleteMany();
  await prisma.user.updateMany({ data: { superieurId: null, partenaireId: null } });
  await prisma.user.deleteMany();
  await prisma.partenaire.deleteMany();
}

async function terminer(etapeId: string, actor: SessionUser) {
  await prisma.tacheDossier.updateMany({
    where: { dossierEtapeId: etapeId },
    data: { faite: true, faiteLe: new Date(), faiteParId: actor.id },
  });
  await prisma.pieceDossier.updateMany({
    where: { dossierEtapeId: etapeId },
    data: { recue: true, recueLe: new Date(), recueParId: actor.id },
  });
  const resultat = await cloturerEtape({ etapeId, actor, observation: "Etape de demonstration" });
  if (!resultat.ok) {
    throw new Error(`${resultat.error} ${resultat.manques?.join(", ") ?? ""}`);
  }
}

async function main() {
  await vider();
  const hash = await bcrypt.hash(MOT_DE_PASSE, 10);
  const partenaire = await prisma.partenaire.create({
    data: {
      nom: "Partenaire Demo Plateau",
      type: "Professionnel",
      telephone: "+2250707000014",
      email: "partenaire@edudesk.ci",
    },
  });

  for (const compte of COMPTES) {
    await prisma.user.create({
      data: {
        ...compte,
        motDePasseHash: hash,
        partenaireId: compte.role === "PARTENAIRE" ? partenaire.id : null,
      },
    });
  }

  const parEmail = async (email: string) =>
    prisma.user.findUniqueOrThrow({ where: { email } }) as Promise<SessionUser>;

  const direction = await parEmail("direction@edudesk.ci");
  const commercial = await prisma.user.findUniqueOrThrow({ where: { email: "commercial@edudesk.ci" } });
  const responsable = await prisma.user.findUniqueOrThrow({ where: { email: "commerciale@edudesk.ci" } });
  const admin = await prisma.user.findUniqueOrThrow({ where: { email: "dga@edudesk.ci" } });
  await prisma.user.update({ where: { id: admin.id }, data: { superieurId: direction.id } });
  await prisma.user.update({ where: { id: responsable.id }, data: { superieurId: admin.id } });
  await prisma.user.update({ where: { id: commercial.id }, data: { superieurId: responsable.id } });

  for (const procedure of PROCEDURES) {
    await prisma.procedure.create({
      data: {
        code: procedure.code,
        nom: procedure.nom,
        destination: procedure.destination,
        actif: procedure.actif,
        ecoles: procedure.ecoles ?? false,
        commissionXof: procedure.code === "FRANCE_PRIVE" ? 50000 : procedure.code === "CANADA" ? 75000 : 0,
        etapes: {
          create: procedure.etapes.map((etape, index) => ({
            rang: index + 1,
            titre: etape.titre,
            delaiHeures: etape.delaiHeures,
            roles: etape.roles.join(","),
            acompte: etape.acompte ?? "AUCUN",
            jalon: etape.jalon ?? null,
            choixEcole: etape.choixEcole ?? false,
            taches: { create: etape.taches.map((tache, ordre) => ({ ordre: ordre + 1, ...tache })) },
            pieces: { create: (etape.pieces ?? []).map((piece, ordre) => ({ ordre: ordre + 1, ...piece })) },
            issues: { create: (etape.issues ?? []).map((issue, ordre) => ({ ordre: ordre + 1, ...issue })) },
          })),
        },
      },
    });
  }

  await prisma.modeleSms.createMany({ data: MODELES_SMS });

  const france = await prisma.procedure.findUniqueOrThrow({ where: { code: "FRANCE_PRIVE" } });
  const canada = await prisma.procedure.findUniqueOrThrow({ where: { code: "CANADA" } });
  const irlande = await prisma.procedure.findUniqueOrThrow({ where: { code: "IRLANDE" } });

  const awa = await prisma.client.create({
    data: {
      prenom: "Awa",
      nom: "Demo",
      telephone: "+2250707222221",
      email: "awa.demo@example.com",
      paysVise: "France",
      partenaireId: partenaire.id,
    },
  });
  const koffi = await prisma.client.create({
    data: {
      prenom: "Koffi",
      nom: "Demo",
      telephone: "+2250707222222",
      paysVise: "Canada",
    },
  });
  const mariam = await prisma.client.create({
    data: {
      prenom: "Mariam",
      nom: "Demo",
      telephone: "+2250707222223",
      paysVise: "Irlande",
    },
  });

  const dossierAwa = await creerDossier({ clientId: awa.id, procedureId: france.id, actor: direction });
  const dossierKoffi = await creerDossier({ clientId: koffi.id, procedureId: canada.id, actor: direction });
  const dossierMariam = await creerDossier({ clientId: mariam.id, procedureId: irlande.id, actor: commercial });
  if (!dossierAwa.ok || !dossierKoffi.ok || !dossierMariam.ok) {
    throw new Error("Ouverture de demonstration impossible");
  }

  async function etapeCourante(dossierId: string) {
    return prisma.dossierEtape.findFirstOrThrow({ where: { dossierId, statut: "EN_COURS" } });
  }

  let courante = await etapeCourante(dossierAwa.dossierId!);
  await terminer(courante.id, direction);
  courante = await etapeCourante(dossierAwa.dossierId!);
  await enregistrerPaiement({
    dossierId: dossierAwa.dossierId!,
    type: "ACOMPTE_DOSSIER",
    montant: 150000,
    mode: "MOBILE_MONEY",
    precision: "Orange Money",
    referenceExterne: "OM-DEMO-150",
    dateEncaissement: new Date(),
    actor: direction,
  });
  await terminer(courante.id, direction);

  courante = await etapeCourante(dossierKoffi.dossierId!);
  await terminer(courante.id, direction);
  courante = await etapeCourante(dossierKoffi.dossierId!);
  await enregistrerPaiement({
    dossierId: dossierKoffi.dossierId!,
    type: "ACOMPTE_DOSSIER",
    montant: 200000,
    mode: "VIREMENT",
    precision: "SGBCI",
    referenceExterne: "VIR-DEMO-200",
    dateEncaissement: new Date(),
    actor: direction,
  });
  await terminer(courante.id, direction);
  courante = await etapeCourante(dossierKoffi.dossierId!);
  await terminer(courante.id, direction);
  courante = await etapeCourante(dossierKoffi.dossierId!);
  await prisma.dossierEtape.update({
    where: { id: courante.id },
    data: {
      debutLe: new Date(Date.now() - 6 * 24 * 36e5),
      limiteLe: new Date(Date.now() - 26 * 36e5),
    },
  });

  await prisma.prospect.create({
    data: {
      prenom: "Yao",
      nom: "Demo",
      telephone: "+2250707333333",
      source: "TERRAIN",
      notes: "Rencontre en etablissement, parent present.",
      relanceLe: new Date(),
      creeParId: commercial.id,
    },
  });

  await chargerDemoErp();

  console.log("Socle EduDesk charge.");
  console.log("Mot de passe demonstration :", MOT_DE_PASSE);
  console.log("direction@edudesk.ci, commercial@edudesk.ci, assistante@edudesk.ci, ecole@edudesk.ci, partenaire@edudesk.ci");
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
