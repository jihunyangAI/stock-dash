/** 관심종목 (종목 공통정보 + 사용자 입력 정보) — data/watchlist.json */
export interface WatchItem {
  srtnCd: string; // 단축코드 (예: 005930)
  isinCd: string; // ISIN 코드
  itmsNm: string; // 종목명
  mrktCtg: string; // 시장구분 (KOSPI / KOSDAQ / KONEX)
  group: string; // 사용자 그룹
  memo: string; // 메모
  targetPrice: number | null; // 목표가
  createdAt: string;
  updatedAt: string;
}

/** 일별 시세 1건 — data/prices/{srtnCd}.json 의 items */
export interface DailyPrice {
  basDt: string; // 기준일자 YYYYMMDD
  mkp: number; // 시가
  hipr: number; // 고가
  lopr: number; // 저가
  clpr: number; // 종가
  vs: number; // 전일대비
  fltRt: number; // 등락률(%)
  trqu: number; // 거래량
  trPrc: number; // 거래대금
  lstgStCnt: number; // 상장주식수
  mrktTotAmt: number; // 시가총액
}

export interface PriceDoc {
  srtnCd: string;
  lastSyncedAt: string | null;
  coveredFrom?: string; // API에서 수집을 요청한 가장 이른 일자 (YYYYMMDD) — 이 이전은 미수집
  items: DailyPrice[]; // basDt 오름차순
}

/** 배당 1건 — data/dividends/{srtnCd}.json 의 items */
export interface Dividend {
  dvdnBasDt: string; // 배당기준일 YYYYMMDD
  cashDvdnPayDt: string; // 현금배당 지급일
  dps: number; // 주당 현금배당금 (stckGenrDvdnAmt)
  kind: string; // 배당구분 (현금배당 / 동시배당 …)
  basePrice: number | null; // 배당기준일(또는 직전 거래일) 종가
  yieldPct: number | null; // 배당수익률(%) = dps / basePrice × 100
}

export interface DividendDoc {
  srtnCd: string;
  isinCd: string;
  lastSyncedAt: string;
  items: Dividend[]; // dvdnBasDt 오름차순
}

export type Quote =Pick<DailyPrice, "basDt" | "clpr" | "vs" | "fltRt" | "trqu" | "mrktTotAmt">;

export interface WatchRow extends WatchItem {
  quote: Quote | null;
}

export interface SearchResult {
  srtnCd: string;
  isinCd: string;
  itmsNm: string;
  mrktCtg: string;
  basDt: string;
  clpr: number;
  vs: number;
  fltRt: number;
  mrktTotAmt: number;
}
