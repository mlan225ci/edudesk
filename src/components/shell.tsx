import Link from "next/link";
import { Suspense } from "react";
import { headers } from "next/headers";
import { BarreNavigation } from "@/components/barre-navigation";
import { nomComplet } from "@/lib/format";
import { labelRolesCompte } from "@/lib/labels";
import type { AccesEffectif } from "@/server/acces";
import { actionsRapides, estLectureSeule, navigation, ongletsParametres, type SessionUser } from "@/server/permissions";
import type { ModulesActifs } from "@/server/modules";
import { Navigation } from "@/components/navigation";
import { BarreHaute } from "@/components/barre-haute";
import { MasqueChiffres } from "@/components/masque-chiffres";
import { ToastProvider } from "@/components/toasts";
import { CentreMessages } from "@/components/centre-messages";
import { RaccourcisBureau } from "@/components/raccourcis-bureau";

export async function Shell({
  user,
  nonLues,
  messagesNonLus,
  modules,
  droits,
  children,
}: {
  user: SessionUser;
  nonLues: number;
  messagesNonLus: number;
  modules: ModulesActifs;
  droits: AccesEffectif;
  children: React.ReactNode;
}) {
  const sections = navigation(user, modules, droits);
  const lecture = estLectureSeule(user);
  const chemin = ((await headers()).get("x-pathname") ?? "").split("?")[0] ?? "";
  const messagerie = chemin.startsWith("/messages");
  const parametres = chemin.startsWith("/parametres");
  const accueil = user.role === "PARTENAIRE" ? "/dossiers" : "/tableau-de-bord";
  const contenu = (
    <>
      <Suspense fallback={null}>
        <BarreNavigation />
      </Suspense>
      <div className={`flex bg-paper text-ink ${messagerie ? "h-dvh max-h-dvh overflow-hidden" : "min-h-screen"}`}>
        <aside className={`scroll-menu no-print hidden w-[248px] shrink-0 flex-col overflow-y-auto bg-ink md:flex ${messagerie ? "h-full" : "sticky top-0 h-screen"}`}>
          <div className="px-5 pt-6 pb-5">
            <Link href={accueil} className="block w-fit rounded-xl bg-white px-3 py-2 transition hover:shadow-lg hover:shadow-black/20">
              <img src="/logo-edudesk.png" alt="EduDesk" className="h-8 w-auto" />
            </Link>
          </div>
          <div className="flex-1 px-3 pb-4">
            <Navigation sections={sections} />
          </div>
          <div className="mx-3 mb-4 rounded-2xl bg-white/[0.06] p-3.5 text-xs leading-5 text-white/55">
            <p className="font-semibold text-white/85">Astuce</p>
            <p>
              <kbd className="rounded bg-white/10 px-1 text-white/80">Ctrl + K</kbd> recherche ·{" "}
              <kbd className="rounded bg-white/10 px-1 text-white/80">Ctrl + Alt + …</kbd> navigation. Personnalisez dans{" "}
              <Link href="/profil" className="font-semibold text-white/85 underline decoration-white/25 underline-offset-2 hover:text-white">
                Mon profil
              </Link>
              .
            </p>
            <Link href="/aide" className="mt-2 inline-block font-semibold text-white/85 underline decoration-white/25 underline-offset-2 hover:text-white">
              Voir la démo
            </Link>
          </div>
          <div className="mt-auto h-1 shrink-0 bg-gradient-to-r from-cap via-edu to-desk" />
        </aside>
        <div className={`flex min-w-0 flex-1 flex-col ${messagerie ? "h-full min-h-0 overflow-hidden" : ""}`}>
          <BarreHaute
            sections={sections}
            parametres={ongletsParametres(user, modules)}
            actions={actionsRapides(user, modules, droits)}
            nonLues={nonLues}
            messagerie={droits.messagerie && modules.messagerie}
            notifications={droits.notifications && modules.notifications}
            accueil={accueil}
            utilisateur={{
              nom: nomComplet(user),
              role: labelRolesCompte(user.role, user.autresRoles),
              initiales: `${user.prenom[0] ?? ""}${user.nom[0] ?? ""}`.toUpperCase(),
            }}
          />
          <main className={messagerie ? "mx-auto grid min-h-0 w-full max-w-[1440px] flex-1 grid-rows-[minmax(0,1fr)] overflow-hidden px-3 py-3 md:px-5" : "mx-auto w-full max-w-[1240px] flex-1 px-4 py-6 md:px-8 md:py-8"}>
            {lecture && !messagerie ? (
              <p className="mb-5 rounded-2xl border border-ink/10 bg-white px-4 py-3 text-sm text-ink/70">
                {parametres
                  ? "Les montants restent masqués. Les paramètres peuvent être enregistrés."
                  : "Consultation seule. Les montants et les indicateurs sont masqués, et aucune modification ni suppression n'est enregistrée."}
              </p>
            ) : null}
            {children}
          </main>
        </div>
      </div>
    </>
  );
  return (
    <ToastProvider>
      <MasqueChiffres actif={lecture}>
      <RaccourcisBureau accueil={accueil}>
        {user.role === "PARTENAIRE" || !modules.messagerie || !droits.messagerie ? (
          contenu
        ) : (
          <CentreMessages moiId={user.id} moiNom={`${user.prenom} ${user.nom}`} initial={messagesNonLus}>
            {contenu}
          </CentreMessages>
        )}
      </RaccourcisBureau>
      </MasqueChiffres>
    </ToastProvider>
  );
}
