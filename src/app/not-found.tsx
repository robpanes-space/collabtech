import Link from "next/link";

export default function NotFound() {
  return (
    <main id="main" className="flex flex-1 items-center justify-center px-4 py-16">
      <div className="flex max-w-md flex-col items-center gap-2 text-center">
        <p className="text-sm font-medium text-muted-foreground">404</p>
        <h1 className="text-xl font-semibold">Page not found</h1>
        <p className="text-sm text-muted-foreground">The page you requested does not exist.</p>
        <div className="mt-3 flex gap-4 text-sm font-medium">
          <Link href="/" className="underline underline-offset-4">
            Overview
          </Link>
          <Link href="/sprints" className="underline underline-offset-4">
            Sprints
          </Link>
        </div>
      </div>
    </main>
  );
}
