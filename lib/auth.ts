"use client";

import { useSyncExternalStore } from "react";
import { type SystemUser } from "./mock";

export interface AuthState {
  user: SystemUser | null;
  isLoading: boolean;
}

let _state: AuthState = {
  user: null,
  isLoading: true,
};

const _listeners = new Set<() => void>();

function notify() {
  _listeners.forEach((l) => l());
}

/** 서버(httpOnly 세션 쿠키)에 현재 로그인 상태를 물어 복원한다. AuthGuard가 마운트 시 호출한다. */
export async function initAuth() {
  try {
    const res = await fetch("/api/auth/me");
    const data: { ok: boolean; user?: SystemUser } = await res.json();
    _state = { user: data.ok && data.user ? data.user : null, isLoading: false };
  } catch {
    _state = { user: null, isLoading: false };
  }
  notify();
}

export async function login(email: string, password: string, turnstileToken: string): Promise<{ ok: boolean; error?: string }> {
  try {
    const res = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password, turnstileToken }),
    });
    const data: { ok: boolean; user?: SystemUser; error?: string } = await res.json();
    if (!data.ok || !data.user) {
      return { ok: false, error: data.error ?? "로그인에 실패했습니다." };
    }
    _state = { user: data.user, isLoading: false };
    notify();
    return { ok: true };
  } catch {
    return { ok: false, error: "서버에 연결할 수 없습니다. 잠시 후 다시 시도해주세요." };
  }
}

export async function logout() {
  try {
    await fetch("/api/auth/logout", { method: "POST" });
  } catch {}
  _state = { user: null, isLoading: false };
  notify();
}

export function getCurrentUser(): SystemUser | null {
  return _state.user;
}

function subscribe(listener: () => void) {
  _listeners.add(listener);
  return () => _listeners.delete(listener);
}

function getSnapshot(): AuthState {
  return _state;
}

const SERVER_SNAPSHOT: AuthState = { user: null, isLoading: true };

export function useAuth(): AuthState {
  return useSyncExternalStore(subscribe, getSnapshot, () => SERVER_SNAPSHOT);
}
