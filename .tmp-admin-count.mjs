import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const root = "c:/samarket/components/admin";
const done = new Set([
  "audit", "app", "ads", "automation", "backup", "banners", "users", "stores",
  "settings", "trade", "trade-flow", "trade-post-ads", "trade-ad-policies",
  "system", "usage", "delivery-orders", "products", "order-notifications",
  "community", "philife", "dashboard", "sidebar", "docs", "reports", "chats",
  "ad-products",
]);

const dirs = fs.readdirSync(root, { withFileTypes: true }).filter((d) => d.isDirectory());
const counts = [];
for (const d of dirs) {
  if (done.has(d.name)) continue;
  const p = path.join(root, d.name);
  try {
    execSync(`node scripts/check-hardcoded-korean.mjs "${p.replace(/\\/g, "/")}"`, {
      cwd: "c:/samarket",
      stdio: "pipe",
    });
    counts.push({ name: d.name, n: 0 });
  } catch (e) {
    const err = String(e.stderr ?? e.stdout ?? "");
    const m = err.match(/(\d+) possible/);
    counts.push({ name: d.name, n: m ? Number(m[1]) : 999 });
  }
}
counts.sort((a, b) => b.n - a.n);
console.log(counts.slice(0, 30).map((c) => `${c.n}\t${c.name}`).join("\n"));
