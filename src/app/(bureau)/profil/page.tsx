import Link from "next/link";
import { Boxes, KeyRound, ListChecks, Mail, Palmtree, Phone, UserRound } from "lucide-react";
import { prisma } from "@/lib/db";
import { formatJour, nomComplet } from "@/lib/format";
import { labelEtat, labelRole } from "@/lib/labels";
import { Formulaire } from "@/components/formulaire";
import { Kpi, Panneau } from "@/components/graphiques";
import { Avatar, Badge, Champ } from "@/components/ui";
import { changerMotDePasse } from "@/server/actions";
import { requireUser } from "@/server/session";

export const metadata = { title: "Mon profil" };

export default async function ProfilPage() {
  const session = await requireUser();
  const [user, missions, conges] = await Promise.all([
    prisma.user.findUniqueOrThrow({ where: { id: session.id }, include: { superieur: true, materiels: true, partenaire: true } }),
    prisma.dossierEtape.count({ where: { statut: "EN_COURS", responsableId: session.id } }),
    prisma.conge.count({ where: { userId: session.id, statut: "VALIDE", fin: { gte: new Date() } } }),
  ]);

  return (
    <section className="mx-auto grid w-full max-w-4xl gap-6">
      <header className="carte relative overflow-hidden">
        <div className="absolute inset-x-0 top-0 h-24 bg-gradient-to-r from-ink via-desk to-desk/70" />
        <div className="relative flex flex-wrap items-end gap-4 pt-12">
          <div className="rounded-full ring-4 ring-white">
            <Avatar prenom={user.prenom} nom={user.nom} taille="lg" />
          </div>
          <div className="pb-1">
            <h1 className="text-2xl font-bold tracking-tight">{nomComplet(user)}</h1>
            <div className="mt-1 flex flex-wrap items-center gap-2">
              <Badge ton="desk">{labelRole(user.role)}</Badge>
              {user.partenaire ? <Badge ton="edu">{user.partenaire.nom}</Badge> : null}
              <span className="text-xs text-ink/50">Membre depuis le {formatJour(user.creeLe)}</span>
            </div>
          </div>
        </div>
        <div className="relative mt-5 grid gap-2 border-t border-ink/[0.06] pt-4 text-sm sm:grid-cols-3">
          <p className="flex items-center gap-2"><Mail size={15} className="text-ink/35" /> {user.email}</p>
          <p className="flex items-center gap-2"><Phone size={15} className="text-ink/35" /> {user.telephone}</p>
          <p className="flex items-center gap-2"><UserRound size={15} className="text-ink/35" /> {user.superieur ? `Rattaché à ${nomComplet(user.superieur)}` : "Aucun supérieur"}</p>
        </div>
      </header>

      {user.role !== "PARTENAIRE" ? (
        <div className="grid gap-3 sm:grid-cols-3">
          <Kpi titre="Missions en cours" valeur={missions} icone={ListChecks} href="/missions" />
          <Kpi titre="Absences validées à venir" valeur={conges} icone={Palmtree} href="/conges" />
          <Kpi titre="Matériel confié" valeur={user.materiels.length} icone={Boxes} />
        </div>
      ) : null}

      <div className="grid gap-6 md:grid-cols-2">
        <Panneau titre="Changer mon mot de passe" icone={KeyRound}>
          <Formulaire action={changerMotDePasse} submit="Mettre à jour" succes="Mot de passe modifié" className="grid gap-4">
            <Champ label="Mot de passe actuel"><input className="champ" type="password" name="actuel" autoComplete="current-password" required /></Champ>
            <Champ label="Nouveau mot de passe" aide="8 caractères minimum."><input className="champ" type="password" name="nouveau" autoComplete="new-password" minLength={8} required /></Champ>
            <Champ label="Confirmation"><input className="champ" type="password" name="confirmation" autoComplete="new-password" minLength={8} required /></Champ>
          </Formulaire>
        </Panneau>

        {user.role !== "PARTENAIRE" ? (
          <Panneau titre="Matériel qui m'est confié" icone={Boxes} className="self-start">
            {user.materiels.length === 0 ? (
              <p className="py-4 text-center text-sm text-ink/50">Aucun matériel à votre nom.</p>
            ) : (
              <ul className="grid gap-2 text-sm">
                {user.materiels.map((materiel) => (
                  <li key={materiel.id} className="flex items-center justify-between rounded-xl bg-paper px-3.5 py-2.5">
                    <span>
                      <span className="font-medium">{materiel.designation}</span>
                      <span className="text-xs text-ink/45"> · {materiel.categorie}</span>
                    </span>
                    <Badge ton={materiel.etat === "PANNE" ? "cap" : materiel.etat === "BON" ? "vert" : "gris"}>{labelEtat(materiel.etat)}</Badge>
                  </li>
                ))}
              </ul>
            )}
            <Link href="/conges?nouveau=1" className="bouton-second mt-4 w-full">
              <Palmtree size={15} /> Demander une absence
            </Link>
          </Panneau>
        ) : null}
      </div>
    </section>
  );
}
