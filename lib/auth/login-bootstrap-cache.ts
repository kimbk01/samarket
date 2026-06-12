import type { AuthProviderPublic } from "@/lib/auth/auth-providers";

const LOGIN_BOOTSTRAP_CACHE_TTL_MS = 30_000;

export type LoginBootstrapSnapshot = {
  providers: AuthProviderPublic[];
  providersError: string | null;
  passwordEnabled: boolean;
  cachedAt: number;
};

let loginBootstrapSnapshot: LoginBootstrapSnapshot | null = null;

export function readLoginBootstrapSnapshot(): LoginBootstrapSnapshot | null {
  if (!loginBootstrapSnapshot) return null;
  if (Date.now() - loginBootstrapSnapshot.cachedAt > LOGIN_BOOTSTRAP_CACHE_TTL_MS) return null;
  return loginBootstrapSnapshot;
}

export function writeLoginBootstrapSnapshot(snapshot: LoginBootstrapSnapshot): void {
  loginBootstrapSnapshot = snapshot;
}

export function clearLoginBootstrapSnapshot(): void {
  loginBootstrapSnapshot = null;
}
