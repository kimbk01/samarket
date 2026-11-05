import { execFileSync } from "node:child_process";
import { createPrivateKey, sign as cryptoSign } from "node:crypto";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import {
  AppleSignedDataError,
  verifyAppleSignedData,
} from "@/lib/apple-iap/apple-signed-data-verify.server";
import {
  parseAppleSignedTransaction,
  processAppleServerNotification,
  recordAndCreditAppleTransaction,
} from "@/lib/apple-iap/apple-iap-service.server";
import type { SupabaseClient } from "@supabase/supabase-js";

/** 테스트 전용 체인 — Apple 과 같은 OID 확장을 넣은 자체 서명 root ← intermediate ← leaf (실행 때 생성, 커밋 안 함) */
type Chain = { root: string; intDer: string; leafDer: string; leafNoOidDer: string; rootDer: string; leafKey: string };
let dir = "";
let chain: Chain;

function ossl(args: string[]) {
  execFileSync("openssl", args, { cwd: dir, stdio: "pipe" });
}
function derB64(pemFile: string): string {
  return readFileSync(path.join(dir, pemFile), "utf8").replace(/-----[^-]+-----/g, "").replace(/\s+/g, "");
}

beforeAll(() => {
  dir = mkdtempSync(path.join(tmpdir(), "apple-iap-test-"));
  const days = "36500";
  ossl(["ecparam", "-name", "prime256v1", "-genkey", "-noout", "-out", "root.key"]);
  ossl(["req", "-x509", "-new", "-key", "root.key", "-sha256", "-days", days, "-subj", "/CN=Test Root", "-out", "root.pem",
    "-addext", "basicConstraints=critical,CA:TRUE", "-addext", "keyUsage=critical,keyCertSign,cRLSign"]);
  ossl(["ecparam", "-name", "prime256v1", "-genkey", "-noout", "-out", "int.key"]);
  ossl(["req", "-new", "-key", "int.key", "-subj", "/CN=Test Intermediate", "-out", "int.csr"]);
  writeFileSync(path.join(dir, "int.ext"), "basicConstraints=critical,CA:TRUE\nkeyUsage=critical,keyCertSign,cRLSign\n1.2.840.113635.100.6.2.1=ASN1:NULL\n");
  ossl(["x509", "-req", "-in", "int.csr", "-CA", "root.pem", "-CAkey", "root.key", "-CAcreateserial", "-days", days, "-sha256", "-extfile", "int.ext", "-out", "int.pem"]);
  ossl(["ecparam", "-name", "prime256v1", "-genkey", "-noout", "-out", "leaf.key"]);
  ossl(["req", "-new", "-key", "leaf.key", "-subj", "/CN=Test Leaf", "-out", "leaf.csr"]);
  writeFileSync(path.join(dir, "leaf.ext"), "basicConstraints=critical,CA:FALSE\nkeyUsage=critical,digitalSignature\n1.2.840.113635.100.6.11.1=ASN1:NULL\n");
  writeFileSync(path.join(dir, "leaf2.ext"), "basicConstraints=critical,CA:FALSE\nkeyUsage=critical,digitalSignature\n");
  ossl(["x509", "-req", "-in", "leaf.csr", "-CA", "int.pem", "-CAkey", "int.key", "-CAcreateserial", "-days", days, "-sha256", "-extfile", "leaf.ext", "-out", "leaf.pem"]);
  ossl(["x509", "-req", "-in", "leaf.csr", "-CA", "int.pem", "-CAkey", "int.key", "-CAcreateserial", "-days", days, "-sha256", "-extfile", "leaf2.ext", "-out", "leaf-nooid.pem"]);
  chain = {
    root: readFileSync(path.join(dir, "root.pem"), "utf8"),
    rootDer: derB64("root.pem"),
    intDer: derB64("int.pem"),
    leafDer: derB64("leaf.pem"),
    leafNoOidDer: derB64("leaf-nooid.pem"),
    leafKey: readFileSync(path.join(dir, "leaf.key"), "utf8"),
  };
});

afterAll(() => {
  if (dir) rmSync(dir, { recursive: true, force: true });
});

function b64url(v: unknown): string {
  return Buffer.from(typeof v === "string" ? v : JSON.stringify(v)).toString("base64url");
}

