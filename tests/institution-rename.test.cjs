/* eslint-disable @typescript-eslint/no-require-imports */
// 기관명 정정(같은 기관 ID의 이름만 바꾸기) 회귀 테스트 — 실제 DB/브라우저 없이 현재 TypeScript 코드를 돌린다.
//  - 규칙(lib/institution-name.ts): 이름 검증, 전담기관 소속기관 목록의 이름 교체.
//  - 서버(app/api/institutions/[id]): 과제에 복사된 주관기관명·소속기관 목록을 같은 트랜잭션에서 함께 맞춘다.
//  - 화면(lib/store.ts): 저장에 실패하면 기관명뿐 아니라 함께 바꿨던 과제·수금 등의 이름과 소속기관 목록도 서버 값으로 돌아온다.
require("tsx/cjs");
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const Module = require("node:module");
const ts = require("typescript");

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

const rules = require("../lib/institution-name.ts");
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const INST = "22222222-2222-2222-2222-22222222aaaa";
const OTHER_INST = "33333333-3333-3333-3333-33333333bbbb";
const tick = () => new Promise((resolve) => setTimeout(resolve, 1));

// ── 규칙 ─────────────────────────────────────────────────────────

test("institution names are trimmed and blank or over-long names are rejected", () => {
  assert.deepEqual(rules.validateInstitutionName("  국립원예특작과학원 "), { ok: true, name: "국립원예특작과학원" });
  assert.equal(rules.validateInstitutionName("").ok, false);
  assert.equal(rules.validateInstitutionName("   \t ").ok, false);
  assert.equal(rules.validateInstitutionName(undefined).ok, false);
  assert.equal(rules.validateInstitutionName("가".repeat(200)).ok, true);
  const tooLong = rules.validateInstitutionName("가".repeat(201));
  assert.equal(tooLong.ok, false);
  assert.match(tooLong.error, /200자/);
  assert.equal(rules.validateInstitutionName(` ${"가".repeat(200)} `).ok, true, "앞뒤 공백은 길이에 넣지 않는다");
});

test("affiliated names swap the old name in place, or keep it when another institution still uses it", () => {
  assert.deepEqual(rules.renameInAffiliatedNames(["A", "Old", "B"], "Old", "New", false), ["A", "New", "B"]);
  assert.deepEqual(rules.renameInAffiliatedNames(["A", "Old", "B"], "Old", "New", true), ["A", "Old", "New", "B"]);
  assert.deepEqual(rules.renameInAffiliatedNames(["New", "Old"], "Old", "New", false), ["New"], "이미 있는 새 이름은 중복으로 넣지 않는다");
  assert.equal(rules.renameInAffiliatedNames(["A", "B"], "Old", "New", false), null, "목록에 없는 기관이면 바꾸지 않는다");
  assert.equal(rules.renameInAffiliatedNames(["Old "], "Old", "New", false), null, "정확히 일치하는 이름만 바꾼다(판정 기준과 동일)");
  assert.equal(rules.renameInAffiliatedNames(["Old"], "Old", "Old", false), null);
  assert.equal(rules.renameInAffiliatedNames(["Old", "New"], "Old", "New", true), null, "바뀌는 것이 없으면 null");
});

test("a new name that another agency already lists is reported before saving", () => {
  const agencies = [
    { id: "rda1", autoDetectByLeadInstitution: false, affiliatedInstitutionNames: ["New"] },
    { id: "rda2", autoDetectByLeadInstitution: true, affiliatedInstitutionNames: ["New"] },
    { id: "rda3", autoDetectByLeadInstitution: true, affiliatedInstitutionNames: ["Old", "New"] },
  ];
  assert.deepEqual(rules.findAgenciesNewlyMatchingName(agencies, "Old", "New").map((a) => a.id), ["rda2"]);
  assert.deepEqual(rules.findAgenciesNewlyMatchingName(agencies, "Old", "Old"), []);
});

// ── 서버 ─────────────────────────────────────────────────────────

function institutionRow(id, name) {
  return {
    id, institutionName: name, institutionType: "중소기업", businessNumber: null, representativeName: null,
    phone: null, email: null, isActive: true, notes: null, createdAt: new Date("2026-01-01T00:00:00Z"),
  };
}

