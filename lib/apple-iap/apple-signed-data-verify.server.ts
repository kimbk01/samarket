import { X509Certificate, verify as cryptoVerify } from "node:crypto";

/**
 * App Store 서명 데이터(JWS) 검증 — signedTransactionInfo · App Store Server Notifications V2 signedPayload.
 *
 * x5c 체인: leaf ← intermediate ← Apple Root CA - G3 (내장 신뢰 루트).
 * leaf OID 1.2.840.113635.100.6.11.1 · intermediate OID 1.2.840.113635.100.6.2.1 · ES256.
 * 인증서 유효기간은 페이로드 signedDate 기준 (Apple 권장, 만료 후 재검증 가능).
 */

/** Apple Root CA - G3 · SHA-256 63:34:3A:BF:…:3E:91:79 · 2039-04-30 만료 (https://www.apple.com/certificateauthority/) */
export const APPLE_ROOT_CA_G3_PEM = `-----BEGIN CERTIFICATE-----
MIICQzCCAcmgAwIBAgIILcX8iNLFS5UwCgYIKoZIzj0EAwMwZzEbMBkGA1UEAwwS
QXBwbGUgUm9vdCBDQSAtIEczMSYwJAYDVQQLDB1BcHBsZSBDZXJ0aWZpY2F0aW9u
IEF1dGhvcml0eTETMBEGA1UECgwKQXBwbGUgSW5jLjELMAkGA1UEBhMCVVMwHhcN
MTQwNDMwMTgxOTA2WhcNMzkwNDMwMTgxOTA2WjBnMRswGQYDVQQDDBJBcHBsZSBS
b290IENBIC0gRzMxJjAkBgNVBAsMHUFwcGxlIENlcnRpZmljYXRpb24gQXV0aG9y
aXR5MRMwEQYDVQQKDApBcHBsZSBJbmMuMQswCQYDVQQGEwJVUzB2MBAGByqGSM49
AgEGBSuBBAAiA2IABJjpLz1AcqTtkyJygRMc3RCV8cWjTnHcFBbZDuWmBSp3ZHtf
TjjTuxxEtX/1H7YyYl3J6YRbTzBPEVoA/VhYDKX1DyxNB0cTddqXl5dvMVztK517
IDvYuVTZXpmkOlEKMaNCMEAwHQYDVR0OBBYEFLuw3qFYM4iapIqZ3r6966/ayySr
MA8GA1UdEwEB/wQFMAMBAf8wDgYDVR0PAQH/BAQDAgEGMAoGCCqGSM49BAMDA2gA
MGUCMQCD6cHEFl4aXTQY2e3v9GwOAEZLuN+yRhHFD/3meoyhpmvOwgPUnPWTxnS4
at+qIxUCMG1mihDK1A3UT82NQz60imOlM27jbdoXt2QfyFMm+YhidDkLF1vLUagM
6BgD56KyKA==
-----END CERTIFICATE-----`;

/** DER: OBJECT IDENTIFIER 1.2.840.113635.100.6.11.1 (Mac App Store receipt signing) */
const LEAF_MARKER_OID_DER = Buffer.from([0x06, 0x0a, 0x2a, 0x86, 0x48, 0x86, 0xf7, 0x63, 0x64, 0x06, 0x0b, 0x01]);
/** DER: OBJECT IDENTIFIER 1.2.840.113635.100.6.2.1 (Apple WWDR intermediate) */
const INTERMEDIATE_MARKER_OID_DER = Buffer.from([0x06, 0x0a, 0x2a, 0x86, 0x48, 0x86, 0xf7, 0x63, 0x64, 0x06, 0x02, 0x01]);

export type AppleSignedDataErrorCode =
  | "malformed"
  | "unsupported_alg"
  | "chain_missing"
  | "chain_untrusted"
  | "marker_missing"
  | "cert_expired"
  | "signature_invalid";

