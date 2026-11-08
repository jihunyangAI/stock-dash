// 데이터 저장소
//   - 로컬 개발: JSON 파일 (data/watchlist.json, data/prices/{code}.json, data/dividends/{code}.json)
//   - Vercel (DB 없음): /tmp 임시 파일 — 관심종목은 저장소의 data/watchlist.json 으로 시작하며,
//     화면에서 바꾼 내용·시세 캐시는 서버 인스턴스가 재시작되면 초기화됨
//   - Redis 연결 시: KV_REST_API_URL / UPSTASH_REDIS_REST_URL 이 있으면 Upstash Redis 에 영구 저장
import { promises as fs } from "fs";
import path from "path";
import { Redis } from "@upstash/redis";
import seedWatchlist from "@/data/watchlist.json";
import type { DividendDoc, PriceDoc, WatchItem } from "./types";

export const CODE_RE = /^[0-9A-Z]{6}$/;

interface Backend {
  get<T>(key: string): Promise<T | null>;
  set(key: string, value: unknown): Promise<void>;
  del(key: string): Promise<void>;
}

// ── 파일 백엔드 ─────────────────────────────────────────
// Vercel 서버리스는 배포 파일이 읽기 전용이라 /tmp 만 쓸 수 있음
const onVercel = Boolean(process.env.VERCEL);
const DATA_DIR = onVercel ? "/tmp/stock-dash" : path.join(process.cwd(), "data");
const fileOf = (key: string) => path.join(DATA_DIR, `${key}.json`);

const fileBackend: Backend = {
  async get<T>(key: string) {
    try {
      return JSON.parse(await fs.readFile(fileOf(key), "utf-8")) as T;
    } catch (e: any) {
      if (e?.code === "ENOENT") return null;
      throw e;
    }
  },
  async set(key, value) {
    const file = fileOf(key);
    await fs.mkdir(path.dirname(file), { recursive: true });
    const tmp = `${file}.${process.pid}.${Date.now()}.tmp`;
    await fs.writeFile(tmp, JSON.stringify(value, null, 2), "utf-8");
    await fs.rename(tmp, file);
  },
  async del(key) {
    await fs.rm(fileOf(key), { force: true });
  },
};

// ── Redis 백엔드 ────────────────────────────────────────
const REDIS_PREFIX = "stockdash:";

function redisBackend(redis: Redis): Backend {
  return {
    get: <T>(key: string) => redis.get<T>(REDIS_PREFIX + key),
    async set(key, value) {
      await redis.set(REDIS_PREFIX + key, value);
    },
    async del(key) {
      await redis.del(REDIS_PREFIX + key);
    },
  };
}

let backend: Backend | null = null;
export const usingRedis = () => Boolean(process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL);
function db(): Backend {
  if (!backend) backend = usingRedis() ? redisBackend(Redis.fromEnv()) : fileBackend;
  return backend;
}

// 쓰기 직렬화 (같은 인스턴스 내 동시 요청 시 덮어쓰기 방지)
let queue: Promise<unknown> = Promise.resolve();
export function serialize<T>(fn: () => Promise<T>): Promise<T> {
  const run = queue.then(fn, fn);
  queue = run.catch(() => undefined);
  return run;
}

function codeKey(kind: "prices" | "dividends", code: string) {
  if (!CODE_RE.test(code)) throw new Error(`잘못된 종목코드: ${code}`);
  return `${kind}/${code}`;
}

// ── 관심종목 ────────────────────────────────────────────
export async function getWatchlist(): Promise<WatchItem[]> {
  const list = await db().get<WatchItem[]>("watchlist");
  if (list) return list;
  // Redis·Vercel 최초 사용 시 저장소에 포함된 기본 관심종목으로 시작
  return usingRedis() || onVercel ? (seedWatchlist as WatchItem[]) : [];
}
export const saveWatchlist = (list: WatchItem[]) => db().set("watchlist", list);

// ── 일별시세 ────────────────────────────────────────────
export const getPriceDoc = (code: string) => db().get<PriceDoc>(codeKey("prices", code));
export const savePriceDoc = (doc: PriceDoc) => db().set(codeKey("prices", doc.srtnCd), doc);
export const deletePriceDoc = (code: string) => db().del(codeKey("prices", code));

// ── 배당내역 ────────────────────────────────────────────
export const getDividendDoc = (code: string) => db().get<DividendDoc>(codeKey("dividends", code));
export const saveDividendDoc = (doc: DividendDoc) => db().set(codeKey("dividends", doc.srtnCd), doc);
export const deleteDividendDoc = (code: string) => db().del(codeKey("dividends", code));
