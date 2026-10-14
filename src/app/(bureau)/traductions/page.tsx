import Link from "next/link";
import { redirect } from "next/navigation";
import type { Prisma, StatutTraduction } from "@prisma/client";
import { AlarmClock, Download, Eye, Hand, Languages, ShieldCheck, Upload } from "lucide-react";
import { prisma } from "@/lib/db";
import { formatJour, nomComplet } from "@/lib/format";
import { STATUTS_TRADUCTION } from "@/lib/labels";
import { BoutonEnvoi, FormAction, Formulaire } from "@/components/formulaire";
import { Tiroir } from "@/components/tiroir";
import { Badge, Champ, EnTete, Onglets, Vide } from "@/components/ui";
import { peutTraduire, voitTraductions } from "@/server/permissions";
import { requireUser } from "@/server/session";
import { livrerTraduction, prendreTraduction } from "@/server/traductions-actions";

export const metadata = { title: "Traductions" };

const VUES: Record<string, StatutTraduction> = { "a-faire": "A_FAIRE", "en-cours": "EN_COURS", livrees: "TERMINEE" };

export default async function TraductionsPage({ searchParams }: { searchParams: Promise<{ vue?: string; tous?: string }> }) {
  const user = await requireUser();
  if (!voitTraductions(user.role)) redirect("/missions");
  const traducteur = peutTraduire(user.role);
  const { vue = "a-faire", tous } = await searchParams;
  const statut = VUES[vue] ?? "A_FAIRE";
  const miennes = user.role === "TRADUCTEUR" && !tous;
  const portee: Prisma.TraductionWhereInput = miennes ? { OR: [{ traducteurId: user.id }, { traducteurId: null }] } : {};

  const [traductions, compteurs] = await Promise.all([
    prisma.traduction.findMany({
      where: { ...portee, statut },
      include: {
        piece: { select: { libelle: true, fichierChemin: true } },
        dossier: { select: { id: true, reference: true, client: { select: { prenom: true, nom: true } }, procedure: { select: { destination: true } } } },
        traducteur: { select: { prenom: true, nom: true } },
      },
      orderBy: statut === "TERMINEE" ? { termineLe: "desc" } : [{ echeanceLe: { sort: "asc", nulls: "last" } }, { creeLe: "asc" }],
      take: 100,
    }),
    prisma.traduction.groupBy({ by: ["statut"], where: portee, _count: true }),
  ]);
  const nombre = (cle: StatutTraduction) => compteurs.find((ligne) => ligne.statut === cle)?._count || undefined;
  const maintenant = new Date();
  const suffixe = tous ? "&tous=1" : "";

  return (
    <section className="grid gap-6">
      <EnTete
        titre="Traductions"
        icone={Languages}
        description="Les documents à traduire, rattachés à leur original dans chaque dossier. Le traducteur dépose la traduction certifiée ici."
        actions={
          user.role === "TRADUCTEUR" ? (
            <Link href={`/traductions?vue=${vue}${tous ? "" : "&tous=1"}`} className="bouton-second">
              {tous ? "Mes traductions" : "Toutes les traductions"}
            </Link>
          ) : null
        }
      />
      <Onglets
        actif={`/traductions?vue=${vue}${suffixe}`}
        onglets={[
          { href: `/traductions?vue=a-faire${suffixe}`, label: "À faire", nombre: nombre("A_FAIRE") },
          { href: `/traductions?vue=en-cours${suffixe}`, label: "En cours", nombre: nombre("EN_COURS") },
          { href: `/traductions?vue=livrees${suffixe}`, label: "Livrées" },
        ]}
      />

      {traductions.length === 0 ? (
        <Vide icone={Languages} titre="Rien ici" texte="Les demandes de traduction se font depuis la fiche du dossier, à partir d'un document joint." />
      ) : (
        <div className="grid gap-3 entree-cascade">
          {traductions.map((traduction) => {
            const retard = traduction.statut !== "TERMINEE" && traduction.echeanceLe && traduction.echeanceLe < maintenant;
            return (
              <article key={traduction.id} className={`carte grid gap-3 ${retard ? "ring-2 ring-cap/20" : ""}`}>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="flex flex-wrap items-center gap-2 font-semibold">
                      {traduction.piece.libelle}
                      <span className="font-normal text-ink/55">{traduction.langueSource} → {traduction.langueCible}</span>
                      {traduction.certifiee ? <Badge ton="desk"><ShieldCheck size={11} /> Certifiée</Badge> : null}
                      <Badge ton={STATUTS_TRADUCTION[traduction.statut].ton}>{STATUTS_TRADUCTION[traduction.statut].label}</Badge>
                    </p>
                    <p className="mt-0.5 text-sm text-ink/60">
                      <Link href={`/dossiers/${traduction.dossier.id}#traductions`} className="font-medium text-desk hover:underline">{traduction.dossier.reference}</Link>
                      {" · "}{nomComplet(traduction.dossier.client)} · {traduction.dossier.procedure.destination}
                    </p>
                    <p className="mt-0.5 text-xs text-ink/45">
                      Demandée le {formatJour(traduction.creeLe)}
                      {traduction.traducteur ? ` · ${nomComplet(traduction.traducteur)}` : " · non attribuée"}
                      {traduction.statut === "TERMINEE" ? ` · livrée le ${formatJour(traduction.termineLe)}` : ""}
                    </p>
                  </div>
                  {traduction.echeanceLe && traduction.statut !== "TERMINEE" ? (
                    <Badge ton={retard ? "cap" : "gris"}><AlarmClock size={12} /> Pour le {formatJour(traduction.echeanceLe)}</Badge>
                  ) : null}
                </div>
                {traduction.observation ? <p className="rounded-xl bg-paper px-3.5 py-2.5 text-sm text-ink/75">{traduction.observation}</p> : null}
                <div className="flex flex-wrap items-center gap-2">
                  {traduction.piece.fichierChemin ? (
                    <a href={`/api/pieces/${traduction.pieceId}`} target="_blank" rel="noreferrer" className="bouton-second">
                      <Eye size={15} /> Original
                    </a>
                  ) : null}
                  {traduction.fichierChemin ? (
                    <a href={`/api/traductions/${traduction.id}?telecharger=1`} className="bouton-second">
                      <Download size={15} /> Traduction
                    </a>
                  ) : null}
                  {traducteur && traduction.statut === "A_FAIRE" ? (
                    <FormAction action={prendreTraduction.bind(null, traduction.id)} succes="Traduction prise en charge">
                      <BoutonEnvoi className="bouton-second"><Hand size={15} /> Prendre en charge</BoutonEnvoi>
                    </FormAction>
                  ) : null}
                  {traducteur && traduction.statut !== "TERMINEE" ? (
                    <Tiroir label="Déposer la traduction" icone={<Upload size={16} />} titre="Déposer la traduction" description={`${traduction.piece.libelle} · ${traduction.langueSource} → ${traduction.langueCible}`}>
                      <Formulaire action={livrerTraduction} submit="Livrer la traduction" succes="Traduction livrée" className="grid gap-4">
                        <input type="hidden" name="traductionId" value={traduction.id} />
                        <Champ label="Fichier traduit" aide="PDF, image ou Word, 10 Mo au plus.">
                          <input className="champ" type="file" name="fichier" accept="application/pdf,image/*,.doc,.docx,.odt" required />
                        </Champ>
                        <Champ label="Remarque">
                          <textarea className="champ" name="observation" rows={2} placeholder="Facultatif" />
                        </Champ>
                      </Formulaire>
                    </Tiroir>
                  ) : null}
                </div>
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}
