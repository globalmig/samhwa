/* eslint-disable @typescript-eslint/no-require-imports */
require("tsx/cjs");
const { test } = require("node:test");
const assert = require("node:assert/strict");
const {
  isValidDateStr,
  termDateRange,
  resolveTermDateRange,
  computeCurrentTerm,
  findRepresentativeTermStartDate,
} = require("../lib/utils.ts");

// ─── findRepresentativeTermStartDate ─────────────────────────────

test("findRepresentativeTermStartDate: all members agree (distinct 1) → uses that date, no warning", (t) => {
  const warn = t.mock.method(console, "warn", () => {});
  const members = [
    { role: "LEAD", annualBudgets: [{ termNumber: 3, termStartDate: "2024-07-01" }] },
    { role: "PARTICIPANT", annualBudgets: [{ termNumber: 3, termStartDate: "2024-07-01" }] },
  ];
  assert.equal(findRepresentativeTermStartDate(members, 3, "TEST-P"), "2024-07-01");
  assert.equal(warn.mock.callCount(), 0);
});

test("findRepresentativeTermStartDate: nobody has a date (distinct 0) → undefined, no warning", (t) => {
  const warn = t.mock.method(console, "warn", () => {});
  const members = [
    { role: "LEAD", annualBudgets: [{ termNumber: 3 }] },
    { role: "PARTICIPANT", annualBudgets: [] },
  ];
  assert.equal(findRepresentativeTermStartDate(members, 3, "TEST-P"), undefined);
  assert.equal(warn.mock.callCount(), 0);
});

test("findRepresentativeTermStartDate: only invalid-format dates present → treated as distinct 0, undefined, no warning", (t) => {
  const warn = t.mock.method(console, "warn", () => {});
  const members = [
    { role: "LEAD", annualBudgets: [{ termNumber: 3, termStartDate: "2024-7-1" }] }, // not zero-padded
    { role: "PARTICIPANT", annualBudgets: [{ termNumber: 3, termStartDate: "not-a-date" }] },
  ];
  assert.equal(findRepresentativeTermStartDate(members, 3, "TEST-P"), undefined);
  assert.equal(warn.mock.callCount(), 0);
});

test("findRepresentativeTermStartDate: members disagree (distinct 2+) → undefined, warns exactly once", (t) => {
  const warn = t.mock.method(console, "warn", () => {});
  const members = [
    { role: "LEAD", annualBudgets: [{ termNumber: 3, termStartDate: "2024-07-01" }] },
    { role: "PARTICIPANT", annualBudgets: [{ termNumber: 3, termStartDate: "2024-08-01" }] },
  ];
  assert.equal(findRepresentativeTermStartDate(members, 3, "TEST-P"), undefined);
  assert.equal(warn.mock.callCount(), 1);
  assert.match(warn.mock.calls[0].arguments[0], /TEST-P/);
  assert.match(warn.mock.calls[0].arguments[0], /3연차/);
});

test("findRepresentativeTermStartDate: LEAD has no date but participants agree → still counts as distinct 1", (t) => {
  const warn = t.mock.method(console, "warn", () => {});
  const members = [
    { role: "LEAD", annualBudgets: [{ termNumber: 3 }] },
    { role: "PARTICIPANT", annualBudgets: [{ termNumber: 3, termStartDate: "2024-07-01" }] },
    { role: "PARTICIPANT", annualBudgets: [{ termNumber: 3, termStartDate: "2024-07-01" }] },
  ];
  assert.equal(findRepresentativeTermStartDate(members, 3, "TEST-P"), "2024-07-01");
  assert.equal(warn.mock.callCount(), 0);
});

test("findRepresentativeTermStartDate: only looks at the requested termNumber", () => {
  const members = [{ annualBudgets: [{ termNumber: 1, termStartDate: "2022-01-01" }, { termNumber: 2, termStartDate: "2023-01-01" }] }];
  assert.equal(findRepresentativeTermStartDate(members, 1), "2022-01-01");
  assert.equal(findRepresentativeTermStartDate(members, 2), "2023-01-01");
  assert.equal(findRepresentativeTermStartDate(members, 3), undefined);
});

