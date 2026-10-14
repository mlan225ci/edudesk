import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import {
  ArrowDown,
  ArrowLeft,
  ArrowUp,
  Check,
  CheckSquare,
  CircleAlert,
  Clock,
  FileText,
  GitBranch,
  Pause,
  PenLine,
  Plus,
  Rocket,
  Route,
  Settings2,
  Trash2,
  Users,
  Wallet,
  X,
} from "lucide-react";
import { prisma } from "@/lib/db";
import { delaiCourt, xof } from "@/lib/format";
import { ROLES, labelRoles, labelTypePaiement, numerosEtapes, typePourAcompte } from "@/lib/labels";
import { BoutonEnvoi, FormAction, Formulaire } from "@/components/formulaire";
import { Tiroir } from "@/components/tiroir";
import { Badge, Champ, EnTete, Info } from "@/components/ui";
import { ajouterElementModele, ajouterEtape } from "@/server/actions";
import {
  ajouterIssueModele,
  basculerObligatoireModele,
  deplacerEtapeModele,
  modifierEtapeModele,
  modifierProcedure,
  publierProcedure,
  supprimerElementModele,
  supprimerEtapeModele,
  supprimerProcedure,
} from "@/server/procedures";
import { peutProcedures } from "@/server/permissions";
import { requireUser } from "@/server/session";

const ACOMPTES = [
  { value: "AUCUN", label: "Aucun paiement exigé" },
  { value: "DOSSIER", label: "Acompte d'ouverture" },
  { value: "SCOLARITE", label: "Acompte de scolarité" },
  { value: "FRAIS", label: "Frais" },
];

const JALONS = [
  { value: "", label: "Étape ordinaire" },
  { value: "CONTRAT", label: "Contrat : ouvre formellement le dossier" },
  { value: "DECISION", label: "Décision : accord ou refus attendu" },
  { value: "DEPART", label: "Départ : le dossier passe en suivi" },
];

const EFFETS = [
  { value: "SUITE", label: "Continuer" },
  { value: "BOUCLE", label: "Recommencer l'étape" },
  { value: "RELANCE", label: "Mettre en relance" },
];

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const procedure = await prisma.procedure.findUnique({ where: { id }, select: { nom: true } });
  return { title: procedure?.nom ?? "Procédure" };
}

function CasesRoles({ coches = [] }: { coches?: string[] }) {
  return (
    <fieldset className="etiquette">
      <legend className="mb-1.5">Qui s'en occupe ?</legend>
      <div className="grid grid-cols-2 gap-2">
        {ROLES.filter((role) => role.value !== "PARTENAIRE").map((role) => (
          <label key={role.value} className="flex cursor-pointer items-center gap-2 rounded-xl border border-ink/10 px-3 py-2 text-xs font-medium has-checked:border-desk has-checked:bg-desk/[0.05]">
            <input type="checkbox" name="roles" value={role.value} className="accent-desk" defaultChecked={coches.includes(role.value)} />
            {role.label}
          </label>
        ))}
      </div>
    </fieldset>
  );
}

