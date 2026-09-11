import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient; dbWriteState?: DbWriteState };

export const prisma = globalForPrisma.prisma ?? new PrismaClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}

// ============================================================
// 쓰기 동시성 제한
// ============================================================
// lib/store.ts의 throttledFetch는 브라우저 탭 하나 기준으로만 동시 요청 수를 제한한다. 내부 ERP라
// 여러 사용자가 동시에 각자 RCMS 엑셀 대량 업로드를 실행하는 게 정상적인 사용 패턴이므로, 세션을
// 넘어 이 서버 프로세스 전체에서 실제로 DB에 쓰기를 시도하는 동시 작업 수를 제한해야 DATABASE_URL의
// connectionLimit(커넥션 풀 크기)이 고갈돼 일부 요청이 타임아웃/실패하는 걸 막을 수 있다. deploy.bat이
// 단일 Node 프로세스로 배포하므로(PM2/nssm 등 여러 인스턴스로 늘리지 않는 한) 인메모리 세마포어만으로
// 충분하다 — 여러 서버 인스턴스로 늘어나면 Redis 등 프로세스 밖 공유 저장소 기반으로 바꿔야 한다.
// 풀 크기(DATABASE_URL의 connectionLimit=10)보다 여유 있게 작은 값을 써서, 이 프로세스의 다른
// 요청(읽기 등)이 쓸 커넥션도 남겨둔다. 이 DB 서버에 삼화 회계의 다른 시스템도 함께 떠 있을 수
// 있어(확인 전이라 보수적으로 가정), 첫 동시 업로드 테스트 때는 낮게 잡아뒀다 — 실측해보고
// 문제없으면 풀 크기와 함께 올린다.
const MAX_CONCURRENT_WRITES = 7;

interface DbWriteState {
  active: number;
  queue: (() => void)[];
}

// Next.js dev 서버의 모듈 재평가(hot reload)에도 카운터가 초기화되지 않도록 prisma 클라이언트와
// 동일한 방식으로 globalThis에 보관한다.
const _writeState: DbWriteState = globalForPrisma.dbWriteState ?? { active: 0, queue: [] };
if (process.env.NODE_ENV !== "production") {
  globalForPrisma.dbWriteState = _writeState;
}

// RCMS 엑셀 업로드처럼 짧은 시간에 여러 건을 쓰는 API 라우트의 실제 DB 쓰기 작업(주로
// prisma.$transaction(...) 호출)을 감싼다. 동시에 MAX_CONCURRENT_WRITES개까지만 실행하고,
// 나머지는 앞선 작업이 끝나는 대로 순서대로 실행한다 — 에러 대신 대기로 바뀔 뿐 실패하지 않는다.
export function withDbWriteSlot<T>(fn: () => Promise<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    const run = () => {
      _writeState.active++;
      fn()
        .then(resolve, reject)
        .finally(() => {
          _writeState.active--;
          _writeState.queue.shift()?.();
        });
    };
    if (_writeState.active < MAX_CONCURRENT_WRITES) run();
    else _writeState.queue.push(run);
  });
}
