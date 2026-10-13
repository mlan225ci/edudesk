"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { SectionNavigation } from "@/server/permissions";
import { Icone } from "@/components/icones";

export function Navigation({ sections, auClic }: { sections: SectionNavigation[]; auClic?: () => void }) {
  const pathname = usePathname();
  return (
    <nav className="grid gap-5">
      {sections.map((section) => (
        <div key={section.titre} className="grid gap-0.5">
          <p className="mb-1 px-3 text-[10.5px] font-semibold tracking-[0.12em] text-white/35 uppercase">{section.titre}</p>
          {section.liens.map((lien) => {
            const actif = pathname === lien.href || pathname.startsWith(`${lien.href}/`);
            return (
              <Link
                key={lien.href}
                href={lien.href}
                onClick={auClic}
                className={`group relative flex items-center gap-3 rounded-xl px-3 py-2 text-[13.5px] font-medium transition duration-150 ${
                  actif ? "bg-white/[0.09] text-white" : "text-white/65 hover:bg-white/[0.05] hover:text-white"
                }`}
              >
                {actif ? <span className="absolute top-1/2 left-0 h-5 w-[3px] -translate-y-1/2 rounded-r-full bg-edu" /> : null}
                <Icone nom={lien.icone} size={18} className={actif ? "text-edu" : "text-white/45 transition group-hover:text-white/80"} />
                {lien.label}
              </Link>
            );
          })}
        </div>
      ))}
    </nav>
  );
}
