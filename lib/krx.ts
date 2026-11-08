// 공공데이터포털 — 금융위원회 API 클라이언트
//   - 주식시세정보 (GetStockSecuritiesInfoService_V2 / getStockPriceInfo_V2)
//   - 주식배당정보 (GetStocDiviInfoService_V2 / getDiviInfo_V2)
// 서버 전용: 인증키(디코딩 키)는 브라우저로 노출하지 않는다.
import type { DailyPrice, SearchResult } from "./types";

const PRICE_OPERATION = "getStockPriceInfo_V2";
const DIVI_OPERATION = "getDiviInfo_V2";
const DEFAULT_DIVI_ENDPOINT = "https://apis.data.go.kr/1160100/GetStocDiviInfoService_V2";

export class KrxApiError extends Error {}

export type RawItem = Record<string, string>;

function serviceKey() {
  const key = process.env.DATA_GO_KR_SERVICE_KEY;
  if (!key) throw new KrxApiError(".env.local 에 DATA_GO_KR_SERVICE_KEY 가 설정되지 않았습니다.");
  return key;
}

function priceUrl() {
  const endpoint = process.env.DATA_GO_KR_ENDPOINT;
  if (!endpoint) throw new KrxApiError(".env.local 에 DATA_GO_KR_ENDPOINT 가 설정되지 않았습니다.");
  return `${endpoint}/${PRICE_OPERATION}`;
}

function diviUrl() {
  return `${process.env.DATA_GO_KR_DIVI_ENDPOINT || DEFAULT_DIVI_ENDPOINT}/${DIVI_OPERATION}`;
}

const call = (params: Record<string, string | number>) => request(priceUrl(), params);

async function request(url: string, params: Record<string, string | number>) {
  // 디코딩 키를 URLSearchParams 로 한 번만 인코딩해서 전송
  const qs = new URLSearchParams({ serviceKey: serviceKey(), resultType: "json" });
  for (const [k, v] of Object.entries(params)) qs.set(k, String(v));

  let res: Response;
  try {
    res = await fetch(`${url}?${qs}`, { cache: "no-store", signal: AbortSignal.timeout(15_000) });
  } catch (e: any) {
    throw new KrxApiError(e?.name === "TimeoutError" ? "공공데이터 API 응답 시간 초과 (15초)" : `API 연결 실패: ${e?.message}`);
  }
  const text = await res.text();

  let json: any;
  try {
    json = JSON.parse(text);
  } catch {
    throw new KrxApiError(`API 응답 파싱 실패 (HTTP ${res.status}): ${text.slice(0, 200)}`);
  }
  if (json.OpenAPI_ServiceResponse) {
    const h = json.OpenAPI_ServiceResponse.cmmMsgHeader ?? {};
    const hint =
      h.returnReasonCode === "30" ? " — 공공데이터포털에서 해당 API 활용신청이 필요합니다 (승인 후 반영까지 최대 1~2시간)" : "";
    throw new KrxApiError(`${h.returnAuthMsg ?? "API 오류"} (${h.errMsg}/${h.returnReasonCode})${hint}`);
  }
  const header = json.response?.header;
  if (header?.resultCode !== "00") {
    throw new KrxApiError(`API 오류: ${header?.resultMsg ?? "알 수 없는 응답"} (${header?.resultCode})`);
  }
  const body = json.response.body;
  let items = body.items?.item ?? [];
  if (!Array.isArray(items)) items = [items];
  return { items: items as RawItem[], totalCount: Number(body.totalCount) || 0 };
}

const n = (v: string | undefined) => (v === undefined || v === "" ? 0 : Number(v));

function toDaily(r: RawItem): DailyPrice {
  return {
    basDt: r.basDt,
    mkp: n(r.mkp),
    hipr: n(r.hipr),
    lopr: n(r.lopr),
    clpr: n(r.clpr),
    vs: n(r.vs),
    fltRt: n(r.fltRt),
    trqu: n(r.trqu),
    trPrc: n(r.trPrc),
    lstgStCnt: n(r.lstgStCnt),
    mrktTotAmt: n(r.mrktTotAmt),
  };
}

