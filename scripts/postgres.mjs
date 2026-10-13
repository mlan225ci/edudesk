import EmbeddedPostgres from "embedded-postgres";
import { mkdir } from "node:fs/promises";

const port = 5432;
const pg = new EmbeddedPostgres({
  databaseDir: "./data/pg",
  user: "edudesk",
  password: "edudesk",
  port,
  persistent: true,
  initdbFlags: ["--encoding=UTF8", "--locale=C"],
});

await mkdir("./data", { recursive: true });

try {
  await pg.initialise();
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  if (!/already|exists|init/i.test(message)) throw error;
}

await pg.start();

try {
  await pg.createDatabase("edudesk");
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  if (!/already exists|duplicate/i.test(message)) throw error;
}

console.log(`PostgreSQL EduDesk pret sur 127.0.0.1:${port}, base edudesk`);

const stop = async () => {
  await pg.stop();
  process.exit(0);
};

process.on("SIGINT", stop);
process.on("SIGTERM", stop);
