import { NextResponse } from "next/server";
import { evaluateDailyClosure } from "@/lib/engine/closure";

export async function POST() {
  await evaluateDailyClosure(new Date());
  return NextResponse.json({ ok: true });
}
