import { NextResponse } from "next/server";
import { CODE_RE, getPriceDoc, getWatchlist, saveWatchlist, serialize } from "@/lib/store";
import { syncPrices } from "@/lib/sync";
import type { WatchItem, WatchRow } from "@/lib/types";

export const dynamic = "force-dynamic";

/** 관심종목 목록 + 저장된 일별시세의 최신 시세 요약 */
export async function GET() {
  const list = await getWatchlist();
  const rows: WatchRow[] = await Promise.all(
    list.map(async (w) => {
      const last = (await getPriceDoc(w.srtnCd))?.items.at(-1);
      return {
        ...w,
        quote: last
          ? {
              basDt: last.basDt,
              clpr: last.clpr,
              vs: last.vs,
              fltRt: last.fltRt,
              trqu: last.trqu,
              mrktTotAmt: last.mrktTotAmt,
            }
          : null,
      };
    }),
  );
  return NextResponse.json({ items: rows });
}

/** 관심종목 등록 → 일별시세 최초 수집 */
export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const srtnCd = String(body?.srtnCd ?? "").toUpperCase();
  if (!CODE_RE.test(srtnCd) || !body?.itmsNm) {
    return NextResponse.json({ error: "종목 정보가 올바르지 않습니다." }, { status: 400 });
  }

  const result = await serialize(async () => {
    const list = await getWatchlist();
    if (list.some((w) => w.srtnCd === srtnCd)) return null;
    const now = new Date().toISOString();
    const item: WatchItem = {
      srtnCd,
      isinCd: String(body.isinCd ?? ""),
      itmsNm: String(body.itmsNm),
      mrktCtg: String(body.mrktCtg ?? ""),
      group: String(body.group ?? "").slice(0, 20),
      memo: "",
      targetPrice: null,
      createdAt: now,
      updatedAt: now,
    };
    list.push(item);
    await saveWatchlist(list);
    return item;
  });
  if (!result) return NextResponse.json({ error: "이미 등록된 종목입니다." }, { status: 409 });

  let warning: string | undefined;
  try {
    await syncPrices(srtnCd, true);
  } catch (e: any) {
    warning = `등록되었지만 시세 수집에 실패했습니다: ${e.message}`;
  }
  return NextResponse.json({ item: result, warning }, { status: 201 });
}
