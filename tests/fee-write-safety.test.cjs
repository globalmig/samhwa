/* eslint-disable @typescript-eslint/no-require-imports */
// 수수료 수정값이 재계산·서버 응답 순서에 밀려 사라지던 문제의 회귀 테스트.
// 실제 DB/브라우저 요청 없이 현재 TypeScript 코드(lib/store.ts)에 지연·실패 응답을 주입한다.
require("tsx/cjs");
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const Module = require("node:module");
const ts = require("typescript");
const { feePolicies } = require("../lib/mock.ts");

function loadTypeScript(relativePath, mocks = {}, suffix = "") {
  const file = path.resolve(__dirname, "..", relativePath);
  const instance = new Module(file, module);
  instance.filename = file;
  instance.paths = Module._nodeModulePaths(path.dirname(file));
  const originalRequire = instance.require.bind(instance);
  instance.require = (id) => Object.hasOwn(mocks, id) ? mocks[id] : originalRequire(id);
  instance._compile(ts.transpileModule(fs.readFileSync(file, "utf8") + suffix, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true },
  }).outputText, file);
  return instance.exports;
}

function loadStore() {
  return loadTypeScript("lib/store.ts", {}, `
    export function inspectForTest(patch?: Partial<StoreState>) {
      if (patch) _state = { ..._state, ...patch };
      return { state: _state, pending: _pendingSyncCount };
    }
    // hydrate*()가 서버 응답을 반영했을 때와 같은 후처리(보류된 재계산 실행)를 흉내 낸다.
    export function loadTermFeesForTest() { loadTermFees(); }
    export function fastRetriesForTest() { FEE_SLOT_RETRY_DELAYS_MS.splice(0, FEE_SLOT_RETRY_DELAYS_MS.length, 5, 5, 5); }
    // 예약된 재시도 타이머(연차수수료 슬롯 재조회 + 태인트 복원 재시도)를 전부 취소하고 관련 상태를 비운다.
    // "복원 성공할 때까지 포기하지 않는" 설계라 그냥 두면 테스트가 끝난 뒤(이 테스트의 모의 fetch가 걷힌
    // 뒤)에도 스스로 계속 재시도를 예약해, 그 타이머가 실제 시간이 지나 뒤늦게 fetch를 호출하면서 그 시점에
    // 실행 중인 다른 테스트의 모의 fetch를 건드리거나 실제 네트워크로 나가버릴 수 있다 — 모든 테스트가
    // t.after에서 이 함수를 호출해 정리한다.
    export function resetPendingFeeRetriesForTest() {
      for (const timer of Object.values(_feeSlotRetryTimer)) clearTimeout(timer);
      for (const key of Object.keys(_feeSlotRetryTimer)) delete _feeSlotRetryTimer[key];
      for (const timer of _taintRetryTimer.values()) clearTimeout(timer);
      _taintRetryTimer.clear();
      _taintedFeeProjects.clear();
      _taintRetryAttempt.clear();
    }
    export function isFeeProjectTaintedForTest(projectNumber: string) { return isFeeProjectTainted(projectNumber); }
    export function restoreProjectTermFeesFromServerForTest(projectNumber: string) { return restoreProjectTermFeesFromServer(projectNumber); }
    export function markFreshForTest() {
      _state = { ..._state, fresh: Object.fromEntries(FEE_RECALC_SLOTS.map((slot) => [slot, true])) };
      onFeeSlotApplied("termFees");
    }
  `);
}

const pause = () => new Promise((resolve) => setTimeout(resolve, 1));
async function until(predicate) {
  for (let i = 0; i < 100; i++) {
    if (predicate()) return;
    await pause();
  }
  assert.fail("Expected request/state did not arrive");
}
const settle = async () => { for (let i = 0; i < 5; i++) await pause(); };

