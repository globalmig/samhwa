// 자주 안 바뀌는 조회성 API(전담기관·기관 목록 등)를 위한 프로세스 내 TTL 캐시.
// deploy.bat이 단일 Node 프로세스로 배포하므로(lib/db.ts의 withDbWriteSlot과 동일한 전제)
// 인스턴스를 여러 개로 늘리지 않는 한 이 정도의 메모리 캐시로 충분하다 — 여러 인스턴스로
// 늘어나면 Redis 등 프로세스 밖 공유 저장소 기반으로 바꿔야 한다.
//
// Next.js의 unstable_cache는 v16에서 "use cache" 디렉티브(cacheComponents 활성화 필요)로
// 대체 예정이라는 안내가 붙어 있고, 이 프로젝트는 cacheComponents를 켜지 않은 상태라 여기서는
// 의존하지 않는다 — 대신 이 작은 자체 캐시로 같은 효과(TTL + 수동 무효화)를 낸다.

interface CacheEntry<T> {
  value: T;
  expiresAt: number;
}

const globalForCache = globalThis as unknown as {
  serverCache?: Map<string, CacheEntry<unknown>>;
  serverCacheGenerations?: Map<string, number>;
};
const store = globalForCache.serverCache ?? new Map<string, CacheEntry<unknown>>();
// 조회 도중(fetcher가 아직 안 끝난 사이) 다른 요청이 그 데이터를 바꿔 invalidateCache를 부르면,
// 뒤늦게 끝난 조회가 그 바뀌기 "전" 값을 다시 store에 써넣어 무효화를 무의미하게 만들 수 있다
// (재현된 버그). 키마다 세대 번호를 두고, invalidateCache가 세대를 올려 "이 시점 이후 도착하는
// 결과는 낡은 것"이라고 표시한다 — fetcher 시작 시점의 세대와 끝난 시점의 세대가 다르면 그
// 결과는 store에 쓰지 않는다(호출자에게는 그대로 반환 — 어차피 그 순간엔 최선의 값이었다).
const generations = globalForCache.serverCacheGenerations ?? new Map<string, number>();
if (process.env.NODE_ENV !== "production") {
  globalForCache.serverCache = store;
  globalForCache.serverCacheGenerations = generations;
}

// 같은 키에 대한 캐시 미스가 동시에 여러 건 들어오면(예: 여러 사용자가 거의 동시에 접속) 그
// 요청 수만큼 DB를 중복 조회하게 되므로, 진행 중인 조회를 공유해 한 번만 실제로 쿼리한다.
// 어느 세대에서 시작된 조회인지 함께 들고 있어야, 조회 도중 무효화가 일어났을 때 그 낡은
// in-flight 조회를 뒤이은 요청들이 그대로 받아가지 않고 새로 조회를 시작할 수 있다 — 세대
// 체크 없이 promise만 공유하면, store에는 안 쓰여도 "응답 자체"는 여전히 낡은 값이 나간다.
const inFlight = new Map<string, { generation: number; promise: Promise<unknown> }>();

function generationOf(key: string): number {
  return generations.get(key) ?? 0;
}

export async function cached<T>(key: string, ttlMs: number, fetcher: () => Promise<T>): Promise<T> {
  const hit = store.get(key);
  if (hit && hit.expiresAt > Date.now()) return hit.value as T;

  const generationAtStart = generationOf(key);
  const pending = inFlight.get(key);
  if (pending && pending.generation === generationAtStart) return pending.promise as Promise<T>;

  const promise = fetcher()
    .then((value) => {
      if (generationOf(key) === generationAtStart) {
        store.set(key, { value, expiresAt: Date.now() + ttlMs });
      }
      return value;
    })
    .finally(() => {
      // 이 fetch가 떠 있는 동안 무효화로 인해 뒤이은 요청이 새 세대로 자신을 덮어썼을 수 있다 —
      // 그 새 in-flight 항목을 자신이 끝났다고 지워버리면 안 되므로, 여전히 자기 자신일 때만 지운다.
      const entry = inFlight.get(key);
      if (entry?.promise === promise) inFlight.delete(key);
    });
  inFlight.set(key, { generation: generationAtStart, promise });
  return promise;
}

export function invalidateCache(key: string): void {
  store.delete(key);
  generations.set(key, generationOf(key) + 1);
}

// route.ts는 HTTP 메서드(GET/POST/...)와 Next.js가 정해둔 설정 필드(runtime, dynamic 등) 외의
// export를 두면 빌드 시 오류가 나므로, 여러 route 파일이 함께 참조하는 캐시 키는 여기 둔다.
export const FUNDING_AGENCIES_CACHE_KEY = "funding-agencies";
export const INSTITUTIONS_CACHE_KEY = "institutions";