function project(id, extra) {
  return { id, extraData: JSON.stringify(extra) };
}

// 모든 조회·쓰기가 한 틱씩 양보해서, 잠금이 없으면 동시 요청이 실제로 끼어든다. SQL Server처럼 트랜잭션
// 안에서 그 기관 행을 UPDATE하면 배타 잠금을 잡고, 트랜잭션이 끝날 때까지 다른 트랜잭션의 같은 행 UPDATE를 기다리게 한다.
function fakeDb({ institutions, projects = [], agencies = [] }) {
  const state = { institutions, projects, agencies, projectUpdates: [], agencyUpdates: [] };
  const locks = new Map();
  const withContacts = (i) => (i ? { ...i, contacts: [] } : null);
  const findInst = (id) => state.institutions.find((i) => i.id === id);
  const makeClient = (held) => {
    // 이 트랜잭션이 아직 잡지 않은 행이면, 다른 트랜잭션이 놓을 때까지 기다렸다가 잡는다.
    const lockRow = async (id) => {
      if (held.some((h) => h.id === id)) return;
      while (locks.has(id)) await locks.get(id);
      let release;
      locks.set(id, new Promise((resolve) => { release = () => { locks.delete(id); resolve(); }; }));
      held.push({ id, release });
    };
    return {
      institution: {
        findUnique: async ({ where }) => { await tick(); return withContacts(findInst(where.id)); },
        findUniqueOrThrow: async ({ where }) => {
          await tick();
          const inst = findInst(where.id);
          if (!inst) throw new Error("not found");
          return withContacts(inst);
        },
        updateMany: async ({ where, data }) => {
          await tick();
          await lockRow(where.id);
          const inst = findInst(where.id);
          if (!inst) return { count: 0 };
          Object.assign(inst, data);
          return { count: 1 };
        },
        update: async ({ where, data }) => {
          await tick();
          await lockRow(where.id);
          const inst = findInst(where.id);
          for (const [k, v] of Object.entries(data)) if (v !== undefined) inst[k] = v;
          return inst;
        },
        count: async ({ where }) => {
          await tick();
          return state.institutions.filter((i) => i.id !== where.id.not && i.institutionName === where.institutionName).length;
        },
      },
      institutionContact: { update: async () => {}, create: async () => {} },
      project: {
        findMany: async ({ where }) => {
          await tick();
          return state.projects
            .filter((p) => where.OR.some((c) => (p.extraData ?? "").includes(c.extraData.contains)))
            .map((p) => ({ id: p.id, extraData: p.extraData }));
        },
        update: async ({ where, data }) => {
          await tick();
          const p = state.projects.find((x) => x.id === where.id);
          p.extraData = data.extraData;
          state.projectUpdates.push(where.id);
          return p;
        },
      },
      fundingAgency: {
        findMany: async () => {
          await tick();
          return state.agencies.filter((a) => a.affiliatedInstitutionNames !== null).map((a) => ({ ...a }));
        },
        update: async ({ where, data }) => {
          await tick();
          const a = state.agencies.find((x) => x.id === where.id);
          a.affiliatedInstitutionNames = data.affiliatedInstitutionNames;
          state.agencyUpdates.push(where.id);
          return a;
        },
      },
    };
  };
  const $transaction = async (fn) => {
    const held = [];
    try {
      return await fn(makeClient(held));
    } finally {
      held.forEach((h) => h.release());
    }
  };
  return { state, prisma: { ...makeClient([]), $transaction } };
}

function loadRoute(db) {
  const audits = [];
  const invalidated = [];
  const route = loadTypeScript("app/api/institutions/[id]/route.ts", {
    "@/lib/db": { prisma: db.prisma, withDbWriteSlot: (fn) => fn(), withDeadlockRetry: (fn) => fn(), describeDbWriteError: (_e, f) => f },
    "@/lib/session": {
      SessionError: class extends Error {},
      requireWriteAccess: async () => ({ userId: "user" }),
      requireUser: async () => ({ userId: "user" }),
    },
    "@/lib/audit": { writeAuditLog: async (_tx, params) => { audits.push(params); }, UUID_RE },
    "@/lib/server-cache": { invalidateCache: (key) => invalidated.push(key), INSTITUTIONS_CACHE_KEY: "institutions", FUNDING_AGENCIES_CACHE_KEY: "funding-agencies" },
    "@/lib/institution-mapper": require("../lib/institution-mapper.ts"),
    "@/lib/institution-name": rules,
  });
  const patch = async (body, id = INST) => {
    const res = await route.PATCH(new Request("http://localhost", { method: "PATCH", body: JSON.stringify(body) }), { params: Promise.resolve({ id }) });
    return { status: res.status, body: await res.json() };
  };
  return { patch, audits, invalidated };
}