// 매 테스트가 만든 요청은 전부 응답을 받아야 한다 — 응답 없이 테스트가 끝나면 그 요청을 기다리던 저장
// 체인의 실제 120초 타임아웃 타이머가 프로세스 종료를 막아, 관련 없는 실패와 뒤섞여 원인을 알아보기 어려운
// 채로 전체 테스트 실행이 몇 분씩 멈춘다. t.after에서 남은 요청을 실패 응답으로 드레인해 타이머를 흘려보내고
// (프로세스가 즉시 끝나도록), 그런 요청이 있었다는 사실 자체는 테스트 실패로 드러낸다.
function controlledNetwork(t) {
  const requests = [];
  t.mock.method(globalThis, "fetch", (url, init) => new Promise((resolve) => {
    const entry = {
      url, method: init?.method, body: init?.body ? JSON.parse(init.body) : undefined, responded: false,
      respond(body) { this.responded = true; resolve({ json: async () => body }); },
      respondRaw(response) { this.responded = true; resolve(response); },
    };
    requests.push(entry);
  }));
  t.after(() => {
    const unresolved = requests.filter((r) => !r.responded);
    for (const r of unresolved) r.respond({ ok: false, error: "test left this request unanswered" });
    assert.equal(unresolved.length, 0,
      `${unresolved.length}건의 요청이 응답 없이 테스트가 끝났습니다: ${unresolved.map((r) => `${r.method ?? "GET"} ${r.url}`).join(", ")}`);
  });
  return requests;
}

// 위 controlledNetwork의 드레인과는 별개로, 태인트 재시도 등 "복원 성공할 때까지 포기하지 않는" 예약
// 타이머 자체를 취소한다 — store 인스턴스를 만든 직후 항상 등록한다(테스트 로직과 무관하게 항상 필요).
function withRetryCleanup(t, store) {
  t.after(() => store.resetPendingFeeRetriesForTest());
  return store;
}

// 서버에서 방금 받아온 상태(fresh)를 흉내 낸다. existingFee를 주면 서버에 이미 실제 id로 저장된 행이 있는 상태.
function seed(store, { existingFee } = {}) {
  const policy = feePolicies.find((p) => p.status === "ACTIVE");
  const project = {
    id: "real-project", projectNumber: "TEST-P", projectName: "Test", projectCode: "SH000001",
    termCodes: [{ termNumber: 1, code: "SH000001" }], agencyId: policy.agencyId ?? "test-agency",
    totalTerms: 1, currentTerm: 1, startDate: "2026-01-01", endDate: "2026-12-31", status: "ACTIVE",
    leadInstitutionId: "", leadInstitutionName: "", totalBudget: 0,
  };
  const member = {
    id: "real-member", projectId: project.id, projectNumber: project.projectNumber,
    institutionId: "real-institution", institutionName: "Test", role: "LEAD", budget: 100000000,
    cashBudget: 100000000, inKindBudget: 0,
    annualBudgets: [{ termNumber: 1, termYear: 2026, cashBudget: 100000000, inKindBudget: 0, auditFirm: "Other firm" }],
  };
  const fee = existingFee && {
    id: "real-fee", projectNumber: project.projectNumber, projectName: project.projectName, termYear: 2026, termNumber: 1,
    institutionId: member.institutionId, institutionName: member.institutionName, institutionType: "", budget: 0, feeRate: 0,
    calculatedFee: 100, appliedFee: 100, status: "DRAFT", ...existingFee,
  };
  const fresh = Object.fromEntries(store.FEE_RECALC_SLOTS.map((slot) => [slot, true]));
  store.inspectForTest({ projects: [project], projectMembers: [member], feePolicies: [policy], termFees: fee ? [fee] : [], termFeeCalcs: [], fresh });
  return { project, member };
}

const feeOf = (store, id) => store.inspectForTest().state.termFees.find((f) => f.id === id);
const sentSyncBodies = (requests) => requests.filter((r) => r.url.endsWith("/sync-fees")).map((r) => r.body);

test("an edit to a row created by a pending recalculation is saved with the real id after the sync", async (t) => {
  const requests = controlledNetwork(t);
  const store = withRetryCleanup(t, loadStore());
  const { project } = seed(store);
  store.autoGenerateTermFees(project.id);
  await until(() => requests.length === 1);
  assert.ok(requests[0].url.endsWith("/sync-fees"));
  const created = store.inspectForTest().state.termFees[0];
  assert.ok(created.id.startsWith("tf-"), "새로 만든 행은 서버가 실제 id를 정해주기 전까지 임시 id다");

  store.updateTermFee(created.id, { appliedFee: 999000, manualOverride: true });
  await settle();
  assert.equal(requests.length, 1, "동기화 응답 전에는 저장 요청이 나가지 않고 기다린다");

  const savedFee = { ...requests[0].body.termFees[0], id: "real-fee" };
  requests[0].respond({ ok: true, termFees: [savedFee] });
  await until(() => requests.length === 2);
  assert.equal(requests[1].url, "/api/term-fees/real-fee");
  assert.equal(requests[1].body.appliedFee, 999000);
  requests[1].respond({ ok: true, termFee: { ...savedFee, appliedFee: 999000, manualOverride: true } });
  await store.waitForSyncIdle();

  const fee = store.inspectForTest().state.termFees[0];
  assert.equal(fee.id, "real-fee");
  assert.equal(fee.appliedFee, 999000);
  assert.equal(fee.manualOverride, true);
});

