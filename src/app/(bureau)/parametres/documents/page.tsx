import Link from "next/link";
import { redirect } from "next/navigation";
import { ExternalLink, FileSpreadsheet, ImageOff, ImageUp, RotateCcw } from "lucide-react";
import { BoutonEnvoi, FormAction, Formulaire } from "@/components/formulaire";
import { Champ, EnTete, Info, Onglets } from "@/components/ui";
import { TAILLES_LOGO, lireDocuments, lireEntreprise } from "@/server/parametres";
import { choisirLogoDocuments, importerLogoDocuments, modifierDocuments } from "@/server/parametres-actions";
import { peutParametrer } from "@/server/permissions";
import { requireUser } from "@/server/session";

export const metadata = { title: "Devis et factures · Paramètres" };

function empreinte(valeur: string) {
  let h = 0;
  for (let i = 0; i < valeur.length; i++) h = (h * 31 + valeur.charCodeAt(i)) | 0;
  return (h >>> 0).toString(36);
}

function Case({ name, label, aide, coche }: { name: string; label: string; aide?: string; coche: boolean }) {
  return (
    <label className="flex items-start gap-2.5 text-sm">
      <input type="checkbox" name={name} defaultChecked={coche} className="mt-0.5 h-4 w-4 accent-desk" />
      <span>
        <span className="font-medium">{label}</span>
        {aide ? <span className="block text-xs text-ink/50">{aide}</span> : null}
      </span>
    </label>
  );
}

