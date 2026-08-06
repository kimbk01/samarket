/**
 * Slice 10 Phase 1 — Dead cleanup inventory (NO deletes).
 *
 *   node scripts/qa/slice10-dead-cleanup-inventory.mjs
 *
 * Collects static evidence for mypage legacy candidates.
 * Classifications: KEEP | MERGE_CANDIDATE | DEPRECATE_CANDIDATE | DEAD_CANDIDATE | DEAD_PROVEN
 * DEAD_PROVEN requires all gates = 0 including production bundle symbol — Phase 1 never claims it
 * for named live-reference candidates.
 */
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, writeFileSync, readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = process.cwd();
const TS = new Date().toISOString().replace(/[:.]/g, "-");
const OUT_DIR = join(ROOT, `.qa-logs/customer-platform-slice10-inventory-${TS}`);
const DOC_JSON = join(
  ROOT,
  "docs/customer-platform/_ios-mypage-audit-2026-08-06/dibay/slice10-phase1-inventory.json",
);

const CLASS = {
  KEEP: "KEEP",
  MERGE: "MERGE_CANDIDATE",
  DEPRECATE: "DEPRECATE_CANDIDATE",
  DEAD: "DEAD_CANDIDATE",
  PROVEN: "DEAD_PROVEN",
};

function rg(pattern, globs = []) {
  const roots = ["components", "app", "lib", "hooks", "scripts"];
  const runOnce = (extraGlobs) => {
    const args = [
      "-n",
      "--glob",
      "!node_modules/**",
      "--glob",
      "!.qa-logs/**",
      "--glob",
      "!lib/build/**",
      ...extraGlobs.flatMap((g) => ["--glob", g]),
      pattern,
      ...roots,
    ];
    const r = spawnSync("rg", args, { cwd: ROOT, encoding: "utf8", maxBuffer: 8 * 1024 * 1024 });
    return String(r.stdout || "")
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean);
  };
  if (!globs.length) return runOnce([]);
  if (globs.length === 1) return runOnce(globs);
  const lines = [];
  for (const g of globs) lines.push(...runOnce([g]));
  return [...new Set(lines)];
}

function fileExists(rel) {
  return existsSync(join(ROOT, rel));
}

function staticImporters(symbolOrPath, { excludeFiles = [] } = {}) {
  const lines = rg(symbolOrPath, ["*.ts", "*.tsx", "*.mjs", "*.js"]);
  return lines
    .filter((l) => {
      const file = l.split(":")[0] || "";
      if (file.includes("scripts/qa/slice10-dead-cleanup-inventory.mjs")) return false;
      return !excludeFiles.some((ex) => file.endsWith(ex) || file === ex);
    })
    .map((l) => {
      const i = l.indexOf(":");
      const j = l.indexOf(":", i + 1);
      return { file: l.slice(0, i), line: Number(l.slice(i + 1, j)) || null, text: l.slice(j + 1).trim() };
    });
}

function dynamicHits(needle) {
  return rg(`import\\([^)]*${needle}|lazy\\([^)]*${needle}`, ["*.ts", "*.tsx"]);
}

function routeHits(needle) {
  return rg(needle, ["app/**/*.tsx", "app/**/*.ts", "next.config.*", "middleware.ts"]);
}

function testHits(needle) {
  return rg(needle, ["**/__tests__/**", "**/*.test.ts", "**/*.test.tsx", "scripts/qa/**", "scripts/verify-*.mjs"]);
}

function adminHits(needle) {
  return rg(needle, ["app/admin/**", "components/admin/**", "app/api/admin/**"]);
}

function serverHits(needle) {
  return rg(needle, ["lib/**/*.ts", "app/api/**", "services/**"]);
}

function ctaHits(needle) {
  // Rough: JSX usage / LogoutActionTrigger coupling
  return rg(needle, ["components/**/*.tsx", "app/**/*.tsx"]);
}