test("a late sync response does not overwrite a newer edit, and the edit is sent after the sync", async (t) => {
  const requests = controlledNetwork(t);
  const store = withRetryCleanup(t, loadStore());
  const { project } = seed(store, { existingFee: { appliedFee: 888000, manualOverride: true } });
  store.autoGenerateTermFees(project.id);
  await until(() => requests.length === 1);
  assert.equal(requests[0].body.termFees.find((f) => f.id === "real-fee").appliedFee, 888000);

  store.updateTermFee("real-fee", { appliedFee: 777000 });
  await settle();
  assert.equal(requests.length, 1, "PATCH는 앞서 나간 동기화가 끝난 뒤에 나간다");

  requests[0].respond({ ok: true, termFees: requests[0].body.termFees });
  await until(() => requests.length === 2);
  assert.equal(feeOf(store, "real-fee").appliedFee, 777000, "동기화 응답이 그 사이 입력한 값을 되돌리면 안 된다");
  assert.equal(requests[1].url, "/api/term-fees/real-fee");
  assert.equal(requests[1].body.appliedFee, 777000);
  requests[1].respond({ ok: true, termFee: { ...feeOf(store, "real-fee"), appliedFee: 777000 } });
  await store.waitForSyncIdle();
  assert.equal(feeOf(store, "real-fee").appliedFee, 777000);
});

test("recalculation keeps the row id and the fields entered by hand", async (t) => {
  const requests = controlledNetwork(t);
  const store = withRetryCleanup(t, loadStore());
  const { project } = seed(store, { existingFee: {
    billingType: "역발행", docRequestDate: "2026-09-01", docReplyDate: "2026-09-10",
    termStartDate: "2026-02-01", termEndDate: "2026-11-30", otherFirmHandled: true,
  } });
  store.autoGenerateTermFees(project.id);
  await until(() => requests.length === 1);
  const fee = store.inspectForTest().state.termFees[0];
  assert.equal(fee.id, "real-fee", "이미 있는 행의 id를 그대로 이어받아야 임시 id 구간이 생기지 않는다");
  for (const key of ["billingType", "docRequestDate", "docReplyDate", "termStartDate", "termEndDate", "otherFirmHandled"]) {
    assert.equal(fee[key], { billingType: "역발행", docRequestDate: "2026-09-01", docReplyDate: "2026-09-10",
      termStartDate: "2026-02-01", termEndDate: "2026-11-30", otherFirmHandled: true }[key], key);
  }
  // 서버로 나가는 본문에도 같은 값이 들어 있어야 서버에서도 지워지지 않는다.
  assert.equal(requests[0].body.termFees[0].billingType, "역발행");
  assert.equal(requests[0].body.termFees[0].docRequestDate, "2026-09-01");
  requests[0].respond({ ok: true, termFees: requests[0].body.termFees });
  await store.waitForSyncIdle();
});

test("a rejected save restores the stored value, tells the user, and does not block later saves", async (t) => {
  t.mock.method(console, "error", () => {});
  const requests = controlledNetwork(t);
  const store = withRetryCleanup(t, loadStore());
  seed(store, { existingFee: { appliedFee: 100 } });
  const notices = [];
  store.subscribeSyncNotice((message) => notices.push(message));

  store.updateTermFee("real-fee", { appliedFee: 999, manualOverride: true });
  assert.equal(feeOf(store, "real-fee").appliedFee, 999);
  await until(() => requests.length === 1);
  requests[0].respond({ ok: false, error: "이 작업을 수행할 권한이 없습니다." });
  await until(() => requests.length === 2);
  assert.equal(requests[1].url, "/api/term-fees", "서버에 실제로 남아 있는 값을 다시 받아온다");
  const stored = { ...feeOf(store, "real-fee"), appliedFee: 100, manualOverride: undefined };
  requests[1].respond({ ok: true, termFees: [stored] });
  await store.waitForSyncIdle();
  assert.equal(feeOf(store, "real-fee").appliedFee, 100);
  assert.equal(notices.length, 1);
  assert.match(notices[0], /권한이 없습니다/);

  store.updateTermFee("real-fee", { appliedFee: 555 });
  await until(() => requests.length === 3);
  assert.equal(requests[2].url, "/api/term-fees/real-fee");
  requests[2].respond({ ok: true, termFee: { ...stored, appliedFee: 555 } });
  await store.waitForSyncIdle();
  assert.equal(feeOf(store, "real-fee").appliedFee, 555);
});

