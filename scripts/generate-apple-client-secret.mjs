/**
 * Apple Sign in with Apple — JWT Client Secret 생성기
 *
 * .p8 private key 원문이 아니라 Supabase Apple Provider에 붙여넣을 JWT 문자열(eyJ…)을 출력합니다.
 * Team ID + Key ID + Services ID(client_id) + AuthKey_<KEY_ID>.p8 로 ES256 서명합니다.
 */
import fs from "node:fs";
import path from "node:path";
import { importPKCS8, SignJWT } from "jose";

const TEAM_ID = process.env.APPLE_TEAM_ID ?? "2TFKXT6Y99";
const KEY_ID = process.env.APPLE_KEY_ID ?? "3747N7936Z";
const CLIENT_ID = process.env.APPLE_CLIENT_ID ?? "com.dibay.login";
const AUTH_KEY_FILENAME = process.env.APPLE_AUTH_KEY_PATH ?? `AuthKey_${KEY_ID}.p8`;
const EXPIRY_DAYS = 180;

const root = process.cwd();
const authKeyPath = path.isAbsolute(AUTH_KEY_FILENAME)
  ? AUTH_KEY_FILENAME
  : path.join(root, AUTH_KEY_FILENAME);

if (!fs.existsSync(authKeyPath)) {
  console.error(`Apple Auth Key 파일을 찾을 수 없습니다: ${authKeyPath}`);
  console.error("프로젝트 루트에 AuthKey_<KEY_ID>.p8 를 두거나 APPLE_AUTH_KEY_PATH 로 경로를 지정하세요.");
  process.exit(1);
}

const privateKeyPem = fs.readFileSync(authKeyPath, "utf8");
const privateKey = await importPKCS8(privateKeyPem, "ES256");

const now = Math.floor(Date.now() / 1000);
const expiresAt = now + EXPIRY_DAYS * 24 * 60 * 60;

const clientSecret = await new SignJWT({})
  .setProtectedHeader({ alg: "ES256", kid: KEY_ID })
  .setIssuer(TEAM_ID)
  .setSubject(CLIENT_ID)
  .setAudience("https://appleid.apple.com")
  .setIssuedAt(now)
  .setExpirationTime(expiresAt)
  .sign(privateKey);

console.log(clientSecret);
