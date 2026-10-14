import Link from "next/link";
import { redirect } from "next/navigation";
import { MessagesSquare, Send } from "lucide-react";
import { prisma } from "@/lib/db";
import { formatDate, nomComplet } from "@/lib/format";
import { labelRole } from "@/lib/labels";
import { Formulaire } from "@/components/formulaire";
import { ChampMessage, FilMessages, RafraichissementAuto } from "@/components/messagerie";
import { Avatar, EnTete, Vide } from "@/components/ui";
import { envoyerMessage } from "@/server/messages-actions";
import { requireUser } from "@/server/session";

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
  const contacts = [...collegues].sort(
    (a, b) => (dernier.get(b.id)?.creeLe.getTime() ?? 0) - (dernier.get(a.id)?.creeLe.getTime() ?? 0) || a.prenom.localeCompare(b.prenom),
  );
  const correspondant = collegues.find((collegue) => collegue.id === avec) ?? null;

  const fil = correspondant
    ? await prisma.message.findMany({
        where: {
          OR: [
            { deId: user.id, aId: correspondant.id },
            { deId: correspondant.id, aId: user.id },
          ],
        },
        orderBy: { creeLe: "asc" },
        take: 300,
      })
    : [];
  if (correspondant && nonLusPar.get(correspondant.id)) {
    await prisma.message.updateMany({ where: { deId: correspondant.id, aId: user.id, lu: false }, data: { lu: true } });
  }

  return (
    <section className="grid gap-6">
      <RafraichissementAuto />
      <EnTete titre="Messagerie" icone={MessagesSquare} description="Échangez directement avec vos collègues. Les messages restent dans EduDesk." />

      <div className="grid gap-4 lg:grid-cols-[300px_minmax(0,1fr)]">
        <nav className="carte max-h-[70vh] overflow-y-auto p-2 [scrollbar-width:thin]" aria-label="Conversations">
          {contacts.map((collegue) => {
            const apercu = dernier.get(collegue.id);
            const nombre = nonLusPar.get(collegue.id) ?? 0;
            const actif = collegue.id === correspondant?.id;
            return (
              <Link
                key={collegue.id}
                href={`/messages?avec=${collegue.id}`}
                className={`flex items-center gap-3 rounded-xl px-3 py-2.5 transition ${actif ? "bg-desk/[0.08]" : "hover:bg-paper"}`}
              >
                <Avatar prenom={collegue.prenom} nom={collegue.nom} />
                <span className="min-w-0 flex-1">
                  <span className="flex items-center justify-between gap-2">
                    <span className={`truncate text-sm ${nombre ? "font-bold" : "font-semibold"}`}>{nomComplet(collegue)}</span>
                    {nombre ? <span className="grid h-5 min-w-5 place-items-center rounded-full bg-desk px-1.5 text-[11px] font-bold text-white">{nombre}</span> : null}
                  </span>
                  <span className={`block truncate text-xs ${nombre ? "text-ink/80" : "text-ink/45"}`}>
                    {apercu ? `${apercu.moi ? "Vous : " : ""}${apercu.texte}` : labelRole(collegue.role)}
                  </span>
                </span>
              </Link>
            );
          })}
        </nav>

        {correspondant ? (
          <article className="carte flex flex-col p-0">
            <header className="flex items-center gap-3 border-b border-ink/[0.06] px-5 py-3.5">
              <Avatar prenom={correspondant.prenom} nom={correspondant.nom} />
              <div>
                <p className="font-semibold">{nomComplet(correspondant)}</p>
                <p className="text-xs text-ink/50">{labelRole(correspondant.role)}</p>
              </div>
            </header>
            <FilMessages signature={`${correspondant.id}:${fil.length}`}>
              {fil.length === 0 ? (
                <p className="m-auto text-sm text-ink/45">Aucun message. Écrivez le premier.</p>
              ) : (
                fil.map((message) => {
                  const moi = message.deId === user.id;
                  return (
                    <div key={message.id} className={`flex ${moi ? "justify-end" : "justify-start"}`}>
                      <div className={`max-w-[78%] rounded-2xl px-3.5 py-2 text-sm ${moi ? "rounded-br-md bg-desk text-white" : "rounded-bl-md bg-paper"}`}>
                        <p className="whitespace-pre-line break-words">{message.texte}</p>
                        <p className={`mt-0.5 text-right text-[11px] ${moi ? "text-white/60" : "text-ink/40"}`}>
                          {formatDate(message.creeLe)}
                          {moi ? (message.lu ? " · lu" : " · envoyé") : ""}
                        </p>
                      </div>
                    </div>
                  );
                })
              )}
            </FilMessages>
            <Formulaire
              key={correspondant.id}
              action={envoyerMessage}
              submit="Envoyer"
              succes="Message envoyé"
              icone={<Send size={15} />}
              className="flex flex-wrap items-end gap-2 border-t border-ink/[0.06] px-4 py-3"
            >
              <input type="hidden" name="aId" value={correspondant.id} />
              <ChampMessage />
            </Formulaire>
          </article>
        ) : (
          <Vide icone={MessagesSquare} titre="Choisissez un collègue" texte="Sélectionnez une personne dans la liste pour ouvrir la conversation." />
        )}
      </div>
    </section>
  );
}