test("recalculation requested before the server data arrives is deferred and runs once afterwards", async (t) => {
  const requests = controlledNetwork(t);
  const store = withRetryCleanup(t, loadStore());
  const { project } = seed(store);
  store.inspectForTest({ fresh: {} }); // sessionStorage 스냅샷만 있고 서버 응답은 아직 없는 상태

  assert.deepEqual(store.autoGenerateTermFees(project.id), []);
  store.autoGenerateTermFees(project.id);
  await settle();
  assert.equal(requests.length, 0, "서버 응답 전에는 낡은 값으로 재계산·저장하지 않는다");

  store.markFreshForTest();
  await until(() => requests.length === 1);
  assert.ok(requests[0].url.endsWith("/sync-fees"));
  await settle();
  assert.equal(requests.length, 1, "같은 과제의 보류 요청은 한 번만 실행된다");
  requests[0].respond({ ok: true, termFees: [] });
  await store.waitForSyncIdle();
});

test("deleting terms is sent after the sync that was already in flight", async (t) => {
  const requests = controlledNetwork(t);
  const store = withRetryCleanup(t, loadStore());
  const { project } = seed(store);
  store.autoGenerateTermFees(project.id);
  await until(() => requests.length === 1);
  store.deleteProjectTerms(project.id, [1]);
  await settle();
  assert.equal(requests.length, 1, "삭제 요청은 앞선 동기화가 끝난 뒤에 나간다");
  requests[0].respond({ ok: true, termFees: [] });
  await until(() => requests.length === 2);
  assert.ok(requests[1].url.endsWith("/delete-terms"));
  requests[1].respond({ ok: true });
  await store.waitForSyncIdle();
});

test("a recalculation queued behind a failing edit never uploads the failed value", async (t) => {
  t.mock.method(console, "error", () => {});
  const requests = controlledNetwork(t);
  const store = withRetryCleanup(t, loadStore());
  const { project } = seed(store, { existingFee: { appliedFee: 100 } });
  const notices = [];
  store.subscribeSyncNotice((message) => notices.push(message));

  store.updateTermFee("real-fee", { appliedFee: 999, manualOverride: true });
  store.autoGenerateTermFees(project.id); // 수정 저장이 끝나기 전에 재계산이 요청된다
  await until(() => requests.length === 1);
  assert.equal(requests[0].url, "/api/term-fees/real-fee");
  requests[0].respond({ ok: false, error: "이 작업을 수행할 권한이 없습니다." });

  await until(() => requests.length === 2);
  assert.equal(requests[1].url, "/api/term-fees", "실패하면 서버에 저장된 값을 받아온다");
  requests[1].respond({ ok: true, termFees: [{ ...feeOf(store, "real-fee"), appliedFee: 100, manualOverride: undefined }] });

  await until(() => requests.length === 3);
  assert.ok(requests[2].url.endsWith("/sync-fees"), "복원한 값 위에서 다시 계산한 결과가 나간다");
  requests[2].respond({ ok: true, termFees: [] });
  await store.waitForSyncIdle();
  await settle();

  const bodies = sentSyncBodies(requests);
  assert.equal(bodies.length, 1, "미리 만들어 둔 재계산은 건너뛰고 새로 계산한 것 하나만 나간다");
  assert.notEqual(bodies[0].termFees.find((f) => f.id === "real-fee")?.appliedFee, 999, "저장에 실패한 값이 서버로 올라가면 안 된다");
  assert.equal(feeOf(store, "real-fee")?.manualOverride, undefined);
  assert.match(notices[0], /999/, "다시 입력할 수 있도록 입력값이 안내에 들어 있다");
});

