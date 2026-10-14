import { redirect } from "next/navigation";

export default async function AncienneFacturePage({ params }: { params: Promise<{ factureId: string }> }) {
  const { factureId } = await params;
  redirect(`/facturation/factures/${factureId}`);
}
