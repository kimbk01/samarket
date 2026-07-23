#!/usr/bin/env node
/**
 * Telegram list authority — remount silent / TTL rewrite / dual-write paint 재유입 금지.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const CHECKS = [
  {
    file: "lib/community-messenger/home/use-community-messenger-home-bootstrap.ts",
    forbid: [
      { re: /messenger:stale-resume-silent/, label: "stale-resume-silent remount path" },
      {
        re: /fromRoomReturn && memoryFresh[\s\S]{0,200}refresh\(true\)/,
        label: "room return → refresh(true)",
      },
    ],
    require: [
      { re: /Telegram list authority/, label: "telegram remount lock comment" },
      { re: /if \(memoryFresh\)/, label: "memoryFresh early return" },
    ],
  },
  {
    file: "lib/community-messenger/home-list-patch.ts",
    forbid: [
      {
        re: /dualWriteDomainListProjectionsFromRooms\s*\(/,
        label: "dual-write call from home-list-patch",
      },
    ],
    require: [
      { re: /stripCommerceDomainRowsFromHubLists/, label: "hub domain leak strip" },
      { re: /applyHomeListPatch/, label: "applyHomeListPatch export" },
    ],
  },
  {
    file: "components/community-messenger/domain-shell-canary/DomainTradeListCanaryGate.tsx",
    forbid: [{ re: /isDomainTradeListCanaryCacheFresh/, label: "TTL remount fetch gate" }],
    require: [
      {
        re: /peekDomainTradeListCanaryCache\(syncUid\)/,
        label: "hydrated peek skip fetch",
      },
    ],
  },
  {
    file: "components/community-messenger/domain-shell-canary/DomainStoreOrderCustomerListCanaryGate.tsx",
    forbid: [
      { re: /isDomainStoreOrderCustomerListCanaryCacheFresh/, label: "TTL remount fetch gate" },
    ],
    require: [
      {
        re: /peekDomainStoreOrderCustomerListCanaryCache\(syncUid\)/,
        label: "hydrated peek skip fetch",
      },
    ],
  },
  {
    file: "components/community-messenger/domain-shell-canary/domain-list-canary-hub-prefetch.ts",
    forbid: [{ re: /Always revalidate/, label: "always-revalidate comment" }],
    require: [
      {
        re: /if \(peekDomainTradeListCanaryCache\(uid\)\) return Promise\.resolve\(\)/,
        label: "prefetch miss-only trade",
      },
    ],
  },
  {
    file: "lib/chat-domain/list/dual-write-domain-list-from-rooms.ts",
    require: [
      { re: /QUARANTINED/, label: "dual-write quarantine marker" },
      { re: /MULTI_WRITER_DETECTED/, label: "multi-writer violation log" },
    ],
  },
];

let failed = false;

for (const check of CHECKS) {
  const abs = path.join(ROOT, check.file);
  if (!fs.existsSync(abs)) {
    console.error(`[verify-telegram-list-authority] missing: ${check.file}`);
    failed = true;
    continue;
  }
  const text = fs.readFileSync(abs, "utf8");
  for (const rule of check.forbid || []) {
    if (rule.re.test(text)) {
      console.error(`[verify-telegram-list-authority] FAIL ${check.file}: forbidden ${rule.label}`);
      failed = true;
    }
  }
  for (const rule of check.require || []) {
    if (!rule.re.test(text)) {
      console.error(`[verify-telegram-list-authority] FAIL ${check.file}: missing ${rule.label}`);
      failed = true;
    }
  }
}

if (failed) process.exit(1);
console.log("[verify-telegram-list-authority] OK");
