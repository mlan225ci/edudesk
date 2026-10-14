import { redirect } from "next/navigation";
import { OngletsParametres } from "@/components/onglets-parametres";
import { ongletsParametres } from "@/server/permissions";
import { requireUser } from "@/server/session";

export default async function ParametresLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  const onglets = ongletsParametres(user.role);
  if (onglets.length === 0) redirect("/missions");
  return (
    <div className="grid gap-6">
      <OngletsParametres onglets={[{ href: "/parametres", label: "Vue d'ensemble", icone: "parametres" }, ...onglets]} />
      {children}
    </div>
  );
}
