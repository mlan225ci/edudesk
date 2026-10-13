import type { Role } from "@prisma/client";
import { prisma } from "../src/lib/db";
import { genererCodeSuivi } from "../src/lib/suivi";
import { MODELES_SMS, PROCEDURES, type EtapeDef } from "./procedures";

function signatureDef(etapes: EtapeDef[]) {
  return JSON.stringify(
    etapes.map((etape) => [
      etape.titre,
      etape.delaiHeures,
      etape.roles.join(","),
      etape.acompte ?? "AUCUN",
      etape.jalon ?? null,
      etape.taches.map((tache) => [tache.libelle, tache.obligatoire]),
      (etape.pieces ?? []).map((piece) => [piece.libelle, piece.obligatoire]),
      (etape.issues ?? []).map((issue) => [issue.libelle, issue.effet]),
    ]),
  );
}

type EtapeDossier = { id: string; rang: number; titre: string; statut: string; jalon: string | null; roles: string };

// Règle 1 du cahier des charges : rien après le conseil et l'orientation sans contrat signé ni acompte.
async function ramenerAuContrat(dossier: { id: string; reference: string; etapes: EtapeDossier[] }, modeles: { titre: string; jalon: string | null }[]) {
  const etapes = [...dossier.etapes].sort((a, b) => a.rang - b.rang);
  const contrat = etapes.find((etape) => etape.jalon === "CONTRAT" && etape.statut === "A_VENIR");
  const courante = etapes.find((etape) => etape.statut === "EN_COURS");
  if (!contrat || !courante || contrat.rang < courante.rang) return false;
  const positionContrat = modeles.findIndex((etape) => etape.jalon === "CONTRAT");
  const positionCourante = modeles.findIndex((etape) => etape.titre === courante.titre);
  if (positionContrat < 0 || positionCourante <= positionContrat) return false;

  const ordre = [...etapes.filter((etape) => etape.rang < courante.rang), contrat, ...etapes.filter((etape) => etape.rang >= courante.rang && etape.id !== contrat.id)];
  const roles = contrat.roles.split(",").filter(Boolean) as Role[];
  const responsable = await prisma.user.findFirst({ where: { actif: true, role: { in: roles } }, orderBy: { creeLe: "asc" }, select: { id: true } });
  await prisma.$transaction([
    ...ordre.map((etape, index) => prisma.dossierEtape.update({ where: { id: etape.id }, data: { rang: index + 1 } })),
    prisma.dossierEtape.update({ where: { id: courante.id }, data: { statut: "A_VENIR", debutLe: null, limiteLe: null, responsableId: null } }),
    prisma.dossierEtape.update({
      where: { id: contrat.id },
      data: { statut: "EN_COURS", debutLe: new Date(), limiteLe: null, responsableId: responsable?.id ?? null, alerteJ1: false, alerteRetard: false },
    }),
    prisma.audit.create({
      data: { action: "CONTRAT_REQUIS", entite: "Dossier", entiteId: dossier.id, detail: `${contrat.titre} avant ${courante.titre}` },
    }),
  ]);
  console.log(`   ${dossier.reference} : ramené à « ${contrat.titre} » (contrat et acompte exigés avant « ${courante.titre} »)`);
  return true;
}

const FORCER = process.argv.includes("--forcer");

