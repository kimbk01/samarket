/**
 * Phase 11C.5 unit tests — cutover invariants · API failure · HTTP gate · dual-write.
 */
import { describe, expect, it } from "vitest";
import {
  DIBAY_MESSENGER_DOMAIN_API_ISOLATED_HEADER,
  DIBAY_MESSENGER_DOMAIN_API_ISOLATED_VALUE,
} from "@/lib/messenger/contracts/phase11a-domain-api-gate";
import {
  DIBAY_MESSENGER_DOMAIN_API_QA_SECRET_ENV,
  DIBAY_MESSENGER_DOMAIN_API_QA_SECRET_HEADER,
  resolvePhase11bApiAccessMode,
  phase11bApiGateResponse,
} from "@/lib/messenger/contracts/phase11b-isolated-qa-gate";
import { gateDomainBootstrapApiRequest } from "@/lib/messenger/contracts/phase6-api-route";
import {
  PHASE11C5_ATOMIC_READ_RUNTIME_PASS,
  PHASE11C5_LAYER_CUTOVER_PRODUCTION_ON,
  PHASE11C5_NOTIFICATION_PRODUCTION_WIRING_READY,
  assertPhase11c5CutoverInvariants,
  buildPhase11c5DefaultOffMatrix,
  validatePhase11c5ProposedStates,
  isPhase11c5LayerWritable,
} from "@/lib/messenger/contracts/phase11c5-cutover-layer-state";
import {
  applyDomainApiFailureWithoutCacheWipe,
  assertDomainApiFailureNotEmptySuccess,
  mergeShellDomainStates,
  parseBootstrapHttpOutcome,
} from "@/lib/messenger/contracts/phase11c5-api-failure-contract";
import { generalDirectPhase6Cache } from "@/lib/messenger/general-direct/phase6-bootstrap";
import { DOMAIN_BOOTSTRAP_SCHEMA_VERSION } from "@/lib/messenger/contracts/domain-bootstrap-cache";
import { MESSENGER_DOMAIN_BUILD_PHASE_ORDER } from "@/lib/messenger/contracts/phase-order";
import { PHASE11C5_LOADER_QUERY_CATALOG } from "@/lib/messenger/contracts/phase11c5-loader-query-catalog";
import { assertNoDualWrite } from "@/lib/messenger/contracts/cutover";

const SECRET = "phase11c5-qa-secret-xx";

function req(headers: Record<string, string> = {}) {
  return new Request("http://localhost/api/messenger/general/bootstrap", { headers });
}

describe("Phase 11C.5 — HTTP secret gate", () => {
  it("secret matrix: none / wrong / header-only / good → 503 or authorized", () => {
    const envEmpty = { ...process.env };
    delete envEmpty[DIBAY_MESSENGER_DOMAIN_API_QA_SECRET_ENV];

    expect(resolvePhase11bApiAccessMode(req(), envEmpty)).toBe("production_disabled");
    expect(gateDomainBootstrapApiRequest(req(), "general_direct").ok).toBe(false);

    const envSecret = { ...process.env, [DIBAY_MESSENGER_DOMAIN_API_QA_SECRET_ENV]: SECRET };

    expect(
      resolvePhase11bApiAccessMode(
        req({ [DIBAY_MESSENGER_DOMAIN_API_ISOLATED_HEADER]: DIBAY_MESSENGER_DOMAIN_API_ISOLATED_VALUE }),
        envSecret
      )
    ).toBe("isolated_rejected_bad_secret");

    expect(
      resolvePhase11bApiAccessMode(
        req({ [DIBAY_MESSENGER_DOMAIN_API_QA_SECRET_HEADER]: SECRET }),
        envSecret
      )
    ).toBe("isolated_rejected_missing_mode");

    expect(
      resolvePhase11bApiAccessMode(
        req({
          [DIBAY_MESSENGER_DOMAIN_API_ISOLATED_HEADER]: DIBAY_MESSENGER_DOMAIN_API_ISOLATED_VALUE,
          [DIBAY_MESSENGER_DOMAIN_API_QA_SECRET_HEADER]: "wrong-secret-xxxxxxxx",
        }),
        envSecret
      )
    ).toBe("isolated_rejected_bad_secret");

    expect(
      resolvePhase11bApiAccessMode(
        req({
          [DIBAY_MESSENGER_DOMAIN_API_ISOLATED_HEADER]: DIBAY_MESSENGER_DOMAIN_API_ISOLATED_VALUE,
          [DIBAY_MESSENGER_DOMAIN_API_QA_SECRET_HEADER]: SECRET,
        }),
        envSecret
      )
    ).toBe("isolated_authorized");

    const denied = phase11bApiGateResponse("trade", "isolated_rejected_bad_secret");
    expect(denied?.status).toBe(503);
  });
});

