import { NextResponse } from "next/server";
import { CODE_RE, getPriceDoc, getWatchlist } from "@/lib/store";
import { MIN_DATE, backfillPrices, syncPrices } from "@/lib/sync";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ code: string }> };

/**
 * 종목 일별시세 조회
 *   - 오래된 데이터는 자동 갱신, ?refresh=1 이면 강제 갱신
 *   - ?from=YYYYMMDD 가 저장 범위보다 이르면 해당 기간을 추가 수집
 */
export async function GET(req: Request, { params }: Ctx) {
  const { code } = await params;
  if (!CODE_RE.test(code)) return NextResponse.json({ error: "잘못된 종목코드" }, { status: 400 });
  if (!(await getWatchlist()).some((w) => w.srtnCd === code)) {
    return NextResponse.json({ error: "관심종목으로 등록된 종목만 조회할 수 있습니다." }, { status: 404 });
  }

  const sp = new URL(req.url).searchParams;
  const force = sp.get("refresh") === "1";
  const from = sp.get("from");
  if (from !== null && (!/^\d{8}$/.test(from) || from < MIN_DATE)) {
    return NextResponse.json({ error: `시작일은 ${MIN_DATE} 이후의 YYYYMMDD 형식이어야 합니다.` }, { status: 400 });
  }

  try {
    const doc = await syncPrices(code, force);
    return NextResponse.json(from ? await backfillPrices(code, from) : doc);
  } catch (e: any) {
    // API 실패 시 저장된 데이터라도 반환
    const cached = await getPriceDoc(code);
    if (cached) return NextResponse.json({ ...cached, warning: `시세 수집 실패: ${e.message}` });
    return NextResponse.json({ error: e.message ?? "시세 조회 실패" }, { status: 502 });
  }
}
