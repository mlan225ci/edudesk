import Link from "next/link";
import { ArrowDownRight, ArrowUpRight, ChevronRight, type LucideIcon } from "lucide-react";
import { xofCourt } from "@/lib/format";
import { Compteur, type FormatCompteur } from "@/components/compteur";

type Ton = "desk" | "edu" | "cap" | "ink" | "mission" | "vert";

const COULEURS: Record<Ton, string> = {
  desk: "#1f4f99",
  edu: "#f2b705",
  cap: "#c81d25",
  ink: "#14284b",
  mission: "#e8872a",
  vert: "#1f8a5b",
};

const FONDS: Record<Ton, string> = {
  desk: "bg-desk/10 text-desk",
  edu: "bg-edu/20 text-[#8a6500]",
  cap: "bg-cap/10 text-cap",
  ink: "bg-ink/[0.07] text-ink",
  mission: "bg-mission/15 text-[#a35a12]",
  vert: "bg-vert/10 text-vert",
};

export function Kpi({
  titre,
  valeur,
  format = "nombre",
  detail,
  evolution,
  inverse = false,
  ton = "ink",
  href,
  icone: Icone,
}: {
  titre: string;
  valeur: number | string;
  format?: FormatCompteur;
  detail?: string;
  evolution?: number | null;
  inverse?: boolean;
  ton?: Ton;
  href?: string;
  icone?: LucideIcon;
}) {
  const positif = evolution != null && (inverse ? evolution < 0 : evolution > 0);
  const negatif = evolution != null && (inverse ? evolution > 0 : evolution < 0);
  const contenu = (
    <>
      <div className="flex items-start justify-between gap-2">
        <p className="text-[13px] font-medium text-ink/55">{titre}</p>
        {Icone ? (
          <span className={`grid h-9 w-9 shrink-0 place-items-center rounded-xl ${FONDS[ton]}`}>
            <Icone size={18} />
          </span>
        ) : null}
      </div>
      <p className="mt-1 text-[22px] leading-tight font-bold tracking-tight" style={{ color: ton === "ink" || ton === "edu" ? undefined : COULEURS[ton] }}>
        {typeof valeur === "number" ? <Compteur valeur={valeur} format={format} /> : valeur}
      </p>
      <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-ink/50">
        {evolution != null ? (
          <span
            className={`inline-flex items-center gap-0.5 rounded-full px-2 py-0.5 font-semibold ${positif ? "bg-vert/10 text-vert" : negatif ? "bg-cap/10 text-cap" : "bg-ink/5 text-ink/60"}`}
          >
            {evolution > 0 ? <ArrowUpRight size={13} /> : evolution < 0 ? <ArrowDownRight size={13} /> : null}
            {Math.abs(evolution)} %
          </span>
        ) : null}
        {detail ? <span>{detail}</span> : null}
      </div>
    </>
  );
  return href ? (
    <Link href={href} className="carte carte-lien block">
      {contenu}
    </Link>
  ) : (
    <article className="carte">{contenu}</article>
  );
}