function signJws(payload: Record<string, unknown>, opts: { x5c?: string[]; alg?: string } = {}): string {
  const header = b64url({ alg: opts.alg ?? "ES256", x5c: opts.x5c ?? [chain.leafDer, chain.intDer, chain.rootDer] });
  const body = b64url(payload);
  const sig = cryptoSign("sha256", Buffer.from(`${header}.${body}`), {
    key: createPrivateKey(chain.leafKey),
    dsaEncoding: "ieee-p1363",
  });
  return `${header}.${body}.${sig.toString("base64url")}`;
}

/** 체인은 테스트 실행 시각에 발급 — 서명 시각은 그 뒤여야 유효기간 안 */
const NOW = Date.now() + 60 * 60 * 1000;
const ATTEMPT = "6f1c2c1e-6a43-4f4b-9b55-2d1f0c3a9e10";
const CONFIG = { bundleId: "com.dibay.app", allowSandbox: false };
const trust = () => ({ trustedRootsPem: [chain.root] });

function txPayload(extra: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    transactionId: "2000000123456789",
    originalTransactionId: "2000000123456789",
    productId: "com.dibay.point.1000",
    bundleId: "com.dibay.app",
    type: "Consumable",
    environment: "Production",
    appAccountToken: ATTEMPT.toUpperCase(),
    purchaseDate: NOW,
    signedDate: NOW,
    price: 1000000,
    currency: "PHP",
    storefront: "PHL",
    ...extra,
  };
}

describe("verifyAppleSignedData", () => {
  it("accepts a valid chain + ES256 signature and returns the payload", () => {
    const out = verifyAppleSignedData(signJws({ a: 1, signedDate: NOW }), trust());
    expect(out.a).toBe(1);
  });

  it("rejects a tampered payload", () => {
    const [h, , s] = signJws({ a: 1, signedDate: NOW }).split(".");
    const forged = `${h}.${b64url({ a: 2, signedDate: NOW })}.${s}`;
    expect(() => verifyAppleSignedData(forged, trust())).toThrow(new AppleSignedDataError("signature_invalid"));
  });

  it("rejects chains that do not end at a trusted root (default = Apple Root CA G3 only)", () => {
    expect(() => verifyAppleSignedData(signJws({ signedDate: NOW }))).toThrow(new AppleSignedDataError("chain_untrusted"));
  });

  it("rejects a leaf without the App Store receipt-signing OID", () => {
    const jws = signJws({ signedDate: NOW }, { x5c: [chain.leafNoOidDer, chain.intDer, chain.rootDer] });
    expect(() => verifyAppleSignedData(jws, trust())).toThrow(new AppleSignedDataError("marker_missing"));
  });

  it("rejects non-ES256, missing chain, malformed input and out-of-validity signedDate", () => {
    expect(() => verifyAppleSignedData(signJws({ signedDate: NOW }, { alg: "HS256" }), trust())).toThrow(
      new AppleSignedDataError("unsupported_alg")
    );
    expect(() => verifyAppleSignedData(signJws({ signedDate: NOW }, { x5c: [chain.leafDer] }), trust())).toThrow(
      new AppleSignedDataError("chain_missing")
    );
    expect(() => verifyAppleSignedData("not-a-jws", trust())).toThrow(new AppleSignedDataError("malformed"));
    expect(() => verifyAppleSignedData(signJws({ signedDate: Date.UTC(2300, 0, 1) }), trust())).toThrow(
      new AppleSignedDataError("cert_expired")
    );
  });
});

describe("parseAppleSignedTransaction", () => {
  it("maps a verified consumable and lower-cases appAccountToken", () => {
    const r = parseAppleSignedTransaction(signJws(txPayload()), CONFIG, trust());
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.tx.appAccountToken).toBe(ATTEMPT);
    expect(r.tx.priceMilli).toBe(1000000);
    expect(r.tx.revokedAt).toBeNull();
  });

  it("rejects other bundles, non-consumables and Sandbox unless allowed", () => {
    expect(parseAppleSignedTransaction(signJws(txPayload({ bundleId: "x.y" })), CONFIG, trust())).toEqual({
      ok: false,
      error: "bundle_mismatch",
    });
    expect(parseAppleSignedTransaction(signJws(txPayload({ type: "Non-Consumable" })), CONFIG, trust())).toEqual({
      ok: false,
      error: "not_consumable",
    });
    const sandbox = signJws(txPayload({ environment: "Sandbox" }));
    expect(parseAppleSignedTransaction(sandbox, CONFIG, trust())).toEqual({ ok: false, error: "environment_not_allowed" });
    expect(parseAppleSignedTransaction(sandbox, { ...CONFIG, allowSandbox: true }, trust()).ok).toBe(true);
    expect(parseAppleSignedTransaction(signJws(txPayload({ environment: "Xcode" })), { ...CONFIG, allowSandbox: true }, trust()).ok).toBe(false);
  });

  it("reports signature failures without throwing", () => {
    expect(parseAppleSignedTransaction(signJws(txPayload()), CONFIG)).toEqual({
      ok: false,
      error: "signature_chain_untrusted",
    });
  });
});

