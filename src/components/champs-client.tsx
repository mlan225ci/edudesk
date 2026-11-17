import type { Client, Partenaire, Procedure } from "@prisma/client";
import { Champ } from "@/components/ui";

export function ChampsClient({
  client,
  partenaires,
  procedures,
  garants = [],
  acces = [],
}: {
  client?: Client;
  partenaires: Pick<Partenaire, "id" | "nom">[];
  procedures?: Pick<Procedure, "id" | "nom">[];
  garants?: { nom: string; telephone: string | null }[];
  acces?: { libelle: string; identifiant: string; secret: string }[];
}) {
  const listeGarants = garants.length
    ? garants
    : client?.garantNom
      ? [{ nom: client.garantNom, telephone: client.garantTelephone }]
      : [];
  return (
    <>
      <div className="grid gap-4 sm:grid-cols-2">
        <Champ label="Prénom">
          <input className="champ" name="prenom" required defaultValue={client?.prenom} autoFocus={!client} />
        </Champ>
        <Champ label="Nom">
          <input className="champ" name="nom" required defaultValue={client?.nom} />
        </Champ>
      </div>
      <Champ label="Téléphone" aide="Format international. L'évolution de la procédure part par e-mail.">
        <input className="champ" name="telephone" required placeholder="+2250700000000" defaultValue={client?.telephone ?? "+225"} />
      </Champ>
      <Champ label="E-mail">
        <input className="champ" name="email" type="email" placeholder="Facultatif" defaultValue={client?.email ?? ""} />
      </Champ>
      <div className="grid gap-4 sm:grid-cols-2">
        <Champ label="Pays visé">
          <input
            className="champ"
            name="paysVise"
            list="pays-edudesk"
            placeholder={procedures ? "Déduit de la procédure" : "Canada, France…"}
            defaultValue={client?.paysVise ?? ""}
          />
          <datalist id="pays-edudesk">
            {["Canada", "France", "Irlande", "Espagne", "Belgique", "Schengen"].map((pays) => (
              <option key={pays} value={pays} />
            ))}
          </datalist>
        </Champ>
        <Champ label="Apporté par">
          <select className="champ" name="partenaireId" defaultValue={client?.partenaireId ?? ""}>
            <option value="">Aucun partenaire</option>
            {partenaires.map((partenaire) => (
              <option key={partenaire.id} value={partenaire.id}>{partenaire.nom}</option>
            ))}
          </select>
        </Champ>
      </div>
      <div className="grid gap-3">
        <p className="text-sm font-semibold">Garants</p>
        {[0, 1, 2].map((index) => {
          const garant = listeGarants[index];
          const suffixe = index === 0 ? "" : String(index + 1);
          return (
            <div key={index} className="grid gap-4 sm:grid-cols-2">
              <Champ label={index === 0 ? "Garant" : `Garant ${index + 1}`}>
                <input className="champ" name={`garantNom${suffixe}`} placeholder="Nom du garant" defaultValue={garant?.nom ?? ""} />
              </Champ>
              <Champ label="Téléphone du garant">
                <input className="champ" name={`garantTelephone${suffixe}`} placeholder="+225…" defaultValue={garant?.telephone ?? ""} />
              </Champ>
            </div>
          );
        })}
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <Champ label="Accès Campus France">
          <input className="champ" name="accesCf" placeholder="Identifiant Campus France" defaultValue={client?.accesCf ?? ""} autoComplete="off" />
        </Champ>
        <Champ label="Mot de passe Campus France">
          <input className="champ" name="motDePasseCf" placeholder="Mot de passe du compte CF" defaultValue={client?.motDePasseCf ?? ""} autoComplete="off" />
        </Champ>
      </div>
      <div className="grid gap-3">
        <p className="text-sm font-semibold">Autres accès</p>
        {[0, 1, 2].map((index) => {
          const ligne = acces[index];
          const numero = index + 1;
          return (
            <div key={index} className="grid gap-4 sm:grid-cols-3">
              <Champ label={index === 0 ? "Compte" : `Compte ${numero}`}>
                <input className="champ" name={`accesLibelle${numero}`} placeholder="E-mail, école…" defaultValue={ligne?.libelle ?? ""} />
              </Champ>
              <Champ label="Identifiant">
                <input className="champ" name={`accesIdentifiant${numero}`} defaultValue={ligne?.identifiant ?? ""} autoComplete="off" />
              </Champ>
              <Champ label="Mot de passe">
                <input className="champ" name={`accesSecret${numero}`} defaultValue={ligne?.secret ?? ""} autoComplete="off" />
              </Champ>
            </div>
          );
        })}
      </div>
      {procedures ? (
        <Champ label="Ouvrir un dossier tout de suite" aide="Choisissez la procédure : le dossier démarre avec sa première étape.">
          <select className="champ" name="procedureId" defaultValue={procedures[0]?.id ?? ""}>
            <option value="">Plus tard, créer seulement le client</option>
            {procedures.map((procedure) => (
              <option key={procedure.id} value={procedure.id}>{procedure.nom}</option>
            ))}
          </select>
        </Champ>
      ) : null}
    </>
  );
}
