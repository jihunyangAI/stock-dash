import { fetchDailyPrices, kstYmd } from "./krx";
import { getPriceDoc, getWatchlist, savePriceDoc, saveWatchlist, serialize } from "./store";
import type { DailyPrice, PriceDoc } from "./types";

const INITIAL_DAYS = 580; // 최초 수집 범위 — 1Y 화면에서도 120일 이동평균이 첫날부터 그려지도록 1년 + 약 6개월
const STALE_MS = 3 * 3600_000; // 3시간 이내 동기화했으면 재호출하지 않음
export const MIN_DATE = "20000101"; // 기간 조회 하한

/** 기존 파일 위에 새 시세를 병합 저장 (basDt 기준 덮어쓰기) */
function mergeAndSave(code: string, fresh: DailyPrice[], patch: Partial<PriceDoc>) {
  return serialize(async () => {
    const current = await getPriceDoc(code);
    const merged = new Map<string, DailyPrice>();
    for (const p of current?.items ?? []) merged.set(p.basDt, p);
    for (const p of fresh) merged.set(p.basDt, p);
    const items = [...merged.values()].sort((a, b) => a.basDt.localeCompare(b.basDt));

    const doc: PriceDoc = {
      srtnCd: code,
      lastSyncedAt: current?.lastSyncedAt ?? null,
      coveredFrom: current?.coveredFrom ?? items[0]?.basDt,
      ...patch,
      items,
    };
    await savePriceDoc(doc);
    return doc;
  });
}

/** 종목 일별시세를 API에서 받아 JSON 파일에 병합 저장 (최근 데이터 증분 수집) */
export async function syncPrices(code: string, force = false): Promise<PriceDoc> {
  const existing = await getPriceDoc(code);
  if (
    existing &&
    !force &&
    existing.lastSyncedAt &&
    Date.now() - new Date(existing.lastSyncedAt).getTime() < STALE_MS
  ) {
    return existing;
  }

  // 기존 데이터가 있으면 마지막 일자부터 증분 수집 (마지막 일자도 다시 받아 덮어씀)
  const last = existing?.items.at(-1)?.basDt;
  const begin = last ?? kstYmd(-INITIAL_DAYS);
  const { prices, meta } = await fetchDailyPrices(code, begin);

  const doc = await mergeAndSave(code, prices, {
    lastSyncedAt: new Date().toISOString(),
    ...(existing ? {} : { coveredFrom: begin }),
  });

  // 종목 공통정보(종목명·시장·ISIN)는 관심종목 목록에 최신화
  if (meta) {
    await serialize(async () => {
      const list = await getWatchlist();
      const item = list.find((w) => w.srtnCd === code);
      if (
        item &&
        (item.itmsNm !== meta.itmsNm || item.mrktCtg !== meta.mrktCtg || item.isinCd !== meta.isinCd)
      ) {
        item.itmsNm = meta.itmsNm;
        item.mrktCtg = meta.mrktCtg;
        item.isinCd = meta.isinCd;
        await saveWatchlist(list);
      }
    });
  }
  return doc;
}

/** 저장된 범위보다 이전 기간(from ~ 수집 시작일)을 API에서 받아 병합 */
export async function backfillPrices(code: string, from: string): Promise<PriceDoc> {
  const doc = await syncPrices(code);
  const covered = doc.coveredFrom ?? doc.items[0]?.basDt ?? kstYmd();
  if (from >= covered) return doc;
  const { prices } = await fetchDailyPrices(code, from, covered);
  return mergeAndSave(code, prices, { coveredFrom: from });
}
