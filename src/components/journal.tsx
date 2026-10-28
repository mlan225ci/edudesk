import Link from "next/link";
import { formatDate } from "@/lib/format";
import type { LigneJournal } from "@/server/historique";

export function Journal({ lignes, vide }: { lignes: LigneJournal[]; vide: string }) {
  if (lignes.length === 0) return <p className="text-sm text-ink/50">{vide}</p>;
  return (
    <ol className="grid">
      {lignes.map((ligne) => (
        <li key={ligne.id} className="grid gap-1 border-b border-ink/[0.05] py-3 text-sm last:border-0 sm:grid-cols-[11rem_minmax(0,1fr)] sm:gap-4">
          <time className="text-xs text-ink/45" suppressHydrationWarning>
            {formatDate(ligne.creeLe)}
          </time>
          <div className="min-w-0">
            <p>
              <span className="font-semibold">{ligne.auteur}</span>
              <span className="text-ink/45"> · {ligne.action}</span>
            </p>
            {ligne.detail ? <p className="mt-0.5 break-words text-ink/70">{ligne.detail}</p> : null}
            {ligne.lien ? (
              <Link href={ligne.lien} className="mt-1 inline-block text-xs font-semibold text-desk hover:underline">
                Ouvrir
              </Link>
            ) : null}
          </div>
        </li>
      ))}
    </ol>
  );
}
