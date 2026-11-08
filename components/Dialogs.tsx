"use client";

import { useEffect, useState } from "react";
import type { WatchRow } from "@/lib/types";

function Overlay({ onClose, children }: { onClose: () => void; children: React.ReactNode }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  return (
    <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="dialog" role="dialog" aria-modal="true">
        {children}
      </div>
    </div>
  );
}

export interface EditValues {
  group: string;
  targetPrice: number | null;
  memo: string;
}

export function EditDialog({
  row,
  groups,
  onClose,
  onSave,
}: {
  row: WatchRow;
  groups: string[];
  onClose: () => void;
  onSave: (v: EditValues) => Promise<void>;
}) {
  const [group, setGroup] = useState(row.group);
  const [target, setTarget] = useState(row.targetPrice?.toString() ?? "");
  const [memo, setMemo] = useState(row.memo);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const t = target.replace(/,/g, "").trim();
    if (t && (!/^\d+$/.test(t) || Number(t) <= 0)) {
      setError("목표가는 0보다 큰 정수로 입력하세요.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await onSave({ group: group.trim(), targetPrice: t ? Number(t) : null, memo });
    } catch (err: any) {
      setError(err.message ?? "저장 실패");
      setSaving(false);
    }
  };

  return (
    <Overlay onClose={onClose}>
      <form onSubmit={submit}>
        <div className="dialog-head">
          관심종목 수정 <span className="code">{row.itmsNm} · {row.srtnCd}</span>
        </div>
        <div className="dialog-body">
          <div className="field">
            <label htmlFor="f-group">그룹</label>
            <input
              id="f-group"
              className="input"
              list="group-options"
              value={group}
              maxLength={20}
              placeholder="예: 반도체, 배당주"
              onChange={(e) => setGroup(e.target.value)}
              autoFocus
            />
            <datalist id="group-options">
              {groups.map((g) => (
                <option key={g} value={g} />
              ))}
            </datalist>
          </div>
          <div className="field">
            <label htmlFor="f-target">목표가 (원)</label>
            <input
              id="f-target"
              className="input mono"
              inputMode="numeric"
              value={target}
              placeholder="미설정"
              onChange={(e) => setTarget(e.target.value)}
            />
            <div className="help">상세 화면에 현재 종가 대비 괴리율이 표시됩니다.</div>
          </div>
          <div className="field">
            <label htmlFor="f-memo">메모</label>
            <textarea
              id="f-memo"
              className="input"
              rows={4}
              maxLength={500}
              value={memo}
              onChange={(e) => setMemo(e.target.value)}
            />
          </div>
          {error && <div className="form-error">{error}</div>}
        </div>
        <div className="dialog-foot">
          <button type="button" className="btn" onClick={onClose}>취소</button>
          <button className="btn btn-primary" disabled={saving}>{saving ? "저장중…" : "저장"}</button>
        </div>
      </form>
    </Overlay>
  );
}

export function DeleteDialog({
  row,
  onClose,
  onConfirm,
}: {
  row: WatchRow;
  onClose: () => void;
  onConfirm: () => Promise<void>;
}) {
  const [busy, setBusy] = useState(false);
  return (
    <Overlay onClose={onClose}>
      <div className="dialog-head">관심종목 삭제</div>
      <div className="dialog-body">
        <div>
          <b>{row.itmsNm}</b> <span className="code mono muted">({row.srtnCd})</span> 을(를) 관심종목에서 삭제합니다.
        </div>
        <div className="muted" style={{ fontSize: 12 }}>저장된 일별시세 데이터 파일도 함께 삭제됩니다.</div>
      </div>
      <div className="dialog-foot">
        <button className="btn" onClick={onClose}>취소</button>
        <button
          className="btn btn-danger solid"
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            await onConfirm();
          }}
        >
          {busy ? "삭제중…" : "삭제"}
        </button>
      </div>
    </Overlay>
  );
}
