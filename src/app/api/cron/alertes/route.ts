import { scannerAlertes } from "@/server/engine";

export async function GET(request: Request) {
  if (request.headers.get("x-cron-secret") !== process.env.CRON_SECRET) {
    return new Response("Non autorise", { status: 401 });
  }
  const resultat = await scannerAlertes();
  return Response.json(resultat);
}