export default async function DocumentsPage({ searchParams }: { searchParams: Promise<{ apercu?: string }> }) {
  const user = await requireUser();
  if (!peutParametrer(user.role)) redirect("/parametres");
  const apercu = (await searchParams).apercu === "facture" ? "facture" : "devis";
  const [reglages, entreprise] = await Promise.all([lireDocuments(), lireEntreprise()]);
  const version = empreinte(JSON.stringify([reglages, entreprise]));
  const legales = [entreprise.nom, entreprise.adresse, entreprise.rccm && `RCCM ${entreprise.rccm}`, entreprise.ncc && `NCC ${entreprise.ncc}`].filter(Boolean).join(" · ");
  const logo = reglages.logo === "aucun" ? "aucun" : reglages.logo ? "importe" : "defaut";

  return (
    <section className="grid gap-6">
      <EnTete
        titre="Devis et factures"
        icone={FileSpreadsheet}
        surTitre="Paramètres"
        description="Logo, couleurs, textes par défaut et pied de page des devis et factures PDF. L'aperçu se met à jour à chaque enregistrement."
      />

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(0,520px)]">
        <div className="grid gap-6 self-start">
          <article className="carte grid gap-4">
            <h2 className="font-semibold">Logo</h2>
            <div className="flex flex-wrap items-center gap-4">
              <div className="grid h-24 w-56 place-items-center rounded-xl border border-ink/[0.08] bg-white p-3">
                {logo === "aucun" ? (
                  <span className="text-center">
                    <span className="block text-lg font-bold">{entreprise.nom}</span>
                    <span className="block text-[11px] text-ink/45">Nom affiché à la place du logo</span>
                  </span>
                ) : (
                  <img src={`/api/parametres/logo-documents?v=${version}`} alt="Logo des documents" className="max-h-full max-w-full object-contain" />
                )}
              </div>
              <div className="grid gap-1 text-sm">
                <p className="font-medium">{logo === "importe" ? "Logo importé" : logo === "aucun" ? "Pas de logo" : "Logo EduDesk"}</p>
                <div className="flex flex-wrap gap-2">
                  {logo !== "defaut" ? (
                    <FormAction action={choisirLogoDocuments} succes="Logo EduDesk rétabli">
                      <input type="hidden" name="choix" value="defaut" />
                      <BoutonEnvoi className="bouton-fantome text-xs"><RotateCcw size={14} /> Logo EduDesk</BoutonEnvoi>
                    </FormAction>
                  ) : null}
                  {logo !== "aucun" ? (
                    <FormAction action={choisirLogoDocuments} succes="Logo retiré" confirmer="Retirer le logo des devis et factures ? Le nom de l'entreprise sera affiché à la place.">
                      <input type="hidden" name="choix" value="aucun" />
                      <BoutonEnvoi className="bouton-fantome text-xs"><ImageOff size={14} /> Sans logo</BoutonEnvoi>
                    </FormAction>
                  ) : null}
                </div>
              </div>
            </div>
            <Formulaire action={importerLogoDocuments} submit="Importer ce logo" succes="Logo importé" boutonClassName="bouton-second w-fit" icone={<ImageUp size={16} />} className="grid gap-3">
              <Champ label="Nouveau logo" aide="PNG, JPEG, WebP ou SVG, 8 Mo maximum. Fond transparent ou blanc conseillé ; les marges vides sont rognées et l'image est allégée automatiquement.">
                <input className="champ" type="file" name="logo" accept="image/png,image/jpeg,image/webp,image/svg+xml" required />
              </Champ>
            </Formulaire>
          </article>

          <Formulaire action={modifierDocuments} submit="Enregistrer la présentation" succes="Présentation enregistrée" reinitialiser={false} className="carte grid gap-6">
            <fieldset className="grid gap-4">
              <legend className="mb-1 font-semibold">Apparence</legend>
              <div className="grid items-start gap-4 sm:grid-cols-3">
                <Champ label="Taille du logo">
                  <select className="champ" name="tailleLogo" defaultValue={reglages.tailleLogo}>
                    {Object.entries(TAILLES_LOGO).map(([valeur, label]) => (
                      <option key={valeur} value={valeur}>{label}</option>
                    ))}
                  </select>
                </Champ>
                <Champ label="Couleur principale" aide="Bandeau, tableau, encadré du total.">
                  <input className="champ h-11 cursor-pointer p-1" type="color" name="couleurPrincipale" defaultValue={reglages.couleurPrincipale} />
                </Champ>
                <Champ label="Couleur d'accent" aide="Soulignés et libellé du total.">
                  <input className="champ h-11 cursor-pointer p-1" type="color" name="couleurAccent" defaultValue={reglages.couleurAccent} />
                </Champ>
              </div>
              <Case name="afficherCoordonnees" coche={reglages.afficherCoordonnees} label="Coordonnées sous le logo" aide="Adresse, téléphone, e-mail et site web renseignés dans la fiche Entreprise." />
            </fieldset>

            <fieldset className="grid gap-4 border-t border-ink/[0.06] pt-5">
              <legend className="mb-1 font-semibold">Devis</legend>
              <div className="grid gap-4 sm:grid-cols-[160px_minmax(0,1fr)]">
                <Champ label="Validité (jours)">
                  <input className="champ" name="validiteDevis" inputMode="numeric" defaultValue={reglages.validiteDevis} required />
                </Champ>
                <Champ label="Conditions proposées par défaut" aide="Pré-remplies à chaque nouveau devis, modifiables au cas par cas.">
                  <textarea className="champ" name="conditionsDevis" rows={2} defaultValue={reglages.conditionsDevis} />
                </Champ>
              </div>
              <Case name="afficherSignatures" coche={reglages.afficherSignatures} label="Cadres de signature" aide="« Pour l'entreprise » et « Bon pour accord — le client » en bas du devis." />
              <Champ label="Signataire" aide="Facultatif. Ex. « La Direction » ou « Jean Kouassi, Directeur ». Sans signataire, le cadre indique « Signature et cachet ».">
                <input className="champ" name="signataire" defaultValue={reglages.signataire} placeholder="La Direction" />
              </Champ>
            </fieldset>

            <fieldset className="grid gap-4 border-t border-ink/[0.06] pt-5">
              <legend className="mb-1 font-semibold">Factures</legend>
              <div className="grid gap-4 sm:grid-cols-[160px_minmax(0,1fr)]">
                <Champ label="Délai de paiement (jours)" aide="0 : payable à réception.">
                  <input className="champ" name="echeanceFacture" inputMode="numeric" defaultValue={reglages.echeanceFacture} required />
                </Champ>
                <Champ label="Conditions proposées par défaut" aide="Pénalités de retard, escompte…">
                  <textarea className="champ" name="conditionsFacture" rows={2} defaultValue={reglages.conditionsFacture} />
                </Champ>
              </div>
              <Champ label="Modalités de paiement" aide="Imprimées sur les devis et les factures non soldées : moyens acceptés, numéros Mobile Money, RIB…">
                <textarea className="champ" name="modalitesPaiement" rows={3} defaultValue={reglages.modalitesPaiement} />
              </Champ>
            </fieldset>

            <fieldset className="grid gap-4 border-t border-ink/[0.06] pt-5">
              <legend className="mb-1 font-semibold">Pied de page</legend>
              <Champ label="Mention des devis" aide="Précédée automatiquement de « Devis valable jusqu'au … ».">
                <input className="champ" name="piedDevis" defaultValue={reglages.piedDevis} />
              </Champ>
              <Champ label="Mention des factures">
                <input className="champ" name="piedFacture" defaultValue={reglages.piedFacture} placeholder="Merci de votre confiance." />
              </Champ>
              <Champ label="Ligne commune" aide="Facultatif. Sur tous les documents : coordonnées bancaires, capital social, numéro d'agrément…">
                <input className="champ" name="piedCommun" defaultValue={reglages.piedCommun} placeholder="Banque … · IBAN … · Capital de … F CFA" />
              </Champ>
              <Case
                name="afficherMentionsLegales"
                coche={reglages.afficherMentionsLegales}
                label="Mentions légales"
                aide={legales || "Raison sociale, adresse, RCCM et NCC"}
              />
              <Info>
                La raison sociale, l&apos;adresse, le RCCM et le NCC se modifient dans la fiche{" "}
                <Link href="/parametres/entreprise" className="font-semibold text-desk hover:underline">Entreprise</Link>.
              </Info>
            </fieldset>
          </Formulaire>
        </div>

        <article className="carte self-start overflow-hidden p-0 xl:sticky xl:top-20">
          <div className="flex items-center justify-between gap-3 px-4 pt-4">
            <Onglets
              actif={`/parametres/documents?apercu=${apercu}`}
              onglets={[
                { href: "/parametres/documents?apercu=devis", label: "Aperçu devis" },
                { href: "/parametres/documents?apercu=facture", label: "Aperçu facture" },
              ]}
            />
            <a href={`/api/pdf/apercu/${apercu}?v=${version}`} target="_blank" rel="noreferrer" className="bouton-fantome text-xs">
              <ExternalLink size={14} /> Ouvrir
            </a>
          </div>
          <p className="px-4 pt-2 text-xs text-ink/45">Exemple fictif, avec vos réglages actuels.</p>
          <iframe key={`${apercu}-${version}`} src={`/api/pdf/apercu/${apercu}?v=${version}#view=FitH`} title="Aperçu du document" className="mt-3 h-[78vh] min-h-[560px] w-full bg-paper" />
        </article>
      </div>
    </section>
  );
}
