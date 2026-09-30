/* eslint-disable @typescript-eslint/no-require-imports */
// lib/store.ts의 sessionStorage 스냅샷(STORE_CACHE_KEY)이 용량(브라우저마다 대략 5MB)을 넘었을 때 통째로
// 실패하지 않고 큰 슬롯부터 덜어내 저장하는지, 변경이력(auditLog)이 스냅샷에 섞이지 않는지 확인하는
// 회귀 테스트. 실제 브라우저 없이 용량 제한이 있는 가짜 저장소로 현재 TypeScript 코드를 그대로 실행한다.
require("tsx/cjs");
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const Module = require("node:module");
const ts = require("typescript");

const CACHE_KEY = "samhwa-store-cache-v1";

function loadStore() {
  const file = path.resolve(__dirname, "..", "lib/store.ts");
  const instance = new Module(file, module);
  instance.filename = file;
  instance.paths = Module._nodeModulePaths(path.dirname(file));
  const suffix = `
    export function persistForTest(storage: Pick<Storage, "setItem" | "removeItem">, patch: Partial<StoreState>) {
      return persistStoreCache(storage, { ..._state, ...patch });
    }
    export function readForTest(storage: Pick<Storage, "getItem">) { return readStoreCache(storage); }
  `;
  instance._compile(ts.transpileModule(fs.readFileSync(file, "utf8") + suffix, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true },
  }).outputText, file);
  return instance.exports;
}

function quotaStorage(limit) {
  const data = new Map();
  const attempts = [];
  return {
    data,
    attempts,
    getItem: (key) => (data.has(key) ? data.get(key) : null),
    setItem(key, value) {
      attempts.push(value.length);
      if (value.length > limit) throw new DOMException("exceeded the quota", "QuotaExceededError");
      data.set(key, value);
    },
    removeItem: (key) => data.delete(key),
  };
}

const bigProjects = Array.from({ length: 2000 }, (_, i) => ({ id: `p${i}`, projectName: "과제".repeat(50) }));
const smallFees = [{ id: "f1", appliedFee: 100 }];

test("fits under quota: stores everything except excluded slots", () => {
  const store = loadStore();
  const storage = quotaStorage(Infinity);
  const dropped = store.persistForTest(storage, {
    projects: [{ id: "p1" }], termFees: smallFees, loaded: { projects: true, termFees: true },
    auditLog: [{ id: "audit-local-1" }], fresh: { projects: true }, taintedFeeProjects: { X: "auth" },
  });

  assert.deepEqual(dropped, []);
  const saved = JSON.parse(storage.data.get(CACHE_KEY));
  assert.deepEqual(saved.projects, [{ id: "p1" }]);
  assert.deepEqual(saved.loaded, { projects: true, termFees: true });
  assert.equal("auditLog" in saved, false, "변경이력은 스냅샷에 넣지 않는다");
  assert.equal("fresh" in saved, false);
  assert.equal("taintedFeeProjects" in saved, false);
});

test("over quota: drops the largest slot and its loaded flag, keeps the rest", () => {
  const store = loadStore();
  const storage = quotaStorage(50_000);
  const dropped = store.persistForTest(storage, {
    projects: bigProjects, termFees: smallFees, loaded: { projects: true, termFees: true },
  });

  assert.deepEqual(dropped, ["projects"]);
  const saved = JSON.parse(storage.data.get(CACHE_KEY));
  assert.equal("projects" in saved, false);
  assert.deepEqual(saved.termFees, smallFees);
  assert.deepEqual(saved.loaded, { termFees: true }, "빠진 슬롯이 복원 후 '0건'으로 보이지 않게 loaded도 뺀다");
});

test("after a rejection, the next persist skips the write that already failed", () => {
  const store = loadStore();
  const storage = quotaStorage(50_000);
  const state = { projects: bigProjects, termFees: smallFees, loaded: {} };
  store.persistForTest(storage, state);
  storage.attempts.length = 0;

  assert.deepEqual(store.persistForTest(storage, state), ["projects"]);
  assert.equal(storage.attempts.length, 1, "이미 거절당한 크기는 다시 시도하지 않는다");
});

test("nothing fits: removes the stale snapshot instead of leaving it to be restored", () => {
  const store = loadStore();
  const storage = quotaStorage(5);
  storage.data.set(CACHE_KEY, JSON.stringify({ projects: [{ id: "stale" }] }));

  store.persistForTest(storage, { projects: bigProjects });

  assert.equal(storage.data.has(CACHE_KEY), false);
});

test("restore ignores excluded slots left in an older snapshot", () => {
  const store = loadStore();
  const storage = quotaStorage(Infinity);
  storage.data.set(CACHE_KEY, JSON.stringify({
    projects: [{ id: "p1" }], auditLog: [{ id: "audit-local-1" }], fresh: { projects: true }, taintedFeeProjects: { X: "auth" },
  }));

  const cached = store.readForTest(storage);

  assert.deepEqual(cached, { projects: [{ id: "p1" }] });
});
