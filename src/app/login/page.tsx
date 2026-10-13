import { BellRing, CheckCircle2, Wallet } from "lucide-react";
import { LoginForm } from "@/components/login-form";

export const metadata = { title: "Connexion" };

const ATOUTS = [
  { icone: CheckCircle2, texte: "Chaque dossier avance étape par étape, avec un responsable et un délai." },
  { icone: BellRing, texte: "Les bonnes personnes sont prévenues par SMS au bon moment." },
  { icone: Wallet, texte: "Caisse, factures, dépenses et comptabilité tenues automatiquement." },
];

export default function LoginPage() {
  return (
    <main className="grid min-h-screen lg:grid-cols-[1.05fr_1fr]">
      <section className="relative hidden overflow-hidden bg-ink px-12 py-12 text-white lg:flex lg:flex-col lg:justify-between">
        <div className="absolute -top-32 -right-32 h-96 w-96 rounded-full bg-desk/40 blur-3xl" />
        <div className="absolute -bottom-40 -left-20 h-96 w-96 rounded-full bg-edu/20 blur-3xl" />
        <span className="relative self-start rounded-2xl bg-white px-4 py-2.5 shadow-lg shadow-black/20">
          <img src="/logo-edudesk.png" alt="EduDesk" className="h-10 w-auto" />
        </span>
        <div className="relative max-w-lg animate-entree">
          <p className="text-sm font-semibold tracking-[0.2em] text-edu uppercase">Bureau d'éducation à l'international</p>
          <h1 className="mt-4 text-[42px] leading-[1.1] font-bold tracking-tight">Tout le bureau, dans un seul outil simple.</h1>
          <ul className="mt-8 grid gap-4 entree-cascade">
            {ATOUTS.map(({ icone: Icone, texte }) => (
              <li key={texte} className="flex items-start gap-3 text-white/80">
                <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-white/10 text-edu">
                  <Icone size={18} />
                </span>
                <span className="pt-1.5">{texte}</span>
              </li>
            ))}
          </ul>
        </div>
        <p className="relative text-sm text-white/45">Irlande · Canada · France · Résidence permanente</p>
      </section>
      <section className="flex items-center bg-paper px-6 py-12">
        <div className="mx-auto w-full max-w-md animate-entree">
          <img src="/logo-edudesk.png" alt="EduDesk" className="mb-8 h-11 w-auto lg:hidden" />
          <h2 className="text-3xl font-bold tracking-tight">Bon retour</h2>
          <p className="mt-1.5 mb-8 text-ink/60">Connectez-vous à votre espace EduDesk.</p>
          <div className="rounded-3xl border border-ink/[0.06] bg-card p-7 shadow-[0_1px_2px_rgba(20,40,75,0.04),0_20px_50px_-24px_rgba(20,40,75,0.25)]">
            <LoginForm />
          </div>
        </div>
      </section>
    </main>
  );
}
