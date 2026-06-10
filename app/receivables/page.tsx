import PlaceholderPage from "@/components/common/PlaceholderPage";

export default function ReceivablesPage() {
  return (
    <PlaceholderPage
      description="청구 대비 입금 현황을 관리합니다. 부분 수금 처리, 채권 잔액 추적, 장기 미수금 식별, 수금 이력 관리를 지원합니다."
      features={[
        "청구/입금/미수금 조회",
        "부분 수금 처리",
        "채권 잔액 계산",
        "장기 미수금 식별 (90일 초과)",
        "수금 이력 등록",
        "대손 처리",
        "미수금 현황 집계",
      ]}
      icon={
        <svg viewBox="0 0 24 24" fill="currentColor" className="w-8 h-8">
          <path d="M2 10a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v2a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2v-2z" />
          <path d="M2 6a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2H2zm0 12h20a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2z" />
        </svg>
      }
    />
  );
}
