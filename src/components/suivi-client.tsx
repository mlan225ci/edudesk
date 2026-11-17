import { Link2, Link2Off } from "lucide-react";
import { Formulaire } from "@/components/formulaire";
import { definirSuiviClient } from "@/server/parametres-actions";

export function SuiviClient({ actif }: { actif: boolean }) {
  return (
    <Formulaire
      action={definirSuiviClient}
      submit={actif ? "Désactiver le suivi" : "Activer le suivi"}
      succes={actif ? "Le suivi par lien est fermé" : "Le suivi par lien est ouvert"}
      reinitialiser={false}
      autoriser
      boutonClassName={actif ? "bouton-second" : "bouton"}
      icone={actif ? <Link2Off size={15} /> : <Link2 size={15} />}
      className="carte flex flex-wrap items-center justify-between gap-4"
    >
      <input type="hidden" name="actif" value={actif ? "0" : "1"} />
      <div className="min-w-0">
        <h2 className="flex items-center gap-2 font-semibold">
          {actif ? <Link2 size={16} className="text-vert" /> : <Link2Off size={16} className="text-ink/40" />}
          Suivi des clients par lien
        </h2>
        <p className="mt-1 max-w-2xl text-sm text-ink/60">
          {actif
            ? "Activé. Un client ouvre son dossier sur la page /suivi avec le code reçu par SMS."
            : "Désactivé. La page /suivi ne montre plus aucun dossier, même avec un code valide."}
        </p>
      </div>
    </Formulaire>
  );
}
