import { redirect } from "next/navigation";

import { bootstrapAction } from "@/app/admin/actions";
import { AuthForm } from "@/components/admin/auth-form";
import { getCurrentAdmin, hasAdminUsers } from "@/lib/auth";

export default async function AdminBootstrapPage() {
  const [admin, hasUsers] = await Promise.all([getCurrentAdmin(), hasAdminUsers()]);

  if (admin) {
    redirect("/admin");
  }

  if (hasUsers) {
    redirect("/admin/login");
  }

  return (
    <main className="flex min-h-screen items-center justify-center px-6 py-16">
      <AuthForm
        title="Create the first admin"
        description="Bootstrap the first internal account. After this step, future admins can be added directly in the database or a later settings milestone."
        action={bootstrapAction}
        includeDisplayName
        submitLabel="Create admin"
      />
    </main>
  );
}
