import { NextResponse } from "next/server";
import { getStreakInfo } from "@/lib/engine/closure";

export async function GET() {
  try {
    const info = await getStreakInfo();
    return NextResponse.json(info);
  } catch (err) {
    console.error("[streak] error:", err);
    return NextResponse.json({ error: "Failed to load streak count" }, { status: 500 });
  }
}
