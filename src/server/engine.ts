import type {
  AcompteExige,
  CategorieDepense,
  Dossier,
  ModePaiement,
  EffetIssue,
  Prisma,
  Role,
  TypeNotif,
  TypePaiement,
} from "@prisma/client";
import { prisma } from "../lib/db";
import { lireLignes, type LigneDocument } from "../lib/facturation";
import { ajouterHeures, compterSegments, delaiCourt, nomComplet, rendreModele, xof } from "../lib/format";
import { compteCharge, compteTresorerie, labelMode, labelTypePaiement, typePourAcompte } from "../lib/labels";
import { genererCodeSuivi, lienSuivi } from "../lib/suivi";
import type { SessionUser } from "./permissions";
import { emailValide, expedierMail } from "./mail";
import { lireEntreprise, urlPublique } from "./parametres";
import { envoyerSms } from "./sms";

type Tx = Prisma.TransactionClient;

export type Resultat = { ok: true; dossierId?: string } | { ok: false; error: string; manques?: string[] };

const dossierInclude = {
  client: { include: { partenaire: true } },
  procedure: true,
  etapes: { orderBy: { rang: "asc" as const } },
} satisfies Prisma.DossierInclude;

type DossierPlein = Prisma.DossierGetPayload<{ include: typeof dossierInclude }>;

async function prochainNumero(tx: Tx, cle: string, prefixe: string) {
  const key = `${cle}-${new Date().getFullYear()}`;
  await tx.compteur.upsert({
    where: { cle: key },
    create: { cle: key, valeur: 0 },
    update: {},
  });
  const row = await tx.compteur.update({
    where: { cle: key },
    data: { valeur: { increment: 1 } },
  });
  return `${prefixe}-${new Date().getFullYear()}-${String(row.valeur).padStart(5, "0")}`;
}

async function choisirResponsable(tx: Tx, roles: string[], preferId?: string) {
  if (preferId) {
    const prefere = await tx.user.findFirst({
      where: { id: preferId, actif: true, role: { in: roles as Role[] } },
    });
    if (prefere) return prefere;
  }
  for (const role of roles) {
    const user = await tx.user.findFirst({
      where: { actif: true, role: role as Role },
      orderBy: { prenom: "asc" },
    });
    if (user) return user;
  }
  return null;
}

async function texteModele(tx: Tx, code: string, variables: Record<string, string>) {
  const modele = await tx.modeleSms.findUnique({ where: { code } });
  const corps = modele?.corps ?? code;
  return rendreModele(corps, variables).slice(0, 480);
}

type MailPrevu = { a?: string | null; code: string; vars: Record<string, string>; pieceJointe?: string };

async function mailModele(tx: Tx, code: string, variables: Record<string, string>, dossierId?: string) {
  const modele = await tx.modeleSms.findUnique({ where: { code } });
  const entreprise = await lireEntreprise();
  const vars: Record<string, string> = { entreprise: entreprise.nom, suivi: "", ...variables };
  if (dossierId && !variables.suivi) {
    const dossier = await tx.dossier.findUnique({ where: { id: dossierId }, select: { codeSuivi: true } });
    if (dossier?.codeSuivi) {
      vars.code ||= dossier.codeSuivi;
      vars.lien ||= await lienPublic(null);
      vars.suivi = `Suivez votre dossier à tout moment sur ${vars.lien} avec le code ${vars.code}.`;
    }
  }
  return {
    sujet: rendreModele(modele?.sujet || "Votre dossier {{reference}}", vars).slice(0, 200),
    corps: rendreModele(modele?.corpsMail || modele?.corps || code, vars).replace(/\n{3,}/g, "\n\n").trim(),
  };
}

export async function enfilerMail(
  tx: Tx,
  outbox: string[],
  input: { a: string; type: TypeNotif; dossierId?: string; sujet: string; corps: string; pieceJointe?: string },
) {
  if (!emailValide(input.a)) return null;
  const row = await tx.notificationMail.create({
    data: {
      destinataire: input.a.trim(),
      type: input.type,
      dossierId: input.dossierId,
      sujet: input.sujet,
      corps: input.corps,
      pieceJointe: input.pieceJointe,
    },
  });
  outbox.push(`mail:${row.id}`);
  return row;
}

async function planifier(
  tx: Tx,
  outbox: string[],
  input: {
    telephone: string;
    type: TypeNotif;
    dossierId?: string;
    texte: string;
    userId?: string;
    titre?: string;
    lien?: string;
    mail?: MailPrevu;
  },
) {
  if (input.mail?.a && emailValide(input.mail.a)) {
    const contenu = await mailModele(tx, input.mail.code, input.mail.vars, input.dossierId);
    await enfilerMail(tx, outbox, {
      a: input.mail.a,
      type: input.type,
      dossierId: input.dossierId,
      ...contenu,
      pieceJointe: input.mail.pieceJointe,
    });
  }
  if (!input.telephone) return;
  const row = await tx.notificationSms.create({
    data: {
      telephone: input.telephone,
      type: input.type,
      dossierId: input.dossierId,
      texte: input.texte,
      segments: compterSegments(input.texte),
    },
  });
  outbox.push(row.id);
  if (input.userId) {
    await tx.notificationInterne.create({
      data: {
        userId: input.userId,
        titre: input.titre ?? "EduDesk",
        message: input.texte,
        lien: input.lien,
      },
    });
  }
}

async function notifierDirection(tx: Tx, outbox: string[], texte: string, dossierId: string, lien: string) {
  const directions = await tx.user.findMany({ where: { role: "CEO", actif: true } });
  for (const user of directions) {
    await planifier(tx, outbox, {
      telephone: user.telephone,
      type: "DIRECTION",
      dossierId,
      texte,
      userId: user.id,
      titre: "Direction",
      lien,
    });
  }
}

function variablesDossier(dossier: DossierPlein, etapeTitre: string, delai: string) {
  return {
    client: nomComplet(dossier.client),
    prenom: dossier.client.prenom,
    destination: dossier.procedure.destination,
    etape: etapeTitre,
    delai,
    reference: dossier.reference,
  };
}

