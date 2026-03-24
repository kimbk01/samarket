import { randomBytes } from "crypto";

/** URL용 slug: 한글·영문 일부 허용 + 충돌 완화용 짧은 접미사 */
export function makeStoreSlug(storeName: string): string {
  const base = storeName
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9가-힣-]/g, "")
    .slice(0, 48);
  const head = base || "store";
  const suffix = randomBytes(4).toString("hex");
  return `${head}-${suffix}`;
}
