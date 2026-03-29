import { NextResponse } from "next/server";
import { getJobStatus } from "@/lib/engine/scheduler";

export async function GET() {
  return NextResponse.json(getJobStatus());
}