test("when the stored value cannot be restored, a later recalculation does not resend the rejected value", async (t) => {
  // 검토에서 지적된 시나리오: 저장 거절 → 복원(재조회)도 실패 → (그 순간) 대기 중이던 재계산은 무효화되지만,
  // 그 뒤 탭 재진입·참여기관 수정 등으로 "새로" 걸리는 재계산은 막지 못해 거절된 값이 다시 전송됐다.
  t.mock.method(console, "error", () => {});
  const requests = controlledNetwork(t);
  const store = withRetryCleanup(t, loadStore());
  const { project } = seed(store, { existingFee: { appliedFee: 100 } });
  const notices = [];
  store.subscribeSyncNotice((message) => notices.push(message));

  store.updateTermFee("real-fee", { appliedFee: 999, manualOverride: true });
  await until(() => requests.length === 1);
  requests[0].respond({ ok: false, error: "서버 오류" });
  await until(() => requests.length === 2);
  requests[1].respondRaw({ status: 500, json: async () => ({ ok: false, error: "복원 조회 실패" }) });
  await settle();

  assert.equal(sentSyncBodies(requests).length, 0, "복원하지 못한 상태에서 저장 안 된 값을 서버에 올리면 안 된다");
  assert.match(notices[0], /되돌리지도 못했습니다/);
  assert.equal(store.isFeeProjectTaintedForTest(project.projectNumber), true,
    "복원할 때까지는 이 과제가 태인트 상태로 남아, 이후 재계산도 계속 막혀야 한다");

  // 담당자가 탭을 재진입하는 등으로 재계산이 다시 걸린다 — 태인트가 풀리기 전이므로 아무것도 보내면 안 된다.
  store.autoGenerateTermFees(project.id);
  await settle();
  assert.equal(sentSyncBodies(requests).length, 0, "복원 전 새로 걸린 재계산도 거절된 값을 전송하면 안 된다");

  // 다음 자동 재시도에서 복원이 성공하면(서버에 남아 있는 값 100원), 그제서야 보류됐던 재계산이 그 값 위에서 실행된다.
  await until(() => requests.length === 3, "태인트 자동 재시도의 복원 조회");
  assert.equal(requests[2].url, "/api/term-fees");
  requests[2].respond({ ok: true, termFees: [{ ...feeOf(store, "real-fee"), appliedFee: 100, manualOverride: undefined }] });
  await until(() => requests.length === 4, "태인트가 풀린 뒤 보류됐던 재계산의 sync-fees");
  requests[3].respond({ ok: true, termFees: [] });
  await store.waitForSyncIdle();

  assert.equal(store.isFeeProjectTaintedForTest(project.projectNumber), false);
  assert.equal(sentSyncBodies(requests).length, 1, "복원 후에야 정확히 한 번 전송된다");
  assert.notEqual(sentSyncBodies(requests)[0].termFees.find((f) => f.id === "real-fee")?.appliedFee, 999);
});

test("an edit on a row from a superseded recalculation is carried by the recalculation that actually runs", async (t) => {
  // 검토에서 지적된 시나리오: 새 행 생성 재계산 A가 더 최신 재계산 B에 밀려 건너뛰어지면, A가 만든 임시 id에
  // 걸려 있던 그 사이의 수정이 "서버에 아직 저장되지 않은 항목"으로 실패 처리되고, 복구용 재계산이 복원된
  // (수정 전) 서버 값 위에서 다시 계산해 입력값이 사라졌다.
  t.mock.method(console, "error", () => {});
  const requests = controlledNetwork(t);
  const store = withRetryCleanup(t, loadStore());
  const { project } = seed(store); // 기존 행 없음 — 재계산이 새 행을 만든다

  // 아래 세 호출을 await 없이 동기적으로 실행한다 — A의 체인 태스크가 마이크로태스크 큐에서 시작조차 하기
  // 전에 edit·B가 뒤이어 체인에 쌓여야, A가 "이미 최신이 아님"으로 건너뛰어지는 경우를 정확히 재현한다.
  store.autoGenerateTermFees(project.id); // A: 새 행 생성(로컬)
  const created = store.inspectForTest().state.termFees.find((f) => f.institutionId === "real-institution");
  assert.ok(created.id.startsWith("tf-"));
  const autoCalculated = created.appliedFee;
  store.updateTermFee(created.id, { appliedFee: 999, manualOverride: true }); // 그 새 행을 바로 999로 수정
  store.autoGenerateTermFees(project.id); // B: 참여기관 수정 등으로 재계산이 한 번 더 걸렸다고 가정

  await until(() => requests.length === 1, "건너뛰지 않은 재계산(B)의 sync-fees만 나간다");
  await settle();
  assert.equal(requests.length, 1, "A는 건너뛰어져 별도 요청을 만들지 않는다");
  assert.equal(requests[0].body.termFees.find((f) => f.institutionId === "real-institution")?.appliedFee, 999,
    "건너뛴 A 대신 실행된 B가 그 사이의 수정값을 포함해서 보낸다");
  assert.notEqual(requests[0].body.termFees.find((f) => f.institutionId === "real-institution")?.appliedFee, autoCalculated);

  requests[0].respond({ ok: true, termFees: requests[0].body.termFees.map((f) => ({ ...f, id: "server-real-fee" })) });
  await store.waitForSyncIdle();
  await settle();

  const final = feeOf(store, "server-real-fee");
  assert.equal(final.appliedFee, 999, "입력값이 사라지지 않고 실제 id로 정상 저장된다");
  assert.equal(final.manualOverride, true);
  assert.equal(requests.length, 1, "복구용 재계산이나 별도 PATCH가 추가로 나가지 않는다");
});

