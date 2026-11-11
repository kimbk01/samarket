#!/usr/bin/env node
/**
 * next build 타입 검사 증분 캐시 복구 (검사는 그대로 · 순서만)
 *
 * 원인(2026-11-11 실측): Next 16.1.7 `dist/lib/typescript/runTypeCheck.js` 는
 *   program.emit()  →  getPreEmitDiagnostics(program)
 * 순서다. emit 이 .next/cache/.tsbuildinfo 를 먼저 써서, 그 뒤에 계산한 파일별 의미 진단이
 * 캐시에 남지 않는다. Vercel 이 .next/cache 를 복원해도 매 빌드가 전체 검사(157~258초)를 한다.
 *
 * 수정: 진단을 먼저 계산하고 emit(캐시 기록)을 나중에 한다. 진단 대상·필터·오류 판정은 동일.
 * 로컬 측정(같은 입력·옵션): 처음 76초 · 변경 없음 6초 · 화면 파일 1개 5초 · 번역 카탈로그 75초.
 *
 * 안전장치: Next 버전이나 원문이 다르면 수정하지 않고 실패(exit 1)한다 — 조용히 넘어가지 않는다.
 * 같은 파일에 두 번 실행해도 결과는 같다(이미 적용 시 통과).
 */
import { readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";

const EXPECTED_NEXT_VERSION = "16.1.7";
const MARKER = "/* dibay: diagnostics-before-emit */";
const FROM_EMIT = "    const result = program.emit();\n";
const TO_EMIT = `    ${MARKER} const dibayPreEmitDiagnostics = typescript.getPreEmitDiagnostics(program);\n    const result = program.emit();\n`;
const FROM_DIAG = "const allDiagnostics = typescript.getPreEmitDiagnostics(program).concat(result.diagnostics)";
const TO_DIAG = "const allDiagnostics = dibayPreEmitDiagnostics.concat(result.diagnostics)";

function fail(message) {
  console.error(`[next-typecheck-diagnostics-first] FAIL: ${message}`);
  process.exit(1);
}

const require = createRequire(path.join(process.cwd(), "package.json"));
const nextPkgPath = require.resolve("next/package.json");
const nextVersion = JSON.parse(readFileSync(nextPkgPath, "utf8")).version;
if (nextVersion !== EXPECTED_NEXT_VERSION) {
  fail(`next ${nextVersion} — 이 수정은 ${EXPECTED_NEXT_VERSION} 원문 기준. 새 버전 원문을 확인한 뒤 스크립트를 갱신하세요.`);
}

const target = path.join(path.dirname(nextPkgPath), "dist/lib/typescript/runTypeCheck.js");
const source = readFileSync(target, "utf8");

if (source.includes(MARKER)) {
  if (!source.includes(TO_DIAG)) fail("표식은 있으나 진단 줄이 기대와 다름");
  console.log("[next-typecheck-diagnostics-first] 이미 적용됨");
  process.exit(0);
}

const count = (s, sub) => s.split(sub).length - 1;
if (count(source, FROM_EMIT) !== 1) fail("emit 줄을 정확히 1개 찾지 못함");
if (count(source, FROM_DIAG) !== 1) fail("진단 줄을 정확히 1개 찾지 못함");

writeFileSync(target, source.replace(FROM_EMIT, TO_EMIT).replace(FROM_DIAG, TO_DIAG));
console.log(`[next-typecheck-diagnostics-first] 적용: ${path.relative(process.cwd(), target)}`);
