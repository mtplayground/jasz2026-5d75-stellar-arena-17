import { cp, mkdir, rm } from "node:fs/promises";
import { resolve } from "node:path";

const projectRoot = resolve(import.meta.dirname, "..");
const sourceDir = resolve(projectRoot, "src/client");
const distDir = resolve(projectRoot, "dist");

await rm(distDir, { recursive: true, force: true });
await mkdir(distDir, { recursive: true });
await cp(sourceDir, distDir, { recursive: true });

console.log("Built browser game shell into dist/");
