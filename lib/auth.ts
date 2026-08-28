"use client";

import { useSyncExternalStore } from "react";
import { type SystemUser } from "./mock";
import { getUsers } from "./store";

// 역할별 기본 비밀번호 (데모용)
const DEMO_PASSWORDS: Record<string, string> = {
  "admin@samhwa.co.kr": "admin1234",
  "lee.acc@samhwa.co.kr": "samhwa1234",
  "park.set@samhwa.co.kr": "samhwa1234",
  "choi.view@samhwa.co.kr": "samhwa1234",
  "jung.acc@samhwa.co.kr": "samhwa1234",
};

export interface AuthState {
  user: SystemUser | null;
  isLoading: boolean;
}

const STORAGE_KEY = "samhwa_auth_user_id";

function loadInitialUser(): SystemUser | null {
  if (typeof window === "undefined") return null;
  try {
    const id = localStorage.getItem(STORAGE_KEY);
    if (!id) return null;
    return getUsers().find((u) => u.id === id && u.status === "ACTIVE") ?? null;
  } catch {
    return null;
  }
}

let _state: AuthState = {
  user: null,
  isLoading: true,
};

const _listeners = new Set<() => void>();

function notify() {
  _listeners.forEach((l) => l());
}

export function initAuth() {
  const user = loadInitialUser();
  _state = { user, isLoading: false };
  notify();
}

export function login(email: string, password: string): { ok: boolean; error?: string } {
  const user = getUsers().find((u) => u.email === email);
  if (!user) return { ok: false, error: "이메일 또는 비밀번호가 올바르지 않습니다." };
  if (user.status === "PENDING") return { ok: false, error: "가입 승인 대기 중인 계정입니다. 시스템 관리자 승인 후 로그인할 수 있습니다." };
  if (user.status === "INACTIVE") return { ok: false, error: "비활성화된 계정입니다. 관리자에게 문의하세요." };
  // 회원가입/비밀번호 재설정으로 생성·변경된 계정은 password 필드를, 초기 시드 계정은
  // DEMO_PASSWORDS를 확인한다 (SystemUser.password 주석 참고).
  const validPassword = user.password !== undefined ? user.password === password : DEMO_PASSWORDS[email] === password;
  if (!validPassword) return { ok: false, error: "이메일 또는 비밀번호가 올바르지 않습니다." };

  try {
    localStorage.setItem(STORAGE_KEY, user.id);
  } catch {}

  _state = { user, isLoading: false };
  notify();
  return { ok: true };
}

export function logout() {
  try {
    localStorage.removeItem(STORAGE_KEY);
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
