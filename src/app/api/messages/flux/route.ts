import { prisma } from "@/lib/db";
import { getUser } from "@/server/session";
import { ecouter, versFlux, type EvenementFlux } from "@/server/temps-reel";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const SONDAGE_MS = 4000;
const BATTEMENT_MS = 20000;

export async function GET(request: Request) {
  const user = await getUser();
  if (!user || user.role === "PARTENAIRE") return new Response("Non autorise", { status: 401 });

  const encodeur = new TextEncoder();
  let fermer = () => {};

  const flux = new ReadableStream<Uint8Array>({
    async start(controller) {
      let ouvert = true;
      const vus = new Set<string>();
      let depuis = new Date();
      let dernierCompteur = await prisma.message.count({ where: { aId: user.id, lu: false } });

      const ecrire = (texte: string) => {
        if (!ouvert) return;
        try {
          controller.enqueue(encodeur.encode(texte));
        } catch {
          fermer();
        }
      };
      const envoyer = (evenement: EvenementFlux) => {
        if (evenement.type === "message") {
          if (vus.has(evenement.message.id)) return;
          vus.add(evenement.message.id);
          if (vus.size > 500) vus.delete(vus.values().next().value as string);
        }
        if (evenement.type === "compteur") dernierCompteur = evenement.nonLus;
        ecrire(`event: ${evenement.type}\ndata: ${JSON.stringify(evenement)}\n\n`);
      };

      const desabonner = ecouter(user.id, envoyer);

      // Filet de sécurité quand l'expéditeur est servi par un autre processus (autre serveur, autre instance).
      let enCours = false;
      const sondage = setInterval(async () => {
        if (enCours || !ouvert) return;
        enCours = true;
        try {
          const limite = new Date(depuis.getTime() - 15000);
          const [recents, nonLus] = await Promise.all([
            prisma.message.findMany({
              where: { creeLe: { gt: limite }, OR: [{ aId: user.id }, { deId: user.id }] },
              orderBy: { creeLe: "asc" },
              take: 100,
              include: { de: { select: { prenom: true, nom: true } } },
            }),
            prisma.message.count({ where: { aId: user.id, lu: false } }),
          ]);
          for (const message of recents) {
            if (message.creeLe > depuis) depuis = message.creeLe;
            envoyer({ type: "message", message: versFlux(message) });
          }
          if (nonLus !== dernierCompteur) envoyer({ type: "compteur", nonLus });
        } catch {
          // base momentanément indisponible : on retentera au prochain passage
        } finally {
          enCours = false;
        }
      }, SONDAGE_MS);

      const battement = setInterval(() => ecrire(": ping\n\n"), BATTEMENT_MS);

      fermer = () => {
        if (!ouvert) return;
        ouvert = false;
        desabonner();
        clearInterval(sondage);
        clearInterval(battement);
        try {
          controller.close();
        } catch {}
      };
      request.signal.addEventListener("abort", fermer);

      ecrire("retry: 3000\n\n");
      envoyer({ type: "compteur", nonLus: dernierCompteur });
    },
    cancel() {
      fermer();
    },
  });

  return new Response(flux, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
