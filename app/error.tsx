"use client";

import { useEffect } from "react";
import Link from "next/link";

interface ErrorProps {
  error: Error & { digest?: string };
  reset: () => void;
}

export default function RootError({ error, reset }: ErrorProps) {
  useEffect(() => {
    console.error("[RootError]", error);
  }, [error]);

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-sam-app px-4 antialiased">
      <div className="flex flex-col items-center justify-center text-center">
        <p className="sam-text-body font-medium text-sam-fg">???? ??? ?????.</p>
        <p className="mt-2 sam-text-body-secondary text-sam-muted">?? ? ?? ??? ???.</p>
        <div className="mt-8 flex flex-col gap-3">
          <button
            type="button"
            onClick={reset}
            className="rounded-ui-rect bg-signature px-4 py-2 sam-text-body font-medium text-white"
          >
            ?? ??
          </button>
          <Link href="/home" className="sam-text-body font-medium text-signature">
            ??? ??
          </Link>
        </div>
      </div>
    </div>
  );
}
