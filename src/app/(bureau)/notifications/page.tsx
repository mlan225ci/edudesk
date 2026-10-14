import Link from "next/link";
import { Bell, BellOff, ChevronRight, Mail, MessageSquareText, Paperclip, RotateCcw, Settings } from "lucide-react";
import { prisma } from "@/lib/db";
import { formatDate } from "@/lib/format";
import { BoutonEnvoi, FormAction } from "@/components/formulaire";
import { Badge, EnTete, Info, Onglets, Vide } from "@/components/ui";
import { renvoyerMail } from "@/server/communication-actions";
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
  const sms =
    vue === "sms"
      ? await prisma.notificationSms.findMany({
          where: user.role === "PARTENAIRE" ? { type: "PARTENAIRE", dossierId: { in: dossiersPartenaire.map((dossier) => dossier.id) } } : {},
          orderBy: { creeLe: "desc" },
          take: 80,
        })
      : [];
  const mails =
    vue === "mail" && user.role !== "PARTENAIRE"
      ? await prisma.notificationMail.findMany({ orderBy: { creeLe: "desc" }, take: 80 })
      : [];

  return (
    <section className="grid gap-6">
      <EnTete
        titre="Notifications"
        icone={Bell}
        description="Ce qui vous concerne et l'historique des SMS envoyés."
        actions={
          direction ? (
            <Link href="/parametres/sms" className="bouton-second">
              <Settings size={16} /> Modèles et opérateur SMS
            </Link>
          ) : null
        }
      />

      <Onglets
        actif={`/notifications?vue=${vue}`}
        onglets={[
          { href: "/notifications?vue=moi", label: "Pour moi", nombre: internes.filter((note) => !note.lue).length || undefined },
          { href: "/notifications?vue=sms", label: "Journal SMS" },
          ...(user.role === "PARTENAIRE" ? [] : [{ href: "/notifications?vue=mail", label: "Journal e-mails" }]),
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
          <Info>Sans opérateur SMS branché (Paramètres › SMS), les messages sont conservés ici sans être envoyés.</Info>
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

      {vue === "mail" && user.role !== "PARTENAIRE" ? (
        <>
          <Info>Sans serveur d&apos;envoi branché (Paramètres › E-mail), les e-mails sont conservés ici sans être envoyés.</Info>
          {mails.length === 0 ? (
            <Vide icone={Mail} titre="Aucun e-mail" texte="Les e-mails partent vers les clients et partenaires qui ont une adresse renseignée." />
          ) : (
            <div className="grid gap-2 entree-cascade">
              {mails.map((mail) => (
                <article key={mail.id} className="carte py-4 text-sm">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="flex items-center gap-2 font-semibold">
                      <Mail size={15} className="text-ink/35" /> {mail.destinataire}
                      <Badge ton="gris">{mail.type}</Badge>
                      {mail.pieceJointe ? (
                        <Badge ton="desk">
                          <Paperclip size={11} /> {mail.pieceJointe.startsWith("facture") ? "Facture" : "Devis"}
                        </Badge>
                      ) : null}
                    </p>
                    <p className="flex items-center gap-2 text-xs text-ink/50">
                      <Badge ton={STATUT[mail.statut]?.ton ?? "gris"}>{STATUT[mail.statut]?.label ?? mail.statut}</Badge>
                      {formatDate(mail.creeLe)}
                    </p>
                  </div>
                  <details className="mt-2 rounded-xl bg-paper px-3.5 py-2.5">
                    <summary className="cursor-pointer font-medium text-ink/85">{mail.sujet}</summary>
                    <p className="mt-2 whitespace-pre-line text-ink/70">{mail.corps}</p>
                  </details>
                  {mail.erreur ? <p className="mt-1 text-xs text-cap">{mail.erreur}</p> : null}
                  {direction && (mail.statut === "ECHEC" || mail.statut === "JOURNAL") ? (
                    <FormAction action={renvoyerMail.bind(null, mail.id)} succes="E-mail relancé" className="mt-2">
                      <BoutonEnvoi className="bouton-fantome -ml-2.5 text-xs">
                        <RotateCcw size={13} /> Renvoyer
                      </BoutonEnvoi>
                    </FormAction>
                  ) : null}
                </article>
              ))}
            </div>
          )}
        </>
      ) : null}
    </section>
  );
}
