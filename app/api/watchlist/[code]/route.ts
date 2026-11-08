import { NextResponse } from "next/server";
import { deleteDividendDoc, deletePriceDoc, getWatchlist, saveWatchlist, serialize } from "@/lib/store";

type Ctx = { params: Promise<{ code: string }> };

/** 관심종목 수정 (그룹 · 목표가 · 메모) */
export async function PUT(req: Request, { params }: Ctx) {
  const { code } = await params;
  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ error: "잘못된 요청입니다." }, { status: 400 });

  let targetPrice: number | null = null;
  if (body.targetPrice !== null && body.targetPrice !== undefined && body.targetPrice !== "") {
    targetPrice = Number(body.targetPrice);
    if (!Number.isFinite(targetPrice) || targetPrice <= 0) {
      return NextResponse.json({ error: "목표가는 0보다 큰 숫자여야 합니다." }, { status: 400 });
    }
    targetPrice = Math.round(targetPrice);
  }

  const updated = await serialize(async () => {
    const list = await getWatchlist();
    const item = list.find((w) => w.srtnCd === code);
    if (!item) return null;
    item.group = String(body.group ?? "").trim().slice(0, 20);
    item.memo = String(body.memo ?? "").slice(0, 500);
    item.targetPrice = targetPrice;
    item.updatedAt = new Date().toISOString();
    await saveWatchlist(list);
    return item;
  });
  if (!updated) return NextResponse.json({ error: "등록되지 않은 종목입니다." }, { status: 404 });
  return NextResponse.json({ item: updated });
}

/** 관심종목 삭제 (일별시세·배당내역 파일도 함께 삭제) */
export async function DELETE(_req: Request, { params }: Ctx) {
  const { code } = await params;
  const removed = await serialize(async () => {
    const list = await getWatchlist();
    const next = list.filter((w) => w.srtnCd !== code);
    if (next.length === list.length) return false;
    await saveWatchlist(next);
    await deletePriceDoc(code);
    await deleteDividendDoc(code);
    return true;
  });
  if (!removed) return NextResponse.json({ error: "등록되지 않은 종목입니다." }, { status: 404 });
  return NextResponse.json({ ok: true });
}