// ─── isValidDateStr ───────────────────────────────────────────────

test("isValidDateStr: accepts YYYY-MM-DD only", () => {
  assert.equal(isValidDateStr("2024-07-01"), true);
  assert.equal(isValidDateStr("2024-7-1"), false);
  assert.equal(isValidDateStr("2024/07/01"), false);
  assert.equal(isValidDateStr(""), false);
  assert.equal(isValidDateStr(undefined), false);
  assert.equal(isValidDateStr(null), false);
});

// ─── resolveTermDateRange / termDateRange exception behavior ─────

test("resolveTermDateRange: a broken stageStartDate is ignored, falls back to project.startDate", () => {
  const project = {
    startDate: "2020-01-01",
    stages: [{ stageNumber: 1, startTermNumber: 1, endTermNumber: 2, stageStartDate: "garbage" }],
  };
  assert.doesNotThrow(() => resolveTermDateRange(project, 1));
  assert.equal(resolveTermDateRange(project, 1).start, "2020-01-01");
});

test("resolveTermDateRange: a broken project.startDate still throws when no valid stage override exists (existing safety behavior)", () => {
  const project = { startDate: "invalid-date" };
  assert.throws(() => resolveTermDateRange(project, 1));
  assert.throws(() => termDateRange("invalid-date", 1));
});

// ─── computeCurrentTerm ───────────────────────────────────────────

test("computeCurrentTerm: plain formula, no stages", () => {
  const project = { startDate: "2022-01-01" };
  assert.equal(computeCurrentTerm(project, 5, "2024-06-15"), 3);
});

test("computeCurrentTerm: a stage with its own stageStartDate shifts the terms inside it", () => {
  // Stage 1 (terms 1-2) starts on time; stage 2 (terms 3-4) actually started later than the plain
  // formula would predict (2022-01-01 + 2 years = 2024-01-01) — real stage start was 2024-07-01.
  const project = {
    startDate: "2022-01-01",
    stages: [
      { stageNumber: 1, startTermNumber: 1, endTermNumber: 2, stageStartDate: "2022-01-01" },
      { stageNumber: 2, startTermNumber: 3, endTermNumber: 4, stageStartDate: "2024-07-01" },
    ],
  };
  // On 2024-03-01, the plain formula would already consider term 3 started (2024-01-01), but the
  // real stage 2 start (2024-07-01) hasn't arrived yet — so current term should still be 2.
  assert.equal(computeCurrentTerm(project, 4, "2024-03-01"), 2);
  // Once past the real stage start, term 3 should register.
  assert.equal(computeCurrentTerm(project, 4, "2024-08-01"), 3);
});

test("computeCurrentTerm: only some stages have a stageStartDate — the others fall back individually, not the whole computation", () => {
  const project = {
    startDate: "2022-01-01",
    stages: [
      { stageNumber: 1, startTermNumber: 1, endTermNumber: 2, stageStartDate: "2022-01-01" },
      { stageNumber: 2, startTermNumber: 3, endTermNumber: 4 }, // no stageStartDate at all
    ],
  };
  // Term 4 (in stage 2, no override) should fall back to the plain formula: 2022-01-01 + 3y = 2025-01-01.
  assert.equal(computeCurrentTerm(project, 4, "2025-02-01"), 4);
  assert.equal(computeCurrentTerm(project, 4, "2024-12-01"), 3);
});

test("computeCurrentTerm: broken project.startDate returns 1 without throwing", () => {
  const project = { startDate: "not-a-real-date" };
  assert.doesNotThrow(() => computeCurrentTerm(project, 5, "2024-06-15"));
  assert.equal(computeCurrentTerm(project, 5, "2024-06-15"), 1);
});
