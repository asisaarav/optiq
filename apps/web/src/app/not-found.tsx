import Link from "next/link";

export default function NotFound() {
  return (
    <main className="grid min-h-dvh place-items-center px-6">
      <div className="max-w-md text-center">
        <h1 className="text-7xl font-bold">404</h1>
        <h2 className="mt-3 text-xl font-semibold">Page not found</h2>
        <p className="mt-2 text-sm text-muted">
          The page you were looking for doesn&apos;t exist or has moved.
        </p>
        <Link href="/" className="btn btn-primary mt-6">
          Go home
        </Link>
      </div>
    </main>
  );
}
