/* eslint-disable @typescript-eslint/no-require-imports */
// 전담기관 정책과 과제 유형(자율성트랙/ICT 기금사업)의 정합성 — 화면·스토어·서버가 공유하는 순수 함수 검증.
require("tsx/cjs");
const { test } = require("node:test");
const assert = require("node:assert/strict");
const { feePolicies } = require("../lib/mock.ts");
const {
  agencyHasIctFundPolicy,
  supportsAutonomyTrack,
  sanitizeProjectProgramFields,
  resolveProjectDivision,
} = require("../lib/fee-calculator.ts");
const { parseProgramTypeCell } = require("../lib/rcms-columns.ts");

const IITP = "fa-003";
const KEIT = "fa-001";

test("ICT 기금사업 정책이 있는 전담기관만 사업 유형을 고를 수 있다", () => {
  assert.equal(agencyHasIctFundPolicy(IITP, feePolicies), true);
  assert.equal(agencyHasIctFundPolicy(KEIT, feePolicies), false);
  assert.equal(agencyHasIctFundPolicy(undefined, feePolicies), false);
});

test("IITP는 일반 R&D·ICT 기금사업 모두 자율성트랙이 없고, KEIT는 있다", () => {
  assert.equal(supportsAutonomyTrack(IITP, feePolicies, "GENERAL"), false);
  assert.equal(supportsAutonomyTrack(IITP, feePolicies, "ICT_FUND"), false);
  assert.equal(supportsAutonomyTrack(KEIT, feePolicies, "GENERAL"), true);
});

test("정책을 못 찾는 전담기관은 자율성트랙을 막지 않는다", () => {
  assert.equal(supportsAutonomyTrack("unknown-agency", feePolicies, "GENERAL"), true);
});

test("IITP 자율성트랙 과제는 일반과제로 바로잡힌다", () => {
  const fixed = sanitizeProjectProgramFields({ agencyId: IITP, projectType: "AUTONOMY_TRACK", programType: undefined }, feePolicies);
  assert.equal(fixed.projectType, "GENERAL");
});

test("ICT 기금사업 정책이 없는 전담기관으로 바뀐 과제는 일반 R&D로 되돌아간다", () => {
  const fixed = sanitizeProjectProgramFields({ agencyId: KEIT, projectType: "GENERAL", programType: "ICT_FUND" }, feePolicies);
  assert.equal(fixed.programType, "GENERAL");
});

test("IITP ICT 기금사업은 그대로 유지된다", () => {
  const p = { agencyId: IITP, projectType: "GENERAL", programType: "ICT_FUND" };
  assert.equal(sanitizeProjectProgramFields(p, feePolicies), p);
});

test("모순이 없으면 같은 객체를 돌려주고, 정책이 로딩 전이면 아무것도 바꾸지 않는다", () => {
  const ok = { agencyId: KEIT, projectType: "AUTONOMY_TRACK", programType: undefined };
  assert.equal(sanitizeProjectProgramFields(ok, feePolicies), ok);
  const beforeLoad = { agencyId: IITP, projectType: "AUTONOMY_TRACK", programType: "ICT_FUND" };
  assert.equal(sanitizeProjectProgramFields(beforeLoad, []), beforeLoad);
});

test("서버가 쓰는 최소 필드 정책 목록으로도 같은 결과가 나온다", () => {
  const slim = feePolicies.map((p) => ({ agencyId: p.agencyId, status: p.status, programType: p.programType, hasAutonomyTrack: p.hasAutonomyTrack }));
  assert.equal(sanitizeProjectProgramFields({ agencyId: IITP, projectType: "AUTONOMY_TRACK", programType: undefined }, slim).projectType, "GENERAL");
});

test("기관구분 기본값은 전담기관 ID가 아니라 약칭(shortName)으로 판별한다", () => {
  // 운영 DB의 전담기관 ID는 UUID라 "fa-006" 같은 목업 ID로 비교하면 절대 일치하지 않는다.
  const agencies = [
    { id: "11111111-aaaa", shortName: "RDA2" },
    { id: "22222222-bbbb", shortName: "RDA1" },
  ];
  assert.equal(resolveProjectDivision({ agencyId: "11111111-aaaa", projectDivision: undefined }, agencies), "공동");
  assert.equal(resolveProjectDivision({ agencyId: "22222222-bbbb", projectDivision: undefined }, agencies), "주관");
  assert.equal(resolveProjectDivision({ agencyId: "11111111-aaaa", projectDivision: "위탁" }, agencies), "위탁");
  assert.equal(resolveProjectDivision({ agencyId: "missing", projectDivision: undefined }, agencies), "주관");
});

