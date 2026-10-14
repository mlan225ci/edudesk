"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { Lien } from "@/server/permissions";
import { Icone } from "@/components/icones";

export function OngletsParametres({ onglets }: { onglets: Lien[] }) {
  const pathname = usePathname();
  return (
    <nav className="no-print flex gap-1 overflow-x-auto rounded-2xl bg-ink/[0.04] p-1">
      {onglets.map((onglet) => {
        const actif = onglet.href === "/parametres" ? pathname === onglet.href : pathname === onglet.href || pathname.startsWith(`${onglet.href}/`);
        return (
          <Link
            key={onglet.href}
            href={onglet.href}
            className={`flex items-center gap-2 rounded-xl px-3.5 py-2 text-sm font-semibold whitespace-nowrap transition ${
              actif ? "bg-white text-ink shadow-sm" : "text-ink/55 hover:text-ink"
            }`}
          >
            <Icone nom={onglet.icone} size={15} className={actif ? "text-desk" : "text-ink/35"} />
            {onglet.label}
          </Link>
        );
      })}
    </nav>
  );
}