export function BarresMensuelles({
  mois,
  series,
}: {
  mois: { cle: string; label: string }[];
  series: { nom: string; ton: Ton; valeurs: Map<string, number> }[];
}) {
  const largeur = 720;
  const hauteur = 230;
  const marge = { haut: 12, bas: 28, gauche: 48, droite: 8 };
  const max = Math.max(1, ...series.flatMap((serie) => mois.map((item) => serie.valeurs.get(item.cle) ?? 0)));
  const echelle = niceMax(max);
  const zoneL = largeur - marge.gauche - marge.droite;
  const zoneH = hauteur - marge.haut - marge.bas;
  const pas = zoneL / mois.length;
  const barre = Math.min(20, (pas - 10) / series.length);
  const graduations = [0, 0.25, 0.5, 0.75, 1];

  return (
    <div>
      <svg viewBox={`0 0 ${largeur} ${hauteur}`} className="h-auto w-full" role="img">
        {graduations.map((ratio) => {
          const y = marge.haut + zoneH * (1 - ratio);
          return (
            <g key={ratio}>
              <line x1={marge.gauche} x2={largeur - marge.droite} y1={y} y2={y} stroke="#14284b" strokeOpacity={0.06} strokeDasharray={ratio ? "3 4" : undefined} />
              <text x={marge.gauche - 8} y={y + 4} textAnchor="end" fontSize={10} fill="#14284b" fillOpacity={0.45}>
                {xofCourt(echelle * ratio)}
              </text>
            </g>
          );
        })}
        {mois.map((item, index) => {
          const x0 = marge.gauche + index * pas + (pas - barre * series.length) / 2;
          return (
            <g key={item.cle}>
              {series.map((serie, rang) => {
                const valeur = serie.valeurs.get(item.cle) ?? 0;
                const h = (valeur / echelle) * zoneH;
                return (
                  <rect
                    key={serie.nom}
                    x={x0 + rang * barre}
                    y={marge.haut + zoneH - h}
                    width={Math.max(barre - 3, 2)}
                    height={Math.max(h, valeur > 0 ? 1 : 0)}
                    rx={4}
                    fill={COULEURS[serie.ton]}
                    className="animate-monte transition-opacity hover:opacity-80"
                    style={{ transformBox: "fill-box", transformOrigin: "bottom", animationDelay: `${index * 35}ms` }}
                  >
                    <title>{`${serie.nom} · ${item.label} · ${valeur.toLocaleString("fr-FR")}`}</title>
                  </rect>
                );
              })}
              <text x={marge.gauche + index * pas + pas / 2} y={hauteur - 8} textAnchor="middle" fontSize={10} fill="#14284b" fillOpacity={0.5}>
                {item.label}
              </text>
            </g>
          );
        })}
      </svg>
      <Legende elements={series.map((serie) => ({ nom: serie.nom, ton: serie.ton }))} />
    </div>
  );
}

export function BarresHorizontales({
  donnees,
  ton = "desk",
  format = "nombre",
  vide = "Aucune donnée.",
}: {
  donnees: { label: string; valeur: number; href?: string; ton?: Ton }[];
  ton?: Ton;
  format?: "nombre" | "xof";
  vide?: string;
}) {
  const max = Math.max(1, ...donnees.map((ligne) => Math.abs(ligne.valeur)));
  const afficher = (valeur: number) => (format === "xof" ? `${valeur.toLocaleString("fr-FR")} F CFA` : valeur.toLocaleString("fr-FR"));
  if (donnees.length === 0) return <p className="py-4 text-center text-sm text-ink/45">{vide}</p>;
  return (
    <ul className="grid gap-3">
      {donnees.map((ligne, index) => {
        const contenu = (
          <>
            <div className="flex justify-between gap-3 text-sm">
              <span className="truncate text-ink/75">{ligne.label}</span>
              <span className="shrink-0 font-semibold tabular-nums">{afficher(ligne.valeur)}</span>
            </div>
            <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-ink/[0.05]">
              <div
                className="h-full origin-left animate-pousse rounded-full"
                style={{
                  width: `${Math.max((Math.abs(ligne.valeur) / max) * 100, ligne.valeur !== 0 ? 2 : 0)}%`,
                  background: ligne.valeur < 0 ? COULEURS.cap : COULEURS[ligne.ton ?? ton],
                  animationDelay: `${index * 50}ms`,
                }}
              />
            </div>
          </>
        );
        return (
          <li key={ligne.label}>
            {ligne.href ? (
              <Link href={ligne.href} className="block rounded-lg transition hover:opacity-75">
                {contenu}
              </Link>
            ) : (
              contenu
            )}
          </li>
        );
      })}
    </ul>
  );
}

