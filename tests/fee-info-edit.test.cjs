/* eslint-disable @typescript-eslint/no-require-imports */
require("tsx/cjs");
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const Module = require("node:module");
const ts = require("typescript");
const { buildFeeInfoPatches } = require("../lib/fee-info-edit.ts");
const { resolveAssignedManagerForTerm, resolveMemberRecipientForTerm, resolveMemberLeadForTerm } = require("../lib/fee-calculator.ts");

function compile(file, source, mocks) {
  const instance = new Module(file, module);
  instance.filename = file;
  instance.paths = Module._nodeModulePaths(path.dirname(file));
  instance.require = (id) => {
    assert.ok(Object.hasOwn(mocks, id), `Unexpected dependency ${id}`);
    return mocks[id];
  };
  instance._compile(ts.transpileModule(source, { compilerOptions: {
    module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, jsx: ts.JsxEmit.ReactJSX,
  } }).outputText, file);
  return instance.exports;
}

test("진행 연차 담당자 수정은 다른 연차의 담당자 필터 결과를 바꾸지 않는다", () => {
  const project = { currentTerm: 2, totalTerms: 3, assignedManager: "기존 담당자" };
  const patches = buildFeeInfoPatches(project, undefined, 2, [1, 2, 3], false, { assignedManager: "새 담당자" });
  const after = { ...project, ...JSON.parse(JSON.stringify(patches.project)) };
  assert.deepEqual([1, 2, 3].map((t) => resolveAssignedManagerForTerm(after, t)), ["기존 담당자", "새 담당자", "기존 담당자"]);
  assert.equal(after.totalTerms, 3);
  assert.deepEqual(patches.fee, {});
});

test("동명이인 담당자 계정 ID를 연차별로 보존하고 과거 연차의 선택도 저장한다", () => {
  const project = { currentTerm: 2, assignedManager: "동명", assignedManagerUserId: "old-user",
    assignedManagerHistory: [{ termNumber: 1, assignedManager: "동명" }] };
  const changes = buildFeeInfoPatches(project, undefined, 2, [1, 2, 3], false,
    { assignedManager: "동명", assignedManagerUserId: "new-user" }).project;
  assert.equal(changes.assignedManagerUserId, "new-user");
  assert.deepEqual(changes.assignedManagerHistory.map((h) => h.assignedManagerUserId), ["old-user", "new-user", "old-user"]);
  const historical = buildFeeInfoPatches({ ...project, ...changes }, undefined, 1, [1, 2, 3], false,
    { assignedManager: "동명", assignedManagerUserId: "historical-user" }).project;
  assert.equal(historical.assignedManagerUserId, undefined);
  assert.equal(historical.assignedManagerHistory[0].assignedManagerUserId, "historical-user");
  assert.equal(historical.assignedManagerHistory[1].assignedManagerUserId, "new-user");
});

test("실무자 이메일을 비워도 기본 이메일이 다시 표시되지 않고 다른 연차는 보존한다", () => {
  const member = { contactName: "실무자", contactEmail: "old@example.test", contactPhone: "010" };
  const patches = buildFeeInfoPatches({ currentTerm: 2 }, member, 1, [1, 2], false, { recipientEmail: "" });
  const after = { ...member, ...JSON.parse(JSON.stringify(patches.member)) };
  assert.equal(resolveMemberRecipientForTerm(after, 1).recipientEmail, "");
  assert.equal(resolveMemberRecipientForTerm(after, 1).recipientPhone, "010");
  assert.equal(resolveMemberRecipientForTerm(after, 2).recipientEmail, "old@example.test");
});

test("기관별 책임자 수정은 각 연차의 과제 책임자 기본값과 다른 기관 정보를 보존한다", () => {
  const project = { currentTerm: 2, researchLead: "현재", researchLeadEmail: "current@example.test",
    researchLeadOverrides: [{ termNumber: 1, name: "과거", email: "past@example.test" }] };
  const patches = buildFeeInfoPatches(project, {}, 2, [1, 2, 3], true, { researchLeadEmail: "" });
  assert.deepEqual(resolveMemberLeadForTerm(patches.member, project, 1, true), { name: "과거", email: "past@example.test" });
  assert.equal(resolveMemberLeadForTerm(patches.member, project, 2, true).email, "");
  assert.equal(resolveMemberLeadForTerm({}, project, 2, true).email, "current@example.test");
});