const extraOf = (db, id) => JSON.parse(db.state.projects.find((p) => p.id === id).extraData);
const namesOf = (db, id) => JSON.parse(db.state.agencies.find((a) => a.id === id).affiliatedInstitutionNames);

test("renaming an institution also updates the lead name copied into its projects and the affiliated list", async () => {
  const db = fakeDb({
    institutions: [institutionRow(INST, "국립원예특작과학원")],
    projects: [
      project("p-lower", { leadInstitutionId: INST, leadInstitutionName: "국립원예특작과학원", totalBudget: 10 }),
      project("p-upper", { leadInstitutionId: INST.toUpperCase(), leadInstitutionName: "국립원예특작과학원" }),
      project("p-other", { leadInstitutionId: OTHER_INST, leadInstitutionName: "다른기관", note: `참고 ${INST}` }),
    ],
    agencies: [
      { id: "rda2", name: "농촌진흥청", affiliatedInstitutionNames: JSON.stringify(["국립원예특작과학원", "국립식량과학원"]) },
      { id: "keit", name: "KEIT", affiliatedInstitutionNames: null },
    ],
  });
  const api = loadRoute(db);

  const res = await api.patch({ name: "  국립원예특작과학원(정정)  " });
  assert.equal(res.status, 200);
  assert.equal(res.body.institution.name, "국립원예특작과학원(정정)", "앞뒤 공백을 지워 저장한다");
  assert.equal(db.state.institutions[0].institutionName, "국립원예특작과학원(정정)");

  assert.equal(extraOf(db, "p-lower").leadInstitutionName, "국립원예특작과학원(정정)");
  assert.equal(extraOf(db, "p-lower").totalBudget, 10, "다른 extra_data 값은 그대로 둔다");
  assert.equal(extraOf(db, "p-upper").leadInstitutionName, "국립원예특작과학원(정정)", "id 대소문자가 달라도 같은 기관이다");
  assert.equal(extraOf(db, "p-other").leadInstitutionName, "다른기관", "id 문자열만 들어 있는 다른 기관의 과제는 건드리지 않는다");

  assert.deepEqual(namesOf(db, "rda2"), ["국립원예특작과학원(정정)", "국립식량과학원"]);
  assert.deepEqual(res.body.fundingAgencies, [{ id: "rda2", affiliatedInstitutionNames: ["국립원예특작과학원(정정)", "국립식량과학원"] }]);
  assert.equal(Object.hasOwn(res.body.fundingAgencies[0], "noticeSenderMailPassword"), false, "전담기관 레코드 전체를 내려보내지 않는다");
  assert.ok(api.audits.some((a) => a.entityType === "fundingAgency" && a.entityId === "rda2"), "소속기관 목록 변경도 감사로그에 남긴다");
  assert.deepEqual(api.invalidated.sort(), ["funding-agencies", "institutions"]);
});

test("the old name stays in the affiliated list while another institution still uses it", async () => {
  const db = fakeDb({
    institutions: [institutionRow(INST, "동명기관"), institutionRow(OTHER_INST, "동명기관")],
    agencies: [{ id: "rda2", name: "농촌진흥청", affiliatedInstitutionNames: JSON.stringify(["동명기관"]) }],
  });
  const res = await loadRoute(db).patch({ name: "새이름" });
  assert.equal(res.status, 200);
  assert.deepEqual(namesOf(db, "rda2"), ["동명기관", "새이름"]);
});

