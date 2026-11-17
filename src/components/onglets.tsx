import { ETOILES, sessionMasqueChiffres } from "@/server/voile";
import { Onglets as Presentation } from "@/components/ui";

export async function Onglets({
  onglets,
  actif,
}: {
  onglets: { href: string; label: string; nombre?: number }[];
  actif: string;
}) {
  const masquer = await sessionMasqueChiffres();
  return (
    <Presentation
      actif={actif}
      onglets={onglets.map((onglet) => ({
        ...onglet,
        nombre: masquer && onglet.nombre != null ? ETOILES : onglet.nombre,
      }))}
    />
  );
}
