import { redirect } from "next/navigation";
import { KeyRound, Mail, Phone, UserPlus, UsersRound } from "lucide-react";
import { prisma } from "@/lib/db";
import { nomComplet } from "@/lib/format";
import { ROLES, labelRole } from "@/lib/labels";
import { BoutonEnvoi, FormAction, Formulaire } from "@/components/formulaire";
import { Tiroir } from "@/components/tiroir";
import { Avatar, Badge, Champ, EnTete } from "@/components/ui";
import { basculerActif, creerUtilisateur, reinitialiserMotDePasse } from "@/server/actions";
import { peutGererEquipe } from "@/server/permissions";
import { requireUser } from "@/server/session";

export const metadata = { title: "Équipe" };

export default async function EquipePage({ searchParams }: { searchParams: Promise<{ nouveau?: string }> }) {
  const user = await requireUser();
  if (!peutGererEquipe(user.role)) redirect("/missions");
  const { nouveau } = await searchParams;
  const equipe = await prisma.user.findMany({ orderBy: [{ actif: "desc" }, { role: "asc" }, { prenom: "asc" }], include: { superieur: true } });
  const actifs = equipe.filter((item) => item.actif);

  return (
    <section className="grid gap-6">
      <EnTete
        titre="Équipe"
        icone={UsersRound}
        description={`${actifs.length} collaborateurs actifs. Le rôle détermine ce que chacun voit et peut faire.`}
        actions={
          <Tiroir label="Nouveau collaborateur" icone={<UserPlus size={16} />} titre="Nouveau compte" description="La personne pourra se connecter immédiatement." ouvertParDefaut={nouveau === "1"}>
            <Formulaire action={creerUtilisateur} submit="Créer le compte" succes="Compte créé" className="grid gap-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <Champ label="Prénom"><input className="champ" name="prenom" required autoFocus /></Champ>
                <Champ label="Nom"><input className="champ" name="nom" required /></Champ>
              </div>
              <Champ label="E-mail (identifiant)"><input className="champ" name="email" type="email" required /></Champ>
              <Champ label="Téléphone" aide="Reçoit les alertes de mission par SMS."><input className="champ" name="telephone" defaultValue="+225" required /></Champ>
              <Champ label="Rôle">
                <select className="champ" name="role" required>
                  {ROLES.map((role) => (
                    <option key={role.value} value={role.value}>{role.label}</option>
                  ))}
                </select>
              </Champ>
              <Champ label="Supérieur hiérarchique">
                <select className="champ" name="superieurId" defaultValue="">
                  <option value="">Aucun</option>
                  {actifs.map((item) => (
                    <option key={item.id} value={item.id}>{nomComplet(item)}</option>
                  ))}
                </select>
              </Champ>
              <Champ label="Mot de passe provisoire" aide="8 caractères minimum ; la personne pourra le changer dans son profil.">
                <input className="champ" name="motDePasse" type="text" required minLength={8} />
              </Champ>
            </Formulaire>
          </Tiroir>
        }
      />

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3 entree-cascade">
        {equipe.map((item) => (
          <article key={item.id} className={`carte grid gap-4 ${item.actif ? "" : "opacity-55"}`}>
            <div className="flex items-start gap-3">
              <Avatar prenom={item.prenom} nom={item.nom} taille="lg" />
              <div className="min-w-0 flex-1">
                <p className="truncate font-semibold">{nomComplet(item)} {item.id === user.id ? <span className="text-xs font-normal text-ink/45">(vous)</span> : null}</p>
                <div className="mt-1 flex flex-wrap gap-1.5">
                  <Badge ton="desk">{labelRole(item.role)}</Badge>
                  {!item.actif ? <Badge ton="cap">Désactivé</Badge> : null}
                </div>
              </div>
            </div>
            <div className="grid gap-1 text-xs text-ink/60">
              <p className="flex items-center gap-2 truncate"><Mail size={13} className="text-ink/35" /> {item.email}</p>
              <p className="flex items-center gap-2"><Phone size={13} className="text-ink/35" /> {item.telephone}</p>
              {item.superieur ? <p className="text-ink/45">Rattaché à {nomComplet(item.superieur)}</p> : null}
            </div>
            {item.id !== user.id ? (
              <div className="flex flex-wrap gap-2 border-t border-ink/[0.06] pt-3">
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
              </div>
            ) : null}
          </article>
        ))}
      </div>
    </section>
  );
}
