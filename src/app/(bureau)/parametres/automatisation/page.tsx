import { redirect } from "next/navigation";
import { AlarmClock, BellRing, Play } from "lucide-react";
import { prisma } from "@/lib/db";
import { formatDate } from "@/lib/format";
import { BoutonEnvoi, FormAction, Formulaire } from "@/components/formulaire";
import { Badge, Champ, EnTete, Info } from "@/components/ui";
import { configAutomatisation } from "@/server/automatisation";
import { lancerAutomatisation, modifierAutomatisation } from "@/server/parametres-actions";
import { peutParametrer, voitDirection } from "@/server/permissions";
import { requireUser } from "@/server/session";

export const metadata = { title: "Automatisation · Paramètres" };

const FREQUENCES = [
  { value: 5, label: "Toutes les 5 minutes" },
  { value: 15, label: "Toutes les 15 minutes" },
  { value: 30, label: "Toutes les 30 minutes" },
  { value: 60, label: "Toutes les heures" },
  { value: 120, label: "Toutes les 2 heures" },
];

export default async function ParametresAutomatisationPage() {
  const user = await requireUser();
  if (!voitDirection(user.role)) redirect("/parametres");
  const gestion = peutParametrer(user.role);
  const maintenant = new Date();
  const dans24h = new Date(maintenant.getTime() + 24 * 36e5);
  const [config, enRetard, demain] = await Promise.all([
    configAutomatisation(),
    prisma.dossierEtape.count({ where: { statut: "EN_COURS", limiteLe: { lt: maintenant } } }),
    prisma.dossierEtape.count({ where: { statut: "EN_COURS", limiteLe: { gte: maintenant, lte: dans24h } } }),
  ]);
  const prochaine = config.actif && config.derniere ? new Date(config.derniere.getTime() + config.minutes * 60_000) : null;

  return (
    <section className="grid gap-6">
      <EnTete
        titre="Automatisation"
        icone={AlarmClock}
        surTitre="Paramètres"
        description="EduDesk vérifie seul les échéances : la veille (J-1) et dès qu'une étape passe en retard, le responsable et la direction sont prévenus par SMS et dans l'application."
        actions={
          <FormAction action={lancerAutomatisation} succes="Vérification effectuée">
            <BoutonEnvoi className="bouton-second"><Play size={15} /> Lancer maintenant</BoutonEnvoi>
          </FormAction>
        }
      />

      <div className="grid gap-6 lg:grid-cols-2">
        <article className="carte grid gap-4 self-start">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="flex items-center gap-2 font-semibold"><BellRing size={16} className="text-ink/40" /> Alertes J-1 et retards</h2>
            <Badge ton={config.actif ? "vert" : "cap"} point>{config.actif ? "Actives" : "Suspendues"}</Badge>
          </div>
          <dl className="grid gap-2 rounded-xl bg-paper p-4 text-sm">
            <div className="flex justify-between gap-3"><dt className="text-ink/60">Dernier passage</dt><dd className="font-semibold">{config.derniere ? formatDate(config.derniere) : "Jamais"}</dd></div>
            <div className="flex justify-between gap-3"><dt className="text-ink/60">Résultat</dt><dd className="text-right font-semibold">{config.resultat ?? "—"}{config.source ? <span className="font-normal text-ink/45"> ({config.source})</span> : null}</dd></div>
            <div className="flex justify-between gap-3"><dt className="text-ink/60">Prochain passage</dt><dd className="font-semibold">{prochaine ? (prochaine < maintenant ? "Dans la minute" : formatDate(prochaine)) : config.actif ? "Dans la minute" : "—"}</dd></div>
          </dl>
          {gestion ? (
            <Formulaire action={modifierAutomatisation} submit="Enregistrer" succes="Automatisation enregistrée" reinitialiser={false} className="grid gap-4">
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" name="actif" defaultChecked={config.actif} className="h-4 w-4 accent-desk" /> Vérifier automatiquement les échéances
              </label>
              <Champ label="Fréquence">
                <select className="champ" name="minutes" defaultValue={config.minutes}>
                  {FREQUENCES.map((frequence) => (
                    <option key={frequence.value} value={frequence.value}>{frequence.label}</option>
                  ))}
                </select>
              </Champ>
            </Formulaire>
          ) : (
            <Info>Seule la direction générale peut modifier la fréquence.</Info>
          )}
        </article>

        <article className="carte grid gap-4 self-start">
          <h2 className="font-semibold">En ce moment</h2>
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-xl bg-cap/[0.06] p-4">
              <p className="text-2xl font-bold text-cap">{enRetard}</p>
              <p className="text-sm text-ink/60">étape(s) en retard</p>
            </div>
            <div className="rounded-xl bg-edu/15 p-4">
              <p className="text-2xl font-bold">{demain}</p>
              <p className="text-sm text-ink/60">échéance(s) dans les 24 h</p>
            </div>
          </div>
          <Info>
            Chaque étape n&apos;est signalée qu&apos;une fois pour la veille et une fois pour le retard. À chaque passage, les SMS et e-mails restés en attente sont aussi renvoyés.
          </Info>
        </article>
      </div>
    </section>
  );
}
