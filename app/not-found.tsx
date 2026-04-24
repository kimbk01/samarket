import Link from "next/link";

/**
 * Root layout still wraps this route (no raw html/body here).
 * See global-error.tsx when the root layout fails.
 */
export default function NotFound() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-sam-app px-4 text-center">
      <p className="sam-text-hero font-bold text-sam-meta">404</p>
      <p className="mt-2 sam-text-body-lg font-medium text-sam-fg">???? ?? ? ???.</p>
      <p className="mt-2 sam-text-body-secondary text-sam-muted">
        ??? ?? ????? ??? ??? ???.
      </p>
      <Link
        href="/home"
        className="mt-8 rounded-ui-rect bg-signature px-6 py-2.5 sam-text-body font-medium text-white"
      >
        ??? ??
      </Link>
    </div>
  );
}
