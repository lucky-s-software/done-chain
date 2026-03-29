import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET() {
  try {
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

    const aggregations = await prisma.creditLedger.aggregate({
      _sum: {
        credits: true,
      },
      where: {
        createdAt: { gte: startOfMonth },
      },
    });

    return NextResponse.json({ total: aggregations._sum.credits ?? 0 });
  } catch (err) {
    console.error("[credits] error:", err);
    return NextResponse.json({ error: "Failed to load credits" }, { status: 500 });
  }
}
