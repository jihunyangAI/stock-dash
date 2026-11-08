"use client";

import { useEffect, useState } from "react";
import { MIN_ISO, PRESETS, todayIso, type PresetKey, type Range } from "@/lib/period";

interface Props {
  label: string;
  value: Range | null;
  disabled?: boolean;
  /** 프리셋 키 목록 (기본: 전체) */
  presets?: PresetKey[];
  onApply: (from: string, to: string) => void; // 직접 입력 조회
  onPreset: (key: PresetKey) => void;
}

/** 시작일 ~ 종료일 직접 입력 + 기간 프리셋 */
export default function RangeBar({ label, value, disabled, presets, onApply, onPreset }: Props) {
  const [from, setFrom] = useState(value?.from ?? "");
  const [to, setTo] = useState(value?.to ?? "");

  useEffect(() => {
    if (value) {
      setFrom(value.from);
      setTo(value.to);
    }
  }, [value]);

  const keys = presets ?? PRESETS.map((p) => p.key);

  return (
    <div className="section-head range-bar">
      {label}
      <div className="tools">
        <form
          className="date-range"
          onSubmit={(e) => {
            e.preventDefault();
            onApply(from, to);
          }}
        >
          <input
            type="date"
            className="input date"
            aria-label="시작일"
            min={MIN_ISO}
            max={to || todayIso()}
            value={from}
            onChange={(e) => setFrom(e.target.value)}
            required
          />
          <span className="muted">~</span>
          <input
            type="date"
            className="input date"
            aria-label="종료일"
            min={from || MIN_ISO}
            max={todayIso()}
            value={to}
            onChange={(e) => setTo(e.target.value)}
            required
          />
          <button className="btn btn-sm btn-primary" disabled={disabled}>조회</button>
        </form>
        <div className="seg">
          {keys.map((k) => (
            <button key={k} className={value?.preset === k ? "on" : ""} disabled={disabled} onClick={() => onPreset(k)}>
              {k}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
