import { redirect } from "next/navigation";
import { getUser } from "@/server/session";

export default async function Home() {
  const user = await getUser();
  redirect(user?.role === "PARTENAIRE" ? "/dossiers" : user ? "/tableau-de-bord" : "/login");
}