test("a save whose response body never finishes is cut off and does not block the next save", async (t) => {
  t.mock.method(console, "error", () => {});
  const realSetTimeout = globalThis.setTimeout;
  globalThis.setTimeout = (fn, ms, ...args) => realSetTimeout(fn, ms === 120000 ? 20 : ms, ...args); // 120초 상한만 축소
  t.after(() => { globalThis.setTimeout = realSetTimeout; });
  const requests = controlledNetwork(t);
  const store = withRetryCleanup(t, loadStore());
  seed(store, { existingFee: { appliedFee: 100 } });
  const notices = [];
  store.subscribeSyncNotice((message) => notices.push(message));

  store.updateTermFee("real-fee", { appliedFee: 200 });
  store.updateTermFee("real-fee", { appliedFee: 300 });
  await until(() => requests.length === 1);
  requests[0].respondRaw({ status: 200, json: () => new Promise(() => {}) }); // 헤더는 왔지만 본문이 끝나지 않는다
  await until(() => requests.length === 2);
  assert.equal(requests[1].body.appliedFee, 300, "뒤따르는 저장이 이어서 나간다");
  requests[1].respond({ ok: true, termFee: { ...feeOf(store, "real-fee"), appliedFee: 300 } });
  await store.waitForSyncIdle();
  assert.match(notices[0], /저장 여부를 확인하지 못했습니다/, "시간 초과는 실패가 아니라 '저장 여부 불확실'로 안내한다");
  assert.equal(feeOf(store, "real-fee").appliedFee, 300, "불확실할 때는 화면 값을 서버 값으로 되돌리지 않는다");
});

