"use client";

import { use, useState } from "react";
import Link from "next/link";
import { FiEdit2, FiCheck, FiX, FiArrowLeft } from "react-icons/fi";
import { useStore, updateUser, updateUserHiworksCredentials } from "@/lib/store";
import { type SystemUser } from "@/lib/mock";
import { fmtDate } from "@/lib/utils";
import StatusBadge from "@/components/common/StatusBadge";
import { useCanWrite } from "@/lib/permissions";

const ROLE_MAP: Record<SystemUser["role"], { label: string; color: "red" | "blue" | "purple" | "slate"; desc: string }> = {
  ADMIN:      { label: "시스템 관리자", color: "red",    desc: "전체 데이터 조회·수정·삭제 및 사용자 관리" },
  ACCOUNTANT: { label: "회계 담당자",   color: "blue",   desc: "수수료·세금계산서·미수금·공문 발송 관리" },
  SETTLEMENT: { label: "전문기관담당자", color: "purple", desc: "정산·채권·미청구액 관리" },
  VIEWER:     { label: "조회 전용",     color: "slate",  desc: "수수료 청구·이슈 현황·변경 이력만 조회 가능" },
};

const ENTITY_NAMES: Record<string, string> = {
  project:      "과제",
  institution:  "기관",
  projectIssue: "이슈/메모",
  fundingAgency:"전담기관",
  termFee:      "연차수수료",
  taxInvoice:   "세금계산서",
  receivable:   "미수금",
  unclaimed:    "미청구액",
  settlement:   "정산",
  projectMember:"참여기관",
  user:         "사용자",
  feePolicy:    "수수료정책",
};

const ACTION_COLOR: Record<string, string> = {
  CREATE: "bg-blue-100 text-blue-700",
  UPDATE: "bg-amber-100 text-amber-700",
  DELETE: "bg-red-100 text-red-700",
};
const ACTION_LABEL: Record<string, string> = {
  CREATE: "생성",
  UPDATE: "수정",
  DELETE: "삭제",
};

const selectCls = "text-sm border border-slate-200 rounded-lg px-3 py-1.5 bg-white text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-400";

