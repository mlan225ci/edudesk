import Link from "next/link";
import { Suspense } from "react";
import { BarreNavigation } from "@/components/barre-navigation";
import { nomComplet } from "@/lib/format";
import { labelRole } from "@/lib/labels";
import { actionsRapides, navigation, ongletsParametres, type SessionUser } from "@/server/permissions";
import { Navigation } from "@/components/navigation";
import { BarreHaute } from "@/components/barre-haute";
import { ToastProvider } from "@/components/toasts";
import { CentreMessages } from "@/components/centre-messages";

export function Shell({
  user,
  nonLues,
  messagesNonLus,
  children,
}: {
  user: SessionUser;
  nonLues: number;
  messagesNonLus: number;
  children: React.ReactNode;
}) {
  const sections = navigation(user.role);
  const accueil = user.role === "PARTENAIRE" ? "/dossiers" : "/tableau-de-bord";
  const contenu = (
    <>
      <Suspense fallback={null}>
        <BarreNavigation />
      </Suspense>
      <div className="flex min-h-screen bg-paper text-ink">
        <aside className="no-print sticky top-0 hidden h-screen w-[248px] shrink-0 flex-col bg-ink md:flex">
          <div className="px-5 pt-6 pb-5">
            <Link href={accueil} className="block w-fit rounded-xl bg-white px-3 py-2 transition hover:shadow-lg hover:shadow-black/20">
              <img src="/logo-edudesk.png" alt="EduDesk" className="h-8 w-auto" />
            </Link>
          </div>
          <div className="flex-1 overflow-y-auto px-3 pb-4 [scrollbar-width:thin]">
            <Navigation sections={sections} />
          </div>
          <div className="mx-3 mb-4 rounded-2xl bg-white/[0.06] p-3.5 text-xs leading-5 text-white/55">
            <p className="font-semibold text-white/85">Astuce</p>
            <p>
              Appuyez sur <kbd className="rounded bg-white/10 px-1 text-white/80">Ctrl K</kbd> pour retrouver un client, un dossier ou une page.
            </p>
          </div>
          <div className="h-1 bg-gradient-to-r from-cap via-edu to-desk" />
        </aside>
        <div className="flex min-w-0 flex-1 flex-col">
          <BarreHaute
            sections={sections}
            parametres={ongletsParametres(user.role)}
            actions={actionsRapides(user.role)}
            nonLues={nonLues}
            messagerie={user.role !== "PARTENAIRE"}
            accueil={accueil}
            utilisateur={{
              nom: nomComplet(user),
              role: labelRole(user.role),
              initiales: `${user.prenom[0] ?? ""}${user.nom[0] ?? ""}`.toUpperCase(),
            }}
          />
          <main className="mx-auto w-full max-w-[1240px] flex-1 px-4 py-6 md:px-8 md:py-8">{children}</main>
        </div>
      </div>
    </>
  );
  return (
    <ToastProvider>
      {user.role === "PARTENAIRE" ? (
        contenu
      ) : (
        <CentreMessages moiId={user.id} initial={messagesNonLus}>
          {contenu}
        </CentreMessages>
      )}
    </ToastProvider>
  );
}
