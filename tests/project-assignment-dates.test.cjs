/* eslint-disable @typescript-eslint/no-require-imports */
require("tsx/cjs");
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const Module = require("node:module");
const ts = require("typescript");
const { buildAssignmentDateUpdate } = require("../lib/project-assignment-dates.ts");
const { toProject } = require("../lib/project-mapper.ts");
const { resolveAgencyAssignedAtForTerm, resolveInternalAssignedAtForTerm } = require("../lib/fee-calculator.ts");

// 실제 전송처럼 JSON 왕복 후 병합해 undefined 때문에 삭제 요청이 사라지는 회귀도 검사한다.
const persisted = (project, patch) => ({ ...project, ...JSON.parse(JSON.stringify(patch)) });

for (const [field, historyField, resolve] of [
  ["agencyAssignedAt", "agencyAssignedAtHistory", resolveAgencyAssignedAtForTerm],
  ["internalAssignedAt", "internalAssignedAtHistory", resolveInternalAssignedAtForTerm],
]) {
  const initial = () => ({
    currentTerm: 2,
    [field]: "2026-03-01",
    [historyField]: [{ termNumber: 1, [field]: "2025-03-01" }],
  });
  const edit = (project, term, value) => persisted(project, buildAssignmentDateUpdate(project, field, term, value, [1, 2, 3]));

  test(`${field}: 진행 연차 수정은 이미 존재하는 과거·미래 연차 값을 보존한다`, () => {
    const after = edit(initial(), 2, "2026-09-30");
    assert.equal(resolve(after, 1), "2025-03-01");
    assert.equal(resolve(after, 2), "2026-09-30");
    assert.equal(resolve(after, 3), "2026-03-01");
    assert.equal(resolve(after, 4), "2026-09-30");
  });

  test(`${field}: 과거 연차 수정은 해당 연차만 변경한다`, () => {
    const after = edit(initial(), 1, "2025-05-01");
    assert.equal(resolve(after, 1), "2025-05-01");
    assert.equal(resolve(after, 2), "2026-03-01");
    assert.equal(resolve(after, 3), "2026-03-01");
  });

  test(`${field}: 진행 연차 날짜를 비워도 서버 저장 후 빈 값이 유지된다`, () => {
    const after = edit(initial(), 2, "");
    assert.equal(resolve(after, 2), "");
    assert.equal(resolve(after, 1), "2025-03-01");
    assert.equal(resolve(after, 3), "2026-03-01");
  });

  test(`${field}: 과거 연차 날짜 삭제는 기본 날짜로 되돌아가지 않는다`, () => {
    const after = edit(initial(), 1, "");
    assert.equal(resolve(after, 1), "");
    assert.equal(resolve(after, 2), "2026-03-01");
  });

  test(`${field}: 마지막 이력을 기본 날짜로 되돌리면 빈 배열이 전송된다`, () => {
    const after = edit(initial(), 1, "2026-03-01");
    assert.deepEqual(after[historyField], []);
    assert.equal(resolve(after, 1), "2026-03-01");
  });

  test(`${field}: 진행 연차의 엑셀 이력을 기본 날짜로 되돌릴 수 있다`, () => {
    const project = { ...initial(), [historyField]: [{ termNumber: 2, [field]: "2026-04-01" }] };
    const after = persisted(project, buildAssignmentDateUpdate(project, field, 2, "2026-03-01", [2]));
    assert.deepEqual(after[historyField], []);
    assert.equal(resolve(after, 2), "2026-03-01");
  });

  test(`${field}: 다른 항목만 수정하면 기존 연차 이력을 건드리지 않는다`, () => {
    const project = { ...initial(), [historyField]: [{ termNumber: 2, [field]: "2026-04-01" }] };
    assert.deepEqual(buildAssignmentDateUpdate(project, field, 2, "2026-04-01", [1, 2, 3]), {});
    const after = edit(project, 2, "2026-05-01");
    assert.deepEqual(buildAssignmentDateUpdate(after, field, 2, "2026-05-01", [1, 2, 3]), {});
  });

  // TermFee는 연차당 한 행이 아니라 참여기관마다 한 행이라(project_term_institution 기준),
  // 실제 화면(app/projects/[id]/page.tsx)이 넘기는 existingTermNumbers는 참여기관이 여러 곳인
  // 과제에서 같은 연차 번호가 여러 번 반복된다 — 백필이 그 중복 횟수만큼 같은 연차 항목을 또
  // 만들어내면 안 된다.
  test(`${field}: 참여기관이 여러 곳이라 연차 번호가 중복돼 들어와도 연차당 항목은 하나만 생긴다`, () => {
    const after = persisted(initial(), buildAssignmentDateUpdate(initial(), field, 2, "2026-09-30", [1, 1, 1, 2, 2, 2, 3, 3, 3]));
    assert.deepEqual(after[historyField].filter((h) => h.termNumber === 1), [{ termNumber: 1, [field]: "2025-03-01" }]);
    assert.deepEqual(after[historyField].filter((h) => h.termNumber === 3), [{ termNumber: 3, [field]: "2026-03-01" }]);
  });
}

