/**
 * D-4 샘플 매장 70곳 반영 — 진입점. 본문·규칙 설명은 `d4-samples-core.ts`.
 *
 * 실행 (작업 폴더 루트에서):
 *   set -a; source .env.local; set +a
 *   D4_IMAGE_DIR=<이미지 폴더> npx vite-node --config vitest.config.ts scripts/delivery-d4/apply-d4-samples.ts            # dry-run (쓰기 0)
 *   D4_IMAGE_DIR=<이미지 폴더> npx vite-node --config vitest.config.ts scripts/delivery-d4/apply-d4-samples.ts -- --apply --out=d4-apply-result.json
 */
import { runApplyD4 } from "./d4-samples-core";

void runApplyD4();
