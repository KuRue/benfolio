import "server-only";

import { revalidatePath } from "next/cache";

export function revalidateAdminTagPaths(tagIds: string[] = []) {
  revalidatePath("/admin");
  revalidatePath("/admin/events");
  revalidatePath("/admin/tags");

  for (const tagId of [...new Set(tagIds.filter(Boolean))]) {
    revalidatePath(`/admin/tags/${tagId}`);
  }
}
