"use client";

import { useState } from "react";
import { FiChevronDown, FiChevronRight } from "react-icons/fi";

// ── 데이터 ────────────────────────────────────────────────────
type ManualItem = {
  title: string;
  path?: string;
  badge?: string;
  purpose: string;
  detail: { heading: string; items: string[] }[];
  permission: string;
};

type ManualGroup = { label: string; items: ManualItem[] };

const MANUAL: ManualGroup[] = [
  {
    label: "대시보드",
    items: [
      {
        title: "통합 대시보드",
        path: "/",
        purpose: "전체 현황을 한눈에 파악하고, 필요한 세부 화면으로 이동하는 진입점입니다.",
        detail: [
          {
            heading: "주요 구성",
            items: [
              "긴급 처리 카드 3종 — 연체 채권 · HIGH 이슈 · 세금계산서 미발행",
              "핵심 지표 카드 4종 — 총 수수료 · 청구액 · 미수금 · 수금률",
              "과제 파이프라인 — 진행중 / 완료 / 중단 건수",
              "전담기관별 수금 현황 테이블 — 청구액 · 수금액 · 청구건수 · 수금률",
            ],
          },
          {
            heading: "이동 경로",
            items: [
              "카드나 행을 클릭하면 미수금, 이슈, 세금계산서 미발행, 수수료 청구 관리 등 해당 상세 화면으로 이동합니다.",
              "이 화면 자체에는 입력·수정 기능이 없습니다 (읽기 전용).",
            ],
          },
        ],
        permission: "전 역할(시스템 관리자 · 회계 담당자 · 전문기관담당자 · 조회 전용) 접근 가능",
      },
    ],
  },
  {
    label: "과제 관리",
    items: [
      {
        title: "수수료 청구 관리",
        path: "/fees",
        badge: "\"과제 전체조회\"와 동일 화면",
        purpose: "과제별 연차 수수료 · 세금계산서 · 수금 · 공문발송 현황을 한 테이블에서 관리하는 핵심 업무 화면입니다.",
        detail: [
          {
            heading: "주요 기능",
            items: [
              "\"연차 수수료 생성\" — 과제·연도·연차 선택 후 참여기관별 요율 자동계산",
              "행별 \"매출발행 / 매출취소\" — 발행구분(정발행 · 역발행요청 · 역발행 · 대상아님 · 면제) 지정 및 세금계산서 발행",
              "행별 \"수금등록 / 수금수정\" — 입금액 입력, 완납처리, 수금 취소",
              "행별 \"공문발송\" — 연차상시점검 · 위탁정산 수수료 공문 메일 발송",
              "행별 \"정보수정\" — 서류요청/회신일, 수신자, 삼화담당자",
              "손실금액 셀 직접 입력, 다중 선택 후 \"선택 과제 완료 처리\" 일괄 처리",
            ],
          },
          {
            heading: "필터 / 검색",
            items: [
              "과제번호 · 과제명 · 주관기관 · 연구책임자 텍스트 검색",
              "전담기관 · 발행구분 · 수금상태 · 과제상태 드롭다운, \"미수 건만\" 체크박스",
              "세금계산서 일자 기간(단축 버튼 포함) · 당해종료일 기간",
            ],
          },
        ],
        permission: "조회는 관리자 · 회계 · 조회전용, 편집(생성/발행/수금/공문)은 관리자 · 회계담당자만",
      },
      {
        title: "과제 상세",
        path: "/projects/:id",
        badge: "목록에서 행 클릭으로 진입",
        purpose: "개별 과제의 기본정보와 연차별 수수료 · 세금계산서 · 수금 · 이슈를 관리하는 상세 화면입니다.",
        detail: [
          {
            heading: "\"과제 정보\" 탭",
            items: [
              "기본정보(상태, 기관, 사업비, 기간, 연차/과제구분) 수정 및 저장",
              "참여기관 목록 인라인 편집 — 등급 · 배정예산 수정 시 산정수수료 실시간 재계산",
              "이슈 등록 / 수정 / 삭제, 상태 즉시 변경, 알림 대상 지정",
              "해당 과제 변경이력 최근 10건",
            ],
          },
          {
            heading: "\"수수료 관리\" 탭",
            items: [
              "연차별 아코디언 카드 — 참여기관별 수수료(표준/조정/적용액) 확인",
              "세금계산서 발행 · 수정 및 공문 발송을 같은 화면에서 처리",
              "수금 등록 · 입력, 미청구액 이월 처리 · 상태 관리",
            ],
          },
        ],
        permission: "항목별 세분화 — 과제정보/참여기관은 관리자·회계, 이슈는 여기에 정산담당자 추가, 세금계산서는 관리자·회계, 수금/공문/미청구는 각각 별도 권한 체크",
      },
    ],
  },
  {
    label: "수수료 규정 관리",
    items: [
      {
        title: "전담기관 관리",
        path: "/funding-agencies",
        purpose: "수수료를 청구하는 전담기관(정부지원사업 관리기관) 정보와 기관별 운용 안내를 관리합니다.",
        detail: [
          {
            heading: "주요 기능",
            items: [
              "\"전담기관 추가\" — 명칭 · 약칭 · 코드 · 담당자 · 이메일 · 수수료정책 · 상태 등록",
              "엑셀 양식 다운로드 및 일괄 업로드",
              "기관명 클릭 시 상세 모달 — 관리과제 · 수수료합계 · 청구완료 통계, 관리 과제 목록",
              "\"운용 안내\" — 기관별 안내 탭·표 조회(등록된 기관만 노출), 관리자/회계는 탭 · 행 · 강조서식까지 직접 편집 가능",
            ],
          },
          { heading: "필터 / 검색", items: ["기관명 · 약칭 · 코드 검색"] },
        ],
        permission: "조회는 관리자 · 회계 · 정산담당자, 추가/수정/엑셀업로드/운용안내 편집은 관리자 · 회계담당자만",
      },
      {
        title: "수수료 기준 관리",
        path: "/company-class",
        purpose: "전담기관별(또는 공통) 수수료 요율 정책 버전을 관리합니다.",
        detail: [
          {
            heading: "주요 기능",
            items: [
              "\"공통\" 탭과 전담기관별 탭으로 구분해서 정책 확인 (활성 정책 보유 기관은 초록 점 표시)",
              "\"전담기관 관리\" 버튼으로 이 화면에서도 전담기관 추가 · 수정 · 삭제 가능",
              "\"수수료 기준 이력\" — 버전별 카드(유효기간 · 표준요율 · 적용중/만료/초안 상태), 과거 버전 펼쳐보기",
              "\"새 버전\" — 정책명 · 버전 · 유효기간 · 표준요율 · 등급별 구간 규칙 등록",
            ],
          },
        ],
        permission: "조회 · 편집 모두 관리자 · 회계담당자만 (정산담당자 · 조회전용은 접근 불가)",
      },
    ],
  },
  {
    label: "현황 및 이력조회",
    items: [
      {
        title: "이슈현황",
        path: "/issues",
        purpose: "전체 과제에서 등록된 이슈(문제/요청사항)를 한 화면에 모아 보고 처리합니다.",
        detail: [
          {
            heading: "주요 기능",
            items: [
              "\"이슈 등록\" — 과제 선택, 중요도, 진행여부, 내용 입력",
              "테이블에서 우선순위 · 진행여부 인라인 수정 및 삭제",
              "\"과제 상세 →\" 링크로 해당 과제로 바로 이동",
            ],
          },
          { heading: "필터", items: ["우선순위(높음/보통/낮음), 진행여부(미처리/진행중/완료), 과제별 필터"] },
        ],
        permission: "조회는 전 역할, 등록/수정/삭제는 관리자 · 회계 · 정산담당자",
      },
      {
        title: "전체 변경이력",
        path: "/audit-log",
        purpose: "시스템 내 모든 생성 · 수정 · 삭제 이력을 감사로그 형태로 조회합니다.",
        detail: [
          {
            heading: "주요 기능",
            items: [
              "변경 전/후 값 비교(취소선/강조색)로 상세 펼쳐보기",
              "대상 항목 클릭 시 관련 화면(과제/기관/전담기관 등)으로 바로가기",
            ],
          },
          { heading: "필터", items: ["유형(엔티티 종류), 액션(생성/수정/삭제), 대상명 · 수행자 검색"] },
        ],
        permission: "조회 전용, 전 역할 접근 가능 (쓰기 기능 없음)",
      },
      {
        title: "공문 발송이력",
        path: "/emails",
        purpose: "발송된 세금계산서 · 수수료 관련 공문 이메일의 발송 이력을 조회합니다.",
        detail: [
          { heading: "주요 기능", items: ["발송일시 · 수신기관 · 제목 · 유형 · 첨부개수 · 상태(완료/실패/대기) 확인"] },
          { heading: "필터", items: ["수신기관 · 이메일, 제목, 유형, 상태"] },
          { heading: "참고", items: ["실제 발송은 이 화면이 아니라 \"수수료 청구 관리\" 또는 과제 상세에서 수행합니다."] },
        ],
        permission: "조회는 관리자 · 회계 · 조회전용 (정산담당자는 접근 불가)",
      },
    ],
  },
  {
    label: "채권 / 정산 현황",
    items: [
      {
        title: "세금계산서 현황",
        path: "/tax-invoices",
        badge: "사이드바 메뉴 숨김",
        purpose: "발행된 모든 세금계산서를 계산서 단위로 조회 · 관리합니다.",
        detail: [
          {
            heading: "주요 기능",
            items: [
              "\"새 계산서 추가\", 행별 수정",
              "연구책임자명 클릭 시 연구책임자 프로필로 이동",
            ],
          },
          { heading: "필터", items: ["계산서번호 · 과제번호 · 과제명 · 주관기관, 상태(발행/수정발행/취소)"] },
          { heading: "참고", items: ["실무에서는 과제 상세 화면에서 발행하는 것이 표준 흐름이며, 이 화면은 전체 조회 · 직접 등록용입니다."] },
        ],
        permission: "조회 · 편집 모두 관리자 · 회계담당자만",
      },
      {
        title: "기관 정산",
        path: "/settlements",
        badge: "사이드바 메뉴 숨김",
        purpose: "전담기관 외에 정산이 필요한 기관(주관/참여기관)에 대한 별도 정산 내역을 관리합니다.",
        detail: [
          {
            heading: "주요 기능",
            items: [
              "\"새 정산 추가\" — 정산기관, 연도, 주관기관 여부, 추가금/수수료, 지급일, 상태 등록",
              "행별 수정",
            ],
          },
          { heading: "필터", items: ["과제번호 · 과제명 · 기관명, 기관구분(주관/참여), 상태(지급완료/처리중)"] },
        ],
        permission: "조회 · 편집 모두 관리자 · 정산담당자만",
      },
    ],
  },
  {
    label: "시스템 관리",
    items: [
      {
        title: "수행기관관리",
        path: "/institutions",
        purpose: "과제에 참여하는 수행기관(주관/참여기관)의 기본정보를 관리합니다.",
        detail: [
          {
            heading: "목록 화면",
            items: [
              "\"새 기관 추가\", 엑셀 양식 다운로드/업로드, 행별 수정 · 삭제",
              "구분(전담기관 기준 구분1/구분2)을 칩으로 표시",
            ],
          },
          {
            heading: "상세 화면 (/institutions/:id)",
            items: ["과제별 구분내용, 참여 과제 목록, 연차수수료 산정 내역, 변경이력 — 읽기 전용 (수정은 목록 화면에서)"],
          },
          { heading: "필터", items: ["기관명 · 사업자번호 · 담당자, 구분, 상태(활성/비활성)"] },
        ],
        permission: "조회는 관리자 · 회계 · 정산담당자, 추가/수정/삭제/엑셀업로드는 관리자 · 회계담당자만",
      },
      {
        title: "권한관리",
        path: "/admin/users",
        purpose: "시스템 사용자 계정과 역할(권한)을 관리합니다.",
        detail: [
          {
            heading: "목록 화면",
            items: [
              "\"새 사용자 추가\" — 이름 · 이메일 · 역할 · 상태 등록",
              "역할별 권한 요약 카드(시스템관리자/회계담당자/전문기관담당자/조회전용) 확인",
              "행별 수정 · 삭제",
            ],
          },
          {
            heading: "상세 화면 (/admin/users/:id)",
            items: ["프로필 정보, \"역할 · 상태 수정\", 역할별 권한 범위 설명, 해당 사용자 변경이력(최근 20건)"],
          },
        ],
        permission: "접근 · 편집 모두 시스템 관리자(ADMIN)만 가능",
      },
    ],
  },
  {
    label: "그 외 화면 (다른 화면에서 링크로 진입)",
    items: [
      {
        title: "미수금 / 채권 현황",
        path: "/receivables",
        badge: "대시보드 \"연체 채권\" 카드에서 진입",
        purpose: "청구된 세금계산서 중 미수금이 남아있는 건을 집중적으로 조회합니다.",
        detail: [
          {
            heading: "주요 기능",
            items: [
              "만기일 경과 시 \"연체\" 배지 자동 표시 및 강조",
              "\"새 채권 추가\", 행별 수정",
            ],
          },
          { heading: "필터", items: ["계산서번호 · 과제번호 · 과제명 · 주관기관, 상태(미수/연체/청구중/일부수금/수금완료)"] },
        ],
        permission: "조회 · 편집 모두 관리자 · 회계 · 정산담당자",
      },
      {
        title: "세금계산서 미발행 관리",
        path: "/unclaimed",
        badge: "대시보드 \"미발행 금액\" 카드에서 진입",
        purpose: "아직 세금계산서를 발행하지 않은 연차 수수료를 모아, 놓친 청구가 없는지 점검합니다.",
        detail: [
          {
            heading: "주요 기능",
            items: [
              "당해종료일이 임박(30일 이내)하거나 지난 건은 경고 라벨 자동 표시",
              "\"발행하기\" 클릭 시 해당 과제 상세로 이동해 실제 발행 처리 (이 화면 자체는 조회 전용)",
            ],
          },
          { heading: "필터", items: ["과제번호 · 과제명 · 주관기관"] },
        ],
        permission: "조회는 관리자 · 회계 · 정산담당자 (실제 발행 권한은 과제 상세 기준)",
      },
      {
        title: "수수료 정책 변경이력",
        path: "/policy-history",
        badge: "임시(예시) 데이터",
        purpose: "수수료 정책 · 요율의 과거 변경 내역을 참고용으로 보여주는 화면입니다.",
        detail: [
          {
            heading: "참고",
            items: ["현재는 예시 데이터만 표시되며 실제 데이터와 연동되어 있지 않습니다.", "완전 읽기 전용, 등록/수정 기능 없음"],
          },
        ],
        permission: "로그인한 전 역할 접근 가능",
      },
      {
        title: "연구책임자 프로필",
        path: "/researchers/:name",
        badge: "연구책임자명 클릭으로 진입",
        purpose: "연구책임자별로 담당 과제, 이슈, 변경이력을 모아보는 화면입니다.",
        detail: [
          {
            heading: "주요 기능",
            items: [
              "전체 / 진행중 / 완료 과제 수 클릭 시 해당 조건 과제 목록 팝업",
              "담당 과제 · 최근 이슈 · 최근 변경이력 확인",
            ],
          },
        ],
        permission: "로그인한 전 역할 접근 가능 (읽기 전용)",
      },
    ],
  },
];

