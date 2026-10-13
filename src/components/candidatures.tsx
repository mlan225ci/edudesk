import Link from "next/link";
import type { Candidature, Ecole, StatutCandidature } from "@prisma/client";
import { Award, GraduationCap, Plus, X } from "lucide-react";
import { formatJour, xof } from "@/lib/format";
import { STATUTS_CANDIDATURE, TON_CANDIDATURE } from "@/lib/labels";
import { paysDeDestination } from "@/lib/pays";
import { BoutonEnvoi, FormAction, Formulaire } from "@/components/formulaire";
import { Tiroir } from "@/components/tiroir";
import { Badge, Champ } from "@/components/ui";
import { changerStatutCandidature, proposerEcole, retirerCandidature } from "@/server/ecoles";

type CandidatureVue = Candidature & { ecole: Ecole };

const SUITES: Record<StatutCandidature, { statut: StatutCandidature; label: string; principal?: boolean }[]> = {
  PROPOSEE: [{ statut: "SOUMISE", label: "Candidature envoyée", principal: true }, { statut: "ABANDONNEE", label: "Abandonner" }],
  SOUMISE: [{ statut: "ADMIS", label: "Admis", principal: true }, { statut: "REFUSE", label: "Refusé" }],
  ADMIS: [{ statut: "CHOISIE", label: "Retenir cette école", principal: true }, { statut: "ABANDONNEE", label: "Décliner" }],
  CHOISIE: [{ statut: "ADMIS", label: "Annuler le choix" }],
  REFUSE: [],
  ABANDONNEE: [{ statut: "PROPOSEE", label: "Reprendre" }],
};

function BoutonStatut({ candidatureId, statut, label, principal }: { candidatureId: string; statut: StatutCandidature; label: string; principal?: boolean }) {
  return (
    <FormAction action={changerStatutCandidature} succes={statut === "ADMIS" ? "Admission enregistrée, le client est prévenu par SMS" : "Candidature mise à jour"}>
      <input type="hidden" name="candidatureId" value={candidatureId} />
      <input type="hidden" name="statut" value={statut} />
      <BoutonEnvoi className={principal ? "bouton px-3 py-1.5 text-xs" : "bouton-second px-3 py-1.5 text-xs"}>{label}</BoutonEnvoi>
    </FormAction>
  );
}

