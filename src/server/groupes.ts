import path from "node:path";
import { prisma } from "@/lib/db";
import { nomComplet } from "@/lib/format";
import { apercuMessage } from "@/lib/messages";
import type { SessionUser } from "@/server/permissions";
import { diffuser, type FichierFlux, type MessageGroupeFlux } from "@/server/temps-reel";

const NOM_GENERAL = "Équipe EduDesk";

function salaries() {
  return prisma.user.findMany({
    where: { actif: true, role: { not: "PARTENAIRE" } },
    select: { id: true, prenom: true, nom: true },
    orderBy: [{ prenom: "asc" }, { nom: "asc" }],
  });
}

export async function assurerGroupeGeneral() {
  let groupe = await prisma.groupe.findFirst({ where: { general: true }, select: { id: true } });
  if (!groupe) {
    const createur = await prisma.user.findFirst({
      where: { actif: true, role: { in: ["CEO", "ADMINISTRATEUR"] } },
      select: { id: true },
    });
    if (!createur) return null;
    groupe = await prisma.groupe.create({
      data: { nom: NOM_GENERAL, general: true, creeParId: createur.id },
      select: { id: true },
    });
  }
  const [tous, membres] = await Promise.all([
    salaries(),
    prisma.membreGroupe.findMany({ where: { groupeId: groupe.id }, select: { userId: true } }),
  ]);
  const connus = new Set(membres.map((membre) => membre.userId));
  const manquants = tous.filter((personne) => !connus.has(personne.id));
  if (manquants.length) {
    await prisma.membreGroupe.createMany({
      data: manquants.map((personne) => ({ groupeId: groupe.id, userId: personne.id })),
      skipDuplicates: true,
    });
  }
  return groupe.id;
}

export async function nonLusGroupes(userId: string) {
  const membres = await prisma.membreGroupe.findMany({
    where: { userId },
    select: { groupeId: true, luLe: true },
  });
  if (membres.length === 0) return 0;
  const comptes = await Promise.all(
    membres.map((membre) =>
      prisma.messageGroupe.count({
        where: { groupeId: membre.groupeId, deId: { not: userId }, creeLe: { gt: membre.luLe } },
      }),
    ),
  );
  return comptes.reduce((somme, compte) => somme + compte, 0);
}

export type GroupeListe = {
  id: string;
  nom: string;
  general: boolean;
  client: string | null;
  nonLus: number;
  apercu: string | null;
};

export async function listerGroupes(userId: string): Promise<GroupeListe[]> {
  await assurerGroupeGeneral();
  const membres = await prisma.membreGroupe.findMany({
    where: { userId },
    include: {
      groupe: {
        include: {
          client: { select: { prenom: true, nom: true } },
          messages: { orderBy: { creeLe: "desc" }, take: 1, include: { de: { select: { prenom: true, nom: true } } } },
        },
      },
    },
  });
  const comptes = await Promise.all(
    membres.map((membre) =>
      prisma.messageGroupe.count({
        where: { groupeId: membre.groupeId, deId: { not: userId }, creeLe: { gt: membre.luLe } },
      }),
    ),
  );
  return membres
    .map((membre, index) => {
      const dernier = membre.groupe.messages[0];
      return {
        id: membre.groupe.id,
        nom: membre.groupe.nom,
        general: membre.groupe.general,
        client: membre.groupe.client ? nomComplet(membre.groupe.client) : null,
        nonLus: comptes[index] ?? 0,
        apercu: dernier ? `${dernier.deId === userId ? "Vous" : dernier.de.prenom} : ${apercuMessage(dernier).replace(/\s+/g, " ").trim().slice(0, 80)}` : null,
        creeLe: dernier?.creeLe.toISOString() ?? "",
      };
    })
    .sort((a, b) => Number(b.general) - Number(a.general) || b.creeLe.localeCompare(a.creeLe))
    .map(({ creeLe: _creeLe, ...groupe }) => groupe);
}

export async function ouvrirOuCreerGroupeClient(user: SessionUser, clientId: string): Promise<{ error: string } | { id: string }> {
  if (user.role === "PARTENAIRE") return { error: "Réservé aux salariés." as const };
  const client = await prisma.client.findUnique({ where: { id: clientId }, select: { id: true, prenom: true, nom: true } });
  if (!client) return { error: "Client introuvable." as const };
  const existant = await prisma.groupe.findUnique({ where: { clientId: client.id }, select: { id: true } });
  if (existant) {
    const deja = await prisma.membreGroupe.findUnique({ where: { groupeId_userId: { groupeId: existant.id, userId: user.id } }, select: { userId: true } });
    if (!deja) {
      await prisma.membreGroupe.create({ data: { groupeId: existant.id, userId: user.id } });
      await prisma.audit.create({
        data: { userId: user.id, action: "GROUPE", entite: "Client", entiteId: client.id, detail: `${nomComplet(user)} a rejoint le groupe de ${nomComplet(client)}` },
      });
    }
    return { id: existant.id };
  }
  const groupe = await prisma.groupe.create({
    data: {
      nom: nomComplet(client),
      clientId: client.id,
      creeParId: user.id,
      membres: { create: { userId: user.id } },
    },
    select: { id: true },
  });
  await prisma.audit.create({
    data: { userId: user.id, action: "GROUPE", entite: "Client", entiteId: client.id, detail: `Groupe d'échanges ouvert pour ${nomComplet(client)}` },
  });
  return { id: groupe.id };
}

