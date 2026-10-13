import Link from "next/link";
import { Bell, BellOff, ChevronRight, MessageSquareText, Pencil } from "lucide-react";
import { prisma } from "@/lib/db";
import { compterSegments, formatDate } from "@/lib/format";
import { Formulaire } from "@/components/formulaire";
import { Badge, EnTete, Info, Onglets, Vide } from "@/components/ui";
import { modifierModele } from "@/server/actions";
import { voitDirection } from "@/server/permissions";
import { requireUser } from "@/server/session";

export const metadata = { title: "Notifications" };

const STATUT: Record<string, { label: string; ton: "gris" | "vert" | "cap" | "edu" }> = {
  EN_ATTENTE: { label: "En attente", ton: "edu" },
  JOURNAL: { label: "Journalisé", ton: "gris" },
  ENVOYE: { label: "Envoyé", ton: "vert" },
  ECHEC: { label: "Échec", ton: "cap" },
};

export default async function NotificationsPage({ searchParams }: { searchParams: Promise<{ vue?: string }> }) {
  const user = await requireUser();
  const direction = voitDirection(user.role);
  const { vue = "moi" } = await searchParams;

  const internes = await prisma.notificationInterne.findMany({ where: { userId: user.id }, orderBy: { creeLe: "desc" }, take: 50 });
  if (internes.some((note) => !note.lue)) {
    await prisma.notificationInterne.updateMany({ where: { userId: user.id, lue: false }, data: { lue: true } });
  }

  const dossiersPartenaire =
    user.role === "PARTENAIRE"
      ? await prisma.dossier.findMany({ where: { client: { partenaireId: user.partenaireId ?? "__aucun__" } }, select: { id: true } })
      : [];
  const [sms, modeles] = await Promise.all([
    vue === "sms"
      ? prisma.notificationSms.findMany({
          where: user.role === "PARTENAIRE" ? { type: "PARTENAIRE", dossierId: { in: dossiersPartenaire.map((dossier) => dossier.id) } } : {},
          orderBy: { creeLe: "desc" },
          take: 80,
        })
      : Promise.resolve([]),
    direction && vue === "modeles" ? prisma.modeleSms.findMany({ orderBy: { code: "asc" } }) : Promise.resolve([]),
  ]);

  return (
    <section className="grid gap-6">
      <EnTete titre="Notifications" icone={Bell} description="Ce qui vous concerne, l'historique des SMS envoyés et les modèles de message." />

      <Onglets
        actif={`/notifications?vue=${vue}`}
        onglets={[
          { href: "/notifications?vue=moi", label: "Pour moi", nombre: internes.filter((note) => !note.lue).length || undefined },
          { href: "/notifications?vue=sms", label: "Journal SMS" },
          ...(direction ? [{ href: "/notifications?vue=modeles", label: "Modèles SMS" }] : []),
        ]}
      />

      {vue === "moi" ? (
        internes.length === 0 ? (
          <Vide icone={BellOff} titre="Aucune notification" texte="Vous serez prévenu ici lorsqu'une mission vous est confiée ou qu'une demande vous concerne." />
        ) : (
          <div className="carte divide-y divide-ink/[0.05] p-0">
            {internes.map((note) => {
              const contenu = (
                <>
                  <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${note.lue ? "bg-transparent" : "bg-cap"}`} />
                  <div className="min-w-0 flex-1">
                    <p className={`text-sm ${note.lue ? "font-medium" : "font-bold"}`}>{note.titre}</p>
                    <p className="text-sm text-ink/60">{note.message}</p>
                    <p className="mt-0.5 text-xs text-ink/40">{formatDate(note.creeLe)}</p>
                  </div>
                  {note.lien ? <ChevronRight size={16} className="mt-1 text-ink/25 group-hover:text-desk" /> : null}
                </>
              );
              return note.lien ? (
                <Link key={note.id} href={note.lien} className={`group flex gap-3 px-5 py-4 transition hover:bg-paper ${note.lue ? "" : "bg-desk/[0.03]"}`}>
                  {contenu}
                </Link>
              ) : (
                <div key={note.id} className={`flex gap-3 px-5 py-4 ${note.lue ? "" : "bg-desk/[0.03]"}`}>{contenu}</div>
              );
            })}
          </div>
        )
      ) : null}

      {vue === "sms" ? (
        <>
          <Info>Sans opérateur SMS branché (variable SMS_HTTP_URL), les messages sont conservés ici sans être envoyés.</Info>
          {sms.length === 0 ? (
            <Vide icone={MessageSquareText} titre="Aucun SMS" />
          ) : (
            <div className="grid gap-2 entree-cascade">
              {sms.map((message) => (
                <article key={message.id} className="carte py-4 text-sm">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="flex items-center gap-2 font-semibold">
                      <MessageSquareText size={15} className="text-ink/35" /> {message.telephone}
                      <Badge ton="gris">{message.type}</Badge>
                    </p>
                    <p className="flex items-center gap-2 text-xs text-ink/50">
                      <Badge ton={STATUT[message.statut]?.ton ?? "gris"}>{STATUT[message.statut]?.label ?? message.statut}</Badge>
                      {message.segments} SMS · {formatDate(message.creeLe)}
                    </p>
                  </div>
                  <p className="mt-2 rounded-xl bg-paper px-3.5 py-2.5 text-ink/80">{message.texte}</p>
                  {message.erreur ? <p className="mt-1 text-xs text-cap">{message.erreur}</p> : null}
                </article>
              ))}
            </div>
          )}
        </>
      ) : null}

      {vue === "modeles" && direction ? (
        <div className="grid gap-3 md:grid-cols-2">
          {modeles.map((modele) => (
            <Formulaire key={modele.code} action={modifierModele} submit="Enregistrer" succes="Modèle enregistré" reinitialiser={false} boutonClassName="bouton-second" className="carte grid gap-3">
              <input type="hidden" name="code" value={modele.code} />
              <p className="flex items-center gap-2 text-sm font-semibold"><Pencil size={14} className="text-ink/35" /> {modele.libelle}</p>
              <textarea className="champ" name="corps" rows={3} defaultValue={modele.corps} />
              <p className="text-xs text-ink/45">{compterSegments(modele.corps)} SMS par envoi avec le texte actuel</p>
            </Formulaire>
          ))}
        </div>
      ) : null}
    </section>
  );
}
