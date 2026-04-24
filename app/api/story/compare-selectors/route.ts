import { NextRequest, NextResponse } from "next/server";
import { handleStoryCompareSelectors } from "@/lib/api/story-compare-selectors";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const result = await handleStoryCompareSelectors(body);
    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    if (message === "RATE_LIMITED") {
      return NextResponse.json({ error: "Rate limited" }, { status: 429 });
    }
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