async function main() {
  for (const def of PROCEDURES) {
    const existante = await prisma.procedure.findUnique({
      where: { code: def.code },
      include: {
        etapes: {
          orderBy: { rang: "asc" },
          include: { taches: { orderBy: { ordre: "asc" } }, pieces: { orderBy: { ordre: "asc" } }, issues: { orderBy: { ordre: "asc" } } },
        },
      },
    });
    const signatureBase = existante
      ? JSON.stringify(
          existante.etapes.map((etape) => [
            etape.titre,
            etape.delaiHeures,
            etape.roles,
            etape.acompte,
            etape.jalon,
            etape.taches.map((tache) => [tache.libelle, tache.obligatoire]),
            etape.pieces.map((piece) => [piece.libelle, piece.obligatoire]),
            etape.issues.map((issue) => [issue.libelle, issue.effet]),
          ]),
        )
      : null;
    const aJour = signatureBase === signatureDef(def.etapes);
    if (existante && aJour && existante.nom === def.nom && existante.actif === def.actif && existante.destination === def.destination) {
      console.log(`${def.code} : déjà conforme`);
      continue;
    }
    if (existante && !FORCER) {
      console.log(`${def.code} : paramétrée dans l'application, laissée telle quelle (--forcer pour revenir au modèle du code)`);
      continue;
    }

    const procedure = await prisma.$transaction(async (tx) => {
      const enregistree = existante
        ? await tx.procedure.update({
            where: { id: existante.id },
            data: { nom: def.nom, destination: def.destination, actif: def.actif, version: aJour ? existante.version : existante.version + 1 },
          })
        : await tx.procedure.create({ data: { code: def.code, nom: def.nom, destination: def.destination, actif: def.actif, ecoles: def.ecoles ?? false } });
      if (!aJour) {
        await tx.etapeModele.deleteMany({ where: { procedureId: enregistree.id } });
        for (const [index, etape] of def.etapes.entries()) {
          await tx.etapeModele.create({
            data: {
              procedureId: enregistree.id,
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
            },
          });
        }
      }
      return enregistree;
    });
    console.log(`${def.code} : ${aJour ? "informations mises à jour" : `étapes remplacées (version ${procedure.version})`}`);
    if (aJour) continue;

    const modeles = await prisma.etapeModele.findMany({
      where: { procedureId: procedure.id },
      orderBy: { rang: "asc" },
      include: { taches: true, pieces: true, issues: true },
    });
    const dossiers = await prisma.dossier.findMany({
      where: { procedureId: procedure.id, statut: { in: ["ORIENTATION", "EN_COURS", "DECISION"] } },
      include: { etapes: { orderBy: { rang: "asc" } } },
    });
    for (const dossier of dossiers) {
      if (await ramenerAuContrat(dossier, modeles)) {
        dossier.etapes = await prisma.dossierEtape.findMany({ where: { dossierId: dossier.id }, orderBy: { rang: "asc" } });
      }
      const courante = dossier.etapes.find((etape) => etape.statut === "EN_COURS");
      if (!courante) continue;
      const titresAvant = dossier.etapes.filter((etape) => etape.rang <= courante.rang).map((etape) => etape.titre);
      const titresModele = modeles.filter((etape) => etape.rang <= courante.rang).map((etape) => etape.titre);
      if (JSON.stringify(titresAvant) !== JSON.stringify(titresModele)) {
        console.log(`   ${dossier.reference} : début de parcours différent, laissé tel quel`);
        continue;
      }
      await prisma.$transaction(async (tx) => {
        const futures = dossier.etapes.filter((etape) => etape.rang > courante.rang).map((etape) => etape.id);
        await tx.pieceDossier.deleteMany({ where: { dossierEtapeId: { in: futures } } });
        await tx.dossierEtape.deleteMany({ where: { id: { in: futures } } });
        for (const etape of modeles.filter((item) => item.rang > courante.rang)) {
          await tx.dossierEtape.create({
            data: {
              dossierId: dossier.id,
              etapeModeleId: etape.id,
              rang: etape.rang,
              titre: etape.titre,
              roles: etape.roles,
              acompte: etape.acompte,
              jalon: etape.jalon,
              choixEcole: etape.choixEcole,
              delaiHeures: etape.delaiHeures,
              statut: "A_VENIR",
              taches: { create: etape.taches.sort((a, b) => a.ordre - b.ordre).map((tache) => ({ ordre: tache.ordre, libelle: tache.libelle, obligatoire: tache.obligatoire })) },
              pieces: {
                create: etape.pieces
                  .sort((a, b) => a.ordre - b.ordre)
                  .map((piece) => ({ dossierId: dossier.id, ordre: piece.ordre, libelle: piece.libelle, obligatoire: piece.obligatoire })),
              },
              issues: { create: etape.issues.sort((a, b) => a.ordre - b.ordre).map((issue) => ({ ordre: issue.ordre, libelle: issue.libelle, effet: issue.effet })) },
            },
          });
        }
      });
      console.log(`   ${dossier.reference} : étapes à venir alignées sur la nouvelle version`);
    }
  }

  for (const def of PROCEDURES.filter((item) => item.ecoles)) {
    const procedure = await prisma.procedure.findUnique({ where: { code: def.code }, include: { etapes: true } });
    if (!procedure || procedure.ecoles || procedure.etapes.some((etape) => etape.choixEcole)) continue;
    const titres = def.etapes.filter((etape) => etape.choixEcole).map((etape) => etape.titre);
    await prisma.$transaction([
      prisma.procedure.update({ where: { id: procedure.id }, data: { ecoles: true } }),
      prisma.etapeModele.updateMany({ where: { procedureId: procedure.id, titre: { in: titres } }, data: { choixEcole: true } }),
      prisma.dossierEtape.updateMany({
        where: { dossier: { procedureId: procedure.id }, titre: { in: titres }, statut: "A_VENIR" },
        data: { choixEcole: true },
      }),
    ]);
    console.log(`${def.code} : procédure d'études, choix de l'école exigé à « ${titres.join(", ")} »`);
  }

  for (const modele of MODELES_SMS) {
    const existant = await prisma.modeleSms.findUnique({ where: { code: modele.code } });
    if (existant) continue;
    await prisma.modeleSms.create({ data: modele });
    console.log(`Modèle SMS ajouté : ${modele.libelle}`);
  }

  const ouverts = await prisma.dossier.findMany({
    where: { codeSuivi: null, etapes: { some: { statut: "CLOTUREE", OR: [{ jalon: "CONTRAT" }, { acompte: "DOSSIER" }] } } },
    select: { id: true, reference: true },
  });
  for (const dossier of ouverts) {
    let code = genererCodeSuivi();
    while (await prisma.dossier.findUnique({ where: { codeSuivi: code }, select: { id: true } })) code = genererCodeSuivi();
    await prisma.dossier.update({ where: { id: dossier.id }, data: { codeSuivi: code } });
    console.log(`   ${dossier.reference} : code de suivi ${code}`);
  }
}

main()
  .catch((erreur) => {
    console.error(erreur);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
