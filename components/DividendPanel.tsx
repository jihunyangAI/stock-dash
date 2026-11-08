"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { Dividend, DividendDoc } from "@/lib/types";
import { fmtDate, fmtNum } from "@/lib/format";

const fmtYield = (v: number | null) => (v === null ? "-" : `${v.toFixed(2)}%`);

export default function DividendPanel({ code }: { code: string }) {
  const [doc, setDoc] = useState<DividendDoc | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [warning, setWarning] = useState<string | null>(null);

  const load = useCallback(
    async (refresh = false) => {
      setLoading(true);
      setError(null);
      setWarning(null);
      try {
        const res = await fetch(`/api/dividends/${code}${refresh ? "?refresh=1" : ""}`);
        const json = await res.json();
        if (!res.ok) throw new Error(json.error);
        setDoc(json);
        if (json.warning) setWarning(json.warning);
      } catch (e: any) {
        setError(e.message ?? "배당정보 조회 실패");
      } finally {
        setLoading(false);
      }
    },
    [code],
  );

  useEffect(() => {
    load();
  }, [load]);

  const items = doc?.items ?? [];
  const yearly = useMemo(() => {
    const m = new Map<string, { year: string; amount: number; count: number }>();
    for (const d of items) {
      const y = d.dvdnBasDt.slice(0, 4);
      const e = m.get(y) ?? { year: y, amount: 0, count: 0 };
      e.amount += d.dps;
      e.count += 1;
      m.set(y, e);
    }
    return [...m.values()].sort((a, b) => a.year.localeCompare(b.year));
  }, [items]);
  // 요약은 이미 지난 배당 중 최근 건 (기준일 전인 예정 배당은 수익률 계산 불가)
  const today = new Date(Date.now() + 9 * 3600_000).toISOString().slice(0, 10).replace(/-/g, "");
  const latest = [...items].reverse().find((d) => d.dvdnBasDt <= today) ?? items.at(-1);
  const upcoming = items.filter((d) => d.dvdnBasDt > today);

  return (
    <div>
      <div className="section-head">
        연도별 배당금
        <div className="tools">
          {doc && (
            <span className="muted mono" style={{ fontSize: 11 }}>
              동기화 {new Date(doc.lastSyncedAt).toLocaleString("ko-KR")}
            </span>
          )}
          <button className="btn btn-sm" onClick={() => load(true)} disabled={loading}>
            {loading ? "조회중…" : "⟳ 배당정보 갱신"}
          </button>
        </div>
      </div>
      {loading && <div className="loading-bar" />}
      {error && <div className="banner error">{error}</div>}
      {warning && <div className="banner warn">{warning}</div>}

      {!doc && loading ? (
        <div className="empty-state">
          <div className="hint">배당정보를 불러오는 중…</div>
        </div>
      ) : doc && items.length === 0 ? (
        <div className="empty-state">
          <div>
            <h2>배당이력이 없습니다.</h2>
            <div className="hint">금융위원회 주식배당정보에 현금배당 기록이 없는 종목입니다.</div>
          </div>
        </div>
      ) : items.length > 0 ? (
        <>
          <div className="stats stats-4">
            <Stat k="최근 배당기준일" v={fmtDate(latest!.dvdnBasDt)} />
            <Stat k="최근 주당배당금" v={`${fmtNum(latest!.dps)}원`} />
            <Stat k="최근 배당수익률" v={fmtYield(latest!.yieldPct)} />
            <Stat
              k={upcoming.length ? "예정 배당" : "배당 이력"}
              v={
                upcoming.length
                  ? `${fmtDate(upcoming[0].dvdnBasDt)} · ${fmtNum(upcoming[0].dps)}원`
                  : `${items.length}회 · ${yearly.length}개 연도`
              }
            />
          </div>
          <YearlyBarChart data={yearly} />
          <DividendTable items={items} />
        </>
      ) : null}
    </div>
  );
}

function Stat({ k, v }: { k: string; v: string }) {
  return (
    <div className="stat">
      <div className="k">{k}</div>
      <div className="v">{v}</div>
    </div>
  );
}

