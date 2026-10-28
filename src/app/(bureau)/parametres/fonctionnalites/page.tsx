import { redirect } from "next/navigation";
import { Blocks } from "lucide-react";
import { Formulaire } from "@/components/formulaire";
import { Icone } from "@/components/icones";
import { EnTete } from "@/components/ui";
import { MODULES, lireModules } from "@/server/modules";
import { enregistrerModules } from "@/server/parametres-actions";
import { peutParametrer } from "@/server/permissions";
import { requireUser } from "@/server/session";

export const metadata = { title: "Fonctionnalités" };

export default async function FonctionnalitesPage() {
  const user = await requireUser();
  if (!peutParametrer(user.role)) redirect("/tableau-de-bord");
  const actifs = await lireModules();
  const groupes = [...new Set(MODULES.map((module) => module.groupe))];

  return (
    <section className="grid gap-6">
      <EnTete
        surTitre="Direction"
        titre="Fonctionnalités"
        icone={Blocks}
        description="Décochez un bloc pour le retirer des menus et en interdire l'accès. Les dossiers, les clients, les missions et les procédures restent toujours disponibles."
      />

      <Formulaire action={enregistrerModules} submit="Enregistrer" succes="Fonctionnalités mises à jour" reinitialiser={false} className="grid gap-6">
        {groupes.map((groupe) => (
          <fieldset key={groupe} className="grid gap-3">
            <legend className="text-xs font-semibold tracking-[0.12em] text-ink/45 uppercase">{groupe}</legend>
            <div className="grid gap-3 md:grid-cols-2">
              {MODULES.filter((module) => module.groupe === groupe).map((module) => (
                <label key={module.id} className="carte flex cursor-pointer items-start gap-3">
                  <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-desk/[0.07] text-desk">
                    <Icone nom={module.icone} size={18} />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block font-semibold">{module.label}</span>
                    <span className="mt-0.5 block text-sm text-ink/55">{module.description}</span>
                  </span>
                  <input type="checkbox" name="modules" value={module.id} defaultChecked={actifs[module.id]} className="mt-1 h-5 w-5 shrink-0 accent-desk" />
                </label>
              ))}
            </div>
          </fieldset>
        ))}
      </Formulaire>
    </section>
  );
}
