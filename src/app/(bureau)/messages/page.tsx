import { redirect } from "next/navigation";
import { MessagesSquare } from "lucide-react";
import { prisma } from "@/lib/db";
import { labelRole } from "@/lib/labels";
import { apercuMessage } from "@/lib/messages";
import { ColonneDiscussions, ConversationGroupe } from "@/components/groupe-chat";
import { Conversation, ReglagesAlertes, type Contact } from "@/components/messagerie";
import { EnTete, Vide } from "@/components/ui";
import { listerGroupes, lireFilGroupe } from "@/server/groupes";
import { requireUser } from "@/server/session";
import { nomComplet } from "@/lib/format";
import { diffuser, INCLURE_FLUX, versFlux } from "@/server/temps-reel";

export const metadata = { title: "Messagerie" };

const FIL_INITIAL = 300;
const FIL_MAX = 2000;

export default async function MessagesPage({ searchParams }: { searchParams: Promise<{ avec?: string; message?: string; q?: string; groupe?: string }> }) {
  const user = await requireUser();
  if (user.role === "PARTENAIRE") redirect("/dossiers");
  const { avec, message: cibleId, q, groupe: groupeId } = await searchParams;
  const groupes = await listerGroupes(user.id);
  if (!groupeId && !avec) {
    const general = groupes.find((groupe) => groupe.general);
    if (general) redirect(`/messages?groupe=${general.id}`);
  }
  const filGroupe = groupeId ? await lireFilGroupe(user.id, groupeId) : null;

  const [collegues, recents, nonLus] = await Promise.all([
    prisma.user.findMany({ where: { actif: true, role: { not: "PARTENAIRE" }, NOT: { id: user.id } }, orderBy: { prenom: "asc" } }),
    prisma.message.findMany({
      where: { OR: [{ deId: user.id }, { aId: user.id }] },
      orderBy: { creeLe: "desc" },
      take: 400,
      select: { deId: true, aId: true, texte: true, creeLe: true, fichierNom: true, duree: true },
    }),
    prisma.message.groupBy({ by: ["deId"], where: { aId: user.id, lu: false }, _count: true }),
  ]);
  const dernier = new Map<string, { texte: string; creeLe: Date; moi: boolean }>();
  for (const message of recents) {
    const autre = message.deId === user.id ? message.aId : message.deId;
    if (!dernier.has(autre)) dernier.set(autre, { texte: apercuMessage(message), creeLe: message.creeLe, moi: message.deId === user.id });
  }
  const nonLusPar = new Map(nonLus.map((ligne) => [ligne.deId, ligne._count]));
  const correspondant = collegues.find((collegue) => collegue.id === avec) ?? null;
  const entreNous = correspondant
    ? {
        OR: [
          { deId: user.id, aId: correspondant.id },
          { deId: correspondant.id, aId: user.id },
        ],
      }
    : null;

  let taille = FIL_INITIAL;
  let cible: string | null = null;
  if (entreNous && cibleId) {
    const message = await prisma.message.findFirst({ where: { id: cibleId, ...entreNous }, select: { id: true, creeLe: true } });
    if (message) {
      cible = message.id;
      const plusRecents = await prisma.message.count({ where: { ...entreNous, creeLe: { gt: message.creeLe } } });
      taille = Math.min(FIL_MAX, Math.max(FIL_INITIAL, plusRecents + 30));
    }
  }

  const fil = entreNous
    ? await prisma.message.findMany({
        where: entreNous,
        orderBy: { creeLe: "desc" },
        take: taille,
        include: INCLURE_FLUX,
      })
    : [];
  if (correspondant && nonLusPar.get(correspondant.id)) {
    await prisma.message.updateMany({ where: { deId: correspondant.id, aId: user.id, lu: false }, data: { lu: true } });
    nonLusPar.delete(correspondant.id);
    diffuser(correspondant.id, { type: "lu", par: user.id });
    diffuser(user.id, { type: "compteur", nonLus: await prisma.message.count({ where: { aId: user.id, lu: false } }) });
  }

  const contacts: Contact[] = collegues.map((collegue) => {
    const apercu = dernier.get(collegue.id);
    return {
      id: collegue.id,
      prenom: collegue.prenom,
      nom: collegue.nom,
      role: labelRole(collegue.role),
      nonLus: nonLusPar.get(collegue.id) ?? 0,
      apercu: apercu ? { texte: apercu.texte, moi: apercu.moi, creeLe: apercu.creeLe.toISOString() } : null,
    };
  });
  contacts.sort((a, b) => (b.apercu?.creeLe ?? "").localeCompare(a.apercu?.creeLe ?? "") || a.prenom.localeCompare(b.prenom));

  return (
    <section className="grid gap-6">
      <EnTete
        titre="Messagerie"
        icone={MessagesSquare}
        description="Messages entre collègues, groupe de toute l'équipe, et groupe d'échanges pour un client. Fichiers, images et notes vocales dans chaque conversation. @ mentionne une personne, # un dossier."
        actions={<ReglagesAlertes />}
      />

      <div className="grid gap-4 lg:grid-cols-[300px_minmax(0,1fr)]">
        <ColonneDiscussions
          groupes={groupes}
          contacts={contacts}
          moiId={user.id}
          groupeActif={filGroupe?.id ?? null}
          collegueActif={filGroupe ? null : correspondant?.id ?? null}
        />

        {filGroupe ? (
            <ConversationGroupe
              key={filGroupe.id}
              moiId={user.id}
              groupe={filGroupe}
              messages={filGroupe.messages}
              collegues={collegues.map((collegue) => ({ id: collegue.id, nom: nomComplet(collegue) }))}
            />
          ) : correspondant ? (
            <Conversation
              key={correspondant.id}
              moiId={user.id}
              correspondant={{
                id: correspondant.id,
                prenom: correspondant.prenom,
                nom: correspondant.nom,
                role: labelRole(correspondant.role),
                vuLe: correspondant.vuLe?.toISOString() ?? null,
              }}
              initiaux={fil.reverse().map((message) => versFlux({ ...message, lu: message.deId === correspondant.id ? true : message.lu }))}
              cible={cible}
              rechercheInitiale={cible ? (q ?? "").slice(0, 100) : ""}
            />
          ) : (
            <Vide icone={MessagesSquare} titre="Choisissez un collègue" texte="Sélectionnez une personne dans la liste pour ouvrir la conversation." />
          )}
      </div>
    </section>
  );
}
