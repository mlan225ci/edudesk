import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft, CalendarDays, ExternalLink, GraduationCap, Mail, MapPin, Pencil, Phone, Trash2, User, Wallet } from "lucide-react";
import { prisma } from "@/lib/db";
import { formatJour, nomComplet, xof } from "@/lib/format";
import { STATUTS_CANDIDATURE, TON_CANDIDATURE } from "@/lib/labels";
import { paysDesProcedures } from "@/lib/pays";
import { ChampsEcole } from "@/components/champs-ecole";
import { BoutonEnvoi, FormAction, Formulaire } from "@/components/formulaire";
import { Tiroir } from "@/components/tiroir";
import { Badge, EnTete, Vide } from "@/components/ui";
import { modifierEcole, supprimerEcole } from "@/server/ecoles";
import { peutEcoles } from "@/server/permissions";
import { requireUser } from "@/server/session";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ecole = await prisma.ecole.findUnique({ where: { id }, select: { nom: true } });
  return { title: ecole?.nom ?? "École" };
}

export default async function EcolePage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  if (user.role === "PARTENAIRE") redirect("/dossiers");
  const { id } = await params;
  const [ecole, procedures] = await Promise.all([
    prisma.ecole.findUnique({
      where: { id },
      include: {
        candidatures: {
          orderBy: { majLe: "desc" },
          include: { dossier: { select: { id: true, reference: true, client: { select: { prenom: true, nom: true } } } } },
        },
      },
    }),
    prisma.procedure.findMany({ where: { ecoles: true }, select: { destination: true } }),
  ]);
  if (!ecole) notFound();
  const gestion = peutEcoles(user.role);
  const frequents = paysDesProcedures(procedures.map((procedure) => procedure.destination));
  const formations = (ecole.formations ?? "").split("\n").map((item) => item.trim()).filter(Boolean);
  const inscrits = ecole.candidatures.filter((item) => item.statut === "CHOISIE").length;
  const admis = ecole.candidatures.filter((item) => item.statut === "ADMIS" || item.statut === "CHOISIE").length;
  const refus = ecole.candidatures.filter((item) => item.statut === "REFUSE").length;
  const site = ecole.siteWeb ? (ecole.siteWeb.startsWith("http") ? ecole.siteWeb : `https://${ecole.siteWeb}`) : null;

  return (
    <section className="grid gap-6">
      <Link href="/ecoles" className="flex w-fit items-center gap-1.5 text-sm font-semibold text-ink/55 hover:text-desk">
        <ArrowLeft size={16} /> Toutes les écoles
      </Link>
      <EnTete
        titre={ecole.nom}
        icone={GraduationCap}
        surTitre={`${ecole.pays}${ecole.ville ? ` · ${ecole.ville}` : ""}`}
        description={ecole.type ?? undefined}
        actions={
          <>
            {!ecole.actif ? <Badge ton="gris">Archivée</Badge> : ecole.partenaire ? <Badge ton="vert" point>École partenaire</Badge> : null}
            {gestion ? (
              <Tiroir label="Modifier" icone={<Pencil size={15} />} variante="second" titre="Modifier l'école" description={ecole.nom}>
                <Formulaire action={modifierEcole} submit="Enregistrer" succes="École mise à jour" reinitialiser={false} className="grid gap-4">
                  <input type="hidden" name="ecoleId" value={ecole.id} />
                  <ChampsEcole ecole={ecole} frequents={frequents} id={ecole.id} />
                  <label className="flex items-center gap-2.5 text-sm font-semibold">
                    <input type="checkbox" name="actif" defaultChecked={ecole.actif} className="h-4 w-4 accent-desk" />
                    Proposée dans les dossiers (décocher pour archiver)
                  </label>
                </Formulaire>
                <FormAction
                  action={supprimerEcole}
                  className="mt-6 border-t border-ink/10 pt-5"
                  confirmer={
                    ecole.candidatures.length > 0
                      ? "Cette école a des candidatures : elle sera archivée (plus proposée), son historique reste visible. Continuer ?"
                      : "Supprimer définitivement cette école ?"
                  }
                >
                  <input type="hidden" name="ecoleId" value={ecole.id} />
                  <BoutonEnvoi className="bouton-fantome text-cap">
                    <Trash2 size={15} /> {ecole.candidatures.length > 0 ? "Archiver l'école" : "Supprimer l'école"}
                  </BoutonEnvoi>
                </FormAction>
              </Tiroir>
            ) : null}
          </>
        }
      />

      <div className="grid gap-6 lg:grid-cols-[1fr_1.6fr]">
        <div className="grid content-start gap-4">
          <div className="carte grid gap-4">
            <dl className="grid grid-cols-3 gap-2 rounded-xl bg-paper p-3 text-center text-sm">
              <div><dt className="text-xs text-ink/50">Admis</dt><dd className="text-lg font-bold text-vert">{admis}</dd></div>
              <div><dt className="text-xs text-ink/50">Refus</dt><dd className="text-lg font-bold text-cap">{refus}</dd></div>
              <div><dt className="text-xs text-ink/50">Inscrits</dt><dd className="text-lg font-bold">{inscrits}</dd></div>
            </dl>
            <ul className="grid gap-2.5 text-sm">
              <li className="flex items-center gap-2.5"><Wallet size={16} className="text-ink/40" />{ecole.fraisXof ? `${xof(ecole.fraisXof)} par an` : "Frais de scolarité non renseignés"}</li>
              {ecole.rentrees ? <li className="flex items-center gap-2.5"><CalendarDays size={16} className="text-ink/40" />Rentrées : {ecole.rentrees}</li> : null}
              {ecole.ville ? <li className="flex items-center gap-2.5"><MapPin size={16} className="text-ink/40" />{ecole.ville}, {ecole.pays}</li> : null}
              {ecole.contactNom ? <li className="flex items-center gap-2.5"><User size={16} className="text-ink/40" />{ecole.contactNom}</li> : null}
              {ecole.telephone ? <li className="flex items-center gap-2.5"><Phone size={16} className="text-ink/40" /><a className="hover:text-desk" href={`tel:${ecole.telephone}`}>{ecole.telephone}</a></li> : null}
              {ecole.email ? <li className="flex items-center gap-2.5"><Mail size={16} className="text-ink/40" /><a className="hover:text-desk" href={`mailto:${ecole.email}`}>{ecole.email}</a></li> : null}
              {site ? (
                <li className="flex items-center gap-2.5">
                  <ExternalLink size={16} className="text-ink/40" />
                  <a className="truncate text-desk hover:underline" href={site} target="_blank" rel="noreferrer">{ecole.siteWeb}</a>
                </li>
              ) : null}
            </ul>
            {ecole.partenaire ? (
              <p className="rounded-xl bg-vert/[0.07] px-3.5 py-2.5 text-sm text-vert">
                Commission : <strong>{ecole.commissionXof ? xof(ecole.commissionXof) : "non renseignée"}</strong> par étudiant inscrit
                {ecole.commissionXof && inscrits ? <> · {xof(ecole.commissionXof * inscrits)} attendus</> : null}
              </p>
            ) : null}
          </div>
          {formations.length > 0 ? (
            <div className="carte grid gap-3">
              <h2 className="font-semibold">Formations</h2>
              <div className="flex flex-wrap gap-1.5">
                {formations.map((formation) => (
                  <span key={formation} className="rounded-lg bg-desk/[0.06] px-2.5 py-1 text-sm text-desk">{formation}</span>
                ))}
              </div>
            </div>
          ) : null}
          {ecole.notes ? (
            <div className="carte grid gap-2">
              <h2 className="font-semibold">Notes internes</h2>
              <p className="text-sm whitespace-pre-line text-ink/70">{ecole.notes}</p>
            </div>
          ) : null}
        </div>

        <div className="carte grid content-start gap-4">
          <h2 className="font-semibold">Candidatures ({ecole.candidatures.length})</h2>
          {ecole.candidatures.length === 0 ? (
            <Vide icone={GraduationCap} titre="Aucune candidature" texte="Proposez cette école depuis un dossier d'études du même pays." />
          ) : (
            <ul className="grid divide-y divide-ink/[0.06]">
              {ecole.candidatures.map((candidature) => (
                <li key={candidature.id}>
                  <Link href={`/dossiers/${candidature.dossier.id}`} className="flex items-center justify-between gap-3 rounded-xl px-2 py-3 transition hover:bg-paper">
                    <div className="min-w-0">
                      <p className="truncate font-semibold">{nomComplet(candidature.dossier.client)}</p>
                      <p className="truncate text-xs text-ink/55">
                        {candidature.dossier.reference}
                        {candidature.formation ? ` · ${candidature.formation}` : ""} · mis à jour le {formatJour(candidature.majLe)}
                      </p>
                    </div>
                    <Badge ton={TON_CANDIDATURE[candidature.statut]} point>{STATUTS_CANDIDATURE[candidature.statut]}</Badge>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </section>
  );
}
