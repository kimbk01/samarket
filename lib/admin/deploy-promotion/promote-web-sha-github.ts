/**
 * Git-mediated Web promote: move origin/main to an exact verified SHA.
 * Requires Owner-configured token — never logs the token.
 */

export type PromoteWebShaResult =
  | { ok: true; mode: "github_update_ref"; sha: string; ref: string }
  | { ok: false; error: string; ownerAction?: string };

export async function promoteWebShaViaGithub(input: {
  sha: string;
  env?: NodeJS.ProcessEnv;
}): Promise<PromoteWebShaResult> {
  const env = input.env ?? process.env;
  const token = (env.DIBAY_PROMOTE_GITHUB_TOKEN ?? env.GITHUB_TOKEN ?? "").trim();
  const repo =
    (env.DIBAY_PROMOTE_GITHUB_REPO ?? env.GITHUB_REPOSITORY ?? "kimbk01/samarket").trim();
  const ref = (env.DIBAY_PROMOTE_GITHUB_REF ?? "main").trim().replace(/^refs\/heads\//, "");

  if ((env.DIBAY_PROMOTE_ENABLED ?? "").trim() !== "1") {
    return {
      ok: false,
      error: "promote_not_enabled",
      ownerAction:
        "Set DIBAY_PROMOTE_ENABLED=1 and DIBAY_PROMOTE_GITHUB_TOKEN on the admin-capable server (TEST or controlled ops host). Do not put the token in Production public env.",
    };
  }
  if (!token) {
    return {
      ok: false,
      error: "promote_token_missing",
      ownerAction: "Create a GitHub fine-grained token with Contents:write on the repo; set DIBAY_PROMOTE_GITHUB_TOKEN.",
    };
  }

  const sha = input.sha.trim().toLowerCase();
  const res = await fetch(`https://api.github.com/repos/${repo}/git/refs/heads/${ref}`, {
    method: "PATCH",
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${token}`,
      "X-GitHub-Api-Version": "2022-11-28",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ sha, force: false }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    return {
      ok: false,
      error: `github_update_ref_failed:${res.status}`,
      ownerAction: body.slice(0, 200) || "Check branch protection and token permissions.",
    };
  }

  return { ok: true, mode: "github_update_ref", sha, ref };
}
