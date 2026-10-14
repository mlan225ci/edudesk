import { redirect } from "next/navigation";
import { Mail, Pencil, PlugZap, Send } from "lucide-react";
import { prisma } from "@/lib/db";
import { Formulaire } from "@/components/formulaire";
import { Badge, Champ, EnTete, Info } from "@/components/ui";
import { configMail } from "@/server/parametres";
import { envoyerMailTest, modifierModeleMail, modifierServeurMail } from "@/server/parametres-actions";
import { peutParametrer, voitDirection } from "@/server/permissions";
import { requireUser } from "@/server/session";

export const metadata = { title: "E-mail · Paramètres" };

const VARIABLES = ["prenom", "client", "reference", "destination", "etape", "code", "lien", "suivi", "ecole", "formation", "montant", "mode", "facture", "devis", "liste", "entreprise"];

export default async function ParametresEmailPage() {
  const user = await requireUser();
  if (!voitDirection(user.role)) redirect("/parametres");
  const gestion = peutParametrer(user.role);
  const [config, modeles] = await Promise.all([
    configMail(),
    prisma.modeleSms.findMany({ where: { OR: [{ code: { startsWith: "client_" } }, { code: { in: ["partenaire", "paiement"] } }] }, orderBy: { libelle: "asc" } }),
  ]);
  const etat =
    config.source === "parametres"
      ? { label: "Serveur branché", ton: "vert" as const }
      : config.source === "serveur"
        ? { label: "Serveur branché (configuration serveur)", ton: "vert" as const }
        : { label: "Aucun serveur : les e-mails sont seulement journalisés", ton: "cap" as const };

  return (
    <section className="grid gap-6">
      <EnTete
        titre="E-mail"
        icone={Mail}
        surTitre="Paramètres"
        description="Le serveur qui envoie les e-mails aux clients et partenaires (avancement, factures, devis, pièces à fournir) et le texte de chaque message."
      />

      <div className="grid gap-6 lg:grid-cols-2">
        <article className="carte grid gap-4 self-start">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="flex items-center gap-2 font-semibold"><PlugZap size={16} className="text-ink/40" /> Serveur d&apos;envoi (SMTP)</h2>
            <Badge ton={etat.ton} point>{etat.label}</Badge>
          </div>
          {gestion ? (
            <Formulaire action={modifierServeurMail} submit="Enregistrer le serveur" succes="Serveur enregistré" reinitialiser={false} className="grid gap-4">
              <div className="grid gap-4 sm:grid-cols-[1fr_7rem]">
                <Champ label="Serveur SMTP" aide="Laisser vide pour débrancher. Ex. smtp.gmail.com, ssl0.ovh.net…">
                  <input className="champ" name="hote" defaultValue={config.source === "parametres" ? (config.hote ?? "") : ""} placeholder="smtp.exemple.com" />
                </Champ>
                <Champ label="Port">
                  <input className="champ" name="port" inputMode="numeric" defaultValue={config.source === "parametres" ? config.port : 587} />
                </Champ>
              </div>
              <label className="flex items-center gap-2 text-sm text-ink/70">
                <input type="checkbox" name="securise" defaultChecked={config.source === "parametres" && config.securise} className="h-4 w-4 accent-desk" />
                Connexion chiffrée dès l&apos;ouverture (SSL, port 465)
              </label>
              <Champ label="Identifiant">
                <input className="champ" name="utilisateur" autoComplete="off" defaultValue={config.source === "parametres" ? (config.utilisateur ?? "") : ""} placeholder="contact@edudesk.ci" />
              </Champ>
              <Champ label="Mot de passe" aide={config.source === "parametres" && config.motDePasse ? "Un mot de passe est enregistré. Laissez vide pour le conserver." : "Pour Gmail, utilisez un mot de passe d'application."}>
                <input className="champ" name="motDePasse" type="password" autoComplete="new-password" placeholder={config.source === "parametres" && config.motDePasse ? "••••••••••••" : ""} />
              </Champ>
              {config.source === "parametres" && config.motDePasse ? (
                <label className="flex items-center gap-2 text-sm text-ink/70">
                  <input type="checkbox" name="effacerMotDePasse" className="h-4 w-4 accent-desk" /> Effacer le mot de passe enregistré
                </label>
              ) : null}
              <div className="grid gap-4 sm:grid-cols-2">
                <Champ label="Adresse d'expédition" aide="Par défaut, l'identifiant.">
                  <input className="champ" name="expediteur" type="email" defaultValue={config.source === "parametres" ? (config.expediteur ?? "") : ""} />
                </Champ>
                <Champ label="Nom affiché">
                  <input className="champ" name="nomExpediteur" defaultValue={config.nomExpediteur} />
                </Champ>
              </div>
              {config.source === "serveur" ? <Info>Un serveur est aussi défini dans la configuration du serveur ; celui saisi ici le remplace.</Info> : null}
            </Formulaire>
          ) : (
            <Info>Seule la direction générale peut modifier le serveur d&apos;envoi.</Info>
          )}
        </article>

        <Formulaire action={envoyerMailTest} submit="Envoyer l'e-mail de test" succes="E-mail de test envoyé" icone={<Send size={15} />} boutonClassName="bouton-second" className="carte grid gap-4 self-start">
          <h2 className="flex items-center gap-2 font-semibold"><Send size={16} className="text-ink/40" /> Tester l&apos;envoi</h2>
          <Champ label="Adresse e-mail" aide="Le message de test apparaît aussi dans le journal des e-mails.">
            <input className="champ" name="email" type="email" defaultValue={user.email} required />
          </Champ>
        </Formulaire>
      </div>

      <div className="grid gap-3">
        <div>
          <h2 className="font-semibold">Modèles d&apos;e-mails</h2>
          <p className="mt-0.5 text-sm text-ink/55">
            Chaque SMS adressé au client ou au partenaire part aussi par e-mail lorsqu&apos;une adresse est connue. Mots remplacés à l&apos;envoi :{" "}
            {VARIABLES.map((variable, index) => (
              <span key={variable}>
                {index ? ", " : ""}
                <code className="rounded bg-ink/[0.05] px-1 text-xs">{`{{${variable}}}`}</code>
              </span>
            ))}
            . <code className="rounded bg-ink/[0.05] px-1 text-xs">{"{{suivi}}"}</code> ajoute le lien et le code de suivi quand le dossier en a un. Sans texte d&apos;e-mail, le texte du SMS est repris.
          </p>
        </div>
        <div className="grid gap-3 md:grid-cols-2">
          {modeles.map((modele) => (
            <Formulaire key={modele.code} action={modifierModeleMail} submit="Enregistrer" succes="Modèle enregistré" reinitialiser={false} boutonClassName="bouton-second" className="carte grid gap-3">
              <input type="hidden" name="code" value={modele.code} />
              <p className="flex items-center gap-2 text-sm font-semibold"><Pencil size={14} className="text-ink/35" /> {modele.libelle}</p>
              <input className="champ" name="sujet" defaultValue={modele.sujet ?? ""} placeholder="Votre dossier {{reference}}" aria-label="Objet" />
              <textarea className="champ" name="corpsMail" rows={7} defaultValue={modele.corpsMail ?? ""} placeholder={modele.corps} aria-label="Texte de l'e-mail" />
            </Formulaire>
          ))}
        </div>
      </div>
    </section>
  );
}
