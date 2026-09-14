/* eslint-disable @typescript-eslint/no-require-imports */
// 실제 DB/브라우저 요청 없이 현재 TypeScript 코드에 지연·실패 응답을 주입한다.
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
      return { state: _state, batchDepth: _batchDepth, recalcDepth: _bulkRecalcSuspendDepth, pending: _pendingSyncCount };
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

function controlledNetwork(t) {
  const requests = [];
  t.mock.method(globalThis, "fetch", (url, init) => new Promise((resolve) => {
    requests.push({ url, method: init?.method, body: init?.body ? JSON.parse(init.body) : undefined,
      respond: (body) => resolve({ json: async () => body }) });
  }));
  return requests;
}

function seed(store, overrides = {}) {
  const policy = feePolicies.find((p) => p.status === "ACTIVE");
  const project = {
    id: "real-project", projectNumber: "TEST-P", projectName: "Test", projectCode: "SH000001",
    termCodes: [{ termNumber: 1, code: "SH000001" }], agencyId: policy.agencyId ?? "test-agency",
    totalTerms: 1, currentTerm: 1, startDate: "2026-01-01", endDate: "2026-12-31", status: "ACTIVE",
    leadInstitutionId: "", leadInstitutionName: "", totalBudget: 0,
    ...overrides,
  };
  const member = {
    id: "real-member", projectId: project.id, projectNumber: project.projectNumber,
    institutionId: "real-institution", institutionName: "Test", role: "LEAD", budget: 100000000,
    cashBudget: 100000000, inKindBudget: 0,
    annualBudgets: [{ termNumber: 1, termYear: 2026, cashBudget: 100000000, inKindBudget: 0, auditFirm: "Other firm" }],
  };
  store.inspectForTest({ projects: [project], projectMembers: [member], feePolicies: [policy], termFees: [], termFeeCalcs: [] });
  return { project, member };
}

test("late server failures are counted until the batch finishes", async (t) => {
  t.mock.method(console, "error", () => {});
  const requests = controlledNetwork(t);
  const store = loadStore();
  const { project } = seed(store);
  store.beginSyncBatch();
  store.addProject({ ...project, projectNumber: "NEW-P" });
  const pending = store.endSyncBatchAndWait();
  requests[0].respond({ ok: false, error: "injected failure" });
  assert.equal(await pending, 1);
  assert.equal(store.inspectForTest().batchDepth, 0);
});

for (const patchSucceeds of [true, false]) {
  test(`other-firm update waits for the real fee ID and ${patchSucceeds ? "persists" : "reports failure"}`, async (t) => {
    t.mock.method(console, "error", () => {});
    const requests = controlledNetwork(t);
    const store = loadStore();
    const { project } = seed(store);
    let finished = false;
    const run = store.runBulkSyncBatch(async () => {
      store.autoGenerateTermFees(project.id);
      await store.endBulkRecalcSuspend();
      store.setTermOtherFirmHandled(project.projectNumber, 2026, 1, true);
      // 같은 연차의 여러 기관 행에서도 PATCH를 중복 전송하지 않는다.
      store.setTermOtherFirmHandled(project.projectNumber, 2026, 1, true);
    }).then((result) => { finished = true; return result; });
    await until(() => requests.length === 1);
    assert.ok(requests[0].url.endsWith("/sync-fees"));
    assert.equal(finished, false);
    const savedFee = { ...requests[0].body.termFees[0], id: "real-fee" };
    requests[0].respond({ ok: true, termFees: [savedFee] });
    await until(() => requests.length === 2);
    assert.equal(requests[1].url, "/api/term-fees/real-fee");
    assert.equal(finished, false);
    requests[1].respond(patchSucceeds
      ? { ok: true, termFee: { ...savedFee, otherFirmHandled: true } }
      : { ok: false, error: "injected PATCH failure" });
    assert.equal((await run).syncFailures, patchSucceeds ? 0 : 1);
    assert.equal(requests.length, 2);
    if (patchSucceeds) assert.equal(store.inspectForTest().state.termFees[0].otherFirmHandled, true);
    assert.equal(store.inspectForTest().pending, 0);
  });
}

