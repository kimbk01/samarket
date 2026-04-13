/**
 * Route Handler에서 현재 사용자 UUID.
 * `getOptionalAuthenticatedUserId` 와 동일 — JWT·인플라이트 dedupe 단일 경로.
 *
 * Kasama: `api-session` 내 동일 정책.
 */
export { getOptionalAuthenticatedUserId as getRouteUserId } from "@/lib/auth/api-session";