describe("Phase 11C.5 — cutover layer design", () => {
  it("default matrix all off; production on flag false", () => {
    expect(PHASE11C5_LAYER_CUTOVER_PRODUCTION_ON).toBe(false);
    expect(PHASE11C5_ATOMIC_READ_RUNTIME_PASS).toBe(false);
    expect(PHASE11C5_NOTIFICATION_PRODUCTION_WIRING_READY).toBe(false);
    const matrix = buildPhase11c5DefaultOffMatrix();
    expect(() => assertPhase11c5CutoverInvariants({ states: matrix })).not.toThrow();
    expect(matrix.every((s) => s.mode === "off")).toBe(true);
    expect(matrix.some((s) => s.domain === "store_order" && s.surface === "customer")).toBe(true);
    expect(matrix.some((s) => s.domain === "store_order" && s.surface === "owner")).toBe(true);
  });

  it("rejects impossible combinations", () => {
    const base = buildPhase11c5DefaultOffMatrix();
    const shellOn = base.map((s) =>
      s.domain === "general_direct" && s.layer === "shell_read" ? { ...s, mode: "on" as const } : s
    );
    expect(validatePhase11c5ProposedStates(shellOn).ok).toBe(false);

    const cacheOn = base.map((s) =>
      s.domain === "trade" && s.layer === "cache_write" ? { ...s, mode: "on" as const } : s
    );
    expect(validatePhase11c5ProposedStates(cacheOn).ok).toBe(false);

    const rtOn = base.map((s) => {
      if (s.domain !== "group") return s;
      if (s.layer === "bootstrap_read") return { ...s, mode: "on" as const };
      if (s.layer === "realtime_apply") return { ...s, mode: "on" as const };
      return s;
    });
    expect(validatePhase11c5ProposedStates(rtOn).ok).toBe(false);

    const readWriteOn = base.map((s) =>
      s.domain === "general_direct" && s.layer === "read_write"
        ? { ...s, mode: "on" as const }
        : s.domain === "general_direct" && s.layer === "bootstrap_read"
          ? { ...s, mode: "on" as const }
          : s
    );
    expect(
      validatePhase11c5ProposedStates(readWriteOn, { atomicReadRuntimePass: false }).ok
    ).toBe(false);

    expect(() => assertNoDualWrite(["legacy", "domain"])).toThrow(/dual_write/);
    expect(isPhase11c5LayerWritable("killed")).toBe(false);
  });

  it("phase order lists 11C.5 readiness", () => {
    expect(MESSENGER_DOMAIN_BUILD_PHASE_ORDER.some((p) => Number(p.phase) === 11.35)).toBe(true);
  });
});

