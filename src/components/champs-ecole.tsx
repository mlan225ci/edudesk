import type { Ecole } from "@prisma/client";
import { TYPES_ECOLE } from "@/lib/labels";
import { PAYS } from "@/lib/pays";
import { Champ } from "@/components/ui";

export function ChampsEcole({ ecole, frequents, id }: { ecole?: Ecole; frequents: string[]; id: string }) {
  return (
    <>
      <Champ label="Nom de l'école">
        <input className="champ" name="nom" defaultValue={ecole?.nom} placeholder="Ex. Université de Montréal" required autoFocus={!ecole} />
      </Champ>
      <div className="grid gap-4 sm:grid-cols-2">
        <Champ label="Pays" aide="L'école est proposée sur les dossiers d'études de ce pays.">
          <select className="champ" name="pays" defaultValue={ecole?.pays ?? ""} required>
            <option value="" disabled>Choisir un pays…</option>
            {frequents.length > 0 ? (
              <optgroup label="Destinations EduDesk">
                {frequents.map((pays) => <option key={pays} value={pays}>{pays}</option>)}
              </optgroup>
            ) : null}
            <optgroup label="Tous les pays">
              {PAYS.map((pays) => <option key={pays} value={pays}>{pays}</option>)}
            </optgroup>
          </select>
        </Champ>
        <Champ label="Ville">
          <input className="champ" name="ville" defaultValue={ecole?.ville ?? ""} placeholder="Ex. Montréal" />
        </Champ>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <Champ label="Type">
          <input className="champ" name="type" list={`types-${id}`} defaultValue={ecole?.type ?? ""} placeholder="Ex. Université publique" />
        </Champ>
        <Champ label="Frais de scolarité (F CFA / an)">
          <input className="champ" name="fraisXof" inputMode="numeric" defaultValue={ecole?.fraisXof ?? ""} placeholder="0" />
        </Champ>
      </div>
      <datalist id={`types-${id}`}>
        {TYPES_ECOLE.map((type) => <option key={type} value={type} />)}
      </datalist>
      <Champ label="Formations proposées" aide="Une formation par ligne.">
        <textarea className="champ min-h-24" name="formations" defaultValue={ecole?.formations ?? ""} placeholder={"Licence en informatique\nMaster en gestion"} />
      </Champ>
      <Champ label="Rentrées">
        <input className="champ" name="rentrees" defaultValue={ecole?.rentrees ?? ""} placeholder="Ex. Septembre, janvier" />
      </Champ>
      <div className="grid gap-4 sm:grid-cols-2">
        <Champ label="Contact à l'école">
          <input className="champ" name="contactNom" defaultValue={ecole?.contactNom ?? ""} placeholder="Nom du contact" />
        </Champ>
        <Champ label="Téléphone">
          <input className="champ" name="telephone" defaultValue={ecole?.telephone ?? ""} />
        </Champ>
        <Champ label="Email">
          <input className="champ" name="email" type="email" defaultValue={ecole?.email ?? ""} />
        </Champ>
        <Champ label="Site web">
          <input className="champ" name="siteWeb" defaultValue={ecole?.siteWeb ?? ""} placeholder="https://" />
        </Champ>
      </div>
      <div className="grid gap-3 rounded-xl bg-paper p-3.5">
        <label className="flex items-center gap-2.5 text-sm font-semibold">
          <input type="checkbox" name="partenaire" defaultChecked={ecole?.partenaire} className="h-4 w-4 accent-desk" />
          École partenaire d'EduDesk
        </label>
        <Champ label="Commission versée par l'école (F CFA par étudiant inscrit)" aide="Comptée uniquement pour une école partenaire.">
          <input className="champ" name="commissionXof" inputMode="numeric" defaultValue={ecole?.commissionXof || ""} placeholder="0" />
        </Champ>
      </div>
      <Champ label="Notes internes">
        <textarea className="champ min-h-20" name="notes" defaultValue={ecole?.notes ?? ""} placeholder="Conditions d'admission, délais de réponse…" />
      </Champ>
    </>
  );
}
