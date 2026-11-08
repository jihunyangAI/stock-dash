import { NextResponse } from "next/server";
import { CODE_RE, getDividendDoc } from "@/lib/store";
import { syncDividends } from "@/lib/dividends";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ code: string }> };

/** 종목 배당내역 조회. 하루 지난 데이터는 자동 갱신, ?refresh=1 이면 강제 갱신 */
export async function GET(req: Request, { params }: Ctx) {
  const { code } = await params;
  if (!CODE_RE.test(code)) return NextResponse.json({ error: "잘못된 종목코드" }, { status: 400 });

  const force = new URL(req.url).searchParams.get("refresh") === "1";
  try {
    return NextResponse.json(await syncDividends(code, force));
  } catch (e: any) {
    const cached = await getDividendDoc(code);
    if (cached) return NextResponse.json({ ...cached, warning: `배당정보 갱신 실패: ${e.message}` });
    return NextResponse.json({ error: e.message ?? "배당정보 조회 실패" }, { status: 502 });
  }
}
