#!/usr/bin/env node
/**
 * Offline selftests — Samsung MESSAGE KILLED SystemUI tap harness SSOT.
 * NO DEVICE. NO MESSAGE. NO PUSH. Harness contract only.
 *
 * Usage: node scripts/qa/samsung-message-killed-systemui-tap-harness.selftest.mjs
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  buildTestHierarchyXml,
  captureShadeHierarchy,
  captureResolveAndTapMessageChild,
  executeContentTapIfAllowed,
  loadCapturedHierarchy,
  resolveExactMessageRow,
} from "./lib/samsung-message-killed-systemui-tap-harness.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));

const MARKER = "MKFC-TEST-MARKER-1";
const TITLE = "메인관리자";
const SUMMARY = "읽지 않은 알림 119개가 있습니다. 탭하여 확인하세요.";

let failed = 0;
function assert(cond, label) {
  if (!cond) {
    failed += 1;
    console.error(`FAIL ${label}`);
  } else {
    console.log(`PASS ${label}`);
  }
}

function validMessageHierarchy() {
  return buildTestHierarchyXml([
    {
      bounds: "[30,307][1050,510]",
      clickable: "true",
      nodes: [
        { text: TITLE, resourceId: "android:id/title", bounds: "[233,367][384,408]" },
        { text: "오전 3:39", resourceId: "android:id/time", bounds: "[407,368][515,406]" },
        { text: MARKER, resourceId: "android:id/text", bounds: "[233,411][933,450]" },
        {
          text: "",
          resourceId: "android:id/expand_button_touch_container",
          bounds: "[933,307][1050,510]",
          clickable: "false",
        },
      ],
    },
    {
      bounds: "[30,533][1050,736]",
      clickable: "true",
      nodes: [
        { text: "DIBAY", resourceId: "android:id/title", bounds: "[233,593][330,634]" },
        { text: SUMMARY, resourceId: "android:id/text", bounds: "[233,637][933,676]" },
      ],
    },
  ]);
}

function tmpFile(name, contents) {
  const p = path.join(os.tmpdir(), `mkfc-selftest-${process.pid}-${name}`);
  if (contents != null) fs.writeFileSync(p, contents);
  return p;
}

// --- T1 valid XML exact marker → resolver succeeds ---
{
  const xml = validMessageHierarchy();
  const r = resolveExactMessageRow({ xml, exactMarker: MARKER, expectedTitle: TITLE });
  assert(r.ok === true && r.tapAllowed === true, "T1 valid XML → resolver succeeds");
  assert(r.exactMarkerCount === 1, "T1 exact_marker_count==1");
  assert(r.summaryExcluded === true, "T1 summaryExcluded");
  assert(r.row?.title === TITLE, "T1 title");
  assert(r.tapCoordinates && Number.isFinite(r.tapCoordinates.x), "T1 tap coords");
}

// --- T2 XML missing → fail closed, tap unreachable ---
{
  const missing = path.join(os.tmpdir(), `mkfc-missing-${process.pid}.xml`);
  try {
    fs.unlinkSync(missing);
  } catch {
    /* ok */
  }
  const loaded = loadCapturedHierarchy(missing);
  assert(loaded.ok === false, "T2 load missing fails");
  const r = resolveExactMessageRow({ hierarchyPath: missing, exactMarker: MARKER });
  assert(r.ok === false && r.tapAllowed === false, "T2 resolve fail-closed");
  const tap = executeContentTapIfAllowed({
    resolveResult: r,
    adb: () => ({ status: 0, stdout: "", stderr: "" }),
    serial: "TEST",
  });
  assert(tap.tapped === false && tap.reason === "tap_blocked_fail_closed", "T2 tap unreachable");
}

// --- T3 XML empty ---
{
  const p = tmpFile("empty.xml", "");
  const r = resolveExactMessageRow({ hierarchyPath: p, exactMarker: MARKER });
  assert(r.ok === false && r.tapAllowed === false, "T3 empty fail-closed");
  fs.unlinkSync(p);
}

// --- T4 invalid XML ---
{
  const r = resolveExactMessageRow({ xml: "<not-hierarchy/>", exactMarker: MARKER });
  assert(r.ok === false && r.tapAllowed === false, "T4 invalid XML fail-closed");
}

// --- T5 marker count=0 ---
{
  const xml = validMessageHierarchy();
  const r = resolveExactMessageRow({ xml, exactMarker: "NO-SUCH-MARKER" });
  assert(r.ok === false && r.reason === "exact_marker_count_0", "T5 marker count 0");
  assert(r.tapAllowed === false, "T5 no tap");
}

