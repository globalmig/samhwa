import { redirect } from "next/navigation";

// 공문관리는 절차 안내 공문(/notice-templates/documents)과 수수료 청구서 양식(/notice-templates/invoices)
// 하위 카테고리로 나뉘어 있다 — 이 루트 경로는 첫 번째로 보낸다.
export default function NoticeTemplatesRootPage() {
  redirect("/notice-templates/documents");
}
