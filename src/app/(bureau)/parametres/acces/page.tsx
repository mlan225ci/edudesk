import Link from "next/link";
import { ShieldCheck } from "lucide-react";
import { prisma } from "@/lib/db";
import { nomComplet } from "@/lib/format";
import { ROLES, labelRole } from "@/lib/labels";
import { Formulaire } from "@/components/formulaire";
import { Icone } from "@/components/icones";
import { Badge, EnTete } from "@/components/ui";
import { ACCES, lireReglageCompte, lireReglageRole } from "@/server/acces";
import { enregistrerAccesCompte, enregistrerAccesRole, retablirAccesCompte, retablirAccesRole } from "@/server/acces-actions";
import { peutParametrer } from "@/server/permissions";
import { requireUser } from "@/server/session";
import { redirect } from "next/navigation";

export const metadata = { title: "Accès" };

export default async function AccesPage({ searchParams }: { searchParams: Promise<{ portee?: string; role?: string; compte?: string }> }) {
  const user = await requireUser();
  if (!peutParametrer(user.role)) redirect("/tableau-de-bord");
  const params = await searchParams;
  const portee = params.portee === "compte" ? "compte" : "role";
  const role = ROLES.some((item) => item.value === params.role) ? params.role! : "COMMERCIAL";
  const comptes = portee === "compte" ? await prisma.user.findMany({ where: { actif: true }, orderBy: [{ prenom: "asc" }, { nom: "asc" }], select: { id: true, prenom: true, nom: true, role: true } }) : [];
  const compteId = comptes.some((compte) => compte.id === params.compte) ? params.compte! : comptes[0]?.id;
  const reglageRole = portee === "role" ? await lireReglageRole(role as (typeof ROLES)[number]["value"]) : null;
  const reglageCompte = portee === "compte" && compteId ? await lireReglageCompte(compteId) : null;
  const groupes = [...new Set(ACCES.map((acces) => acces.groupe))];

  return (
    <section className="grid gap-6">
      <EnTete
        surTitre="Direction"
        titre="Accès"
        icone={ShieldCheck}
        description="Choisissez ce qu'un rôle voit par défaut, ou retirez et ajoutez des fonctionnalités pour un compte en particulier. Le paramétrage lui-même reste réservé à la direction et à l'administrateur."
      />

      <div className="flex gap-2">
        <Link href="/parametres/acces?portee=role" className={portee === "role" ? "bouton" : "bouton-second"}>Par rôle</Link>
        <Link href="/parametres/acces?portee=compte" className={portee === "compte" ? "bouton" : "bouton-second"}>Par compte</Link>
      </div>

      {portee === "role" ? (
        <>
          <form action="/parametres/acces" className="flex flex-wrap items-end gap-3">
            <input type="hidden" name="portee" value="role" />
            <label className="grid gap-1 text-sm">
              <span className="font-medium">Rôle</span>
              <select name="role" defaultValue={role} className="champ min-w-64">
                {ROLES.map((item) => (
                  <option key={item.value} value={item.value}>{item.label}</option>
                ))}
              </select>
            </label>
            <button type="submit" className="bouton-second">Afficher</button>
          </form>
          <Formulaire action={enregistrerAccesRole} submit="Enregistrer ce rôle" succes="Accès du rôle mis à jour" reinitialiser={false} className="grid gap-6">
            <input type="hidden" name="role" value={role} />
            <Cases groupes={groupes} coches={reglageRole!} />
          </Formulaire>
          <Formulaire action={retablirAccesRole} submit="Revenir aux droits d'origine" succes="Droits d'origine rétablis" reinitialiser={false} boutonClassName="bouton-second">
            <input type="hidden" name="role" value={role} />
            <p className="text-sm text-ink/55">Efface les réglages enregistrés pour ce rôle. Chaque compte retrouve les droits prévus pour son poste, sauf exceptions personnelles.</p>
          </Formulaire>
        </>
      ) : (
        <>
          <form action="/parametres/acces" className="flex flex-wrap items-end gap-3">
            <input type="hidden" name="portee" value="compte" />
            <label className="grid gap-1 text-sm">
              <span className="font-medium">Compte</span>
              <select name="compte" defaultValue={compteId} className="champ min-w-72">
                {comptes.map((compte) => (
                  <option key={compte.id} value={compte.id}>{nomComplet(compte)} · {labelRole(compte.role)}</option>
                ))}
              </select>
            </label>
            <button type="submit" className="bouton-second">Afficher</button>
          </form>
          {reglageCompte ? (
            <>
              <Formulaire action={enregistrerAccesCompte} submit="Enregistrer ce compte" succes="Accès du compte mis à jour" reinitialiser={false} className="grid gap-6">
                <input type="hidden" name="compte" value={reglageCompte.compte.id} />
                <Cases groupes={groupes} coches={reglageCompte.effectif} personnalises={reglageCompte.personnalises} />
              </Formulaire>
              <Formulaire action={retablirAccesCompte} submit="Reprendre les droits du rôle" succes="Le compte suit de nouveau son rôle" reinitialiser={false} boutonClassName="bouton-second">
                <input type="hidden" name="compte" value={reglageCompte.compte.id} />
                <p className="text-sm text-ink/55">Retire les exceptions de {nomComplet(reglageCompte.compte)}. Les droits du poste {labelRole(reglageCompte.compte.role)} s'appliquent à nouveau.</p>
              </Formulaire>
            </>
          ) : (
            <p className="text-sm text-ink/55">Aucun compte actif.</p>
          )}
        </>
      )}
    </section>
  );
}

function Cases({
  groupes,
  coches,
  personnalises,
}: {
  groupes: string[];
  coches: Record<string, boolean>;
  personnalises?: Set<string>;
}) {
  return (
    <>
      {groupes.map((groupe) => (
        <fieldset key={groupe} className="grid gap-3">
          <legend className="text-xs font-semibold tracking-[0.12em] text-ink/45 uppercase">{groupe}</legend>
          <div className="grid gap-3 md:grid-cols-2">
            {ACCES.filter((acces) => acces.groupe === groupe).map((acces) => (
              <label key={acces.id} className="carte flex cursor-pointer items-start gap-3">
                <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-desk/[0.07] text-desk">
                  <Icone nom={acces.icone} size={18} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex flex-wrap items-center gap-2">
                    <span className="font-semibold">{acces.label}</span>
                    {personnalises?.has(acces.id) ? <Badge ton="edu">Exception</Badge> : null}
                  </span>
                  <span className="mt-0.5 block text-sm text-ink/55">{acces.description}</span>
                </span>
                <input type="checkbox" name="acces" value={acces.id} defaultChecked={coches[acces.id]} className="mt-1 h-5 w-5 shrink-0 accent-desk" />
              </label>
            ))}
          </div>
        </fieldset>
      ))}
    </>
  );
}