test("엑셀 사업유형 셀: ICT/기금이면 ICT 기금사업, 일반이면 일반 R&D, 그 외·빈칸은 지정 안 함", () => {
  assert.equal(parseProgramTypeCell("ICT기금사업"), "ICT_FUND");
  assert.equal(parseProgramTypeCell(" ict 기금 "), "ICT_FUND");
  assert.equal(parseProgramTypeCell("정보통신진흥기금"), "ICT_FUND");
  assert.equal(parseProgramTypeCell("일반"), "GENERAL");
  assert.equal(parseProgramTypeCell("일반 R&D"), "GENERAL");
  assert.equal(parseProgramTypeCell("국가연구개발사업"), "GENERAL");
  assert.equal(parseProgramTypeCell(""), undefined);
  assert.equal(parseProgramTypeCell(undefined), undefined);
  assert.equal(parseProgramTypeCell("기타"), undefined);
});

// ── 서버 방어(lib/project-program-guard.ts) — DB 대신 정책 행을 주입해 검증한다 ──
const fs = require("node:fs");
const path = require("node:path");
const Module = require("node:module");
const ts = require("typescript");

function loadWithMocks(relativePath, mocks) {
  const file = path.resolve(__dirname, "..", relativePath);
  const instance = new Module(file, module);
  instance.filename = file;
  instance.paths = Module._nodeModulePaths(path.dirname(file));
  const originalRequire = instance.require.bind(instance);
  instance.require = (id) => Object.hasOwn(mocks, id) ? mocks[id] : originalRequire(id);
  instance._compile(ts.transpileModule(fs.readFileSync(file, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true },
  }).outputText, file);
  return instance.exports;
}

function loadGuard(rows) {
  return loadWithMocks("lib/project-program-guard.ts", {
    "@/lib/db": { prisma: { feePolicy: { findMany: async () => rows } } },
    "@/lib/fee-calculator": require("../lib/fee-calculator.ts"),
  });
}

const activeRows = feePolicies
  .filter((p) => p.status === "ACTIVE")
  .map((p) => ({ fundingAgencyId: p.agencyId, programType: p.programType ?? null, hasAutonomyTrack: p.hasAutonomyTrack }));

test("서버: IITP 자율성트랙 요청은 일반과제로 저장된다", async () => {
  const guard = loadGuard(activeRows);
  const fixed = await guard.sanitizeProjectProgramFieldsFromDb({ agencyId: IITP, projectType: "AUTONOMY_TRACK", programType: undefined });
  assert.equal(fixed.projectType, "GENERAL");
});

test("서버: ICT 정책이 없는 전담기관의 ICT_FUND 요청은 일반 R&D로 저장된다", async () => {
  const guard = loadGuard(activeRows);
  const fixed = await guard.sanitizeProjectProgramFieldsFromDb({ agencyId: KEIT, projectType: "GENERAL", programType: "ICT_FUND" });
  assert.equal(fixed.programType, "GENERAL");
});

test("서버: IITP ICT 기금사업과 KEIT 자율성트랙은 그대로 저장된다", async () => {
  const guard = loadGuard(activeRows);
  const ict = await guard.sanitizeProjectProgramFieldsFromDb({ agencyId: IITP, projectType: "GENERAL", programType: "ICT_FUND" });
  assert.equal(ict.programType, "ICT_FUND");
  const auto = await guard.sanitizeProjectProgramFieldsFromDb({ agencyId: KEIT, projectType: "AUTONOMY_TRACK", programType: undefined });
  assert.equal(auto.projectType, "AUTONOMY_TRACK");
});

test("서버: 전담기관이 비어 있는 요청도 예외 없이 처리된다", async () => {
  const guard = loadGuard(activeRows);
  const fixed = await guard.sanitizeProjectProgramFieldsFromDb({ agencyId: "", projectType: "GENERAL", programType: "ICT_FUND" });
  assert.equal(fixed.programType, "GENERAL");
});