test("new projects and their follow-up PATCH finish before recalculation and issue creation", async (t) => {
  const requests = controlledNetwork(t);
  const store = loadStore();
  const { project, member } = seed(store);
  store.inspectForTest({ projects: [], projectMembers: [] });
  let tempId;
  const run = store.runBulkSyncBatch(async () => {
    const created = store.addProject(project);
    tempId = created.id;
    store.addProjectMember({ ...member, projectId: created.id });
    store.updateProject(created.id, { projectName: "Updated" });
    await store.endBulkRecalcSuspend();
    store.addProjectIssue({ projectId: created.id, projectNumber: project.projectNumber, content: "Test issue" });
  });
  assert.equal(requests.length, 1, "no member request should use the temporary project ID");
  const savedProject = { ...requests[0].body, id: "saved-project" };
  requests[0].respond({ ok: true, project: savedProject });
  await until(() => requests.length === 3);
  const memberRequest = requests.find((r) => r.url === "/api/project-members");
  const projectPatch = requests.find((r) => r.method === "PATCH");
  assert.equal(memberRequest.body.projectId, "saved-project");
  memberRequest.respond({ ok: true, member: { ...memberRequest.body, id: "saved-member" } });
  await pause();
  assert.equal(requests.filter((r) => r.url.endsWith("/sync-fees")).length, 0);
  projectPatch.respond({ ok: true, project: { ...savedProject, projectName: "Updated" } });
  await until(() => requests.some((r) => r.url.endsWith("/sync-fees")));
  const feeRequest = requests.find((r) => r.url.endsWith("/sync-fees"));
  assert.equal(feeRequest.url, "/api/projects/saved-project/sync-fees");
  assert.equal(feeRequest.body.termFees[0].projectName, "Updated");
  feeRequest.respond({ ok: true, termFees: feeRequest.body.termFees.map((f) => ({ ...f, id: "saved-fee" })) });
  await until(() => requests.some((r) => r.url === "/api/project-issues"));
  const issue = requests.find((r) => r.url === "/api/project-issues");
  assert.equal(issue.body.projectId, "saved-project");
  issue.respond({ ok: true, projectIssue: { ...issue.body, id: "saved-issue" } });
  assert.equal((await run).syncFailures, 0);
  assert.equal(store.inspectForTest().state.projects[0].totalBudget, member.budget);
  assert.notEqual(tempId, "saved-project");
});

test("an exception keeps the batch active until remaining fee persistence is finished", async (t) => {
  const requests = controlledNetwork(t);
  const store = loadStore();
  const { project } = seed(store);
  const failure = new Error("injected import failure");
  let finished = false;
  const run = store.runBulkSyncBatch(async () => {
    store.autoGenerateTermFees(project.id);
    throw failure;
  }).catch((error) => { finished = true; return error; });
  await until(() => requests.length === 1);
  assert.equal(finished, false);
  assert.equal(store.inspectForTest().batchDepth, 1);
  requests[0].respond({ ok: true, termFees: [] });
  assert.equal(await run, failure);
  assert.equal(store.inspectForTest().batchDepth, 0);
  assert.equal(store.inspectForTest().recalcDepth, 0);
  assert.equal((await store.runBulkSyncBatch(async () => "retry")).value, "retry");
});

test("one invalid project does not discard other pending recalculations or leak the batch", async (t) => {
  t.mock.method(console, "error", () => {});
  const requests = controlledNetwork(t);
  const store = loadStore();
  const { project, member } = seed(store);
  store.inspectForTest({ projects: [{ ...project, id: "invalid", startDate: "invalid-date" }, project],
    projectMembers: [{ ...member, projectId: "invalid" }, member] });
  const run = store.runBulkSyncBatch(async () => {
    store.autoGenerateTermFees("invalid");
    store.autoGenerateTermFees(project.id);
  }).catch((error) => error);
  await until(() => requests.length === 1);
  assert.equal(requests[0].url, "/api/projects/real-project/sync-fees");
  requests[0].respond({ ok: true, termFees: [] });
  assert.ok(await run instanceof AggregateError);
  assert.equal(store.inspectForTest().batchDepth, 0);
  assert.equal(store.inspectForTest().recalcDepth, 0);
});

test("deferred calculation preserves multi-year amounts and manually confirmed fees", async (t) => {
  t.mock.method(globalThis, "fetch", async (_url, init) => {
    const body = JSON.parse(init.body);
    return { json: async () => init.method === "POST" && body.institutionId
      ? { ok: true, member: body } : { ok: true, termFees: [] } };
  });
  async function calculate(deferred) {
    const store = loadStore();
    const { project, member } = seed(store, { totalTerms: 3, currentTerm: 3, startDate: "2024-01-01",
      termCodes: [1, 2, 3].map((termNumber) => ({ termNumber, code: `SH00000${termNumber}` })) });
    store.inspectForTest({ projectMembers: [], termFees: [{ id: "confirmed-fee", projectNumber: project.projectNumber,
      institutionId: member.institutionId, termYear: 2024, termNumber: 1, status: "CONFIRMED", manualOverride: true,
      calculatedFee: 10000, appliedFee: 8500, unclaimedFee: 1500, otherFirmHandled: true }] });
    const addMembers = async () => {
      for (let n = 0; n < 2; n++) {
        store.addProjectMember({ ...member, institutionId: n === 0 ? member.institutionId : "second-institution",
          role: n === 0 ? "LEAD" : "PARTICIPANT", cashBudget: 600000000,
          annualBudgets: [1, 2, 3].map((termNumber) => ({ termYear: 2023 + termNumber, termNumber,
            cashBudget: 100000000 * termNumber, inKindBudget: 0 })) });
      }
    };
    if (deferred) await store.runBulkSyncBatch(addMembers);
    else { await addMembers(); await store.waitForSyncIdle(); }
    const state = store.inspectForTest().state;
    const withoutIds = (items) => items.map(({ id, ...rest }) => { void id; return rest; });
    return { fees: withoutIds(state.termFees), calcs: withoutIds(state.termFeeCalcs), budget: state.projects[0].totalBudget };
  }
  const immediate = await calculate(false);
  const deferred = await calculate(true);
  assert.deepEqual(deferred, immediate);
  assert.equal(deferred.fees.find((f) => f.manualOverride).appliedFee, 8500);
});

