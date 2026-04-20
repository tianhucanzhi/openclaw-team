/**
 * Starts the admin API server, then Vite (dev UI). Press Ctrl+C to stop both.
 */
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const uiAdminRoot = path.resolve(__dirname, "..");
const repoRoot = path.resolve(uiAdminRoot, "..");
const serverEntry = path.join(uiAdminRoot, "server", "index.mjs");

/**
 * pnpm often hoists deps to the repo root; `ui_admin/node_modules/vite` may not exist.
 */
function resolveViteBin() {
  const nested = path.join(uiAdminRoot, "node_modules", "vite", "bin", "vite.js");
  if (existsSync(nested)) {
    return nested;
  }
  const hoisted = path.join(repoRoot, "node_modules", "vite", "bin", "vite.js");
  if (existsSync(hoisted)) {
    return hoisted;
  }
  try {
    const require = createRequire(path.join(uiAdminRoot, "package.json"));
    const viteDir = path.dirname(require.resolve("vite/package.json"));
    const resolved = path.join(viteDir, "bin", "vite.js");
    return existsSync(resolved) ? resolved : null;
  } catch {
    return null;
  }
}

const server = spawn(process.execPath, [serverEntry], {
  stdio: "inherit",
  env: { ...process.env },
});

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

await wait(700);

const viteBin = resolveViteBin();
if (!viteBin) {
  process.stderr.write(
    "[openclaw-ui-admin] Missing Vite. From repo root run: pnpm install (links workspace packages).\n",
  );
  server.kill("SIGTERM");
  process.exit(1);
}

const vite = spawn(process.execPath, [viteBin], {
  cwd: uiAdminRoot,
  stdio: "inherit",
});

function shutdown(signal) {
  try {
    vite.kill(signal);
  } catch {
    /* ignore */
  }
  try {
    server.kill(signal);
  } catch {
    /* ignore */
  }
}

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));

vite.on("exit", (code) => {
  try {
    server.kill("SIGTERM");
  } catch {
    /* ignore */
  }
  process.exit(code ?? 0);
});

server.on("exit", (code) => {
  if (code && code !== 0) {
    try {
      vite.kill("SIGTERM");
    } catch {
      /* ignore */
    }
    process.exit(code);
  }
});
