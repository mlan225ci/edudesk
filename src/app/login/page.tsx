import { CodeConnexion } from "@/components/code-connexion";
import { LoginForm } from "@/components/login-form";
import { prisma } from "@/lib/db";
import { masquerEmail } from "@/server/deux-facteurs";
import { lireAttenteCode } from "@/server/session";

export const metadata = {
  title: "Connexion",
  description:
    "Connexion du personnel du bureau EduDesk, à Abidjan. Les familles suivent leur dossier sur la page Suivi, avec le code reçu par e-mail.",
};

export default async function LoginPage() {
  const attente = await lireAttenteCode();
  const compte = attente ? await prisma.user.findUnique({ where: { id: attente.userId }, select: { email: true, actif: true } }) : null;
  const emailMasque = compte?.actif ? masquerEmail(compte.email) : null;

  return (
    <main className="relative flex min-h-screen items-center justify-center overflow-hidden bg-paper px-6 py-16">
      <div
        className="pointer-events-none absolute inset-0 opacity-30"
        style={{ backgroundImage: "url(/motif-etudes.svg)", backgroundSize: "360px 360px" }}
        aria-hidden
      />
      <div className="pointer-events-none absolute -top-40 left-1/2 h-[420px] w-[420px] -translate-x-1/2 rounded-full bg-desk/[0.07] blur-3xl" />
      <div className="pointer-events-none absolute -bottom-32 left-1/2 h-72 w-72 -translate-x-1/2 rounded-full bg-edu/10 blur-3xl" />
      <div className="relative w-full max-w-[400px] animate-entree">
        <img src="/logo-edudesk.png" alt="EduDesk" className="mx-auto mb-10 h-16 w-auto" />
        <div className="rounded-[28px] border border-white/80 bg-white px-7 py-8 shadow-[0_1px_1px_rgba(20,40,75,0.04),0_30px_70px_-36px_rgba(20,40,75,0.45)]">
          {emailMasque ? <CodeConnexion email={emailMasque} /> : <LoginForm demonstration={process.env.NODE_ENV !== "production"} />}
        </div>
      </div>
    </main>
  );
}