test("two renames of the same institution at the same time leave the affiliated list matching the final name", async () => {
  const db = fakeDb({
    institutions: [institutionRow(INST, "A")],
    projects: [project("p1", { leadInstitutionId: INST, leadInstitutionName: "A" })],
    agencies: [{ id: "rda2", name: "농촌진흥청", affiliatedInstitutionNames: JSON.stringify(["A", "국립식량과학원"]) }],
  });
  const api = loadRoute(db);
  const results = await Promise.all([api.patch({ name: "B" }), api.patch({ name: "C" })]);
  assert.deepEqual(results.map((r) => r.status), [200, 200]);
  const finalName = db.state.institutions[0].institutionName;
  assert.deepEqual(namesOf(db, "rda2"), [finalName, "국립식량과학원"], "뒤 요청은 앞 요청이 바꾼 이름을 옛 이름으로 보고 목록을 고친다");
  assert.equal(extraOf(db, "p1").leadInstitutionName, finalName);
});

test("renaming an institution that does not exist returns 404", async () => {
  const db = fakeDb({ institutions: [institutionRow(INST, "A")] });
  const res = await loadRoute(db).patch({ name: "B" }, OTHER_INST);
  assert.equal(res.status, 404);
  assert.equal(db.state.institutions[0].institutionName, "A");
});

test("blank or over-long names are rejected without touching anything", async () => {
  for (const name of ["", "    ", "가".repeat(201)]) {
    const db = fakeDb({
      institutions: [institutionRow(INST, "원래이름")],
      projects: [project("p1", { leadInstitutionId: INST, leadInstitutionName: "원래이름" })],
      agencies: [{ id: "rda2", name: "농촌진흥청", affiliatedInstitutionNames: JSON.stringify(["원래이름"]) }],
    });
    const api = loadRoute(db);
    const res = await api.patch({ name });
    assert.equal(res.status, 400, JSON.stringify(name));
    assert.equal(res.body.ok, false);
    assert.equal(db.state.institutions[0].institutionName, "원래이름");
    assert.deepEqual(db.state.projectUpdates, []);
    assert.deepEqual(db.state.agencyUpdates, []);
    assert.deepEqual(api.invalidated, []);
  }
});

test("saving the same name repairs a stale project copy but leaves the affiliated list alone", async () => {
  const db = fakeDb({
    institutions: [institutionRow(INST, "현재이름")],
    projects: [
      project("p-stale", { leadInstitutionId: INST, leadInstitutionName: "예전이름" }),
      project("p-ok", { leadInstitutionId: INST, leadInstitutionName: "현재이름" }),
    ],
    agencies: [{ id: "rda2", name: "농촌진흥청", affiliatedInstitutionNames: JSON.stringify(["예전이름"]) }],
  });
  const res = await loadRoute(db).patch({ name: "현재이름", contactPhone: "02-000-0000" });
  assert.equal(res.status, 200);
  assert.equal(extraOf(db, "p-stale").leadInstitutionName, "현재이름");
  assert.deepEqual(db.state.projectUpdates, ["p-stale"], "이미 맞는 과제는 다시 쓰지 않는다");
  assert.deepEqual(db.state.agencyUpdates, [], "이름이 실제로 바뀌지 않았으면 소속기관 목록은 그대로");
});

test("an update without a name does not touch project copies or affiliated lists", async () => {
  const db = fakeDb({
    institutions: [institutionRow(INST, "현재이름")],
    projects: [project("p-stale", { leadInstitutionId: INST, leadInstitutionName: "예전이름" })],
    agencies: [{ id: "rda2", name: "농촌진흥청", affiliatedInstitutionNames: JSON.stringify(["현재이름"]) }],
  });
  const res = await loadRoute(db).patch({ note: "메모" });
  assert.equal(res.status, 200);
  assert.deepEqual(db.state.projectUpdates, []);
  assert.deepEqual(db.state.agencyUpdates, []);
  assert.deepEqual(res.body.fundingAgencies, []);
});

// ── 화면(lib/store.ts) ───────────────────────────────────────────

function loadStore() {
  return loadTypeScript("lib/store.ts", {}, `
    export function inspectForTest(patch?: Partial<StoreState>) {
      if (patch) _state = { ..._state, ...patch };
      return { state: _state };
    }
    export function institutionWritesForTest(id: string) {
      return _institutionWriteChain.get(id) ?? Promise.resolve();
    }
  `);
}