/** RPC 결과를 함수 이름별로 돌려주는 최소 Supabase 대역 */
function fakeSb(rpcResults: Record<string, Array<Record<string, unknown>>>, attemptRow: Record<string, unknown>) {
  const calls: Array<{ fn: string; args: Record<string, unknown> }> = [];
  const rpc = vi.fn(async (fn: string, args: Record<string, unknown>) => {
    calls.push({ fn, args });
    const queue = rpcResults[fn] ?? [];
    return { data: queue.length > 1 ? queue.shift() : queue[0] ?? { ok: true }, error: null };
  });
  const chainObj = {
    select: () => chainObj,
    eq: () => chainObj,
    maybeSingle: async () => ({ data: attemptRow, error: null }),
  };
  const sb = { rpc, from: () => chainObj } as unknown as SupabaseClient;
  return { sb, calls };
}

const BASE_ROW = {
  id: ATTEMPT,
  kind: "point",
  user_id: "u-1",
  store_id: null,
  product_id: "com.dibay.point.1000",
  refund_status: "none",
  point_amount: 1000,
  cash_amount_minor: null,
  transaction_id: "2000000123456789",
  created_at: "2026-11-05T00:00:00Z",
  credited_at: null,
};

describe("recordAndCreditAppleTransaction", () => {
  it("records then credits once; reports credited phase", async () => {
    const parsed = parseAppleSignedTransaction(signJws(txPayload()), CONFIG, trust());
    if (!parsed.ok) throw new Error("parse");
    const { sb, calls } = fakeSb(
      {
        apple_iap_record_verified_transaction: [{ ok: true, duplicate: false, attempt_id: ATTEMPT, status: "received" }],
        apple_iap_credit: [{ ok: true, idempotent: false }],
      },
      { ...BASE_ROW, status: "credited", credited_at: "2026-11-05T00:00:01Z" }
    );
    const r = await recordAndCreditAppleTransaction(sb, parsed.tx, "app");
    expect(r).toMatchObject({ ok: true, phase: "credited", duplicate: false, creditError: null, ownerUserId: "u-1" });
    expect(calls.map((c) => c.fn)).toEqual(["apple_iap_record_verified_transaction", "apple_iap_credit"]);
    expect(calls[0]!.args.p_attempt_id).toBe(ATTEMPT);
    expect(calls[1]!.args.p_admin_user_id).toBeNull();
  });

  it("retries credit for an already-recorded transaction still in received (delayed credit)", async () => {
    const parsed = parseAppleSignedTransaction(signJws(txPayload()), CONFIG, trust());
    if (!parsed.ok) throw new Error("parse");
    const { sb, calls } = fakeSb(
      {
        apple_iap_record_verified_transaction: [{ ok: true, duplicate: true, attempt_id: ATTEMPT, status: "received" }],
        apple_iap_credit: [{ ok: true, idempotent: false }],
      },
      { ...BASE_ROW, status: "credited", credited_at: "2026-11-05T00:00:01Z" }
    );
    const r = await recordAndCreditAppleTransaction(sb, parsed.tx, "app");
    expect(r).toMatchObject({ ok: true, duplicate: true, phase: "credited" });
    expect(calls.filter((c) => c.fn === "apple_iap_credit")).toHaveLength(1);
  });

  it("does not credit duplicates that are already credited or in review", async () => {
    const parsed = parseAppleSignedTransaction(signJws(txPayload()), CONFIG, trust());
    if (!parsed.ok) throw new Error("parse");
    for (const status of ["credited", "review"]) {
      const { sb, calls } = fakeSb(
        { apple_iap_record_verified_transaction: [{ ok: true, duplicate: true, attempt_id: ATTEMPT, status }] },
        { ...BASE_ROW, status }
      );
      const r = await recordAndCreditAppleTransaction(sb, parsed.tx, "notification");
      expect(r.ok).toBe(true);
      expect(calls.some((c) => c.fn === "apple_iap_credit")).toBe(false);
    }
  });

  it("keeps the record when credit is refused and surfaces the reason", async () => {
    const parsed = parseAppleSignedTransaction(signJws(txPayload()), CONFIG, trust());
    if (!parsed.ok) throw new Error("parse");
    const { sb } = fakeSb(
      {
        apple_iap_record_verified_transaction: [{ ok: true, duplicate: false, attempt_id: ATTEMPT, status: "received" }],
        apple_iap_credit: [{ ok: false, error: "user_not_found" }],
      },
      { ...BASE_ROW, status: "received" }
    );
    const r = await recordAndCreditAppleTransaction(sb, parsed.tx, "app");
    expect(r).toMatchObject({ ok: true, phase: "verifying", creditError: "user_not_found" });
  });
});

