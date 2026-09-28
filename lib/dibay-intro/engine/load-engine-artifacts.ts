import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Sibling-relative reads so Vercel NFT traces the prebuilt IIFE + Pretendard
 * into the set-live serverless function (no `process.cwd()` / node_modules walk).
 */
export function readPrebuiltEngineJs(): Buffer {
  return readFileSync(join(__dirname, "runtime-bundle.iife.js"));
}

export function readPretendardVariableWoff2(): Buffer {
  return readFileSync(join(__dirname, "assets", "PretendardVariable.woff2"));
}
