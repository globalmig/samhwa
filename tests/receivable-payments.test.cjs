/* eslint-disable @typescript-eslint/no-require-imports */
// 분할 수금(차수별 입금 추가·삭제)의 회귀 테스트 — 실제 DB/브라우저 없이 현재 TypeScript 코드에
// 동시 요청·지연·실패 응답을 주입한다.
//  - 서버: 같은 채권에 동시에 들어온 입금 추가·삭제·누적액 수정이 납부액과 입금 내역을 어긋나게 하지 않는다.
//  - 화면(lib/store.ts): 연속 저장의 응답이 늦게·뒤바뀌어 와도 최신 값을 덮어쓰지 않고, 실패하면 서버 값으로 돌아온다.
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

const RV = "11111111-1111-1111-1111-111111111111";
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const tick = () => new Promise((resolve) => setTimeout(resolve, 1));

// ── 서버 ─────────────────────────────────────────────────────────

// 채권 한 건을 가진 가짜 DB. 모든 조회·쓰기가 한 틱씩 양보해서, 잠금이 없으면 동시 요청이 실제로 끼어든다.
// SQL Server처럼 트랜잭션 안에서 그 행을 UPDATE하면 배타 잠금을 잡고 커밋/롤백 때까지 다른 트랜잭션의
// 같은 행 UPDATE를 기다리게 하며, 실패한 트랜잭션은 잠금을 잡은 뒤의 변경을 되돌린다.
function fakeDb({ billed, collected, histories = [] }) {
  let seq = 0;
  const newId = () => `00000000-0000-0000-0000-${String(++seq).padStart(12, "0")}`;
  const state = {
    receivable: {
      id: RV, projectTermInstitutionId: "pti", billedAmount: BigInt(billed), collectedAmount: BigInt(collected),
      outstandingAmount: BigInt(Math.max(0, billed - collected)), dueDate: null, isLongOverdue: true,
      status: "OUTSTANDING", createdAt: new Date("2026-01-01"), updatedAt: new Date("2026-01-01"),
    },
    histories: histories.map((h) => ({
      id: newId(), receivableId: RV, paymentDate: new Date(h.date), paymentAmount: BigInt(h.amount), createdAt: new Date(),
    })),
  };
  let lockTail = Promise.resolve();
  const full = () => ({
    ...state.receivable,
    paymentHistories: state.histories.map((h) => ({ ...h })),
    projectTermInstitution: {
      id: "pti", institutionId: "inst",
      projectTerm: { termYear: 2026, termNumber: 1, project: { projectNumber: "P-1", projectName: "Test" } },
      institution: { institutionName: "Inst" },
    },
  });
  const snapshot = () => ({ receivable: { ...state.receivable }, histories: state.histories.map((h) => ({ ...h })) });

  function makeTx(tx) {
    return {
      receivable: {
        async updateMany({ where, data }) {
          const prev = lockTail;
          let release;
          const mine = new Promise((resolve) => { release = resolve; });
          lockTail = prev.then(() => mine);
          await prev;
          tx.release = release;
          tx.rollback = snapshot();
          await tick();
          if (where.id !== RV) return { count: 0 };
          Object.assign(state.receivable, data);
          return { count: 1 };
        },
        async findUniqueOrThrow({ where }) {
          await tick();
          if (where.id !== RV) throw new Error("not found");
          return full();
        },
        async update({ data }) {
          await tick();
          for (const [k, v] of Object.entries(data)) if (v !== undefined) state.receivable[k] = v;
          return { ...state.receivable };
        },
      },
      paymentHistory: {
        async create({ data }) {
          await tick();
          state.histories.push({ id: newId(), createdAt: new Date(), ...data });
        },
        async delete({ where }) {
          await tick();
          const i = state.histories.findIndex((h) => h.id === where.id);
          if (i < 0) throw new Error("P2025: record to delete does not exist");
          state.histories.splice(i, 1);
        },
        async deleteMany() {
          await tick();
          state.histories = [];
        },
      },
      taxInvoice: { async findMany() { return []; } },
      auditLog: { async create() {} },
    };
  }

  const prisma = {
    async $transaction(fn) {
      const tx = {};
      try {
        return await fn(makeTx(tx));
      } catch (err) {
        if (tx.rollback) { state.receivable = tx.rollback.receivable; state.histories = tx.rollback.histories; }
        throw err;
      } finally {
        tx.release?.();
      }
    },
    receivable: { async findUnique({ where }) { return where.id === RV ? full() : null; } },
    taxInvoice: { async findMany() { return []; } },
  };
  return { prisma, state };
}

