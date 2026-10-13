import type { Client, Partenaire, Procedure } from "@prisma/client";
import { Champ } from "@/components/ui";

export function ChampsClient({
  client,
  partenaires,
  procedures,
}: {
  client?: Client;
  partenaires: Pick<Partenaire, "id" | "nom">[];
  procedures?: Pick<Procedure, "id" | "nom">[];
}) {
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
      <Champ label="Téléphone" aide="Format international, il sert à envoyer les SMS de suivi.">
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
      <div className="grid gap-4 sm:grid-cols-2">
        <Champ label="Garant">
          <input className="champ" name="garantNom" placeholder="Nom du garant" defaultValue={client?.garantNom ?? ""} />
        </Champ>
        <Champ label="Téléphone du garant">
          <input className="champ" name="garantTelephone" placeholder="+225…" defaultValue={client?.garantTelephone ?? ""} />
        </Champ>
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