async function attribuerCodeSuivi(tx: Tx, dossierId: string) {
  for (let essai = 0; essai < 5; essai++) {
    const code = genererCodeSuivi();
    const pris = await tx.dossier.findUnique({ where: { codeSuivi: code }, select: { id: true } });
    if (pris) continue;
    await tx.dossier.update({ where: { id: dossierId }, data: { codeSuivi: code } });
    return code;
  }
  throw new Error("Impossible de générer un code de suivi.");
}

async function messageOuverture(tx: Tx, dossier: DossierPlein, code: string, base?: string | null) {
  return texteModele(tx, "client_ouverture", {
    ...variablesDossier(dossier, "", ""),
    code,
    lien: await lienPublic(base),
  });
}

async function lienPublic(base?: string | null) {
  return lienSuivi((await urlPublique()) ?? base);
}

async function mailOuverture(dossier: DossierPlein, code: string, base?: string | null): Promise<MailPrevu> {
  const lien = await lienPublic(base);
  return {
    a: dossier.client.email,
    code: "client_ouverture",
    vars: { ...variablesDossier(dossier, "", ""), code, lien, suivi: "" },
  };
}

async function ouvrirEtape(
  tx: Tx,
  outbox: string[],
  dossier: DossierPlein,
  etapeId: string,
  actorId?: string,
) {
  const etape = dossier.etapes.find((item) => item.id === etapeId);
  if (!etape) return;
  const maintenant = new Date();
  const responsable = await choisirResponsable(tx, etape.roles.split(",").filter(Boolean), actorId);
  const limiteLe = ajouterHeures(maintenant, etape.delaiHeures);

  await tx.dossierEtape.update({
    where: { id: etape.id },
    data: {
      statut: "EN_COURS",
      debutLe: maintenant,
      limiteLe,
      responsableId: responsable?.id ?? null,
      delegation: false,
      alerteJ1: false,
      alerteRetard: false,
    },
  });

  await tx.dossier.update({
    where: { id: dossier.id },
    data: {
      ...(etape.jalon === "DEPART" ? { statut: "DEPART_SUIVI" as const } : {}),
      alerteSansResponsable: !responsable,
    },
  });

  const vars = variablesDossier(dossier, etape.titre, delaiCourt(etape.delaiHeures));
  const lien = `/dossiers/${dossier.id}`;

  if (responsable) {
    const texte = await texteModele(tx, "mission", vars);
    await planifier(tx, outbox, {
      telephone: responsable.telephone,
      type: "COLLABORATEUR",
      dossierId: dossier.id,
      texte,
      userId: responsable.id,
      titre: "Nouvelle mission",
      lien,
    });
  } else {
    const texte = await texteModele(tx, "sans_responsable", vars);
    await notifierDirection(tx, outbox, texte, dossier.id, lien);
  }
}

export async function flushSms(ids: string[]) {
  for (const id of ids) {
    if (id.startsWith("mail:")) {
      await expedierMail(id.slice(5));
      continue;
    }
    const row = await prisma.notificationSms.findUnique({ where: { id } });
    if (!row || row.statut !== "EN_ATTENTE") continue;
    try {
      const resultat = await envoyerSms(row.telephone, row.texte);
      await prisma.notificationSms.update({
        where: { id },
        data: {
          statut: resultat.statut,
          fournisseurId: resultat.fournisseurId,
          envoyeLe: new Date(),
        },
      });
    } catch (error) {
      await prisma.notificationSms.update({
        where: { id },
        data: { statut: "ECHEC", erreur: error instanceof Error ? error.message : "Echec SMS" },
      });
    }
  }
}

export async function creerDossier(input: {
  clientId: string;
  procedureId: string;
  actor: SessionUser;
  piecesReportees?: { libelle: string; fichierNom?: string | null; fichierChemin?: string | null }[];
  origineId?: string;
}): Promise<Resultat & { reference?: string }> {
  const outbox: string[] = [];
  const resultat = await prisma.$transaction(async (tx) => {
    const procedure = await tx.procedure.findUnique({
      where: { id: input.procedureId },
      include: {
        etapes: {
          orderBy: { rang: "asc" },
          include: { taches: true, pieces: true, issues: true },
        },
      },
    });
    if (!procedure?.actif) return { ok: false as const, error: "Cette procédure n'est pas ouverte." };
    if (procedure.etapes.length === 0) {
      return { ok: false as const, error: "Cette procédure n'a pas encore d'étapes." };
    }

    const reference = await prochainNumero(tx, "DOS", "DOS");
    const dossier = await tx.dossier.create({
      data: {
        reference,
        clientId: input.clientId,
        procedureId: procedure.id,
        statut: "ORIENTATION",
        dossierOrigineId: input.origineId,
        montantConvenu: procedure.tarifXof > 0 ? procedure.tarifXof : null,
      },
    });

    for (const etape of procedure.etapes) {
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
          taches: {
            create: etape.taches
              .sort((a, b) => a.ordre - b.ordre)
              .map((tache) => ({
                ordre: tache.ordre,
                libelle: tache.libelle,
                obligatoire: tache.obligatoire,
              })),
          },
          pieces: {
            create: etape.pieces
              .sort((a, b) => a.ordre - b.ordre)
              .map((piece) => ({
                dossierId: dossier.id,
                ordre: piece.ordre,
                libelle: piece.libelle,
                obligatoire: piece.obligatoire,
              })),
          },
          issues: {
            create: etape.issues
              .sort((a, b) => a.ordre - b.ordre)
              .map((issue) => ({
                ordre: issue.ordre,
                libelle: issue.libelle,
                effet: issue.effet,
              })),
          },
        },
      });
    }

    if (input.piecesReportees?.length) {
      await tx.pieceDossier.createMany({
        data: input.piecesReportees.map((piece, index) => ({
          dossierId: dossier.id,
          ordre: index + 1,
          libelle: piece.libelle,
          obligatoire: false,
          recue: true,
          recueLe: new Date(),
          recueParId: input.actor.id,
          fichierNom: piece.fichierNom,
          fichierChemin: piece.fichierChemin,
          reportee: true,
        })),
      });
    }

    const plein = await tx.dossier.findUniqueOrThrow({
      where: { id: dossier.id },
      include: dossierInclude,
    });
    const premiere = plein.etapes[0];
    await ouvrirEtape(tx, outbox, plein, premiere.id, input.actor.id);

    await tx.audit.create({
      data: {
        userId: input.actor.id,
        action: "OUVERTURE",
        entite: "Dossier",
        entiteId: dossier.id,
        detail: reference,
      },
    });

    return { ok: true as const, dossierId: dossier.id, reference };
  });

  if (resultat.ok) await flushSms(outbox);
  return resultat;
}

