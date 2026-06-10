import PlaceholderPage from "@/components/common/PlaceholderPage";

export default function CompanyClassPage() {
  return (
    <PlaceholderPage
      description="과제별·연차별로 기업분류(대기업/중견기업/중소기업/스타트업)를 관리하고 변경 이력을 보존합니다."
      features={["연차별 기업분류 등록", "분류 변경 이력 조회", "변경 사유 기록", "과제별 분류 현황", "수수료 재계산 연동", "대량 일괄 변경"]}
      icon={
        <svg viewBox="0 0 24 24" fill="currentColor" className="w-8 h-8">
          <path fillRule="evenodd" d="M3 5a1 1 0 0 1 1-1h16a1 1 0 1 1 0 2H4a1 1 0 0 1-1-1zm0 6a1 1 0 0 1 1-1h16a1 1 0 1 1 0 2H4a1 1 0 0 1-1-1zm0 6a1 1 0 0 1 1-1h10a1 1 0 1 1 0 2H4a1 1 0 0 1-1-1z" clipRule="evenodd" />
        </svg>
      }
    />
  );
}
