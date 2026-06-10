import PlaceholderPage from "@/components/common/PlaceholderPage";

export default function ProjectsPage() {
  return (
    <PlaceholderPage
      description="과제번호 기준으로 과제명, 사업연도, 연차, 과제유형, 전문기관, 정산구분, 사업비를 등록·관리합니다."
      features={["과제 등록/수정", "연차 추가", "과제유형 분류", "전문기관 연결", "정산구분 설정", "사업비 입력"]}
      icon={
        <svg viewBox="0 0 24 24" fill="currentColor" className="w-8 h-8">
          <path d="M7 4a1 1 0 0 0-.894.553L5.382 6H4a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-1.382l-.724-1.447A1 1 0 0 0 17 4H7z" />
        </svg>
      }
    />
  );
}
