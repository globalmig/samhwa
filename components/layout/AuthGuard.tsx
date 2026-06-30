"use client";

import { useEffect } from "react";
import { useRouter, usePathname } from "next/navigation";
import { useAuth, initAuth } from "@/lib/auth";
import { canAccessPage } from "@/lib/permissions";

function AccessDenied() {
  const router = useRouter();
  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center">
      <div className="text-center">
        <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-red-50 mb-4">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="w-7 h-7 text-red-400">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
          </svg>
        </div>
        <h2 className="text-base font-semibold text-slate-800 mb-1">접근 권한 없음</h2>
        <p className="text-sm text-slate-500 mb-6">이 페이지에 접근할 권한이 없습니다.</p>
        <button
          onClick={() => router.replace("/")}
          className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors"
        >
          대시보드로 이동
        </button>
      </div>
    </div>
  );
}

export default function AuthGuard({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const { user, isLoading } = useAuth();

  useEffect(() => {
    initAuth();
  }, []);

  useEffect(() => {
    if (!isLoading && !user && pathname !== "/login") {
      router.replace("/login");
    }
  }, [user, isLoading, pathname, router]);

  if (isLoading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="w-6 h-6 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!user && pathname !== "/login") return null;

  // 페이지 접근 권한 체크 (로그인 페이지 제외)
  if (user && pathname !== "/login") {
    if (!canAccessPage(user.role as "ADMIN" | "ACCOUNTANT" | "SETTLEMENT" | "VIEWER", pathname)) {
      return <AccessDenied />;
    }
  }

  return <>{children}</>;
}