export async function cloturerEtape(input: {
  etapeId: string;
  issueId?: string;
  observation?: string;
  actor: SessionUser;
  baseUrl?: string | null;
}): Promise<Resultat> {
  const outbox: string[] = [];
  const resultat = await prisma.$transaction(async (tx) => {
    const etape = await tx.dossierEtape.findUnique({
      where: { id: input.etapeId },
      include: { taches: true, pieces: true, issues: { orderBy: { ordre: "asc" } } },
    });
    if (!etape || etape.statut !== "EN_COURS") {
      return { ok: false as const, error: "Cette étape n'est pas l'étape en cours." };
    }

    const roles = etape.roles.split(",").filter(Boolean);
    const autorise =
      input.actor.role === "CEO" ||
      input.actor.role === "ADMINISTRATEUR" ||
      etape.responsableId === input.actor.id ||
      roles.includes(input.actor.role);
    if (!autorise) return { ok: false as const, error: "Vous ne pouvez pas clôturer cette étape." };

    let issue: { libelle: string; effet: EffetIssue } | null = null;
    if (etape.issues.length > 0) {
      const choisie = etape.issues.find((item) => item.id === input.issueId);
      if (!choisie) return { ok: false as const, error: "Choisissez l'issue de l'étape." };
      issue = choisie;
    }
    const negatif = issue != null && issue.effet !== "SUITE";

    if (!negatif) {
      const manques = [
        ...etape.taches.filter((tache) => tache.obligatoire && !tache.faite).map((tache) => tache.libelle),
        ...etape.pieces.filter((piece) => piece.obligatoire && !piece.recue).map((piece) => piece.libelle),
      ];
      const type = typePourAcompte(etape.acompte);
      if (type) {
        const paiement = await tx.paiement.findFirst({
          where: { dossierId: etape.dossierId, type },
        });
        if (!paiement) manques.push(labelTypePaiement(type));
      }
      if (etape.choixEcole) {
        const retenue = await tx.candidature.findFirst({
          where: { dossierId: etape.dossierId, statut: "CHOISIE" },
        });
        if (!retenue) manques.push("École retenue (à choisir dans « Écoles et candidatures »)");
      }
      if (manques.length > 0) {
        return {
          ok: false as const,
          error: "Il manque des éléments obligatoires.",
          manques,
        };
      }
    }

    const dossier = await tx.dossier.findUniqueOrThrow({
      where: { id: etape.dossierId },
      include: dossierInclude,
    });
    const lien = `/dossiers/${dossier.id}`;
    const vars = variablesDossier(dossier, etape.titre, delaiCourt(null));

    if (issue?.effet === "BOUCLE") {
      const maintenant = new Date();
      await tx.dossierEtape.update({
        where: { id: etape.id },
        data: {
          statut: "EN_COURS",
          debutLe: maintenant,
          limiteLe: ajouterHeures(maintenant, etape.delaiHeures),
          clotureLe: null,
          observation: input.observation || etape.observation,
          alerteJ1: false,
          alerteRetard: false,
        },
      });
      await tx.tacheDossier.updateMany({
        where: { dossierEtapeId: etape.id },
        data: { faite: false, faiteLe: null, faiteParId: null },
      });
      await tx.audit.create({
        data: {
          userId: input.actor.id,
          action: "BOUCLE",
          entite: "Dossier",
          entiteId: dossier.id,
          detail: issue.libelle,
        },
      });
      const texteClient = await texteModele(tx, "client_etape", { ...vars, etape: etape.titre });
      await planifier(tx, outbox, {
        telephone: dossier.client.telephone,
        type: "CLIENT",
        dossierId: dossier.id,
        texte: texteClient,
        mail: { a: dossier.client.email, code: "client_etape", vars: { ...vars, etape: etape.titre } },
      });
      return { ok: true as const, dossierId: dossier.id };
    }

    await tx.dossierEtape.update({
      where: { id: etape.id },
      data: {
        statut: "CLOTUREE",
        clotureLe: new Date(),
        observation: input.observation || null,
      },
    });

    if (issue?.effet === "RELANCE") {
      await tx.dossier.update({
        where: { id: dossier.id },
        data: { statut: "RELANCE", observation: input.observation || dossier.observation },
      });
      const texteInterne = await texteModele(tx, "relance_interne", vars);
      const internes = await tx.user.findMany({
        where: { actif: true, role: { in: ["ASSISTANTE_ADMINISTRATIVE", "ADMINISTRATEUR", "CEO"] } },
      });
      for (const user of internes) {
        await planifier(tx, outbox, {
          telephone: user.telephone,
          type: user.role === "CEO" ? "DIRECTION" : "COLLABORATEUR",
          dossierId: dossier.id,
          texte: texteInterne,
          userId: user.id,
          titre: "Rendez-vous à planifier",
          lien,
        });
      }
      const texteClient = await texteModele(tx, "client_relance", vars);
      await planifier(tx, outbox, {
        telephone: dossier.client.telephone,
        type: "CLIENT",
        dossierId: dossier.id,
        texte: texteClient,
        mail: { a: dossier.client.email, code: "client_relance", vars },
      });
      await tx.audit.create({
        data: {
          userId: input.actor.id,
          action: "RELANCE",
          entite: "Dossier",
          entiteId: dossier.id,
          detail: issue.libelle,
        },
      });
      return { ok: true as const, dossierId: dossier.id };
    }

    const suivante = dossier.etapes.find((item) => item.rang > etape.rang);
    let statut = dossier.statut;
    if (!suivante) statut = "DEPART_SUIVI";
    else if (etape.jalon === "CONTRAT") statut = "EN_COURS";
    else if (suivante.jalon === "DEPART") statut = "DEPART_SUIVI";
    else if (dossier.statut === "ORIENTATION") statut = "ORIENTATION";
    else statut = "EN_COURS";

    await tx.dossier.update({ where: { id: dossier.id }, data: { statut } });
    await tx.audit.create({
      data: {
        userId: input.actor.id,
        action: "CLOTURE_ETAPE",
        entite: "Dossier",
        entiteId: dossier.id,
        detail: issue ? `${etape.titre} — ${issue.libelle}` : etape.titre,
      },
    });

    const ouvertureFormelle = etape.jalon === "CONTRAT" || etape.acompte === "DOSSIER";
    const codeSuivi = ouvertureFormelle ? dossier.codeSuivi ?? (await attribuerCodeSuivi(tx, dossier.id)) : null;
    if (codeSuivi) {
      await planifier(tx, outbox, {
        telephone: dossier.client.telephone,
        type: "CLIENT",
        dossierId: dossier.id,
        texte: await messageOuverture(tx, dossier, codeSuivi, input.baseUrl),
        mail: await mailOuverture(dossier, codeSuivi, input.baseUrl),
      });
      await tx.audit.create({
        data: { userId: input.actor.id, action: "CODE_SUIVI", entite: "Dossier", entiteId: dossier.id, detail: "Code de suivi envoyé par SMS" },
      });
    }

    if (suivante) {
      const frais = await tx.dossier.findUniqueOrThrow({
        where: { id: dossier.id },
        include: dossierInclude,
      });
      await ouvrirEtape(tx, outbox, frais, suivante.id);
      const etapeSuivante = frais.etapes.find((item) => item.id === suivante.id);
      const varsSuite = variablesDossier(frais, etapeSuivante?.titre ?? suivante.titre, "");
      const codeClient = issue && /visa/i.test(issue.libelle) && issue.effet === "SUITE" ? "client_visa" : "client_etape";
      if (!codeSuivi) {
        const texteClient = await texteModele(tx, codeClient, varsSuite);
        await planifier(tx, outbox, {
          telephone: frais.client.telephone,
          type: "CLIENT",
          dossierId: dossier.id,
          texte: texteClient,
          mail: { a: frais.client.email, code: codeClient, vars: varsSuite },
        });
      }
      if (frais.client.partenaire) {
        const texte = await texteModele(tx, "partenaire", varsSuite);
        await planifier(tx, outbox, {
          telephone: frais.client.partenaire.telephone,
          type: "PARTENAIRE",
          dossierId: dossier.id,
          texte,
          mail: { a: frais.client.partenaire.email, code: "partenaire", vars: { ...varsSuite, partenaire: frais.client.partenaire.nom, suivi: "" } },
        });
        const compte = await tx.user.findFirst({
          where: { partenaireId: frais.client.partenaire.id, actif: true },
        });
        if (compte) {
          await tx.notificationInterne.create({
            data: { userId: compte.id, titre: "Avancement", message: texte, lien },
          });
        }
      }
    } else {
      const texteClient = await texteModele(tx, "client_etape", { ...vars, etape: "Départ et suivi" });
      await planifier(tx, outbox, {
        telephone: dossier.client.telephone,
        type: "CLIENT",
        dossierId: dossier.id,
        texte: texteClient,
        mail: { a: dossier.client.email, code: "client_etape", vars: { ...vars, etape: "Départ et suivi" } },
      });
    }

    return { ok: true as const, dossierId: dossier.id };
  });

  if (resultat.ok) await flushSms(outbox);
  return resultat;
}