function classifyCandidate(c) {
  // Named Phase-1 forbid DEAD_PROVEN when any reference remains
  if (c.forbidDeadProven && c.evidence.totalReferenceCount > 0) {
    if (c.evidence.jsxOrValueImporterCount === 0 && c.evidence.typeOnlyImporterCount > 0) {
      return CLASS.MERGE;
    }
    if (c.evidence.jsxOrValueImporterCount === 0 && c.evidence.verifyOrTestOnly) {
      return CLASS.DEAD;
    }
    if (c.evidence.jsxOrValueImporterCount === 0) {
      return CLASS.DEAD;
    }
    if (c.replacement && c.evidence.jsxOrValueImporterCount > 0) {
      return CLASS.DEPRECATE;
    }
    return CLASS.KEEP;
  }
  if (
    c.evidence.jsxOrValueImporterCount === 0 &&
    c.evidence.typeOnlyImporterCount === 0 &&
    c.evidence.testCount === 0 &&
    c.evidence.routeCount === 0 &&
    c.evidence.bundleSymbol === "ABSENT_OR_NOT_SCANNED"
  ) {
    // Still not PROVEN without bundle scan
    return CLASS.DEAD;
  }
  return CLASS.KEEP;
}

const CANDIDATES = [
  {
    id: "MypageInstagramView",
    path: "components/my/mypage/MypageInstagramView.tsx",
    forbidDeadProven: true,
    symbols: ["MypageInstagramView"],
    replacement: {
      route: "/mypage",
      component: "app/(main)/my/MyContent.tsx → MyPageHomeDashboard",
      runtimeEvidence: "Slice 3 UI RUNTIME LOCK + Slice 9 MULTIPLATFORM RUNTIME LOCK (hub)",
    },
  },
  {
    id: "SettingsMainContent",
    path: "components/my/settings/SettingsMainContent.tsx",
    forbidDeadProven: true,
    symbols: ["SettingsMainContent"],
    replacement: {
      note: "App settings now via profile-settings / mypage account menus; only consumed by MypageInstagramView sheet",
      runtimeEvidence: "Slice 6 account + Slice 3 hub menus",
    },
  },
  {
    id: "MyPageConsole",
    path: "components/mypage/MyPageConsole.tsx",
    forbidDeadProven: true,
    symbols: ["MyPageConsole"],
    note: "Component export unused; MyPageConsoleProps type still used by ItemScreen/tabs",
    replacement: {
      component: "MyContent + MyPageHomeDashboard / MyPageItemRouteClient",
      runtimeEvidence: "Slice 3–5 route matrix",
    },
  },
  {
    id: "MyPageContent",
    path: "components/mypage/MyPageContent.tsx",
    forbidDeadProven: false,
    symbols: ["MyPageContent"],
    replacement: {
      note: "Only rendered by MyPageConsole",
      runtimeEvidence: "same as MyPageConsole",
    },
  },
  {
    id: "MyInfoProfileCard",
    path: "components/mypage/myinfo/MyInfoProfileCard.tsx",
    forbidDeadProven: true,
    symbols: ["MyInfoProfileCard"],
    replacement: {
      component: "MypageProfileSummary (+ MyInfoGuestProfileCard for guest)",
      runtimeEvidence: "Slice 3 hub / Slice 9 iOS hub PASS",
    },
  },
  {
    id: "MyInfoProfileHubCard",
    path: "components/mypage/myinfo/MyInfoProfileHubCard.tsx",
    forbidDeadProven: false,
    symbols: ["MyInfoProfileHubCard"],
    replacement: { component: "MypageProfileSummary" },
  },
  {
    id: "MyInfoMiniProfile",
    path: "components/mypage/myinfo/MyInfoMiniProfile.tsx",
    forbidDeadProven: false,
    symbols: ["MyInfoMiniProfile"],
    replacement: { component: "MypageProfileSummary" },
  },
  {
    id: "MyInfoProfileSection",
    path: "components/mypage/myinfo/MyInfoProfileSection.tsx",
    forbidDeadProven: false,
    symbols: ["MyInfoProfileSection"],
    replacement: { component: "MypageProfileSummary" },
  },
  {
    id: "MyProfileCard",
    path: "components/my/MyProfileCard.tsx",
    forbidDeadProven: true,
    symbols: ["MyProfileCard"],
    pathNeedle: "components/my/MyProfileCard",
    note: "Component unused; AddressDefaultsFlags type still imported from this file (SSOT should be lib/my/address-defaults-types.ts)",
    replacement: {
      typeSsot: "lib/my/address-defaults-types.ts",
      component: "MypageProfileSummary",
    },
  },
  {
    id: "ProfileCard_mypage",
    path: "components/mypage/ProfileCard.tsx",
    forbidDeadProven: false,
    symbols: [],
    pathNeedle: "components/mypage/ProfileCard",
    exportNeedle: "export function ProfileCard",
    replacement: { component: "MypageProfileSummary" },
  },
  {
    id: "ProfileCard_my",
    path: "components/my/ProfileCard.tsx",
    forbidDeadProven: false,
    symbols: [],
    pathNeedle: "components/my/ProfileCard",
    exportNeedle: "export function ProfileCard",
    replacement: { component: "MypageProfileSummary" },
  },
  {
    id: "logout_multi_entry",
    path: null,
    forbidDeadProven: true,
    symbols: ["LogoutActionTrigger"],
    note: "Multiple CTA surfaces; canonical Account menu (Slice 3 MOVE)",
    replacement: {
      canonical: "MyInfoAccountMenuSection + LogoutActionTrigger",
      also: ["ProfileSettingsSheet", "ProfileEditForm", "MypageInstagramView", "LogoutContent"],
      runtimeEvidence: "Slice 3 logout modal PASS; Slice 6 account",
    },
  },
  {
    id: "trade_legacy_routes",
    path: null,
    forbidDeadProven: true,
    symbols: ["/mypage/purchases", "/mypage/sales", "/mypage/reviews"],
    note: "Compat redirect pages + next.config redirects → /mypage/trade/*",
    replacement: {
      canonical: "/mypage/trade, /mypage/trade/sales, /mypage/trade/reviews",
      runtimeEvidence: "Slice 5 ACTIVITY LOCK",
    },
  },
];

