import { redirect } from "next/navigation";
import { SlidersHorizontal } from "lucide-react";
import { ReglesGestion } from "@/components/regles-gestion";
import { EnTete } from "@/components/ui";
import { peutRegles } from "@/server/permissions";
import { fraisVisaXof, lireRegles } from "@/server/regles";
import { requireUser } from "@/server/session";

export const metadata = { title: "Règles de gestion · Paramètres" };

export default async function ReglesPage() {
  const user = await requireUser();
  if (!peutRegles(user)) redirect("/parametres");
  const [regles, fraisVisa] = await Promise.all([lireRegles(), fraisVisaXof()]);

  return (
    <section className="grid gap-6">
      <EnTete
        surTitre="Paramètres"
        titre="Règles de gestion"
        icone={SlidersHorizontal}
        description="Réservé au directeur et à l'administrateur système. Chaque règle s'applique dès qu'elle est enregistrée."
      />
      <ReglesGestion regles={regles} fraisVisa={fraisVisa} />
    </section>
  );
}