export async function envoyerCodeSuivi(input: { dossierId: string; actor: SessionUser; baseUrl?: string | null }): Promise<Resultat> {
  const outbox: string[] = [];
  const resultat = await prisma.$transaction(async (tx) => {
    const dossier = await tx.dossier.findUnique({ where: { id: input.dossierId }, include: dossierInclude });
    if (!dossier) return { ok: false as const, error: "Dossier introuvable." };
    const code = dossier.codeSuivi ?? (await attribuerCodeSuivi(tx, dossier.id));
    await planifier(tx, outbox, {
      telephone: dossier.client.telephone,
      type: "CLIENT",
      dossierId: dossier.id,
      texte: await messageOuverture(tx, dossier, code, input.baseUrl),
      mail: await mailOuverture(dossier, code, input.baseUrl),
    });
    await tx.audit.create({
      data: { userId: input.actor.id, action: "CODE_SUIVI", entite: "Dossier", entiteId: dossier.id, detail: "Code de suivi renvoyé par SMS" },
    });
    return { ok: true as const, dossierId: dossier.id };
  });
  if (resultat.ok) await flushSms(outbox);
  return resultat;
}

export async function creerDevis(input: {
  dossierId: string;
  objet: string;
  lignes: { libelle: string; quantite: number; prixUnitaire: number }[];
  validiteJours: number | null;
  conditions: string | null;
  actor: SessionUser;
}): Promise<Resultat & { devisId?: string }> {
  const lignes = input.lignes.filter((ligne) => ligne.libelle.trim());
  if (lignes.length === 0) return { ok: false, error: "Ajoutez au moins une prestation." };
  if (lignes.some((ligne) => !Number.isInteger(ligne.quantite) || ligne.quantite <= 0 || !Number.isInteger(ligne.prixUnitaire) || ligne.prixUnitaire < 0)) {
    return { ok: false, error: "Quantités et prix doivent être des nombres entiers positifs." };
  }
  const total = lignes.reduce((somme, ligne) => somme + ligne.quantite * ligne.prixUnitaire, 0);
  return prisma.$transaction(async (tx) => {
    const dossier = await tx.dossier.findUnique({ where: { id: input.dossierId }, include: { client: true } });
    if (!dossier) return { ok: false as const, error: "Dossier introuvable." };
    const numero = await prochainNumero(tx, "DEV", "DEV");
    const devis = await tx.devis.create({
      data: {
        numero,
        dossierId: dossier.id,
        clientNom: nomComplet(dossier.client),
        objet: input.objet,
        lignes,
        total,
        validiteLe: input.validiteJours ? ajouterHeures(new Date(), input.validiteJours * 24) : null,
        conditions: input.conditions,
        creeParId: input.actor.id,
      },
    });
    await tx.audit.create({
      data: { userId: input.actor.id, action: "DEVIS", entite: "Dossier", entiteId: dossier.id, detail: `${numero} établi · ${xof(total)}` },
    });
    return { ok: true as const, dossierId: dossier.id, devisId: devis.id };
  });
}