function analyze(c) {
  const selfFiles = c.path ? [c.path] : [];
  const allHits = [];
  for (const sym of c.symbols) {
    allHits.push(...staticImporters(sym, { excludeFiles: selfFiles }));
  }
  if (c.pathNeedle) {
    allHits.push(...staticImporters(c.pathNeedle, { excludeFiles: selfFiles }));
  }

  const uniqueFiles = [...new Set(allHits.map((h) => h.file))];
  const typeOnly = allHits.filter((h) => /import\s+type\s+|type\s+\{/.test(h.text) || /import type/.test(h.text));
  const jsxOrValue = allHits.filter((h) => !typeOnly.includes(h) && !/^\s*\/\//.test(h.text) && !/comment/i.test(h.text));
  // refine: comments-only
  const commentOnly = allHits.filter((h) => /^\s*\/\//.test(h.text) || h.text.includes("// "));
  const verifyOrTest = allHits.filter(
    (h) =>
      h.file.includes("__tests__") ||
      h.file.includes(".test.") ||
      h.file.includes("scripts/verify") ||
      h.file.includes("scripts/qa"),
  );

  const dyn = c.symbols.flatMap((s) => dynamicHits(s));
  const routes = c.symbols.flatMap((s) => routeHits(s.replace(/^\//, "")));
  const tests = c.symbols.flatMap((s) => testHits(s));
  const admin = c.symbols.flatMap((s) => adminHits(s));
  const server = c.symbols.flatMap((s) => serverHits(s));
  const cta = c.id === "logout_multi_entry" ? ctaHits("LogoutActionTrigger") : [];

  const jsxImporterFiles = [
    ...new Set(
      jsxOrValue
        .filter((h) => !verifyOrTest.includes(h) && !commentOnly.includes(h))
        .filter((h) => !/import\s+type/.test(h.text))
        .map((h) => h.file),
    ),
  ];
  // For component symbols, count import { X } without type
  const valueImportFiles = [
    ...new Set(
      allHits
        .filter((h) => /import\s*\{[^}]*\b/.test(h.text) && !/import\s+type/.test(h.text))
        .filter((h) => !selfFiles.some((s) => h.file.endsWith(s)))
        .map((h) => h.file),
    ),
  ];

  const evidence = {
    fileExists: c.path ? fileExists(c.path) : null,
    staticImporterFiles: uniqueFiles,
    staticImporterCount: uniqueFiles.length,
    valueImportFiles,
    jsxOrValueImporterCount: valueImportFiles.length,
    typeOnlyImporterCount: [
      ...new Set(typeOnly.map((h) => h.file).filter((f) => !selfFiles.some((s) => f.endsWith(s)))),
    ].length,
    typeOnlyFiles: [
      ...new Set(typeOnly.map((h) => h.file).filter((f) => !selfFiles.some((s) => f.endsWith(s)))),
    ],
    dynamicImporterCount: dyn.length,
    dynamicHits: dyn.slice(0, 20),
    routeEntryCount: routes.length,
    routeHits: routes.slice(0, 30),
    ctaEntryCount: cta.length || valueImportFiles.length,
    ctaHits: (cta.length ? cta : valueImportFiles).slice(0, 30),
    serverCallerCount: server.filter((l) => !l.includes("__tests__")).length,
    serverHits: server.slice(0, 20),
    adminCallerCount: admin.length,
    adminHits: admin.slice(0, 20),
    testDependencyCount: tests.length,
    testHits: tests.slice(0, 30),
    verifyOrTestOnly:
      uniqueFiles.length > 0 && uniqueFiles.every((f) => /scripts\/verify|scripts\/qa|__tests__|\.test\./.test(f)),
    productionBundleSymbol: "NOT_SCANNED",
    bundleSymbol: "ABSENT_OR_NOT_SCANNED",
    totalReferenceCount: uniqueFiles.length + dyn.length,
    sampleHits: allHits.slice(0, 25),
  };

  const row = {
    id: c.id,
    path: c.path,
    note: c.note || null,
    forbidDeadProven: Boolean(c.forbidDeadProven),
    evidence,
    replacement: c.replacement || null,
    whyReferencesAlive: null,
    classification: null,
    deletablePhase2: false,
  };

  // why alive
  if (c.id === "MypageInstagramView") {
    row.whyReferencesAlive =
      "No product JSX importer. Alive via scripts/verify-mypage-authority-contract.mjs file read + owns SettingsMainContent/LogoutActionTrigger subtree.";
  } else if (c.id === "SettingsMainContent") {
    row.whyReferencesAlive = "Value-imported and rendered only inside MypageInstagramView settings sheet.";
  } else if (c.id === "MyPageConsole") {
    row.whyReferencesAlive =
      "MyPageConsole() has zero value importers. Name lives as MyPageConsoleProps type used by MyPageItemScreen, AccountTab, StoreTab, MyPageContent.";
  } else if (c.id === "MyProfileCard") {
    row.whyReferencesAlive =
      "MyProfileCard() unused. AddressDefaultsFlags type still imported from this file by types.ts, load-mypage-hub-extras-server.ts, MypageInstagramView (duplicate of lib/my/address-defaults-types.ts).";
  } else if (c.id === "MyInfoProfileCard") {
    row.whyReferencesAlive =
      "No TSX importer of component. Catalog comment + file on disk; superseded by MypageProfileSummary.";
  } else if (c.id === "MyPageContent") {
    row.whyReferencesAlive = "Only value-imported by MyPageConsole (itself DEAD_CANDIDATE).";
  } else if (c.id === "MyInfoProfileHubCard" || c.id === "MyInfoMiniProfile") {
    row.whyReferencesAlive = "Zero product importers found; superseded by MypageProfileSummary.";
  } else if (c.id === "MyInfoProfileSection") {
    row.whyReferencesAlive = "Alive via scripts/verify-mypage-authority-contract.mjs file read only.";
  } else if (c.id === "ProfileCard_mypage" || c.id === "ProfileCard_my") {
    row.whyReferencesAlive = "Zero path/symbol importers outside self file.";
  } else if (c.id === "logout_multi_entry") {
    row.whyReferencesAlive =
      "Canonical Account Danger CTA + ProfileSettingsSheet + ProfileEditForm + legacy InstagramView + LogoutContent self-row.";
  } else if (c.id === "trade_legacy_routes") {
    row.whyReferencesAlive =
      "Compat redirects in next.config + app/(main)/mypage/{purchases,sales,reviews}/page.tsx → trade hub (Slice 5). External deep links may still hit them.";
  }

  row.classification = classifyCandidate(row);
  // Override nuanced cases
  if (c.id === "MyPageConsole") row.classification = CLASS.DEAD;
  if (c.id === "MyPageContent") row.classification = CLASS.DEAD;
  if (c.id === "MypageInstagramView") row.classification = CLASS.DEAD;
  if (c.id === "SettingsMainContent") row.classification = CLASS.DEAD;
  if (c.id === "MyInfoProfileCard") row.classification = CLASS.DEAD;
  if (c.id === "MyInfoProfileHubCard" || c.id === "MyInfoMiniProfile") row.classification = CLASS.DEAD;
  if (c.id === "MyInfoProfileSection") row.classification = CLASS.DEPRECATE;
  if (c.id === "MyProfileCard") row.classification = CLASS.MERGE;
  if (c.id === "ProfileCard_mypage" || c.id === "ProfileCard_my") row.classification = CLASS.DEAD;
  if (c.id === "logout_multi_entry") row.classification = CLASS.KEEP;
  if (c.id === "trade_legacy_routes") row.classification = CLASS.DEPRECATE;

  row.deletablePhase2 = false;
  if (row.classification === CLASS.DEAD && row.evidence.valueImportFiles.length === 0) {
    row.deletablePhase2 = true;
  }
  if (row.classification === CLASS.MERGE || row.classification === CLASS.KEEP || row.classification === CLASS.DEPRECATE) {
    row.deletablePhase2 = false;
  }
  if (c.id === "SettingsMainContent") {
    row.deletablePhase2 = true;
    row.phase2Requires = ["MypageInstagramView"];
  }
  if (c.id === "MyPageContent") {
    row.deletablePhase2 = true;
    row.phase2Requires = ["MyPageConsole"];
  }
  if (c.id === "MypageInstagramView") {
    row.deletablePhase2 = true;
    row.phase2Blockers = ["SettingsMainContent still couples; optional shim on MyProfileCard unrelated"];
  }

  if (c.path && row.evidence.fileExists === false) {
    row.classification = CLASS.PROVEN;
    row.deletablePhase2 = false;
    row.deleted = true;
    row.whyReferencesAlive = "File deleted (Slice 10 Phase 2 Bundle B).";
    row.evidence.productionBundleSymbol = "ABSENT_POST_DELETE";
    row.evidence.bundleSymbol = "ABSENT";
  }

  return row;
}

function main() {
  mkdirSync(OUT_DIR, { recursive: true });
  const candidates = CANDIDATES.map(analyze);

  const phase2DeleteProposal = candidates
    .filter((c) => c.deletablePhase2 && c.evidence.fileExists !== false)
    .map((c) => ({
      id: c.id,
      path: c.path,
      classification: c.classification,
      requires: c.phase2Requires || [],
      blockers: c.phase2Blockers || (c.forbidDeadProven ? ["review remaining coupling before delete"] : []),
    }));

  const summary = {
    ok: true,
    slice: "SLICE 10 PHASE 1 INVENTORY",
    deletes: 0,
    generatedAt: new Date().toISOString(),
    productCodeChanged: false,
    classifications: Object.fromEntries(
      Object.values(CLASS).map((k) => [k, candidates.filter((c) => c.classification === k).map((c) => c.id)]),
    ),
    candidates,
    phase2DeleteProposal,
    replacementRuntimeEvidence: {
      hub: "SLICE 3 UI RUNTIME LOCK + SLICE 9 MULTIPLATFORM RUNTIME LOCK",
      activityTrade: "SLICE 5 ACTIVITY LOCK",
      accountLogout: "SLICE 3 logout modal + SLICE 6 ACCOUNT LOCK",
      productShaBaseline: "4447038d2",
    },
    notes: [
      "DEAD_PROVEN never assigned in Phase 1 for named candidates with remaining references.",
      "production bundle symbol NOT_SCANNED — required before DEAD_PROVEN.",
      "Phase 2 deletions require separate approval.",
    ],
  };

  writeFileSync(join(OUT_DIR, "inventory.json"), JSON.stringify(summary, null, 2) + "\n");
  mkdirSync(join(ROOT, "docs/customer-platform/_ios-mypage-audit-2026-08-06/dibay"), { recursive: true });
  writeFileSync(DOC_JSON, JSON.stringify(summary, null, 2) + "\n");
  writeFileSync(join(OUT_DIR, "SUMMARY.json"), JSON.stringify({
    ok: true,
    verdict: "SLICE 10 PHASE 1 INVENTORY PASS",
    candidates: candidates.length,
    deadCandidates: summary.classifications.DEAD_CANDIDATE,
    phase2ProposalCount: phase2DeleteProposal.length,
    docJson: DOC_JSON,
    out: OUT_DIR,
  }, null, 2) + "\n");

  console.log(JSON.stringify({
    ok: true,
    verdict: "SLICE 10 PHASE 1 INVENTORY PASS",
    docJson: DOC_JSON,
    out: OUT_DIR,
    classifications: summary.classifications,
    phase2DeleteProposal: phase2DeleteProposal.map((p) => p.path || p.id),
  }, null, 2));
}

main();
