import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { Shell } from "@/components/shell";
import { nonLusGroupes } from "@/server/groupes";
import { accesDuChemin, lireAcces } from "@/server/acces";
import { lireModules, moduleDuChemin } from "@/server/modules";
import { peutParametrer } from "@/server/permissions";
import { requireUser } from "@/server/session";

export const dynamic = "force-dynamic";

export default async function BureauLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  const [modules, droits] = await Promise.all([lireModules(), lireAcces(user)]);
  const chemin = (await headers()).get("x-pathname") ?? "";
  const cheminNu = chemin.split("?")[0] ?? chemin;
  const accueil = user.role === "PARTENAIRE" ? (droits.dossiers ? "/dossiers" : droits.notifications ? "/notifications" : "/profil") : "/tableau-de-bord";
  if (cheminNu.startsWith("/parametres") && !peutParametrer(user.role)) redirect(accueil);
  const documentsCoupes = cheminNu === "/parametres/documents" && !modules.devis && !modules.factures;
  const coupe = moduleDuChemin(chemin);
  const interdit = accesDuChemin(chemin);
  if (documentsCoupes || (coupe && !modules[coupe]) || (interdit && !droits[interdit])) {
    if (coupe === "devis" && modules.factures && droits.factures) redirect("/facturation?vue=factures");
    if (coupe === "factures" && modules.devis && droits.devis) redirect("/facturation");
    if (cheminNu !== accueil) redirect(accueil);
  }
  const [nonLues, messagesNonLus] = await Promise.all([
    modules.notifications && droits.notifications ? prisma.notificationInterne.count({ where: { userId: user.id, lue: false } }) : 0,
    modules.messagerie && droits.messagerie && user.role !== "PARTENAIRE"
      ? Promise.all([prisma.message.count({ where: { aId: user.id, lu: false } }), nonLusGroupes(user.id)]).then(([directs, groupes]) => directs + groupes)
      : 0,
  ]);
  return (
    <Shell user={user} nonLues={nonLues} messagesNonLus={messagesNonLus} modules={modules} droits={droits}>
      {children}
    </Shell>
  );
}