function loadRoutes(db) {
  const session = {
    SessionError: class extends Error {},
    requireWriteAccess: async () => ({ userId: "user" }),
    requireUser: async () => ({ userId: "user" }),
  };
  const dbModule = { prisma: db.prisma, withDbWriteSlot: (fn) => fn(), withDeadlockRetry: (fn) => fn(), describeDbWriteError: (_e, f) => f };
  const audit = { writeAuditLog: async () => {}, UUID_RE };
  const mapper = require("../lib/receivable-mapper.ts");
  const write = loadTypeScript("lib/receivable-write.ts", { "@/lib/db": dbModule, "@/lib/audit": audit, "@/lib/receivable-mapper": mapper });
  const mocks = { "@/lib/db": dbModule, "@/lib/session": session, "@/lib/audit": audit, "@/lib/receivable-mapper": mapper, "@/lib/receivable-write": write };
  const payments = loadTypeScript("app/api/receivables/[id]/payments/route.ts", mocks);
  const payment = loadTypeScript("app/api/receivables/[id]/payments/[paymentId]/route.ts", mocks);
  const receivable = loadTypeScript("app/api/receivables/[id]/route.ts", mocks);
  const call = async (promise) => { const res = await promise; return { status: res.status, body: await res.json() }; };
  return {
    add: (amount, paidAt = "2026-10-02") => call(payments.POST(
      new Request("http://localhost", { method: "POST", body: JSON.stringify({ amount, paidAt }) }),
      { params: Promise.resolve({ id: RV }) })),
    reset: () => call(payments.DELETE(new Request("http://localhost", { method: "DELETE" }), { params: Promise.resolve({ id: RV }) })),
    remove: (paymentId) => call(payment.DELETE(new Request("http://localhost", { method: "DELETE" }), { params: Promise.resolve({ id: RV, paymentId }) })),
    patch: (body) => call(receivable.PATCH(
      new Request("http://localhost", { method: "PATCH", body: JSON.stringify(body) }),
      { params: Promise.resolve({ id: RV }) })),
  };
}

const paidOf = (db) => Number(db.state.receivable.collectedAmount);
const trackedOf = (db) => db.state.histories.reduce((s, h) => s + Number(h.paymentAmount), 0);

test("two payments sent at the same time cannot both pass the over-payment check", async () => {
  const db = fakeDb({ billed: 100, collected: 0 });
  const api = loadRoutes(db);
  const results = await Promise.all([api.add(70), api.add(70)]);
  assert.deepEqual(results.map((r) => r.status).sort(), [200, 400]);
  assert.equal(paidOf(db), 70);
  assert.equal(trackedOf(db), 70);
  assert.equal(db.state.histories.length, 1);
});

test("payments sent at the same time are all counted in the paid amount", async () => {
  const db = fakeDb({ billed: 100, collected: 0 });
  const api = loadRoutes(db);
  const results = await Promise.all([api.add(30), api.add(40)]);
  assert.deepEqual(results.map((r) => r.status), [200, 200]);
  assert.equal(paidOf(db), 70);
  assert.equal(trackedOf(db), 70);
  assert.equal(db.state.receivable.status, "PARTIAL");
  assert.equal(Number(db.state.receivable.outstandingAmount), 30);
  const last = results.find((r) => r.body.receivable.paidAmount === 70).body.receivable;
  assert.equal(last.payments.length, 2);
});

test("payments deleted at the same time leave no paid amount behind", async () => {
  const db = fakeDb({ billed: 100, collected: 70, histories: [{ date: "2026-09-01", amount: 30 }, { date: "2026-10-01", amount: 40 }] });
  const api = loadRoutes(db);
  const [a, b] = db.state.histories.map((h) => h.id);
  const results = await Promise.all([api.remove(a), api.remove(b)]);
  assert.deepEqual(results.map((r) => r.status), [200, 200]);
  assert.equal(db.state.histories.length, 0);
  assert.equal(paidOf(db), 0);
  assert.equal(db.state.receivable.isLongOverdue, true, "입금이 없으면 기본 상태인 미수로 돌아간다");
});

