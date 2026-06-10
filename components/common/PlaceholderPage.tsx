interface PlaceholderPageProps {
  description: string;
  features: string[];
  icon: React.ReactNode;
}

export default function PlaceholderPage({ description, features, icon }: PlaceholderPageProps) {
  return (
    <div className="space-y-4">
      {/* 상태 배너 */}
      <div className="flex items-center gap-2 px-4 py-2.5 bg-amber-50 border border-amber-200 rounded-lg text-sm text-amber-700">
        <svg viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4 shrink-0">
          <path
            fillRule="evenodd"
            d="M8.485 2.495c.673-1.167 2.357-1.167 3.03 0l6.28 10.875c.673 1.167-.17 2.625-1.516 2.625H3.72c-1.347 0-2.189-1.458-1.515-2.625L8.485 2.495zM10 5a.75.75 0 0 1 .75.75v3.5a.75.75 0 0 1-1.5 0v-3.5A.75.75 0 0 1 10 5zm0 9a1 1 0 1 0 0-2 1 1 0 0 0 0 2z"
            clipRule="evenodd"
          />
        </svg>
        <span>
          <strong>DB 연결 대기 중</strong> — 데이터베이스 연결 후 실제 데이터가 표시됩니다.
        </span>
      </div>

      {/* 빈 상태 카드 */}
      <div className="bg-white rounded-xl border border-slate-200 flex flex-col items-center justify-center py-20 px-8 text-center">
        {/* 아이콘 */}
        <div className="flex items-center justify-center w-16 h-16 rounded-2xl bg-slate-100 text-slate-400 mb-5">
          {icon}
        </div>

        {/* 설명 */}
        <p className="text-sm text-slate-500 max-w-sm leading-relaxed mb-6">{description}</p>

        {/* 예정 기능 목록 */}
        <div className="flex flex-wrap justify-center gap-2">
          {features.map((f) => (
            <span
              key={f}
              className="inline-flex items-center gap-1 px-3 py-1 rounded-full bg-slate-100 text-xs text-slate-500"
            >
              <svg viewBox="0 0 12 12" fill="currentColor" className="w-2.5 h-2.5 text-slate-400">
                <path d="M6 1a5 5 0 1 1 0 10A5 5 0 0 1 6 1zm1 4V4a1 1 0 0 0-2 0v2H4a1 1 0 0 0 0 2h1v1a1 1 0 0 0 2 0V8h1a1 1 0 0 0 0-2H7z" />
              </svg>
              {f}
            </span>
          ))}
        </div>

        {/* DB 연결 안내 */}
        <div className="mt-8 flex items-center gap-2 text-xs text-slate-400">
          <span className="w-2 h-2 rounded-full bg-slate-300" />
          Prisma + PostgreSQL 연결 후 활성화
        </div>
      </div>
    </div>
  );
}
