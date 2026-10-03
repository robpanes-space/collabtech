import Link from "next/link";

export default function SprintNotFound() {
  return (
    <div className="mx-auto flex max-w-lg flex-col items-center gap-2 py-16 text-center">
      <p className="text-sm font-medium text-muted-foreground">404</p>
      <h1 className="text-lg font-semibold">Sprint not found</h1>
      <p className="text-sm text-muted-foreground">The requested sprint does not exist in the current Jira project.</p>
      <Link href="/sprints" className="mt-2 text-sm font-medium underline underline-offset-4">
        Back to Sprints
      </Link>
    </div>
  );
}
