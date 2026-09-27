import Link from "next/link";

export default function Home() {
  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-4 p-8">
      <h1 className="text-3xl font-semibold tracking-tight">Mixdrop</h1>
      <p className="text-muted-foreground">Mixing &amp; mastering, ordered online.</p>
      <div className="flex gap-4 text-sm">
        <Link href="/signup" className="underline">Sign up</Link>
        <Link href="/login" className="underline">Log in</Link>
      </div>
    </main>
  );
}
