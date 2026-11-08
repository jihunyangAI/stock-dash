"use client";

import { useMemo, useState } from "react";
import type { WatchRow } from "@/lib/types";
import { dir, fmtNum, fmtPct } from "@/lib/format";
import MarketTag from "./MarketTag";

type SortKey = "order" | "itmsNm" | "clpr" | "fltRt";

interface Props {
  rows: WatchRow[];
  selected: string | null;
  loading: boolean;
  onSelect: (code: string) => void;
  onEdit: (row: WatchRow) => void;
  onDelete: (row: WatchRow) => void;
}

export default function WatchlistPanel({ rows, selected, loading, onSelect, onEdit, onDelete }: Props) {
  const [group, setGroup] = useState<string>("");
  const [sort, setSort] = useState<{ key: SortKey; asc: boolean }>({ key: "order", asc: true });

  const groups = useMemo(() => [...new Set(rows.map((r) => r.group).filter(Boolean))].sort(), [rows]);

  const view = useMemo(() => {
    const filtered = group ? rows.filter((r) => r.group === group) : rows;
    if (sort.key === "order") return filtered;
    const val = (r: WatchRow) =>
      sort.key === "itmsNm" ? r.itmsNm : sort.key === "clpr" ? r.quote?.clpr ?? -Infinity : r.quote?.fltRt ?? -Infinity;
    return [...filtered].sort((a, b) => {
      const va = val(a);
      const vb = val(b);
      const c = typeof va === "string" ? va.localeCompare(vb as string, "ko") : (va as number) - (vb as number);
      return sort.asc ? c : -c;
    });
  }, [rows, group, sort]);

  // 클릭 순환: 기본방향 → 반대방향 → 원래 순서
  // (종목명은 오름차순, 종가·등락률은 내림차순이 기본 — 큰 값부터 보는 게 일반적)
  const toggleSort = (key: SortKey) =>
    setSort((s) => {
      const defaultAsc = key === "itmsNm";
      if (s.key !== key) return { key, asc: defaultAsc };
      if (s.asc === defaultAsc) return { key, asc: !defaultAsc };
      return { key: "order", asc: true };
    });
  const arrow = (key: SortKey) => (sort.key === key ? (sort.asc ? " ▲" : " ▼") : "");

  return (
    <section className="panel">
      <div className="panel-head">
        관심종목
        <span className="count">{rows.length}</span>
      </div>
      {groups.length > 0 && (
        <div className="group-bar">
          <button className={`chip ${group === "" ? "on" : ""}`} onClick={() => setGroup("")}>전체</button>
          {groups.map((g) => (
            <button key={g} className={`chip ${group === g ? "on" : ""}`} onClick={() => setGroup(g)}>
              {g}
            </button>
          ))}
        </div>
      )}
      {loading && <div className="loading-bar" />}
      <div className="panel-body">
        {rows.length === 0 && !loading ? (
          <div className="empty-state">
            <div>
              <h2>등록된 관심종목이 없습니다</h2>
              <div className="hint">위 검색창에서 종목을 찾아 등록하세요.</div>
            </div>
          </div>
        ) : (
          <table className="grid">
            <thead>
              <tr>
                <th className="sortable" onClick={() => toggleSort("itmsNm")}>종목{arrow("itmsNm")}</th>
                <th className="num sortable" onClick={() => toggleSort("clpr")}>종가{arrow("clpr")}</th>
                <th className="num sortable" onClick={() => toggleSort("fltRt")}>등락률{arrow("fltRt")}</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {view.map((r) => (
                <tr
                  key={r.srtnCd}
                  className={`clickable ${selected === r.srtnCd ? "selected" : ""}`}
                  onClick={() => onSelect(r.srtnCd)}
                >
                  <td>
                    <div className="name">{r.itmsNm}</div>
                    <div className="code">
                      {r.srtnCd} <MarketTag market={r.mrktCtg} />
                      {r.group && <span className="tag" style={{ marginLeft: 4 }}>{r.group}</span>}
                    </div>
                  </td>
                  <td className={`num ${r.quote ? dir(r.quote.vs) : ""}`} style={{ fontWeight: 600 }}>
                    {r.quote ? fmtNum(r.quote.clpr) : "-"}
                  </td>
                  <td className={`num ${r.quote ? dir(r.quote.fltRt) : ""}`}>
                    {r.quote ? fmtPct(r.quote.fltRt) : "-"}
                  </td>
                  <td className="actions">
                    <span className="row-actions">
                      <button
                        className="btn btn-icon"
                        title="수정"
                        onClick={(e) => {
                          e.stopPropagation();
                          onEdit(r);
                        }}
                      >
                        ✎
                      </button>
                      <button
                        className="btn btn-icon"
                        title="삭제"
                        onClick={(e) => {
                          e.stopPropagation();
                          onDelete(r);
                        }}
                      >
                        ✕
                      </button>
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </section>
  );
}
