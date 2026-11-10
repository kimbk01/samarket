/**
 * scripts/vercel-ignored-build-step.mjs — AGENTS.md 개발 프로세스 2번 판정 규칙.
 * 임시 git 저장소를 만들어 스크립트를 실제로 실행하고 exit code(0=SKIP, 1=BUILD)와 로그 1줄을 확인한다.
 * 스크립트를 import 하지 않는다 (tsconfig.test.json 은 scripts/ 를 제외하므로 import 하면 TS6307).
 */
import { afterAll, describe, expect, it } from "vitest";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

const SCRIPT = path.resolve(process.cwd(), "scripts/vercel-ignored-build-step.mjs");
const dirs: string[] = [];

const GIT_ENV = {
  GIT_AUTHOR_NAME: "t",
  GIT_AUTHOR_EMAIL: "t@example.invalid",
  GIT_COMMITTER_NAME: "t",
  GIT_COMMITTER_EMAIL: "t@example.invalid",
  GIT_CONFIG_NOSYSTEM: "1",
  GIT_CONFIG_GLOBAL: "/dev/null",
};

function git(cwd: string, args: string[]): string {
  return execFileSync("git", ["-c", "commit.gpgsign=false", ...args], {
    cwd,
    encoding: "utf8",
    env: { ...process.env, ...GIT_ENV },
    stdio: ["ignore", "pipe", "pipe"],
  }).trim();
}

function tempDir(): string {
  const d = mkdtempSync(path.join(tmpdir(), "ibs-"));
  dirs.push(d);
  return d;
}

function initRepo(): string {
  const d = tempDir();
  git(d, ["init", "-q", "-b", "main"]);
  write(d, { "app/page.tsx": "export default 1;\n" });
  commit(d, "init");
  return d;
}

function write(cwd: string, files: Record<string, string>) {
  for (const [rel, body] of Object.entries(files)) {
    const abs = path.join(cwd, rel);
    mkdirSync(path.dirname(abs), { recursive: true });
    writeFileSync(abs, body);
  }
}

function commit(cwd: string, msg: string, files?: Record<string, string>): string {
  if (files) write(cwd, files);
  git(cwd, ["add", "-A"]);
  git(cwd, ["commit", "-q", "--allow-empty", "-m", msg]);
  return git(cwd, ["rev-parse", "HEAD"]);
}

function run(cwd: string, env: Record<string, string>) {
  const clean = Object.fromEntries(Object.entries(process.env).filter(([k]) => !k.startsWith("VERCEL_")));
  const r = spawnSync(process.execPath, [SCRIPT], {
    cwd,
    encoding: "utf8",
    env: { ...clean, ...GIT_ENV, ...env },
  });
  const lines = r.stdout.split("\n").filter(Boolean);
  return { code: r.status, lines, line: lines[0] ?? "" };
}

afterAll(() => {
  for (const d of dirs) rmSync(d, { recursive: true, force: true });
});

