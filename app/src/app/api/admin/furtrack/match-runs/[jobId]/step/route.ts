import { NextResponse } from "next/server";

import { getCurrentAdmin } from "@/lib/auth";
import { stepFurtrackMatchRun } from "@/lib/furtrack-match";

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ jobId: string }> },
) {
  const admin = await getCurrentAdmin();

  if (!admin) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { jobId } = await params;

  try {
    const run = await stepFurtrackMatchRun(jobId);

    return NextResponse.json({ run });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Unable to step Furtrack match run.",
      },
      { status: 500 },
    );
  }
}