const ROLE_TABLE: { role: string; desc: string; access: string; write: string }[] = [
  {
    role: "시스템 관리자",
    desc: "ADMIN",
    access: "전체 화면 접근 가능",
    write: "전체 기능 사용 가능 (권한관리는 관리자만 가능)",
  },
  {
    role: "회계 담당자",
    desc: "ACCOUNTANT",
    access: "기관 정산 · 권한관리를 제외한 대부분의 화면",
    write: "수수료 청구, 세금계산서, 공문발송, 기관/전담기관 관리 등 대부분 등록 · 수정 가능",
  },
  {
    role: "전문기관담당자",
    desc: "SETTLEMENT",
    access: "기관 정산 · 미수금 · 이슈 중심 화면 (수수료 청구 관리 · 세금계산서 · 수수료 기준 · 공문 화면은 접근 불가)",
    write: "기관 정산, 미수금/채권, 이슈 등록 · 수정 가능",
  },
  {
    role: "조회 전용",
    desc: "VIEWER",
    access: "대시보드 · 수수료 청구 관리 · 공문 발송이력 · 이슈현황 · 전체 변경이력만 조회",
    write: "등록 · 수정 · 삭제 불가 (조회만 가능)",
  },
];

// ── 컴포넌트 ──────────────────────────────────────────────────
function ManualCard({ item, defaultOpen }: { item: ManualItem; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(!!defaultOpen);

  return (
    <div className="rounded-xl border border-slate-200 bg-white overflow-hidden">
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between gap-3 px-4 py-3 text-left hover:bg-slate-50 transition-colors"
      >
        <div className="flex items-center gap-2 min-w-0 flex-wrap">
          <span className="text-sm font-semibold text-slate-800">{item.title}</span>
          {item.path && (
            <span className="text-[11px] font-mono text-blue-500 bg-blue-50 px-1.5 py-0.5 rounded">{item.path}</span>
          )}
          {item.badge && (
            <span className="text-[10px] font-medium text-amber-700 bg-amber-100 px-1.5 py-0.5 rounded">{item.badge}</span>
          )}
        </div>
        {open ? (
          <FiChevronDown className="text-slate-400 shrink-0" size={16} />
        ) : (
          <FiChevronRight className="text-slate-400 shrink-0" size={16} />
        )}
      </button>

      {open && (
        <div className="px-4 pb-4 pt-1 border-t border-slate-100 space-y-3">
          <p className="text-xs text-slate-600 leading-relaxed">{item.purpose}</p>
          {item.detail.map((d) => (
            <div key={d.heading}>
              <p className="text-[10px] font-semibold tracking-wide text-slate-400 mb-1">{d.heading}</p>
              <ul className="space-y-0.5">
                {d.items.map((t, i) => (
                  <li key={i} className="text-xs text-slate-600 pl-3 relative before:content-['·'] before:absolute before:left-0 before:text-slate-300">
                    {t}
                  </li>
                ))}
              </ul>
            </div>
          ))}
          <p className="text-[11px] text-slate-400 pt-2 border-t border-slate-100">권한: {item.permission}</p>
        </div>
      )}
    </div>
  );
}

export default function ManualPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-lg font-bold text-slate-800">사용 매뉴얼</h1>
        <p className="text-xs text-slate-500 mt-1">화면별 주요 기능과 역할별 접근 권한을 안내합니다.</p>
      </div>

      {/* 역할별 접근 권한 요약 */}
      <div className="bg-white rounded-xl border border-slate-200 p-4">
        <p className="text-xs font-semibold text-slate-500 mb-3">역할별 접근 권한 요약</p>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="text-left text-slate-400 border-b border-slate-100">
                <th className="py-2 pr-4 font-medium whitespace-nowrap">역할</th>
                <th className="py-2 pr-4 font-medium whitespace-nowrap">조회 가능 범위</th>
                <th className="py-2 font-medium">등록 · 수정 가능 범위</th>
              </tr>
            </thead>
            <tbody>
              {ROLE_TABLE.map((r) => (
                <tr key={r.desc} className="border-b border-slate-50 last:border-0 align-top">
                  <td className="py-2.5 pr-4 whitespace-nowrap">
                    <p className="font-medium text-slate-700">{r.role}</p>
                    <p className="text-[10px] text-slate-400">{r.desc}</p>
                  </td>
                  <td className="py-2.5 pr-4 text-slate-600 leading-relaxed">{r.access}</td>
                  <td className="py-2.5 text-slate-600 leading-relaxed">{r.write}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* 화면별 매뉴얼 */}
      {MANUAL.map((group) => (
        <div key={group.label} className="space-y-2">
          <p className="px-1 text-[10px] font-semibold tracking-widest uppercase text-slate-400">{group.label}</p>
          <div className="space-y-2">
            {group.items.map((item) => (
              <ManualCard key={item.title} item={item} />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
