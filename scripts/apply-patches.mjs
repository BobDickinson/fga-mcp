import { createRequire } from "node:module";
import { execSync } from "node:child_process";
import { existsSync, lstatSync, mkdirSync, readFileSync, symlinkSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const packageRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(join(packageRoot, "package.json"));

function resolveFastmcpRoot() {
  try {
    let dir = dirname(require.resolve("fastmcp"));
    while (dir) {
      const pkgPath = join(dir, "package.json");
      if (existsSync(pkgPath)) {
        const pkg = JSON.parse(readFileSync(pkgPath, "utf8"));
        if (pkg.name === "fastmcp") {
          return dir;
        }
      }
      const parent = dirname(dir);
      if (parent === dir) {
        break;
      }
      dir = parent;
    }
  } catch {
    // fall through
  }
  return null;
}

function ensurePatchTarget(fastmcpRoot) {
  const nestedDir = join(packageRoot, "node_modules");
  const nestedFastmcp = join(nestedDir, "fastmcp");

  if (fastmcpRoot === nestedFastmcp) {
    return;
  }

  if (existsSync(nestedFastmcp)) {
    const stat = lstatSync(nestedFastmcp);
    if (stat.isSymbolicLink()) {
      return;
    }
    if (stat.isDirectory()) {
      return;
    }
  }

  mkdirSync(nestedDir, { recursive: true });
  symlinkSync(fastmcpRoot, nestedFastmcp, process.platform === "win32" ? "junction" : "dir");
}

const fastmcpRoot = resolveFastmcpRoot();
if (!fastmcpRoot) {
  console.warn("[fga-mcp] fastmcp not installed; skipping patch");
  process.exit(0);
}

ensurePatchTarget(fastmcpRoot);
const patchPackageCli = require.resolve("patch-package/index.js");
execSync(`node "${patchPackageCli}"`, { cwd: packageRoot, stdio: "inherit" });
