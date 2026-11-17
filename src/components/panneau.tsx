import Link from "next/link";
import { ChevronRight, type LucideIcon } from "lucide-react";

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