function routeHarness({ failAudit = false, split = false, denied = false } = {}) {
  let state = {
    project: { id: "project", projectNumber: "TEST", projectName: "Test", startYear: 2024, endYear: 2026,
      totalTerms: 3, createdAt: new Date("2024-01-01T00:00:00Z"), fundingAgency: { noticeRecipientScope: split ? "LEAD_AND_PARTICIPANTS" : "LEAD_ONLY" },
      extraData: JSON.stringify({ currentTerm: 2, assignedManager: "기존 담당자", stages: [{ startTermNumber: 1, endTermNumber: 3 }], termCodes: [{ termNumber: 1, code: "SH1" }] }) },
    members: [], fees: [],
  };
  for (let n = 1; n <= 3; n++) {
    const projectTerm = { projectId: "project", termNumber: n, termYear: 2023 + n, project: state.project };
    state.members.push({ id: `member-${n}`, institutionId: "institution", role: "MAIN", projectBudget: 100n * BigInt(n),
      projectTerm, institution: { institutionName: "기관" }, extraData: JSON.stringify({ cashBudget: 100 * n, contactEmail: "old@example.test" }) });
    state.fees.push({ id: `fee-${n}`, projectTermInstitution: state.members[n - 1], appliedFee: 100n * BigInt(n), extraData: JSON.stringify({ docReplyDate: "2026-01-01" }) });
  }
  let permissions;
  let writes = 0;
  const db = { $transaction: async (fn) => {
    const draft = structuredClone(state);
    const tx = {
      project: { findUnique: async () => draft.project, update: async ({ data }) => { writes++; Object.assign(draft.project, data); } },
      projectTerm: { findMany: async () => [1, 2, 3].map((termNumber) => ({ termNumber })) },
      projectTermInstitution: {
        findUnique: async ({ where }) => draft.members.find((m) => m.id === where.id),
        findMany: async () => draft.members,
        update: async ({ where, data }) => { writes++; Object.assign(draft.members.find((m) => m.id === where.id), data); },
      },
      termFee: {
        findUnique: async ({ where }) => draft.fees.find((f) => f.id === where.id),
        update: async ({ where, data }) => { writes++; Object.assign(draft.fees.find((f) => f.id === where.id), data); },
      },
    };
    const result = await fn(tx);
    state = draft;
    return result;
  } };
  class SessionError extends Error { constructor(message, status) { super(message); this.status = status; } }
  const file = path.resolve(__dirname, "../app/api/projects/[id]/fee-info/route.ts");
  const { PATCH } = compile(file, fs.readFileSync(file, "utf8"), {
    "@prisma/client": { Prisma: { TransactionIsolationLevel: { Serializable: "Serializable" } } },
    "@/lib/db": { prisma: db, withDbWriteSlot: (fn) => fn(), withDeadlockRetry: (fn) => fn(), describeDbWriteError: () => "저장 실패" },
    "@/lib/session": { SessionError, requireWriteAccess: async (domains) => {
      permissions = domains;
      if (denied) throw new SessionError("권한이 없습니다.", 403);
      return { userId: "user" };
    } },
    "@/lib/audit": { writeAuditLog: async () => { if (failAudit) throw new Error("audit failure"); } },
    "@/lib/project-mapper": require("../lib/project-mapper.ts"),
    "@/lib/project-member-mapper": require("../lib/project-member-mapper.ts"),
    "@/lib/project-member-patch": { PTI_INCLUDE: {} },
    "@/lib/fee-info-edit": require("../lib/fee-info-edit.ts"),
    "@/lib/utils": require("../lib/utils.ts"),
  });
  return {
    state: () => state, writes: () => writes, permissions: () => permissions,
    save: (changes, overrides = {}) => PATCH(new Request("http://localhost/api/projects/project/fee-info", {
      method: "PATCH", body: JSON.stringify({ termNumber: 2, memberId: "member-1", feeId: "fee-2", changes, ...overrides }),
    }), { params: Promise.resolve({ id: "project" }) }),
  };
}

