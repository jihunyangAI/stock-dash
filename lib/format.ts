export const fmtNum = (n: number | null | undefined) =>
  n === null || n === undefined || Number.isNaN(n) ? "-" : Math.round(n).toLocaleString("ko-KR");

export const fmtSigned = (n: number) => (n > 0 ? "+" : n < 0 ? "−" : "") + fmtNum(Math.abs(n));

export const fmtPct = (n: number) => (n > 0 ? "+" : n < 0 ? "−" : "") + Math.abs(n).toFixed(2) + "%";

/** YYYYMMDD → YYYY.MM.DD */
export const fmtDate = (d: string) => (d?.length === 8 ? `${d.slice(0, 4)}.${d.slice(4, 6)}.${d.slice(6)}` : d);

/** YYYYMMDD → YYYY-MM-DD (차트용) */
export const isoDate = (d: string) => `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6)}`;

/** 금액을 조/억 단위로 */
export function fmtKrw(n: number) {
  if (!n) return "-";
  const jo = Math.floor(n / 1e12);
  const eok = Math.round((n % 1e12) / 1e8);
  if (jo > 0) return `${jo.toLocaleString("ko-KR")}조 ${eok.toLocaleString("ko-KR")}억`;
  if (n >= 1e8) return `${Math.round(n / 1e8).toLocaleString("ko-KR")}억`;
  return `${Math.round(n / 1e4).toLocaleString("ko-KR")}만`;
}

/** 등락 방향 클래스 */
export const dir = (n: number) => (n > 0 ? "up" : n < 0 ? "down" : "flat");
