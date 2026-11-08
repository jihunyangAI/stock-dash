import { NextResponse } from "next/server";
import { searchStocks } from "@/lib/krx";

export async function GET(req: Request) {
  const q = new URL(req.url).searchParams.get("q")?.trim() ?? "";
  if (q.length < 1) return NextResponse.json({ results: [] });
  if (q.length > 30) return NextResponse.json({ error: "검색어가 너무 깁니다." }, { status: 400 });
  try {
    return NextResponse.json({ results: await searchStocks(q) });
  } catch (e: any) {
    return NextResponse.json({ error: e.message ?? "검색 실패" }, { status: 502 });
  }
}