describe("processAppleServerNotification", () => {
  function notification(type: string, txExtra: Record<string, unknown> = {}, dataExtra: Record<string, unknown> = {}) {
    return signJws({
      notificationType: type,
      notificationUUID: "11111111-2222-3333-4444-555555555555",
      signedDate: NOW,
      data: { bundleId: "com.dibay.app", environment: "Production", signedTransactionInfo: signJws(txPayload(txExtra)), ...dataExtra },
    });
  }

  it("ONE_TIME_CHARGE → record + credit + log (backup path when the app never reports)", async () => {
    const { sb, calls } = fakeSb(
      {
        apple_iap_record_verified_transaction: [{ ok: true, duplicate: false, attempt_id: ATTEMPT, status: "received" }],
        apple_iap_credit: [{ ok: true }],
        apple_iap_log_notification: [{ ok: true, duplicate: false }],
      },
      { ...BASE_ROW, status: "credited", credited_at: "2026-11-05T00:00:01Z" }
    );
    const out = await processAppleServerNotification(sb, notification("ONE_TIME_CHARGE"), CONFIG, trust());
    expect(out).toEqual({ httpStatus: 200, result: "charge_credited" });
    expect(calls.map((c) => c.fn)).toEqual([
      "apple_iap_record_verified_transaction",
      "apple_iap_credit",
      "apple_iap_log_notification",
    ]);
    expect(calls[0]!.args.p_via).toBe("notification");
  });

  it("REFUND → only the refund-review RPC changes state (no ledger call, no credit)", async () => {
    const { sb, calls } = fakeSb(
      {
        apple_iap_record_verified_transaction: [{ ok: true, duplicate: true, attempt_id: ATTEMPT, status: "credited" }],
        apple_iap_record_refund_notification: [{ ok: true, duplicate: false, result: "refund_status:review" }],
      },
      { ...BASE_ROW, status: "credited" }
    );
    const out = await processAppleServerNotification(
      sb,
      notification("REFUND", { revocationDate: NOW, revocationReason: 0 }),
      CONFIG,
      trust()
    );
    expect(out).toEqual({ httpStatus: 200, result: "refund_status:review" });
    expect(calls.some((c) => c.fn === "apple_iap_credit" || c.fn === "apple_iap_admin_decide_refund")).toBe(false);
    const refundCall = calls.find((c) => c.fn === "apple_iap_record_refund_notification")!;
    expect(refundCall.args).toMatchObject({ p_type: "REFUND", p_transaction_id: "2000000123456789", p_revocation_reason: "0" });
  });

  it("ignores other bundles / unsupported types with 200, rejects bad signatures with 400", async () => {
    const other = fakeSb({ apple_iap_log_notification: [{ ok: true }] }, BASE_ROW);
    expect(
      await processAppleServerNotification(other.sb, notification("ONE_TIME_CHARGE", {}, { bundleId: "x.y" }), CONFIG, trust())
    ).toEqual({ httpStatus: 200, result: "ignored_bundle" });
    const ignored = fakeSb({ apple_iap_log_notification: [{ ok: true }] }, BASE_ROW);
    expect(await processAppleServerNotification(ignored.sb, notification("CONSUMPTION_REQUEST"), CONFIG, trust())).toEqual({
      httpStatus: 200,
      result: "ignored_type",
    });
    const bad = fakeSb({}, BASE_ROW);
    expect(await processAppleServerNotification(bad.sb, notification("ONE_TIME_CHARGE"), CONFIG)).toEqual({
      httpStatus: 400,
      result: "signature_chain_untrusted",
    });
    expect(bad.calls).toHaveLength(0);
  });

  it("throws (→ route 500, Apple retries) when the DB call fails", async () => {
    const sb = {
      rpc: async () => ({ data: null, error: { message: "connection reset" } }),
      from: () => ({}),
    } as unknown as SupabaseClient;
    await expect(processAppleServerNotification(sb, notification("ONE_TIME_CHARGE"), CONFIG, trust())).rejects.toThrow(
      /connection reset/
    );
  });
});
