import { cookies } from "next/headers";
import { Award, Check, CircleDot, FileCheck2, FileClock, GraduationCap, LogOut, PenLine, ShieldCheck, Wallet } from "lucide-react";
import { prisma } from "@/lib/db";
import { formatJour, xof } from "@/lib/format";
import { STATUTS, TON_STATUT, labelTypePaiement, numerosEtapes, typePourAcompte } from "@/lib/labels";
import { normaliserCodeSuivi } from "@/lib/suivi";
import type { StatutCandidature } from "@prisma/client";
import { Badge, Progression, type Ton } from "@/components/ui";
import { FormulaireSuivi } from "@/components/formulaire-suivi";
import { quitterSuivi } from "@/server/suivi";

export const metadata = { title: "Suivi de dossier", robots: { index: false, follow: false } };

async function dossierSuivi() {
  const code = normaliserCodeSuivi((await cookies()).get("edudesk_suivi")?.value ?? "");
  if (!code) return null;
  return prisma.dossier.findUnique({
    where: { codeSuivi: code },
    include: {
      client: { select: { prenom: true, nom: true } },
      procedure: { select: { nom: true, destination: true, tarifXof: true } },
      etapes: {
        orderBy: { rang: "asc" },
        select: {
          id: true,
          rang: true,
          titre: true,
          jalon: true,
          acompte: true,
          statut: true,
          debutLe: true,
          clotureLe: true,
          pieces: { orderBy: { ordre: "asc" }, select: { id: true, libelle: true, obligatoire: true, recue: true } },
        },
      },
      paiements: { orderBy: { dateEncaissement: "desc" }, select: { id: true, type: true, montant: true, dateEncaissement: true } },
      candidatures: {
        where: { statut: { not: "ABANDONNEE" } },
        orderBy: { creeLe: "asc" },
        select: { id: true, statut: true, formation: true, ecole: { select: { nom: true, ville: true, pays: true } } },
      },
    },
  });
}

const CANDIDATURE_CLIENT: Record<StatutCandidature, { label: string; ton: Ton }> = {
  PROPOSEE: { label: "Proposée", ton: "edu" },
  SOUMISE: { label: "Candidature envoyée", ton: "desk" },
  ADMIS: { label: "Admis", ton: "vert" },
  REFUSE: { label: "Non retenu", ton: "gris" },
  CHOISIE: { label: "Votre école", ton: "mission" },
  ABANDONNEE: { label: "Abandonnée", ton: "gris" },
};

function EnTete({ connecte }: { connecte: boolean }) {
  return (
    <header className="flex items-center justify-between gap-3">
      <img src="/logo-edudesk.png" alt="EduDesk" className="h-9 w-auto sm:h-10" />
      {connecte ? (
        <form action={quitterSuivi}>
          <button className="bouton-fantome text-sm">
            <LogOut size={15} /> Changer de code
          </button>
        </form>
      ) : null}
    </header>
  );
}

