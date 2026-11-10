// @vitest-environment jsdom
/**
 * D 단계 계약 (Owner 「정해진 설계안 순서대로」 2026-11-10):
 * 어드민 전용 문구 묶음(`lib/i18n/admin-catalog.ts`)은 회원 화면 JS 에 싣지 않는다.
 * → 회원 화면 코드(어드민 경로 밖)가 쓰는 문구 키는 모두 회원 묶음(`messages.ts` 가 직접 불러오는 문구 파일)에 있어야 한다.
 * 새 키를 어드민 문구 파일에 넣고 회원 화면에서 쓰면 이 테스트가 실패한다 → `catalog/admin-member-shared.ts` 등 회원 문구 파일로 옮길 것.
 *
 * jsdom(브라우저) 환경이라 `messages.ts` 의 서버 전용 어드민 등록이 실행되지 않는다 = 회원 화면과 같은 문구 표.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { basename, join, relative } from "node:path";
import { describe, expect, it } from "vitest";
import { MESSAGES } from "@/lib/i18n/messages";

const root = process.cwd();

function isAdminPath(rel: string): boolean {
  const b = basename(rel);
  return (
    rel.includes("/admin/") ||
    rel.startsWith("app/admin") ||
    rel.startsWith("app/api/admin") ||
    b.startsWith("admin-") ||
    b.startsWith("admin_") ||
    b.startsWith("Admin")
  );
}

function* walk(dir: string): Generator<string> {
  for (const name of readdirSync(dir)) {
    if (name === "node_modules" || name === "__tests__" || name.startsWith(".")) continue;
    const p = join(dir, name);
    if (statSync(p).isDirectory()) {
      if (p.endsWith(join("lib", "i18n", "catalog"))) continue;
      yield* walk(p);
    } else if (/\.(ts|tsx)$/.test(name) && !/\.(test|spec)\./.test(name)) {
      yield p;
    }
  }
}

describe("D 단계 — 어드민 문구 묶음 분리 계약", () => {
  it("messages.ts 는 어드민 문구 파일을 직접 불러오지 않는다(회원 묶음)", () => {
    const src = readFileSync(join(root, "lib/i18n/messages.ts"), "utf8");
    const staticCatalogs = [...src.matchAll(/^import \{ \w+ \} from "\.\/catalog\/([\w-]+)";/gm)].map((m) => m[1]!);
    const adminNamed = staticCatalogs.filter(
      (f) => (/^(admin|copy-admin)/.test(f) || f.includes("-admin")) && f !== "business-admin-nav" && f !== "admin-member-shared"
    );
    expect(adminNamed).toEqual([]);
    // 어드민 묶음은 서버 전용 분기에서만 불러온다
    expect(src).toMatch(/if \(typeof window === "undefined"\) \{[\s\S]*require\("\.\/admin-catalog"\);/);
  });

  it("회원 화면 브라우저 묶음에 실리는 코드가 쓰는 문구 키는 모두 회원 묶음에 있다 (import 관계 기준)", async () => {
    await import("@/lib/i18n/admin-catalog");
    const allKeys = new Set(Object.keys(MESSAGES.ko as unknown as Record<string, string>));
    // 회원 묶음 = messages.ts 가 직접 불러오는 문구 파일(하위 포함)이 정의한 키
    const memberDefined = new Set<string>();
    const msgSrc = readFileSync(join(root, "lib/i18n/messages.ts"), "utf8");
    for (const m of msgSrc.matchAll(/^import \{ (\w+) \} from "\.\/catalog\/([\w-]+)";/gm)) {
      const mod = (await import(`@/lib/i18n/catalog/${m[2]}`)) as Record<string, { ko: Record<string, string> }>;
      for (const k of Object.keys(mod[m[1]!]!.ko)) memberDefined.add(k);
    }
    // 회원 화면 브라우저 묶음 = 어드민 경로 밖 "use client" 파일에서 import 로 닿는 모든 파일 (파일 이름이 admin 이어도 포함)
    const files: string[] = [];
    for (const top of ["app", "components", "lib", "hooks", "contexts"]) for (const f of walk(join(root, top))) files.push(relative(root, f));
    const fileSet = new Set(files);
    const resolve = (src: string, spec: string): string | null => {
      let base: string;
      if (spec.startsWith("@/")) base = spec.slice(2);
      else if (spec.startsWith(".")) base = join(src, "..", spec).replace(/\\/g, "/");
      else return null;
      for (const c of [`${base}.ts`, `${base}.tsx`, `${base}/index.ts`, `${base}/index.tsx`, base]) if (fileSet.has(c)) return c;
      return null;
    };
    const importRe = /(?:from\s+|import\s*\(\s*|require\(\s*|import\s+)["']([^"']+)["']/g;
    const isClient = (src: string) => /^\s*["']use client["']/.test(src);
    const member = new Set<string>();
    const stack = files.filter((f) => !isAdminPath(f) && !f.startsWith("app/api/") && isClient(readFileSync(join(root, f), "utf8")));
    while (stack.length) {
      const f = stack.pop()!;
      if (member.has(f)) continue;
      member.add(f);
      for (const m of readFileSync(join(root, f), "utf8").matchAll(importRe)) {
        const g = resolve(f, m[1]!);
        if (g && g !== "lib/i18n/admin-catalog.ts" && !member.has(g)) stack.push(g);
      }
    }
    const tok = /["'`]([a-z][a-z0-9_]{2,})["'`]/g;
    const prefixRe = /`([a-z][a-z0-9_]*_)\$\{|["']([a-z][a-z0-9_]*_)["']\s*\+/g;
    const missing = new Map<string, string>();
    const prefixes = new Set<string>();
    for (const f of member) {
      const s = readFileSync(join(root, f), "utf8");
      for (const m of s.matchAll(tok)) {
        const k = m[1]!;
        if (allKeys.has(k) && !memberDefined.has(k) && !missing.has(k)) missing.set(k, f);
      }
      for (const m of s.matchAll(prefixRe)) {
        const p = m[1] ?? m[2];
        if (p && p.length >= 4) prefixes.add(p);
      }
    }
    for (const k of allKeys) {
      if (memberDefined.has(k) || missing.has(k)) continue;
      for (const p of prefixes) if (k.startsWith(p)) missing.set(k, `동적 접두어 ${p}`);
    }
    expect(member.size).toBeGreaterThan(3000);
    expect([...missing.entries()].slice(0, 20)).toEqual([]);
  }, 180_000);
});