test("deleting the same payment twice at once only subtracts it once", async () => {
  const db = fakeDb({ billed: 100, collected: 70, histories: [{ date: "2026-09-01", amount: 30 }, { date: "2026-10-01", amount: 40 }] });
  const api = loadRoutes(db);
  const target = db.state.histories[1].id;
  const results = await Promise.all([api.remove(target), api.remove(target)]);
  assert.deepEqual(results.map((r) => r.status).sort(), [200, 404]);
  assert.equal(paidOf(db), 30);
  assert.equal(trackedOf(db), 30);
});

test("a paid amount recorded without history is kept across payments", async () => {
  const db = fakeDb({ billed: 100, collected: 50 });
  const api = loadRoutes(db);
  const added = await api.add(20);
  assert.equal(added.status, 200);
  assert.equal(paidOf(db), 70);
  assert.equal((await api.add(31)).status, 400, "잔여 30원을 넘는 입금은 막는다");
  assert.equal((await api.remove(db.state.histories[0].id)).status, 200);
  assert.equal(paidOf(db), 50);
});

test("a paid amount left smaller than its history is corrected by the next payment", async () => {
  const db = fakeDb({ billed: 100, collected: 10, histories: [{ date: "2026-09-01", amount: 30 }] });
  const api = loadRoutes(db);
  assert.equal((await api.add(10)).status, 200);
  assert.equal(paidOf(db), 40);
  assert.equal(trackedOf(db), 40);
});

test("the total paid amount cannot be edited below the payment history", async () => {
  const db = fakeDb({ billed: 100, collected: 70, histories: [{ date: "2026-09-01", amount: 30 }, { date: "2026-10-01", amount: 40 }] });
  const api = loadRoutes(db);
  const rejected = await api.patch({ paidAmount: 50, receivableAmount: 50, status: "PARTIAL" });
  assert.equal(rejected.status, 400);
  assert.match(rejected.body.error, /70원/);
  assert.equal(paidOf(db), 70, "거절된 수정은 아무것도 바꾸지 않는다");

  // 이력 없는 금액을 더하는 수정(70 → 80)은 허용되고, 그 뒤 입금 하나를 지워도 내역과 맞는다.
  assert.equal((await api.patch({ paidAmount: 80, receivableAmount: 20, status: "PARTIAL" })).status, 200);
  assert.equal((await api.remove(db.state.histories[1].id)).status, 200);
  assert.equal(paidOf(db), 40);
  assert.equal(trackedOf(db), 30);
});

test("editing other fields is allowed even when old data is already inconsistent", async () => {
  const db = fakeDb({ billed: 100, collected: 10, histories: [{ date: "2026-09-01", amount: 30 }] });
  const api = loadRoutes(db);
  const res = await api.patch({ paidAmount: 10, dueDate: "2026-12-31" });
  assert.equal(res.status, 200);
});

test("only the explicit reset request clears the payment history", async () => {
  const db = fakeDb({ billed: 100, collected: 70, histories: [{ date: "2026-09-01", amount: 30 }, { date: "2026-10-01", amount: 40 }] });
  const api = loadRoutes(db);
  const viaEdit = await api.patch({ paidAmount: 0, receivableAmount: 100, basePaidAmount: 70 });
  assert.equal(viaEdit.status, 400, "누적액 수정의 0은 초기화로 해석하지 않는다");
  assert.equal(db.state.histories.length, 2);

  const res = await api.reset();
  assert.equal(res.status, 200);
  assert.equal(db.state.histories.length, 0);
  assert.equal(paidOf(db), 0);
  assert.equal(Number(db.state.receivable.outstandingAmount), 100);
  assert.equal(res.body.receivable.paidAt, null);
  assert.equal(res.body.receivable.status, "OVERDUE");
});

