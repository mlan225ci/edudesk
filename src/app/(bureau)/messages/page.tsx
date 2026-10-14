import { redirect } from "next/navigation";
import { MessagesSquare } from "lucide-react";
import { prisma } from "@/lib/db";
import { labelRole } from "@/lib/labels";
import { Conversation, ListeContacts, ReglagesAlertes, type Contact } from "@/components/messagerie";
import { EnTete, Vide } from "@/components/ui";
import { requireUser } from "@/server/session";
import { diffuser, versFlux } from "@/server/temps-reel";

export const metadata = { title: "Messagerie" };

export default async function MessagesPage({ searchParams }: { searchParams: Promise<{ avec?: string }> }) {
  const user = await requireUser();
  if (user.role === "PARTENAIRE") redirect("/dossiers");
  const { avec } = await searchParams;

  const [collegues, recents, nonLus] = await Promise.all([
    prisma.user.findMany({ where: { actif: true, role: { not: "PARTENAIRE" }, NOT: { id: user.id } }, orderBy: { prenom: "asc" } }),
    prisma.message.findMany({
      where: { OR: [{ deId: user.id }, { aId: user.id }] },
      orderBy: { creeLe: "desc" },
      take: 400,
      select: { deId: true, aId: true, texte: true, creeLe: true },
    }),
    prisma.message.groupBy({ by: ["deId"], where: { aId: user.id, lu: false }, _count: true }),
  ]);
  const dernier = new Map<string, { texte: string; creeLe: Date; moi: boolean }>();
  for (const message of recents) {
    const autre = message.deId === user.id ? message.aId : message.deId;
    if (!dernier.has(autre)) dernier.set(autre, { texte: message.texte, creeLe: message.creeLe, moi: message.deId === user.id });
  }
  const nonLusPar = new Map(nonLus.map((ligne) => [ligne.deId, ligne._count]));
  const correspondant = collegues.find((collegue) => collegue.id === avec) ?? null;

  const fil = correspondant
    ? await prisma.message.findMany({
        where: {
          OR: [
            { deId: user.id, aId: correspondant.id },
            { deId: correspondant.id, aId: user.id },
          ],
        },
        orderBy: { creeLe: "desc" },
        take: 300,
        include: { de: { select: { prenom: true, nom: true } } },
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
        description="Échangez directement avec vos collègues. Les messages arrivent instantanément, avec un signal sonore quand l'onglet n'est pas affiché."
        actions={<ReglagesAlertes />}
      />

      <div className="grid gap-4 lg:grid-cols-[300px_minmax(0,1fr)]">
        <ListeContacts moiId={user.id} actifId={correspondant?.id ?? null} initiaux={contacts} />

        {correspondant ? (
          <Conversation
            key={correspondant.id}
            moiId={user.id}
            correspondant={{ id: correspondant.id, prenom: correspondant.prenom, nom: correspondant.nom, role: labelRole(correspondant.role) }}
            initiaux={fil.reverse().map((message) => versFlux({ ...message, lu: message.deId === correspondant.id ? true : message.lu }))}
          />
        ) : (
          <Vide icone={MessagesSquare} titre="Choisissez un collègue" texte="Sélectionnez une personne dans la liste pour ouvrir la conversation." />
        )}
      </div>
    </section>
  );
}
