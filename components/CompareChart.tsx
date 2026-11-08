"use client";

import { useEffect, useRef, useState } from "react";
import { ColorType, CrosshairMode, LineSeries, LineStyle, createChart, type Time } from "lightweight-charts";
import { fmtPct } from "@/lib/format";

export interface CompareSeries {
  code: string;
  name: string;
  color: string;
  data: { time: string; value: number }[]; // value = 기간 시작일 대비 변화율(%)
}

interface Tip {
  x: number;
  y: number;
  date: string;
  rows: { code: string; name: string; color: string; value: number }[];
}

const pctLabel = (p: number) => `${p > 0 ? "+" : ""}${p.toFixed(1)}%`;

function timeToLabel(t: Time) {
  if (typeof t === "string") return t.replace(/-/g, ".");
  if (typeof t === "number") return new Date(t * 1000).toISOString().slice(0, 10).replace(/-/g, ".");
  return `${t.year}.${String(t.month).padStart(2, "0")}.${String(t.day).padStart(2, "0")}`;
}

/** 여러 종목의 기간 변화율(%)을 하나의 축에 그리는 선형 차트 + 크로스헤어 툴팁 */
export default function CompareChart({ series }: { series: CompareSeries[] }) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const boxRef = useRef<HTMLDivElement>(null);
  const [tip, setTip] = useState<Tip | null>(null);

  useEffect(() => {
    if (!boxRef.current || series.length === 0) return;
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
      crosshair: { mode: CrosshairMode.Magnet },
      rightPriceScale: { borderColor: "#dde1e6", scaleMargins: { top: 0.08, bottom: 0.08 } },
      timeScale: { borderColor: "#dde1e6", rightOffset: 2 },
      localization: { locale: "ko-KR", dateFormat: "yyyy-MM-dd", priceFormatter: pctLabel },
    });

    const apis = series.map((s, i) => {
      const line = chart.addSeries(LineSeries, {
        color: s.color,
        lineWidth: 2,
        priceLineVisible: false,
        lastValueVisible: true,
        crosshairMarkerRadius: 4,
        crosshairMarkerBorderColor: "#ffffff",
        crosshairMarkerBorderWidth: 2,
        priceFormat: { type: "custom", formatter: pctLabel, minMove: 0.01 },
      });
      line.setData(s.data);
      // 0% 기준선 (한 번만)
      if (i === 0) {
        line.createPriceLine({
          price: 0,
          color: "#8a919d",
          lineWidth: 1,
          lineStyle: LineStyle.Dashed,
          axisLabelVisible: false,
          title: "",
        });
      }
      return { s, line };
    });
    chart.timeScale().fitContent();

    chart.subscribeCrosshairMove((param) => {
      if (!param.point || param.time === undefined || param.point.x < 0 || param.point.y < 0) {
        setTip(null);
        return;
      }
      const rows = apis
        .map(({ s, line }) => {
          const d = param.seriesData.get(line) as { value?: number } | undefined;
          return d?.value === undefined ? null : { code: s.code, name: s.name, color: s.color, value: d.value };
        })
        .filter((r): r is NonNullable<typeof r> => r !== null)
        .sort((a, b) => b.value - a.value);
      if (rows.length === 0) return setTip(null);
      setTip({ x: param.point.x, y: param.point.y, date: timeToLabel(param.time), rows });
    });

    return () => {
      chart.remove();
      setTip(null);
    };
  }, [series]);

  // 툴팁이 차트 밖으로 나가지 않도록 커서 반대편으로 배치
  const width = wrapRef.current?.clientWidth ?? 0;
  const tipStyle = tip
    ? tip.x > width - 240
      ? { right: width - tip.x + 16, top: Math.max(8, tip.y - 40) }
      : { left: tip.x + 16, top: Math.max(8, tip.y - 40) }
    : undefined;

  return (
    <div className="chart-wrap compare-chart" ref={wrapRef}>
      <div ref={boxRef} className="chart-box" />
      {tip && (
        <div className="chart-tooltip" style={tipStyle}>
          <div className="tt-date">{tip.date}</div>
          {tip.rows.map((r) => (
            <div className="tt-row" key={r.code}>
              <i style={{ background: r.color }} />
              <span className="tt-name">{r.name}</span>
              <b className={r.value > 0 ? "up" : r.value < 0 ? "down" : "flat"}>{fmtPct(r.value)}</b>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
