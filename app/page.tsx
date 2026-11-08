"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { SearchResult, WatchRow } from "@/lib/types";
import { fmtDate } from "@/lib/format";
import SearchPanel from "@/components/SearchPanel";
import WatchlistPanel from "@/components/WatchlistPanel";
import StockDetail from "@/components/StockDetail";
import CompareView from "@/components/CompareView";
import { DeleteDialog, EditDialog, type EditValues } from "@/components/Dialogs";

type Toast = { msg: string; error?: boolean } | null;

export default function Dashboard() {
  const [rows, setRows] = useState<WatchRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<string | null>(null);
  const [editing, setEditing] = useState<WatchRow | null>(null);
  const [deleting, setDeleting] = useState<WatchRow | null>(null);
  const [toast, setToast] = useState<Toast>(null);
  const [clock, setClock] = useState("");
  const [view, setView] = useState<"detail" | "compare">("detail");

  const notify = useCallback((msg: string, error = false) => {
    setToast({ msg, error });
    setTimeout(() => setToast(null), 3500);
  }, []);

  const reload = useCallback(async () => {
    try {
      const res = await fetch("/api/watchlist", { cache: "no-store" });
      const json = await res.json();
      setRows(json.items ?? []);
      return (json.items ?? []) as WatchRow[];
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    reload().then((items) => {
      if (items.length) setSelected((s) => s ?? items[0].srtnCd);
    });
  }, [reload]);

  useEffect(() => {
    const tick = () =>
      setClock(new Date(Date.now() + 9 * 3600_000).toISOString().slice(0, 19).replace("T", " "));
    tick();
    const t = setInterval(tick, 1000);
    return () => clearInterval(t);
  }, []);

  const registered = useMemo(() => new Set(rows.map((r) => r.srtnCd)), [rows]);
  const groups = useMemo(() => [...new Set(rows.map((r) => r.group).filter(Boolean))].sort(), [rows]);
  const current = rows.find((r) => r.srtnCd === selected) ?? null;
  const latestDate = rows.reduce((m, r) => (r.quote && r.quote.basDt > m ? r.quote.basDt : m), "");

  const add = async (r: SearchResult) => {
    const res = await fetch("/api/watchlist", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(r),
    });
    const json = await res.json();
    if (!res.ok) return notify(json.error ?? "등록 실패", true);
    await reload();
    setSelected(r.srtnCd);
    notify(json.warning ?? `${r.itmsNm} 등록 완료`, !!json.warning);
  };

  const save = async (v: EditValues) => {
    if (!editing) return;
    const res = await fetch(`/api/watchlist/${editing.srtnCd}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(v),
    });
    const json = await res.json();
    if (!res.ok) throw new Error(json.error ?? "수정 실패");
    await reload();
    notify(`${editing.itmsNm} 수정 완료`);
    setEditing(null);
  };

  const remove = async () => {
    if (!deleting) return;
    const target = deleting;
    const res = await fetch(`/api/watchlist/${target.srtnCd}`, { method: "DELETE" });
    const json = await res.json();
    setDeleting(null);
    if (!res.ok) return notify(json.error ?? "삭제 실패", true);
    const items = await reload();
    if (selected === target.srtnCd) setSelected(items[0]?.srtnCd ?? null);
    notify(`${target.itmsNm} 삭제 완료`);
  };

  const onSynced = useCallback(() => {
    reload();
  }, [reload]);

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <span className="brand-mark">
            STOCK<span>·</span>DASH
          </span>
          <span className="brand-sub">관심종목 시세 모니터</span>
        </div>
        <div className="topbar-right">
          <span className="hide-sm">
            기준일 <span className="mono">{latestDate ? fmtDate(latestDate) : "-"}</span>
          </span>
          <span>
            <span className="live-dot" />
            KST <span className="mono">{clock}</span>
          </span>
        </div>
      </header>

      <div className="workspace">
        <aside className="sidebar">
          <SearchPanel registered={registered} onAdd={add} />
          <WatchlistPanel
            rows={rows}
            selected={selected}
            loading={loading}
            onSelect={(code) => {
              setSelected(code);
              setView("detail");
            }}
            onEdit={setEditing}
            onDelete={setDeleting}
          />
        </aside>
        <main className="main">
          <div className="tabs view-tabs" role="tablist">
            <button role="tab" aria-selected={view === "detail"} className={view === "detail" ? "on" : ""} onClick={() => setView("detail")}>
              종목상세
            </button>
            <button role="tab" aria-selected={view === "compare"} className={view === "compare" ? "on" : ""} onClick={() => setView("compare")}>
              종목비교
            </button>
          </div>
          {view === "compare" ? (
            <CompareView rows={rows} />
          ) : current ? (
            <StockDetail key={current.srtnCd} row={current} onEdit={setEditing} onSynced={onSynced} />
          ) : (
            <div className="empty-state">
              <div>
                <h2>{loading ? "불러오는 중…" : "종목을 선택하세요"}</h2>
                <div className="hint">왼쪽 관심종목 목록에서 종목을 선택하면 일별시세 차트와 표가 표시됩니다.</div>
              </div>
            </div>
          )}
        </main>
      </div>

      <footer className="statusbar">
        <span>SRC 금융위원회_주식시세정보 (data.go.kr)</span>
        <span className="sep">|</span>
        <span>일별 데이터 · 영업일 기준 익일 공개</span>
        <span className="right">관심종목 {rows.length}</span>
      </footer>

      {editing && <EditDialog row={editing} groups={groups} onClose={() => setEditing(null)} onSave={save} />}
      {deleting && <DeleteDialog row={deleting} onClose={() => setDeleting(null)} onConfirm={remove} />}
      {toast && <div className={`toast ${toast.error ? "error" : ""}`}>{toast.msg}</div>}
    </div>
  );
}
