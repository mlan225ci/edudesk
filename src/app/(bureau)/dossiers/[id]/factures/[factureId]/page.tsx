import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, CheckCircle2 } from "lucide-react";
import { prisma } from "@/lib/db";
import { formatJour, xof } from "@/lib/format";
import { labelMode } from "@/lib/labels";
import { BoutonImprimer } from "@/components/bouton-imprimer";
import { requireUser } from "@/server/session";
import { voitFinance } from "@/server/permissions";

export async function generateMetadata({ params }: { params: Promise<{ factureId: string }> }) {
  const { factureId } = await params;
  const facture = await prisma.facture.findUnique({ where: { id: factureId }, select: { numero: true } });
  return { title: facture ? `Facture ${facture.numero}` : "Facture" };
}

export default async function FacturePage({ params }: { params: Promise<{ id: string; factureId: string }> }) {
  const user = await requireUser();
  if (!voitFinance(user.role)) notFound();
  const { id, factureId } = await params;
  const facture = await prisma.facture.findUnique({
    where: { id: factureId },
    include: { paiement: true, dossier: { include: { client: true, procedure: true } } },
  });
  if (!facture || facture.dossierId !== id) notFound();

  return (
    <section className="mx-auto grid w-full max-w-3xl gap-5">
      <div className="no-print flex flex-wrap items-center justify-between gap-3">
        <Link href={`/dossiers/${id}`} className="bouton-fantome -ml-2.5">
          <ArrowLeft size={16} /> Retour au dossier
        </Link>
        <BoutonImprimer />
      </div>

      <article className="carte overflow-hidden p-0 print:border-0 print:shadow-none">
        <header className="flex flex-wrap items-start justify-between gap-6 bg-ink px-10 py-8 text-white">
          <div>
            <img src="/logo-edudesk.png" alt="EduDesk" className="h-12" />
            <p className="mt-3 text-sm text-white/65">Bureau d'éducation à l'international</p>
          </div>
          <div className="text-right">
            <p className="text-xs font-semibold tracking-[0.2em] text-edu uppercase">Facture</p>
            <h1 className="text-2xl font-bold">{facture.numero}</h1>
            <p className="mt-1 text-sm text-white/65">Émise le {formatJour(facture.creeLe)}</p>
          </div>
        </header>

        <div className="grid gap-8 px-10 py-8">
          <div className="grid gap-6 sm:grid-cols-2">
            <div>
              <p className="text-xs font-semibold tracking-wide text-ink/45 uppercase">Facturé à</p>
              <p className="mt-1 text-lg font-semibold">{facture.clientNom}</p>
              <p className="text-sm text-ink/65">{facture.dossier.client.telephone}</p>
              {facture.dossier.client.email ? <p className="text-sm text-ink/65">{facture.dossier.client.email}</p> : null}
            </div>
            <div className="sm:text-right">
              <p className="text-xs font-semibold tracking-wide text-ink/45 uppercase">Dossier</p>
              <p className="mt-1 font-semibold">{facture.dossier.reference}</p>
              <p className="text-sm text-ink/65">{facture.dossier.procedure.nom}</p>
              <p className="text-sm text-ink/65">Paiement {facture.paiement.numero}</p>
            </div>
          </div>

          <table className="w-full text-sm">
            <thead>
              <tr className="border-b-2 border-ink text-left text-xs tracking-wide uppercase">
                <th className="py-2.5">Désignation</th>
                <th>Règlement</th>
                <th className="text-right">Montant</th>
              </tr>
            </thead>
            <tbody>
              <tr className="border-b border-ink/10">
                <td className="py-4 font-medium">{facture.libelle}</td>
                <td className="text-ink/65">{labelMode(facture.paiement.mode)}{facture.paiement.precision ? ` · ${facture.paiement.precision}` : ""}</td>
                <td className="text-right font-semibold tabular-nums">{xof(facture.montant)}</td>
              </tr>
            </tbody>
          </table>

          <div className="ml-auto w-full max-w-xs">
            <div className="flex items-center justify-between rounded-2xl bg-paper px-5 py-4">
              <span className="font-semibold">Total payé</span>
              <span className="text-xl font-bold tabular-nums">{xof(facture.montant)}</span>
            </div>
            <p className="mt-3 flex items-center justify-end gap-1.5 text-sm font-semibold text-vert">
              <CheckCircle2 size={16} /> Acquittée le {formatJour(facture.paiement.dateEncaissement)}
            </p>
          </div>

          <footer className="border-t border-ink/10 pt-5 text-xs text-ink/50">
            Référence du règlement : {facture.paiement.referenceExterne || "—"} · Merci de votre confiance.
          </footer>
        </div>
      </article>
    </section>
  );
}
