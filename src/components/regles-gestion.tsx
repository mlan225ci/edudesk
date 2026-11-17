import { SlidersHorizontal } from "lucide-react";
import { Formulaire } from "@/components/formulaire";
import { enregistrerFraisVisa, enregistrerRegle } from "@/server/parametres-actions";
import type { lireRegles } from "@/server/regles";

export function ReglesGestion({
  regles,
  fraisVisa,
}: {
  regles: Awaited<ReturnType<typeof lireRegles>>;
  fraisVisa: number;
}) {
  return (
    <section className="carte grid gap-4">
      <div>
        <h2 className="flex items-center gap-2 font-semibold">
          <SlidersHorizontal size={16} className="text-desk" /> Règles de gestion
        </h2>
        <p className="mt-1 max-w-3xl text-sm text-ink/60">
          Réservé au directeur et à l&apos;administrateur système. Chaque règle s&apos;applique dès qu&apos;elle est enregistrée.
        </p>
      </div>
      <ul className="grid gap-3">
        {regles.map((regle) => (
          <li key={regle.id} className="flex flex-wrap items-center justify-between gap-3 border-t border-ink/[0.06] pt-3">
            <div className="min-w-0 max-w-2xl">
              <p className="font-medium">{regle.label}</p>
              <p className="mt-0.5 text-sm text-ink/55">{regle.description}</p>
            </div>
            <Formulaire
              action={enregistrerRegle}
              submit={regle.actif ? "Couper" : "Activer"}
              succes={regle.actif ? `${regle.label} coupée` : `${regle.label} activée`}
              reinitialiser={false}
              autoriser
              boutonClassName={regle.actif ? "bouton-second shrink-0" : "bouton shrink-0"}
              className="flex shrink-0 items-center gap-2"
            >
              <input type="hidden" name="id" value={regle.id} />
              <input type="hidden" name="actif" value={regle.actif ? "0" : "1"} />
            </Formulaire>
          </li>
        ))}
      </ul>
      <Formulaire
        action={enregistrerFraisVisa}
        submit="Enregistrer"
        succes="Frais de visa enregistrés"
        reinitialiser={false}
        autoriser
        boutonClassName="bouton shrink-0"
        className="flex flex-wrap items-end justify-between gap-3 border-t border-ink/[0.06] pt-3"
      >
        <label className="grid min-w-0 gap-1 text-sm">
          <span className="font-medium">Frais de visa</span>
          <span className="text-ink/55">Montant en F CFA indiqué au point de paiement de la responsable commerciale.</span>
          <input className="champ mt-1 w-40" name="montant" type="number" min={0} step={1} required defaultValue={fraisVisa} />
        </label>
      </Formulaire>
    </section>
  );
}