test("a concurrent edit that succeeds while a taint-recovery restore is in flight is not overwritten by the stale restore response", async (t) => {
  // 검토에서 지적된 시나리오: ①태인트 복원 재시도 GET 시작(조회된 금액 100원) → ②응답을 기다리는 동안
  // 사용자가 777원으로 수정해 PATCH가 성공 → ③(수정 전) 늦게 도착한 복원 응답이 화면을 100원으로 덮음 —
  // 이 복원 호출이 과제별 쓰기 순서(chainFeeWrite) 밖에 있었고, 응답을 반영할 때 그 사이 로컬 상태가
  // 바뀌었는지도 확인하지 않았다.
  t.mock.method(console, "error", () => {});
  const requests = controlledNetwork(t);
  const store = withRetryCleanup(t, loadStore());
  seed(store, { existingFee: { appliedFee: 100 } });
  // 일부러 fastRetriesForTest()를 쓰지 않는다 — 첫 재시도 간격(기본 1.5초)을 그대로 두면 두 번째 재시도는
  // 5초 뒤에나 걸리므로, 아래에서 첫 재시도 하나만 다루고 곧바로 정리하는 이 테스트의 실제 실행 시간
  // (1.5초 남짓) 안에는 여유가 충분하다. 재시도 간격을 전부 5ms로 좁히면(다른 테스트들처럼) 이 테스트가
  // 각 단계를 처리하는 사이(폴링 등)에 다음 재시도가 이미 시작해버려, 미처 못 받은 추가 조회 요청이
  // 남는 경합이 있었다.
  const realSetTimeout = globalThis.setTimeout;
  t.after(() => { globalThis.setTimeout = realSetTimeout; });
  globalThis.setTimeout = (fn, ms, ...args) => realSetTimeout(fn, ms === 1500 ? 30 : ms, ...args); // 첫 재시도 간격만 축소

  // 태인트 상태로 만든다: 수정 실패 → 그 실패를 되돌리려는 복원 조회도 실패.
  store.updateTermFee("real-fee", { appliedFee: 999, manualOverride: true });
  await until(() => requests.length === 1);
  requests[0].respond({ ok: false, error: "일시적 오류" });
  await until(() => requests.length === 2);
  requests[1].respondRaw({ status: 500, json: async () => ({ ok: false, error: "복원 조회 실패" }) });
  await until(() => store.isFeeProjectTaintedForTest("TEST-P") === true);

  // 첫 자동 재시도가 새 복원 조회를 시작한다 — 응답을 아직 주지 않고 붙잡아 둔다.
  await until(() => requests.length === 3);
  assert.equal(requests[2].url, "/api/term-fees");

  // 그 GET이 떠 있는 동안 사용자가 777원으로 수정한다 — 과제별 쓰기 순서에 태워져 있다면, 이 수정의 PATCH는
  // 앞선 복원 조회가 끝나기 전엔 나가지 않는다(화면 낙관적 갱신 자체는 즉시 반영된다).
  store.updateTermFee("real-fee", { appliedFee: 777 });
  await settle();
  assert.equal(feeOf(store, "real-fee").appliedFee, 777, "화면은 즉시 낙관적으로 갱신된다");
  assert.equal(requests.length, 3, "이 수정의 PATCH는 앞선 복원 조회가 끝날 때까지 대기한다");

  // 복원 조회가 이제야 응답한다 — 조회를 시작했던 "그때" 서버에 있던 오래된 값(100원)이다.
  requests[2].respond({ ok: true, termFees: [{ ...feeOf(store, "real-fee"), appliedFee: 100, manualOverride: undefined }] });
  await settle();
  assert.equal(feeOf(store, "real-fee").appliedFee, 777,
    "조회하는 동안 로컬 값이 이미 바뀌었으므로, 그 전 시점의 응답이 방금 수정한 값을 덮으면 안 된다");

  // 복원이 끝난 뒤에야(체인이 풀려서) 777 수정의 PATCH가 실제로 나간다.
  await until(() => requests.length === 4);
  assert.equal(requests[3].url, "/api/term-fees/real-fee");
  assert.equal(requests[3].body.appliedFee, 777);
  requests[3].respond({ ok: true, termFee: { ...feeOf(store, "real-fee"), appliedFee: 777 } });
  await store.waitForSyncIdle();
  await settle();

  assert.equal(feeOf(store, "real-fee").appliedFee, 777, "최종 화면 값");

  // 위 request[2](복원)는 참조 불일치로 버려졌으므로(정상 동작 — 그 사이 777 수정이 이미 반영됨) 태인트는
  // 아직 안 풀렸고, 다음 자동 재시도가 또 예약돼 있다. 이 테스트는 "복원 응답이 최신 수정을 덮지 않는다"는
  // 것만 검증하면 충분하므로, 그 재시도가 실제로 실행되며 만드는 후속 요청까지 여기서 다 받아주는 대신 —
  // 태인트 상태를 직접 정리한다(사용자가 새로고침해 hydrate가 처음부터 다시 도는 것과 같은 효과). 이렇게
  // 안 하면 예약된 재시도 타이머가 테스트 함수가 끝난 뒤(그 사이 t.mock이 fetch를 되돌려놓은 뒤)에 실행돼
  // 실제 네트워크로 나가버릴 수 있다 — t.after의 resetPendingFeeRetriesForTest()보다 먼저, 여기서 확실히 끊는다.
  store.resetPendingFeeRetriesForTest();
});