export async function envoyerDevisClient(input: { devisId: string; email?: string | null; actor: SessionUser }): Promise<Resultat> {
  const outbox: string[] = [];
  const resultat = await prisma.$transaction(async (tx) => {
    const devis = await tx.devis.findUnique({ where: { id: input.devisId } });
    if (!devis) return { ok: false as const, error: "Devis introuvable." };
    const dossier = await tx.dossier.findUniqueOrThrow({ where: { id: devis.dossierId }, include: dossierInclude });
    const destinataire = input.email?.trim() || dossier.client.email;
    if (!emailValide(destinataire)) return { ok: false as const, error: "Le client n'a pas d'adresse e-mail valide : indiquez-en une." };
    const vars = {
      ...variablesDossier(dossier, "", ""),
      devis: devis.numero,
      montant: xof(devis.total),
      validite: devis.validiteLe ? `Ce devis est valable jusqu'au ${new Intl.DateTimeFormat("fr-FR", { dateStyle: "long", timeZone: "Africa/Abidjan" }).format(devis.validiteLe)}.\n\n` : "",
    };
    await planifier(tx, outbox, {
      telephone: dossier.client.telephone,
      type: "CLIENT",
      dossierId: dossier.id,
      texte: await texteModele(tx, "client_devis", { ...vars, montant: `${devis.total} XOF` }),
      mail: { a: destinataire, code: "client_devis", vars: { ...vars, suivi: "" }, pieceJointe: `devis:${devis.id}` },
    });
    await tx.devis.update({ where: { id: devis.id }, data: { envoyeLe: new Date() } });
    await tx.audit.create({
      data: { userId: input.actor.id, action: "DEVIS", entite: "Dossier", entiteId: dossier.id, detail: `${devis.numero} envoyé à ${destinataire}` },
    });
    return { ok: true as const, dossierId: dossier.id };
  });
  if (resultat.ok) await flushSms(outbox);
  return resultat;
}

function verifierLignes(saisies: LigneDocument[]) {
  const lignes = saisies.map((ligne) => ({ ...ligne, libelle: ligne.libelle.trim() })).filter((ligne) => ligne.libelle);
  if (lignes.length === 0) return { ok: false as const, error: "Ajoutez au moins une prestation." };
  if (lignes.some((ligne) => !Number.isInteger(ligne.quantite) || ligne.quantite <= 0 || !Number.isInteger(ligne.prixUnitaire) || ligne.prixUnitaire < 0)) {
    return { ok: false as const, error: "Quantités et prix doivent être des nombres entiers positifs." };
  }
  const total = lignes.reduce((somme, ligne) => somme + ligne.quantite * ligne.prixUnitaire, 0);
  if (total <= 0) return { ok: false as const, error: "Le total de la facture doit être supérieur à zéro." };
  return { ok: true as const, lignes, total };
}

function echeance(jours: number | null) {
  return jours ? ajouterHeures(new Date(), jours * 24) : null;
}

export async function creerFacture(input: {
  dossierId: string;
  objet: string;
  lignes: LigneDocument[];
  echeanceJours: number | null;
  conditions: string | null;
  actor: SessionUser;
}): Promise<Resultat & { factureId?: string }> {
  const verification = verifierLignes(input.lignes);
  if (!verification.ok) return verification;
  return prisma.$transaction(async (tx) => {
    const dossier = await tx.dossier.findUnique({ where: { id: input.dossierId }, include: { client: true } });
    if (!dossier) return { ok: false as const, error: "Dossier introuvable." };
    const numero = await prochainNumero(tx, "FAC", "FAC");
    const facture = await tx.facture.create({
      data: {
        numero,
        dossierId: dossier.id,
        clientNom: nomComplet(dossier.client),
        libelle: input.objet,
        lignes: verification.lignes,
        montant: verification.total,
        echeanceLe: echeance(input.echeanceJours),
        conditions: input.conditions,
        creeParId: input.actor.id,
      },
    });
    await tx.audit.create({
      data: { userId: input.actor.id, action: "FACTURE", entite: "Dossier", entiteId: dossier.id, detail: `${numero} émise · ${xof(verification.total)}` },
    });
    return { ok: true as const, dossierId: dossier.id, factureId: facture.id };
  });
}

export async function facturerDevis(input: { devisId: string; echeanceJours: number | null; actor: SessionUser }): Promise<Resultat & { factureId?: string; numero?: string }> {
  return prisma.$transaction(async (tx) => {
    const devis = await tx.devis.findUnique({ where: { id: input.devisId }, include: { facture: { select: { numero: true } } } });
    if (!devis) return { ok: false as const, error: "Devis introuvable." };
    if (devis.facture) return { ok: false as const, error: `Ce devis a déjà été transformé en facture (${devis.facture.numero}).` };
    if (devis.statut === "REFUSE") return { ok: false as const, error: "Un devis refusé ne peut pas être facturé." };
    const verification = verifierLignes(lireLignes(devis.lignes));
    if (!verification.ok) return verification;
    const numero = await prochainNumero(tx, "FAC", "FAC");
    const facture = await tx.facture.create({
      data: {
        numero,
        dossierId: devis.dossierId,
        devisId: devis.id,
        clientNom: devis.clientNom,
        libelle: devis.objet,
        lignes: verification.lignes,
        montant: verification.total,
        echeanceLe: echeance(input.echeanceJours),
        conditions: devis.conditions,
        creeParId: input.actor.id,
      },
    });
    if (devis.statut === "EMIS") {
      await tx.devis.update({ where: { id: devis.id }, data: { statut: "ACCEPTE", decideLe: new Date() } });
      await tx.dossier.update({ where: { id: devis.dossierId }, data: { montantConvenu: devis.total } });
    }
    await tx.audit.create({
      data: {
        userId: input.actor.id,
        action: "FACTURE",
        entite: "Dossier",
        entiteId: devis.dossierId,
        detail: `${devis.numero} transformé en facture ${numero} · ${xof(verification.total)}`,
      },
    });
    return { ok: true as const, dossierId: devis.dossierId, factureId: facture.id, numero };
  });
}

