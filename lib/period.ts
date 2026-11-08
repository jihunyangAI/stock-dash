// 조회기간 공통 유틸 (일별시세 탭 · 종목비교 탭)

export const PRESETS = [
  { key: "1M", months: 1 },
  { key: "3M", months: 3 },
  { key: "6M", months: 6 },
  { key: "1Y", months: 12 },
  { key: "3Y", months: 36 },
  { key: "ALL", months: null },
] as const;
export type PresetKey = (typeof PRESETS)[number]["key"];

export interface Range {
  from: string; // YYYY-MM-DD
  to: string;
  preset: PresetKey | null; // null = 직접 입력
}

export const MIN_ISO = "2000-01-01";
export const toYmd = (iso: string) => iso.replace(/-/g, "");
export const todayIso = () => new Date(Date.now() + 9 * 3600_000).toISOString().slice(0, 10);

/** ISO 날짜에서 months 개월 전 다음날 (예: 2026-11-05, 3 → 2026-08-06) */
export function monthsBefore(iso: string, months: number) {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1 - months, d + 1)).toISOString().slice(0, 10);
}

/** ISO 날짜에서 n 일 전 (MIN_ISO 미만으로 내려가지 않음) */
export function daysBefore(iso: string, n: number) {
  const [y, m, d] = iso.split("-").map(Number);
  const r = new Date(Date.UTC(y, m - 1, d - n)).toISOString().slice(0, 10);
  return r < MIN_ISO ? MIN_ISO : r;
}

/** 120일 이동평균을 기간 첫날부터 그리기 위해 미리 확보할 달력일 (≈ 125 거래일) */
export const MA_LOOKBACK_DAYS = 185;

/** 기간 입력값 검증 — 오류 메시지 또는 null */
export function validateRange(from: string, to: string): string | null {
  if (!from || !to) return "시작일과 종료일을 모두 입력하세요.";
  if (from > to) return "시작일이 종료일보다 늦습니다.";
  if (from < MIN_ISO) return `시작일은 ${MIN_ISO} 이후로 입력하세요.`;
  return null;
}
