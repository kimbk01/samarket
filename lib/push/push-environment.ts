export const PUSH_ENVIRONMENTS = [
  "production",
  "preview",
  "development",
] as const;

export type PushEnvironment = (typeof PUSH_ENVIRONMENTS)[number];

export function resolvePushEnvironment(
  env: Partial<Pick<NodeJS.ProcessEnv, "VERCEL_ENV" | "NODE_ENV">> = process.env
): PushEnvironment {
  const vercel = String(env.VERCEL_ENV ?? "").trim().toLowerCase();
  if (vercel === "production") return "production";
  if (vercel === "preview") return "preview";
  return env.NODE_ENV === "production" ? "production" : "development";
}