export function PanneauCandidatures({
  dossierId,
  destination,
  candidatures,
  ecoles,
  peutAgir,
}: {
  dossierId: string;
  destination: string;
  candidatures: CandidatureVue[];
  ecoles: Ecole[];
  peutAgir: boolean;
}) {
  const retenue = candidatures.find((candidature) => candidature.statut === "CHOISIE");
  const pays = paysDeDestination(destination);
  const locales = ecoles.filter((ecole) => ecole.pays === pays);
  const autres = ecoles.filter((ecole) => ecole.pays !== pays);
  const formations = [...new Set(locales.flatMap((ecole) => (ecole.formations ?? "").split("\n").map((item) => item.trim()).filter(Boolean)))].sort();

  return (
    <article className="carte" id="ecoles">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 font-semibold"><GraduationCap size={18} className="text-ink/40" /> Écoles et candidatures</h2>
        {peutAgir ? (
          <Tiroir label="Proposer une école" icone={<Plus size={15} />} variante="second" titre="Proposer une école" description={pays ? `Écoles du catalogue · ${pays}` : "Écoles du catalogue"}>
            {ecoles.length === 0 ? (
              <div className="grid gap-3 text-sm text-ink/65">
                <p>Le catalogue ne contient encore aucune école.</p>
                <Link href="/ecoles?nouveau=1" className="bouton w-fit">Ajouter une école au catalogue</Link>
              </div>
            ) : (
              <Formulaire action={proposerEcole} submit="Proposer" succes="École proposée" className="grid gap-4">
                <input type="hidden" name="dossierId" value={dossierId} />
                <Champ label="École" aide={locales.length === 0 ? `Aucune école ${pays ? `en « ${pays} » ` : ""}au catalogue : les autres pays sont listés.` : undefined}>
                  <select className="champ" name="ecoleId" required defaultValue="">
                    <option value="" disabled>Choisir une école…</option>
                    {locales.length > 0 ? (
                      <optgroup label={pays ?? destination}>
                        {locales.map((ecole) => (
                          <option key={ecole.id} value={ecole.id}>
                            {ecole.nom}{ecole.ville ? ` · ${ecole.ville}` : ""}{ecole.partenaire ? " · partenaire" : ""}
                          </option>
                        ))}
                      </optgroup>
                    ) : null}
                    {autres.length > 0 ? (
                      <optgroup label="Autres pays">
                        {autres.map((ecole) => (
                          <option key={ecole.id} value={ecole.id}>{ecole.nom} · {ecole.pays}</option>
                        ))}
                      </optgroup>
                    ) : null}
                  </select>
                </Champ>
                <Champ label="Formation visée">
                  <input className="champ" name="formation" list={`formations-${dossierId}`} placeholder="Ex. Licence en informatique" />
                </Champ>
                <datalist id={`formations-${dossierId}`}>
                  {formations.map((formation) => <option key={formation} value={formation} />)}
                </datalist>
                <Champ label="Observation">
                  <input className="champ" name="observation" placeholder="Facultatif" />
                </Champ>
              </Formulaire>
            )}
          </Tiroir>
        ) : null}
      </div>

      {retenue ? (
        <div className="mb-4 flex items-start gap-3 rounded-xl bg-mission/[0.08] px-4 py-3">
          <Award size={20} className="mt-0.5 shrink-0 text-mission" />
          <div className="min-w-0 text-sm">
            <p className="font-semibold">École retenue : {retenue.ecole.nom}</p>
            <p className="text-ink/60">
              {retenue.formation ?? "Formation non précisée"}
              {retenue.ecole.fraisXof ? ` · scolarité ${xof(retenue.ecole.fraisXof)} / an` : ""}
            </p>
          </div>
        </div>
      ) : null}

      {candidatures.length === 0 ? (
        <p className="rounded-xl border border-dashed border-ink/15 px-4 py-6 text-center text-sm text-ink/50">
          Aucune école proposée pour l'instant.{peutAgir ? " Proposez les écoles adaptées au profil, puis suivez chaque réponse ici." : ""}
        </p>
      ) : (
        <ul className="grid gap-2.5">
          {candidatures.map((candidature) => (
            <li key={candidature.id} className="grid gap-3 rounded-xl border border-ink/[0.06] px-4 py-3">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <Link href={`/ecoles/${candidature.ecole.id}`} className="font-semibold hover:text-desk">{candidature.ecole.nom}</Link>
                  <p className="text-xs text-ink/55">
                    {candidature.formation ?? "Formation non précisée"}
                    {candidature.ecole.ville ? ` · ${candidature.ecole.ville}` : ""}
                    {candidature.soumiseLe ? ` · envoyée le ${formatJour(candidature.soumiseLe)}` : ""}
                    {candidature.reponseLe ? ` · réponse le ${formatJour(candidature.reponseLe)}` : ""}
                  </p>
                  {candidature.observation ? <p className="mt-1 text-xs text-ink/60 italic">{candidature.observation}</p> : null}
                </div>
                <Badge ton={TON_CANDIDATURE[candidature.statut]} point>{STATUTS_CANDIDATURE[candidature.statut]}</Badge>
              </div>
              {peutAgir ? (
                <div className="flex flex-wrap items-center gap-2">
                  {SUITES[candidature.statut].map((suite) => (
                    <BoutonStatut key={suite.statut} candidatureId={candidature.id} {...suite} />
                  ))}
                  {candidature.statut !== "CHOISIE" ? (
                    <FormAction action={retirerCandidature} succes="Candidature retirée" confirmer="Retirer cette école du dossier ?" className="ml-auto">
                      <input type="hidden" name="candidatureId" value={candidature.id} />
                      <BoutonEnvoi className="bouton-fantome px-2 py-1 text-xs text-ink/45" titre="Retirer du dossier"><X size={14} /></BoutonEnvoi>
                    </FormAction>
                  ) : null}
                </div>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </article>
  );
}
