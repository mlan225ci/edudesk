import { cache } from "react";
import { getUser } from "@/server/session";
import { masqueChiffres } from "@/server/permissions";

export const ETOILES = "••••";

export const sessionMasqueChiffres = cache(async () => {
  const user = await getUser();
  return Boolean(user && masqueChiffres(user));
});
