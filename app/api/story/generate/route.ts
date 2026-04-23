import { NextRequest, NextResponse } from "next/server";
import { handleStoryGenerate } from "@/lib/api/story-generate";

function getIp(req: NextRequest): string {
  return req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "local";
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const result = await handleStoryGenerate(body, getIp(req));
    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    if (message === "RATE_LIMITED") {
      return NextResponse.json({ error: "Rate limited" }, { status: 429 });
    }
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