export default async function SuiviPage() {
  const dossier = await dossierSuivi();

  if (!dossier) {
    return (
      <main className="min-h-screen bg-paper px-5 py-8 sm:py-12">
        <div className="mx-auto grid w-full max-w-md gap-10">
          <EnTete connecte={false} />
          <section className="animate-entree">
            <p className="text-sm font-semibold tracking-[0.18em] text-desk uppercase">Espace client</p>
            <h1 className="mt-2 text-3xl font-bold tracking-tight">Suivez votre dossier</h1>
            <p className="mt-2 mb-7 text-ink/60">Saisissez le code de suivi reçu par SMS à l'ouverture de votre dossier.</p>
            <div className="rounded-3xl border border-ink/[0.06] bg-card p-6 shadow-[0_1px_2px_rgba(20,40,75,0.04),0_20px_50px_-24px_rgba(20,40,75,0.25)]">
              <FormulaireSuivi />
            </div>
            <p className="mt-5 flex items-start gap-2 text-xs text-ink/50">
              <ShieldCheck size={15} className="mt-px shrink-0" />
              Ce code est personnel. Ne le partagez qu'avec les personnes de confiance qui vous accompagnent.
            </p>
          </section>
        </div>
      </main>
    );
  }

  const numeros = numerosEtapes(dossier.etapes);
  const courante = dossier.etapes.find((etape) => etape.statut === "EN_COURS");
  const cloturees = dossier.etapes.filter((etape) => etape.statut === "CLOTUREE").length;
  const pourcentage = Math.round((cloturees / Math.max(dossier.etapes.length, 1)) * 100);
  const typeRequis = courante ? typePourAcompte(courante.acompte) : null;
  const paiementAttendu = typeRequis && !dossier.paiements.some((paiement) => paiement.type === typeRequis) ? labelTypePaiement(typeRequis) : null;
  const pieces = dossier.etapes.filter((etape) => etape.statut !== "A_VENIR").flatMap((etape) => etape.pieces);
  const aFournir = pieces.filter((piece) => piece.obligatoire && !piece.recue);
  const recues = pieces.filter((piece) => piece.recue);
  const convenu = dossier.montantConvenu ?? dossier.procedure.tarifXof;
  const paye = dossier.paiements.reduce((somme, paiement) => somme + paiement.montant, 0);
  const reste = Math.max(convenu - paye, 0);
  const retenue = dossier.candidatures.find((candidature) => candidature.statut === "CHOISIE");

  return (
    <main className="min-h-screen bg-paper px-5 py-8 sm:py-12">
      <div className="mx-auto grid w-full max-w-2xl gap-6">
        <EnTete connecte />

        <section className="relative animate-entree overflow-hidden rounded-3xl bg-ink p-6 text-white sm:p-8">
          <div className="absolute -top-24 -right-24 h-64 w-64 rounded-full bg-desk/50 blur-3xl" />
          <div className="absolute -bottom-28 -left-16 h-64 w-64 rounded-full bg-edu/20 blur-3xl" />
          <div className="relative">
            <p className="text-xs font-semibold tracking-[0.18em] text-white/55 uppercase">{dossier.reference}</p>
            <h1 className="mt-2 text-2xl font-bold tracking-tight sm:text-3xl">Bonjour {dossier.client.prenom}</h1>
            <p className="mt-1 text-white/70">{dossier.procedure.nom}</p>
            <div className="mt-5 flex flex-wrap items-center gap-2">
              <span className="rounded-full bg-white">
                <Badge ton={TON_STATUT[dossier.statut]} point>{STATUTS[dossier.statut]}</Badge>
              </span>
              <span className="text-xs text-white/55">Ouvert le {formatJour(dossier.ouvertLe)}</span>
            </div>
            <div className="mt-6">
              <div className="mb-1.5 flex justify-between text-sm">
                <span className="text-white/65">Avancement</span>
                <span className="font-bold">{pourcentage}%</span>
              </div>
              <div className="rounded-full bg-white/10 p-0.5">
                <Progression valeur={pourcentage} ton={pourcentage === 100 ? "vert" : "edu"} />
              </div>
              <p className="mt-1.5 text-xs text-white/50">{cloturees} étape(s) terminée(s) sur {dossier.etapes.length}</p>
            </div>
          </div>
        </section>

        {courante ? (
          <section className="carte animate-entree border-l-4 border-l-edu">
            <p className="text-xs font-semibold tracking-wide text-ink/50 uppercase">Étape en cours</p>
            <h2 className="mt-1 text-xl font-bold">{courante.titre}</h2>
            {courante.debutLe ? <p className="mt-1 text-sm text-ink/55">Depuis le {formatJour(courante.debutLe)}</p> : null}
            {paiementAttendu ? (
              <p className="mt-4 flex items-start gap-2 rounded-xl bg-edu/15 px-3.5 py-3 text-sm">
                <Wallet size={16} className="mt-0.5 shrink-0 text-ink/60" />
                <span>
                  <span className="font-semibold">Paiement attendu : {paiementAttendu}.</span> Votre dossier avance dès sa réception.
                </span>
              </p>
            ) : null}
            {aFournir.length > 0 ? (
              <p className="mt-3 flex items-start gap-2 rounded-xl bg-cap/[0.07] px-3.5 py-3 text-sm">
                <FileClock size={16} className="mt-0.5 shrink-0 text-cap" />
                <span>
                  <span className="font-semibold">{aFournir.length} document(s) à fournir</span> pour continuer, détail plus bas.
                </span>
              </p>
            ) : null}
          </section>
        ) : null}

        <section className="carte animate-entree">
          <h2 className="mb-5 font-semibold">Les étapes de votre dossier</h2>
          <ol className="grid gap-0">
            {dossier.etapes.map((etape, index) => {
              const fait = etape.statut === "CLOTUREE";
              const actif = etape.statut === "EN_COURS";
              const contrat = numeros.get(etape.id) === "Contrat";
              return (
                <li key={etape.id} className="relative flex gap-4 pb-5 last:pb-0">
                  {index < dossier.etapes.length - 1 ? (
                    <span className={`absolute top-9 bottom-0 left-[17px] w-0.5 ${fait ? "bg-desk" : "bg-ink/10"}`} />
                  ) : null}
                  <span
                    className={`relative grid h-9 w-9 shrink-0 place-items-center rounded-full text-sm font-bold ${
                      fait ? "bg-desk text-white" : actif ? "bg-edu text-ink" : "border-2 border-ink/10 bg-white text-ink/35"
                    }`}
                  >
                    {actif ? <span className="absolute inset-0 animate-ping rounded-full bg-edu opacity-30" /> : null}
                    {fait ? <Check size={17} strokeWidth={3} /> : contrat ? <PenLine size={15} /> : numeros.get(etape.id)}
                  </span>
                  <div className="min-w-0 pt-1.5">
                    <p className={`leading-5 ${actif ? "font-bold" : fait ? "text-ink/75" : "text-ink/45"}`}>
                      {contrat ? "Contrat · " : ""}
                      {etape.titre}
                    </p>
                    <p className="mt-0.5 text-xs text-ink/45">
                      {fait && etape.clotureLe ? `Terminée le ${formatJour(etape.clotureLe)}` : actif ? "En cours" : "À venir"}
                    </p>
                  </div>
                </li>
              );
            })}
          </ol>
        </section>

        {dossier.candidatures.length > 0 ? (
          <section className="carte animate-entree">
            <h2 className="mb-4 flex items-center gap-2 font-semibold"><GraduationCap size={18} className="text-ink/40" /> Vos écoles</h2>
            {retenue ? (
              <div className="mb-4 flex items-start gap-3 rounded-xl bg-mission/[0.08] px-4 py-3.5">
                <Award size={22} className="mt-0.5 shrink-0 text-mission" />
                <div className="min-w-0">
                  <p className="text-xs font-semibold tracking-wide text-ink/50 uppercase">École retenue</p>
                  <p className="font-bold">{retenue.ecole.nom}</p>
                  <p className="text-sm text-ink/60">
                    {[retenue.formation, retenue.ecole.ville].filter(Boolean).join(" · ") || retenue.ecole.pays}
                  </p>
                </div>
              </div>
            ) : null}
            <ul className="grid gap-2">
              {dossier.candidatures
                .filter((candidature) => candidature.id !== retenue?.id)
                .map((candidature) => (
                  <li key={candidature.id} className="flex items-center justify-between gap-3 rounded-xl border border-ink/[0.06] px-3.5 py-2.5 text-sm">
                    <span className="min-w-0">
                      <span className="block truncate font-medium">{candidature.ecole.nom}</span>
                      <span className="block truncate text-xs text-ink/50">{[candidature.formation, candidature.ecole.ville].filter(Boolean).join(" · ")}</span>
                    </span>
                    <Badge ton={CANDIDATURE_CLIENT[candidature.statut].ton}>{CANDIDATURE_CLIENT[candidature.statut].label}</Badge>
                  </li>
                ))}
            </ul>
          </section>
        ) : null}

        {pieces.length > 0 ? (
          <section className="carte animate-entree">
            <h2 className="mb-4 font-semibold">Vos documents</h2>
            <ul className="grid gap-2">
              {[...aFournir, ...recues].map((piece) => (
                <li key={piece.id} className="flex items-center justify-between gap-3 rounded-xl border border-ink/[0.06] px-3.5 py-2.5 text-sm">
                  <span className="flex min-w-0 items-center gap-2.5">
                    {piece.recue ? <FileCheck2 size={17} className="shrink-0 text-vert" /> : <CircleDot size={17} className="shrink-0 text-cap" />}
                    <span className="truncate">{piece.libelle}</span>
                  </span>
                  <Badge ton={piece.recue ? "vert" : "cap"}>{piece.recue ? "Reçu" : "À fournir"}</Badge>
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        <section className="carte animate-entree">
          <h2 className="mb-4 flex items-center gap-2 font-semibold"><Wallet size={18} className="text-ink/40" /> Vos paiements</h2>
          <div className="grid gap-1.5 rounded-xl bg-paper p-4 text-sm">
            {convenu > 0 ? <p className="flex justify-between"><span className="text-ink/60">Montant du service</span><span className="font-semibold tabular-nums">{xof(convenu)}</span></p> : null}
            <p className="flex justify-between"><span className="text-ink/60">Déjà réglé</span><span className="font-semibold tabular-nums text-vert">{xof(paye)}</span></p>
            {convenu > 0 ? (
              <p className="flex justify-between border-t border-ink/[0.06] pt-1.5">
                <span className="text-ink/60">Reste à régler</span>
                <span className={`font-bold tabular-nums ${reste > 0 ? "text-cap" : "text-vert"}`}>{xof(reste)}</span>
              </p>
            ) : null}
          </div>
          {dossier.paiements.length > 0 ? (
            <ul className="mt-3 grid gap-2 text-sm">
              {dossier.paiements.map((paiement) => (
                <li key={paiement.id} className="flex items-center justify-between gap-2 rounded-xl border border-ink/[0.06] px-3.5 py-2.5">
                  <span className="text-ink/65">{labelTypePaiement(paiement.type)} · {formatJour(paiement.dateEncaissement)}</span>
                  <span className="font-semibold tabular-nums">{xof(paiement.montant)}</span>
                </li>
              ))}
            </ul>
          ) : null}
        </section>

        <p className="pb-4 text-center text-xs text-ink/45">
          Vous recevez un SMS à chaque avancée de votre dossier. Une question ? Contactez votre conseiller EduDesk.
        </p>
      </div>
    </main>
  );
}
