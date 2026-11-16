import { redirect } from "next/navigation";
import type { Role } from "@prisma/client";
import { KeyRound, Mail, Pencil, Phone, Trash2, UserPlus, UsersRound } from "lucide-react";
import { prisma } from "@/lib/db";
import { nomComplet } from "@/lib/format";
import { ROLES, labelRole } from "@/lib/labels";
import { BoutonEnvoi, FormAction, Formulaire } from "@/components/formulaire";
import { Tiroir } from "@/components/tiroir";
import { Avatar, Badge, Champ, EnTete } from "@/components/ui";
import {
  basculerActif,
  creerUtilisateur,
  modifierUtilisateur,
  reinitialiserMotDePasse,
  supprimerUtilisateur,
} from "@/server/actions";
import { peutGererEquipe, rolesEffectifs } from "@/server/permissions";
import { requireUser } from "@/server/session";

export const metadata = { title: "Utilisateurs · Paramètres" };

export default async function EquipePage({ searchParams }: { searchParams: Promise<{ nouveau?: string }> }) {
  const user = await requireUser();
  if (!peutGererEquipe(user)) redirect("/missions");
  const { nouveau } = await searchParams;
  const equipe = await prisma.user.findMany({ orderBy: [{ actif: "desc" }, { role: "asc" }, { prenom: "asc" }], include: { superieur: true } });
  const actifs = equipe.filter((item) => item.actif);

  return (
    <section className="grid gap-6">
      <EnTete
        titre="Utilisateurs"
        icone={UsersRound}
        surTitre="Paramètres"
        description={`${actifs.length} collaborateurs actifs. Un compte peut cumuler plusieurs rôles (ex. coach et traducteur).`}
        actions={
          <Tiroir label="Nouveau collaborateur" icone={<UserPlus size={16} />} titre="Nouveau compte" description="La personne pourra se connecter immédiatement." ouvertParDefaut={nouveau === "1"}>
            <Formulaire action={creerUtilisateur} submit="Créer le compte" succes="Compte créé" className="grid gap-4">
              <ChampsCompte actifs={actifs} />
              <Champ label="Mot de passe provisoire" aide="8 caractères minimum ; la personne pourra le changer dans son profil.">
                <input className="champ" name="motDePasse" type="text" required minLength={8} />
              </Champ>
            </Formulaire>
          </Tiroir>
        }
      />

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3 entree-cascade">
        {equipe.map((item) => {
          const soi = item.id === user.id;
          const superieurs = actifs.filter((compte) => compte.id !== item.id);
          return (
            <article key={item.id} className={`carte grid gap-4 ${item.actif ? "" : "opacity-55"}`}>
              <div className="flex items-start gap-3">
                <Avatar prenom={item.prenom} nom={item.nom} taille="lg" />
                <div className="min-w-0 flex-1">
                  <p className="truncate font-semibold">
                    {nomComplet(item)} {soi ? <span className="text-xs font-normal text-ink/45">(vous)</span> : null}
                  </p>
                  <div className="mt-1 flex flex-wrap gap-1.5">
                    {rolesEffectifs(item).map((role) => (
                      <Badge key={role} ton="desk">{labelRole(role)}</Badge>
                    ))}
                    {!item.actif ? <Badge ton="cap">Désactivé</Badge> : null}
                  </div>
                </div>
              </div>
              <div className="grid gap-1 text-xs text-ink/60">
                <p className="flex items-center gap-2 truncate">
                  <Mail size={13} className="text-ink/35" /> {item.email}
                </p>
                <p className="flex items-center gap-2">
                  <Phone size={13} className="text-ink/35" /> {item.telephone}
                </p>
                {item.superieur ? <p className="text-ink/45">Rattaché à {nomComplet(item.superieur)}</p> : null}
              </div>
              <div className="flex flex-wrap gap-2 border-t border-ink/[0.06] pt-3">
                <Tiroir label="Modifier" variante="second" icone={<Pencil size={14} />} titre={`Modifier ${nomComplet(item)}`} description="Identité, rôles et rattachement hiérarchique.">
                  <Formulaire action={modifierUtilisateur} submit="Enregistrer" succes="Compte mis à jour" className="grid gap-4">
                    <input type="hidden" name="userId" value={item.id} />
                    <ChampsCompte actifs={superieurs} valeurs={item} />
                  </Formulaire>
                </Tiroir>
                {!soi ? (
                  <>
                    <Tiroir label="Mot de passe" variante="second" icone={<KeyRound size={14} />} titre="Nouveau mot de passe" description={nomComplet(item)}>
                      <Formulaire action={reinitialiserMotDePasse} submit="Définir le mot de passe" succes="Mot de passe réinitialisé" className="grid gap-4">
                        <input type="hidden" name="userId" value={item.id} />
                        <Champ label="Nouveau mot de passe" aide="Communiquez-le à la personne ; elle pourra le changer ensuite.">
                          <input className="champ" name="motDePasse" type="text" required minLength={8} autoFocus />
                        </Champ>
                      </Formulaire>
                    </Tiroir>
                    <FormAction
                      action={basculerActif}
                      succes={item.actif ? "Compte désactivé" : "Compte réactivé"}
                      confirmer={item.actif ? `Désactiver le compte de ${nomComplet(item)} ? Il ne pourra plus se connecter.` : undefined}
                    >
                      <input type="hidden" name="userId" value={item.id} />
                      <BoutonEnvoi className={item.actif ? "bouton-fantome text-cap" : "bouton-second"}>{item.actif ? "Désactiver" : "Réactiver"}</BoutonEnvoi>
                    </FormAction>
                    <FormAction
                      action={supprimerUtilisateur}
                      succes="Compte supprimé"
                      confirmer={`Supprimer définitivement le compte de ${nomComplet(item)} ? Ses messages et absences seront effacés. Cette action est irréversible.`}
                    >
                      <input type="hidden" name="userId" value={item.id} />
                      <BoutonEnvoi className="bouton-fantome text-cap" titre="Supprimer le compte">
                        <Trash2 size={14} /> Supprimer
                      </BoutonEnvoi>
                    </FormAction>
                  </>
                ) : null}
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}

function ChampsCompte({
  actifs,
  valeurs,
}: {
  actifs: { id: string; prenom: string; nom: string }[];
  valeurs?: { prenom: string; nom: string; email: string; telephone: string; role: Role; autresRoles: Role[]; superieurId: string | null };
}) {
  const autres = new Set(valeurs?.autresRoles ?? []);
  return (
    <>
      <div className="grid gap-4 sm:grid-cols-2">
        <Champ label="Prénom">
          <input className="champ" name="prenom" required autoFocus={!valeurs} defaultValue={valeurs?.prenom ?? ""} />
        </Champ>
        <Champ label="Nom">
          <input className="champ" name="nom" required defaultValue={valeurs?.nom ?? ""} />
        </Champ>
      </div>
      <Champ label="E-mail (identifiant)">
        <input className="champ" name="email" type="email" required defaultValue={valeurs?.email ?? ""} />
      </Champ>
      <Champ label="Téléphone" aide="Reçoit les alertes de mission par SMS.">
        <input className="champ" name="telephone" defaultValue={valeurs?.telephone ?? "+225"} required />
      </Champ>
      <Champ label="Rôle principal" aide="Détermine l’espace d’accueil (bureau ou portail partenaire).">
        <select className="champ" name="role" required defaultValue={valeurs?.role ?? ""}>
          {!valeurs ? <option value="" disabled>Choisir…</option> : null}
          {ROLES.map((role) => (
            <option key={role.value} value={role.value}>
              {role.label}
            </option>
          ))}
        </select>
      </Champ>
      <Champ label="Rôles additionnels" aide="Cochez les autres postes tenus en parallèle (ex. traducteur). Le portail partenaire ne se cumule pas.">
        <div className="grid gap-2 rounded-2xl border border-ink/[0.08] bg-white/60 p-3 sm:grid-cols-2">
          {ROLES.filter((role) => role.value !== "PARTENAIRE").map((role) => (
            <label key={role.value} className="flex items-center gap-2 text-sm text-ink/80">
              <input
                type="checkbox"
                name="autresRoles"
                value={role.value}
                defaultChecked={autres.has(role.value) && role.value !== valeurs?.role}
                className="size-4 rounded border-ink/20 text-desk focus:ring-desk"
              />
              {role.label}
            </label>
          ))}
        </div>
      </Champ>
      <Champ label="Supérieur hiérarchique">
        <select className="champ" name="superieurId" defaultValue={valeurs?.superieurId ?? ""}>
          <option value="">Aucun</option>
          {actifs.map((item) => (
            <option key={item.id} value={item.id}>
              {nomComplet(item)}
            </option>
          ))}
        </select>
      </Champ>
    </>
  );
}
