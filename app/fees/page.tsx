import PlaceholderPage from "@/components/common/PlaceholderPage";

export default function FeesPage() {
  return (
    <PlaceholderPage
      description="연차별 사업비·표준수수료·신청수수료·청구수수료·미청구액·누적수수료·최종청구액·미수금을 통합 조회하고 관리합니다."
      features={[
        "표준수수료 자동 계산",
        "신청수수료 입력",
        "청구수수료 확정",
        "누적수수료 조회",
        "연도별 미청구액 집계",
        "당해 최종청구액 자동 계산",
        "정산면제 처리",
        "수수료 확정/취소",
      ]}
      icon={
        <svg viewBox="0 0 24 24" fill="currentColor" className="w-8 h-8">
          <path d="M12 22C6.477 22 2 17.523 2 12S6.477 2 12 2s10 4.477 10 10-4.477 10-10 10zm1-13v-2h-2v2H9a1 1 0 0 0-1 1v4a1 1 0 0 0 1 1h2v2h2v-2h2a1 1 0 0 0 1-1v-4a1 1 0 0 0-1-1h-2zm-2 2h4v2h-4v-2z" />
        </svg>
      }
    />
  );
}
