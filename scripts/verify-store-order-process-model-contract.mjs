/**
 * 주문 프로세스 단일 원천 — contract vitest + 정책 A 정적 검사.
 */
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";

const chatSvc = readFileSync("lib/community-messenger/store-order-chat-service.ts", "utf8");
if (
  chatSvc.includes('systemChatLineForOrderStatus("arrived"') &&
  chatSvc.includes("appendStoreOrderMessengerStatusTransition")
) {
  console.error(
    "[verify:store-order-process-model-contract] policy A: delivering→completed must not synthesize arrived chat line"
  );
  process.exit(1);
}

const r = spawnSync(
  "npx",
  ["vitest", "run", "lib/stores/__tests__/store-order-process-model-contract.test.ts"],
  { stdio: "inherit", shell: true, cwd: process.cwd() }
);

if (r.status !== 0) {
  process.exit(r.status ?? 1);
}

console.log("verify:store-order-process-model-contract OK");
