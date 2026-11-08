"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  CandlestickSeries,
  ColorType,
  CrosshairMode,
  HistogramSeries,
  LineSeries,
  createChart,
  type IChartApi,
} from "lightweight-charts";
import type { DailyPrice } from "@/lib/types";
import { dir, fmtDate, fmtNum, fmtPct, isoDate } from "@/lib/format";

const UP = "#d1242f";
const DOWN = "#0a58ca";
// 종가 이동평균선 (20일 · 60일 · 120일) — 색은 색각이상 구분 검증 통과 조합
const MAS = [
  { n: 20, color: "#e09a2c" },
  { n: 60, color: "#7b3fbf" },
  { n: 120, color: "#2a9d8f" },
] as const;

function movingAverage(data: DailyPrice[], n: number) {
  const out: { time: string; value: number }[] = [];
  let sum = 0;
  for (let i = 0; i < data.length; i++) {
    sum += data[i].clpr;
    if (i >= n) sum -= data[i - n].clpr;
    if (i >= n - 1) out.push({ time: isoDate(data[i].basDt), value: sum / n });
  }
  return out;
}

interface Props {
  data: DailyPrice[]; // 전체 일별시세 (오름차순) — 이동평균을 기간 시작부터 정확히 계산하기 위해 전체를 받음
  range: [number, number]; // 표시할 data 인덱스 구간 [시작, 끝]
}

export default function PriceChart({ data, range }: Props) {
  const [rangeStart, rangeEnd] = range;
  const boxRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);

  const maValues = useMemo(() => MAS.map((m) => movingAverage(data, m.n)), [data]);

  useEffect(() => {
    if (!boxRef.current || data.length === 0) return;
    const chart = createChart(boxRef.current, {
      autoSize: true,
      layout: {
        background: { type: ColorType.Solid, color: "#ffffff" },
        textColor: "#4a5261",
        fontSize: 11,
        fontFamily: '"IBM Plex Mono", Consolas, monospace',
        attributionLogo: false,
      },
      grid: { vertLines: { color: "#f1f3f6" }, horzLines: { color: "#f1f3f6" } },
      crosshair: { mode: CrosshairMode.Normal },
      rightPriceScale: { borderColor: "#dde1e6", scaleMargins: { top: 0.1, bottom: 0.26 } },
      timeScale: { borderColor: "#dde1e6", rightOffset: 3, minBarSpacing: 2 },
      localization: {
        locale: "ko-KR",
        dateFormat: "yyyy-MM-dd",
        priceFormatter: (p: number) => Math.round(p).toLocaleString("ko-KR"),
      },
    });
    chartRef.current = chart;

    const candle = chart.addSeries(CandlestickSeries, {
      upColor: UP,
      downColor: DOWN,
      borderUpColor: UP,
      borderDownColor: DOWN,
      wickUpColor: UP,
      wickDownColor: DOWN,
    });
    candle.setData(
      data.map((d) => {
        // 거래정지일 등 시가 0 인 경우 종가로 대체
        const close = d.clpr;
        return {
          time: isoDate(d.basDt),
          open: d.mkp || close,
          high: d.hipr || close,
          low: d.lopr || close,
          close,
        };
      }),
    );

    const volume = chart.addSeries(HistogramSeries, {
      priceScaleId: "vol",
      priceFormat: { type: "volume" },
      lastValueVisible: false,
      priceLineVisible: false,
    });
    chart.priceScale("vol").applyOptions({ scaleMargins: { top: 0.8, bottom: 0 } });
    volume.setData(
      data.map((d) => ({
        time: isoDate(d.basDt),
        value: d.trqu,
        color: d.clpr >= (d.mkp || d.clpr) ? "rgba(209,36,47,0.35)" : "rgba(10,88,202,0.35)",
      })),
    );

    MAS.forEach((m, i) => {
      const s = chart.addSeries(LineSeries, {
        color: m.color,
        lineWidth: 1,
        priceLineVisible: false,
        lastValueVisible: false,
        crosshairMarkerVisible: false,
      });
      s.setData(maValues[i]);
    });

    chart.subscribeCrosshairMove((param) => {
      const idx = param.logical;
      setHoverIdx(param.time !== undefined && idx !== undefined && idx >= 0 && idx < data.length ? Math.round(idx) : null);
    });

    return () => {
      chart.remove();
      chartRef.current = null;
    };
  }, [data, maValues]);

  // 조회기간 변경 → 보이는 범위만 조정 (스크롤로 앞뒤 데이터 탐색 가능)
  useEffect(() => {
    const chart = chartRef.current;
    if (!chart || data.length === 0 || rangeStart < 0) return;
    chart.timeScale().setVisibleLogicalRange({ from: rangeStart - 0.5, to: rangeEnd + 0.5 });
  }, [rangeStart, rangeEnd, data]);

  // 범례 기본값: 조회기간의 마지막 거래일
  const cur = data[hoverIdx ?? rangeEnd];
  const maAt = (i: number) => {
    const idx = hoverIdx ?? rangeEnd;
    const v = maValues[i][idx - (MAS[i].n - 1)];
    return v ? fmtNum(v.value) : "-";
  };

  return (
    <div className="chart-wrap">
      {cur && (
        <div className="chart-legend">
          <span><b>{fmtDate(cur.basDt)}</b></span>
          <span>시 <b>{fmtNum(cur.mkp)}</b></span>
          <span>고 <b>{fmtNum(cur.hipr)}</b></span>
          <span>저 <b>{fmtNum(cur.lopr)}</b></span>
          <span>종 <b className={dir(cur.vs)}>{fmtNum(cur.clpr)}</b></span>
          <span className={dir(cur.fltRt)}>{fmtPct(cur.fltRt)}</span>
          <span>거래량 <b>{fmtNum(cur.trqu)}</b></span>
          {MAS.map((m, i) => (
            <span className="ma" key={m.n}>
              <i style={{ background: m.color }} />
              {m.n}일 <b>{maAt(i)}</b>
            </span>
          ))}
        </div>
      )}
      <div ref={boxRef} className="chart-box" />
    </div>
  );
}
