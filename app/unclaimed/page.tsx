import PlaceholderPage from "@/components/common/PlaceholderPage";

export default function UnclaimedPage() {
  return (
    <PlaceholderPage
      description="연도별 미청구액을 관리하고 차년도 이월 처리를 수행합니다. 누적 미청구액과 당해 최종청구 가능액을 자동으로 계산합니다."
      features={[
        "연도별 미청구액 조회",
        "과거 미청구액 이월 처리",
        "누적 미청구액 자동 계산",
        "최종 청구액 자동 산출",
        "이월 체인 추적",
        "미청구 과제 알림",
      ]}
      icon={
        <svg viewBox="0 0 24 24" fill="currentColor" className="w-8 h-8">
          <path fillRule="evenodd" d="M5 2a2 2 0 0 0-2 2v14l3.5-2 3.5 2 3.5-2 3.5 2V4a2 2 0 0 0-2-2H5zm4.707 3.707a1 1 0 0 0-1.414-1.414l-3 3a1 1 0 0 0 0 1.414l3 3a1 1 0 0 0 1.414-1.414L8.414 9H10a3 3 0 0 1 3 3 1 1 0 1 0 2 0 5 5 0 0 0-5-5H8.414l1.293-1.293z" clipRule="evenodd" />
        </svg>
      }
    />
  );
}
