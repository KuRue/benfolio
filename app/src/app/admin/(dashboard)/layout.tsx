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
    <div className="min-h-screen bg-[radial-gradient(circle_at_top,_rgba(197,150,92,0.08),_transparent_22%),linear-gradient(180deg,_rgba(255,255,255,0.01),_transparent_12%)]">
      <header className="border-b border-white/8 bg-black/50 backdrop-blur-2xl">
        <div className="section-shell flex flex-col gap-3 py-3 sm:py-4">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="space-y-0.5">
              <p className="editorial-label">Admin</p>
              <Link href="/admin" className="font-serif text-[2rem] tracking-[-0.04em] text-white">
                Admin
              </Link>
              <p className="text-sm text-white/48">{admin.displayName}</p>
            </div>

            <form action={logoutAction}>
              <button type="submit" className="admin-button-muted">
                Sign out
              </button>
            </form>
          </div>

          <AdminNav />
        </div>
      </header>

      <main className="pb-20 pt-4 sm:pt-5">
        <div className="section-shell">{children}</div>
      </main>
    </div>
  );
}