export async function annulerFacture(input: { factureId: string; motif: string; actor: SessionUser }): Promise<Resultat> {
  return prisma.$transaction(async (tx) => {
    const facture = await tx.facture.findUnique({ where: { id: input.factureId }, include: { _count: { select: { reglements: true } } } });
    if (!facture) return { ok: false as const, error: "Facture introuvable." };
    if (facture.paiementId) return { ok: false as const, error: "Une facture acquittée à l'encaissement ne peut pas être annulée." };
    if (facture.annuleeLe) return { ok: false as const, error: "Cette facture est déjà annulée." };
    if (facture._count.reglements > 0) return { ok: false as const, error: "Des règlements sont déjà enregistrés sur cette facture : elle ne peut plus être annulée." };
    await tx.facture.update({ where: { id: facture.id }, data: { annuleeLe: new Date(), motifAnnulation: input.motif || null } });
    await tx.audit.create({
      data: { userId: input.actor.id, action: "FACTURE", entite: "Dossier", entiteId: facture.dossierId, detail: `${facture.numero} annulée${input.motif ? ` · ${input.motif}` : ""}` },
    });
    return { ok: true as const, dossierId: facture.dossierId };
  });
}

export async function envoyerPiecesManquantes(input: { dossierId: string; actor: SessionUser; baseUrl?: string | null }): Promise<Resultat & { nombre?: number }> {
  const outbox: string[] = [];
  const resultat = await prisma.$transaction(async (tx) => {
    const dossier = await tx.dossier.findUnique({ where: { id: input.dossierId }, include: dossierInclude });
    if (!dossier) return { ok: false as const, error: "Dossier introuvable." };
    const manquantes = await tx.pieceDossier.findMany({
      where: { dossierId: dossier.id, recue: false, fichierChemin: null, etape: { statut: { not: "A_VENIR" } } },
      orderBy: [{ obligatoire: "desc" }, { ordre: "asc" }],
    });
    if (manquantes.length === 0) return { ok: false as const, error: "Aucune pièce manquante sur ce dossier." };
    const lien = await lienPublic(input.baseUrl);
    const code = dossier.codeSuivi;
    const vars = {
      ...variablesDossier(dossier, "", ""),
      nombre: String(manquantes.length),
      pieces: manquantes.map((piece) => piece.libelle).join(", "),
      code: code ?? "",
      lien,
    };
    const liste = manquantes.map((piece) => `• ${piece.libelle}${piece.obligatoire ? "" : " (facultatif)"}`).join("\n");
    await planifier(tx, outbox, {
      telephone: dossier.client.telephone,
      type: "CLIENT",
      dossierId: dossier.id,
      texte: await texteModele(tx, "client_pieces", {
        ...vars,
        depot: code ? `Deposez-les sur ${lien} (code ${code}).` : "Merci de les apporter a l'agence.",
      }),
      mail: {
        a: dossier.client.email,
        code: "client_pieces",
        vars: {
          ...vars,
          liste,
          suivi: "",
          depot: code
            ? `Vous pouvez les déposer directement en ligne sur ${lien} avec votre code de suivi ${code}, ou les apporter à l'agence.`
            : "Merci de les apporter à l'agence ou de les transmettre à votre conseiller.",
        },
      },
    });
    await tx.audit.create({
      data: {
        userId: input.actor.id,
        action: "PIECES_RELANCE",
        entite: "Dossier",
        entiteId: dossier.id,
        detail: `${manquantes.length} pièce(s) : ${vars.pieces}`.slice(0, 300),
      },
    });
    return { ok: true as const, dossierId: dossier.id, nombre: manquantes.length };
  });
  if (resultat.ok) await flushSms(outbox);
  return resultat;
}

export async function refuserDepotClient(input: { pieceId: string; actor: SessionUser }) {
  const outbox: string[] = [];
  const fait = await prisma.$transaction(async (tx) => {
    const piece = await tx.pieceDossier.findUnique({ where: { id: input.pieceId }, include: { dossier: { include: dossierInclude } } });
    if (!piece || piece.recue || !piece.fichierChemin) return null;
    await tx.pieceDossier.update({ where: { id: piece.id }, data: { fichierNom: null, fichierChemin: null, deposeLe: null } });
    await tx.audit.create({
      data: { userId: input.actor.id, action: "PIECE_REFUSEE", entite: "Dossier", entiteId: piece.dossierId, detail: piece.libelle },
    });
    const dossier = piece.dossier;
    const entreprise = await lireEntreprise();
    await planifier(tx, outbox, {
      telephone: dossier.client.telephone,
      type: "CLIENT",
      dossierId: dossier.id,
      texte: `EDUDESK: ${dossier.client.prenom}, le document "${piece.libelle}" depose n'a pas pu etre accepte. Merci de le deposer a nouveau.`,
    });
    if (dossier.client.email) {
      await enfilerMail(tx, outbox, {
        a: dossier.client.email,
        type: "CLIENT",
        dossierId: dossier.id,
        sujet: `Document à déposer à nouveau : ${piece.libelle}`,
        corps: `Bonjour ${dossier.client.prenom},\n\nLe document « ${piece.libelle} » que vous avez déposé pour votre dossier ${dossier.reference} n'a pas pu être accepté (illisible, incomplet ou non conforme).\n\nMerci de le déposer à nouveau sur ${await lienPublic(null)} avec votre code de suivi, ou de l'apporter à l'agence.\n\nCordialement,\nL'équipe ${entreprise.nom}`,
      });
    }
    return piece.fichierChemin;
  });
  if (fait) await flushSms(outbox);
  return fait;
}

export async function annoncerAdmission(input: { candidatureId: string; baseUrl?: string | null }) {
  const outbox: string[] = [];
  await prisma.$transaction(async (tx) => {
    const candidature = await tx.candidature.findUnique({ where: { id: input.candidatureId }, include: { ecole: true } });
    if (!candidature) return;
    const dossier = await tx.dossier.findUniqueOrThrow({ where: { id: candidature.dossierId }, include: dossierInclude });
    const vars = {
      ...variablesDossier(dossier, "", ""),
      ecole: candidature.ecole.nom,
      formation: candidature.formation ? ` (${candidature.formation})` : "",
      lien: await lienPublic(input.baseUrl),
    };
    await planifier(tx, outbox, {
      telephone: dossier.client.telephone,
      type: "CLIENT",
      dossierId: dossier.id,
      texte: await texteModele(tx, "client_admission", vars),
      mail: { a: dossier.client.email, code: "client_admission", vars },
    });
  });
  await flushSms(outbox);
}

