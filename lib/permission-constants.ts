// 권한관리(/admin/users)·권한 설정(/admin/permissions) 자체는 항상 시스템 관리자(ADMIN)만
// 접근해야 한다 — [권한 설정] 화면에서 다른 역할을 이 두 페이지에 슬쩍 추가해버리면 그 역할이
// 권한 체계 자체를 바꿀 수 있게 되는 권한 상승 구멍이 생기므로, 화면 조작과 무관하게 원천
// 차단한다. lib/store.ts(클라이언트)와 app/api/role-permissions(서버 라우트) 양쪽에서 같은
// 목록을 참조해야 하는데, store.ts는 React 훅 등 클라이언트 전용 코드를 함께 들고 있어 서버
// 라우트에서 그대로 import하기엔 무거우므로 의존성 없는 별도 파일로 뺐다.
export const ADMIN_ONLY_LOCKED_PAGES = ["/admin/users", "/admin/permissions"];
