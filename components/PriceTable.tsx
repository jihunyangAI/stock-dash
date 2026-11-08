"use client";

import { useEffect, useMemo, useState } from "react";
import type { DailyPrice } from "@/lib/types";
import { dir, fmtDate, fmtNum, fmtPct } from "@/lib/format";

const PAGE_SIZE = 20;

interface Props {
  rows: DailyPrice[]; // 기간 필터된 일별시세 (오름차순)
  caption?: string; // 조회기간 표시
  fileName: string;
}

export default function PriceTable({ rows, caption, fileName }: Props) {
  const [page, setPage] = useState(0);
  const desc = useMemo(() => [...rows].reverse(), [rows]);
  const pages = Math.max(1, Math.ceil(desc.length / PAGE_SIZE));

  useEffect(() => setPage(0), [rows]);

  const view = desc.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

  const exportCsv = () => {
    const head = ["일자", "종가", "대비", "등락률", "시가", "고가", "저가", "거래량", "거래대금", "시가총액"];
    const lines = desc.map((r) =>
      [fmtDate(r.basDt), r.clpr, r.vs, r.fltRt, r.mkp, r.hipr, r.lopr, r.trqu, r.trPrc, r.mrktTotAmt].join(","),
    );
    const blob = new Blob(["﻿" + [head.join(","), ...lines].join("\n")], { type: "text/csv;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `${fileName}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  return (
    <>
      <div className="section-head">
        일별시세
        {caption && <span className="mono" style={{ fontWeight: 500, letterSpacing: 0 }}>{caption}</span>}
        <span className="count mono muted">{desc.length}거래일</span>
        <div className="tools">
          <button className="btn btn-sm" onClick={exportCsv} disabled={desc.length === 0}>
            CSV 내보내기
          </button>
        </div>
      </div>
      <div className="table-wrap">
        <table className="grid">
          <thead>
            <tr>
              <th>일자</th>
              <th className="num">종가</th>
              <th className="num">대비</th>
              <th className="num">등락률</th>
              <th className="num">시가</th>
              <th className="num">고가</th>
              <th className="num">저가</th>
              <th className="num">거래량</th>
              <th className="num">거래대금(백만)</th>
            </tr>
          </thead>
          <tbody>
            {view.map((r) => (
              <tr key={r.basDt}>
                <td className="mono">{fmtDate(r.basDt)}</td>
                <td className={`num ${dir(r.vs)}`} style={{ fontWeight: 600 }}>{fmtNum(r.clpr)}</td>
                <td className={`num ${dir(r.vs)}`}>
                  {r.vs > 0 ? "▲ " : r.vs < 0 ? "▼ " : ""}
                  {fmtNum(Math.abs(r.vs))}
                </td>
                <td className={`num ${dir(r.fltRt)}`}>{fmtPct(r.fltRt)}</td>
                <td className="num">{fmtNum(r.mkp)}</td>
                <td className="num">{fmtNum(r.hipr)}</td>
                <td className="num">{fmtNum(r.lopr)}</td>
                <td className="num">{fmtNum(r.trqu)}</td>
                <td className="num">{fmtNum(r.trPrc / 1e6)}</td>
              </tr>
            ))}
            {view.length === 0 && (
              <tr>
                <td colSpan={9} className="muted" style={{ textAlign: "center", height: 60 }}>
                  데이터가 없습니다
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      {pages > 1 && (
        <div className="pager">
          <button className="btn btn-sm" disabled={page === 0} onClick={() => setPage(0)}>«</button>
          <button className="btn btn-sm" disabled={page === 0} onClick={() => setPage((p) => p - 1)}>‹ 이전</button>
          <span>
            {page + 1} / {pages}
          </span>
          <button className="btn btn-sm" disabled={page >= pages - 1} onClick={() => setPage((p) => p + 1)}>다음 ›</button>
          <button className="btn btn-sm" disabled={page >= pages - 1} onClick={() => setPage(pages - 1)}>»</button>
        </div>
      )}
    </>
  );
}
