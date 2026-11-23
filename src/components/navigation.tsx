"use client";

import { Suspense } from "react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import type { SectionNavigation } from "@/server/permissions";
import { Icone } from "@/components/icones";

function estActif(pathname: string, archives: boolean, href: string) {
  const url = new URL(href, "http://edudesk.local");
  const lienArchives = url.searchParams.get("archives") === "1";
  const pageArchives = pathname === "/clients" && archives;
  if (lienArchives) return pageArchives;
  if (url.pathname === "/clients" && pageArchives) return false;
  return pathname === url.pathname || pathname.startsWith(`${url.pathname}/`);
}

export function Navigation({ sections, auClic }: { sections: SectionNavigation[]; auClic?: () => void }) {
  return (
    <Suspense fallback={<Menu sections={sections} auClic={auClic} archives={false} />}>
      <MenuActif sections={sections} auClic={auClic} />
    </Suspense>
  );
}

function MenuActif({ sections, auClic }: { sections: SectionNavigation[]; auClic?: () => void }) {
  const pathname = usePathname();
  return <Menu sections={sections} auClic={auClic} pathname={pathname} archives={useSearchParams().get("archives") === "1"} />;
}

function Menu({
  sections,
  auClic,
  pathname,
  archives,
}: {
  sections: SectionNavigation[];
  auClic?: () => void;
  pathname?: string;
  archives: boolean;
}) {
  const chemin = pathname ?? "";
  return (
    <nav className="grid gap-5">
      {sections.map((section) => (
        <div key={section.titre} className="grid gap-0.5">
          <p className="mb-1 px-3 text-[10.5px] font-semibold tracking-[0.12em] text-white/35 uppercase">{section.titre}</p>
          {section.liens.map((lien) => {
            const actif = estActif(chemin, archives, lien.href);
            return (
              <Link
                key={lien.href}
                href={lien.href}
                onClick={auClic}
                className={`group relative flex items-center gap-3 rounded-xl py-2 text-[13.5px] font-medium transition duration-150 ${
                  lien.sous ? "pr-3 pl-8" : "px-3"
                } ${actif ? "bg-white/[0.09] text-white" : "text-white/65 hover:bg-white/[0.05] hover:text-white"}`}
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
