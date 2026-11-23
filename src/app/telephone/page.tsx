import type { Metadata } from "next";

export const metadata: Metadata = { title: "Ordinateur requis" };

export default function TelephonePage() {
  return (
    <main className="grid min-h-dvh place-items-center bg-paper px-6 py-16 text-ink">
      <section className="w-full max-w-md rounded-3xl bg-white px-6 py-10 text-center shadow-[0_24px_60px_-36px_rgba(20,40,75,0.45)]">
        <div className="relative mx-auto grid h-32 w-32 place-items-center" aria-hidden>
          <span className="absolute inset-3 rounded-full bg-cap/15 animate-interdit-halo" />
          <svg viewBox="0 0 80 80" className="relative h-28 w-28 drop-shadow-[0_12px_24px_rgba(200,29,37,0.18)]">
            <circle cx="40" cy="40" r="28" className="fill-white" />
            <circle
              cx="40"
              cy="40"
              r="28"
              fill="none"
              stroke="#c81d25"
              strokeWidth="6"
              strokeLinecap="round"
              strokeDasharray="176"
              className="animate-interdit-cercle"
            />
            <path
              d="M24 56 L56 24"
              fill="none"
              stroke="#c81d25"
              strokeWidth="6"
              strokeLinecap="round"
              strokeDasharray="46"
              className="animate-interdit-barre"
            />
          </svg>
        </div>
        <p className="mt-2 text-xs font-semibold tracking-[0.18em] text-desk uppercase">EduDesk</p>
        <h1 className="mt-3 text-2xl font-bold">L&apos;ERP s&apos;ouvre sur un ordinateur</h1>
        <p className="mt-3 text-sm leading-6 text-ink/70">
          Le bureau EduDesk n&apos;est pas accessible depuis un téléphone. Ouvrez <span className="font-semibold">erpedudesk.com</span> sur un ordinateur pour vous connecter.
        </p>
      </section>
    </main>
  );
}
