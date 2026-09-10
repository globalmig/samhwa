"use client";

import Image from "next/image";
import Link from "next/link";

export default function FindPasswordPage() {
  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center mb-4">
            <Image src="/simbol.png" alt="Samhwa Flow" width={55} height={40} />
          </div>
          <h1 className="text-xl font-bold text-slate-800">Samhwa Flow</h1>
          <p className="text-sm text-slate-500 mt-1">수수료 통합관리</p>
        </div>

        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-8">
          {/* 보안 조치(2026-09-10): 본인 확인 없이(이름+이메일만으로) 비밀번호를 재설정할 수
              있던 취약점 때문에 자가 재설정 기능을 임시로 막았다. 이메일 인증 기반의 정식
              재설정 절차가 마련되기 전까지는 시스템 관리자에게 직접 요청해야 한다. */}
          <div className="text-center py-4">
            <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-amber-50 mb-4">
              <svg viewBox="0 0 20 20" fill="currentColor" className="w-6 h-6 text-amber-500">
                <path fillRule="evenodd" d="M8.485 2.495c.673-1.167 2.357-1.167 3.03 0l6.28 10.875c.673 1.167-.17 2.625-1.516 2.625H3.72c-1.347 0-2.189-1.458-1.515-2.625L8.485 2.495zM10 6a.75.75 0 01.75.75v3.5a.75.75 0 01-1.5 0v-3.5A.75.75 0 0110 6zm0 8a1 1 0 100-2 1 1 0 000 2z" clipRule="evenodd" />
              </svg>
            </div>
            <h2 className="text-base font-semibold text-slate-800 mb-2">비밀번호 찾기가 잠시 중단되었습니다</h2>
            <p className="text-sm text-slate-500 leading-relaxed mb-6">
              보안 점검에 따라 본인 확인 없는 자가 재설정 기능을 임시로 막았습니다.
              <br />
              비밀번호 재설정은 시스템 관리자에게 직접 문의해 주세요.
            </p>
            <Link href="/login" className="inline-block w-full py-2.5 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors">
              로그인 페이지로
            </Link>
          </div>

          <div className="flex items-center justify-center gap-3 mt-5 text-xs text-slate-500">
            <Link href="/login" className="hover:text-blue-600 hover:underline transition-colors">로그인</Link>
            <span className="text-slate-300">|</span>
            <Link href="/find-id" className="hover:text-blue-600 hover:underline transition-colors">아이디 찾기</Link>
          </div>
        </div>
      </div>
    </div>
  );
}