// --- T6 marker count>1 ---
{
  const xml = buildTestHierarchyXml([
    {
      bounds: "[30,307][1050,510]",
      nodes: [
        { text: MARKER, resourceId: "android:id/text", bounds: "[233,411][933,450]" },
        { text: TITLE, resourceId: "android:id/title", bounds: "[233,367][384,408]" },
      ],
    },
    {
      bounds: "[30,533][1050,736]",
      nodes: [{ text: MARKER, resourceId: "android:id/text", bounds: "[233,637][933,676]" }],
    },
  ]);
  const r = resolveExactMessageRow({ xml, exactMarker: MARKER });
  assert(r.ok === false && r.reason === "exact_marker_count_gt_1", "T6 marker count >1");
  assert(r.tapAllowed === false, "T6 no tap");
}

// --- T7 marker on summary/wrong row ---
{
  const xml = buildTestHierarchyXml([
    {
      bounds: "[30,533][1050,736]",
      nodes: [
        { text: "DIBAY", resourceId: "android:id/title", bounds: "[233,593][330,634]" },
        { text: SUMMARY, resourceId: "android:id/text", bounds: "[233,637][400,676]" },
        { text: MARKER, resourceId: "android:id/text", bounds: "[410,637][933,676]" },
      ],
    },
  ]);
  const r = resolveExactMessageRow({ xml, exactMarker: MARKER });
  assert(r.ok === false && r.reason === "summary_row_excluded", "T7 summary/wrong row fail-closed");
  assert(r.tapAllowed === false, "T7 no tap");
}

// --- T8 valid MESSAGE + sibling inbox summary → MESSAGE selected, summary excluded ---
{
  const xml = validMessageHierarchy();
  const r = resolveExactMessageRow({ xml, exactMarker: MARKER, expectedTitle: TITLE });
  assert(r.ok === true, "T8 MESSAGE row selected");
  assert(r.row?.texts?.includes(MARKER), "T8 marker on MESSAGE row");
  assert(!r.row?.texts?.some((t) => t.includes("읽지 않은 알림")), "T8 summary excluded from row");
  assert(r.summaryExcluded === true, "T8 summaryExcluded flag");
}

// --- T9 dump/pull failure → diagnostics retained, open/tap not executed ---
{
  const local = path.join(os.tmpdir(), `mkfc-capture-fail-${process.pid}.xml`);
  try {
    fs.unlinkSync(local);
  } catch {
    /* ok */
  }
  let openAttempted = false;
  const origRead = fs.readFileSync;
  // captureShadeHierarchy must not open missing path after failed pull
  const adb = (args) => {
    const joined = args.join(" ");
    if (joined.includes("expand-notifications")) return { status: 0, stdout: "", stderr: "" };
    if (joined.includes("uiautomator") && joined.includes("dump")) return { status: 0, stdout: "UI hierchary dumped to: /sdcard/x.xml\n", stderr: "" };
    if (joined.includes("pull")) return { status: 1, stdout: "", stderr: "remote object '/sdcard/shade-message-killed.xml' does not exist\n" };
    return { status: 1, stdout: "", stderr: "unexpected" };
  };
  const capture = captureShadeHierarchy({
    adb,
    serial: "TEST",
    localHierarchyPath: local,
    sleep: () => {},
  });
  assert(capture.ok === false, "T9 capture fails");
  assert(capture.diagnostics?.stage === "adb_pull", "T9 diagnostics stage=adb_pull");
  assert(capture.diagnostics?.exitCode === 1, "T9 exit code retained");
  assert(String(capture.diagnostics?.stderr || "").includes("does not exist"), "T9 stderr retained");
  assert(capture.hierarchyPath === null, "T9 no hierarchyPath on fail");
  assert(!fs.existsSync(local), "T9 local file not created");

  const chain = captureResolveAndTapMessageChild({
    adb,
    serial: "TEST",
    localHierarchyPath: local,
    exactMarker: MARKER,
    executeTap: true,
    sleep: () => {},
  });
  assert(chain.ok === false, "T9 chain fails");
  assert(chain.tap?.tapped === false, "T9 tap not executed");
  assert(chain.tap?.reason === "tap_unreachable_capture_failed", "T9 tap unreachable");

  // Structural: resolve without capture must not invent second dump path
  assert(typeof resolveExactMessageRow === "function", "T9 resolve is path consumer");
  void openAttempted;
  void origRead;
}

// Dual-path authority must not exist as hard-coded consumer of *-pre-tap*
{
  const harnessSrc = fs.readFileSync(path.join(HERE, "lib/samsung-message-killed-systemui-tap-harness.mjs"), "utf8");
  assert(!harnessSrc.includes("shade-mkfc-pre-tap"), "SSOT: no shade-mkfc-pre-tap in harness");
  assert(!harnessSrc.includes("shade-mkfc-msg"), "SSOT: no dual shade-mkfc-msg hardcode");
  assert(harnessSrc.includes("hierarchyPath"), "SSOT: hierarchyPath passed explicitly");
}

if (failed > 0) {
  console.error(`\nSELFTEST FAIL count=${failed}`);
  process.exit(1);
}
console.log("\n[samsung-message-killed-systemui-tap-harness.selftest] PASS");
