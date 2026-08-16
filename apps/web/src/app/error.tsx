"use client";

import { useEffect } from "react";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error;
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <main className="grid min-h-dvh place-items-center px-6">
      <div className="panel max-w-md p-8 text-center">
        <h1 className="mb-2 text-xl font-semibold">
          This page didn&apos;t load
        </h1>
        <p className="mb-6 text-sm text-muted">
          Something went wrong on our side. Retrying usually fixes it.
        </p>
        <button onClick={reset} className="btn btn-primary">
          Try again
        </button>
      </div>
    </main>
  );
}
