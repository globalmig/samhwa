import PlaceholderPage from "@/components/common/PlaceholderPage";

export default function SettlementsPage() {
  return (
    <PlaceholderPage
      description="과제별 기관 정산금(+기관별 추가금)·수수료·정산 예정금·지급 완료 현황을 관리하고 정산 이력을 보존합니다."
      features={[
        "정산금 등록",
        "기관별 추가금 설정",
        "수수료 연동",
        "정산 예정금 산출",
        "지급 처리",
        "정산 이력 조회",
        "정산 현황 집계",
      ]}
      icon={
        <svg viewBox="0 0 24 24" fill="currentColor" className="w-8 h-8">
          <path fillRule="evenodd" d="M5 3a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V7.414A2 2 0 0 0 20.414 6L17 2.586A2 2 0 0 0 15.586 2H5zm3 9a1 1 0 0 0 0 2h8a1 1 0 1 0 0-2H8zm0-3a1 1 0 0 0 0 2h8a1 1 0 0 0 0-2H8zm0-3a1 1 0 1 0 0 2h4a1 1 0 0 0 0-2H8z" clipRule="evenodd" />
        </svg>
      }
    />
  );
}
