import { Prisma, PrismaClient } from "@prisma/client";

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

// ============================================================
// 쓰기 API 공통 에러 메시지
// ============================================================
// lib/project-member-patch.ts의 describeDbError와 같은 이유(커넥션 풀 고갈 등 흔한 일시적 오류를
// 클라이언트가 알아볼 수 있게 그대로 노출)로, 그 외 생성(POST) 라우트들도 DB 예외를 try/catch 없이
// 그대로 던지면 Next.js가 원인 없는 빈 500을 돌려줘 클라이언트의 res.json()이 파싱조차 못 하고
// 실패한다 — 엑셀 대량 업로드에서 "몇 건이 이유 없이 서버 오류로 실패"하던 원인 중 하나였다.
export function describeDbWriteError(err: unknown, fallback: string): string {
  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    if (err.code === "P2024") return "서버가 혼잡해 시간 내에 처리하지 못했습니다(P2024, DB 커넥션 풀 고갈). 잠시 후 다시 시도해주세요.";
    if (["P1001", "P1002", "P1008", "P1017"].includes(err.code)) {
      return `데이터베이스 연결 문제로 처리하지 못했습니다(${err.code}). 잠시 후 다시 시도해주세요.`;
    }
    return `데이터 처리 중 오류가 발생했습니다(${err.code}). 잠시 후 다시 시도해주세요.`;
  }
  return fallback;
}
