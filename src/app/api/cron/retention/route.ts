import { NextResponse } from "next/server";
import { enforceRetentionPolicy } from "@/lib/engine/retention";

export async function POST() {
  const result = await enforceRetentionPolicy();
  return NextResponse.json(result);
}