/** 보기 좋은 눈금 간격 (1, 2, 2.5, 5, 10 × 10^n) — 대략 5칸 */
function niceStep(max: number) {
  const raw = Math.max(max, 1) / 5;
  const p = 10 ** Math.floor(Math.log10(raw));
  for (const m of [1, 2, 2.5, 5, 10]) if (raw <= m * p) return m * p;
  return 10 * p;
}

function YearlyBarChart({ data }: { data: { year: string; amount: number; count: number }[] }) {
  const W = 960;
  const H = 260;
  const pad = { l: 64, r: 16, t: 28, b: 30 };
  const iw = W - pad.l - pad.r;
  const ih = H - pad.t - pad.b;
  const peak = Math.max(...data.map((d) => d.amount));
  const step = niceStep(peak);
  const max = Math.ceil(peak / step) * step || step;
  const ticks = Array.from({ length: Math.round(max / step) + 1 }, (_, i) => i * step);
  const slot = iw / data.length;
  const bw = Math.min(56, slot * 0.6);
  const y = (v: number) => pad.t + ih - (v / max) * ih;

  return (
    <div className="bar-chart">
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="연도별 주당 배당금 막대차트">
        {ticks.map((t) => (
          <g key={t}>
            <line x1={pad.l} x2={W - pad.r} y1={y(t)} y2={y(t)} className={t === 0 ? "axis" : "grid"} />
            <text x={pad.l - 8} y={y(t)} className="tick" textAnchor="end" dominantBaseline="middle">
              {fmtNum(t)}
            </text>
          </g>
        ))}
        {data.map((d, i) => {
          const cx = pad.l + slot * i + slot / 2;
          const top = y(d.amount);
          return (
            <g key={d.year}>
              <title>{`${d.year}년 주당 ${fmtNum(d.amount)}원 (${d.count}회)`}</title>
              <rect x={cx - bw / 2} y={top} width={bw} height={pad.t + ih - top} className="bar" />
              <text x={cx} y={top - 6} className="val" textAnchor="middle">
                {fmtNum(d.amount)}
              </text>
              <text x={cx} y={H - pad.b + 18} className="tick" textAnchor="middle">
                {d.year}
              </text>
            </g>
          );
        })}
        <text x={pad.l} y={14} className="unit">
          (원/주, 연간 합계)
        </text>
      </svg>
    </div>
  );
}

function DividendTable({ items }: { items: Dividend[] }) {
  const desc = [...items].reverse();
  const today = new Date(Date.now() + 9 * 3600_000).toISOString().slice(0, 10).replace(/-/g, "");
  return (
    <>
      <div className="section-head">
        배당이력
        <span className="count mono muted">{items.length}건</span>
      </div>
      <div className="table-wrap">
        <table className="grid">
          <thead>
            <tr>
              <th>배당기준일</th>
              <th className="num">주당배당금(현금)</th>
              <th className="num">배당수익률</th>
            </tr>
          </thead>
          <tbody>
            {desc.map((d) => (
              <tr key={d.dvdnBasDt}>
                <td className="mono">
                  {fmtDate(d.dvdnBasDt)}
                  {d.dvdnBasDt > today && <span className="tag" style={{ marginLeft: 6 }}>예정</span>}
                </td>
                <td className="num" style={{ fontWeight: 600 }}>{fmtNum(d.dps)}원</td>
                <td
                  className="num"
                  title={
                    d.basePrice
                      ? `기준일 종가 ${fmtNum(d.basePrice)}원 기준`
                      : d.dvdnBasDt > today
                        ? "배당기준일 이전이라 아직 계산할 수 없음"
                        : "기준일 종가 데이터 없음"
                  }
                >
                  {fmtYield(d.yieldPct)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="footnote">
        배당수익률 = 주당배당금 ÷ 배당기준일 종가(휴장일이면 직전 거래일) × 100 · 출처: 금융위원회_주식배당정보
      </div>
    </>
  );
}