/** KST 기준 오늘에서 offsetDays 만큼 이동한 날짜 (YYYYMMDD) */
export function kstYmd(offsetDays = 0): string {
  const d = new Date(Date.now() + 9 * 3600_000 + offsetDays * 86400_000);
  return d.toISOString().slice(0, 10).replace(/-/g, "");
}

/** 종목명 또는 종목코드로 검색 — 최근 거래일 기준 종목별 1건 */
export async function searchStocks(query: string): Promise<SearchResult[]> {
  const q = query.trim();
  if (!q) return [];
  const isCode = /^[0-9A-Za-z]{1,6}$/.test(q) && /\d/.test(q);
  const { items } = await call({
    numOfRows: 1000,
    pageNo: 1,
    beginBasDt: kstYmd(-10),
    [isCode ? "likeSrtnCd" : "likeItmsNm"]: isCode ? q.toUpperCase() : q,
  });

  const latest = new Map<string, RawItem>();
  for (const r of items) {
    const prev = latest.get(r.srtnCd);
    if (!prev || r.basDt > prev.basDt) latest.set(r.srtnCd, r);
  }
  return [...latest.values()]
    .map((r) => ({
      srtnCd: r.srtnCd,
      isinCd: r.isinCd,
      itmsNm: r.itmsNm,
      mrktCtg: r.mrktCtg,
      basDt: r.basDt,
      clpr: n(r.clpr),
      vs: n(r.vs),
      fltRt: n(r.fltRt),
      mrktTotAmt: n(r.mrktTotAmt),
    }))
    .sort((a, b) => {
      const ea = a.itmsNm === q || a.srtnCd === q ? 1 : 0;
      const eb = b.itmsNm === q || b.srtnCd === q ? 1 : 0;
      return eb - ea || b.mrktTotAmt - a.mrktTotAmt;
    })
    .slice(0, 50);
}

/** 종목 일별시세 조회 (beginBasDt 이상, endBasDt 미만) — 결과는 basDt 오름차순 */
export async function fetchDailyPrices(
  srtnCd: string,
  beginBasDt: string,
  endBasDt?: string,
): Promise<{ prices: DailyPrice[]; meta: RawItem | null }> {
  const rows: RawItem[] = [];
  const pageSize = 500;
  const range: Record<string, string> = { beginBasDt };
  if (endBasDt) range.endBasDt = endBasDt; // API 의 endBasDt 는 '미만' 조건
  for (let page = 1; page <= 20; page++) {
    const { items, totalCount } = await call({ numOfRows: pageSize, pageNo: page, likeSrtnCd: srtnCd, ...range });
    rows.push(...items);
    if (page * pageSize >= totalCount || items.length === 0) break;
  }
  const own = rows.filter((r) => r.srtnCd === srtnCd);
  own.sort((a, b) => a.basDt.localeCompare(b.basDt));
  return { prices: own.map(toDaily), meta: own.at(-1) ?? null };
}

/**
 * 배당정보 원본 조회 — ISIN 코드로 직접 조회
 * (명세상 조회조건은 기준일자·법인등록번호·회사명이지만 isinCd 도 지원됨.
 *  회사명은 부분일치이고 종목명과 다를 수 있어(NAVER → 네이버) ISIN 이 가장 정확)
 */
export async function fetchDividendRaw(isinCd: string): Promise<RawItem[]> {
  const rows: RawItem[] = [];
  const pageSize = 1000;
  for (let page = 1; page <= 10; page++) {
    const { items, totalCount } = await request(diviUrl(), {
      numOfRows: pageSize,
      pageNo: page,
      isinCd,
    });
    rows.push(...items);
    if (page * pageSize >= totalCount || items.length === 0) break;
  }
  return rows.filter((r) => r.isinCd === isinCd);
}