export default function UserDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const canEdit = useCanWrite("users");
  const { users, auditLog } = useStore();

  const user = users.find((u) => u.id === id);

  const [editing, setEditing] = useState(false);
  const [draftRole,   setDraftRole]   = useState<SystemUser["role"]>("VIEWER");
  const [draftStatus, setDraftStatus] = useState<SystemUser["status"]>("ACTIVE");

  const [hiworksEditing, setHiworksEditing] = useState(false);
  const [draftHiworksEmail, setDraftHiworksEmail] = useState("");
  const [draftHiworksPassword, setDraftHiworksPassword] = useState("");

  if (!user) {
    return (
      <div className="flex flex-col items-center justify-center h-60 gap-3">
        <p className="text-sm text-slate-500">사용자를 찾을 수 없습니다</p>
        <Link href="/admin/users" className="text-xs text-blue-600 hover:underline">← 권한관리로</Link>
      </div>
    );
  }

  const userLog = auditLog
    .filter((e) => e.performedBy === user.name)
    .slice(0, 20);

  const roleInfo = ROLE_MAP[user.role];

  function startEdit() {
    setDraftRole(user!.role);
    setDraftStatus(user!.status);
    setEditing(true);
  }

  function saveEdit() {
    updateUser(user!.id, { role: draftRole, status: draftStatus });
    setEditing(false);
  }

  function startHiworksEdit() {
    setDraftHiworksEmail(user!.hiworksEmail ?? "");
    setDraftHiworksPassword("");
    setHiworksEditing(true);
  }

  function saveHiworksEdit() {
    updateUserHiworksCredentials(user!.id, {
      hiworksEmail: draftHiworksEmail,
      ...(draftHiworksPassword ? { hiworksMailPassword: draftHiworksPassword } : {}),
    });
    setHiworksEditing(false);
  }

  return (
    <div className="space-y-5 max-w-4xl">
      {/* Breadcrumb */}
      <Link href="/admin/users" className="inline-flex items-center gap-1 text-xs text-slate-400 hover:text-slate-600 transition-colors">
        <FiArrowLeft size={12} />
        권한관리
      </Link>

      {/* 프로필 헤더 */}
      <div className="bg-white rounded-xl border border-slate-200 px-6 py-5">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 rounded-full bg-blue-100 flex items-center justify-center text-2xl font-bold text-blue-600 shrink-0">
              {user.name[0]}
            </div>
            <div>
              <h2 className="text-lg font-bold text-slate-800">{user.name}</h2>
              <p className="text-sm text-slate-500 mt-0.5">{user.email}</p>
              <div className="flex items-center gap-2 mt-1.5">
                <StatusBadge label={roleInfo.label} color={roleInfo.color} />
                <StatusBadge
                  label={user.status === "ACTIVE" ? "활성" : "비활성"}
                  color={user.status === "ACTIVE" ? "green" : "slate"}
                />
              </div>
            </div>
          </div>
          {canEdit && !editing && (
            <button onClick={startEdit}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-600 border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors">
              <FiEdit2 size={12} /> 역할·상태 수정
            </button>
          )}
          {editing && (
            <div className="flex items-center gap-2">
              <button onClick={() => setEditing(false)}
                className="flex items-center gap-1 px-3 py-1.5 text-xs text-slate-500 hover:bg-slate-100 rounded-lg transition-colors">
                <FiX size={12} /> 취소
              </button>
              <button onClick={saveEdit}
                className="flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors">
                <FiCheck size={12} /> 저장
              </button>
            </div>
          )}
        </div>

        {/* 수정 폼 */}
        {editing && (
          <div className="mt-4 pt-4 border-t border-slate-100 flex items-center gap-4">
            <div>
              <label className="block text-xs font-medium text-slate-500 mb-1">역할</label>
              <select value={draftRole} onChange={(e) => setDraftRole(e.target.value as SystemUser["role"])}
                className={selectCls}>
                <option value="ADMIN">시스템 관리자</option>
                <option value="ACCOUNTANT">회계 담당자</option>
                <option value="SETTLEMENT">전문기관담당자</option>
                <option value="VIEWER">조회 전용</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-500 mb-1">상태</label>
              <select value={draftStatus} onChange={(e) => setDraftStatus(e.target.value as SystemUser["status"])}
                className={selectCls}>
                <option value="ACTIVE">활성</option>
                <option value="INACTIVE">비활성</option>
              </select>
            </div>
          </div>
        )}
      </div>

      {/* 계정 정보 + 권한 설명 */}
      <div className="grid grid-cols-2 gap-4">
        <div className="bg-white rounded-xl border border-slate-200 px-5 py-4 space-y-3">
          <h3 className="text-xs font-semibold text-slate-700">계정 정보</h3>
          <div className="space-y-2 text-sm">
            {[
              { label: "등록일",       value: fmtDate(user.registeredAt) },
              { label: "최근 로그인",  value: user.lastLoginAt ?? "기록 없음" },
              { label: "이메일",       value: user.email },
            ].map(({ label, value }) => (
              <div key={label} className="flex justify-between">
                <span className="text-xs text-slate-400">{label}</span>
                <span className="text-xs text-slate-700">{value}</span>
              </div>
            ))}
          </div>
        </div>
        <div className="bg-white rounded-xl border border-slate-200 px-5 py-4 space-y-3">
          <h3 className="text-xs font-semibold text-slate-700">역할 권한 범위</h3>
          <div className="flex items-start gap-3">
            <StatusBadge label={roleInfo.label} color={roleInfo.color} />
            <p className="text-xs text-slate-500 leading-relaxed">{roleInfo.desc}</p>
          </div>
          <div className="mt-2 rounded-lg bg-slate-50 px-3 py-2">
            <p className="text-[10px] text-slate-400 leading-relaxed">
              {user.role === "ADMIN" && "시스템 내 모든 메뉴에 접근하고 데이터를 수정·삭제할 수 있습니다. 사용자 추가 및 권한 변경도 가능합니다."}
              {user.role === "ACCOUNTANT" && "수수료 산정, 세금계산서 발행, 미수금 관리, 공문 발송을 처리합니다. 과제·기관 정보는 조회만 가능합니다."}
              {user.role === "SETTLEMENT" && "정산 업무, 채권 관리, 미청구액 처리를 담당합니다. 수수료·세금계산서는 조회만 가능합니다."}
              {user.role === "VIEWER" && "수수료 청구 관리, 이슈 현황, 전체 변경이력만 조회할 수 있으며 수정·삭제·등록 등의 작업은 불가합니다."}
            </p>
          </div>
        </div>
      </div>

      {/* 하이웍스 메일 연동 (조회 전용 계정 제외) */}
      {user.role !== "VIEWER" && (
        <div className="bg-white rounded-xl border border-slate-200 px-5 py-4 space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-xs font-semibold text-slate-700">하이웍스 메일 연동</h3>
              <p className="text-[10px] text-slate-400 mt-0.5">공문 발송 시 이 계정 명의로 하이웍스 메일을 보내기 위한 연동 정보입니다.</p>
            </div>
            {canEdit && !hiworksEditing && (
              <button onClick={startHiworksEdit}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-600 border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors">
                <FiEdit2 size={12} /> 연동정보 수정
              </button>
            )}
            {hiworksEditing && (
              <div className="flex items-center gap-2">
                <button onClick={() => setHiworksEditing(false)}
                  className="flex items-center gap-1 px-3 py-1.5 text-xs text-slate-500 hover:bg-slate-100 rounded-lg transition-colors">
                  <FiX size={12} /> 취소
                </button>
                <button onClick={saveHiworksEdit}
                  className="flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors">
                  <FiCheck size={12} /> 저장
                </button>
              </div>
            )}
          </div>

          {hiworksEditing ? (
            <div className="pt-2 border-t border-slate-100 space-y-3">
              <div>
                <label className="block text-xs font-medium text-slate-500 mb-1">하이웍스 계정 이메일</label>
                <input type="email" value={draftHiworksEmail} onChange={(e) => setDraftHiworksEmail(e.target.value)}
                  placeholder="user@samhwa.hiworks.com"
                  className="w-full text-sm border border-slate-200 rounded-lg px-3 py-1.5 text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-400" />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-500 mb-1">메일 전용 비밀번호</label>
                <input type="password" value={draftHiworksPassword} onChange={(e) => setDraftHiworksPassword(e.target.value)}
                  placeholder={user.hiworksMailPassword ? "변경하려면 새 값을 입력..." : "미등록"}
                  className="w-full text-sm border border-slate-200 rounded-lg px-3 py-1.5 text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-400" />
                <p className="text-[10px] text-slate-400 mt-1">하이웍스 로그인 비밀번호가 아닌, 개인설정 &gt; 보안설정에서 발급하는 메일 전용 비밀번호를 입력하세요. 비워두면 기존 값이 유지됩니다.</p>
              </div>
            </div>
          ) : (
            <div className="pt-2 border-t border-slate-100 space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-xs text-slate-400">계정 이메일</span>
                <span className="text-xs text-slate-700">{user.hiworksEmail || "미등록"}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-xs text-slate-400">메일 전용 비밀번호</span>
                <StatusBadge label={user.hiworksMailPassword ? "등록됨" : "미등록"} color={user.hiworksMailPassword ? "green" : "slate"} />
              </div>
            </div>
          )}

          <p className="text-[10px] text-amber-600 bg-amber-50 rounded-lg px-3 py-2">
            현재 이 정보는 조회·기록 용도로만 저장됩니다. 실제 메일 발송 연동(SMTP 서버 연결)은 아직 준비 중입니다.
          </p>
        </div>
      )}

      {/* 변경이력 */}
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-slate-800">변경이력</h3>
          <span className="text-xs text-slate-400">{userLog.length}건</span>
        </div>
        {userLog.length === 0 ? (
          <div className="px-5 py-10 text-center text-sm text-slate-400">이 사용자의 변경이력이 없습니다</div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-100 text-xs font-medium text-slate-500">
                <th className="text-center px-4 py-3 w-40 whitespace-nowrap">일시</th>
                <th className="text-center px-4 py-3 w-24 whitespace-nowrap">유형</th>
                <th className="text-center px-4 py-3 w-16 whitespace-nowrap">액션</th>
                <th className="text-left px-4 py-3">대상</th>
              </tr>
            </thead>
            <tbody>
              {userLog.map((entry) => (
                <tr key={entry.id} className="border-b border-slate-50 hover:bg-slate-50 transition-colors">
                  <td className="px-4 py-3 text-center font-mono text-xs text-slate-500 whitespace-nowrap">
                    {entry.performedAt}
                  </td>
                  <td className="px-4 py-3 text-center text-xs text-slate-600 whitespace-nowrap">
                    {ENTITY_NAMES[entry.entityType] ?? entry.entityType}
                  </td>
                  <td className="px-4 py-3 text-center">
                    <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded ${ACTION_COLOR[entry.action]}`}>
                      {ACTION_LABEL[entry.action]}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-sm text-slate-700">{entry.entityLabel}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
