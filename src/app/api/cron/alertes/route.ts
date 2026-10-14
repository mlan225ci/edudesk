import { executerAutomatisation } from "@/server/automatisation";

export async function GET(request: Request) {
  if (!process.env.CRON_SECRET || request.headers.get("x-cron-secret") !== process.env.CRON_SECRET) {
    return new Response("Non autorise", { status: 401 });
  }
  const resultat = await executerAutomatisation("cron", true);
  return Response.json(resultat ?? { alertes: 0, repris: 0, resultat: "Passage déjà effectué il y a moins de 30 secondes" });
}