describe("vercel-ignored-build-step (AGENTS 개발 프로세스 2번)", { timeout: 30_000 }, () => {
  it("기준 SHA 가 비어 있으면 BUILD", () => {
    const d = initRepo();
    const r = run(d, {});
    expect(r.code).toBe(1);
    expect(r.line).toContain("reason=base-empty");
  });

  it("기준 SHA = 현재 SHA (재배포·env 변경) 이면 BUILD", () => {
    const d = initRepo();
    const head = git(d, ["rev-parse", "HEAD"]);
    const r = run(d, { VERCEL_GIT_PREVIOUS_SHA: head });
    expect(r.code).toBe(1);
    expect(r.line).toContain("reason=same-sha");
  });

  it("기준 SHA 가 clone 에 없고 fetch 도 안 되면 BUILD (HEAD^ 로 내려가지 않음)", () => {
    const d = initRepo();
    commit(d, "docs", { "docs/a.md": "x" });
    const r = run(d, { VERCEL_GIT_PREVIOUS_SHA: "a".repeat(40) });
    expect(r.code).toBe(1);
    expect(r.line).toContain("reason=base-missing");
  });

  it("기준이 현재의 조상이 아니면 BUILD", () => {
    const d = initRepo();
    git(d, ["checkout", "-q", "-b", "other"]);
    const other = commit(d, "other", { "docs/o.md": "o" });
    git(d, ["checkout", "-q", "main"]);
    commit(d, "docs", { "docs/a.md": "x" });
    const r = run(d, { VERCEL_GIT_PREVIOUS_SHA: other });
    expect(r.code).toBe(1);
    expect(r.line).toContain("reason=not-ancestor");
  });

  it("VERCEL_GIT_COMMIT_SHA 가 checkout HEAD 와 다르면 BUILD", () => {
    const d = initRepo();
    const base = git(d, ["rev-parse", "HEAD"]);
    commit(d, "docs", { "docs/a.md": "x" });
    const r = run(d, { VERCEL_GIT_PREVIOUS_SHA: base, VERCEL_GIT_COMMIT_SHA: "b".repeat(40) });
    expect(r.code).toBe(1);
    expect(r.line).toContain("reason=head-mismatch");
  });

  it.each([
    ["docs/audit/x.md"],
    [".cursor/rules/x.mdc"],
    ["android/app/build.gradle"],
    ["ios/App/App/Info.plist"],
    ["windows/DibayDesktop/App.xaml"],
    ["capacitor-www/local-runtime/index.html"],
    ["scripts/qa/probe.sh"],
    ["AGENTS.md"],
    ["README.md"],
  ])("허용 경로만 바뀌면 SKIP: %s", (file) => {
    const d = initRepo();
    const base = git(d, ["rev-parse", "HEAD"]);
    commit(d, "allow", { [file]: "x" });
    const r = run(d, { VERCEL_GIT_PREVIOUS_SHA: base });
    expect(r.code).toBe(0);
    expect(r.line).toContain("decision=SKIP reason=allowlist-only");
  });

  it.each([
    ["lib/i18n/catalog/x.ts"],
    ["supabase/migrations/20990101000000_x.sql"],
    ["vercel.json"],
    ["next.config.js"],
    ["package.json"],
    ["package-lock.json"],
    ["tsconfig.build.json"],
    [".vercelignore"],
    ["public/robots.txt"],
  ])("항상 BUILD 경로: %s", (file) => {
    const d = initRepo();
    const base = git(d, ["rev-parse", "HEAD"]);
    commit(d, "always", { [file]: "x", "docs/a.md": "x" });
    const r = run(d, { VERCEL_GIT_PREVIOUS_SHA: base });
    expect(r.code).toBe(1);
    expect(r.line).toContain("reason=always-build-path");
  });

  it.each([
    ["lib/foo/README.md"], // 하위 폴더 .md 는 허용 아님 (F4)
    ["lib/foo/__tests__/x.test.ts"], // 테스트 파일도 허용 아님 (F5)
    ["app/notes.txt"], // 확장자로 SKIP 하지 않음 (F4)
    ["scripts/foo.mjs"],
    [".github/workflows/ci.yml"],
  ])("허용 목록 밖이면 BUILD: %s", (file) => {
    const d = initRepo();
    const base = git(d, ["rev-parse", "HEAD"]);
    commit(d, "x", { [file]: "x" });
    const r = run(d, { VERCEL_GIT_PREVIOUS_SHA: base });
    expect(r.code).toBe(1);
    expect(r.line).toContain("reason=runtime-path");
  });

  it("누적 diff: 앞 커밋이 코드, 마지막 커밋이 문서뿐이어도 BUILD (F1)", () => {
    const d = initRepo();
    const base = git(d, ["rev-parse", "HEAD"]);
    commit(d, "code", { "lib/a.ts": "export const a = 1;\n" });
    commit(d, "docs", { "docs/a.md": "x" });
    const r = run(d, { VERCEL_GIT_PREVIOUS_SHA: base });
    expect(r.code).toBe(1);
    expect(r.line).toContain("first=lib/a.ts");
  });

  it("이름 바꾸기 app → docs 는 삭제 경로가 보이므로 BUILD", () => {
    const d = initRepo();
    const base = git(d, ["rev-parse", "HEAD"]);
    mkdirSync(path.join(d, "docs"), { recursive: true });
    renameSync(path.join(d, "app/page.tsx"), path.join(d, "docs/page.tsx"));
    commit(d, "move");
    const r = run(d, { VERCEL_GIT_PREVIOUS_SHA: base });
    expect(r.code).toBe(1);
    expect(r.line).toContain("app/page.tsx");
  });

  it("[vercel build] 토큰은 효력이 없다 (문서만이면 SKIP)", () => {
    const d = initRepo();
    const base = git(d, ["rev-parse", "HEAD"]);
    commit(d, "docs [vercel build]", { "docs/a.md": "x" });
    const r = run(d, { VERCEL_GIT_PREVIOUS_SHA: base, VERCEL_GIT_COMMIT_MESSAGE: "docs [vercel build]" });
    expect(r.code).toBe(0);
  });

  it("빈 커밋 (tree 동일, SHA 다름) 은 SKIP", () => {
    const d = initRepo();
    const base = git(d, ["rev-parse", "HEAD"]);
    commit(d, "empty");
    const r = run(d, { VERCEL_GIT_PREVIOUS_SHA: base });
    expect(r.code).toBe(0);
    expect(r.line).toContain("reason=tree-identical");
  });

  it("얕은 clone 에 기준이 없으면 origin 에서 fetch 한 뒤 판정한다", () => {
    const src = initRepo();
    const base = git(src, ["rev-parse", "HEAD"]);
    commit(src, "code", { "lib/a.ts": "export const a = 1;\n" });
    commit(src, "docs", { "docs/a.md": "x" });
    git(src, ["config", "uploadpack.allowAnySHA1InWant", "true"]);
    const clone = path.join(tempDir(), "c");
    git(path.dirname(clone), ["clone", "-q", "--depth=1", `file://${src}`, clone]);
    expect(() => git(clone, ["cat-file", "-e", `${base}^{commit}`])).toThrow();
    const r = run(clone, { VERCEL_GIT_PREVIOUS_SHA: base });
    expect(r.code).toBe(1);
    expect(r.line).toContain("first=lib/a.ts");
  });

  it("로그는 판정 1줄만 남긴다", () => {
    const d = initRepo();
    const base = git(d, ["rev-parse", "HEAD"]);
    commit(d, "x", { "docs/a.md": "x", "docs/b.md": "y" });
    const r = run(d, { VERCEL_GIT_PREVIOUS_SHA: base });
    expect(r.lines).toHaveLength(1);
    expect(r.line).toMatch(/^\[vercel-ignore-build\] decision=(SKIP|BUILD) reason=\S+ base=\S+ head=\S+ files=\S+/);
  });

  it("windows/ 는 계속 허용 목록에 있다 (dibay-windows-shell-w0 계약과 같은 기준)", () => {
    const d = initRepo();
    const base = git(d, ["rev-parse", "HEAD"]);
    commit(d, "win", { "windows/DibayDesktop/MainWindow.xaml.cs": "x" });
    expect(run(d, { VERCEL_GIT_PREVIOUS_SHA: base }).code).toBe(0);
  });
});
