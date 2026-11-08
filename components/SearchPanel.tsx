"use client";

import { useState } from "react";
import type { SearchResult } from "@/lib/types";
import { dir, fmtNum, fmtPct } from "@/lib/format";
import MarketTag from "./MarketTag";

interface Props {
  registered: Set<string>;
  onAdd: (r: SearchResult) => Promise<void>;
}

export default function SearchPanel({ registered, onAdd }: Props) {
  const [q, setQ] = useState("");
  const [results, setResults] = useState<SearchResult[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [adding, setAdding] = useState<string | null>(null);

  const search = async (e?: React.FormEvent) => {
    e?.preventDefault();
    const query = q.trim();
    if (!query) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/search?q=${encodeURIComponent(query)}`);
      const json = await res.json();
      if (!res.ok) throw new Error(json.error);
      setResults(json.results);
    } catch (err: any) {
      setError(err.message ?? "검색 실패");
      setResults(null);
    } finally {
      setLoading(false);
    }
  };

  const add = async (r: SearchResult) => {
    setAdding(r.srtnCd);
    try {
      await onAdd(r);
    } finally {
      setAdding(null);
    }
  };

  return (
    <section className="panel">
      <div className="panel-head">
        종목 검색
        {results && <span className="count">{results.length}건</span>}
        {results && (
          <div className="tools">
            <button className="btn btn-sm" onClick={() => setResults(null)}>닫기</button>
          </div>
        )}
      </div>
      <form className="search-form" onSubmit={search}>
        <input
          className="input"
          placeholder="종목명 또는 종목코드 (예: 삼성, 005930)"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          maxLength={30}
        />
        <button className="btn btn-primary" disabled={loading || !q.trim()}>
          {loading ? "검색중" : "검색"}
        </button>
      </form>
      {loading && <div className="loading-bar" />}
      {error && <div className="banner error">{error}</div>}
      {results && (
        <div className="search-results">
          {results.length === 0 ? (
            <div className="search-empty">검색 결과가 없습니다.</div>
          ) : (
            <table className="grid">
              <tbody>
                {results.map((r) => {
                  const isReg = registered.has(r.srtnCd);
                  return (
                    <tr key={r.srtnCd}>
                      <td>
                        <div className="name">{r.itmsNm}</div>
                        <div className="code">
                          {r.srtnCd} <MarketTag market={r.mrktCtg} />
                        </div>
                      </td>
                      <td className="num">
                        <div className={dir(r.vs)}>{fmtNum(r.clpr)}</div>
                        <div className={`${dir(r.fltRt)}`} style={{ fontSize: 11 }}>{fmtPct(r.fltRt)}</div>
                      </td>
                      <td className="actions">
                        {isReg ? (
                          <span className="tag">등록됨</span>
                        ) : (
                          <button className="btn btn-sm" disabled={adding !== null} onClick={() => add(r)}>
                            {adding === r.srtnCd ? "등록중…" : "+ 등록"}
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      )}
    </section>
  );
}
