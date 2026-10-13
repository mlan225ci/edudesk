import { spawnSync, spawn } from "node:child_process";

const env = { ...process.env, NEXT_DIST_DIR: ".next-prod" };
const port = process.env.PORT || "3000";
const next = ["node_modules/next/dist/bin/next"];

if (!process.argv.includes("--sans-build")) {
  const build = spawnSync(process.execPath, [...next, "build"], { stdio: "inherit", env });
  if (build.status !== 0) process.exit(build.status ?? 1);
}

const serveur = spawn(process.execPath, [...next, "start", "-p", port], { stdio: "inherit", env });
serveur.on("exit", (code) => process.exit(code ?? 0));
