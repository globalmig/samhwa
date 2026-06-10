import PlaceholderPage from "@/components/common/PlaceholderPage";

export default function PolicyHistoryPage() {
  return (
    <PlaceholderPage
      description="수수료 정책의 변경 이력을 조회합니다. 과거 데이터는 변경 전 정책으로 보존되며, 정책 변경 전후 스냅샷을 비교할 수 있습니다."
      features={[
        "정책 버전 이력 조회",
        "변경 전후 스냅샷 비교",
        "변경자/변경일시 조회",
        "정책 롤백 (관리자)",
        "변경 사유 기록",
        "영향 과제 조회",
      ]}
      icon={
        <svg viewBox="0 0 24 24" fill="currentColor" className="w-8 h-8">
          <path fillRule="evenodd" d="M12 2.25c-5.385 0-9.75 4.365-9.75 9.75s4.365 9.75 9.75 9.75 9.75-4.365 9.75-9.75S17.385 2.25 12 2.25zM12.75 6a.75.75 0 0 0-1.5 0v6c0 .414.336.75.75.75h4.5a.75.75 0 0 0 0-1.5h-3.75V6z" clipRule="evenodd" />
        </svg>
      }
    />
  );
}