test("an edit window opened before a new payment cannot remove that payment", async () => {
  // 수금액 0일 때 연 수정창 → 다른 사용자가 70 입금 → 그 창에서 만기일만 바꿔 저장
  const db = fakeDb({ billed: 100, collected: 0 });
  const api = loadRoutes(db);
  assert.equal((await api.add(70)).status, 200);

  // 바뀐 필드만 보내는 지금 화면: 만기일만 바뀌고 입금은 그대로
  const dueOnly = await api.patch({ dueDate: "2026-12-31", baseBilledAmount: 100, basePaidAmount: 0 });
  assert.equal(dueOnly.status, 200);
  assert.equal(paidOf(db), 70);
  assert.equal(db.state.histories.length, 1);
  assert.equal(Number(db.state.receivable.outstandingAmount), 30);

  // 예전처럼 폼 전체(옛 수금액 0·옛 미수금 100)를 보내도 입금을 지우지 못한다
  const fullForm = await api.patch({ billedAmount: 100, paidAmount: 0, receivableAmount: 100, dueDate: "2026-12-31", status: "OVERDUE", baseBilledAmount: 100, basePaidAmount: 0 });
  assert.equal(fullForm.status, 409);
  assert.match(fullForm.body.error, /새로고침/);
  assert.equal(paidOf(db), 70);
  assert.equal(db.state.histories.length, 1);

  // 창을 연 뒤 납부액이 바뀌었으면, 기록이 없던 금액이라도 옛 기준으로 덮어쓰지 못한다
  const stalePaid = await api.patch({ paidAmount: 100, baseBilledAmount: 100, basePaidAmount: 0 });
  assert.equal(stalePaid.status, 409);
  assert.equal(paidOf(db), 70);
});

test("editing the bill from an old screen keeps the outstanding amount in line with the latest payment", async () => {
  // 화면을 연 뒤 70 입금 → 이전 화면에서 청구액을 120으로 수정
  const db = fakeDb({ billed: 100, collected: 0 });
  const api = loadRoutes(db);
  assert.equal((await api.add(70)).status, 200);

  // 청구액만 보낸 경우
  const billedOnly = await api.patch({ billedAmount: 120, baseBilledAmount: 100, basePaidAmount: 0 });
  assert.equal(billedOnly.status, 200);
  assert.equal(Number(db.state.receivable.billedAmount), 120);
  assert.equal(Number(db.state.receivable.outstandingAmount), 50);
  assert.equal(db.state.receivable.status, "PARTIAL");

  // 옛 납부액(0)으로 계산한 미수액(130)을 같이 보낸 경우에도 최신 납부액 기준으로 계산한다
  const withStaleOutstanding = await api.patch({ billedAmount: 130, receivableAmount: 130, baseBilledAmount: 100, basePaidAmount: 0 });
  assert.equal(withStaleOutstanding.status, 200);
  assert.equal(Number(db.state.receivable.outstandingAmount), 60);
  assert.equal(withStaleOutstanding.body.receivable.receivableAmount, 60);
});

test("a loss deducted from the outstanding amount survives later payments and stale screens", async () => {
  const db = fakeDb({ billed: 100, collected: 0 });
  const api = loadRoutes(db);
  // 회수불가 30 입력 화면을 연 뒤 다른 곳에서 50 입금
  assert.equal((await api.add(50)).status, 200);
  // 그 화면은 옛 납부액 0으로 미수액 70(=100−0−30)을 계산해 보낸다
  const loss = await api.patch({ receivableAmount: 70, baseBilledAmount: 100, basePaidAmount: 0 });
  assert.equal(loss.status, 200);
  assert.equal(Number(db.state.receivable.outstandingAmount), 20, "100 − 최신 납부 50 − 손실 30");

  // 이후 입금·삭제에도 손실 차감은 유지된다
  assert.equal((await api.add(20)).status, 200);
  assert.equal(Number(db.state.receivable.outstandingAmount), 0);
  assert.equal(db.state.receivable.status, "PARTIAL");
  assert.equal((await api.remove(db.state.histories[1].id)).status, 200);
  assert.equal(Number(db.state.receivable.outstandingAmount), 20);
});

// ── 화면(lib/store.ts) ───────────────────────────────────────────

function loadStore() {
  return loadTypeScript("lib/store.ts", {}, `
    export function inspectForTest(patch?: Partial<StoreState>) {
      if (patch) _state = { ..._state, ...patch };
      return { state: _state };
    }
  `);
}

