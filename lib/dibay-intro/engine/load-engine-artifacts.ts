import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Paths are relative to process.cwd() and must match next.config.js
 * `outputFileTracingIncludes` for the set-live / runtime-pack routes.
 * Do not use `__dirname` here — Next serverless chunks rewrite it away from
 * the traced sibling assets.
 */
export const DIBAY_INTRO_ENGINE_BUNDLE_REL =
  "lib/dibay-intro/engine/runtime-bundle.iife.js" as const;
export const DIBAY_INTRO_PRETENDARD_REL =
  "lib/dibay-intro/engine/assets/PretendardVariable.woff2" as const;

export function readPrebuiltEngineJs(repoRoot = process.cwd()): Buffer {
  return readFileSync(join(repoRoot, DIBAY_INTRO_ENGINE_BUNDLE_REL));
}

export function readPretendardVariableWoff2(repoRoot = process.cwd()): Buffer {
  return readFileSync(join(repoRoot, DIBAY_INTRO_PRETENDARD_REL));
}