export async function ajouterMembresGroupe(user: SessionUser, groupeId: string, ids: string[]): Promise<{ error: string } | { ok: true }> {
  if (user.role === "PARTENAIRE") return { error: "Réservé aux salariés." };
  const groupe = await prisma.groupe.findFirst({
    where: { id: groupeId, general: false, membres: { some: { userId: user.id } } },
    select: { id: true, nom: true, clientId: true },
  });
  if (!groupe) return { error: "Groupe introuvable." };
  const choisis = [...new Set(ids)].filter(Boolean).slice(0, 30);
  const personnes = await prisma.user.findMany({
    where: { id: { in: choisis }, actif: true, role: { not: "PARTENAIRE" } },
    select: { id: true, prenom: true, nom: true },
  });
  if (personnes.length === 0) return { error: "Choisissez au moins un collègue." };
  await prisma.membreGroupe.createMany({
    data: personnes.map((personne) => ({ groupeId: groupe.id, userId: personne.id })),
    skipDuplicates: true,
  });
  await prisma.audit.create({
    data: {
      userId: user.id,
      action: "GROUPE",
      entite: groupe.clientId ? "Client" : "Groupe",
      entiteId: groupe.clientId ?? groupe.id,
      detail: `${personnes.map((personne) => nomComplet(personne)).join(", ")} ajouté(s) au groupe ${groupe.nom}`,
    },
  });
  return { ok: true as const };
}

export type MessageGroupeVue = MessageGroupeFlux;

export type PieceGroupe = {
  nom: string;
  chemin: string;
  type: string;
  taille: number;
  duree: number | null;
};

function vueGroupe(
  message: {
    id: string;
    deId: string;
    texte: string;
    creeLe: Date;
    de: { prenom: string; nom: string };
    fichierNom: string | null;
    fichierType: string | null;
    fichierTaille: number | null;
    duree: number | null;
  },
  cle?: string,
): MessageGroupeVue {
  const fichier: FichierFlux | null = message.fichierNom
    ? { nom: message.fichierNom, type: message.fichierType ?? "application/octet-stream", taille: message.fichierTaille ?? 0, duree: message.duree }
    : null;
  return {
    id: message.id,
    deId: message.deId,
    deNom: nomComplet(message.de),
    texte: message.texte,
    creeLe: message.creeLe.toISOString(),
    fichier,
    cle,
  };
}

export async function lireFilGroupe(userId: string, groupeId: string, take = 200) {
  const membre = await prisma.membreGroupe.findUnique({
    where: { groupeId_userId: { groupeId, userId } },
    include: {
      groupe: {
        include: {
          client: { select: { id: true, prenom: true, nom: true } },
          membres: { include: { user: { select: { id: true, prenom: true, nom: true, actif: true } } }, orderBy: { ajouteLe: "asc" } },
        },
      },
    },
  });
  if (!membre) return null;
  const messages = await prisma.messageGroupe.findMany({
    where: { groupeId },
    orderBy: { creeLe: "desc" },
    take,
    include: { de: { select: { prenom: true, nom: true } } },
  });
  await prisma.membreGroupe.update({ where: { groupeId_userId: { groupeId, userId } }, data: { luLe: new Date() } });
  return {
    id: membre.groupe.id,
    nom: membre.groupe.nom,
    general: membre.groupe.general,
    client: membre.groupe.client ? { id: membre.groupe.client.id, nom: nomComplet(membre.groupe.client) } : null,
    membres: membre.groupe.membres.filter((ligne) => ligne.user.actif).map((ligne) => ({ id: ligne.user.id, nom: nomComplet(ligne.user) })),
    messages: messages.reverse().map((message) => vueGroupe(message)),
  };
}

export async function posterDansGroupe(
  user: SessionUser,
  groupeId: string,
  texteBrut: string,
  piece?: PieceGroupe | null,
  cle?: string,
): Promise<{ message: MessageGroupeVue } | { error: string }> {
  if (user.role === "PARTENAIRE") return { error: "Réservé aux salariés." };
  const texte = String(texteBrut ?? "").replace(/\r/g, "").trim();
  if (!texte && !piece) return { error: "Écrivez un message." };
  if (texte.length > 4000) return { error: "Message trop long (4 000 caractères au plus)." };
  const membre = await prisma.membreGroupe.findUnique({
    where: { groupeId_userId: { groupeId, userId: user.id } },
    include: { groupe: { select: { nom: true, membres: { select: { userId: true } } } } },
  });
  if (!membre) return { error: "Vous n'êtes pas dans ce groupe." };
  const cree = await prisma.messageGroupe.create({
    data: {
      groupeId,
      deId: user.id,
      texte,
      ...(piece
        ? {
            fichierNom: piece.nom,
            fichierChemin: path.basename(piece.chemin),
            fichierType: piece.type,
            fichierTaille: piece.taille,
            duree: piece.duree,
          }
        : {}),
    },
    include: { de: { select: { prenom: true, nom: true } } },
  });
  await prisma.membreGroupe.update({ where: { groupeId_userId: { groupeId, userId: user.id } }, data: { luLe: new Date() } });
  const message = vueGroupe(cree, cle);
  for (const ligne of membre.groupe.membres) {
    diffuser(ligne.userId, { type: "groupe", groupeId, groupeNom: membre.groupe.nom, message });
  }
  return { message };
}
