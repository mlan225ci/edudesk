import { demarrerPlanificateur } from "./server/automatisation";

if (process.env.NEXT_PHASE !== "phase-production-build" && process.env.EDUDESK_PLANIFICATEUR !== "0") {
  demarrerPlanificateur();
}