describe("Phase 11C.5 — API failure / empty contract", () => {
  it("503/500/timeout must not become empty success; cache wipe forbidden", () => {
    const fail503 = parseBootstrapHttpOutcome({ domain: "trade", httpStatus: 503 });
    expect(fail503.ok).toBe(false);
    if (fail503.ok) return;
    expect(() =>
      assertDomainApiFailureNotEmptySuccess({
        failure: fail503.failure,
        interpretedAsEmptyRows: true,
      })
    ).toThrow(/failure_as_empty/);

    const key = generalDirectPhase6Cache.buildCacheKey({
      viewerUserId: "viewer-c5",
      generation: "1",
    });
    generalDirectPhase6Cache.writeFullSnapshot(
      key,
      {
        domain: "general_direct",
        viewerUserId: "viewer-c5",
        generation: "1",
        schemaVersion: DOMAIN_BOOTSTRAP_SCHEMA_VERSION,
        producedAt: new Date().toISOString(),
        rows: [
          {
            roomId: "r1",
            chatDomain: "general_direct",
            domainIdentityKey: "general_direct:a:b",
            peerUserId: "b",
            peerDisplayName: "x",
            peerAvatarUrl: null,
            lastMessage: "hi",
            lastMessageAt: "2026-07-14T00:00:00.000Z",
            unreadCount: 1,
            updatedAt: "2026-07-14T00:00:00.000Z",
            generation: "1",
          },
        ],
      },
      "test"
    );
    expect(() =>
      applyDomainApiFailureWithoutCacheWipe({
        cache: generalDirectPhase6Cache,
        cacheKey: key,
        failure: fail503.failure,
        wipeCacheWithEmpty: true,
      })
    ).toThrow(/cache_wipe/);
    const state = applyDomainApiFailureWithoutCacheWipe({
      cache: generalDirectPhase6Cache,
      cacheKey: key,
      failure: fail503.failure,
      wipeCacheWithEmpty: false,
    });
    expect(state.status).toBe("error");
    expect(generalDirectPhase6Cache.readSnapshot(key)?.rows).toHaveLength(1);

    const merged = mergeShellDomainStates({
      domains: [
        { domain: "general_direct", state: { status: "ok", rowCount: 1 } },
        { domain: "trade", state: { status: "error", failure: fail503.failure } },
      ],
    });
    expect(merged.errorDomains).toEqual(["trade"]);
    expect(merged.okDomains).toEqual(["general_direct"]);
    expect(merged.mergedLegacyFallback).toBe(false);
  });

  it("empty partial wipe remains forbidden at cache port", () => {
    const key = generalDirectPhase6Cache.buildCacheKey({
      viewerUserId: "viewer-c5b",
      generation: "2",
    });
    generalDirectPhase6Cache.writeFullSnapshot(
      key,
      {
        domain: "general_direct",
        viewerUserId: "viewer-c5b",
        generation: "2",
        schemaVersion: DOMAIN_BOOTSTRAP_SCHEMA_VERSION,
        producedAt: new Date().toISOString(),
        rows: [
          {
            roomId: "r2",
            chatDomain: "general_direct",
            domainIdentityKey: "general_direct:c:d",
            peerUserId: "d",
            peerDisplayName: "y",
            peerAvatarUrl: null,
            lastMessage: "a",
            lastMessageAt: "2026-07-14T00:00:00.000Z",
            unreadCount: 0,
            updatedAt: "2026-07-14T00:00:00.000Z",
            generation: "2",
          },
        ],
      },
      "test"
    );
    const after = generalDirectPhase6Cache.applyPartial(
      key,
      { generation: "3", rows: [] },
      "test"
    );
    expect(after.rows).toHaveLength(1);
  });
});

describe("Phase 11C.5 — query catalog present", () => {
  it("lists all live loader domains with required queries", () => {
    expect(PHASE11C5_LOADER_QUERY_CATALOG.filter((r) => r.domain === "general_direct")).toHaveLength(
      3
    );
    expect(PHASE11C5_LOADER_QUERY_CATALOG.filter((r) => r.domain === "store_order_owner")).toHaveLength(
      6
    );
    expect(PHASE11C5_LOADER_QUERY_CATALOG.every((r) => r.required)).toBe(true);
  });
});
