import { fetchDividendRaw, type RawItem } from "./krx";
import { getDividendDoc, getPriceDoc, getWatchlist, saveDividendDoc } from "./store";
import { MIN_DATE, backfillPrices } from "./sync";
import type { Dividend, DividendDoc } from "./types";

const STALE_MS = 24 * 3600_000; // 배당정보는 하루 1회만 갱신
const MAX_PRICE_GAP_DAYS = 14; // 기준일 종가로 인정할 직전 거래일 최대 간격

const ymdToUtc = (d: string) => Date.UTC(+d.slice(0, 4), +d.slice(4, 6) - 1, +d.slice(6, 8));
const shiftYmd = (d: string, days: number) =>
  new Date(ymdToUtc(d) + days * 86400_000).toISOString().slice(0, 10).replace(/-/g, "");

/** 같은 배당기준일의 중복 레코드는 가장 최근 등록분(basDt)만 사용, 현금배당액 > 0 만 */
function normalize(raw: RawItem[]): Omit<Dividend, "basePrice" | "yieldPct">[] {
  const byDate = new Map<string, RawItem>();
  for (const r of raw) {
    const amt = Number(r.stckGenrDvdnAmt || 0);
    if (!r.dvdnBasDt || !(amt > 0)) continue;
    const prev = byDate.get(r.dvdnBasDt);
    if (!prev || (r.basDt ?? "") > (prev.basDt ?? "")) byDate.set(r.dvdnBasDt, r);
  }
  return [...byDate.values()]
    .map((r) => ({
      dvdnBasDt: r.dvdnBasDt,
      cashDvdnPayDt: r.cashDvdnPayDt ?? "",
      dps: Number(r.stckGenrDvdnAmt),
      kind: r.stckDvdnRcdNm ?? "",
    }))
    .sort((a, b) => a.dvdnBasDt.localeCompare(b.dvdnBasDt));
}

/** 배당내역을 API에서 받아 배당수익률을 계산해 저장 */
export async function syncDividends(code: string, force = false): Promise<DividendDoc> {
  const item = (await getWatchlist()).find((w) => w.srtnCd === code);
  if (!item) throw new Error("관심종목으로 등록된 종목만 조회할 수 있습니다.");

  const existing = await getDividendDoc(code);
  if (existing && !force && Date.now() - new Date(existing.lastSyncedAt).getTime() < STALE_MS) {
    return existing;
  }

  if (!item.isinCd) throw new Error("ISIN 코드가 없어 배당정보를 조회할 수 없습니다. 시세 갱신 후 다시 시도하세요.");
  const records = normalize(await fetchDividendRaw(item.isinCd));

  // 배당수익률 계산용 종가 확보 — 가장 오래된 배당기준일까지 시세를 추가 수집
  if (records.length) {
    const from = shiftYmd(records[0].dvdnBasDt, -MAX_PRICE_GAP_DAYS);
    try {
      await backfillPrices(code, from < MIN_DATE ? MIN_DATE : from);
    } catch {
      // 시세 수집 실패 시 보유 데이터로만 계산 (수익률 일부가 "-" 로 표시됨)
    }
  }
  const prices = (await getPriceDoc(code))?.items ?? [];

  const items: Dividend[] = records.map((r) => {
    // 배당기준일 당일(휴장일이면 직전 거래일) 종가
    let base = null;
    for (let i = prices.length - 1; i >= 0; i--) {
      if (prices[i].basDt <= r.dvdnBasDt) {
        base = prices[i];
        break;
      }
    }
    const ok = base && base.clpr > 0 && ymdToUtc(r.dvdnBasDt) - ymdToUtc(base.basDt) <= MAX_PRICE_GAP_DAYS * 86400_000;
    return {
      ...r,
      basePrice: ok ? base!.clpr : null,
      yieldPct: ok ? Math.round((r.dps / base!.clpr) * 10000) / 100 : null,
    };
  });

  const doc: DividendDoc = { srtnCd: code, isinCd: item.isinCd, lastSyncedAt: new Date().toISOString(), items };
  await saveDividendDoc(doc);
  return doc;
}