test("정보수정 권한으로 세 영역을 함께 저장해도 모든 연차·사업비·수수료 금액이 유지된다", async () => {
  const h = routeHarness();
  const before = structuredClone(h.state());
  const response = await h.save({ assignedManager: "새 담당자", recipientEmail: "new@example.test", docReplyDate: "2026-09-30" });
  assert.equal(response.status, 200);
  assert.ok(h.permissions().includes("fees-info-edit"));
  const body = await response.json();
  assert.deepEqual(Object.keys(body.patches.fee), ["docReplyDate"]);
  assert.equal(JSON.parse(h.state().members[0].extraData).recipientOverrides[0].recipientEmail, "new@example.test");
  assert.equal(JSON.parse(h.state().fees[1].extraData).docReplyDate, "2026-09-30");
  assert.deepEqual(h.state().members.map((m) => [m.id, m.projectBudget]), before.members.map((m) => [m.id, m.projectBudget]));
  assert.deepEqual(h.state().fees.map((f) => [f.id, f.appliedFee]), before.fees.map((f) => [f.id, f.appliedFee]));
  assert.equal(h.state().project.totalTerms, 3);
  assert.deepEqual(JSON.parse(h.state().project.extraData).stages, JSON.parse(before.project.extraData).stages);
});

test("저장 도중 실패하면 과제만 바뀌는 부분 저장 없이 모두 롤백한다", async (t) => {
  t.mock.method(console, "error", () => {});
  const h = routeHarness({ failAudit: true });
  const before = structuredClone(h.state());
  const response = await h.save({ assignedManager: "새 담당자", recipientEmail: "new@example.test", docReplyDate: "2026-09-30" });
  assert.equal(response.status, 500);
  assert.ok(h.writes() > 0);
  assert.deepEqual(h.state(), before);
});

test("다른 연차의 수수료 ID나 누락된 기관은 저장 전에 거절한다", async () => {
  const h = routeHarness();
  assert.equal((await h.save({ docReplyDate: "" }, { feeId: "fee-3" })).status, 409);
  assert.equal((await h.save({ recipientEmail: "" }, { memberId: "missing" })).status, 409);
  assert.equal(h.writes(), 0);
});

test("정보수정 요청으로 연차 수나 사업비를 변경할 수 없다", async () => {
  const h = routeHarness();
  assert.equal((await h.save({ totalTerms: "1" })).status, 400);
  assert.equal((await h.save({ annualBudgets: "[]" })).status, 400);
  assert.equal((await h.save({ agencyAssignedAt: "2026-02-30" })).status, 400);
  assert.equal(h.writes(), 0);
});

test("회계법인 수정·삭제는 재계산 원본에도 같은 연차만 반영한다", async () => {
  const h = routeHarness();
  const before = structuredClone(h.state());
  for (const value of ["수정 법인", ""]) {
    const response = await h.save({ auditFirm: value, recipientEmail: "new@example.test" });
    assert.equal(response.status, 200);
    const { patches } = await response.json();
    assert.deepEqual(patches.annualAuditFirm, { institutionId: "institution", termNumber: 2, auditFirm: value });
    assert.equal(JSON.parse(h.state().members[1].extraData).auditFirm, value);
    assert.equal(JSON.parse(h.state().members[1].extraData).recipientOverrides[0].recipientEmail, "new@example.test");
    assert.equal(JSON.parse(h.state().members[0].extraData).auditFirm, undefined);
    assert.equal(JSON.parse(h.state().members[2].extraData).auditFirm, undefined);
    assert.deepEqual(h.state().members.map((m) => m.projectBudget), before.members.map((m) => m.projectBudget));
  }
});

test("존재하지 않는 연차와 분리청구 행의 다른 기관은 저장 전에 거절한다", async () => {
  const h = routeHarness({ split: true });
  assert.equal((await h.save({ agencyAssignedAt: "2026-09-30" }, { termNumber: 99 })).status, 409);
  h.state().fees[1] = { ...h.state().fees[1], projectTermInstitution: {
    ...h.state().members[1], institutionId: "other-institution",
  } };
  assert.equal((await h.save({ recipientEmail: "new@example.test", docReplyDate: "2026-09-30" })).status, 409);
  assert.equal(h.writes(), 0);
});

test("정보수정 권한이 없으면 데이터 변경 없이 403을 반환한다", async () => {
  const h = routeHarness({ denied: true });
  assert.equal((await h.save({ registeredAt: "2026-09-30" })).status, 403);
  assert.equal(h.writes(), 0);
});

