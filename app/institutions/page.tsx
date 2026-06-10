import PlaceholderPage from "@/components/common/PlaceholderPage";

export default function InstitutionsPage() {
  return (
    <PlaceholderPage
      description="과제에 참여하는 주관기관·참여기관을 관리하고, 기관별 사업비·수수료·정산내역을 조회합니다."
      features={["기관 등록/수정", "주관/참여기관 구분", "기관별 사업비 배분", "수수료 현황 조회", "정산내역 조회", "기관 담당자 연결"]}
      icon={
        <svg viewBox="0 0 24 24" fill="currentColor" className="w-8 h-8">
          <path fillRule="evenodd" d="M3 6a3 3 0 0 1 3-3h12a3 3 0 0 1 3 3v12a3 3 0 0 1-3 3H6a3 3 0 0 1-3-3V6zm4.5 1.5a1.5 1.5 0 0 0 0 3h9a1.5 1.5 0 0 0 0-3h-9zm0 4.5a1.5 1.5 0 0 0 0 3h9a1.5 1.5 0 0 0 0-3h-9zm0 4.5a1.5 1.5 0 0 0 0 3h4.5a1.5 1.5 0 0 0 0-3H7.5z" clipRule="evenodd" />
        </svg>
      }
    />
  );
}