function LigneElement({ sorte, id, libelle, obligatoire }: { sorte: "tache" | "piece"; id: string; libelle: string; obligatoire: boolean }) {
  return (
    <li className="group flex items-center gap-2 rounded-lg px-1.5 py-1 hover:bg-paper">
      <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${obligatoire ? "bg-desk/60" : "bg-ink/20"}`} />
      <span className={`min-w-0 flex-1 ${obligatoire ? "" : "text-ink/55"}`}>{libelle}</span>
      <FormAction action={basculerObligatoireModele} succes={obligatoire ? "Devenu facultatif" : "Devenu obligatoire"}>
        <input type="hidden" name="sorte" value={sorte} />
        <input type="hidden" name="id" value={id} />
        <BoutonEnvoi
          className={`rounded-full px-2 py-0.5 text-[11px] font-semibold transition ${obligatoire ? "bg-desk/[0.08] text-desk hover:bg-desk/15" : "bg-ink/[0.05] text-ink/50 hover:bg-ink/10"}`}
          titre="Cliquer pour basculer obligatoire / facultatif"
        >
          {obligatoire ? "Obligatoire" : "Facultatif"}
        </BoutonEnvoi>
      </FormAction>
      <FormAction action={supprimerElementModele} succes="Retiré du modèle" confirmer={`Retirer « ${libelle} » de cette étape ?`}>
        <input type="hidden" name="sorte" value={sorte} />
        <input type="hidden" name="id" value={id} />
        <BoutonEnvoi className="rounded-md p-1 text-ink/30 opacity-0 transition group-hover:opacity-100 hover:bg-cap/10 hover:text-cap focus:opacity-100" titre="Retirer">
          <X size={14} />
        </BoutonEnvoi>
      </FormAction>
    </li>
  );
}

export default async function ProcedurePage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  if (!peutProcedures(user.role)) redirect("/missions");
  const { id } = await params;
  const procedure = await prisma.procedure.findUnique({
    where: { id },
    include: {
      etapes: {
        orderBy: { rang: "asc" },
        include: { taches: { orderBy: { ordre: "asc" } }, pieces: { orderBy: { ordre: "asc" } }, issues: { orderBy: { ordre: "asc" } } },
      },
      _count: { select: { dossiers: true } },
    },
  });
  if (!procedure) notFound();
  const direction = user.role === "CEO" || user.role === "ADMINISTRATEUR";
  const numeros = numerosEtapes(procedure.etapes);
  const controles = [
    { ok: procedure.etapes.length > 0, texte: "Au moins une étape" },
    { ok: procedure.etapes.some((etape) => etape.acompte === "DOSSIER"), texte: "Une étape exige l'acompte d'ouverture (contrat signé et acompte confirmé)" },
    { ok: procedure.etapes.every((etape) => etape.roles), texte: "Chaque étape a un responsable" },
  ];

  return (
    <section className="grid gap-6">
      <Link href="/parametres/procedures" className="bouton-fantome w-fit -ml-2.5">
        <ArrowLeft size={16} /> Procédures
      </Link>
      <EnTete
        titre={procedure.nom}
        icone={Route}
        surTitre={`${procedure.destination} · version ${procedure.version}`}
        description="Les dossiers déjà ouverts gardent leur copie des étapes ; vos changements valent pour les nouveaux."
        actions={
          <>
            <Tiroir label="Paramètres" variante="second" icone={<Settings2 size={16} />} titre="Paramètres de la procédure" description={procedure.nom}>
              <Formulaire action={modifierProcedure} submit="Enregistrer" succes="Procédure mise à jour" reinitialiser={false} className="grid gap-4">
                <input type="hidden" name="procedureId" value={procedure.id} />
                <Champ label="Nom"><input className="champ" name="nom" defaultValue={procedure.nom} required /></Champ>
                <Champ label="Destination"><input className="champ" name="destination" defaultValue={procedure.destination} required /></Champ>
                <label className="flex items-start gap-2.5 rounded-xl bg-paper p-3.5 text-sm">
                  <input type="checkbox" name="ecoles" defaultChecked={procedure.ecoles} className="mt-0.5 h-4 w-4 accent-desk" />
                  <span>
                    <span className="font-semibold">Procédure d'études</span>
                    <span className="block text-xs text-ink/55">Les dossiers affichent « Écoles et candidatures » pour proposer et suivre les écoles du catalogue.</span>
                  </span>
                </label>
                {direction ? (
                  <div className="grid gap-4 sm:grid-cols-2">
                    <Champ label="Tarif client (F CFA)" aide={`Actuel : ${xof(procedure.tarifXof)}`}>
                      <input className="champ" name="tarifXof" inputMode="numeric" defaultValue={procedure.tarifXof} />
                    </Champ>
                    <Champ label="Commission partenaire (F CFA)" aide={`Actuelle : ${xof(procedure.commissionXof)}`}>
                      <input className="champ" name="commissionXof" inputMode="numeric" defaultValue={procedure.commissionXof} />
                    </Champ>
                  </div>
                ) : (
                  <p className="text-xs text-ink/55">Tarif {xof(procedure.tarifXof)} · commission {xof(procedure.commissionXof)} (modifiables par la direction).</p>
                )}
              </Formulaire>
              {procedure._count.dossiers === 0 ? (
                <FormAction action={supprimerProcedure} confirmer={`Supprimer définitivement « ${procedure.nom} » ?`} className="mt-6 border-t border-ink/[0.06] pt-4">
                  <input type="hidden" name="procedureId" value={procedure.id} />
                  <BoutonEnvoi className="bouton-fantome text-cap"><Trash2 size={15} /> Supprimer cette procédure</BoutonEnvoi>
                </FormAction>
              ) : null}
            </Tiroir>
            <Tiroir label="Ajouter une étape" icone={<Plus size={16} />} titre="Nouvelle étape" description={procedure.nom}>
              <Formulaire action={ajouterEtape} submit="Ajouter l'étape" succes="Étape ajoutée" className="grid gap-4">
                <input type="hidden" name="procedureId" value={procedure.id} />
                <Champ label="Titre de l'étape"><input className="champ" name="titre" required autoFocus /></Champ>
                <div className="grid gap-4 sm:grid-cols-2">
                  <Champ label="Position" aide={`Par défaut : ${procedure.etapes.length + 1}`}><input className="champ" name="rang" type="number" min={1} /></Champ>
                  <Champ label="Délai (heures)" aide="Vide = selon traitement"><input className="champ" name="delaiHeures" inputMode="numeric" /></Champ>
                </div>
                <Champ label="Première tâche obligatoire"><input className="champ" name="tache" required /></Champ>
                <Champ label="Pièce attendue"><input className="champ" name="piece" placeholder="Facultatif" /></Champ>
                <CasesRoles />
              </Formulaire>
            </Tiroir>
          </>
        }
      />

      <article className={`carte flex flex-wrap items-center justify-between gap-4 ${procedure.actif ? "" : "border-l-4 border-l-edu"}`}>
        <div className="grid gap-2">
          <p className="flex items-center gap-2 font-semibold">
            {procedure.actif ? <Badge ton="vert" point>Active</Badge> : <Badge ton="edu" point>{procedure._count.dossiers > 0 ? "En pause" : "Brouillon"}</Badge>}
            {procedure.actif ? "Proposée à l'ouverture des dossiers" : "Pas encore proposée à l'ouverture des dossiers"}
          </p>
          <ul className="grid gap-1 text-sm">
            {controles.map((controle) => (
              <li key={controle.texte} className={`flex items-center gap-2 ${controle.ok ? "text-ink/60" : "font-medium text-cap"}`}>
                {controle.ok ? <Check size={15} className="text-vert" /> : <CircleAlert size={15} />} {controle.texte}
              </li>
            ))}
          </ul>
        </div>
        <Formulaire
          action={publierProcedure}
          submit={procedure.actif ? "Mettre en pause" : "Publier la procédure"}
          succes={procedure.actif ? "Procédure mise en pause" : "Procédure publiée"}
          reinitialiser={false}
          boutonClassName={procedure.actif ? "bouton-second" : "bouton"}
          icone={procedure.actif ? <Pause size={16} /> : <Rocket size={16} />}
          className="grid max-w-sm justify-items-end gap-2"
        >
          <input type="hidden" name="procedureId" value={procedure.id} />
        </Formulaire>
      </article>

      <ol className="relative grid gap-4 border-l-2 border-dashed border-desk/20 pl-6 md:ml-4">
        {procedure.etapes.map((etape, index) => {
          const paiement = typePourAcompte(etape.acompte);
          return (
            <li key={etape.id} className="relative">
              <span className="absolute top-5 -left-[42px] grid h-8 w-8 place-items-center rounded-full bg-desk text-sm font-bold text-white ring-4 ring-paper" title={numeros.get(etape.id)}>
                {numeros.get(etape.id) === "Contrat" ? <PenLine size={14} /> : numeros.get(etape.id)}
              </span>
              <article className="carte grid gap-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h2 className="font-semibold">
                      {etape.titre}
                      {etape.jalon === "CONTRAT" ? <span className="ml-2 align-middle"><Badge ton="edu">Contrat et acompte</Badge></span> : null}
                      {etape.jalon === "DECISION" ? <span className="ml-2 align-middle"><Badge ton="desk">Décision</Badge></span> : null}
                      {etape.jalon === "DEPART" ? <span className="ml-2 align-middle"><Badge ton="vert">Départ</Badge></span> : null}
                      {etape.choixEcole ? <span className="ml-2 align-middle"><Badge ton="mission">Choix de l'école</Badge></span> : null}
                    </h2>
                    <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-ink/55">
                      <span className="flex items-center gap-1"><Users size={13} /> {etape.roles ? labelRoles(etape.roles) : <span className="font-semibold text-cap">Aucun responsable</span>}</span>
                      <span className="flex items-center gap-1"><Clock size={13} /> {delaiCourt(etape.delaiHeures)}</span>
                      {paiement ? <span className="flex items-center gap-1 font-semibold text-ink/70"><Wallet size={13} /> {labelTypePaiement(paiement)} exigé</span> : null}
                    </p>
                  </div>
                  <div className="flex items-center gap-1">
                    <FormAction action={deplacerEtapeModele}>
                      <input type="hidden" name="etapeId" value={etape.id} />
                      <input type="hidden" name="sens" value="haut" />
                      <BoutonEnvoi className="bouton-fantome px-2 disabled:opacity-30" titre="Monter">
                        <ArrowUp size={15} />
                      </BoutonEnvoi>
                    </FormAction>
                    <FormAction action={deplacerEtapeModele}>
                      <input type="hidden" name="etapeId" value={etape.id} />
                      <input type="hidden" name="sens" value="bas" />
                      <BoutonEnvoi className="bouton-fantome px-2" titre="Descendre">
                        <ArrowDown size={15} />
                      </BoutonEnvoi>
                    </FormAction>
                    <Tiroir label="Modifier" variante="second" icone={<PenLine size={14} />} titre="Modifier l'étape" description={`${procedure.nom} · position ${index + 1}`}>
                      <Formulaire action={modifierEtapeModele} submit="Enregistrer l'étape" succes="Étape mise à jour" reinitialiser={false} className="grid gap-4">
                        <input type="hidden" name="etapeId" value={etape.id} />
                        <Champ label="Titre"><input className="champ" name="titre" defaultValue={etape.titre} required /></Champ>
                        <Champ label="Délai (heures)" aide="Vide = pas d'échéance automatique"><input className="champ" name="delaiHeures" inputMode="numeric" defaultValue={etape.delaiHeures ?? ""} /></Champ>
                        <Champ label="Paiement exigé avant de clôturer">
                          <select className="champ" name="acompte" defaultValue={etape.acompte}>
                            {ACOMPTES.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                          </select>
                        </Champ>
                        <Champ label="Rôle de l'étape" aide="L'étape « Contrat » déclenche l'ouverture formelle et l'envoi du code de suivi au client.">
                          <select className="champ" name="jalon" defaultValue={etape.jalon ?? ""}>
                            {JALONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                          </select>
                        </Champ>
                        <label className="flex items-start gap-2.5 rounded-xl bg-paper p-3.5 text-sm">
                          <input type="checkbox" name="choixEcole" defaultChecked={etape.choixEcole} className="mt-0.5 h-4 w-4 accent-desk" />
                          <span>
                            <span className="font-semibold">Exiger l'école retenue pour clôturer</span>
                            <span className="block text-xs text-ink/55">L'étape reste ouverte tant qu'aucune école n'est retenue dans le dossier.</span>
                          </span>
                        </label>
                        <CasesRoles coches={etape.roles.split(",")} />
                      </Formulaire>
                    </Tiroir>
                    <FormAction action={supprimerEtapeModele} succes="Étape supprimée" confirmer={`Supprimer l'étape « ${etape.titre} » ? Les dossiers déjà ouverts ne changent pas.`}>
                      <input type="hidden" name="etapeId" value={etape.id} />
                      <BoutonEnvoi className="bouton-fantome px-2 text-ink/40 hover:text-cap" titre="Supprimer l'étape">
                        <Trash2 size={15} />
                      </BoutonEnvoi>
                    </FormAction>
                  </div>
                </div>

                <div className="grid gap-4 text-sm sm:grid-cols-2">
                  <div>
                    <p className="mb-1 flex items-center gap-1.5 text-xs font-semibold text-ink/45 uppercase"><CheckSquare size={13} /> Tâches</p>
                    <ul className="grid">
                      {etape.taches.map((tache) => <LigneElement key={tache.id} sorte="tache" id={tache.id} libelle={tache.libelle} obligatoire={tache.obligatoire} />)}
                      {etape.taches.length === 0 ? <li className="px-1.5 text-ink/40">Aucune</li> : null}
                    </ul>
                  </div>
                  <div>
                    <p className="mb-1 flex items-center gap-1.5 text-xs font-semibold text-ink/45 uppercase"><FileText size={13} /> Pièces</p>
                    <ul className="grid">
                      {etape.pieces.map((piece) => <LigneElement key={piece.id} sorte="piece" id={piece.id} libelle={piece.libelle} obligatoire={piece.obligatoire} />)}
                      {etape.pieces.length === 0 ? <li className="px-1.5 text-ink/40">Aucune</li> : null}
                    </ul>
                  </div>
                </div>

                <div className="grid gap-2">
                  <p className="flex items-center gap-1.5 text-xs font-semibold text-ink/45 uppercase"><GitBranch size={13} /> Issues possibles à la clôture</p>
                  <div className="flex flex-wrap items-center gap-1.5">
                    {etape.issues.map((issue) => (
                      <span key={issue.id} className="group inline-flex items-center">
                        <Badge ton={issue.effet === "SUITE" ? "vert" : issue.effet === "BOUCLE" ? "edu" : "cap"}>{issue.libelle}</Badge>
                        <FormAction action={supprimerElementModele} succes="Issue retirée" confirmer={`Retirer l'issue « ${issue.libelle} » ?`}>
                          <input type="hidden" name="sorte" value="issue" />
                          <input type="hidden" name="id" value={issue.id} />
                          <BoutonEnvoi className="rounded-md p-0.5 text-ink/30 hover:text-cap" titre="Retirer">
                            <X size={13} />
                          </BoutonEnvoi>
                        </FormAction>
                      </span>
                    ))}
                    {etape.issues.length === 0 ? <span className="text-xs text-ink/45">Aucune : l'étape passe simplement à la suivante.</span> : null}
                  </div>
                  <FormAction action={ajouterIssueModele} succes="Issue ajoutée" className="flex flex-wrap gap-2">
                    <input type="hidden" name="etapeId" value={etape.id} />
                    <input className="champ min-w-40 flex-1 py-2 text-sm" name="libelle" placeholder="Ex. Visa accepté, Admission refusée…" required />
                    <select className="champ w-auto py-2 text-sm" name="effet" defaultValue="SUITE" aria-label="Effet de l'issue">
                      {EFFETS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                    </select>
                    <BoutonEnvoi className="bouton-second py-2"><Plus size={15} /> Issue</BoutonEnvoi>
                  </FormAction>
                </div>

                <FormAction action={ajouterElementModele} succes="Ajouté au modèle" className="flex flex-wrap gap-2 border-t border-ink/[0.06] pt-3">
                  <input type="hidden" name="etapeId" value={etape.id} />
                  <select className="champ w-auto py-2 text-sm" name="sorte" defaultValue="tache" aria-label="Type d'élément">
                    <option value="tache">Tâche</option>
                    <option value="piece">Pièce</option>
                  </select>
                  <input className="champ min-w-48 flex-1 py-2 text-sm" name="libelle" placeholder="Ajouter une tâche ou une pièce…" required />
                  <BoutonEnvoi className="bouton-second py-2"><Plus size={15} /> Ajouter</BoutonEnvoi>
                </FormAction>
              </article>
            </li>
          );
        })}
      </ol>
      <Info>Cliquez sur « Obligatoire » ou « Facultatif » pour basculer un élément. Les issues se choisissent au moment de clôturer l'étape dans le dossier.</Info>
    </section>
  );
}