export async function reorienterDossier(input: {
  dossierId: string;
  procedureId: string;
  actor: SessionUser;
}): Promise<Resultat> {
  const source = await prisma.dossier.findUnique({
    where: { id: input.dossierId },
    include: { pieces: true, procedure: true, client: true },
  });
  if (!source) return { ok: false, error: "Dossier introuvable." };
  if (source.statut !== "RELANCE") {
    return { ok: false, error: "La réorientation part d'un dossier en relance." };
  }
  if (source.procedureId === input.procedureId) {
    return { ok: false, error: "Choisissez une autre procédure." };
  }

  const cree = await creerDossier({
    clientId: source.clientId,
    procedureId: input.procedureId,
    actor: input.actor,
    origineId: source.id,
    piecesReportees: source.pieces
      .filter((piece) => piece.recue)
      .map((piece) => ({
        libelle: piece.libelle,
        fichierNom: piece.fichierNom,
        fichierChemin: piece.fichierChemin,
      })),
  });
  if (!cree.ok) return cree;

  await prisma.dossier.update({
    where: { id: source.id },
    data: { statut: "REORIENTE" },
  });
  await prisma.audit.create({
    data: {
      userId: input.actor.id,
      action: "REORIENTATION",
      entite: "Dossier",
      entiteId: source.id,
      detail: cree.reference,
    },
  });

  const outbox: string[] = [];
  await prisma.$transaction(async (tx) => {
    const procedure = await tx.procedure.findUniqueOrThrow({ where: { id: input.procedureId } });
    const vars = {
      prenom: source.client.prenom,
      destination: procedure.destination,
      client: nomComplet(source.client),
      etape: "",
      delai: "",
      reference: source.reference,
    };
    const texte = await texteModele(tx, "client_reorientation", vars);
    await planifier(tx, outbox, {
      telephone: source.client.telephone,
      type: "CLIENT",
      dossierId: cree.dossierId,
      texte,
      mail: { a: source.client.email, code: "client_reorientation", vars },
    });
  });
  await flushSms(outbox);
  return { ok: true, dossierId: cree.dossierId };
}

export async function enregistrerPaiement(input: {
  dossierId: string;
  type: TypePaiement;
  montant: number;
  mode: "ESPECES" | "VIREMENT" | "MOBILE_MONEY";
  precision?: string;
  referenceExterne?: string;
  dateEncaissement: Date;
  factureId?: string | null;
  actor: SessionUser;
}): Promise<Resultat> {
  if (!Number.isInteger(input.montant) || input.montant <= 0) {
    return { ok: false, error: "Le montant doit être un nombre entier de francs CFA." };
  }

  const outbox: string[] = [];
  const resultat = await prisma.$transaction(async (tx) => {
    const dossier = await tx.dossier.findUnique({
      where: { id: input.dossierId },
      include: { client: true, procedure: true },
    });
    if (!dossier) return { ok: false as const, error: "Dossier introuvable." };

    const factureReglee = input.factureId
      ? await tx.facture.findUnique({ where: { id: input.factureId }, include: { reglements: { select: { montant: true } } } })
      : null;
    if (input.factureId) {
      if (!factureReglee || factureReglee.dossierId !== dossier.id || factureReglee.paiementId) return { ok: false as const, error: "Facture introuvable pour ce dossier." };
      if (factureReglee.annuleeLe) return { ok: false as const, error: "Cette facture est annulée." };
      const reste = factureReglee.montant - factureReglee.reglements.reduce((somme, reglement) => somme + reglement.montant, 0);
      if (reste <= 0) return { ok: false as const, error: "Cette facture est déjà entièrement réglée." };
      if (input.montant > reste) return { ok: false as const, error: `Le montant dépasse le reste à payer de la facture (${xof(reste)}).` };
    }

    const numero = await prochainNumero(tx, "PAY", "PAY");
    const factureNumero = factureReglee ? factureReglee.numero : await prochainNumero(tx, "FAC", "FAC");
    const compte = compteTresorerie(input.mode);
    const libelle = factureReglee ? `Règlement ${factureReglee.numero} ${dossier.reference}` : `${labelTypePaiement(input.type)} ${dossier.reference}`;

    const paiement = await tx.paiement.create({
      data: {
        numero,
        dossierId: dossier.id,
        clientId: dossier.clientId,
        type: input.type,
        montant: input.montant,
        mode: input.mode,
        precision: input.precision || null,
        referenceExterne: input.referenceExterne || null,
        dateEncaissement: input.dateEncaissement,
        saisiParId: input.actor.id,
        factureRegleeId: factureReglee?.id ?? null,
      },
    });
    const facture =
      factureReglee ??
      (await tx.facture.create({
        data: {
          numero: factureNumero,
          dossierId: dossier.id,
          paiementId: paiement.id,
          clientNom: nomComplet(dossier.client),
          libelle,
          montant: input.montant,
        },
      }));
    await tx.ecriture.createMany({
      data: [
        {
          date: input.dateEncaissement,
          journal: "VTE",
          compte: "411",
          libelle,
          debit: input.montant,
          paiementId: paiement.id,
          factureId: facture.id,
        },
        {
          date: input.dateEncaissement,
          journal: "VTE",
          compte: "706",
          libelle,
          credit: input.montant,
          paiementId: paiement.id,
          factureId: facture.id,
        },
        {
          date: input.dateEncaissement,
          journal: "CAI",
          compte,
          libelle: `Encaissement ${numero}`,
          debit: input.montant,
          paiementId: paiement.id,
          factureId: facture.id,
        },
        {
          date: input.dateEncaissement,
          journal: "CAI",
          compte: "411",
          libelle: `Encaissement ${numero}`,
          credit: input.montant,
          paiementId: paiement.id,
          factureId: facture.id,
        },
      ],
    });
    await tx.audit.create({
      data: {
        userId: input.actor.id,
        action: "PAIEMENT",
        entite: "Dossier",
        entiteId: dossier.id,
        detail: `${numero} ${input.montant} ${input.mode}`,
      },
    });

    const varsPaiement = {
      prenom: dossier.client.prenom,
      montant: String(input.montant),
      mode: labelMode(input.mode),
      facture: factureNumero,
      client: nomComplet(dossier.client),
      destination: dossier.procedure.destination,
      etape: "",
      delai: "",
      reference: dossier.reference,
    };
    const texte = await texteModele(tx, "paiement", varsPaiement);
    await planifier(tx, outbox, {
      telephone: dossier.client.telephone,
      type: "CLIENT",
      dossierId: dossier.id,
      texte,
      mail: {
        a: dossier.client.email,
        code: "paiement",
        vars: { ...varsPaiement, montant: xof(input.montant) },
        pieceJointe: `facture:${facture.id}`,
      },
    });
    const comptables = await tx.user.findMany({ where: { role: "COMPTABLE", actif: true } });
    for (const user of comptables) {
      await planifier(tx, outbox, {
        telephone: user.telephone,
        type: "COLLABORATEUR",
        dossierId: dossier.id,
        texte,
        userId: user.id,
        titre: "Paiement enregistré",
        lien: `/dossiers/${dossier.id}`,
      });
    }
    return { ok: true as const, dossierId: dossier.id };
  });

  if (resultat.ok) await flushSms(outbox);
  return resultat;
}