export class AppleSignedDataError extends Error {
  readonly code: AppleSignedDataErrorCode;
  constructor(code: AppleSignedDataErrorCode) {
    super(`apple_signed_data_${code}`);
    this.code = code;
  }
}

export type AppleSignedDataVerifyOptions = {
  /** 테스트 전용 — 기본은 Apple Root CA - G3 만 신뢰 */
  trustedRootsPem?: readonly string[];
};

function decodeSegment(segment: string): Buffer {
  if (!/^[A-Za-z0-9_-]+$/.test(segment)) throw new AppleSignedDataError("malformed");
  return Buffer.from(segment, "base64url");
}

function parseJsonObject(buf: Buffer): Record<string, unknown> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(buf.toString("utf8"));
  } catch {
    throw new AppleSignedDataError("malformed");
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new AppleSignedDataError("malformed");
  }
  return parsed as Record<string, unknown>;
}

function toCert(raw: unknown): X509Certificate {
  if (typeof raw !== "string" || !raw) throw new AppleSignedDataError("chain_missing");
  try {
    return new X509Certificate(Buffer.from(raw, "base64"));
  } catch {
    throw new AppleSignedDataError("chain_missing");
  }
}

function validAt(cert: X509Certificate, at: number): boolean {
  const from = Date.parse(cert.validFrom);
  const to = Date.parse(cert.validTo);
  if (!Number.isFinite(from) || !Number.isFinite(to)) return false;
  return at >= from && at <= to;
}

/** JWS 검증 후 페이로드 반환. 실패 시 AppleSignedDataError. */
export function verifyAppleSignedData(
  jws: string,
  options: AppleSignedDataVerifyOptions = {}
): Record<string, unknown> {
  const parts = String(jws ?? "").trim().split(".");
  if (parts.length !== 3) throw new AppleSignedDataError("malformed");
  const [headerSeg, payloadSeg, signatureSeg] = parts as [string, string, string];

  const header = parseJsonObject(decodeSegment(headerSeg));
  if (header.alg !== "ES256") throw new AppleSignedDataError("unsupported_alg");
  const x5c = header.x5c;
  if (!Array.isArray(x5c) || x5c.length < 2) throw new AppleSignedDataError("chain_missing");

  const leaf = toCert(x5c[0]);
  const intermediate = toCert(x5c[1]);
  const roots = (options.trustedRootsPem ?? [APPLE_ROOT_CA_G3_PEM]).map((pem) => new X509Certificate(pem));

  if (leaf.ca || !intermediate.ca) throw new AppleSignedDataError("chain_untrusted");
  if (!leaf.checkIssued(intermediate) || !leaf.verify(intermediate.publicKey)) {
    throw new AppleSignedDataError("chain_untrusted");
  }
  const anchor = roots.find((root) => intermediate.checkIssued(root) && intermediate.verify(root.publicKey));
  if (!anchor) throw new AppleSignedDataError("chain_untrusted");
  if (x5c.length >= 3 && !toCert(x5c[2]).raw.equals(anchor.raw)) {
    throw new AppleSignedDataError("chain_untrusted");
  }

  if (!leaf.raw.includes(LEAF_MARKER_OID_DER) || !intermediate.raw.includes(INTERMEDIATE_MARKER_OID_DER)) {
    throw new AppleSignedDataError("marker_missing");
  }

  const payload = parseJsonObject(decodeSegment(payloadSeg));
  const signedDate = typeof payload.signedDate === "number" ? payload.signedDate : Date.now();
  if (!validAt(leaf, signedDate) || !validAt(intermediate, signedDate) || !validAt(anchor, signedDate)) {
    throw new AppleSignedDataError("cert_expired");
  }

  const signature = decodeSegment(signatureSeg);
  const ok = cryptoVerify(
    "sha256",
    Buffer.from(`${headerSeg}.${payloadSeg}`, "utf8"),
    { key: leaf.publicKey, dsaEncoding: "ieee-p1363" },
    signature
  );
  if (!ok) throw new AppleSignedDataError("signature_invalid");
  return payload;
}
