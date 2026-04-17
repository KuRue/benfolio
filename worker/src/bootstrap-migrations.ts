import { spawn } from "node:child_process";
import { once } from "node:events";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

// Resolve the monorepo root from wherever this module ends up at runtime. We
// walk upward looking for prisma.config.ts — works for:
//   • tsx watch (worker/src/bootstrap-migrations.ts)
//   • compiled worker (worker/dist/worker/src/bootstrap-migrations.js)
//   • docker image (/workspace/worker/dist/worker/src/bootstrap-migrations.js)
function resolveRepoRoot(): string {
  const here = path.dirname(fileURLToPath(import.meta.url));
  let current = here;
  for (let i = 0; i < 8; i += 1) {
    if (fs.existsSync(path.join(current, "prisma.config.ts"))) {
      return current;
    }
    const parent = path.dirname(current);
    if (parent === current) {
      break;
    }
    current = parent;
  }
  throw new Error(
    `Could not locate prisma.config.ts walking up from ${here}. ` +
      "Ensure the prisma/ directory and prisma.config.ts are bundled with the worker image.",
  );
}

function resolvePrismaBin(repoRoot: string): string {
  const binName = process.platform === "win32" ? "prisma.cmd" : "prisma";
  const binPath = path.join(repoRoot, "node_modules", ".bin", binName);
  if (!fs.existsSync(binPath)) {
    throw new Error(
      `Prisma CLI not found at ${binPath}. ` +
        "Install prisma as a runtime dependency so auto-migration works at boot.",
    );
  }
  return binPath;
}

export async function applyPendingMigrations(): Promise<void> {
  // Escape hatch: skip the subprocess when an operator wants to manage
  // migrations themselves (e.g. blue/green, multi-replica with external lock).
  if (process.env.SKIP_AUTO_MIGRATE === "1") {
    console.log("[migrations] SKIP_AUTO_MIGRATE=1 — skipping prisma migrate deploy");
    return;
  }

  const repoRoot = resolveRepoRoot();
  const prismaBin = resolvePrismaBin(repoRoot);

  console.log(`[migrations] applying pending migrations (cwd=${repoRoot})`);
  const startedAt = Date.now();

  const child = spawn(
    prismaBin,
    ["migrate", "deploy", "--config", "./prisma.config.ts"],
    {
      cwd: repoRoot,
      stdio: "inherit",
      // Pass through env so DATABASE_URL is visible to the CLI. `prisma migrate
      // deploy` takes a Postgres advisory lock, so running it concurrently with
      // the web app's bootstrap is safe — the second caller just waits.
      env: process.env,
    },
  );

  const [code, signal] = (await once(child, "exit")) as [
    number | null,
    NodeJS.Signals | null,
  ];

  if (signal) {
    throw new Error(`prisma migrate deploy terminated by signal ${signal}`);
  }
  if (code !== 0) {
    throw new Error(`prisma migrate deploy exited with status ${code}`);
  }

  const ms = Date.now() - startedAt;
  console.log(`[migrations] schema is up to date (${ms} ms)`);
}
