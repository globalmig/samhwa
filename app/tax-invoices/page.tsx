import PlaceholderPage from "@/components/common/PlaceholderPage";

export default function TaxInvoicesPage() {
  return (
    <PlaceholderPage
      description="수수료 청구에 대한 세금계산서를 발행·관리합니다. PDF 출력, 수정/취소 이력 관리, 템플릿 커스터마이징을 지원합니다."
      features={[
        "세금계산서 발행",
        "PDF 출력",
        "수정발행 처리",
        "취소 처리",
        "발행 이력 조회",
        "템플릿 커스터마이징",
        "공급가액/세액 자동 계산",
        "청구 연동",
      ]}
      icon={
        <svg viewBox="0 0 24 24" fill="currentColor" className="w-8 h-8">
          <path fillRule="evenodd" d="M4 4a2 2 0 0 1 2-2h8a1 1 0 0 1 .707.293l5 5A1 1 0 0 1 20 8v12a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V4zm2 6a1 1 0 0 1 1-1h8a1 1 0 1 1 0 2H7a1 1 0 0 1-1-1zm1 3a1 1 0 1 0 0 2h8a1 1 0 1 0 0-2H7zm0 4a1 1 0 1 0 0 2h4a1 1 0 1 0 0-2H7z" clipRule="evenodd" />
        </svg>
      }
    />
  );
}
