import PlaceholderPage from "@/components/common/PlaceholderPage";

export default function EmailsPage() {
  return (
    <PlaceholderPage
      description="수수료 산출 내역을 기관별·담당자별로 이메일 발송합니다. 일괄 발송 배치 관리와 발송 이력을 제공합니다."
      features={[
        "수수료 산출 내역 발송",
        "기관별 일괄 발송",
        "담당자별 개별 발송",
        "발송 배치 관리",
        "성공/실패 현황 조회",
        "발송 이력 조회",
        "이메일 템플릿 설정",
        "재발송 처리",
      ]}
      icon={
        <svg viewBox="0 0 24 24" fill="currentColor" className="w-8 h-8">
          <path d="M1.5 8.67v8.58a3 3 0 0 0 3 3h15a3 3 0 0 0 3-3V8.67l-8.928 5.493a3 3 0 0 1-3.144 0L1.5 8.67z" />
          <path d="M22.5 6.908V6.75a3 3 0 0 0-3-3h-15a3 3 0 0 0-3 3v.158l9.714 5.978a1.5 1.5 0 0 0 1.572 0L22.5 6.908z" />
        </svg>
      }
    />
  );
}
