import { redirect } from "next/navigation";
import { CalendarCheck, CalendarDays, CalendarPlus, Check, Palmtree, X } from "lucide-react";
import { prisma } from "@/lib/db";
import { debutJourAbidjan, formatJour, nomComplet } from "@/lib/format";
import { STATUTS_CONGE, TYPES_CONGE, labelRole, labelTypeConge } from "@/lib/labels";
import { BoutonEnvoi, FormAction, Formulaire } from "@/components/formulaire";
import { Kpi, Panneau } from "@/components/graphiques";
import { Tiroir } from "@/components/tiroir";
import { Avatar, Badge, Champ, Choix, EnTete } from "@/components/ui";
import { demanderConge, retirerConge, traiterConge } from "@/server/actions";
import { peutValiderConges } from "@/server/permissions";
import { requireUser } from "@/server/session";

export const metadata = { title: "Congés" };

function jours(debut: Date, fin: Date) {
  return Math.round((fin.getTime() - debut.getTime()) / 864e5) + 1;
}

const TON = { DEMANDE: "edu", VALIDE: "vert", REFUSE: "cap" } as const;

export default async function CongesPage({ searchParams }: { searchParams: Promise<{ nouveau?: string }> }) {
  const user = await requireUser();
  if (user.role === "PARTENAIRE") redirect("/dossiers");
  const { nouveau } = await searchParams;
  const valideur = peutValiderConges(user.role);
  const aujourdhui = debutJourAbidjan();
  const debutAnnee = new Date(Date.UTC(aujourdhui.getUTCFullYear(), 0, 1));

  const [miens, enAttente, aVenir] = await Promise.all([
    prisma.conge.findMany({ where: { userId: user.id }, orderBy: { debut: "desc" }, take: 20 }),
    valideur ? prisma.conge.findMany({ where: { statut: "DEMANDE" }, include: { user: true }, orderBy: { debut: "asc" } }) : [],
    prisma.conge.findMany({
      where: { statut: "VALIDE", fin: { gte: aujourdhui } },
      include: { user: true },
      orderBy: { debut: "asc" },
      take: 20,
    }),
  ]);
  const prisCetteAnnee = miens
    .filter((conge) => conge.statut === "VALIDE" && conge.type === "CONGE" && conge.debut >= debutAnnee)
    .reduce((somme, conge) => somme + jours(conge.debut, conge.fin), 0);
  const absentsAujourdhui = aVenir.filter((conge) => conge.debut <= new Date()).length;

  return (
    <section className="grid gap-6">
      <EnTete
        titre="Congés et absences"
        icone={Palmtree}
        description="Demandez une absence en quelques secondes ; la direction est prévenue et valide."
        actions={
          <Tiroir label="Demander une absence" icone={<CalendarPlus size={16} />} titre="Demande d'absence" description="Vous serez notifié de la décision." ouvertParDefaut={nouveau === "1"}>
            <Formulaire action={demanderConge} submit="Envoyer la demande" succes="Demande envoyée à la direction" className="grid gap-4">
              <Choix label="Type" name="type" options={TYPES_CONGE} />
              <div className="grid gap-4 sm:grid-cols-2">
                <Champ label="Du"><input className="champ" type="date" name="debut" required /></Champ>
                <Champ label="Au (inclus)"><input className="champ" type="date" name="fin" required /></Champ>
              </div>
              <Champ label="Motif"><textarea className="champ" name="motif" rows={3} placeholder="Facultatif" /></Champ>
            </Formulaire>
          </Tiroir>
        }
      />

      <div className="grid gap-3 sm:grid-cols-3">
        <Kpi titre="Mes jours de congé pris" valeur={prisCetteAnnee} icone={CalendarCheck} detail={`en ${aujourdhui.getUTCFullYear()}`} />
        <Kpi titre="Absents aujourd'hui" valeur={absentsAujourdhui} icone={Palmtree} ton="mission" />
        {valideur ? <Kpi titre="Demandes à traiter" valeur={enAttente.length} icone={CalendarDays} ton={enAttente.length ? "edu" : "vert"} /> : null}
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <div className="grid gap-6 self-start">
          {valideur ? (
            <Panneau titre="Demandes à valider" action={enAttente.length ? <Badge ton="edu">{enAttente.length}</Badge> : null}>
              <div className="grid gap-2">
                {enAttente.map((conge) => (
                  <div key={conge.id} className="flex flex-wrap items-center gap-3 rounded-xl border border-ink/[0.06] p-3 text-sm">
                    <Avatar prenom={conge.user.prenom} nom={conge.user.nom} />
                    <div className="min-w-0 flex-1">
                      <p className="font-semibold">{nomComplet(conge.user)} <span className="font-normal text-ink/45">· {labelRole(conge.user.role)}</span></p>
                      <p className="text-xs text-ink/60">
                        {labelTypeConge(conge.type)} · {formatJour(conge.debut)} → {formatJour(conge.fin)} · <span className="font-semibold">{jours(conge.debut, conge.fin)} j</span>
                      </p>
                      {conge.motif ? <p className="mt-0.5 text-xs text-ink/50 italic">« {conge.motif} »</p> : null}
                    </div>
                    <div className="flex gap-1.5">
                      <FormAction action={traiterConge} succes="Absence validée">
                        <input type="hidden" name="congeId" value={conge.id} />
                        <input type="hidden" name="decision" value="VALIDE" />
                        <BoutonEnvoi className="bouton px-3 py-2" titre="Valider"><Check size={16} /></BoutonEnvoi>
                      </FormAction>
                      <FormAction action={traiterConge} succes="Demande refusée" confirmer="Refuser cette demande ?">
                        <input type="hidden" name="congeId" value={conge.id} />
                        <input type="hidden" name="decision" value="REFUSE" />
                        <BoutonEnvoi className="bouton-second px-3 py-2 text-cap" titre="Refuser"><X size={16} /></BoutonEnvoi>
                      </FormAction>
                    </div>
                  </div>
                ))}
                {enAttente.length === 0 ? <p className="py-4 text-center text-sm text-ink/50">Aucune demande en attente.</p> : null}
              </div>
            </Panneau>
          ) : null}

          <Panneau titre="Mes demandes">
            <ul className="grid gap-2 text-sm">
              {miens.map((conge) => (
                <li key={conge.id} className="flex items-center justify-between gap-2 rounded-xl bg-paper px-3.5 py-2.5">
                  <span>
                    <span className="font-medium">{labelTypeConge(conge.type)}</span>
                    <span className="text-ink/55"> · {formatJour(conge.debut)} → {formatJour(conge.fin)}</span>
                  </span>
                  <span className="flex items-center gap-2">
                    <Badge ton={TON[conge.statut]} point>{STATUTS_CONGE[conge.statut]}</Badge>
                    {conge.statut === "DEMANDE" ? (
                      <FormAction action={retirerConge} succes="Demande retirée" confirmer="Retirer cette demande ?">
                        <input type="hidden" name="congeId" value={conge.id} />
                        <BoutonEnvoi className="bouton-fantome px-2 py-1 text-xs text-cap">Retirer</BoutonEnvoi>
                      </FormAction>
                    ) : null}
                  </span>
                </li>
              ))}
              {miens.length === 0 ? <li className="py-4 text-center text-ink/50">Vous n'avez encore fait aucune demande.</li> : null}
            </ul>
          </Panneau>
        </div>

        <Panneau titre="Planning des absences" icone={CalendarDays} className="self-start">
          <ul className="grid gap-2 text-sm">
            {aVenir.map((conge) => {
              const enCours = conge.debut <= new Date();
              return (
                <li key={conge.id} className={`flex items-center gap-3 rounded-xl px-3 py-2.5 ${enCours ? "bg-mission/[0.08]" : ""}`}>
                  <Avatar prenom={conge.user.prenom} nom={conge.user.nom} taille="sm" />
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold">{nomComplet(conge.user)}</p>
                    <p className="text-xs text-ink/50">{labelTypeConge(conge.type)}</p>
                  </div>
                  <span className={`text-right text-xs ${enCours ? "font-semibold text-[#a35a12]" : "text-ink/60"}`}>
                    {enCours ? `Absent jusqu'au ${formatJour(conge.fin)}` : `${formatJour(conge.debut)} → ${formatJour(conge.fin)}`}
                  </span>
                </li>
              );
            })}
            {aVenir.length === 0 ? <li className="py-4 text-center text-ink/50">Aucune absence prévue.</li> : null}
          </ul>
        </Panneau>
      </div>
    </section>
  );
}