function controlledNetwork(t) {
  const requests = [];
  t.mock.method(globalThis, "fetch", (url, init) => new Promise((resolve, reject) => {
    requests.push({
      url, method: init?.method ?? "GET", body: init?.body ? JSON.parse(init.body) : undefined, responded: false,
      respond(body) { this.responded = true; resolve({ json: async () => body }); },
      fail() { this.responded = true; reject(new TypeError("Failed to fetch")); },
    });
  }));
  t.after(() => {
    const unresolved = requests.filter((r) => !r.responded);
    for (const r of unresolved) r.respond({ ok: false, error: "test left this request unanswered" });
    assert.equal(unresolved.length, 0, `응답 없이 끝난 요청: ${unresolved.map((r) => `${r.method} ${r.url}`).join(", ")}`);
  });
  return requests;
}

async function until(predicate) {
  for (let i = 0; i < 100; i++) {
    if (predicate()) return;
    await tick();
  }
  assert.fail("Expected request/state did not arrive");
}
const settle = async () => { for (let i = 0; i < 5; i++) await tick(); };

function inst(name) {
  return {
    id: INST, name, type: "중소기업", bizNumber: "123-45-67890", representativeName: "", contactName: "",
    contactEmail: "", contactPhone: "", registeredAt: "2026-01-01", status: "ACTIVE",
  };
}

function seedStore(t, { otherSameName = false } = {}) {
  t.mock.method(console, "error", () => {});
  const store = loadStore();
  store.inspectForTest({
    institutions: [inst("옛이름"), ...(otherSameName ? [{ ...inst("옛이름"), id: OTHER_INST }] : [])],
    projects: [{ id: "p1", projectNumber: "P-1", leadInstitutionId: INST, leadInstitutionName: "옛이름" }],
    projectMembers: [{ id: "m1", projectId: "p1", projectNumber: "P-1", institutionId: INST, institutionName: "옛이름", role: "LEAD" }],
    termFees: [{ id: "f1", projectNumber: "P-1", institutionId: INST, institutionName: "옛이름" }],
    receivables: [{ id: "r1", projectNumber: "P-1", leadInstitutionId: INST, leadInstitutionName: "옛이름" }],
    taxInvoices: [{ id: "t1", projectNumber: "P-1", leadInstitutionId: INST, leadInstitutionName: "옛이름" }],
    fundingAgencies: [{ id: "rda2", name: "농촌진흥청", shortName: "RDA2", autoDetectByLeadInstitution: true, affiliatedInstitutionNames: ["옛이름", "국립식량과학원"] }],
  });
  const notices = [];
  store.subscribeSyncNotice((message) => notices.push(message));
  const state = () => store.inspectForTest().state;
  const shownNames = () => ({
    institution: state().institutions.find((i) => i.id === INST).name,
    project: state().projects[0].leadInstitutionName,
    member: state().projectMembers[0].institutionName,
    termFee: state().termFees[0].institutionName,
    receivable: state().receivables[0].leadInstitutionName,
    taxInvoice: state().taxInvoices[0].leadInstitutionName,
  });
  const allNamed = (name) => ({ institution: name, project: name, member: name, termFee: name, receivable: name, taxInvoice: name });
  const affiliated = () => state().fundingAgencies[0].affiliatedInstitutionNames;
  return { store, notices, shownNames, allNamed, affiliated };
}

test("a rename is shown everywhere at once and kept when the server accepts it", async (t) => {
  const requests = controlledNetwork(t);
  const { store, notices, shownNames, allNamed, affiliated } = seedStore(t);

  store.updateInstitution(INST, { name: "  새이름 " });
  assert.deepEqual(shownNames(), allNamed("새이름"));
  assert.deepEqual(affiliated(), ["새이름", "국립식량과학원"], "응답 전에 과제를 저장해도 전담기관 판정이 유지되게 미리 반영한다");

  await until(() => requests.length === 1);
  assert.equal(requests[0].method, "PATCH");
  assert.deepEqual(requests[0].body, { name: "새이름" }, "앞뒤 공백을 지운 이름을 보낸다");
  requests[0].respond({ ok: true, institution: inst("새이름"), fundingAgencies: [{ id: "rda2", affiliatedInstitutionNames: ["새이름", "국립식량과학원"] }] });
  await store.institutionWritesForTest(INST);
  assert.deepEqual(shownNames(), allNamed("새이름"));
  assert.deepEqual(affiliated(), ["새이름", "국립식량과학원"]);
  assert.deepEqual(notices, []);
});