export function Anneau({
  segments,
  centre,
  sousTitre,
}: {
  segments: { label: string; valeur: number; ton: Ton; href?: string }[];
  centre: string;
  sousTitre?: string;
}) {
  const total = segments.reduce((somme, segment) => somme + segment.valeur, 0);
  const rayon = 54;
  const circonference = 2 * Math.PI * rayon;
  let cumul = 0;
  return (
    <div className="flex flex-wrap items-center gap-6">
      <svg viewBox="0 0 140 140" className="h-36 w-36 shrink-0 animate-zoom">
        <g transform="rotate(-90 70 70)">
          <circle cx={70} cy={70} r={rayon} fill="none" stroke="#14284b" strokeOpacity={0.05} strokeWidth={16} />
          {total > 0
            ? segments.map((segment) => {
                const longueur = (segment.valeur / total) * circonference;
                const element = (
                  <circle
                    key={segment.label}
                    cx={70}
                    cy={70}
                    r={rayon}
                    fill="none"
                    stroke={COULEURS[segment.ton]}
                    strokeWidth={16}
                    strokeDasharray={`${Math.max(longueur - 1.5, 0)} ${circonference - Math.max(longueur - 1.5, 0)}`}
                    strokeDashoffset={-cumul}
                  >
                    <title>{`${segment.label} · ${segment.valeur}`}</title>
                  </circle>
                );
                cumul += longueur;
                return element;
              })
            : null}
        </g>
        <text x={70} y={sousTitre ? 72 : 78} textAnchor="middle" fontSize={26} fontWeight={700} fill="#14284b">
          {centre}
        </text>
        {sousTitre ? (
          <text x={70} y={90} textAnchor="middle" fontSize={10} fill="#14284b" fillOpacity={0.5}>
            {sousTitre}
          </text>
        ) : null}
      </svg>
      <ul className="grid min-w-40 flex-1 gap-2 text-sm">
        {segments
          .filter((segment) => segment.valeur > 0)
          .map((segment) => (
            <li key={segment.label}>
              <Link href={segment.href ?? "#"} className="flex items-center justify-between gap-3 rounded-lg px-1 transition hover:bg-paper">
                <span className="flex items-center gap-2 text-ink/75">
                  <span className="h-2.5 w-2.5 rounded-full" style={{ background: COULEURS[segment.ton] }} />
                  {segment.label}
                </span>
                <span className="font-semibold tabular-nums">{segment.valeur}</span>
              </Link>
            </li>
          ))}
        {total === 0 ? <li className="text-ink/45">Aucun dossier.</li> : null}
      </ul>
    </div>
  );
}

export function Legende({ elements }: { elements: { nom: string; ton: Ton }[] }) {
  return (
    <div className="mt-3 flex flex-wrap gap-4 text-xs text-ink/60">
      {elements.map((element) => (
        <span key={element.nom} className="flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-[4px]" style={{ background: COULEURS[element.ton] }} />
          {element.nom}
        </span>
      ))}
    </div>
  );
}

export function Panneau({
  titre,
  action,
  children,
  className = "",
  icone: Icone,
}: {
  titre: string;
  action?: { href: string; label: string } | React.ReactElement | null;
  children: React.ReactNode;
  className?: string;
  icone?: LucideIcon;
}) {
  return (
    <article className={`carte ${className}`}>
      <div className="mb-5 flex items-center justify-between gap-3">
        <h2 className="flex items-center gap-2 font-semibold">
          {Icone ? <Icone size={18} className="text-ink/40" /> : null}
          {titre}
        </h2>
        {action && "href" in action && "label" in action ? (
          <Link href={action.href} className="group inline-flex items-center gap-0.5 text-xs font-semibold text-desk">
            {action.label}
            <ChevronRight size={14} className="transition group-hover:translate-x-0.5" />
          </Link>
        ) : (
          action
        )}
      </div>
      {children}
    </article>
  );
}

function niceMax(valeur: number) {
  const puissance = 10 ** Math.floor(Math.log10(valeur));
  const ratio = valeur / puissance;
  const pas = ratio <= 1 ? 1 : ratio <= 2 ? 2 : ratio <= 2.5 ? 2.5 : ratio <= 5 ? 5 : 10;
  return pas * puissance;
}
