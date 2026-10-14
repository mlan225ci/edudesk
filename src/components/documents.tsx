import { Check, Download, Eye, FileCheck2, FileClock, FileText, FolderOpen, X } from "lucide-react";
import { formatJour } from "@/lib/format";
import { BoutonEnvoi, FormAction } from "@/components/formulaire";
import { JoindreScan } from "@/components/joindre-scan";
import { refuserDepot, validerDepot } from "@/server/communication-actions";

export type DocumentVue = {
  id: string;
  libelle: string;
  recue: boolean;
  fichier: boolean;
  recueLe: Date | null;
  etape: string | null;
  reportee?: boolean;
  dossier?: string;
  aVerifier?: boolean;
};

export function ListeDocuments({
  documents,
  vide = "Aucun document pour l'instant.",
  peutJoindre = false,
}: {
  documents: DocumentVue[];
  vide?: string;
  peutJoindre?: boolean;
}) {
  if (documents.length === 0) {
    return (
      <p className="flex items-center gap-2 rounded-xl bg-paper px-4 py-3 text-sm text-ink/50">
        <FolderOpen size={16} /> {vide}
      </p>
    );
  }
  const tries = [...documents].sort(
    (a, b) => Number(Boolean(b.aVerifier)) - Number(Boolean(a.aVerifier)) || Number(b.fichier) - Number(a.fichier) || Number(b.recue) - Number(a.recue),
  );
  return (
    <ul className="entree-cascade grid gap-2 sm:grid-cols-2">
      {tries.map((document) => {
        const sousTitre = [document.dossier, document.etape, document.reportee ? "repris du dossier précédent" : null].filter(Boolean).join(" · ");
        if (document.aVerifier) {
          return (
            <li key={document.id} className="flex flex-wrap items-center gap-3 rounded-xl border border-mission/30 bg-mission/[0.05] px-3.5 py-3 sm:col-span-2">
              <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-mission/15 text-mission">
                <FileClock size={17} />
              </span>
              <a href={`/api/pieces/${document.id}`} target="_blank" rel="noreferrer" className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold hover:text-desk">
                  {document.libelle} <span className="font-medium text-desk">(consulter)</span>
                </p>
                <p className="truncate text-xs text-ink/55">Déposé par le client, à vérifier{sousTitre ? ` · ${sousTitre}` : ""}</p>
              </a>
              {peutJoindre ? (
                <div className="flex items-center gap-1.5">
                  <FormAction action={validerDepot.bind(null, document.id)} succes={`${document.libelle} : pièce validée`}>
                    <BoutonEnvoi className="bouton py-1.5 text-xs">
                      <Check size={14} /> Valider
                    </BoutonEnvoi>
                  </FormAction>
                  <FormAction action={refuserDepot.bind(null, document.id)} succes="Dépôt refusé, le client est prévenu" confirmer={`Refuser le fichier déposé pour « ${document.libelle} » ? Le client sera invité à le déposer à nouveau.`}>
                    <BoutonEnvoi className="bouton-second py-1.5 text-xs">
                      <X size={14} /> Refuser
                    </BoutonEnvoi>
                  </FormAction>
                </div>
              ) : null}
            </li>
          );
        }
        if (document.fichier) {
          return (
            <li key={document.id} className="group flex items-center gap-3 rounded-xl border border-ink/[0.07] bg-white px-3.5 py-3 transition hover:border-desk/30 hover:shadow-sm">
              <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-desk/10 text-desk">
                <FileCheck2 size={17} />
              </span>
              <a href={`/api/pieces/${document.id}`} target="_blank" rel="noreferrer" className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold group-hover:text-desk">
                  {document.libelle} <span className="font-medium text-desk">(consulter)</span>
                </p>
                <p className="truncate text-xs text-ink/45">
                  {document.recueLe ? `Reçu le ${formatJour(document.recueLe)}` : "Reçu"}
                  {sousTitre ? ` · ${sousTitre}` : ""}
                </p>
              </a>
              <a href={`/api/pieces/${document.id}?telecharger=1`} className="bouton-fantome shrink-0 px-2" title={`Télécharger ${document.libelle}`} aria-label={`Télécharger ${document.libelle}`}>
                <Download size={15} />
              </a>
              <a href={`/api/pieces/${document.id}`} target="_blank" rel="noreferrer" className="bouton-fantome shrink-0 px-2 sm:hidden" aria-label={`Consulter ${document.libelle}`}>
                <Eye size={15} />
              </a>
            </li>
          );
        }
        return (
          <li
            key={document.id}
            className={`flex items-center gap-3 rounded-xl border px-3.5 py-3 ${document.recue ? "border-ink/[0.07] bg-white" : "border-dashed border-cap/25 bg-cap/[0.03]"}`}
          >
            <span className={`grid h-9 w-9 shrink-0 place-items-center rounded-lg ${document.recue ? "bg-vert/10 text-vert" : "bg-cap/10 text-cap"}`}>
              {document.recue ? <FileText size={17} /> : <FileClock size={17} />}
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold">{document.libelle}</p>
              <p className="truncate text-xs text-ink/45">
                {document.recue ? "Original vu, pas de copie numérique" : "Manquant"}
                {sousTitre ? ` · ${sousTitre}` : ""}
              </p>
            </div>
            {peutJoindre && document.recue ? <JoindreScan pieceId={document.id} libelle={document.libelle} /> : null}
          </li>
        );
      })}
    </ul>
  );
}
