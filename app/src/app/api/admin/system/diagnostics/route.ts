import { NextResponse } from "next/server";

import { getCurrentAdmin } from "@/lib/auth";
import { getSystemDiagnostics } from "@/lib/system-status";

export async function POST() {
  const admin = await getCurrentAdmin();

  if (!admin) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const diagnostics = await getSystemDiagnostics();

    return NextResponse.json({
      diagnostics,
    });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Could not run diagnostics.",
      },
      { status: 500 },
    );
  }
}
