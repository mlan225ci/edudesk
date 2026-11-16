import Link from "next/link";
import { redirect } from "next/navigation";
import { ShieldCheck } from "lucide-react";
import { prisma } from "@/lib/db";
import { nomComplet } from "@/lib/format";
import { ROLES, labelRole } from "@/lib/labels";
import { Formulaire } from "@/components/formulaire";
import { Badge, EnTete } from "@/components/ui";
import { ROLES_2FA_DEFAUT, lireRolesDoubleAuth } from "@/server/deux-facteurs";
import { peutParametrer } from "@/server/permissions";
import { enregistrerDoubleAuthCompte, enregistrerDoubleAuthRoles, retablirDoubleAuthRoles } from "@/server/securite-actions";
import { requireUser } from "@/server/session";

export const metadata = { title: "Sécurité" };

export default async function SecuritePage({ searchParams }: { searchParams: Promise<{ portee?: string; compte?: string }> }) {
  const user = await requireUser();
  if (!peutParametrer(user.role)) redirect("/tableau-de-bord");
  const params = await searchParams;
  const portee = params.portee === "compte" ? "compte" : "role";
  const [rolesActifs, comptes] = await Promise.all([
    lireRolesDoubleAuth(),
    portee === "compte"
      ? prisma.user.findMany({
          where: { actif: true },
          orderBy: [{ prenom: "asc" }, { nom: "asc" }],
          select: { id: true, prenom: true, nom: true, role: true, doubleAuth: true, email: true },
        })
      : Promise.resolve([]),
  ]);
  const compteId = comptes.some((compte) => compte.id === params.compte) ? params.compte! : comptes[0]?.id;
  const compte = comptes.find((item) => item.id === compteId);
  const proteges = ROLES.filter((role) => rolesActifs[role.value]).length;
  const exceptions = await prisma.user.count({ where: { actif: true, doubleAuth: { not: null } } });

  return (
    <section className="grid gap-6">
      <EnTete
        surTitre="Direction"
        titre="Sécurité"
        icone={ShieldCheck}
        description="Après le mot de passe, un code à 6 chiffres est envoyé par e-mail. Activez-le pour un rôle entier, ou faites une exception pour un compte."
      />

      <div className="carte grid gap-2 sm:grid-cols-2">
        <p className="text-sm text-ink/70">
          <span className="block text-xs font-semibold tracking-wider text-ink/40 uppercase">Rôles protégés</span>
          <span className="mt-1 block text-2xl font-bold tabular-nums text-ink">{proteges}</span>
          <span className="text-xs text-ink/45">sur {ROLES.length} · Direction et Administrateur par défaut</span>
        </p>
        <p className="text-sm text-ink/70">
          <span className="block text-xs font-semibold tracking-wider text-ink/40 uppercase">Exceptions de comptes</span>
          <span className="mt-1 block text-2xl font-bold tabular-nums text-ink">{exceptions}</span>
          <span className="text-xs text-ink/45">{exceptions <= 1 ? "compte qui ne suit plus son rôle" : "comptes qui ne suivent plus leur rôle"}</span>
        </p>
      </div>

      <div className="flex gap-2">
        <Link href="/parametres/securite?portee=role" className={portee === "role" ? "bouton" : "bouton-second"}>
          Par rôle
        </Link>
        <Link href="/parametres/securite?portee=compte" className={portee === "compte" ? "bouton" : "bouton-second"}>
          Par compte
        </Link>
      </div>

      {portee === "role" ? (
        <>
          <Formulaire action={enregistrerDoubleAuthRoles} submit="Enregistrer les rôles" succes="Double authentification mise à jour" reinitialiser={false} className="grid gap-4">
            <div className="grid gap-3 md:grid-cols-2">
              {ROLES.map((role) => (
                <label key={role.value} className="carte flex cursor-pointer items-start gap-3">
                  <span className="min-w-0 flex-1">
                    <span className="flex flex-wrap items-center gap-2">
                      <span className="font-semibold">{role.label}</span>
                      {ROLES_2FA_DEFAUT.has(role.value) ? <Badge ton="desk">Défaut</Badge> : null}
                    </span>
                    <span className="mt-0.5 block text-sm text-ink/55">
                      {ROLES_2FA_DEFAUT.has(role.value)
                        ? "Protégé tant qu'aucun autre réglage n'est enregistré."
                        : "Le code e-mail n'est demandé que si la case est cochée."}
                    </span>
                  </span>
                  <input type="checkbox" name="roles" value={role.value} defaultChecked={rolesActifs[role.value]} className="mt-1 h-5 w-5 shrink-0 accent-desk" />
                </label>
              ))}
            </div>
          </Formulaire>
          <Formulaire action={retablirDoubleAuthRoles} submit="Revenir aux rôles d'origine" succes="Réglages d'origine rétablis" reinitialiser={false} boutonClassName="bouton-second">
            <p className="text-sm text-ink/55">Remet la double authentification uniquement pour Direction et Administrateur. Les exceptions de comptes restent inchangées.</p>
          </Formulaire>
        </>
      ) : (
        <>
          <form action="/parametres/securite" className="flex flex-wrap items-end gap-3">
            <input type="hidden" name="portee" value="compte" />
            <label className="grid gap-1 text-sm">
              <span className="font-medium">Compte</span>
              <select name="compte" defaultValue={compteId} className="champ min-w-72">
                {comptes.map((item) => (
                  <option key={item.id} value={item.id}>
                    {nomComplet(item)} · {labelRole(item.role)}
                  </option>
                ))}
              </select>
            </label>
            <button type="submit" className="bouton-second">
              Afficher
            </button>
          </form>
          {compte ? (
            <Formulaire action={enregistrerDoubleAuthCompte} submit="Enregistrer ce compte" succes="Exception enregistrée" reinitialiser={false} className="grid gap-4">
              <input type="hidden" name="compte" value={compte.id} />
              <div className="carte grid gap-1">
                <p className="font-semibold">{nomComplet(compte)}</p>
                <p className="text-sm text-ink/55">
                  {compte.email} · rôle {labelRole(compte.role)}
                  {rolesActifs[compte.role] ? " · ce rôle demande déjà le code" : " · ce rôle ne demande pas le code"}
                </p>
                {compte.doubleAuth !== null ? <Badge ton="edu">Exception active</Badge> : null}
              </div>
              <label className="etiquette">
                <span>Double authentification</span>
                <select className="champ" name="doubleAuth" defaultValue={compte.doubleAuth === true ? "oui" : compte.doubleAuth === false ? "non" : "role"}>
                  <option value="role">Suivre le rôle ({rolesActifs[compte.role] ? "activée" : "désactivée"})</option>
                  <option value="oui">Toujours demander le code</option>
                  <option value="non">Ne jamais demander le code</option>
                </select>
              </label>
            </Formulaire>
          ) : (
            <p className="text-sm text-ink/55">Aucun compte actif.</p>
          )}
        </>
      )}
    </section>
  );
}
