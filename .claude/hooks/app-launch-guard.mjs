#!/usr/bin/env node
/**
 * Owner 규정 강제 — 「실기기 반복 실행 시험 상한」(AGENTS.md · Owner 2026-11-18) — PreToolUse(Bash · iOS 시뮬레이터 launch).
 *
 * 실기기·시뮬레이터 시험은 운영 Supabase 를 쓴다. 앱 처음 실행 1회 ≈ 운영 Supabase 약 195건
 * (docs/audit/supabase-request-surge-2026-11-18/root-cause-design.md §3).
 *
 * 1) DIBAY 앱 실행 명령(adb `monkey -p com.dibay.app` · `am start … com.dibay.app` · `xcrun simctl launch … com.dibay.app`
 *    · 시뮬레이터 도구 launch)을 세션별로 센다. 10회를 넘는 명령은 실행 전에 거부한다.
 * 2) 반복문(for·while·until·seq·xargs) 안의 앱 실행은 횟수를 확인할 수 없으므로 거부한다 — 1회씩 실행.
 * 3) 실행하는 스크립트 파일(.sh) 안의 앱 실행도 같은 규칙으로 센다.
 * 4) 운영 사이트(samarket*.vercel.app)를 여는 자동화 브라우저 실행(Playwright·Puppeteer·headless Chrome — 명령이나
 *    실행 파일 .mjs/.js/.cjs/.ts/.py 안)과 Claude 브라우저 도구의 운영 사이트 이동도 1회씩 같은 상한으로 센다.
 *    화면 1번 열기 ≈ 운영 Supabase 약 100건(같은 문서 §3). 자동화 파일 안의 반복은 셀 수 없어 반복문이 있으면 거부한다.
 * 추가 허용: Owner 가 직접 `.claude/state/app-launch/<세션ID>.allow` 파일에 추가 횟수를 적는다(작업자가 만들지 않는다).
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

export const APP_LAUNCH_LIMIT = 10;
const APP_ID = "com.dibay.app";

const LAUNCH_PATTERNS = [
  /\bmonkey\b[^\n;&|]*?-p\s+com\.dibay\.app\b/g,
  /\bam\s+start(?:-activity|-foreground-service)?\b[^\n;&|]*?com\.dibay\.app\b/g,
  /\bsimctl\s+launch\b[^\n;&|]*?com\.dibay\.app\b/g,
];
const LOOP_RE = /(^|[\s;&|(])(for|while|until)\s|\bseq\s+\d|\bxargs\b|\brepeat\s+\d/;

const PROD_HOST_RE = /samarket[\w-]*\.vercel\.app/;
const BROWSER_AUTOMATION_RE = /\b(playwright|puppeteer|chromium\.launch|webkit\.launch|firefox\.launch|headless[_ -]?chrom|launchPersistentContext)\b/i;
const SCRIPT_FILE_RE = /(?:^|[\s;&|(])((?:\.{0,2}\/|~\/|\/)?[\w./-]+\.(?:mjs|cjs|js|ts|py))\b/g;

/** 운영 사이트를 여는 자동화 브라우저 실행인가 — 명령 또는 실행 파일 본문 기준. @returns {{ runs: number, loop: boolean }} */
export function analyzeBrowserAutomation(command, cwd) {
  const texts = [command];
  let m;
  SCRIPT_FILE_RE.lastIndex = 0;
  while ((m = SCRIPT_FILE_RE.exec(command)) != null) {
    const raw = m[1].replace(/^~\//, `${process.env.HOME ?? ""}/`);
    const p = path.isAbsolute(raw) ? raw : path.join(cwd, raw);
    try {
      if (existsSync(p)) texts.push(readFileSync(p, "utf8"));
    } catch {
      /* 읽기 실패는 무시 */
    }
  }
  const all = texts.join("\n");
  if (!BROWSER_AUTOMATION_RE.test(all) || !PROD_HOST_RE.test(all)) return { runs: 0, loop: false };
  const loop = texts.slice(1).some((t) => /\b(for|while)\s*\(|\.forEach\(|\bfor\s+\w+\s+in\b/.test(t) && /\.goto\(|\.navigate\(/.test(t)) || LOOP_RE.test(command);
  return { runs: 1, loop };
}

export function countAppLaunches(text) {
  if (!text || !text.includes(APP_ID)) return 0;
  let n = 0;
  for (const re of LAUNCH_PATTERNS) n += (text.match(re) ?? []).length;
  return n;
}

export function referencedScriptFiles(command, cwd) {
  const out = [];
  const re = /(?:^|[\s;&|(])(?:(?:bash|sh|zsh)\s+)?((?:\.{0,2}\/|~\/|\/)?[\w./-]+\.sh)\b/g;
  let m;
  while ((m = re.exec(command)) != null) {
    const raw = m[1].replace(/^~\//, `${process.env.HOME ?? ""}/`);
    const p = path.isAbsolute(raw) ? raw : path.join(cwd, raw);
    if (existsSync(p)) out.push(p);
  }
  return out;
}

/** @returns {{ launches: number, loop: boolean }} */
export function analyzeCommand(command, cwd) {
  let launches = countAppLaunches(command);
  let loop = launches > 0 && LOOP_RE.test(command);
  for (const f of referencedScriptFiles(command, cwd)) {
    let body = "";
    try {
      body = readFileSync(f, "utf8");
    } catch {
      continue;
    }
    const n = countAppLaunches(body);
    if (n > 0) {
      launches += n;
      if (LOOP_RE.test(body)) loop = true;
    }
  }
  return { launches, loop };
}

function stateDir(projectDir) {
  return path.join(projectDir, ".claude", "state", "app-launch");
}

function readInt(file) {
  try {
    const v = Number.parseInt(readFileSync(file, "utf8").trim(), 10);
    return Number.isFinite(v) && v > 0 ? v : 0;
  } catch {
    return 0;
  }
}

/** @returns {{ deny: string | null }} */
export function decide(input, projectDir) {
  const tool = input.tool_name ?? "";
  const session = String(input.session_id ?? "unknown").replace(/[^\w-]/g, "_") || "unknown";
  let launches = 0;
  let loop = false;
  if (tool === "Bash") {
    const cmd = String(input.tool_input?.command ?? "");
    const cwd = String(input.cwd ?? projectDir);
    const r = analyzeCommand(cmd, cwd);
    const b = analyzeBrowserAutomation(cmd, cwd);
    launches = r.launches + b.runs;
    loop = r.loop || b.loop;
  } else if (/Simulator__control$/.test(tool) && input.tool_input?.action === "launch") {
    launches = 1;
  } else if (/(Claude_Browser__navigate|claude-in-chrome__navigate|Claude_Browser__preview_start)$/.test(tool)) {
    const url = String(input.tool_input?.url ?? "");
    if (PROD_HOST_RE.test(url)) launches = 1;
  }
  if (launches === 0) return { deny: null };
  if (loop) {
    return {
      deny:
        "Owner 규정(실기기·자동화 반복 실행 시험 상한): 반복문 안의 앱 실행·운영 사이트 자동 열기는 금지 — 횟수를 확인할 수 없다. 명령 1개에 1회씩 한다.",
    };
  }
  const dir = stateDir(projectDir);
  const countFile = path.join(dir, `${session}.count`);
  const allowFile = path.join(dir, `${session}.allow`);
  const used = readInt(countFile);
  const limit = APP_LAUNCH_LIMIT + readInt(allowFile);
  if (used + launches > limit) {
    return {
      deny: `Owner 규정(실기기·자동화 반복 실행 시험 상한): 이 세션의 앱 실행·운영 사이트 자동 열기 ${used}회 + ${launches}회 > 상한 ${limit}회. 앱 실행 1회 ≈ 운영 Supabase 약 195건. 더 필요하면 횟수·이유를 Owner 에게 알리고, Owner 가 ${path.relative(projectDir, allowFile)} 에 추가 횟수를 적은 뒤 다시 실행한다.`,
    };
  }
  try {
    mkdirSync(dir, { recursive: true });
    writeFileSync(countFile, String(used + launches));
  } catch {
    /* 기록 실패는 실행을 막지 않는다 */
  }
  return { deny: null };
}

async function main() {
  let raw = "";
  for await (const chunk of process.stdin) raw += chunk;
  let input = {};
  try {
    input = JSON.parse(raw || "{}");
  } catch {
    process.exit(0);
  }
  const projectDir = process.env.CLAUDE_PROJECT_DIR || process.cwd();
  const { deny } = decide(input, projectDir);
  if (deny) {
    process.stdout.write(
      JSON.stringify({
        hookSpecificOutput: { hookEventName: "PreToolUse", permissionDecision: "deny", permissionDecisionReason: deny },
      }),
    );
  }
  process.exit(0);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  void main();
}
