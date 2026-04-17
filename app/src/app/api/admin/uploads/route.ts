import { NextResponse } from "next/server";
import { z } from "zod";

import { getCurrentAdmin } from "@/lib/auth";
import { prepareDirectUploadSession } from "@/lib/admin-upload-sessions";

const prepareUploadSchema = z
  .object({
    mode: z.enum(["existing", "create"]),
    eventId: z.string().trim().optional(),
    title: z.string().trim().optional(),
    slug: z.string().trim().optional(),
    location: z.string().trim().optional(),
    description: z.string().trim().optional(),
    visibility: z.enum(["DRAFT", "HIDDEN", "PUBLIC"]).optional(),
    files: z
      .array(
        z.object({
          clientId: z.string().trim().min(1),
          name: z.string().trim().min(1),
          size: z.number().int().nonnegative(),
          type: z.string().trim().default("application/octet-stream"),
          lastModified: z.number().int().nonnegative().nullable().default(null),
        }),
      )
      .min(1),
  })
  .superRefine((value, context) => {
    if (value.mode === "existing" && !value.eventId?.trim()) {
      context.addIssue({
        code: "custom",
        message: "Select an event before uploading.",
        path: ["eventId"],
      });
    }

    if (value.mode === "create") {
      if (!value.title?.trim()) {
        context.addIssue({
          code: "custom",
          message: "New uploads need an event title.",
          path: ["title"],
        });
      }
    }
  });

export async function POST(request: Request) {
  const admin = await getCurrentAdmin();

  if (!admin) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await request.json();
    const input = prepareUploadSchema.parse(body);
    const session = await prepareDirectUploadSession({
      adminId: admin.id,
      ...input,
    });

    return NextResponse.json(session);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: error.issues[0]?.message ?? "Upload request is invalid." },
        { status: 400 },
      );
    }

    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Could not prepare direct uploads.",
      },
      { status: 400 },
    );
  }
}
