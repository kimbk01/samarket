/**
 * Call V4 incoming FSI/fallback bundle boundary — keep Android policy + QA isolated.
 * Manifest: scripts/call-v4-incoming-fsi-fallback-manifest.json
 * Usage: npm run verify:call-v4-incoming-fsi-fallback-boundary
 */
const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");

const root = path.join(__dirname, "..");
const manifest = JSON.parse(
  fs.readFileSync(path.join(__dirname, "call-v4-incoming-fsi-fallback-manifest.json"), "utf8"),
);

let failed = false;

function fail(msg) {
  console.error(`verify:call-v4-incoming-fsi-fallback-boundary FAIL — ${msg}`);
  failed = true;
}

function pass(msg) {
  console.log(`  OK ${msg}`);
}

function read(rel) {
  return fs.readFileSync(path.join(root, rel), "utf8");
}

function listJavaFiles(dirRel) {
  const abs = path.join(root, dirRel);
  const out = [];
  for (const ent of fs.readdirSync(abs, { withFileTypes: true })) {
    const rel = path.join(dirRel, ent.name);
    if (ent.isDirectory()) out.push(...listJavaFiles(rel));
    else if (ent.name.endsWith(".java")) out.push(rel);
  }
  return out;
}

for (const rel of manifest.androidIncoming) {
  if (!fs.existsSync(path.join(root, rel))) {
    fail(`missing android bundle file: ${rel}`);
  } else {
    pass(`bundle file present: ${path.basename(rel)}`);
  }
}

for (const rel of manifest.webIncoming) {
  if (!fs.existsSync(path.join(root, rel))) {
    fail(`missing web bundle file: ${rel}`);
  } else {
    pass(`web bundle file present: ${path.basename(rel)}`);
  }
}

const qaPath = path.join(root, manifest.qaScript);
if (!fs.existsSync(qaPath)) {
  fail(`missing QA script: ${manifest.qaScript}`);
} else {
  const qa = fs.readFileSync(qaPath, "utf8");
  for (const anchor of manifest.qaRequiredAnchors) {
    if (!qa.includes(anchor)) {
      fail(`QA script missing anchor: ${anchor}`);
    }
  }
  if (!failed) pass("QA script anchors present");
}

for (const rel of manifest.verifyScripts) {
  if (!fs.existsSync(path.join(root, rel))) {
    fail(`missing verify script: ${rel}`);
  }
}

const notifier = read("android/app/src/main/java/com/dibay/app/IncomingCallBackgroundNotifier.java");
const pushDelivery = read("android/app/src/main/java/com/dibay/app/IncomingCallPushDelivery.java");

for (const method of manifest.policyPresentationMethods) {
  if (!notifier.includes(method)) {
    fail(`policy presentation method missing in BackgroundNotifier: ${method}`);
  }
  if (pushDelivery.includes(method)) {
    fail(`PushDelivery must not own ${method} (BackgroundNotifier SSOT)`);
  }
}
if (!failed) pass("V4 A/B presentation owned by BackgroundNotifier only");

const javaFiles = listJavaFiles("android/app/src/main/java");
const allowedCallers = new Set(manifest.sessionCleanupCallers);
for (const rel of javaFiles) {
  const base = path.basename(rel);
  if (base === "IncomingCallSessionCleanup.java") continue;
  const body = read(rel);
  if (!body.includes("IncomingCallSessionCleanup")) continue;
  if (!allowedCallers.has(base)) {
    fail(`IncomingCallSessionCleanup referenced outside bundle callers: ${rel}`);
  }
}
if (!failed) pass("IncomingCallSessionCleanup callers confined to bundle");

for (const prefix of manifest.forbiddenSessionCleanupOutsideBundle) {
  const abs = path.join(root, prefix);
  if (!fs.existsSync(abs)) continue;
  const walk = (dir, base = prefix) => {
    for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
      const rel = path.join(base, ent.name);
      const full = path.join(root, rel);
      if (ent.isDirectory()) walk(full, rel);
      else if (/\.(ts|tsx|java)$/.test(ent.name)) {
        const body = fs.readFileSync(full, "utf8");
        if (body.includes("IncomingCallSessionCleanup") || body.includes("presentV4LockFsiOnlyIncoming")) {
          fail(`forbidden cross-domain import/reference in ${rel}`);
        }
      }
    }
  };
  walk(abs);
}
if (!failed) pass("no trade/store cross-import of incoming FSI bundle");

const pkg = JSON.parse(read("package.json"));
if (pkg.scripts[manifest.packageScripts.verify] === undefined) {
  fail(`package.json missing ${manifest.packageScripts.verify}`);
}
if (!pkg.scripts[manifest.packageScripts.qa]?.includes("v4-abc-policy-5gate")) {
  fail(`package.json missing ${manifest.packageScripts.qa}`);
}
if (!failed) pass("package.json wires verify + qa scripts");

if (failed) {
  process.exit(1);
}

console.log("verify:call-v4-incoming-fsi-fallback-boundary structural PASS — running bundle verifies…");
for (const rel of manifest.verifyScripts) {
  if (rel.endsWith("verify-call-v4-incoming-fsi-fallback-boundary.cjs")) continue;
  const r = spawnSync("node", [path.join(root, rel)], { cwd: root, stdio: "inherit" });
  if (r.status !== 0) process.exit(r.status ?? 1);
}

console.log("verify:call-v4-incoming-fsi-fallback-boundary PASS");
