import Link from "next/link";

import { logoutAction } from "@/app/admin/actions";
import { AdminNav } from "@/components/admin/admin-nav";
import { requireAdmin } from "@/lib/auth";

export default async function AdminDashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const admin = await requireAdmin();

  return (
    <div className="min-h-screen">
      <header className="border-b border-white/8 bg-black/45 backdrop-blur-2xl">
        <div className="section-shell flex flex-col gap-4 py-5">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <Link href="/admin" className="font-serif text-3xl tracking-[-0.03em] text-white">
                Admin
              </Link>
              <p className="mt-1 text-sm text-white/52">
                Signed in as {admin.displayName}
              </p>
            </div>

            <form action={logoutAction}>
              <button
                type="submit"
                className="rounded-full border border-white/10 bg-white/4 px-4 py-2 text-sm text-white/72"
              >
                Sign out
              </button>
            </form>
          </div>

          <AdminNav />
        </div>
      </header>

      <main className="pb-20 pt-8">
        <div className="section-shell">{children}</div>
      </main>
    </div>
  );
}
