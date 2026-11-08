"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { PriceDoc, WatchRow } from "@/lib/types";
import { dir, fmtDate, fmtNum, fmtPct, isoDate } from "@/lib/format";
import { PRESETS, monthsBefore, todayIso, toYmd, validateRange, type PresetKey, type Range } from "@/lib/period";
import RangeBar from "./RangeBar";
import CompareChart, { type CompareSeries } from "./CompareChart";

// 범주형 팔레트 (dataviz 기준 팔레트 1~5번, 색각이상 구분 검증 통과)
const COLORS = ["#2a78d6", "#eb6834", "#1baf7a", "#eda100", "#e87ba4"];
const MIN_PICK = 2;
const MAX_PICK = COLORS.length;

interface Props {
  rows: WatchRow[];
}

export default function CompareView({ rows }: Props) {
  // 종목코드 → 색상 슬롯. 선택 시 비어있는 가장 앞 슬롯을 배정해 다른 종목 선택/해제에도 색이 바뀌지 않음
  const [slots, setSlots] = useState<Record<string, number>>({});
  const [range, setRange] = useState<Range | null>(null);
  const [docs, setDocs] = useState<Record<string, PriceDoc>>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const initialized = useRef(false);

  // 기준 종료일: 관심종목 시세의 가장 최근 거래일
  const latestIso = useMemo(() => {
    const d = rows.reduce((m, r) => (r.quote && r.quote.basDt > m ? r.quote.basDt : m), "");
    return d ? isoDate(d) : todayIso();
  }, [rows]);

  // 최초: 앞쪽 3개 종목 + 3개월
  useEffect(() => {
    if (initialized.current || rows.length === 0) return;
    initialized.current = true;
    const init: Record<string, number> = {};
    rows.slice(0, Math.min(3, MAX_PICK)).forEach((r, i) => (init[r.srtnCd] = i));
    setSlots(init);
    setRange({ from: monthsBefore(latestIso, 3), to: latestIso, preset: "3M" });
  }, [rows, latestIso]);

  // 관심종목에서 삭제된 종목은 선택 해제
  useEffect(() => {
    const valid = new Set(rows.map((r) => r.srtnCd));
    setSlots((s) => {
      const next = Object.fromEntries(Object.entries(s).filter(([c]) => valid.has(c)));
      return Object.keys(next).length === Object.keys(s).length ? s : next;
    });
  }, [rows]);

  const selected = useMemo(
    () => Object.entries(slots).sort((a, b) => a[1] - b[1]).map(([code]) => code),
    [slots],
  );

  const toggle = (code: string) =>
    setSlots((s) => {
      if (code in s) {
        const { [code]: _, ...rest } = s;
        return rest;
      }
      if (Object.keys(s).length >= MAX_PICK) return s;
      const used = new Set(Object.values(s));
      let slot = 0;
      while (used.has(slot)) slot++;
      return { ...s, [code]: slot };
    });

  // 선택 종목 · 시작일이 바뀌면 시세 확보 (저장 범위보다 이른 시작일이면 서버가 추가 수집)
  const fromYmd = range ? toYmd(range.from) : null;
  useEffect(() => {
    if (!fromYmd || selected.length === 0) return;
    const need = selected.filter((c) => {
      const d = docs[c];
      const covered = d?.coveredFrom ?? d?.items[0]?.basDt;
      return !d || !covered || fromYmd < covered;
    });
    if (need.length === 0) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    Promise.all(
      need.map(async (c) => {
        const res = await fetch(`/api/prices/${c}?from=${fromYmd}`);
        const json = await res.json();
        if (!res.ok) throw new Error(`${rows.find((r) => r.srtnCd === c)?.itmsNm ?? c}: ${json.error}`);
        return [c, json as PriceDoc] as const;
      }),
    )
      .then((pairs) => !cancelled && setDocs((d) => ({ ...d, ...Object.fromEntries(pairs) })))
      .catch((e) => !cancelled && setError(e.message ?? "시세 조회 실패"))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected, fromYmd]);

  const applyRange = (from: string, to: string, preset: PresetKey | null) => {
    const invalid = validateRange(from, to);
    if (invalid) return setError(invalid);
    setError(null);
    setRange({ from, to, preset });
  };

  const applyPreset = (key: PresetKey) => {
    const months = PRESETS.find((p) => p.key === key)!.months;
    if (months) return applyRange(monthsBefore(latestIso, months), latestIso, key);
    // ALL: 선택 종목 중 가장 이른 보유 데이터부터
    const earliest = selected
      .map((c) => docs[c]?.items[0]?.basDt)
      .filter(Boolean)
      .sort()[0];
    applyRange(earliest ? isoDate(earliest) : monthsBefore(latestIso, 12), latestIso, key);
  };

  // 기간 시작일 종가를 0% 로 한 변화율 시리즈
  const series = useMemo(() => {
    if (!range) return [];
    const f = toYmd(range.from);
    const t = toYmd(range.to);
    return selected.flatMap((code) => {
      const doc = docs[code];
      const row = rows.find((r) => r.srtnCd === code);
      if (!doc || !row) return [];
      const pts = doc.items.filter((d) => d.basDt >= f && d.basDt <= t && d.clpr > 0);
      if (pts.length === 0) return [];
      const base = pts[0].clpr;
      const changes = pts.map((d) => (d.clpr / base - 1) * 100);
      return [
        {
          code,
          name: row.itmsNm,
          color: COLORS[slots[code]],
          data: pts.map((d, i) => ({ time: isoDate(d.basDt), value: changes[i] })),
          start: pts[0],
          end: pts[pts.length - 1],
          ret: changes[changes.length - 1],
          max: Math.max(...changes),
          min: Math.min(...changes),
        },
      ];
    });
  }, [selected, docs, range, rows, slots]);

  const chartSeries: CompareSeries[] = useMemo(
    () => series.map(({ code, name, color, data }) => ({ code, name, color, data })),
    [series],
  );
  const missing = selected.filter((c) => docs[c] && !series.some((s) => s.code === c));

  return (
    <div>
      <div className="section-head">
        비교 종목 선택
        <span className="count mono muted">
          {selected.length} / {MAX_PICK}
        </span>
        <div className="tools">
          <span className="muted" style={{ fontSize: 11 }}>
            {MIN_PICK}~{MAX_PICK}개 선택
          </span>
        </div>
      </div>
      <div className="compare-picker">
        {rows.length === 0 && <span className="muted">관심종목을 먼저 등록하세요.</span>}
        {rows.map((r) => {
          const on = r.srtnCd in slots;
          const full = !on && selected.length >= MAX_PICK;
          return (
            <label key={r.srtnCd} className={`pick ${on ? "on" : ""} ${full ? "disabled" : ""}`} title={full ? `최대 ${MAX_PICK}개까지 선택할 수 있습니다` : ""}>
              <input type="checkbox" checked={on} disabled={full} onChange={() => toggle(r.srtnCd)} />
              {on && <i className="swatch" style={{ background: COLORS[slots[r.srtnCd]] }} />}
              <span className="pick-name">{r.itmsNm}</span>
              <span className="code">{r.srtnCd}</span>
            </label>
          );
        })}
      </div>

      <RangeBar
        label="비교기간"
        value={range}
        disabled={loading || selected.length === 0}
        onApply={(from, to) => applyRange(from, to, null)}
        onPreset={applyPreset}
      />
      {loading && <div className="loading-bar" />}
      {error && <div className="banner error">{error}</div>}
      {missing.length > 0 && (
        <div className="banner warn">
          선택 기간에 시세가 없는 종목: {missing.map((c) => rows.find((r) => r.srtnCd === c)?.itmsNm).join(", ")}
        </div>
      )}

      {selected.length < MIN_PICK ? (
        <div className="chart-wrap">
          <div className="empty-state">
            <div>
              <h2>비교할 종목을 {MIN_PICK}개 이상 선택하세요</h2>
              <div className="hint">위 목록에서 체크박스로 {MIN_PICK}~{MAX_PICK}개 종목을 고르면 종가 변화율을 한 차트에서 비교합니다.</div>
            </div>
          </div>
        </div>
      ) : (
        <>
          <div className="compare-legend">
            {series.map((s) => (
              <span className="lg" key={s.code}>
                <i style={{ background: s.color }} />
                <span className="lg-name">{s.name}</span>
                <b className={dir(s.ret)}>{fmtPct(s.ret)}</b>
              </span>
            ))}
            {range && series.length > 0 && (
              <span className="lg-range mono muted">
                {range.from.replace(/-/g, ".")} ~ {range.to.replace(/-/g, ".")} · 시작일 종가 = 0%
              </span>
            )}
          </div>
          {chartSeries.length > 0 ? (
            <CompareChart series={chartSeries} />
          ) : (
            <div className="chart-wrap">
              <div className="empty-state">
                <div className="hint">{loading ? "시세 데이터를 불러오는 중…" : "선택한 기간에 시세 데이터가 없습니다."}</div>
              </div>
            </div>
          )}

          {series.length > 0 && (
            <>
              <div className="section-head">기간 수익률 비교</div>
              <div className="table-wrap">
                <table className="grid">
                  <thead>
                    <tr>
                      <th>종목</th>
                      <th>시작일</th>
                      <th className="num">시작 종가</th>
                      <th>종료일</th>
                      <th className="num">종료 종가</th>
                      <th className="num">기간 수익률</th>
                      <th className="num">최고 변화율</th>
                      <th className="num">최저 변화율</th>
                    </tr>
                  </thead>
                  <tbody>
                    {[...series]
                      .sort((a, b) => b.ret - a.ret)
                      .map((s) => (
                        <tr key={s.code}>
                          <td>
                            <i className="swatch" style={{ background: s.color }} />
                            <span className="name">{s.name}</span> <span className="code">{s.code}</span>
                          </td>
                          <td className="mono">{fmtDate(s.start.basDt)}</td>
                          <td className="num">{fmtNum(s.start.clpr)}</td>
                          <td className="mono">{fmtDate(s.end.basDt)}</td>
                          <td className="num">{fmtNum(s.end.clpr)}</td>
                          <td className={`num ${dir(s.ret)}`} style={{ fontWeight: 600 }}>{fmtPct(s.ret)}</td>
                          <td className={`num ${dir(s.max)}`}>{fmtPct(s.max)}</td>
                          <td className={`num ${dir(s.min)}`}>{fmtPct(s.min)}</td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </>
      )}
    </div>
  );
}
