/**
 * .env.local 의 NEXT_PUBLIC_SUPABASE_URL 호스트가 DNS에서 풀리는지 확인.
 * 터미널 로그의 getaddrinfo ENOTFOUND 를 조사할 때 사용.
 */
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { lookup } from "node:dns/promises";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const envPath = join(root, ".env.local");

if (!existsSync(envPath)) {
  console.error("[check-supabase-dns] .env.local 파일이 없습니다.");
  process.exit(1);
}

let supabaseUrl = "";
for (const line of readFileSync(envPath, "utf8").split("\n")) {
  const t = line.trim();
  if (!t || t.startsWith("#")) continue;
  const m = t.match(/^NEXT_PUBLIC_SUPABASE_URL\s*=\s*(.*)$/);
  if (m) supabaseUrl = m[1].trim().replace(/^["']|["']$/g, "");
}

if (!supabaseUrl) {
  console.error("[check-supabase-dns] NEXT_PUBLIC_SUPABASE_URL 이 .env.local 에 없습니다.");
  process.exit(1);
}

let hostname;
try {
  hostname = new URL(supabaseUrl).hostname;
} catch {
  console.error("[check-supabase-dns] URL 파싱 실패:", supabaseUrl);
  process.exit(1);
}

console.log("[check-supabase-dns] NEXT_PUBLIC_SUPABASE_URL 호스트:", hostname);

try {
  await lookup(hostname);
  console.log("[check-supabase-dns] DNS 조회: 성공 (호스트가 존재합니다)");
} catch (e) {
  const msg = e instanceof Error ? e.message : String(e);
  console.error("[check-supabase-dns] DNS 조회 실패:", msg);
  console.error(
    "→ Supabase 대시보드 → Project Settings → API → Project URL 을 복사해 .env.local 에 다시 넣으세요."
  );
  console.error("→ 프로젝트를 삭제했거나 다른 조직으로 옮겼다면 새 URL로 교체해야 합니다.");
  process.exit(1);
}
