import { redirect } from "next/navigation";

import { loginAction } from "@/app/admin/actions";
import { AuthForm } from "@/components/admin/auth-form";
import { getCurrentAdmin, hasAdminUsers } from "@/lib/auth";

export default async function AdminLoginPage() {
  const [admin, hasUsers] = await Promise.all([getCurrentAdmin(), hasAdminUsers()]);

  if (admin) {
    redirect("/admin");
  }

  if (!hasUsers) {
    redirect("/admin/bootstrap");
  }

  return (
    <main className="flex min-h-screen items-center justify-center px-6 py-16">
      <AuthForm
        title="Sign in to the admin panel"
        description="Credential-based authentication protects event management, uploads, and original download controls."
        action={loginAction}
        submitLabel="Sign in"
      />
    </main>
  );
}