export async function enregistrerDepense(input: {
  date: Date;
  categorie: CategorieDepense;
  libelle: string;
  montant: number;
  mode: ModePaiement;
  fournisseur?: string;
  reference?: string;
  partenaireId?: string | null;
  actor: SessionUser;
}): Promise<{ ok: true; numero: string } | { ok: false; error: string }> {
  if (!Number.isInteger(input.montant) || input.montant <= 0) {
    return { ok: false, error: "Le montant doit être un nombre entier de francs CFA." };
  }
  if (!input.libelle) return { ok: false, error: "Indiquez le motif de la dépense." };

  return prisma.$transaction(async (tx) => {
    const numero = await prochainNumero(tx, "DEP", "DEP");
    const depense = await tx.depense.create({
      data: {
        numero,
        date: input.date,
        categorie: input.categorie,
        libelle: input.libelle,
        montant: input.montant,
        mode: input.mode,
        fournisseur: input.fournisseur || null,
        reference: input.reference || null,
        partenaireId: input.partenaireId || null,
        saisiParId: input.actor.id,
      },
    });
    const libelle = `${numero} ${input.libelle}`.slice(0, 180);
    await tx.ecriture.createMany({
      data: [
        { date: input.date, journal: "ACH", compte: compteCharge(input.categorie), libelle, debit: input.montant, depenseId: depense.id },
        { date: input.date, journal: "ACH", compte: compteTresorerie(input.mode), libelle, credit: input.montant, depenseId: depense.id },
      ],
    });
    await tx.audit.create({
      data: {
        userId: input.actor.id,
        action: "DEPENSE",
        entite: "Depense",
        entiteId: depense.id,
        detail: `${numero} ${input.montant} ${input.mode}`,
      },
    });
    return { ok: true as const, numero };
  });
}

export async function scannerAlertes() {
  const now = new Date();
  const dans24h = new Date(now.getTime() + 24 * 36e5);
  const outbox: string[] = [];

  await prisma.$transaction(async (tx) => {
    const etapes = await tx.dossierEtape.findMany({
      where: { statut: "EN_COURS", limiteLe: { not: null } },
      include: { dossier: { include: dossierInclude } },
    });

    for (const etape of etapes) {
      if (!etape.limiteLe) continue;
      const dossier = etape.dossier as DossierPlein;
      const vars = variablesDossier(dossier, etape.titre, "");
      const lien = `/dossiers/${dossier.id}`;
      if (etape.limiteLe < now && !etape.alerteRetard) {
        const texte = await texteModele(tx, "retard", vars);
        if (etape.responsableId) {
          const responsable = await tx.user.findUnique({ where: { id: etape.responsableId } });
          if (responsable?.actif) {
            await planifier(tx, outbox, {
              telephone: responsable.telephone,
              type: "COLLABORATEUR",
              dossierId: dossier.id,
              texte,
              userId: responsable.id,
              titre: "Retard",
              lien,
            });
          }
        }
        await notifierDirection(tx, outbox, texte, dossier.id, lien);
        await tx.dossierEtape.update({ where: { id: etape.id }, data: { alerteRetard: true } });
      } else if (etape.limiteLe <= dans24h && etape.limiteLe >= now && !etape.alerteJ1) {
        const texte = await texteModele(tx, "j1", vars);
        if (etape.responsableId) {
          const responsable = await tx.user.findUnique({ where: { id: etape.responsableId } });
          if (responsable?.actif) {
            await planifier(tx, outbox, {
              telephone: responsable.telephone,
              type: "COLLABORATEUR",
              dossierId: dossier.id,
              texte,
              userId: responsable.id,
              titre: "Échéance demain",
              lien,
            });
          }
        }
        await notifierDirection(tx, outbox, texte, dossier.id, lien);
        await tx.dossierEtape.update({ where: { id: etape.id }, data: { alerteJ1: true } });
      }
    }
  });

  await flushSms(outbox);
  return { alertes: outbox.length };
}

export function manquesVisibles(input: {
  taches: { libelle: string; obligatoire: boolean; faite: boolean }[];
  pieces: { libelle: string; obligatoire: boolean; recue: boolean }[];
  acompte: AcompteExige;
  paiementPresent: boolean;
}) {
  const manques = [
    ...input.taches.filter((tache) => tache.obligatoire && !tache.faite).map((tache) => tache.libelle),
    ...input.pieces.filter((piece) => piece.obligatoire && !piece.recue).map((piece) => piece.libelle),
  ];
  const type = typePourAcompte(input.acompte);
  if (type && !input.paiementPresent) manques.push(labelTypePaiement(type));
  return manques;
}

export type { Dossier };