function projectRow(extra = {}) {
  return {
    id: "test-project", projectNumber: "TEST-1", projectName: "테스트",
    startYear: 2025, endYear: 2026, totalTerms: 2, status: "ACTIVE",
    createdAt: new Date("2026-03-01T16:00:00Z"), extraData: JSON.stringify(extra),
  };
}

function loadPatchRoute(row) {
  const file = path.resolve(__dirname, "../app/api/projects/[id]/route.ts");
  const instance = new Module(file, module);
  instance.filename = file;
  instance.paths = Module._nodeModulePaths(path.dirname(file));
  const mocks = {
    "@/lib/db": {
      prisma: {
        project: { findUnique: async () => row },
        $transaction: async (fn) => fn({ project: { update: async ({ data }) => Object.assign(row, data) } }),
      },
      withDbWriteSlot: (fn) => fn(), withDeadlockRetry: (fn) => fn(),
      describeDbWriteError: () => "저장 실패",
    },
    "@/lib/session": { requireWriteAccess: async () => ({ userId: "test-user" }), SessionError: class extends Error {} },
    "@/lib/project-mapper": { toProject },
    "@/lib/audit": { writeAuditLog: async () => {} },
    "@/lib/project-program-guard": {},
  };
  instance.require = (id) => {
    assert.ok(Object.hasOwn(mocks, id), `Unexpected dependency: ${id}`);
    return mocks[id];
  };
  instance._compile(ts.transpileModule(fs.readFileSync(file, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText, file);
  return instance.exports.PATCH;
}

test("등록일 미수정 과제는 기존 KST 생성일을 표시하고, 명시적 삭제는 빈 값으로 표시한다", () => {
  assert.equal(toProject(projectRow()).registeredAt, "2026-03-02");
  assert.equal(toProject(projectRow({ registeredAt: "" })).registeredAt, "");
});

test("실제 PATCH 경로가 배정일 수정·삭제와 등록일을 보존하고 생성시각은 유지한다", async () => {
  const row = projectRow({ currentTerm: 2, agencyAssignedAt: "2026-03-01", researchLead: "기존 책임자" });
  const originalCreatedAt = row.createdAt.toISOString();
  const PATCH = loadPatchRoute(row);
  for (const value of ["2026-09-30", ""]) {
    const patch = {
      ...buildAssignmentDateUpdate(toProject(row), "agencyAssignedAt", 2, value, [1, 2]),
      registeredAt: value,
    };
    const response = await PATCH(new Request("http://localhost/api/projects/test-project", {
      method: "PATCH", body: JSON.stringify(patch),
    }), { params: Promise.resolve({ id: row.id }) });
    assert.equal(response.status, 200);
    const result = await response.json();
    assert.equal(result.ok, true);
    assert.equal(resolveAgencyAssignedAtForTerm(result.project, 2), value);
    assert.equal(resolveAgencyAssignedAtForTerm(result.project, 1), "2026-03-01");
    assert.equal(toProject(row).registeredAt, value);
    assert.equal(result.project.createdAt, originalCreatedAt);
    assert.equal(result.project.researchLead, "기존 책임자");
  }
});
