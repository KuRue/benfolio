import Link from "next/link";

export default function NotFound() {
  return (
    <main className="flex min-h-screen items-center justify-center px-6">
      <div className="admin-card max-w-xl space-y-5 px-8 py-10 text-center">
        <p className="editorial-label">404</p>
        <h1 className="font-serif text-4xl tracking-[-0.03em] text-white">
          The photograph is not here.
        </h1>
        <p className="text-sm leading-7 text-white/62">
          The requested event or photo could be unpublished, removed, or never
          belonged to this archive.
        </p>
        <Link href="/" className="glass-chip inline-flex text-sm text-white/78">
          Return home
        </Link>
      </div>
    </main>
  );
}
