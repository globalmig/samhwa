/* eslint-disable @typescript-eslint/no-require-imports */
// 과제 상세 "수수료 관리" 탭이 열려 있는 동안 다른 사용자의 변경을 주기적으로 받아와 반영하는
// 기능(lib/store.ts applyPolledProjectFees/startPollingProjectFees)의 회귀 테스트. 실제 DB/브라우저
// 요청 없이 현재 TypeScript 코드를 그대로 실행한다.
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
      return { state: _state };
    }
    export function resetPendingFeeRetriesForTest() {
      for (const timer of Object.values(_feeSlotRetryTimer)) clearTimeout(timer);
      for (const key of Object.keys(_feeSlotRetryTimer)) delete _feeSlotRetryTimer[key];
      for (const timer of _taintRetryTimer.values()) clearTimeout(timer);
      _taintRetryTimer.clear();
      _taintedFeeProjects.clear();
      _taintRetryAttempt.clear();
    }
    export function queueDummyEditForTest(projectNumber: string) {
      queuedTermFeeEdits(projectNumber).add({ id: "dummy", data: {}, generation: 0 });
    }
    export function taintFeeProjectForTest(projectNumber: string) { taintFeeProject(projectNumber); }
    export function setFeePollProjectIdForTest(id: string | null) { _feePollProjectId = id; }
    export function fetchPolledProjectFeesForTest(id: string) { return fetchPolledProjectFees(id); }
    // 타임아웃 등으로 "진행 중" 표시가 먼저 풀린 뒤 그 요청의 응답이 뒤늦게 도착하는 경합을 재현하는 데
    // 쓴다 — 정상 경로에서는 fetchPolledProjectFees 자신의 .finally()가 이 시점에 이미 지웠을 상태다.
    export function clearFeePollInFlightForTest(id: string) { _feePollInFlight.delete(id); }
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

