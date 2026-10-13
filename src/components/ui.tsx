import Link from "next/link";
import type { LucideIcon } from "lucide-react";

export type Ton = "desk" | "edu" | "cap" | "ink" | "mission" | "vert" | "gris";

const BADGES: Record<Ton, string> = {
  desk: "bg-desk/10 text-desk",
  edu: "bg-edu/20 text-[#8a6500]",
  cap: "bg-cap/10 text-cap",
  ink: "bg-ink/10 text-ink",
  mission: "bg-mission/15 text-[#a35a12]",
  vert: "bg-vert/10 text-vert",
  gris: "bg-ink/5 text-ink/60",
};

export function EnTete({
  titre,
  description,
  icone: Icone,
  actions,
  surTitre,
}: {
  titre: string;
  description?: React.ReactNode;
  icone?: LucideIcon;
  actions?: React.ReactNode;
  surTitre?: React.ReactNode;
}) {
  return (
    <header className="flex flex-wrap items-end justify-between gap-4">
      <div className="flex min-w-0 items-start gap-4">
        {Icone ? (
          <span className="hidden h-12 w-12 shrink-0 place-items-center rounded-2xl bg-gradient-to-br from-desk to-ink text-white shadow-lg shadow-desk/20 sm:grid">
            <Icone size={22} strokeWidth={2} />
          </span>
        ) : null}
        <div className="min-w-0">
          {surTitre ? <p className="text-xs font-semibold tracking-wide text-ink/50 uppercase">{surTitre}</p> : null}
          <h1 className="text-2xl font-bold tracking-tight md:text-[28px]">{titre}</h1>
          {description ? <p className="mt-1 max-w-2xl text-sm text-ink/60">{description}</p> : null}
        </div>
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
    </header>
  );
}

export function Badge({ ton = "gris", children, point = false }: { ton?: Ton; children: React.ReactNode; point?: boolean }) {
  return (
    <span className={`badge ${BADGES[ton]}`}>
      {point ? <span className="h-1.5 w-1.5 rounded-full bg-current" /> : null}
      {children}
    </span>
  );
}

export function Vide({
  icone: Icone,
  titre,
  texte,
  action,
}: {
  icone: LucideIcon;
  titre: string;
  texte?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-ink/15 bg-white/60 px-6 py-12 text-center">
      <span className="grid h-14 w-14 place-items-center rounded-2xl bg-paper text-ink/40">
        <Icone size={26} />
      </span>
      <p className="mt-4 font-semibold">{titre}</p>
      {texte ? <p className="mt-1 max-w-sm text-sm text-ink/55">{texte}</p> : null}
      {action ? <div className="mt-5">{action}</div> : null}
    </div>
  );
}

export function Avatar({ prenom, nom, taille = "md" }: { prenom: string; nom: string; taille?: "sm" | "md" | "lg" }) {
  const initiales = `${prenom[0] ?? ""}${nom[0] ?? ""}`.toUpperCase();
  const palette = ["from-desk to-ink", "from-mission to-cap", "from-vert to-desk", "from-edu to-mission", "from-deleg to-desk"];
  const index = (prenom.charCodeAt(0) + (nom.charCodeAt(0) || 0)) % palette.length;
  const dimension = taille === "sm" ? "h-7 w-7 text-[11px]" : taille === "lg" ? "h-14 w-14 text-lg" : "h-9 w-9 text-xs";
  return (
    <span className={`grid shrink-0 place-items-center rounded-full bg-gradient-to-br font-bold text-white ${palette[index]} ${dimension}`}>
      {initiales}
    </span>
  );
}

export function Progression({ valeur, ton = "desk" }: { valeur: number; ton?: "desk" | "vert" | "cap" | "edu" }) {
  const couleur = { desk: "bg-desk", vert: "bg-vert", cap: "bg-cap", edu: "bg-edu" }[ton];
  return (
    <div className="h-2 overflow-hidden rounded-full bg-ink/[0.06]">
      <div className={`h-full origin-left animate-pousse rounded-full ${couleur}`} style={{ width: `${Math.max(0, Math.min(valeur, 100))}%` }} />
    </div>
  );
}

export function Onglets({ onglets, actif }: { onglets: { href: string; label: string; nombre?: number }[]; actif: string }) {
  return (
    <nav className="flex gap-1 overflow-x-auto rounded-2xl bg-ink/[0.04] p-1">
      {onglets.map((onglet) => {
        const estActif = onglet.href === actif;
        return (
          <Link
            key={onglet.href}
            href={onglet.href}
            scroll={false}
            className={`flex items-center gap-2 rounded-xl px-3.5 py-2 text-sm font-semibold whitespace-nowrap transition ${estActif ? "bg-white text-ink shadow-sm" : "text-ink/55 hover:text-ink"}`}
          >
            {onglet.label}
            {onglet.nombre != null ? (
              <span className={`rounded-full px-1.5 text-xs ${estActif ? "bg-desk/10 text-desk" : "bg-ink/5"}`}>{onglet.nombre}</span>
            ) : null}
          </Link>
        );
      })}
    </nav>
  );
}

export function Info({ children }: { children: React.ReactNode }) {
  return <p className="rounded-xl bg-desk/[0.05] px-3.5 py-2.5 text-xs leading-5 text-ink/70">{children}</p>;
}

export function Choix({
  label,
  name,
  options,
  defaut,
  colonnes = 3,
}: {
  label: string;
  name: string;
  options: readonly { value: string; label: string }[];
  defaut?: string;
  colonnes?: 2 | 3 | 4;
}) {
  const grille = { 2: "grid-cols-2", 3: "grid-cols-3", 4: "grid-cols-2 sm:grid-cols-4" }[colonnes];
  return (
    <fieldset className="etiquette">
      <legend className="mb-1.5">{label}</legend>
      <div className={`grid gap-2 ${grille}`}>
        {options.map((option, index) => (
          <label
            key={option.value}
            className="cursor-pointer rounded-xl border border-ink/10 bg-white px-2 py-2.5 text-center text-xs font-semibold text-ink/70 transition hover:border-desk/30 has-checked:border-desk has-checked:bg-desk/[0.06] has-checked:text-desk has-focus-visible:ring-2 has-focus-visible:ring-desk/30"
          >
            <input type="radio" name={name} value={option.value} defaultChecked={defaut ? option.value === defaut : index === 0} className="sr-only" required />
            {option.label}
          </label>
        ))}
      </div>
    </fieldset>
  );
}

export function Champ({ label, aide, children }: { label: string; aide?: string; children: React.ReactNode }) {
  return (
    <label className="etiquette">
      <span>{label}</span>
      {children}
      {aide ? <span className="text-xs font-normal text-ink/50">{aide}</span> : null}
    </label>
  );
}