function modalHarness(saveFeeInfo) {
  const file = path.resolve(__dirname, "../app/fees/page.tsx");
  const source = fs.readFileSync(file, "utf8");
  const ast = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const fn = ast.statements.find((s) => ts.isFunctionDeclaration(s) && s.name?.text === "InfoEditModal");
  const states = [], refs = [];
  let cursor = 0, refCursor = 0, closed = 0;
  const pending = [];
  const harness = {
    useState(initial) { const i = cursor++; if (!(i in states)) states[i] = initial; return [states[i], (v) => { states[i] = v; }]; },
    useRef(initial) { const i = refCursor++; return refs[i] ?? (refs[i] = { current: initial }); },
    useStore: () => ({ projects: [{ id: "project" }], users: [] }),
    saveFeeInfo, DateInput: () => null, ManagerPickerModal: () => null,
  };
  const { render } = compile(file, `const { useState, useRef, useStore, saveFeeInfo, DateInput, ManagerPickerModal } = require("harness");\n${fn.getText(ast)}\nexports.render = InfoEditModal;`, {
    harness, "react/jsx-runtime": require("react/jsx-runtime"),
  });
  const target = { projectId: "project", projectName: "Test", termNumber: 2, leadMemberId: "member-1", docFeeId: "fee-2",
    docRequestDate: "", docReplyDate: "", recipientName: "Name", recipientEmail: "old@example.test", researchLeadEmail: "lead@example.test",
    assignedManager: "Manager", assignedManagerPrimary: "Primary", registeredAt: "2026-01-01", agencyAssignedAt: "2026-02-01", auditFirm: "Firm" };
  function tree() { cursor = 0; refCursor = 0; return render({ target, onClose: () => closed++, onSavingChange: (v) => pending.push(v) }); }
  function nodes(node) {
    if (!node || typeof node !== "object") return [];
    if (Array.isArray(node)) return node.flatMap(nodes);
    return [node, ...nodes(node.props?.children)];
  }
  tree();
  return { closed: () => closed, pending,
    selectManager: (user) => {
      const i = states.indexOf(null); assert.ok(i >= 0); states[i] = "deputy";
      nodes(tree()).find((n) => n.type === harness.ManagerPickerModal).props.onSelect(user);
    },
    edit: (oldValue, value) => { const i = states.indexOf(oldValue); assert.ok(i >= 0); states[i] = value; },
    save: () => nodes(tree()).find((n) => n.type === "button" && n.props.children === "저장").props.onClick(),
    saveHandler: () => nodes(tree()).find((n) => n.type === "button" && n.props.children === "저장").props.onClick,
    alerts: () => nodes(tree()).filter((n) => n.props?.role === "alert").map((n) => n.props.children),
    values: () => states,
  };
}

test("저장 실패 시 수정 창과 입력값을 유지하고 오류를 보여준다", async () => {
  let sent;
  const h = modalHarness(async (_id, request) => { sent = request; throw new Error("서버 저장 실패"); });
  h.edit("old@example.test", "new@example.test");
  await h.save();
  assert.equal(h.closed(), 0);
  assert.deepEqual(h.alerts(), ["서버 저장 실패"]);
  assert.ok(h.values().includes("new@example.test"));
  assert.deepEqual(sent.changes, { recipientEmail: "new@example.test" });
  assert.deepEqual(h.pending, [true, false]);
});

test("서버 응답 전에는 창을 닫지 않고 저장 성공 후에만 닫는다", async () => {
  let finish;
  const h = modalHarness(() => new Promise((resolve) => { finish = resolve; }));
  h.edit("old@example.test", "new@example.test");
  const save = h.save();
  assert.equal(h.closed(), 0);
  finish();
  await save;
  assert.equal(h.closed(), 1);
});

test("동명이인 계정을 다시 선택해도 담당자 ID 변경을 저장한다", async () => {
  let sent;
  const h = modalHarness(async (_id, request) => { sent = request; });
  h.selectManager({ id: "different-user", name: "Manager" });
  await h.save();
  assert.deepEqual(sent.changes, { assignedManager: "Manager", assignedManagerUserId: "different-user" });
});

test("저장 버튼 중복 클릭은 한 번만 전송하고 실패 후 재시도할 수 있다", async () => {
  let calls = 0, reject;
  const h = modalHarness(() => {
    calls++;
    return calls === 1 ? new Promise((_resolve, fail) => { reject = fail; }) : Promise.resolve();
  });
  h.edit("old@example.test", "new@example.test");
  const save = h.saveHandler();
  const first = save();
  await save();
  assert.equal(calls, 1);
  reject(new Error("저장 실패"));
  await first;
  assert.equal(h.closed(), 0);
  await h.save();
  assert.equal(calls, 2);
  assert.equal(h.closed(), 1);
});
