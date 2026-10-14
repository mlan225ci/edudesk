import Link from "next/link";
import { notFound } from "next/navigation";
import { AlarmClock, ArrowLeft, CheckCircle2, Clock, FolderOpen, GraduationCap, History, KeyRound, MessageSquareText, Phone, Receipt, Repeat, Send, UserRound, Wallet } from "lucide-react";
import { prisma } from "@/lib/db";
import { etatFacture } from "@/lib/facturation";
import { delaiTexte, formatDate, formatJour, nomComplet, xof } from "@/lib/format";
import { ACTIONS_AUDIT, MODES, STATUTS, detailAudit, TON_STATUT, TYPES_PAIEMENT, labelMode, labelRole, labelRoles, labelTypePaiement, numerosEtapes, typePourAcompte } from "@/lib/labels";
import { FriseEtapes } from "@/components/frise";
import { Formulaire } from "@/components/formulaire";
import { Avatar, Badge, Champ, Choix, Progression } from "@/components/ui";
import { Tiroir } from "@/components/tiroir";
import { EtapeCourante } from "@/components/etape-courante";
import { ListeDocuments, type DocumentVue } from "@/components/documents";
import { PanneauCandidatures } from "@/components/candidatures";
import { PanneauDevis } from "@/components/panneau-devis";
import { PanneauTraductions } from "@/components/panneau-traductions";
import { encaisser, modifierLimite, modifierMontantConvenu, reaffecter, renvoyerCodeSuivi, reorienter } from "@/server/actions";
import { relancerPieces } from "@/server/communication-actions";
import { peutCandidatures, peutCloturer, peutDevis, peutEncaisser, peutModifierMontant, peutPiece, peutReaffecter, voitFinance } from "@/server/permissions";
import { requireUser } from "@/server/session";

const ACTIONS = ACTIONS_AUDIT;

const TON_ACTION: Record<string, string> = {
  PAIEMENT: "bg-vert",
  CLOTURE_ETAPE: "bg-desk",
  OUVERTURE: "bg-desk",
  RELANCE: "bg-cap",
  REORIENTATION: "bg-cap",
  BOUCLE: "bg-edu",
  TACHE_FAITE: "bg-ink/25",
  TACHE_REPRISE: "bg-ink/25",
  PIECE_RECUE: "bg-desk/60",
};

type AuditVue = { id: string; userId: string | null; action: string; detail: string | null; creeLe: Date; user: { prenom: string; nom: string } | null };

function epurerHistorique<T extends AuditVue>(audits: T[]) {
  const masques = new Set<string>();
  const derniereFaite = new Map<string, T>();
  for (const audit of [...audits].reverse()) {
    const cle = `${audit.userId}|${audit.detail}`;
    if (audit.action === "TACHE_FAITE") derniereFaite.set(cle, audit);
    if (audit.action !== "TACHE_REPRISE") continue;
    const faite = derniereFaite.get(cle);
    if (faite && audit.creeLe.getTime() - faite.creeLe.getTime() < 5 * 60_000) {
      masques.add(faite.id);
      masques.add(audit.id);
      derniereFaite.delete(cle);
    }
  }
  const groupes: (T & { fois: number })[] = [];
  for (const audit of audits) {
    if (masques.has(audit.id)) continue;
    const precedent = groupes.at(-1);
    if (precedent && precedent.action === audit.action && precedent.detail === audit.detail && precedent.userId === audit.userId) precedent.fois += 1;
    else groupes.push({ ...audit, fois: 1 });
  }
  return groupes;
}

