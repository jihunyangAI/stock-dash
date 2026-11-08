"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { PriceDoc, WatchRow } from "@/lib/types";
import { dir, fmtDate, fmtKrw, fmtNum, fmtPct, fmtSigned, isoDate } from "@/lib/format";
import MarketTag from "./MarketTag";
import PriceChart from "./PriceChart";
import PriceTable from "./PriceTable";
import DividendPanel from "./DividendPanel";
import RangeBar from "./RangeBar";
import {
  MA_LOOKBACK_DAYS,
  PRESETS,
  daysBefore,
  monthsBefore,
  toYmd,
  validateRange,
  type PresetKey,
  type Range,
} from "@/lib/period";

interface Props {
  row: WatchRow;
  onEdit: (row: WatchRow) => void;
  onSynced: () => void;
}

export default function StockDetail({ row, onEdit, onSynced }: Props) {
  const [doc, setDoc] = useState<PriceDoc | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [warning, setWarning] = useState<string | null>(null);
  const [range, setRange] = useState<Range | null>(null);
  const [tab, setTab] = useState<"price" | "dividend">("price");

  const code = row.srtnCd;

  const load = useCallback(
    async (opts: { refresh?: boolean; from?: string } = {}) => {
      setLoading(true);
      setError(null);
      setWarning(null);
      try {
        const qs = new URLSearchParams();
        if (opts.refresh) qs.set("refresh", "1");
        if (opts.from) qs.set("from", opts.from);
        const res = await fetch(`/api/prices/${code}${qs.size ? `?${qs}` : ""}`);
        const json = await res.json();
        if (!res.ok) throw new Error(json.error);
        setDoc(json);
        if (json.warning) setWarning(json.warning);
        onSynced();
        return json as PriceDoc;
      } catch (e: any) {
        setError(e.message ?? "시세 조회 실패");
        return null;
      } finally {
        setLoading(false);
      }
    },
    [code, onSynced],
  );

  const items = useMemo(() => (doc?.srtnCd === code ? doc.items : []), [doc, code]);
  const last = items.at(-1);

  /** 기간 적용 — 저장 범위보다 이른 시작일이면 서버에서 추가 수집 */
  const applyRange = useCallback(
    async (from: string, to: string, preset: PresetKey | null, base: PriceDoc | null = doc) => {
      const invalid = validateRange(from, to);
      if (invalid) return setError(invalid);
      setError(null);
      // 이동평균(최장 120일)이 기간 첫날부터 계산되도록 시작일보다 앞선 시세까지 확보
      const need = toYmd(daysBefore(from, MA_LOOKBACK_DAYS));
      const covered = base?.coveredFrom ?? base?.items[0]?.basDt;
      if (covered && need < covered) await load({ from: need });
      setRange({ from, to, preset });
    },
    [doc, load],
  );

  const applyPreset = (key: PresetKey, base: PriceDoc | null = doc) => {
    const lastDt = base?.items.at(-1)?.basDt;
    if (!lastDt) return;
    const to = isoDate(lastDt);
    const months = PRESETS.find((p) => p.key === key)!.months;
    const from = months ? monthsBefore(to, months) : isoDate(base!.items[0].basDt);
    applyRange(from, to, key, base);
  };

  // 최초 로드 → 기본 3개월
  useEffect(() => {
    setDoc(null);
    setRange(null);
    load().then((d) => d && applyPreset("3M", d));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [code]);

  // 선택 기간의 데이터 / 차트 표시 인덱스
  const view = useMemo(() => {
    if (!range) return { rows: items, start: 0, end: items.length - 1 };
    const f = toYmd(range.from);
    const t = toYmd(range.to);
    let start = -1;
    let end = -1;
    items.forEach((d, i) => {
      if (d.basDt >= f && d.basDt <= t) {
        if (start < 0) start = i;
        end = i;
      }
    });
    return { rows: start < 0 ? [] : items.slice(start, end + 1), start, end };
  }, [items, range]);

  const stats = useMemo(() => {
    if (!last) return null;
    const y = items.slice(-250);
    const hi52 = Math.max(...y.map((d) => d.hipr || d.clpr));
    const lo52 = Math.min(...y.map((d) => d.lopr || d.clpr));
    const r = view.rows;
    const periodRet = r.length > 1 ? ((r[r.length - 1].clpr - r[0].clpr) / r[0].clpr) * 100 : null;
    const gap = row.targetPrice ? ((row.targetPrice - last.clpr) / last.clpr) * 100 : null;
    return { hi52, lo52, periodRet, gap };
  }, [items, view.rows, last, row.targetPrice]);

  const rangeLabel = range ? `${range.from.replace(/-/g, ".")} ~ ${range.to.replace(/-/g, ".")}` : "";
  const fileRange = range ? `${toYmd(range.from)}-${toYmd(range.to)}` : "all";

  return (
    <div>
      <div className="detail-head">
        <div className="detail-title">
          <h1>
            {row.itmsNm} <MarketTag market={row.mrktCtg} />
          </h1>
          <div className="meta">
            <span>{row.srtnCd}</span>
            <span>{row.isinCd}</span>
            {row.group && <span>그룹: {row.group}</span>}
          </div>
        </div>
        {last && (
          <div className="detail-price">
            <span className={`last ${dir(last.vs)}`}>{fmtNum(last.clpr)}</span>
            <span className={`chg ${dir(last.vs)}`}>
              {last.vs > 0 ? "▲" : last.vs < 0 ? "▼" : ""} {fmtSigned(last.vs)} ({fmtPct(last.fltRt)})
            </span>
            <span className="asof">{fmtDate(last.basDt)} 종가</span>
          </div>
        )}
        <div className="detail-actions">
          <button className="btn" onClick={() => onEdit(row)}>✎ 수정</button>
          <button className="btn" onClick={() => load({ refresh: true })} disabled={loading}>
            {loading ? "동기화중…" : "⟳ 시세 갱신"}
          </button>
        </div>
      </div>
      {loading && <div className="loading-bar" />}
      {error && <div className="banner error">{error}</div>}
      {warning && <div className="banner warn">{warning}</div>}

      {last && stats && (
        <div className="stats">
          <Stat k="시가" v={fmtNum(last.mkp)} />
          <Stat k="고가" v={fmtNum(last.hipr)} cls="up" />
          <Stat k="저가" v={fmtNum(last.lopr)} cls="down" />
          <Stat k="거래량" v={fmtNum(last.trqu)} />
          <Stat k="거래대금" v={fmtKrw(last.trPrc)} />
          <Stat k="시가총액" v={fmtKrw(last.mrktTotAmt)} />
          <Stat k="상장주식수" v={fmtNum(last.lstgStCnt)} />
          <Stat k="52주 최고" v={fmtNum(stats.hi52)} />
          <Stat k="52주 최저" v={fmtNum(stats.lo52)} />
          <Stat
            k="조회기간 수익률"
            v={stats.periodRet === null ? "-" : fmtPct(stats.periodRet)}
            cls={stats.periodRet === null ? "" : dir(stats.periodRet)}
          />
          <Stat k="목표가" v={row.targetPrice ? fmtNum(row.targetPrice) : "-"} />
          <Stat k="목표가 괴리율" v={stats.gap === null ? "-" : fmtPct(stats.gap)} cls={stats.gap === null ? "" : dir(stats.gap)} />
        </div>
      )}

      {row.memo && (
        <div className="memo-line">
          <b>MEMO</b>
          {row.memo}
        </div>
      )}

      <div className="tabs" role="tablist">
        <button role="tab" aria-selected={tab === "price"} className={tab === "price" ? "on" : ""} onClick={() => setTab("price")}>
          일별시세
        </button>
        <button
          role="tab"
          aria-selected={tab === "dividend"}
          className={tab === "dividend" ? "on" : ""}
          onClick={() => setTab("dividend")}
        >
          배당내역
        </button>
      </div>

      {tab === "dividend" ? (
        <DividendPanel code={code} />
      ) : (
      <>
      <RangeBar
        label="조회기간"
        value={range}
        disabled={loading || items.length === 0}
        onApply={(from, to) => applyRange(from, to, null)}
        onPreset={(k) => applyPreset(k)}
      />

      {items.length > 0 && view.rows.length > 0 ? (
        <PriceChart data={items} range={[view.start, view.end]} />
      ) : (
        <div className="chart-wrap">
          <div className="empty-state">
            <div className="hint">
              {loading
                ? "시세 데이터를 불러오는 중…"
                : items.length === 0
                  ? "시세 데이터가 없습니다."
                  : `선택한 기간에 시세 데이터가 없습니다. (보유 데이터: ${fmtDate(items[0].basDt)} ~ ${fmtDate(items.at(-1)!.basDt)})`}
            </div>
          </div>
        </div>
      )}

      <PriceTable rows={view.rows} caption={rangeLabel} fileName={`${row.itmsNm}_${row.srtnCd}_${fileRange}`} />
      </>
      )}
    </div>
  );
}

function Stat({ k, v, cls = "" }: { k: string; v: string; cls?: string }) {
  return (
    <div className="stat">
      <div className="k">{k}</div>
      <div className={`v ${cls}`}>{v}</div>
    </div>
  );
}
