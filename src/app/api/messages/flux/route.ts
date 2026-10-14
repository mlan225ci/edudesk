import { prisma } from "@/lib/db";
import { getUser } from "@/server/session";
import { connecter, connectesIci, deconnecter, ecouter, INCLURE_FLUX, versFlux, type EvenementFlux } from "@/server/temps-reel";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const SONDAGE_MS = 4000;
const BATTEMENT_MS = 20000;
const PRESENCE_MS = 45000;

async function presents() {
  const recents = await prisma.user.findMany({
    where: { actif: true, vuLe: { gte: new Date(Date.now() - PRESENCE_MS) } },
    select: { id: true },
  });
  return [...new Set([...connectesIci(), ...recents.map((user) => user.id)])].sort();
}

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
      connecter(user.id);
      await prisma.user.update({ where: { id: user.id }, data: { vuLe: new Date() } }).catch(() => undefined);
      let dernierCompteur = await prisma.message.count({ where: { aId: user.id, lu: false } });
      let dernierePresence = "";

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
        if (evenement.type === "presence" && evenement.userId === user.id) return;
        ecrire(`event: ${evenement.type}\ndata: ${JSON.stringify(evenement)}\n\n`);
      };
      const envoyerPresences = async () => {
        const liste = await presents();
        const signature = liste.join(",");
        if (signature === dernierePresence) return;
        dernierePresence = signature;
        envoyer({ type: "presences", enLigne: liste });
      };

      const desabonner = ecouter(user.id, envoyer);

      // Filet de sécurité quand l'expéditeur est servi par un autre processus (autre serveur, autre instance).
      let enCours = false;
      let tour = 0;
      const sondage = setInterval(async () => {
        if (enCours || !ouvert) return;
        enCours = true;
        tour += 1;
        try {
          const limite = new Date(depuis.getTime() - 15000);
          const [recents, nonLus] = await Promise.all([
            prisma.message.findMany({
              where: { creeLe: { gt: limite }, OR: [{ aId: user.id }, { deId: user.id }] },
              orderBy: { creeLe: "asc" },
              take: 100,
              include: INCLURE_FLUX,
            }),
            prisma.message.count({ where: { aId: user.id, lu: false } }),
          ]);
          for (const message of recents) {
            if (message.creeLe > depuis) depuis = message.creeLe;
            envoyer({ type: "message", message: versFlux(message) });
          }
          if (nonLus !== dernierCompteur) envoyer({ type: "compteur", nonLus });
          if (tour % 5 === 0) {
            await prisma.user.update({ where: { id: user.id }, data: { vuLe: new Date() } });
            await envoyerPresences();
          }
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
        deconnecter(user.id, () => {
          prisma.user.update({ where: { id: user.id }, data: { vuLe: new Date(Date.now() - PRESENCE_MS) } }).catch(() => undefined);
        });
        try {
          controller.close();
        } catch {}
      };
      request.signal.addEventListener("abort", fermer);

      ecrire("retry: 3000\n\n");
      envoyer({ type: "compteur", nonLus: dernierCompteur });
      await envoyerPresences().catch(() => undefined);
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