test("restoreProjectTermFeesFromServer discards a stale response when local state changed while it was in flight", async (t) => {
  // 위 체인 테스트와 별개로, restoreProjectTermFeesFromServer 자체의 참조 비교를 직접 검증한다 — 이 함수를
  // 부르는 모든 경로가 항상 chainFeeWrite로 감싸져 있으리라는 보장에만 기대지 않기 위한 방어선이다. 여기서는
  // updateTermFee/persistTermFee(큐에 잡히는 수정)가 아니라, 조회가 떠 있는 동안 로컬 상태가 "그 경로를 거치지
  // 않고" 바뀌는 경우(예: 다른 화면의 동작, 향후 추가될 다른 쓰기 경로)를 흉내 낸다.
  t.mock.method(console, "error", () => {});
  const requests = controlledNetwork(t);
  const store = withRetryCleanup(t, loadStore());
  seed(store, { existingFee: { appliedFee: 100 } });

  const before = store.inspectForTest().state.termFees;
  const restorePromise = store.restoreProjectTermFeesFromServerForTest("TEST-P");
  await until(() => requests.length === 1);
  assert.equal(requests[0].url, "/api/term-fees");

  // 조회가 떠 있는 동안 termFees 배열 참조가 바뀐다(큐에 잡히는 수정 경로를 거치지 않고 직접 상태를 바꾼
  // 경우를 흉내 낸다).
  store.inspectForTest({ termFees: before.map((f) => (f.id === "real-fee" ? { ...f, appliedFee: 777 } : f)) });
  assert.notEqual(store.inspectForTest().state.termFees, before);

  requests[0].respond({ ok: true, termFees: [{ ...feeOf(store, "real-fee"), appliedFee: 100 }] });
  const result = await restorePromise;

  assert.equal(result.ok, false, "조회 시작 이후 로컬 상태가 바뀌었으면 그 응답은 버려야 한다");
  assert.equal(feeOf(store, "real-fee").appliedFee, 777, "버린 응답이 그 사이의 변경을 덮으면 안 된다");
});

for (const { status, expectedTaint, expectedNoticePattern } of [
  { status: 401, expectedTaint: "auth", expectedNoticePattern: /로그인이 만료/ },
  { status: 403, expectedTaint: "permission", expectedNoticePattern: /권한.*(없어|확인)/ },
]) {
  test(`a ${status} on the taint-recovery restore stops automatic retries and marks the banner state as "${expectedTaint}"`, async (t) => {
    t.mock.method(console, "error", () => {});
    const requests = controlledNetwork(t);
    const store = withRetryCleanup(t, loadStore());
    seed(store, { existingFee: { appliedFee: 100 } });
    store.fastRetriesForTest();
    const notices = [];
    store.subscribeSyncNotice((message) => notices.push(message));

    // 태인트 상태로 만든다: 수정 실패 → 복원 조회도 실패.
    store.updateTermFee("real-fee", { appliedFee: 999, manualOverride: true });
    await until(() => requests.length === 1);
    requests[0].respond({ ok: false, error: "일시적 오류" });
    await until(() => requests.length === 2);
    requests[1].respondRaw({ status: 500, json: async () => ({ ok: false, error: "복원 조회 실패" }) });
    await until(() => store.isFeeProjectTaintedForTest("TEST-P") === true);
    assert.equal(store.inspectForTest().state.taintedFeeProjects["TEST-P"], "recovering",
      "자동 재시도가 실제로 진행 중일 때는 배너가 회전 아이콘의 'recovering' 상태여야 한다");

    // 자동 재시도가 인증/권한 오류를 받는다.
    await until(() => requests.length === 3);
    requests[2].respondRaw({ status, json: async () => ({ ok: false, error: "거절" }) });
    await settle();

    assert.equal(store.inspectForTest().state.taintedFeeProjects["TEST-P"], expectedTaint,
      "재시도가 멈추면 배너 상태도 '계속 확인 중'에서 벗어나야 한다");
    assert.match(notices[notices.length - 1], expectedNoticePattern);

    // 401/403 이후에는 재시도를 멈춘다 — 조금 더 기다려도 새 요청이 나가지 않는다.
    await settle();
    await settle();
    assert.equal(requests.length, 3, `${status} 이후에는 자동 재시도가 멈춰야 한다`);
  });
}

test("a failure JSON on the list fetch is retried, but a 401 is not", async (t) => {
  t.mock.method(console, "error", () => {});
  const requests = controlledNetwork(t);
  const store = withRetryCleanup(t, loadStore());
  store.fastRetriesForTest();

  store.loadTermFeesForTest();
  await until(() => requests.length === 1);
  requests[0].respondRaw({ status: 500, json: async () => ({ ok: false, error: "일시적 서버 오류" }) });
  await until(() => requests.length === 2);
  requests[1].respond({ ok: true, termFees: [] });
  await until(() => store.inspectForTest().state.fresh.termFees === true);

  store.inspectForTest({ fresh: {} });
  store.loadTermFeesForTest();
  await until(() => requests.length === 3);
  requests[2].respondRaw({ status: 401, json: async () => ({ ok: false, error: "로그인이 필요합니다." }) });
  await settle();
  await settle();
  assert.equal(requests.length, 3, "인증 실패는 재시도해도 같은 응답이라 다시 요청하지 않는다");
});
