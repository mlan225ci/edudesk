import { redirect } from "next/navigation";
import { Building2, Globe } from "lucide-react";
import { Formulaire } from "@/components/formulaire";
import { Champ, EnTete, Info } from "@/components/ui";
import { lireEntreprise, urlPublique } from "@/server/parametres";
import { modifierApplication, modifierEntreprise } from "@/server/parametres-actions";
import { peutParametrer } from "@/server/permissions";
import { requireUser } from "@/server/session";

export const metadata = { title: "Entreprise · Paramètres" };

export default async function EntreprisePage() {
  const user = await requireUser();
  if (!peutParametrer(user.role)) redirect("/parametres");
  const [entreprise, url] = await Promise.all([lireEntreprise(), urlPublique()]);
  const mentions = [entreprise.rccm && `RCCM ${entreprise.rccm}`, entreprise.ncc && `NCC ${entreprise.ncc}`].filter(Boolean).join(" · ");
  const contact = [entreprise.adresse, entreprise.telephone, entreprise.email, entreprise.siteWeb].filter(Boolean).join(" · ");

  return (
    <section className="grid gap-6">
      <EnTete
        titre="Entreprise"
        icone={Building2}
        surTitre="Paramètres"
        description="L'identité reprise sur les factures et le portail client, et l'adresse publique utilisée dans les SMS."
      />

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_380px]">
        <Formulaire action={modifierEntreprise} submit="Enregistrer l'identité" succes="Identité enregistrée" reinitialiser={false} className="carte grid gap-4 self-start">
          <h2 className="font-semibold">Identité</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            <Champ label="Raison sociale"><input className="champ" name="nom" defaultValue={entreprise.nom} required /></Champ>
            <Champ label="Accroche" aide="Sous le logo des factures."><input className="champ" name="slogan" defaultValue={entreprise.slogan} /></Champ>
          </div>
          <Champ label="Adresse"><input className="champ" name="adresse" defaultValue={entreprise.adresse} placeholder="Ex. Cocody Riviera 2, Abidjan" /></Champ>
          <div className="grid gap-4 sm:grid-cols-3">
            <Champ label="Téléphone"><input className="champ" name="telephone" defaultValue={entreprise.telephone} placeholder="+225…" /></Champ>
            <Champ label="E-mail"><input className="champ" name="email" type="email" defaultValue={entreprise.email} /></Champ>
            <Champ label="Site web"><input className="champ" name="siteWeb" defaultValue={entreprise.siteWeb} placeholder="www.…" /></Champ>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <Champ label="RCCM"><input className="champ" name="rccm" defaultValue={entreprise.rccm} placeholder="CI-ABJ-…" /></Champ>
            <Champ label="Compte contribuable (NCC)"><input className="champ" name="ncc" defaultValue={entreprise.ncc} /></Champ>
          </div>
          <Champ label="Mention en bas de facture" aide="Conditions, coordonnées bancaires, remerciements…">
            <textarea className="champ" name="mentionFacture" rows={2} defaultValue={entreprise.mentionFacture} />
          </Champ>
        </Formulaire>

        <div className="grid gap-6 self-start">
          <article className="carte overflow-hidden p-0">
            <p className="px-5 pt-4 text-xs font-semibold tracking-wide text-ink/45 uppercase">Aperçu sur les factures</p>
            <div className="m-4 rounded-xl bg-ink px-5 py-4 text-white">
              <img src="/logo-edudesk.png" alt={entreprise.nom} className="h-8" />
              <p className="mt-2 text-xs text-white/65">{entreprise.slogan || entreprise.nom}</p>
            </div>
            <div className="px-5 pb-4 text-xs leading-5 text-ink/55">
              <p>{contact || "Coordonnées non renseignées"}</p>
              {mentions ? <p>{mentions}</p> : null}
              {entreprise.mentionFacture ? <p className="mt-1 italic">{entreprise.mentionFacture}</p> : null}
            </div>
          </article>

          <Formulaire action={modifierApplication} submit="Enregistrer l'adresse" succes="Adresse enregistrée" reinitialiser={false} boutonClassName="bouton-second" className="carte grid gap-4">
            <h2 className="flex items-center gap-2 font-semibold"><Globe size={16} className="text-ink/40" /> Adresse publique</h2>
            <Champ label="Adresse de l'application sur internet" aide="Utilisée dans les SMS envoyés aux clients pour le lien de suivi (…/suivi).">
              <input className="champ" name="urlPublique" defaultValue={url ?? ""} placeholder="https://suivi.edudesk.ci" />
            </Champ>
            {!url ? <Info>Tant qu'elle n'est pas définie, les SMS utilisent l'adresse depuis laquelle l'action a été faite, souvent inaccessible aux clients.</Info> : null}
          </Formulaire>
        </div>
      </div>
    </section>
  );
}