function fakeInstitutionServer({ failBusinessNumber, raceBusinessNumber } = {}) {
  let rows = new Map();
  const audit = [];
  let id = 0;
  let failOnce = Boolean(failBusinessNumber);
  let raceOnce = Boolean(raceBusinessNumber);
  const prisma = {
    async $transaction(work) {
      const local = new Map(rows);
      const logs = [];
      const tx = { logs, institution: {
        async findFirst({ where }) {
          return [...local.values()].find((r) => where.businessNumber.in.includes(r.businessNumber)) ?? null;
        },
        async create({ data }) {
          if (failOnce && data.businessNumber === failBusinessNumber) {
            failOnce = false;
            throw new Error("injected chunk failure");
          }
          if (raceOnce && data.businessNumber === raceBusinessNumber) {
            raceOnce = false;
            rows.set(data.businessNumber, { ...data, id: `external-${++id}`, contacts: [] });
            throw Object.assign(new Error("injected concurrent create"), { code: "P2002" });
          }
          if (local.has(data.businessNumber)) throw Object.assign(new Error("duplicate"), { code: "P2002" });
          const row = { ...data, id: `institution-${++id}`, contacts: [] };
          local.set(data.businessNumber, row);
          return row;
        },
      } };
      const result = await work(tx);
      rows = local;
      audit.push(...logs);
      return result;
    },
  };
  const route = loadTypeScript("app/api/institutions/bulk/route.ts", {
    "@/lib/db": { prisma, withDbWriteSlot: (fn) => fn() },
    "@/lib/session": { requireWriteAccess: async () => ({ userId: "test-user" }), SessionError: class extends Error {} },
    "@/lib/audit": { writeAuditLog: async (tx, entry) => tx.logs.push(entry) },
    "@/lib/utils": require("../lib/utils.ts"),
    "@/lib/institution-mapper": { toInstitution: (row) => ({ id: row.id, name: row.institutionName, bizNumber: row.businessNumber }) },
  });
  return {
    request: (items) => route.POST(new Request("http://test/api/institutions/bulk", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ items }),
    })),
    inspect: () => ({ rows, audit }),
  };
}

test("200 committed institutions survive a chunk failure and retry reuses them", async (t) => {
  t.mock.method(console, "error", () => {});
  const items = Array.from({ length: 401 }, (_, i) => ({ name: `Test ${i}`, bizNumber: `100-00-${String(i).padStart(5, "0")}` }));
  const server = fakeInstitutionServer({ failBusinessNumber: items[250].bizNumber });
  t.mock.method(globalThis, "fetch", async (_url, init) => server.request(JSON.parse(init.body).items));
  const store = loadStore();
  store.beginSyncBatch();
  const first = await store.addInstitutionsBulk(items);
  assert.equal(first.length, 200);
  assert.equal(await store.endSyncBatchAndWait(), 201);
  assert.equal(store.inspectForTest().state.institutions.length, 200);
  store.beginSyncBatch();
  const retry = await store.addInstitutionsBulk(items);
  assert.equal(retry.length, 401);
  assert.equal(retry[0].id, first[0].id);
  assert.equal(store.inspectForTest().state.institutions.length, 401);
  assert.equal(await store.endSyncBatchAndWait(), 0);
  assert.equal(server.inspect().audit.length, 401);
});

test("a lost response can be retried without duplicate institutions or audit entries", async (t) => {
  t.mock.method(console, "error", () => {});
  const server = fakeInstitutionServer();
  let loseResponse = true;
  t.mock.method(globalThis, "fetch", async (_url, init) => {
    const response = await server.request(JSON.parse(init.body).items);
    if (loseResponse) { loseResponse = false; throw new Error("response lost after commit"); }
    return response;
  });
  const store = loadStore();
  const items = [{ name: "Test", bizNumber: "1234567890" }];
  assert.deepEqual(await store.addInstitutionsBulk(items), []);
  assert.equal(server.inspect().rows.size, 1);
  const retry = await store.addInstitutionsBulk(items);
  assert.equal(retry.length, 1);
  assert.equal(retry[0].bizNumber, "123-45-67890");
  assert.equal(store.inspectForTest().state.institutions.length, 1);
  assert.equal(server.inspect().rows.size, 1);
  assert.equal(server.inspect().audit.length, 1);
});

test("concurrent business-number creation restarts the transaction and reuses the winner", async () => {
  const server = fakeInstitutionServer({ raceBusinessNumber: "123-45-67890" });
  const response = await server.request([{ name: "Test", bizNumber: "1234567890" }]);
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.ok(body.institutions[0].id.startsWith("external-"));
  assert.equal(server.inspect().rows.size, 1);
  assert.equal(server.inspect().audit.length, 0);
});
