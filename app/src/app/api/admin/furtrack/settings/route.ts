import { NextResponse } from "next/server";
import { z } from "zod";

import {
  getAdminFurtrackSettings,
  updateAdminFurtrackSettings,
} from "@/lib/admin-furtrack-settings";
import { getCurrentAdmin } from "@/lib/auth";

const furtrackSettingsSchema = z.object({
  authToken: z.string().optional(),
  baseUrl: z.string().url().optional().or(z.literal("")),
  impersonate: z.string().min(1).max(64).optional().or(z.literal("")),
  clearToken: z.boolean().optional(),
});

export async function GET() {
  const admin = await getCurrentAdmin();

  if (!admin) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  return NextResponse.json({
    settings: await getAdminFurtrackSettings(),
  });
}

export async function POST(request: Request) {
  const admin = await getCurrentAdmin();

  if (!admin) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let payload: unknown;

  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const parsed = furtrackSettingsSchema.safeParse(payload);

  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid Furtrack settings payload." },
      { status: 400 },
    );
  }

  try {
    const settings = await updateAdminFurtrackSettings(parsed.data);

    return NextResponse.json({
      message: "Furtrack settings saved.",
      settings,
    });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Unable to save Furtrack settings.",
      },
      { status: 500 },
    );
  }
}
