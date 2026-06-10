import PlaceholderPage from "@/components/common/PlaceholderPage";

export default function FeePolicyPage() {
  return (
    <PlaceholderPage
      description="수수료 계산 규칙을 관리자가 직접 설정합니다. 사업비 구간별·기관 수별·과제유형별·기업분류별 계수와 연차별 청구비율, 면제·예외 규칙을 설정할 수 있습니다."
      features={[
        "사업비 구간별 기본 수수료율",
        "기관 수 기준 가산 규칙",
        "과제유형별 계수",
        "정산구분별 계수",
        "기업분류별 계수",
        "연차별 청구비율",
        "정산면제 규칙",
        "예외 규칙 (과제/기관 지정)",
        "정책 버전 관리 (DRAFT → ACTIVE)",
      ]}
      icon={
        <svg viewBox="0 0 24 24" fill="currentColor" className="w-8 h-8">
          <path fillRule="evenodd" d="M12.316 3.051a1 1 0 0 1 .633 1.265l-4 12a1 1 0 0 1-1.898-.632l4-12a1 1 0 0 1 1.265-.633zM5.707 6.293a1 1 0 0 1 0 1.414L3.414 10l2.293 2.293a1 1 0 1 1-1.414 1.414l-3-3a1 1 0 0 1 0-1.414l3-3a1 1 0 0 1 1.414 0zm12.586 0a1 1 0 0 1 1.414 0l3 3a1 1 0 0 1 0 1.414l-3 3a1 1 0 1 1-1.414-1.414L20.586 10l-2.293-2.293a1 1 0 0 1 0-1.414z" clipRule="evenodd" />
        </svg>
      }
    />
  );
}
