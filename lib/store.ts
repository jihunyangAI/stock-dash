// JSON 파일 저장소
//   data/watchlist.json         — 관심종목 목록 (종목 공통정보 포함)
//   data/prices/{srtnCd}.json   — 종목별 일별시세
import { promises as fs } from "fs";
import path from "path";
import type { DividendDoc, PriceDoc, WatchItem } from "./types";

const DATA_DIR = path.join(process.cwd(), "data");
const WATCHLIST_FILE = path.join(DATA_DIR, "watchlist.json");
const PRICES_DIR = path.join(DATA_DIR, "prices");

export const CODE_RE = /^[0-9A-Z]{6}$/;

function priceFile(code: string) {
  if (!CODE_RE.test(code)) throw new Error(`잘못된 종목코드: ${code}`);
  return path.join(PRICES_DIR, `${code}.json`);
}

async function readJson<T>(file: string, fallback: T): Promise<T> {
  try {
    return JSON.parse(await fs.readFile(file, "utf-8")) as T;
  } catch (e: any) {
    if (e?.code === "ENOENT") return fallback;
    throw e;
  }
}

async function writeJson(file: string, data: unknown) {
  await fs.mkdir(path.dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.${Date.now()}.tmp`;
  await fs.writeFile(tmp, JSON.stringify(data, null, 2), "utf-8");
  await fs.rename(tmp, file);
}

// 파일 쓰기 직렬화 (동시 요청 시 덮어쓰기 방지)
let queue: Promise<unknown> = Promise.resolve();
export function serialize<T>(fn: () => Promise<T>): Promise<T> {
  const run = queue.then(fn, fn);
  queue = run.catch(() => undefined);
  return run;
}

export const getWatchlist = () => readJson<WatchItem[]>(WATCHLIST_FILE, []);
export const saveWatchlist = (list: WatchItem[]) => writeJson(WATCHLIST_FILE, list);

export const getPriceDoc = (code: string) => readJson<PriceDoc | null>(priceFile(code), null);
export const savePriceDoc = (doc: PriceDoc) => writeJson(priceFile(doc.srtnCd), doc);

export async function deletePriceDoc(code: string) {
  await fs.rm(priceFile(code), { force: true });
}

// 배당내역 — data/dividends/{srtnCd}.json
const DIVIDENDS_DIR = path.join(DATA_DIR, "dividends");
function dividendFile(code: string) {
  if (!CODE_RE.test(code)) throw new Error(`잘못된 종목코드: ${code}`);
  return path.join(DIVIDENDS_DIR, `${code}.json`);
}
export const getDividendDoc = (code: string) => readJson<DividendDoc | null>(dividendFile(code), null);
export const saveDividendDoc = (doc: DividendDoc) => writeJson(dividendFile(doc.srtnCd), doc);
export async function deleteDividendDoc(code: string) {
  await fs.rm(dividendFile(code), { force: true });
}
