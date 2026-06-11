/**
 * 전화 OTP 인증 — 정적·단위 contract 게이트.
 */
import { spawnSync } from "node:child_process";

const tests = [
  "lib/auth/__tests__/phone-otp-contract.test.ts",
  "lib/auth/__tests__/phone-otp-phone-canonical.test.ts",
  "lib/auth/__tests__/phone-otp-duplicate-check.test.ts",
  "lib/auth/__tests__/phone-otp-client-errors.test.ts",
];

const r = spawnSync("npx", ["vitest", "run", ...tests], {
  stdio: "inherit",
  shell: true,
  cwd: process.cwd(),
});

if (r.status !== 0) {
  process.exit(r.status ?? 1);
}

console.log("verify:phone-otp-contract OK");