function controlledNetwork(t) {
  const requests = [];
  t.mock.method(globalThis, "fetch", (url, init) => new Promise((resolve) => {
    const entry = {
      url, method: init?.method, body: init?.body ? JSON.parse(init.body) : undefined, responded: false,
      respond(body) { this.responded = true; resolve({ json: async () => body }); },
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

function withRetryCleanup(t, store) {
  t.after(() => store.resetPendingFeeRetriesForTest());
  return store;
}

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

test("polling applies server rows for the project when nothing is pending", async (t) => {
  const store = withRetryCleanup(t, loadStore());
  const { project } = seed(store, { existingFee: { appliedFee: 100 } });
  const serverRow = { ...feeOf(store, "real-fee"), appliedFee: 777 };

  store.applyPolledProjectFees(project.id, [serverRow], []);

  assert.equal(feeOf(store, "real-fee").appliedFee, 777, "대기 중인 저장이 없으면 서버 값을 그대로 반영한다");
});

test("polling is a no-op when nothing actually changed", async (t) => {
  const store = withRetryCleanup(t, loadStore());
  const { project } = seed(store, { existingFee: { appliedFee: 100 } });
  const before = store.inspectForTest().state.termFees;

  store.applyPolledProjectFees(project.id, [{ ...feeOf(store, "real-fee") }], []);

  assert.equal(store.inspectForTest().state.termFees, before,
    "값이 동일하면 상태를 갈아끼우지 않는다(편집 중인 셀 등 불필요한 리렌더 방지)");
});

test("polling skips a row whose edit is still queued for that project", async (t) => {
  t.mock.method(console, "error", () => {});
  const store = withRetryCleanup(t, loadStore());
  const { project } = seed(store, { existingFee: { appliedFee: 100 } });
  store.queueDummyEditForTest("TEST-P");

  store.applyPolledProjectFees(project.id, [{ ...feeOf(store, "real-fee"), appliedFee: 777 }], []);

  assert.equal(feeOf(store, "real-fee").appliedFee, 100,
    "저장 대기 중인 수정이 있으면 이번 틱은 건너뛴다 — 안 그러면 막 낸 수정이 외부 값으로 덮일 수 있다");
});

test("polling skips while this project's recalculation sync is still in flight", async (t) => {
  const requests = controlledNetwork(t);
  const store = withRetryCleanup(t, loadStore());
  const { project } = seed(store);
  store.autoGenerateTermFees(project.id); // sync-fees 요청이 나가고 아직 응답 전
  await until(() => requests.length === 1);

  const before = store.inspectForTest().state.termFees;
  store.applyPolledProjectFees(project.id, [], []);
  assert.equal(store.inspectForTest().state.termFees, before,
    "이 과제의 쓰기 체인이 아직 진행 중이면 건너뛴다 — 재계산 결과가 곧 반영될 값을 미리 지우면 안 된다");

  requests[0].respond({ ok: true, termFees: [] });
  await store.waitForSyncIdle();
});

test("polling skips while the project is tainted (restore recovery in progress)", async (t) => {
  const store = withRetryCleanup(t, loadStore());
  const { project } = seed(store, { existingFee: { appliedFee: 100 } });
  store.taintFeeProjectForTest("TEST-P");

  store.applyPolledProjectFees(project.id, [{ ...feeOf(store, "real-fee"), appliedFee: 777 }], []);

  assert.equal(feeOf(store, "real-fee").appliedFee, 100,
    "복원 대기(태인트) 중에는 폴링도 끼어들지 않는다 — 그쪽 복원이 끝나면 스스로 최신화된다");
});

test("polling skips while this project's data hasn't been freshly loaded yet", async (t) => {
  const store = withRetryCleanup(t, loadStore());
  const { project } = seed(store, { existingFee: { appliedFee: 100 } });
  store.inspectForTest({ fresh: {} }); // sessionStorage 스냅샷만 있고 아직 서버 응답을 못 받은 상태를 흉내 낸다

  store.applyPolledProjectFees(project.id, [{ ...feeOf(store, "real-fee"), appliedFee: 777 }], []);

  assert.equal(feeOf(store, "real-fee").appliedFee, 100,
    "최초 로드가 아직 안 끝났으면 폴링 응답을 서버 값으로 오인해 반영하면 안 된다");
});

test("polling skips while a locally-created row still has a temporary id", async (t) => {
  const store = withRetryCleanup(t, loadStore());
  const { project, member } = seed(store);
  const tempRow = {
    id: "tf-temp-1", projectNumber: project.projectNumber, projectName: project.projectName, termYear: 2026, termNumber: 1,
    institutionId: member.institutionId, institutionName: member.institutionName, institutionType: "", budget: 0, feeRate: 0,
    calculatedFee: 100, appliedFee: 100, status: "DRAFT",
  };
  store.inspectForTest({ termFees: [tempRow] });

  store.applyPolledProjectFees(project.id, [{ ...tempRow, id: "real-fee", appliedFee: 777 }], []);

  assert.equal(store.inspectForTest().state.termFees.length, 1);
  assert.equal(store.inspectForTest().state.termFees[0].id, "tf-temp-1",
    "재계산이 방금 만든 임시 id 행이 아직 실제 id로 안 바뀐 동안은 건드리지 않는다");
});

test("polling for an unknown project id does nothing", async (t) => {
  const store = withRetryCleanup(t, loadStore());
  seed(store, { existingFee: { appliedFee: 100 } });
  const before = store.inspectForTest().state.termFees;

  store.applyPolledProjectFees("no-such-project", [], []);

  assert.equal(store.inspectForTest().state.termFees, before);
});

test("polling removes a term that another user deleted on the server", async (t) => {
  const store = withRetryCleanup(t, loadStore());
  const { project } = seed(store, { existingFee: { appliedFee: 100 } });

  store.applyPolledProjectFees(project.id, [], []); // 서버 응답에 이 과제 행이 하나도 없다 — 전부 삭제된 경우

  assert.equal(store.inspectForTest().state.termFees.filter((f) => f.projectNumber === "TEST-P").length, 0);
});

test("a failed poll fetch is ignored silently and keeps the existing value", async (t) => {
  const requests = controlledNetwork(t);
  const store = withRetryCleanup(t, loadStore());
  const { project } = seed(store, { existingFee: { appliedFee: 100 } });
  store.setFeePollProjectIdForTest(project.id);

  store.fetchPolledProjectFeesForTest(project.id);
  await until(() => requests.length === 1);
  requests[0].respond({ ok: false, error: "일시적 오류" });
  await settle();

  assert.equal(feeOf(store, "real-fee").appliedFee, 100, "조회가 실패해도 기존 값을 그대로 유지한다(다음 틱이 재시도)");
});

test("a poll response is ignored if the tab moved to a different project meanwhile", async (t) => {
  const requests = controlledNetwork(t);
  const store = withRetryCleanup(t, loadStore());
  const { project } = seed(store, { existingFee: { appliedFee: 100 } });
  store.setFeePollProjectIdForTest(project.id);

  store.fetchPolledProjectFeesForTest(project.id);
  await until(() => requests.length === 1);
  store.setFeePollProjectIdForTest("some-other-project"); // 응답이 오기 전에 다른 과제로 이동했다고 가정
  requests[0].respond({ ok: true, termFees: [{ ...feeOf(store, "real-fee"), appliedFee: 777 }], termFeeCalcs: [] });
  await settle();

  assert.equal(feeOf(store, "real-fee").appliedFee, 100, "이미 벗어난 과제의 뒤늦은 응답은 반영하지 않는다");
});

// ── 검토에서 지적된 세 가지 회귀 ──────────────────────────────────────

test("a poll response that arrives after a save already completed does not revert the saved value", async (t) => {
  // 순서: 조회 시작(그 시점 서버 값 100원) → 그 응답을 기다리는 동안 777원으로 수정·저장 성공 → 뒤늦게
  // 도착한 조회 응답(100원)이 방금 저장된 값을 덮으면 안 된다.
  const requests = controlledNetwork(t);
  const store = withRetryCleanup(t, loadStore());
  const { project } = seed(store, { existingFee: { appliedFee: 100 } });
  store.setFeePollProjectIdForTest(project.id);

  store.fetchPolledProjectFeesForTest(project.id);
  await until(() => requests.length === 1, "poll GET sent");

  store.updateTermFee("real-fee", { appliedFee: 777, manualOverride: true });
  await until(() => requests.length === 2, "PATCH sent");
  requests[1].respond({ ok: true, termFee: { ...feeOf(store, "real-fee"), appliedFee: 777, manualOverride: true } });
  await settle();
  assert.equal(feeOf(store, "real-fee").appliedFee, 777, "저장이 성공적으로 반영됐다");

  requests[0].respond({ ok: true, termFees: [{ ...feeOf(store, "real-fee"), appliedFee: 100, manualOverride: undefined }], termFeeCalcs: [] });
  await settle();

  assert.equal(feeOf(store, "real-fee").appliedFee, 777,
    "조회를 시작한 이후 저장이 끝났다면, 그 조회의 응답(조회 시작 시점의 낡은 값)은 버려야 한다");
});

test("an older poll response does not overwrite a newer poll response that already landed", async (t) => {
  // 첫 조회(A)가 타임아웃 등으로 '진행 중' 표시에서 빠진 뒤에도 응답이 살아있는 상태에서, 다음 틱이 새
  // 조회(B)를 보내고 B가 먼저 응답해 반영된 경우 — 뒤늦게 도착하는 A의 응답이 B가 반영한 최신 값을
  // 덮으면 안 된다.
  const requests = controlledNetwork(t);
  const store = withRetryCleanup(t, loadStore());
  const { project } = seed(store, { existingFee: { appliedFee: 100 } });
  store.setFeePollProjectIdForTest(project.id);

  store.fetchPolledProjectFeesForTest(project.id); // A
  await until(() => requests.length === 1, "poll A sent");
  store.clearFeePollInFlightForTest(project.id); // A가 타임아웃으로 '진행 중' 표시에서만 빠졌다고 가정(응답은 아직 살아있음)

  store.fetchPolledProjectFeesForTest(project.id); // B
  await until(() => requests.length === 2, "poll B sent");

  requests[1].respond({ ok: true, termFees: [{ ...feeOf(store, "real-fee"), appliedFee: 888 }], termFeeCalcs: [] }); // B(최신) 먼저 응답
  await settle();
  assert.equal(feeOf(store, "real-fee").appliedFee, 888);

  requests[0].respond({ ok: true, termFees: [{ ...feeOf(store, "real-fee"), appliedFee: 111 }], termFeeCalcs: [] }); // A(오래된 요청)가 뒤늦게 응답
  await settle();

  assert.equal(feeOf(store, "real-fee").appliedFee, 888, "더 먼저 보낸(오래된) 요청의 응답이 이미 반영된 최신 값을 덮으면 안 된다");
});

test("polling reflects a term-fee-calc change even when the fee rows themselves are unchanged", async (t) => {
  const store = withRetryCleanup(t, loadStore());
  const { project } = seed(store, { existingFee: { appliedFee: 100 } });
  const calc = {
    id: "calc-1", projectId: project.id, projectNumber: project.projectNumber, projectName: project.projectName,
    termYear: 2026, termNumber: 1, stageNumber: 0, workType: "ANNUAL", totalCashBudget: 0, coInstCount: 0,
    baseFee: 0, addonFee: 0, standardFee: 100, nonExemptCashBudget: 0, nonExemptCoInstCount: 0, nonExemptBaseFee: 0,
    nonExemptAddonFee: 0, generalFee: 0, exemptFeeTotal: 0, exemptBreakdown: [], calculatedFee: 100,
    generalCalcFee: 0, generalBillingFee: 0, generalUnclaimedFee: 0, carriedOverUnclaimed: 0, totalBillingFee: 0,
    overrides: [], status: "DRAFT", createdAt: "2026-01-01",
  };
  store.inspectForTest({ termFeeCalcs: [calc] });

  // termFees는 서버와 완전히 동일하게 보내고, termFeeCalcs만 바꾼다.
  store.applyPolledProjectFees(project.id, [{ ...feeOf(store, "real-fee") }], [{ ...calc, calculatedFee: 999 }]);

  const updated = store.inspectForTest().state.termFeeCalcs.find((c) => c.id === "calc-1");
  assert.equal(updated?.calculatedFee, 999, "수수료 행이 동일해도 산정내역만 바뀌었으면 반영해야 한다");
});

test("a stale request's cleanup does not clear the in-flight flag of a newer, still-pending request", async (t) => {
  // 검토에서 지적된 경합: 요청 A가 취소(또는 타임아웃)로 '진행 중' 표시에서 빠진 뒤 요청 B가 시작되면,
  // B가 아직 응답을 기다리는 중인데도 A의 (뒤늦게 실행되는) finally가 '진행 중' 표시를 무조건 지워버려
  // 그 사이 새 요청 C가 중복으로 허용될 수 있었다. 금액이 틀리게 반영되진 않지만(시퀀스 검사가 그건
  // 막는다), 중복 요청 방지 자체가 무의미해진다.
  const requests = controlledNetwork(t);
  const store = withRetryCleanup(t, loadStore());
  const { project } = seed(store, { existingFee: { appliedFee: 100 } });
  store.setFeePollProjectIdForTest(project.id);

  store.fetchPolledProjectFeesForTest(project.id); // A
  await until(() => requests.length === 1, "poll A sent");
  store.clearFeePollInFlightForTest(project.id); // A가 취소·타임아웃 등으로 '진행 중' 표시에서만 빠졌다고 가정

  store.fetchPolledProjectFeesForTest(project.id); // B — 아직 진행 중, 응답 전
  await until(() => requests.length === 2, "poll B sent");

  store.fetchPolledProjectFeesForTest(project.id); // B가 진행 중이므로 중복 요청은 막혀야 한다
  await settle();
  assert.equal(requests.length, 2, "B가 아직 응답 전이면 그 사이의 중복 요청은 막혀야 한다");

  // A의 응답이 이제야 도착한다(세대가 낡아 반영되진 않는다) — 이 응답 처리의 finally가 실행된다.
  requests[0].respond({ ok: true, termFees: [{ ...feeOf(store, "real-fee"), appliedFee: 100 }], termFeeCalcs: [] });
  await settle();

  // A의 finally가 실행된 "이후"에도, B가 여전히 응답 전이므로 새 요청은 계속 막혀야 한다.
  store.fetchPolledProjectFeesForTest(project.id);
  await settle();
  assert.equal(requests.length, 2,
    "낡은 요청(A)의 뒤늦은 정리가 아직 응답 전인 최신 요청(B)의 '진행 중' 표시를 지우면 안 된다");

  requests[1].respond({ ok: true, termFees: [{ ...feeOf(store, "real-fee"), appliedFee: 777 }], termFeeCalcs: [] });
  await settle();
  assert.equal(feeOf(store, "real-fee").appliedFee, 777);
});