test("a rejected rename restores the server name on every copy and the affiliated list", async (t) => {
  const requests = controlledNetwork(t);
  const { store, notices, shownNames, allNamed, affiliated } = seedStore(t);

  store.updateInstitution(INST, { name: "새이름" });
  await until(() => requests.length === 1);
  requests[0].respond({ ok: false, error: "이 작업을 수행할 권한이 없습니다." });
  await until(() => requests.length === 2);
  assert.equal(requests[1].method, "GET");
  assert.match(requests[1].url, new RegExp(`/api/institutions/${INST}$`));
  requests[1].respond({ ok: true, institution: inst("옛이름") });
  await store.institutionWritesForTest(INST);

  assert.deepEqual(shownNames(), allNamed("옛이름"), "과제·참여기관·연차수수료·수금·세금계산서 이름까지 서버 값으로 돌아온다");
  assert.deepEqual(affiliated(), ["옛이름", "국립식량과학원"]);
  assert.equal(notices.length, 1);
  assert.match(notices[0], /되돌렸습니다/);
  assert.match(notices[0], /권한/);
});

test("when the server value cannot be reloaded either, the screen falls back to the name before editing", async (t) => {
  const requests = controlledNetwork(t);
  const { store, notices, shownNames, allNamed, affiliated } = seedStore(t);

  store.updateInstitution(INST, { name: "새이름" });
  await until(() => requests.length === 1);
  requests[0].fail();
  await until(() => requests.length === 2);
  requests[1].fail();
  await store.institutionWritesForTest(INST);

  assert.deepEqual(shownNames(), allNamed("옛이름"));
  assert.deepEqual(affiliated(), ["옛이름", "국립식량과학원"]);
  assert.equal(notices.length, 1);
  assert.match(notices[0], /새로고침/);
});

test("a blank name is not applied or sent", async (t) => {
  const requests = controlledNetwork(t);
  const { store, notices, shownNames, allNamed } = seedStore(t);

  store.updateInstitution(INST, { name: "   " });
  await settle();
  assert.equal(requests.length, 0);
  assert.deepEqual(shownNames(), allNamed("옛이름"));
  assert.equal(notices.length, 1);
  assert.match(notices[0], /기관명을 입력/);
});

test("the old name stays in the affiliated list on screen while another institution still uses it", async (t) => {
  const requests = controlledNetwork(t);
  const { store, affiliated } = seedStore(t, { otherSameName: true });

  store.updateInstitution(INST, { name: "새이름" });
  assert.deepEqual(affiliated(), ["옛이름", "새이름", "국립식량과학원"]);
  await until(() => requests.length === 1);
  requests[0].respond({ ok: true, institution: inst("새이름"), fundingAgencies: [{ id: "rda2", affiliatedInstitutionNames: ["옛이름", "새이름", "국립식량과학원"] }] });
  await store.institutionWritesForTest(INST);
});

test("consecutive renames are saved in order and an earlier failure does not undo the later name", async (t) => {
  const requests = controlledNetwork(t);
  const { store, notices, shownNames, allNamed, affiliated } = seedStore(t);

  store.updateInstitution(INST, { name: "이름1" });
  store.updateInstitution(INST, { name: "이름2" });
  assert.deepEqual(shownNames(), allNamed("이름2"));
  await until(() => requests.length === 1);
  await settle();
  assert.equal(requests.length, 1, "앞 요청의 응답 전에는 다음 요청을 보내지 않는다");

  requests[0].respond({ ok: false, error: "서버 오류" });
  await until(() => requests.length === 2);
  assert.deepEqual(requests[1].body, { name: "이름2" });
  assert.deepEqual(shownNames(), allNamed("이름2"), "실패한 앞 요청이 뒤 요청의 이름을 되돌리지 않는다");
  assert.equal(notices.length, 1);

  requests[1].respond({ ok: true, institution: inst("이름2"), fundingAgencies: [{ id: "rda2", affiliatedInstitutionNames: ["이름2", "국립식량과학원"] }] });
  await store.institutionWritesForTest(INST);
  assert.deepEqual(shownNames(), allNamed("이름2"));
  assert.deepEqual(affiliated(), ["이름2", "국립식량과학원"]);
});
