import { redirect } from "next/navigation";
import { MessageSquare, Pencil, PlugZap, Send } from "lucide-react";
import { prisma } from "@/lib/db";
import { compterSegments } from "@/lib/format";
import { Formulaire } from "@/components/formulaire";
import { Badge, Champ, EnTete, Info } from "@/components/ui";
import { modifierModele } from "@/server/actions";
import { configSms } from "@/server/parametres";
import { envoyerSmsTest, modifierOperateurSms } from "@/server/parametres-actions";
import { peutParametrer, voitDirection } from "@/server/permissions";
import { requireUser } from "@/server/session";

export const metadata = { title: "SMS · Paramètres" };

const VARIABLES = ["prenom", "client", "reference", "destination", "etape", "delai", "code", "lien", "ecole", "formation", "montant", "mode", "facture"];

export default async function ParametresSmsPage() {
  const user = await requireUser();
  if (!voitDirection(user.role)) redirect("/parametres");
  const gestion = peutParametrer(user.role);
  const [config, modeles] = await Promise.all([configSms(), prisma.modeleSms.findMany({ orderBy: { libelle: "asc" } })]);
  const etat =
    config.source === "parametres"
      ? { label: "Opérateur branché", ton: "vert" as const }
      : config.source === "serveur"
        ? { label: "Opérateur branché (configuration serveur)", ton: "vert" as const }
        : { label: "Aucun opérateur : les SMS sont seulement journalisés", ton: "cap" as const };

  return (
    <section className="grid gap-6">
      <EnTete
        titre="SMS"
        icone={MessageSquare}
        surTitre="Paramètres"
        description="L'opérateur qui envoie les SMS, le nom affiché chez le destinataire et le texte de chaque message automatique."
      />

      <div className="grid gap-6 lg:grid-cols-2">
        <article className="carte grid gap-4 self-start">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="flex items-center gap-2 font-semibold"><PlugZap size={16} className="text-ink/40" /> Opérateur</h2>
            <Badge ton={etat.ton} point>{etat.label}</Badge>
          </div>
          {gestion ? (
            <Formulaire action={modifierOperateurSms} submit="Enregistrer l'opérateur" succes="Opérateur enregistré" reinitialiser={false} className="grid gap-4">
              <Champ label="Adresse d'envoi de l'opérateur (API HTTP)" aide="EduDesk y envoie en POST : to, text, sender. Laisser vide pour débrancher.">
                <input className="champ" name="url" defaultValue={config.source === "parametres" ? (config.url ?? "") : ""} placeholder="https://api.operateur.ci/sms" />
              </Champ>
              <Champ
                label="Clé d'accès (jeton)"
                aide={config.source === "parametres" && config.token ? "Une clé est enregistrée. Laissez vide pour la conserver." : "Envoyée en en-tête Authorization: Bearer."}
              >
                <input className="champ" name="token" type="password" autoComplete="off" placeholder={config.source === "parametres" && config.token ? "••••••••••••" : ""} />
              </Champ>
              {config.source === "parametres" && config.token ? (
                <label className="flex items-center gap-2 text-sm text-ink/70">
                  <input type="checkbox" name="effacerToken" className="h-4 w-4 accent-desk" /> Effacer la clé enregistrée
                </label>
              ) : null}
              <Champ label="Nom d'expéditeur" aide="11 caractères au plus, lettres et chiffres. Il doit être validé par l'opérateur.">
                <input className="champ" name="expediteur" defaultValue={config.expediteur} maxLength={11} />
              </Champ>
              {config.source === "serveur" ? <Info>Un opérateur est aussi défini dans la configuration du serveur ; celui saisi ici le remplace.</Info> : null}
            </Formulaire>
          ) : (
            <Info>Seule la direction générale peut modifier l'opérateur. Expéditeur actuel : {config.expediteur}.</Info>
          )}
        </article>

        <Formulaire action={envoyerSmsTest} submit="Envoyer le SMS de test" succes="SMS de test envoyé" icone={<Send size={15} />} boutonClassName="bouton-second" className="carte grid gap-4 self-start">
          <h2 className="flex items-center gap-2 font-semibold"><Send size={16} className="text-ink/40" /> Tester l'envoi</h2>
          <Champ label="Numéro de téléphone" aide="Le message de test apparaît aussi dans le journal SMS.">
            <input className="champ" name="telephone" defaultValue={user.telephone} required />
          </Champ>
        </Formulaire>
      </div>

      <div className="grid gap-3">
        <div>
          <h2 className="font-semibold">Modèles de messages</h2>
          <p className="mt-0.5 text-sm text-ink/55">
            Les mots entre accolades sont remplacés à l'envoi :{" "}
            {VARIABLES.map((variable, index) => (
              <span key={variable}>
                {index ? ", " : ""}
                <code className="rounded bg-ink/[0.05] px-1 text-xs">{`{{${variable}}}`}</code>
              </span>
            ))}
            . Certains caractères (ê, ô, î, ç, guillemets typographiques…) font passer un SMS de 160 à 70 caractères ; le compteur sous chaque modèle en tient compte.
          </p>
        </div>
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
      </div>
    </section>
  );
}
