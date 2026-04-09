type RequireSupabaseEnvOptions = {
  requireAnonKey?: boolean;
  requireServiceKey?: boolean;
};

type RequireSupabaseEnvSuccess = {
  ok: true;
  url: string;
  anonKey: string | null;
  serviceKey: string | null;
};

type RequireSupabaseEnvSuccessWithAnon = {
  ok: true;
  url: string;
  anonKey: string;
  serviceKey: string | null;
};

type RequireSupabaseEnvSuccessWithService = {
  ok: true;
  url: string;
  anonKey: string | null;
  serviceKey: string;
};

type RequireSupabaseEnvSuccessFull = {
  ok: true;
  url: string;
  anonKey: string;
  serviceKey: string;
};

type RequireSupabaseEnvFailure = {
  ok: false;
  error: string;
  missing: string[];
};

function readEnv(name: string): string | null {
  const value = process.env[name]?.trim();
  return value ? value : null;
}

export function formatMissingEnvError(missing: string[]): string {
  return `필수 환경변수 누락: ${missing.join(", ")}`;
}

export function requireSupabaseEnv(
  options: { requireAnonKey: true; requireServiceKey: true }
): RequireSupabaseEnvSuccessFull | RequireSupabaseEnvFailure;
export function requireSupabaseEnv(
  options: { requireAnonKey: true; requireServiceKey?: false | undefined }
): RequireSupabaseEnvSuccessWithAnon | RequireSupabaseEnvFailure;
export function requireSupabaseEnv(
  options: { requireAnonKey?: false | undefined; requireServiceKey: true }
): RequireSupabaseEnvSuccessWithService | RequireSupabaseEnvFailure;
export function requireSupabaseEnv(
  options?: RequireSupabaseEnvOptions
): RequireSupabaseEnvSuccess | RequireSupabaseEnvFailure;
export function requireSupabaseEnv(
  options: RequireSupabaseEnvOptions = {}
): RequireSupabaseEnvSuccess | RequireSupabaseEnvFailure {
  const url = readEnv("NEXT_PUBLIC_SUPABASE_URL");
  const anonKey = readEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY");
  const serviceKey = readEnv("SUPABASE_SERVICE_ROLE_KEY");
  const missing: string[] = [];

  if (!url) missing.push("NEXT_PUBLIC_SUPABASE_URL");
  if (options.requireAnonKey && !anonKey) missing.push("NEXT_PUBLIC_SUPABASE_ANON_KEY");
  if (options.requireServiceKey && !serviceKey) missing.push("SUPABASE_SERVICE_ROLE_KEY");

  if (missing.length > 0) {
    return {
      ok: false,
      error: formatMissingEnvError(missing),
      missing,
    };
  }

  return {
    ok: true,
    url: url as string,
    anonKey: (options.requireAnonKey ? anonKey || "" : anonKey) as string | null,
    serviceKey: (options.requireServiceKey ? serviceKey || "" : serviceKey) as string | null,
  };
}

export function getSiteOrigin(): string | null {
  const explicit = readEnv("NEXT_PUBLIC_SITE_URL")?.replace(/\/$/, "");
  if (explicit) return explicit;

  const vercel = readEnv("VERCEL_URL");
  if (vercel) return `https://${vercel.replace(/^https?:\/\//, "")}`;

  return null;
}
