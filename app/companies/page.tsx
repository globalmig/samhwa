import PlaceholderPage from "@/components/common/PlaceholderPage";

export default function CompaniesPage() {
  return (
    <PlaceholderPage
      description="국가지원사업에 참여하는 기업의 기본정보(사업자번호, 대표자, 주소)와 담당자 정보를 관리합니다."
      features={["기업 기본정보 등록", "사업자번호 검색", "담당자 등록/수정", "주담당자 지정", "기업 활성/비활성 관리", "이메일 수신 설정"]}
      icon={
        <svg viewBox="0 0 24 24" fill="currentColor" className="w-8 h-8">
          <path d="M6 6v2a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2H8a2 2 0 0 0-2 2zm2 8a2 2 0 1 0 0 4 2 2 0 0 0 0-4zm8 0a2 2 0 1 0 0 4 2 2 0 0 0 0-4z" />
          <path fillRule="evenodd" d="M2 12a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v2a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2v-2z" clipRule="evenodd" />
        </svg>
      }
    />
  );
}
