import Link from "next/link";

export default function Forbidden() {
  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-2 p-8 text-center">
      <h1 className="text-2xl font-semibold">403 — Not allowed</h1>
      <p className="text-muted-foreground">Your account doesn&apos;t have access to this page.</p>
      <Link href="/dashboard" className="underline">
        Go to your dashboard
      </Link>
    </main>
  );
}