function controlledNetwork(t) {
  const requests = [];
  t.mock.method(globalThis, "fetch", (url, init) => new Promise((resolve) => {
    requests.push({
      url, method: init?.method ?? "GET", body: init?.body ? JSON.parse(init.body) : undefined, responded: false,
      respond(body) { this.responded = true; resolve({ json: async () => body }); },
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

function serverRv(payments, billed = 100) {
  const paid = payments.reduce((s, p) => s + p.amount, 0);
  return {
    id: RV, invoiceNumber: "INV", projectNumber: "P-1", projectName: "Test", termYear: 2026, termNumber: 1,
    leadInstitutionId: "inst", leadInstitutionName: "Inst", billedAt: "2026-10-01", billedAmount: billed,
    paidAmount: paid, paidAt: payments.length ? payments[payments.length - 1].paidAt : null, payments,
    receivableAmount: Math.max(0, billed - paid), dueDate: "2027-01-01",
    status: paid >= billed ? "PAID" : paid > 0 ? "PARTIAL" : "OVERDUE",
  };
}

function seedStore(t, payments = []) {
  t.mock.method(console, "error", () => {});
  const store = loadStore();
  store.inspectForTest({ receivables: [serverRv(payments)] });
  const notices = [];
  store.subscribeSyncNotice((message) => notices.push(message));
  return { store, notices, rv: () => store.inspectForTest().state.receivables.find((r) => r.id === RV) };
}

test("consecutive payments are sent one at a time and an earlier response never replaces the newer value", async (t) => {
  const requests = controlledNetwork(t);
  const { store, rv } = seedStore(t);

  store.addReceivablePayment(RV, { paidAt: "2026-10-01", amount: 30 });
  store.addReceivablePayment(RV, { paidAt: "2026-10-02", amount: 40 });
  assert.equal(rv().paidAmount, 70);
  await until(() => requests.length === 1);
  await settle();
  assert.equal(requests.length, 1, "앞 요청의 응답 전에는 다음 요청을 보내지 않는다");

  requests[0].respond({ ok: true, receivable: serverRv([{ id: "p1", paidAt: "2026-10-01", amount: 30 }]) });
  await until(() => requests.length === 2);
  assert.equal(rv().paidAmount, 70, "중간 응답(30)이 화면의 최신 값(70)을 덮지 않는다");
  assert.deepEqual(requests[1].body, { paidAt: "2026-10-02", amount: 40 });

  requests[1].respond({ ok: true, receivable: serverRv([{ id: "p1", paidAt: "2026-10-01", amount: 30 }, { id: "p2", paidAt: "2026-10-02", amount: 40 }]) });
  await store.waitForReceivableWrites(RV);
  assert.equal(rv().paidAmount, 70);
  assert.deepEqual(rv().payments.map((p) => p.id), ["p1", "p2"]);
});

test("a payment that is still being saved cannot be deleted with its temporary id", async (t) => {
  const requests = controlledNetwork(t);
  const { store, rv } = seedStore(t);

  store.addReceivablePayment(RV, { paidAt: "2026-10-01", amount: 30 });
  const tempId = rv().payments[0].id;
  assert.equal(store.isReceivablePaymentPending(tempId), true);
  store.deleteReceivablePayment(RV, tempId);
  assert.equal(rv().paidAmount, 30, "임시 입금은 지워지지 않는다");

  await until(() => requests.length === 1);
  requests[0].respond({ ok: true, receivable: serverRv([{ id: "p1", paidAt: "2026-10-01", amount: 30 }]) });
  await store.waitForReceivableWrites(RV);
  assert.equal(requests.length, 1, "임시 id로 삭제 요청을 보내지 않는다");

  store.deleteReceivablePayment(RV, "p1");
  await until(() => requests.length === 2);
  assert.equal(requests[1].method, "DELETE");
  assert.match(requests[1].url, /\/payments\/p1$/);
  requests[1].respond({ ok: true, receivable: serverRv([]) });
  await store.waitForReceivableWrites(RV);
  assert.equal(rv().paidAmount, 0);
});

test("a rejected payment tells the user and shows the value stored on the server", async (t) => {
  const requests = controlledNetwork(t);
  const { store, rv, notices } = seedStore(t, [{ id: "p1", paidAt: "2026-09-01", amount: 30 }]);

  store.addReceivablePayment(RV, { paidAt: "2026-10-01", amount: 90 });
  assert.equal(rv().paidAmount, 120);
  await until(() => requests.length === 1);
  requests[0].respond({ ok: false, error: "청구액을 초과하는 금액은 등록할 수 없습니다." });
  await until(() => requests.length === 2);
  assert.equal(requests[1].method, "GET");
  assert.match(requests[1].url, new RegExp(`/api/receivables/${RV}$`));
  requests[1].respond({ ok: true, receivable: serverRv([{ id: "p1", paidAt: "2026-09-01", amount: 30 }]) });
  await store.waitForReceivableWrites(RV);
  assert.equal(rv().paidAmount, 30);
  assert.equal(notices.length, 1);
  assert.match(notices[0], /초과/);
});

test("a failure followed by a successful write is settled by the last response without reloading", async (t) => {
  const requests = controlledNetwork(t);
  const { store, rv, notices } = seedStore(t);

  store.addReceivablePayment(RV, { paidAt: "2026-10-01", amount: 30 });
  store.addReceivablePayment(RV, { paidAt: "2026-10-02", amount: 40 });
  await until(() => requests.length === 1);
  requests[0].respond({ ok: false, error: "일시적인 오류" });
  await until(() => requests.length === 2);
  requests[1].respond({ ok: true, receivable: serverRv([{ id: "p2", paidAt: "2026-10-02", amount: 40 }]) });
  await store.waitForReceivableWrites(RV);
  assert.equal(requests.length, 2, "마지막 응답이 정본이라 다시 불러오지 않는다");
  assert.equal(rv().paidAmount, 40);
  assert.equal(notices.length, 1);
});

test("a rejected total edit is rolled back to the server value", async (t) => {
  const requests = controlledNetwork(t);
  const payments = [{ id: "p1", paidAt: "2026-09-01", amount: 30 }, { id: "p2", paidAt: "2026-10-01", amount: 40 }];
  const { store, rv, notices } = seedStore(t, payments);

  store.updateReceivable(RV, { paidAmount: 50, receivableAmount: 50 });
  assert.equal(rv().paidAmount, 50);
  await until(() => requests.length === 1);
  assert.equal(requests[0].method, "PATCH");
  requests[0].respond({ ok: false, error: "차수별 입금 내역 합계(70원)보다 작게 수정할 수 없습니다." });
  await until(() => requests.length === 2);
  requests[1].respond({ ok: true, receivable: serverRv(payments) });
  await store.waitForReceivableWrites(RV);
  assert.equal(rv().paidAmount, 70);
  assert.match(notices[0], /70원/);
});

test("an edit sends the amounts it was based on, so the server can reject or recompute stale values", async (t) => {
  const requests = controlledNetwork(t);
  const { store } = seedStore(t, [{ id: "p1", paidAt: "2026-09-01", amount: 30 }]);

  store.updateReceivable(RV, { dueDate: "2026-12-31" });
  await until(() => requests.length === 1);
  assert.deepEqual(requests[0].body, { dueDate: "2026-12-31", baseBilledAmount: 100, basePaidAmount: 30 });
  requests[0].respond({ ok: true, receivable: { ...serverRv([{ id: "p1", paidAt: "2026-09-01", amount: 30 }]), dueDate: "2026-12-31" } });
  await store.waitForReceivableWrites(RV);

  // 오래 열어 둔 수정창은 창을 열 때의 값을 기준으로 보낸다
  store.updateReceivable(RV, { billedAmount: 120 }, { billedAmount: 100, paidAmount: 0 });
  await until(() => requests.length === 2);
  assert.deepEqual(requests[1].body, { billedAmount: 120, baseBilledAmount: 100, basePaidAmount: 0 });
  requests[1].respond({ ok: true, receivable: serverRv([{ id: "p1", paidAt: "2026-09-01", amount: 30 }], 120) });
  await store.waitForReceivableWrites(RV);
});

test("cancelling all collections is sent as its own request and keeps a loss deduction on screen", async (t) => {
  const requests = controlledNetwork(t);
  const { store, rv } = seedStore(t, [{ id: "p1", paidAt: "2026-09-01", amount: 30 }]);
  store.inspectForTest({ receivables: [{ ...rv(), receivableAmount: 50 }] }); // 손실 20 차감된 상태

  store.resetReceivablePayments(RV);
  assert.equal(rv().paidAmount, 0);
  assert.deepEqual(rv().payments, []);
  assert.equal(rv().paidAt, null);
  assert.equal(rv().receivableAmount, 80, "100 − 0 − 손실 20");
  await until(() => requests.length === 1);
  assert.equal(requests[0].method, "DELETE");
  assert.match(requests[0].url, new RegExp(`/api/receivables/${RV}/payments$`));
  requests[0].respond({ ok: true, receivable: { ...serverRv([]), receivableAmount: 80 } });
  await store.waitForReceivableWrites(RV);
});