function LigneHistorique({ audits }: { audits: (AuditVue & { fois: number })[] }) {
  return (
    <ol className="relative grid gap-4 border-l-2 border-ink/[0.06] pl-5">
      {audits.map((audit) => (
        <li key={audit.id} className="relative text-sm">
          <span className={`absolute top-1.5 -left-[27px] h-3 w-3 rounded-full border-2 border-white ${TON_ACTION[audit.action] ?? "bg-desk"}`} />
          <p>
            <span className="font-semibold">{ACTIONS[audit.action] ?? audit.action}</span>
            {audit.detail ? <span className="text-ink/60"> · {detailAudit(audit.detail)}</span> : null}
            {audit.fois > 1 ? <span className="ml-1.5 rounded-full bg-ink/[0.06] px-1.5 py-0.5 text-[11px] font-semibold text-ink/50">×{audit.fois}</span> : null}
          </p>
          <p className="text-xs text-ink/45">{audit.user ? nomComplet(audit.user) : "Système"} · {formatDate(audit.creeLe)}</p>
        </li>
      ))}
    </ol>
  );
}

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const dossier = await prisma.dossier.findUnique({ where: { id }, select: { reference: true } });
  return { title: dossier?.reference ?? "Dossier" };
}

export default async function DossierPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ nouveau?: string }>;
}) {
  const user = await requireUser();
  const { id } = await params;
  const { nouveau } = await searchParams;
  const dossier = await prisma.dossier.findUnique({
    where: { id },
    include: {
      client: { include: { partenaire: true } },
      procedure: true,
      etapes: {
        orderBy: { rang: "asc" },
        include: {
          taches: { orderBy: { ordre: "asc" } },
          pieces: { orderBy: { ordre: "asc" } },
          issues: { orderBy: { ordre: "asc" } },
        },
      },
      paiements: { include: { facture: { select: { id: true } }, factureReglee: { select: { id: true } } }, orderBy: { creeLe: "desc" } },
      candidatures: { include: { ecole: true }, orderBy: { creeLe: "asc" } },
      devis: { include: { facture: { select: { numero: true } } }, orderBy: { creeLe: "desc" } },
      factures: { where: { paiementId: null }, include: { reglements: { select: { montant: true } } }, orderBy: { creeLe: "desc" } },
      traductions: {
        include: { piece: { select: { libelle: true } }, traducteur: { select: { prenom: true, nom: true } } },
        orderBy: { creeLe: "desc" },
      },
    },
  });
  if (!dossier) notFound();
  if (user.role === "PARTENAIRE" && dossier.client.partenaireId !== user.partenaireId) notFound();
  const avecEcoles = dossier.procedure.ecoles || dossier.candidatures.length > 0;
  const gereCandidatures = avecEcoles && peutCandidatures(user.role);

  const [audits, utilisateurs, procedures, reportees, origine, ecoles] = await Promise.all([
    prisma.audit.findMany({
      where: { entite: "Dossier", entiteId: dossier.id, action: { not: "PIECE_CONSULTEE" } },
      include: { user: true },
      orderBy: { creeLe: "desc" },
      take: 80,
    }),
    prisma.user.findMany({ where: { actif: true, role: { not: "PARTENAIRE" } }, orderBy: { prenom: "asc" } }),
    prisma.procedure.findMany({ where: { actif: true, NOT: { id: dossier.procedureId } }, orderBy: { nom: "asc" } }),
    prisma.pieceDossier.findMany({ where: { dossierId: dossier.id, reportee: true }, orderBy: { libelle: "asc" } }),
    dossier.dossierOrigineId ? prisma.dossier.findUnique({ where: { id: dossier.dossierOrigineId } }) : null,
    gereCandidatures ? prisma.ecole.findMany({ where: { actif: true }, orderBy: [{ partenaire: "desc" }, { nom: "asc" }] }) : [],
  ]);
  const ecoleRetenue = dossier.candidatures.find((candidature) => candidature.statut === "CHOISIE")?.ecole;

  const maintenant = new Date();
  const courante = dossier.etapes.find((etape) => etape.statut === "EN_COURS");
  const responsable = utilisateurs.find((item) => item.id === courante?.responsableId);
  const cloturees = dossier.etapes.filter((etape) => etape.statut === "CLOTUREE").length;
  const pourcentage = Math.round((cloturees / Math.max(dossier.etapes.length, 1)) * 100);
  const typeRequis = courante ? typePourAcompte(courante.acompte) : null;
  const paiementPresent = typeRequis ? dossier.paiements.some((paiement) => paiement.type === typeRequis) : true;
  const finance = voitFinance(user.role);
  const lectureSeule = user.role === "PARTENAIRE";
  const convenu = dossier.montantConvenu ?? dossier.procedure.tarifXof;
  const totalPaye = dossier.paiements.reduce((somme, paiement) => somme + paiement.montant, 0);
  const resteAPayer = Math.max(convenu - totalPaye, 0);
  const enRetard = Boolean(courante?.limiteLe && courante.limiteLe < maintenant);
  const peutAgir = courante ? peutPiece(user, courante) : false;
  const numeros = numerosEtapes(dossier.etapes);
  const historique = epurerHistorique(audits);
  const documents: DocumentVue[] = [
    ...dossier.etapes
      .filter((etape) => etape.statut !== "A_VENIR")
      .flatMap((etape) =>
        etape.pieces.map((piece) => ({
          id: piece.id,
          libelle: piece.libelle,
          recue: piece.recue,
          fichier: Boolean(piece.fichierChemin),
          recueLe: piece.recueLe,
          etape: etape.titre,
          aVerifier: !piece.recue && Boolean(piece.fichierChemin),
        })),
      ),
    ...reportees.map((piece) => ({
      id: piece.id,
      libelle: piece.libelle,
      recue: piece.recue,
      fichier: Boolean(piece.fichierChemin),
      recueLe: piece.recueLe,
      etape: null,
      reportee: true,
    })),
  ];
  const manquantes = documents.filter((document) => !document.recue && !document.fichier).length;
  const aVerifier = documents.filter((document) => document.aVerifier).length;
  const traducteurs = utilisateurs.filter((item) => item.role === "TRADUCTEUR");

  return (
    <section className="grid gap-6">
      <Link href="/dossiers" className="bouton-fantome w-fit -ml-2.5">
        <ArrowLeft size={16} /> Dossiers
      </Link>

      <header className="carte flex flex-wrap items-center justify-between gap-5">
        <div className="flex min-w-0 items-center gap-4">
          <Avatar prenom={dossier.client.prenom} nom={dossier.client.nom} taille="lg" />
          <div className="min-w-0">
            <p className="text-xs font-semibold tracking-wide text-ink/45 uppercase">
              {dossier.reference} · {dossier.procedure.nom}
            </p>
            <h1 className="truncate text-2xl font-bold tracking-tight">{nomComplet(dossier.client)}</h1>
            <div className="mt-1.5 flex flex-wrap items-center gap-2">
              <Badge ton={TON_STATUT[dossier.statut]} point>{STATUTS[dossier.statut]}</Badge>
              <span className="text-xs text-ink/50">Ouvert le {formatJour(dossier.ouvertLe)}</span>
              {origine ? (
                <Link className="text-xs font-semibold text-desk hover:underline" href={`/dossiers/${origine.id}`}>
                  Suite de {origine.reference}
                </Link>
              ) : null}
            </div>
          </div>
        </div>
        <div className="w-full max-w-60">
          <div className="mb-1.5 flex justify-between text-sm">
            <span className="text-ink/55">Avancement</span>
            <span className="font-bold">{pourcentage}%</span>
          </div>
          <Progression valeur={pourcentage} ton={pourcentage === 100 ? "vert" : "desk"} />
          <p className="mt-1.5 text-xs text-ink/45">{cloturees} étape(s) sur {dossier.etapes.length}</p>
        </div>
      </header>

      <FriseEtapes
        etapes={dossier.etapes.map((etape) => ({
          id: etape.id,
          numero: numeros.get(etape.id) ?? String(etape.rang),
          titre: etape.titre,
          statut: etape.statut,
          retard: Boolean(etape.statut === "EN_COURS" && etape.limiteLe && etape.limiteLe < maintenant),
        }))}
      />

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_330px]">
        <div className="grid gap-6 self-start">
          {courante ? (
            <article className={`carte overflow-hidden p-0 ${enRetard ? "ring-2 ring-cap/20" : ""}`}>
              <div className={`flex flex-wrap items-start justify-between gap-3 px-6 py-5 ${enRetard ? "bg-cap/[0.04]" : "bg-edu/[0.08]"}`}>
                <div>
                  <p className="text-xs font-semibold tracking-wide text-ink/50 uppercase">
                    {numeros.get(courante.id) === "Contrat" ? "Étape contrat en cours" : `Étape ${numeros.get(courante.id)} en cours`}
                  </p>
                  <h2 className="mt-0.5 text-xl font-bold">{courante.titre}</h2>
                  <p className="mt-2 flex flex-wrap items-center gap-2 text-sm text-ink/65">
                    <UserRound size={15} />
                    {responsable ? nomComplet(responsable) : <span className="font-semibold text-cap">Aucun responsable · la direction est alertée</span>}
                    {courante.delegation ? <Badge ton="desk">Délégation</Badge> : null}
                    <span className="text-ink/35">·</span>
                    <span className="text-ink/50">{labelRoles(courante.roles)}</span>
                  </p>
                </div>
                <Badge ton={enRetard ? "cap" : "gris"}>
                  {enRetard ? <AlarmClock size={13} /> : <Clock size={13} />} {delaiTexte(courante.limiteLe)}
                </Badge>
              </div>

              {courante.choixEcole && !ecoleRetenue && !lectureSeule ? (
                <a href="#ecoles" className="flex items-center gap-2 border-b border-mission/15 bg-mission/[0.07] px-6 py-2.5 text-sm font-medium text-[#a35a12] hover:bg-mission/[0.12]">
                  <GraduationCap size={16} /> Pour clôturer cette étape, retenez l'école de l'étudiant dans « Écoles et candidatures ».
                </a>
              ) : null}
              {lectureSeule ? (
                <p className="px-6 py-5 text-sm text-ink/60">L'équipe EduDesk traite cette étape. Vous serez informé par SMS à chaque avancée.</p>
              ) : (
                <EtapeCourante
                  etapeId={courante.id}
                  dossierId={dossier.id}
                  taches={courante.taches.map((tache) => ({ id: tache.id, libelle: tache.libelle, obligatoire: tache.obligatoire, faite: tache.faite }))}
                  pieces={courante.pieces.map((piece) => ({ id: piece.id, libelle: piece.libelle, obligatoire: piece.obligatoire, recue: piece.recue, fichier: Boolean(piece.fichierChemin) }))}
                  issues={courante.issues.map((issue) => ({ id: issue.id, libelle: issue.libelle, effet: issue.effet }))}
                  attentePaiement={typeRequis && !paiementPresent ? labelTypePaiement(typeRequis) : null}
                  peutAgir={peutAgir}
                  peutCloturer={peutCloturer(user, courante)}
                  peutEncaisser={peutEncaisser(user.role)}
                />
              )}
            </article>
          ) : (
            <article className="carte">
              <div className="flex items-center gap-3">
                <span className="grid h-11 w-11 place-items-center rounded-2xl bg-ink/5 text-ink/50">
                  {dossier.statut === "RELANCE" ? <Repeat size={20} /> : <CheckCircle2 size={20} />}
                </span>
                <div>
                  <h2 className="text-lg font-bold">{STATUTS[dossier.statut]}</h2>
                  <p className="text-sm text-ink/55">Aucune étape n'est ouverte sur ce dossier.</p>
                </div>
              </div>
              {dossier.statut === "RELANCE" && !lectureSeule ? (
                <Formulaire action={reorienter} submit="Réorienter vers cette procédure" succes="Nouveau dossier ouvert" className="mt-5 grid gap-3" icone={<Repeat size={16} />}>
                  <input type="hidden" name="dossierId" value={dossier.id} />
                  <Champ label="Nouvelle procédure" aide="Les pièces déjà reçues sont reprises automatiquement.">
                    <select className="champ" name="procedureId" required>
                      {procedures.map((procedure) => (
                        <option key={procedure.id} value={procedure.id}>{procedure.nom}</option>
                      ))}
                    </select>
                  </Champ>
                </Formulaire>
              ) : null}
            </article>
          )}

          {avecEcoles ? (
            <PanneauCandidatures
              dossierId={dossier.id}
              destination={dossier.procedure.destination}
              candidatures={dossier.candidatures}
              ecoles={ecoles}
              peutAgir={gereCandidatures}
            />
          ) : null}

          {!lectureSeule ? (
            <article className="carte" id="documents">
              <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h2 className="flex items-center gap-2 font-semibold"><FolderOpen size={18} className="text-ink/40" /> Documents du dossier</h2>
                  <p className="mt-0.5 text-xs text-ink/50">
                    {documents.filter((document) => document.fichier).length} fichier(s) · {manquantes} manquant(s)
                    {aVerifier ? <span className="font-semibold text-mission"> · {aVerifier} déposé(s) par le client à vérifier</span> : null}
                  </p>
                </div>
                {manquantes > 0 ? (
                  <Formulaire
                    action={relancerPieces}
                    submit={`Demander les ${manquantes} pièce(s) au client`}
                    succes="Liste des pièces envoyée au client"
                    boutonClassName="bouton-second"
                    icone={<Send size={15} />}
                  >
                    <input type="hidden" name="dossierId" value={dossier.id} />
                  </Formulaire>
                ) : null}
              </div>
              <ListeDocuments documents={documents} vide="Aucun document attendu pour l'instant." peutJoindre />
            </article>
          ) : null}

          {!lectureSeule && (dossier.traductions.length > 0 || documents.some((document) => document.fichier)) ? (
            <PanneauTraductions
              traductions={dossier.traductions}
              pieces={documents.filter((document) => document.fichier).map((document) => ({ id: document.id, libelle: document.libelle }))}
              traducteurs={traducteurs}
              peutDemander
            />
          ) : null}

          {!lectureSeule && (peutDevis(user.role) || dossier.devis.length > 0) ? (
            <PanneauDevis
              dossierId={dossier.id}
              devis={dossier.devis}
              procedure={dossier.procedure}
              emailClient={dossier.client.email}
              peutAgir={peutDevis(user.role)}
            />
          ) : null}

          <article className="carte">
            <h2 className="mb-4 flex items-center gap-2 font-semibold"><History size={18} className="text-ink/40" /> Historique</h2>
            <LigneHistorique audits={historique.slice(0, 6)} />
            {historique.length > 6 ? (
              <details className="group mt-4">
                <summary className="bouton-fantome w-fit cursor-pointer list-none text-desk">
                  <span className="group-open:hidden">Voir tout l'historique ({historique.length - 6} de plus)</span>
                  <span className="hidden group-open:inline">Masquer l'historique complet</span>
                </summary>
                <div className="mt-4 animate-entree">
                  <LigneHistorique audits={historique.slice(6)} />
                </div>
              </details>
            ) : null}
          </article>
        </div>

        <aside className="grid gap-4 self-start lg:sticky lg:top-24">
          <article className="carte text-sm">
            <h2 className="mb-3 font-semibold">Client</h2>
            <div className="grid gap-2">
              <a href={`tel:${dossier.client.telephone}`} className="flex items-center gap-2 text-ink/75 hover:text-desk">
                <Phone size={15} className="text-ink/40" /> {dossier.client.telephone}
              </a>
              <p className="text-ink/60">{dossier.client.email || "Sans e-mail"}</p>
              <p className="text-ink/60">Partenaire : {dossier.client.partenaire?.nom ?? "aucun"}</p>
            </div>
            <Link href={`/clients/${dossier.client.id}`} className="bouton-second mt-4 w-full">
              Voir la fiche client
            </Link>
            {!lectureSeule ? (
              <div className="mt-4 border-t border-ink/[0.06] pt-4">
                <p className="flex items-center gap-1.5 text-xs font-semibold tracking-wide text-ink/45 uppercase">
                  <KeyRound size={13} /> Code de suivi client
                </p>
                {dossier.codeSuivi ? (
                  <>
                    <p className="mt-1.5 font-mono text-lg font-bold tracking-[0.2em]">{dossier.codeSuivi}</p>
                    <p className="text-xs text-ink/50">Le client suit son dossier sur la page « /suivi » avec ce code.</p>
                    <Formulaire
                      action={renvoyerCodeSuivi}
                      submit="Renvoyer par SMS"
                      succes="Code de suivi renvoyé au client"
                      boutonClassName="bouton-second mt-3 w-full"
                      icone={<MessageSquareText size={15} />}
                    >
                      <input type="hidden" name="dossierId" value={dossier.id} />
                    </Formulaire>
                  </>
                ) : (
                  <p className="mt-1.5 text-xs text-ink/55">
                    Envoyé automatiquement par SMS à l'ouverture formelle du dossier, dès la signature du contrat et l'encaissement de l'acompte.
                  </p>
                )}
              </div>
            ) : null}
          </article>

          {finance ? (
            <article className="carte">
              <h2 className="mb-3 flex items-center gap-2 font-semibold"><Wallet size={18} className="text-ink/40" /> Paiements</h2>
              <div className="grid gap-1.5 rounded-xl bg-paper p-3.5 text-sm">
                <p className="flex justify-between"><span className="text-ink/60">Convenu</span><span className="font-semibold tabular-nums">{convenu ? xof(convenu) : "Non fixé"}</span></p>
                <p className="flex justify-between"><span className="text-ink/60">Payé</span><span className="font-semibold tabular-nums text-vert">{xof(totalPaye)}</span></p>
                <p className="flex justify-between border-t border-ink/[0.06] pt-1.5">
                  <span className="text-ink/60">Reste à payer</span>
                  <span className={`font-bold tabular-nums ${resteAPayer > 0 ? "text-cap" : "text-vert"}`}>{xof(resteAPayer)}</span>
                </p>
                {convenu > 0 ? <div className="mt-1"><Progression valeur={(totalPaye / convenu) * 100} ton={resteAPayer ? "desk" : "vert"} /></div> : null}
              </div>
              {typeRequis && !paiementPresent ? (
                <p className="mt-3 rounded-xl bg-edu/15 px-3 py-2 text-xs font-medium">Cette étape attend : {labelTypePaiement(typeRequis)}.</p>
              ) : null}
              <div className="mt-3 flex flex-wrap gap-2">
                {peutEncaisser(user.role) ? (
                  <Tiroir
                    label="Encaisser"
                    icone={<Wallet size={16} />}
                    titre="Nouvel encaissement"
                    description={`${nomComplet(dossier.client)} · ${dossier.reference}`}
                    ouvertParDefaut={nouveau === "encaissement"}
                  >
                    <Formulaire action={encaisser} submit="Enregistrer l'encaissement" succes="Encaissement enregistré, facture générée" className="grid gap-4">
                      <input type="hidden" name="dossierId" value={dossier.id} />
                      <Champ label="Nature du paiement">
                        <select className="champ" name="type" defaultValue={typeRequis ?? "AUTRE"}>
                          {TYPES_PAIEMENT.map((type) => (
                            <option key={type.value} value={type.value}>{type.label}</option>
                          ))}
                        </select>
                      </Champ>
                      <Champ
                        label="Montant (F CFA)"
                        aide={typeRequis === "ACOMPTE_SCOLARITE" && ecoleRetenue?.fraisXof ? `Frais de scolarité de ${ecoleRetenue.nom} : ${xof(ecoleRetenue.fraisXof)} par an.` : undefined}
                      >
                        <input
                          className="champ text-lg font-semibold"
                          name="montant"
                          inputMode="numeric"
                          placeholder="150 000"
                          defaultValue={(typeRequis === "ACOMPTE_SCOLARITE" && ecoleRetenue?.fraisXof) || resteAPayer || ""}
                          required
                        />
                      </Champ>
                      <Choix label="Moyen de paiement" name="mode" options={MODES} defaut={MODES[2]?.value} />
                      <Champ label="Précision">
                        <input className="champ" name="precision" placeholder="Orange Money, Wave, banque…" />
                      </Champ>
                      <Champ label="Référence du reçu">
                        <input className="champ" name="referenceExterne" placeholder="Facultatif" />
                      </Champ>
                      <Champ label="Date">
                        <input className="champ" type="date" name="date" required defaultValue={new Date().toISOString().slice(0, 10)} />
                      </Champ>
                    </Formulaire>
                  </Tiroir>
                ) : null}
                {peutModifierMontant(user.role) ? (
                  <Tiroir label="Montant convenu" variante="second" titre="Montant convenu" description="Prix total facturé au client pour ce dossier.">
                    <Formulaire action={modifierMontantConvenu} submit="Enregistrer" succes="Montant convenu mis à jour" reinitialiser={false}>
                      <input type="hidden" name="dossierId" value={dossier.id} />
                      <Champ label="Montant (F CFA)" aide={`Tarif de la procédure : ${xof(dossier.procedure.tarifXof)}`}>
                        <input className="champ" name="montantConvenu" inputMode="numeric" defaultValue={convenu || ""} />
                      </Champ>
                    </Formulaire>
                  </Tiroir>
                ) : null}
              </div>
              {dossier.factures.length ? (
                <ul className="mt-4 grid gap-2 text-sm">
                  {dossier.factures.map((facture) => {
                    const regle = facture.reglements.reduce((somme, reglement) => somme + reglement.montant, 0);
                    const etat = etatFacture({ montant: facture.montant, regle, annuleeLe: facture.annuleeLe, echeanceLe: facture.echeanceLe });
                    return (
                      <li key={facture.id}>
                        <Link href={`/facturation/factures/${facture.id}`} className="flex items-center justify-between gap-2 rounded-xl bg-paper px-3 py-2.5 hover:bg-desk/[0.06]">
                          <span className="min-w-0">
                            <span className="block font-semibold">{facture.numero}</span>
                            <span className="block truncate text-xs text-ink/50">{xof(facture.montant)}{regle && !facture.annuleeLe ? ` · réglé ${xof(regle)}` : ""}</span>
                          </span>
                          <Badge ton={etat.ton}>{etat.label}</Badge>
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              ) : null}
              <ul className="mt-4 grid gap-2 text-sm">
                {dossier.paiements.map((paiement) => (
                  <li key={paiement.id} className="flex items-center justify-between gap-2 rounded-xl border border-ink/[0.06] px-3 py-2.5">
                    <div className="min-w-0">
                      <p className="font-semibold tabular-nums">{xof(paiement.montant)}</p>
                      <p className="truncate text-xs text-ink/50">{labelTypePaiement(paiement.type)} · {labelMode(paiement.mode)} · {formatJour(paiement.dateEncaissement)}</p>
                    </div>
                    {paiement.facture || paiement.factureReglee ? (
                      <Link className="bouton-fantome shrink-0 text-desk" href={`/facturation/factures/${(paiement.facture ?? paiement.factureReglee)!.id}`} title="Voir la facture">
                        <Receipt size={15} />
                      </Link>
                    ) : null}
                  </li>
                ))}
                {dossier.paiements.length === 0 ? <li className="text-center text-xs text-ink/45">Aucun encaissement pour l'instant.</li> : null}
              </ul>
            </article>
          ) : null}

          {courante && !lectureSeule && (peutReaffecter(user.role) || user.role === "ASSISTANTE_ADMINISTRATIVE") ? (
            <article className="carte grid gap-4">
              <h2 className="flex items-center gap-2 font-semibold"><AlarmClock size={18} className="text-ink/40" /> Pilotage de l'étape</h2>
              <Formulaire action={modifierLimite} submit="Changer l'échéance" succes="Échéance mise à jour" boutonClassName="bouton-second">
                <input type="hidden" name="etapeId" value={courante.id} />
                <Champ label="Nouvelle échéance">
                  <input className="champ" type="datetime-local" name="limite" />
                </Champ>
              </Formulaire>
              {peutReaffecter(user.role) ? (
                <Formulaire action={reaffecter} submit="Réaffecter" succes="Étape réaffectée, la personne est prévenue" boutonClassName="bouton-second">
                  <input type="hidden" name="etapeId" value={courante.id} />
                  <Champ label="Confier l'étape à">
                    <select className="champ" name="userId" required defaultValue={courante.responsableId ?? ""}>
                      {utilisateurs.map((item) => (
                        <option key={item.id} value={item.id}>{nomComplet(item)} · {labelRole(item.role)}</option>
                      ))}
                    </select>
                  </Champ>
                </Formulaire>
              ) : null}
            </article>
          ) : null}
        </aside>
      </div>
    </section>
  );
}
