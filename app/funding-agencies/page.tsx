"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import { FiEdit2, FiExternalLink } from "react-icons/fi";
import { useStore, addFundingAgency, updateFundingAgency, updateAgencyGuide } from "@/lib/store";
import { type FundingAgency, type FeePolicy, type AgencyGuideRow as GuideRow, type AgencyGuideTable as GuideTable, type AgencyGuideTab as GuideTab } from "@/lib/mock";
import { fmtDate, fmtWon } from "@/lib/utils";
import StatusBadge from "@/components/common/StatusBadge";
import Modal from "@/components/common/Modal";
import DateInput from "@/components/common/DateInput";
import { useCanWrite } from "@/lib/permissions";
import ExcelUploadModal, { downloadExcelTemplate } from "@/components/common/ExcelUploadModal";

// ─── 운용 안내 데이터 ────────────────────────────────────────
const AGENCY_GUIDE: Record<string, GuideTab[]> = {
  KEIT: [
    {
      label: "과제 구성 · 협약",
      tables: [
        {
          caption: "기본 구성",
          headers: ["항목", "내용"],
          rows: [
            { cells: ["수행기관 구성", "주관기관 1개(필수) + 공동기관 0~N개"] },
            { cells: ["수수료 부담자", "주관기관이 전액 부담"] },
            { cells: ["산정 제외 기관", "현금사업비 없는 기관은 수수료 산정 제외"] },
            { cells: ["과제 배정 방식", "전문기관(KEIT)이 회계법인에 직접 배정"] },
          ],
        },
        {
          caption: "협약 방식",
          headers: ["협약 방식", "설명", "RCMS 단계", "정산 시점"],
          rows: [
            { cells: ["일괄협약", "전 기간을 처음에 한 번에 협약", "0단계", "마지막 연차 1회"] },
            { cells: ["단계협약", "기간을 나눠 2회 이상 협약", "1단계 · 2단계…", "각 단계 마지막 연차"] },
          ],
        },
      ],
    },
    {
      label: "수수료 납부 스케줄",
      tables: [
        {
          caption: "납부 방식",
          headers: ["업무 구분", "청구 비율", "내용"],
          rows: [
            { cells: ["연차상시", "85%", "매년 연구비 점검, 나머지 15%는 미청구로 이월"] },
            { cells: ["정산", "100% + 누적 이월", "마지막 연차 전체 정산 + 이전 연도 미청구 합산 청구"], em: true },
          ],
        },
        {
          caption: "납부 비율 예시 — 단계협약 3+2 (5년 과제)",
          headers: ["구분", "1년차", "2년차", "3년차", "4년차", "5년차"],
          rows: [
            { cells: ["단  계", "1단계", "1단계", "1단계", "2단계", "2단계"] },
            { cells: ["회계법인 업무", "연차상시", "연차상시", "연차상시&정산", "연차상시", "연차상시&정산"] },
            { cells: ["일반과제 납부", "85%", "85%", "100%+15%+15%", "85%", "100%+15%"], em: true },
            { cells: ["자율성트랙 납부", "85%", "85%", "85%", "85%", "85%"] },
          ],
          note: "정산연차의 '+15%'는 이전 연도 미청구 누적액 (예: 3년차 = 100% + 1연차 15% + 2연차 15%)",
        },
      ],
    },
    {
      label: "기관 등급별 처리",
      tables: [
        {
          caption: "정산 방식",
          headers: ["정산 구분", "수행 주체", "회계법인 역할"],
          rows: [
            { cells: ["위탁정산", "회계법인", "연차상시 + 마지막 연차 정산 모두 수행"] },
            { cells: ["자체정산", "수행기관", "연차상시만 수행 (마지막 연차 정산 제외)"] },
          ],
        },
        {
          caption: "기관 등급 × 정산구분별 납부 비율 (KEIT)",
          headers: ["기관 등급", "정산 구분", "연차상시", "정산", "비고"],
          rows: [
            { cells: ["일반", "위탁정산", "85%", "100%", "—"] },
            { cells: ["S (최우수)", "자체정산", "85%", "85%", "면제 — 정산 미수행"], em: true },
            { cells: ["S (최우수)", "위탁정산", "85%", "100%", "일반과 동일"] },
            { cells: ["A~C (우수)", "자체정산", "85%", "85%", "면제 — 정산 미수행"], em: true },
            { cells: ["A~C (우수)", "위탁정산", "85%", "100%", "일반과 동일"] },
          ],
          note: "등급은 연도별 변동 가능. 자체정산 선택 시 정산 연도에도 85% 청구 (100% 청구 없음)",
        },
      ],
    },
    {
      label: "과제 종류",
      tables: [
        {
          caption: "과제 종류별 처리 방식",
          headers: ["과제 종류", "마지막 연도 정산", "납부 비율", "비고"],
          rows: [
            { cells: ["일반과제", "위탁정산 또는 자체정산 선택", "연차상시 85%, 정산 100%+누적", "표준 처리"] },
            { cells: ["자율성트랙 (자체정산)", "수행기관 자체정산", "전 기간 85% 균일", "정산 면제, 미청구 없음"], em: true },
            { cells: ["자율성트랙 (위탁정산)", "회계법인 위탁정산", "연차상시 85%, 정산 100%+누적", "일반과제와 동일 처리"] },
          ],
          note: "자율성트랙 여부는 매년 전문기관(KEIT)에서 통보",
        },
      ],
    },
  ],

  KETEP: [
    {
      label: "과제 구성 · 협약",
      tables: [
        {
          caption: "기본 구성",
          headers: ["항목", "내용"],
          rows: [
            { cells: ["수행기관 구성", "주관기관 1개(필수) + 공동기관 0~N개 (KEIT와 동일)"] },
            { cells: ["수수료 부담자", "주관기관이 전액 부담"] },
            { cells: ["산정 제외 기관", "현금사업비 없는 기관은 수수료 산정 제외"] },
          ],
        },
        {
          caption: "협약 방식",
          headers: ["협약 방식", "설명", "RCMS 단계", "정산 시점"],
          rows: [
            { cells: ["일괄협약", "전 기간을 처음에 한 번에 협약", "0단계", "마지막 연차 1회"] },
            { cells: ["단계협약", "기간을 나눠 2회 이상 협약", "1단계 · 2단계…", "각 단계 마지막 연차"] },
          ],
        },
      ],
    },
    {
      label: "수수료 납부 스케줄",
      tables: [
        {
          caption: "납부 방식 (KEIT와 동일한 구조)",
          headers: ["업무 구분", "청구 비율", "내용"],
          rows: [
            { cells: ["연차상시", "85%", "매년 연구비 점검, 나머지 15%는 미청구로 이월"] },
            { cells: ["정산", "100% + 누적 이월", "마지막 연차 전체 정산 + 이전 연도 미청구 합산 청구"], em: true },
          ],
          note: "2026년 이전 과제의 미청구액은 자동 이월이 없으므로 수기 입력 필요",
        },
        {
          caption: "납부 비율 예시 — 단계협약 3+2 (5년 과제)",
          headers: ["구분", "1년차", "2년차", "3년차", "4년차", "5년차"],
          rows: [
            { cells: ["단  계", "1단계", "1단계", "1단계", "2단계", "2단계"] },
            { cells: ["회계법인 업무", "연차상시", "연차상시", "연차상시&정산", "연차상시", "연차상시&정산"] },
            { cells: ["납부 비율", "85%", "85%", "100%+15%+15%", "85%", "100%+15%"], em: true },
          ],
        },
      ],
    },
    {
      label: "기관 등급별 처리",
      tables: [
        {
          caption: "가산금 산정 방식 비교",
          headers: ["항목", "KEIT (누진형)", "KETEP (일률형)"],
          rows: [
            { cells: ["1번째 공동기관 가산금", "기본수수료 × 10%", "기본수수료 × 10%"] },
            { cells: ["2번째 이후 추가분", "기본수수료 × 5%씩 추가", "기본수수료 × 10%씩 (동일 비율)"], em: true },
          ],
        },
        {
          caption: "기관 등급 × 정산구분별 납부 비율 (KETEP)",
          headers: ["기관 등급", "정산 구분", "연차상시", "정산", "비고"],
          rows: [
            { cells: ["일반", "위탁정산", "85%", "100%", "—"] },
            { cells: ["S (최우수)", "자체정산", "85%", "85%", "면제"], em: true },
            { cells: ["S (최우수)", "위탁정산", "85%", "100%", "일반과 동일"] },
            { cells: ["A~C (우수)", "위탁정산", "85%", "100%", "면제 아님 — KEIT와 차이"] },
          ],
          note: "KETEP은 S등급만 면제. A~C는 면제 대상 아님 (KEIT와 핵심 차이점)",
        },
      ],
    },
    {
      label: "과제 종류",
      tables: [
        {
          caption: "과제 종류",
          headers: ["항목", "내용"],
          rows: [
            { cells: ["자율성트랙", "없음 — 전부 일반과제로 처리"] },
            { cells: ["납부 비율", "연차상시 85%, 정산 100% + 누적 미청구"] },
          ],
        },
      ],
    },
  ],

  KOFPI: [
    {
      label: "과제 구성 · 협약",
      tables: [
        {
          caption: "기본 구성",
          headers: ["항목", "내용"],
          rows: [
            { cells: ["수행기관 구성", "주관기관 + 공동기관 + 위탁기관"] },
            { cells: ["위탁기관 취급", "수수료 산정 시 공동기관과 동일하게 취급"] },
            { cells: ["수수료 부담자", "주관기관이 전액 부담"] },
            { cells: ["산정 제외 기관", "현금사업비 없는 기관"] },
          ],
        },
        {
          caption: "협약 방식",
          headers: ["협약 방식", "설명", "RCMS 단계", "정산 시점"],
          rows: [
            { cells: ["일괄협약", "전 기간을 처음에 한 번에 협약", "0단계", "마지막 연차 1회"] },
            { cells: ["단계협약", "기간을 나눠 2회 이상 협약", "1단계 · 2단계…", "각 단계 마지막 연차"] },
          ],
        },
      ],
    },
    {
      label: "수수료 납부 스케줄",
      tables: [
        {
          caption: "납부 방식",
          headers: ["업무 구분", "청구 비율", "내용"],
          rows: [
            { cells: ["연차상시", "100%", "미청구 없음 — 항상 100% 청구"], em: true },
            { cells: ["정산", "100%", "이월 누적액 없음"], em: true },
          ],
        },
        {
          caption: "납부 비율 예시 — 단계협약 3+2 (5년 과제)",
          headers: ["구분", "1년차", "2년차", "3년차", "4년차", "5년차"],
          rows: [
            { cells: ["단  계", "1단계", "1단계", "1단계", "2단계", "2단계"] },
            { cells: ["회계법인 업무", "연차상시", "연차상시", "연차상시&정산", "연차상시", "연차상시&정산"] },
            { cells: ["수수료 납부", "100%", "100%", "100%", "100%", "100%"], em: true },
          ],
        },
      ],
    },
    {
      label: "기관 등급별 처리",
      tables: [
        {
          caption: "면제 정책",
          headers: ["항목", "내용"],
          rows: [
            { cells: ["면제 기관", "없음 — S·A~C 포함 모든 기관을 일반기관으로 취급"] },
            { cells: ["자체정산 선택", "의미 없음 (모든 기관 위탁정산 대상)"] },
          ],
        },
        {
          caption: "기관 등급 × 납부 비율 (KOFPI)",
          headers: ["기관 등급", "정산 구분", "연차상시", "정산", "비고"],
          rows: [
            { cells: ["일반", "위탁정산", "100%", "100%", "—"] },
            { cells: ["S (최우수)", "위탁정산", "100%", "100%", "면제 없음 — 일반과 동일"] },
            { cells: ["A~C (우수)", "위탁정산", "100%", "100%", "면제 없음 — 일반과 동일"] },
          ],
        },
      ],
    },
    {
      label: "과제 종류",
      tables: [
        {
          caption: "과제 종류",
          headers: ["항목", "내용"],
          rows: [
            { cells: ["자율성트랙", "없음 — 전부 일반과제로 처리"] },
            { cells: ["납부 비율", "연차상시·정산 모두 100% (미청구 없음)"] },
          ],
        },
      ],
    },
  ],

  IITP: [
    {
      label: "과제 구성 · 협약",
      tables: [
        {
          caption: "기본 구성",
          headers: ["항목", "내용"],
          rows: [
            { cells: ["수행기관 구성", "주관기관 1개(필수) + 공동기관 0~N개"] },
            { cells: ["수수료 부담자", "주관기관이 전액 부담"] },
            { cells: ["산정 기준액", "현금 사업비 기준 (현물 미포함)"] },
            { cells: ["산정 제외 기관", "현금사업비 없는 기관은 수수료 산정 제외"] },
          ],
        },
        {
          caption: "협약 방식",
          headers: ["협약 방식", "설명", "RCMS 단계", "정산 시점"],
          rows: [
            { cells: ["일괄협약", "전 기간을 처음에 한 번에 협약", "0단계", "마지막 연차 1회"] },
            { cells: ["단계협약", "기간을 나눠 2회 이상 협약", "1단계 · 2단계…", "각 단계 마지막 연차"] },
          ],
        },
      ],
    },
    {
      label: "수수료 납부 스케줄",
      tables: [
        {
          caption: "납부 방식 (일반 R&D 과제 기준)",
          headers: ["업무 구분", "청구 비율", "내용"],
          rows: [
            { cells: ["연차상시", "85%", "매년 연구비 점검, 나머지 15%는 미청구로 이월"] },
            { cells: ["정산", "100% + 누적 이월", "마지막 연차 전체 정산 + 이전 연도 미청구 합산 청구"], em: true },
          ],
          note: "ICT 기금사업은 이 스케줄을 따르지 않음 — '과제 종류' 탭 참고",
        },
        {
          caption: "납부 비율 예시 — 단계협약 3+2 (5년 과제, 일반 R&D)",
          headers: ["구분", "1년차", "2년차", "3년차", "4년차", "5년차"],
          rows: [
            { cells: ["단  계", "1단계", "1단계", "1단계", "2단계", "2단계"] },
            { cells: ["회계법인 업무", "연차상시", "연차상시", "연차상시&정산", "연차상시", "연차상시&정산"] },
            { cells: ["납부 비율", "85%", "85%", "100%+15%+15%", "85%", "100%+15%"], em: true },
          ],
        },
      ],
    },
    {
      label: "기관 등급별 처리",
      tables: [
        {
          caption: "정산 방식",
          headers: ["정산 구분", "수행 주체", "회계법인 역할"],
          rows: [
            { cells: ["위탁정산", "회계법인", "연차상시 + 마지막 연차 정산 모두 수행"] },
            { cells: ["자체정산", "수행기관", "연차상시만 수행 (마지막 연차 정산 제외)"] },
          ],
        },
        {
          caption: "기관 등급 × 정산구분별 납부 비율 (IITP)",
          headers: ["기관 등급", "정산 구분", "연차상시", "정산", "비고"],
          rows: [
            { cells: ["일반", "위탁정산", "85%", "100%", "—"] },
            { cells: ["S (최우수)", "해당 없음", "0%", "0%", "산정기준액에서 완전 제외 — 연차상시도 수행 안 함"], em: true },
            { cells: ["A~C (우수)", "위탁정산", "85%", "100%", "면제 없음 — 일반과 동일"] },
          ],
          note: "KEIT/KETEP과의 핵심 차이 — S등급은 '자체정산 시 면제'가 아니라 산정기준액 자체에서 완전히 빠짐. A~C는 면제 대상이 아님",
        },
      ],
    },
    {
      label: "과제 종류",
      tables: [
        {
          caption: "과제 종류별 처리 방식",
          headers: ["과제 종류", "산정 방식", "청구 비율", "비고"],
          rows: [
            { cells: ["일반 R&D 과제", "공동기관 사업비 합산 후 표준수수료 산정·배분", "연차상시 85%, 정산 100%+누적", "표준 처리 — 자율성트랙 없음"] },
            { cells: ["ICT 기금사업", "참여기관별 사업비를 각자 구간표에 대입해 개별 산정 (공동기관 구분 없음)", "매년 100% (단계정산 없음)", "국가연구개발사업이 아닌 별도 기금사업 — 전용 구간표 적용"], em: true },
          ],
          note: "동일 전담기관(IITP)이라도 과제 유형에 따라 별도 정책이 자동 적용됨 — 과제 등록 시 사업 유형(일반 R&D / ICT기금사업)을 반드시 확인",
        },
      ],
    },
  ],

  RDA1: [
    {
      label: "과제 구성 · 협약",
      tables: [
        {
          caption: "기본 구성",
          headers: ["항목", "내용"],
          rows: [
            { cells: ["적용 대상", "주관기관이 농촌진흥청 본청·소속기관이 아닌 일반 수행기관인 경우"] },
            { cells: ["수행기관 구성", "주관기관 1개(필수) + 공동기관 0~N개"] },
            { cells: ["수수료 부담자", "주관기관이 전액 부담"] },
            { cells: ["산정 기준액", "현금 + 현물 합산 기준 — 타 전담기관(현금만 산정)과 다름"], em: true },
            { cells: ["산정 제외 기관", "현금+현물 사업비 없는 기관은 수수료 산정 제외"] },
            { cells: ["공문·세금계산서 발송", "주관기관 + 참여(공동)기관 모두에게 발송"], em: true },
          ],
        },
        {
          caption: "협약 방식",
          headers: ["협약 방식", "설명", "RCMS 단계", "정산 시점"],
          rows: [
            { cells: ["일괄협약", "전 기간을 처음에 한 번에 협약", "0단계", "마지막 연차 1회"] },
            { cells: ["단계협약", "기간을 나눠 2회 이상 협약", "1단계 · 2단계…", "각 단계 마지막 연차"] },
          ],
        },
      ],
    },
    {
      label: "수수료 납부 스케줄",
      tables: [
        {
          caption: "납부 방식",
          headers: ["업무 구분", "청구 비율", "내용"],
          rows: [
            { cells: ["연차상시", "85%", "매년 연구비 점검, 나머지 15%는 미청구로 이월"] },
            { cells: ["정산", "100% + 누적 이월", "마지막 연차 전체 정산 + 이전 연도 미청구 합산 청구"], em: true },
            { cells: ["최소수수료", "100,000원", "산정액이 10만원 미만이면 10만원으로 상향 청구"] },
          ],
        },
        {
          caption: "납부 비율 예시 — 단계협약 3+2 (5년 과제)",
          headers: ["구분", "1년차", "2년차", "3년차", "4년차", "5년차"],
          rows: [
            { cells: ["단  계", "1단계", "1단계", "1단계", "2단계", "2단계"] },
            { cells: ["회계법인 업무", "연차상시", "연차상시", "연차상시&정산", "연차상시", "연차상시&정산"] },
            { cells: ["납부 비율", "85%", "85%", "100%+15%+15%", "85%", "100%+15%"], em: true },
          ],
        },
      ],
    },
    {
      label: "기관 등급별 처리",
      tables: [
        {
          caption: "정산 방식",
          headers: ["정산 구분", "수행 주체", "회계법인 역할"],
          rows: [
            { cells: ["위탁정산", "회계법인", "연차상시 + 마지막 연차 정산 모두 수행"] },
            { cells: ["자체정산", "수행기관", "연차상시만 수행 (마지막 연차 정산 제외)"] },
          ],
        },
        {
          caption: "기관 등급 × 정산구분별 납부 비율 (RDA1)",
          headers: ["기관 등급", "정산 구분", "연차상시", "정산", "비고"],
          rows: [
            { cells: ["일반", "위탁정산", "85%", "100%", "—"] },
            { cells: ["S (최우수)", "해당 없음", "0%", "0%", "산정기준액에서 완전 제외 — 연차상시도 수행 안 함"], em: true },
            { cells: ["A~C (우수)", "위탁정산", "85%", "100%", "면제 없음 — 일반과 동일"] },
          ],
          note: "KEIT/KETEP과 달리 A~C 등급도 면제 대상이 아님. S등급은 IITP와 동일하게 산정기준액 자체에서 완전 제외됨",
        },
      ],
    },
    {
      label: "과제 종류",
      tables: [
        {
          caption: "과제 종류",
          headers: ["항목", "내용"],
          rows: [
            { cells: ["자율성트랙", "없음 — 전부 일반과제로 처리"] },
            { cells: ["산정 기준", "현금+현물 합산 사업비 기준"] },
            { cells: ["최소수수료", "10만원 미만 산정 시 10만원으로 상향 청구"] },
            { cells: ["RDA1/RDA2 구분", "주관기관이 농촌진흥청 소속기관 목록에 없으면 RDA1이 자동 적용됨 (소속기관인 경우는 RDA2 탭 참고)"] },
          ],
        },
      ],
    },
  ],

  RDA2: [
    {
      label: "과제 구성 · 협약",
      tables: [
        {
          caption: "기본 구성",
          headers: ["항목", "내용"],
          rows: [
            { cells: ["적용 대상", "주관기관이 농촌진흥청 본청 또는 소속기관인 경우 RDA1 대신 자동 적용"], em: true },
            { cells: ["소속기관 목록", "농촌진흥청 · 국립농업과학원 · 국립식량과학원 · 농촌인력자원개발센터 · 국립원예특작과학원 · 국립축산과학원"] },
            { cells: ["수행기관 구성", "주관기관(농진청 소속) 1개 + 공동기관 0~N개"] },
            { cells: ["수수료 부담자", "주관기관이 전액 부담"] },
            { cells: ["산정 기준액", "현금 + 현물 합산 기준 (RDA1과 동일)"] },
            { cells: ["공문·세금계산서 발송", "주관기관 + 참여(공동)기관 모두에게 발송"], em: true },
          ],
        },
        {
          caption: "협약 방식",
          headers: ["협약 방식", "설명", "RCMS 단계", "정산 시점"],
          rows: [
            { cells: ["일괄협약", "전 기간을 처음에 한 번에 협약", "0단계", "마지막 연차 1회"] },
            { cells: ["단계협약", "기간을 나눠 2회 이상 협약", "1단계 · 2단계…", "각 단계 마지막 연차"] },
          ],
        },
      ],
    },
    {
      label: "수수료 납부 스케줄",
      tables: [
        {
          caption: "산정 방식 — 주관기관 완전 제외",
          headers: ["항목", "내용"],
          rows: [
            { cells: ["주관기관 처리", "등급과 무관하게 산정기준액에서 완전 제외 (RDA1과 다른 핵심 차이)"], em: true },
            { cells: ["공동기관 수 보정", "제외된 주관기관 몫을 보정하기 위해 공동기관 수를 -1 처리"] },
            { cells: ["배분 방식", "일반 수수료를 공동기관별 사업비 비율로 나누어 배분 표시"] },
          ],
          note: "예: 공동기관 3개 중 면제(S)기관 제외 후 2개가 남으면, -1 보정을 거쳐 1개 기준으로 산정",
        },
        {
          caption: "납부 방식",
          headers: ["업무 구분", "청구 비율", "내용"],
          rows: [
            { cells: ["연차상시", "85%", "매년 연구비 점검, 나머지 15%는 미청구로 이월"] },
            { cells: ["정산", "100% + 누적 이월", "마지막 연차 전체 정산 + 이전 연도 미청구 합산 청구"], em: true },
            { cells: ["최소수수료", "100,000원", "산정액이 10만원 미만이면 10만원으로 상향 청구"] },
          ],
        },
      ],
    },
    {
      label: "기관 등급별 처리",
      tables: [
        {
          caption: "기관 등급 × 정산구분별 납부 비율 (RDA2)",
          headers: ["기관 등급", "정산 구분", "연차상시", "정산", "비고"],
          rows: [
            { cells: ["주관기관", "해당 없음", "0%", "0%", "등급 무관 — 항상 산정기준액에서 완전 제외"], em: true },
            { cells: ["공동기관 · 일반", "위탁정산", "85%", "100%", "—"] },
            { cells: ["공동기관 · S (최우수)", "해당 없음", "0%", "0%", "산정기준액에서 완전 제외 — 연차상시도 수행 안 함"], em: true },
            { cells: ["공동기관 · A~C (우수)", "위탁정산", "85%", "100%", "면제 없음 — 일반과 동일"] },
          ],
          note: "RDA1과 동일하게 A~C는 면제 대상이 아니며 S등급은 완전 제외. RDA2는 여기에 더해 주관기관도 등급과 무관하게 항상 제외됨",
        },
      ],
    },
    {
      label: "과제 종류",
      tables: [
        {
          caption: "과제 종류",
          headers: ["항목", "내용"],
          rows: [
            { cells: ["자율성트랙", "없음 — 전부 일반과제로 처리"] },
            { cells: ["산정 기준", "현금+현물 합산 사업비 기준, 최소수수료 10만원"] },
            { cells: ["세금계산서 발행", "공동기관별 개별(분리) 발행 워크플로 미구현 — 현재는 참여기관 목록에서 배분된 산정액만 확인 가능"], em: true },
          ],
          note: "분리 청구가 필요한 경우 배분된 산정액을 참고해 수기로 세금계산서를 나누어 발행할 것",
        },
      ],
    },
  ],
};

function AgencyGuideModal({ agency }: { agency: FundingAgency }) {
  const { agencyGuides } = useStore();
  const canEdit = useCanWrite("funding-agencies");
  const baseTabs: GuideTab[] = agencyGuides[agency.shortName] ?? AGENCY_GUIDE[agency.shortName] ?? [];

  const [activeTab, setActiveTab] = useState(0);
  const [isEditing, setIsEditing] = useState(false);
  const [draft, setDraft] = useState<GuideTab[]>([]);

  const displayTabs = isEditing ? draft : baseTabs;
  const currentTab = displayTabs[Math.min(activeTab, displayTabs.length - 1)];

  function startEdit() { setDraft(JSON.parse(JSON.stringify(baseTabs))); setIsEditing(true); }
  function cancelEdit() { setIsEditing(false); }
  function saveEdit() { updateAgencyGuide(agency.shortName, draft); setIsEditing(false); }

  function setTabLabel(ti: number, label: string) {
    setDraft((d) => d.map((t, i) => i !== ti ? t : { ...t, label }));
  }
  function setCaption(ti: number, tbi: number, v: string) {
    setDraft((d) => d.map((t, i) => i !== ti ? t : {
      ...t, tables: t.tables.map((tbl, j) => j !== tbi ? tbl : { ...tbl, caption: v || undefined }),
    }));
  }
  function setNote(ti: number, tbi: number, v: string) {
    setDraft((d) => d.map((t, i) => i !== ti ? t : {
      ...t, tables: t.tables.map((tbl, j) => j !== tbi ? tbl : { ...tbl, note: v || undefined }),
    }));
  }
  function setCell(ti: number, tbi: number, ri: number, ci: number, v: string) {
    setDraft((d) => d.map((t, i) => i !== ti ? t : {
      ...t, tables: t.tables.map((tbl, j) => j !== tbi ? tbl : {
        ...tbl, rows: tbl.rows.map((row, k) => k !== ri ? row : {
          ...row, cells: row.cells.map((c, l) => l !== ci ? c : v),
        }),
      }),
    }));
  }
  function toggleRowEm(ti: number, tbi: number, ri: number) {
    setDraft((d) => d.map((t, i) => i !== ti ? t : {
      ...t, tables: t.tables.map((tbl, j) => j !== tbi ? tbl : {
        ...tbl, rows: tbl.rows.map((row, k) => k !== ri ? row : { ...row, em: !row.em }),
      }),
    }));
  }
  function addRow(ti: number, tbi: number) {
    const colCount = displayTabs[ti]?.tables[tbi]?.headers.length ?? 1;
    const newRow: GuideRow = { cells: Array(colCount).fill("") as string[] };
    setDraft((d) => d.map((t, i) => i !== ti ? t : {
      ...t, tables: t.tables.map((tbl, j) => j !== tbi ? tbl : { ...tbl, rows: [...tbl.rows, newRow] }),
    }));
  }
  function removeRow(ti: number, tbi: number, ri: number) {
    setDraft((d) => d.map((t, i) => i !== ti ? t : {
      ...t, tables: t.tables.map((tbl, j) => j !== tbi ? tbl : {
        ...tbl, rows: tbl.rows.filter((_, k) => k !== ri),
      }),
    }));
  }

  if (!currentTab) return <div className="p-6 text-center text-sm text-slate-400">운용 안내 정보가 없습니다.</div>;

  return (
    <div>
      {/* 탭바 + 편집 컨트롤 */}
      <div className="flex items-stretch justify-between border-b border-slate-200 sticky top-0 bg-white z-10">
        <div className="flex px-2 gap-0.5 overflow-x-auto">
          {displayTabs.map((tab, i) => (
            <button
              key={i}
              onClick={() => setActiveTab(i)}
              className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
                i === activeTab ? "border-blue-600 text-blue-700" : "border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300"
              }`}
            >
              {isEditing ? (
                <input
                  value={tab.label}
                  onChange={(e) => { e.stopPropagation(); setTabLabel(i, e.target.value); }}
                  onClick={(e) => { e.stopPropagation(); setActiveTab(i); }}
                  className="bg-transparent outline-none border-b border-dashed border-blue-300 text-sm font-medium w-24 text-center"
                />
              ) : tab.label}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2 px-4 shrink-0 border-l border-slate-100">
          {isEditing ? (
            <>
              <button onClick={cancelEdit} className="px-3 py-1.5 text-xs text-slate-600 hover:bg-slate-100 rounded-lg transition-colors">취소</button>
              <button onClick={saveEdit} className="px-3 py-1.5 text-xs font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors">저장</button>
            </>
          ) : canEdit && (
            <button onClick={startEdit} className="px-3 py-1.5 text-xs font-medium text-slate-600 border border-slate-200 hover:bg-slate-50 rounded-lg transition-colors">
              편집
            </button>
          )}
        </div>
      </div>

      {/* 탭 내용 */}
      <div className={`p-6 space-y-6 ${isEditing ? "bg-amber-50/20" : ""}`}>
        {currentTab.tables.map((tbl, tbi) => (
          <div key={tbi} className="space-y-2">
            {isEditing ? (
              <input
                value={tbl.caption ?? ""}
                onChange={(e) => setCaption(activeTab, tbi, e.target.value)}
                placeholder="표 제목 (선택)"
                className="text-xs font-semibold text-slate-600 uppercase tracking-wide border-b border-dashed border-slate-300 outline-none bg-transparent w-full placeholder-slate-300"
              />
            ) : tbl.caption && (
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">{tbl.caption}</p>
            )}
            <div className="overflow-x-auto rounded-xl border border-slate-200">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200">
                    {tbl.headers.map((h, hi) => (
                      <th key={hi} className="px-4 py-2.5 text-left text-xs font-semibold text-slate-600 whitespace-nowrap">{h}</th>
                    ))}
                    {isEditing && <th className="px-2 py-2.5 text-xs font-semibold text-slate-400 text-center w-16">조작</th>}
                  </tr>
                </thead>
                <tbody>
                  {tbl.rows.map((row, ri) => (
                    <tr key={ri} className={`border-b border-slate-50 last:border-0 ${row.em ? "bg-amber-50/70" : isEditing ? "" : "hover:bg-slate-50/50"}`}>
                      {row.cells.map((cell, ci) => {
                        const isSettlement = cell.includes("정산") && cell.includes("&");
                        const isExempt = cell.includes("면제") && !cell.includes("아님") && !cell.includes("없음");
                        const isFee = cell.includes("%");
                        const cellCls = isSettlement ? "text-violet-700 font-medium" : isExempt ? "text-emerald-700 font-medium" : isFee && row.em ? "font-bold text-blue-700" : "text-slate-700";
                        return (
                          <td key={ci} className={`px-4 py-2.5 whitespace-nowrap ${isEditing ? "text-slate-700" : cellCls}`}>
                            {isEditing ? (
                              <input
                                value={cell}
                                onChange={(e) => setCell(activeTab, tbi, ri, ci, e.target.value)}
                                className="w-full outline-none bg-transparent border-b border-dashed border-slate-300 focus:border-blue-400 text-sm min-w-15"
                              />
                            ) : cell}
                          </td>
                        );
                      })}
                      {isEditing && (
                        <td className="px-2 py-2.5 text-center">
                          <div className="flex items-center justify-center gap-1">
                            <button
                              onClick={() => toggleRowEm(activeTab, tbi, ri)}
                              title="강조 토글"
                              className={`w-5 h-5 rounded text-[10px] flex items-center justify-center transition-colors ${row.em ? "bg-amber-200 text-amber-700" : "bg-slate-100 text-slate-400 hover:bg-slate-200"}`}
                            >●</button>
                            <button
                              onClick={() => removeRow(activeTab, tbi, ri)}
                              title="행 삭제"
                              className="w-5 h-5 rounded text-[10px] flex items-center justify-center bg-red-50 text-red-400 hover:bg-red-100 transition-colors"
                            >✕</button>
                          </div>
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {isEditing && (
              <button onClick={() => addRow(activeTab, tbi)} className="text-xs text-blue-600 hover:text-blue-700 flex items-center gap-1 px-1">
                + 행 추가
              </button>
            )}
            {isEditing ? (
              <textarea
                value={tbl.note ?? ""}
                onChange={(e) => setNote(activeTab, tbi, e.target.value)}
                placeholder="※ 비고 (선택)"
                className="w-full text-[11px] text-slate-500 bg-white rounded-lg px-3 py-2 border border-slate-200 outline-none resize-none placeholder-slate-300"
                rows={2}
              />
            ) : tbl.note && (
              <p className="text-[11px] text-slate-400 bg-slate-50 rounded-lg px-3 py-2 leading-relaxed">※ {tbl.note}</p>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

type ModalState = { mode: "add" } | { mode: "edit"; target: FundingAgency } | { mode: "detail"; target: FundingAgency } | { mode: "guide"; target: FundingAgency };

const EMPTY: Omit<FundingAgency, "id"> = {
  name: "",
  shortName: "",
  code: "",
  contactName: "",
  contactEmail: "",
  contactPhone: "",
  status: "ACTIVE",
  registeredAt: new Date().toISOString().slice(0, 10),
  website: "",
  noticeRecipientScope: "LEAD_ONLY",
};

const NOTICE_SCOPE_LABEL: Record<FundingAgency["noticeRecipientScope"], string> = {
  LEAD_ONLY: "주관기관만",
  LEAD_AND_PARTICIPANTS: "주관+참여기관 모두",
};

const inputCls = "w-full text-sm border border-slate-200 rounded-lg px-3 py-2 text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-400";
const selectCls = `${inputCls} bg-white`;

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-xs font-medium text-slate-600 mb-1">{label}</label>
      {children}
    </div>
  );
}

function AgencyForm({
  agencyId,
  initial,
  feePolicies,
  onSubmit,
  onClose,
}: {
  agencyId: string | null;
  initial: Omit<FundingAgency, "id">;
  feePolicies: FeePolicy[];
  onSubmit: (d: Omit<FundingAgency, "id">) => void;
  onClose: () => void;
}) {
  const [form, setForm] = useState(initial);
  const s = (k: keyof typeof form, v: unknown) => setForm((p) => ({ ...p, [k]: v }));

  const activePolicy = agencyId
    ? feePolicies.find((p) => p.agencyId === agencyId && p.status === "ACTIVE")
    : undefined;
  const activeCommonPolicy = feePolicies.find((p) => p.agencyId === null && p.status === "ACTIVE");

  return (
    <div className="p-6 space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <Field label="정식명칭">
          <input className={inputCls} value={form.name} onChange={(e) => s("name", e.target.value)} placeholder="산업기술평가관리원" />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="약칭">
            <input className={inputCls} value={form.shortName} onChange={(e) => s("shortName", e.target.value)} placeholder="KEIT" />
          </Field>
          <Field label="기관 코드">
            <input className={inputCls} value={form.code} onChange={(e) => s("code", e.target.value)} placeholder="KEIT" />
          </Field>
        </div>
      </div>
      <div className="grid grid-cols-3 gap-4">
        <Field label="담당자명">
          <input className={inputCls} value={form.contactName} onChange={(e) => s("contactName", e.target.value)} placeholder="홍담당" />
        </Field>
        <Field label="이메일">
          <input className={inputCls} type="email" value={form.contactEmail} onChange={(e) => s("contactEmail", e.target.value)} placeholder="info@agency.re.kr" />
        </Field>
        <Field label="연락처">
          <input className={inputCls} value={form.contactPhone} onChange={(e) => s("contactPhone", e.target.value)} placeholder="042-000-0000" />
        </Field>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <Field label="수수료 정책 (진행중인 정책 자동 적용)">
          <div className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 bg-slate-50 flex items-center justify-between gap-2">
            {activePolicy ? (
              <span className="text-slate-700">
                <span className="font-medium">{activePolicy.name}</span> ({activePolicy.version}) · 자체 정책
              </span>
            ) : activeCommonPolicy ? (
              <span className="text-slate-500">
                {activeCommonPolicy.name} ({activeCommonPolicy.version}) · 공통 정책 사용 중
              </span>
            ) : (
              <span className="text-slate-400">
                {agencyId ? "적용 중인 정책 없음" : "저장 후 자동 적용됩니다"}
              </span>
            )}
            <Link href="/company-class" className="text-xs text-blue-600 hover:underline whitespace-nowrap">
              정책 관리 →
            </Link>
          </div>
        </Field>
        <Field label="상태">
          <select className={selectCls} value={form.status} onChange={(e) => s("status", e.target.value as FundingAgency["status"])}>
            <option value="ACTIVE">활성</option>
            <option value="INACTIVE">비활성</option>
          </select>
        </Field>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <Field label="공문·세금계산서 발송 대상">
          <select className={selectCls} value={form.noticeRecipientScope} onChange={(e) => s("noticeRecipientScope", e.target.value as FundingAgency["noticeRecipientScope"])}>
            <option value="LEAD_ONLY">주관기관만</option>
            <option value="LEAD_AND_PARTICIPANTS">주관+참여기관 모두</option>
          </select>
        </Field>
        <Field label="등록일">
          <DateInput className="w-full" value={form.registeredAt} onChange={(v) => s("registeredAt", v)} />
        </Field>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <Field label="웹사이트 (선택)">
          <input className={inputCls} value={form.website ?? ""} onChange={(e) => s("website", e.target.value)} placeholder="https://www.agency.re.kr" />
        </Field>
      </div>
      <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
        <button onClick={onClose} className="px-4 py-2 text-sm text-slate-600 hover:bg-slate-100 rounded-lg transition-colors">취소</button>
        <button onClick={() => onSubmit(form)} disabled={!form.name || !form.shortName} className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-40 transition-colors">저장</button>
      </div>
    </div>
  );
}

function DetailModal({ agency, projects, termFees, feePolicies, onClose }: {
  agency: FundingAgency;
  projects: { id: string; projectName: string; projectNumber: string; status: string; currentTerm: number; totalTerms: number }[];
  termFees: { projectNumber: string; appliedFee: number; status: string }[];
  feePolicies: FeePolicy[];
  onClose: () => void;
}) {
  const agencyProjects = projects.filter((p) => (p as unknown as { agencyId: string }).agencyId === agency.id);
  const agencyProjectNumbers = new Set(agencyProjects.map((p) => p.projectNumber));
  const agencyFees = termFees.filter((f) => agencyProjectNumbers.has(f.projectNumber));
  const totalFee = agencyFees.reduce((s, f) => s + f.appliedFee, 0);
  const billedFee = agencyFees.filter((f) => f.status === "BILLED").reduce((s, f) => s + f.appliedFee, 0);
  const ownPolicy = feePolicies.find((p) => p.agencyId === agency.id && p.status === "ACTIVE");

  return (
    <div className="p-6 space-y-5">
      <div className="grid grid-cols-3 gap-3">
        {[
          { label: "관리 과제", value: `${agencyProjects.length}건` },
          { label: "수수료 합계", value: fmtWon(totalFee) },
          { label: "청구 완료", value: fmtWon(billedFee) },
        ].map((c) => (
          <div key={c.label} className="bg-slate-50 rounded-xl border border-slate-200 px-4 py-3">
            <p className="text-xs text-slate-500">{c.label}</p>
            <p className="text-sm font-bold text-slate-800 mt-0.5">{c.value}</p>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-2 gap-3 text-sm">
        <div><span className="text-xs text-slate-400">담당자</span><p className="text-slate-700 mt-0.5">{agency.contactName} · {agency.contactPhone}</p></div>
        <div><span className="text-xs text-slate-400">이메일</span><p className="text-slate-700 mt-0.5">{agency.contactEmail}</p></div>
        <div><span className="text-xs text-slate-400">수수료 정책</span><p className="text-slate-700 mt-0.5">{ownPolicy ? `${ownPolicy.name} (${ownPolicy.version}) — 자체 정책` : "공통 정책 사용"}</p></div>
        <div><span className="text-xs text-slate-400">공문·세금계산서 발송 대상</span><p className="text-slate-700 mt-0.5">{NOTICE_SCOPE_LABEL[agency.noticeRecipientScope]}</p></div>
        <div><span className="text-xs text-slate-400">웹사이트</span>
          {agency.website ? (
            <a href={agency.website} target="_blank" rel="noreferrer" className="flex items-center gap-1 text-blue-600 hover:underline mt-0.5 text-sm">
              {agency.website} <FiExternalLink size={11} />
            </a>
          ) : <p className="text-slate-300 mt-0.5">—</p>}
        </div>
      </div>

      {agencyProjects.length > 0 && (
        <div>
          <p className="text-xs font-semibold text-slate-600 mb-2">관리 과제 목록</p>
          <div className="border border-slate-200 rounded-xl overflow-hidden">
            <table className="w-full text-xs">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-slate-500">
                  <th className="text-left px-4 py-2.5">과제번호</th>
                  <th className="text-left px-4 py-2.5">과제명</th>
                  <th className="text-center px-3 py-2.5">연차</th>
                  <th className="text-center px-3 py-2.5">상태</th>
                  <th className="w-8" />
                </tr>
              </thead>
              <tbody>
                {agencyProjects.map((p) => (
                  <tr
                    key={p.id}
                    className="border-b border-slate-50 last:border-0 hover:bg-blue-50/40 cursor-pointer transition-colors"
                    onClick={() => window.open(`/projects/${p.id}`, "_blank")}
                  >
                    <td className="px-4 py-2.5 font-mono text-slate-500 text-[11px]">{p.projectNumber}</td>
                    <td className="px-4 py-2.5 max-w-xs truncate">
                      <span className="text-blue-600 font-medium hover:underline">{p.projectName}</span>
                    </td>
                    <td className="px-3 py-2.5 text-center text-slate-600">{p.currentTerm}/{p.totalTerms}연차</td>
                    <td className="px-3 py-2.5 text-center">
                      <StatusBadge
                        label={p.status === "ACTIVE" ? "진행중" : p.status === "COMPLETED" ? "완료" : "중단"}
                        color={p.status === "ACTIVE" ? "green" : p.status === "COMPLETED" ? "slate" : "amber"}
                      />
                    </td>
                    <td className="px-3 py-2.5 text-center text-slate-300">
                      <FiExternalLink size={12} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <div className="flex justify-end pt-2 border-t border-slate-100">
        <button onClick={onClose} className="px-4 py-2 text-sm text-slate-600 hover:bg-slate-100 rounded-lg transition-colors">닫기</button>
      </div>
    </div>
  );
}

export default function FundingAgenciesPage() {
  const canEdit = useCanWrite("funding-agencies");
  const { fundingAgencies, projects, termFees, feePolicies } = useStore();
  const [modal, setModal] = useState<ModalState | null>(null);
  const [showUpload, setShowUpload] = useState(false);
  const [filterName,      setFilterName]      = useState("");
  const [filterShortName, setFilterShortName] = useState("");
  const [filterCode,      setFilterCode]      = useState("");

  const filtered = useMemo(
    () => fundingAgencies.filter((a) =>
      (filterName      === "" || a.name.includes(filterName)) &&
      (filterShortName === "" || a.shortName.includes(filterShortName)) &&
      (filterCode      === "" || a.code.includes(filterCode))
    ),
    [fundingAgencies, filterName, filterShortName, filterCode]
  );

  const stats = useMemo(() => {
    return fundingAgencies.map((agency) => {
      const agencyProjects = projects.filter((p) => (p as unknown as { agencyId: string }).agencyId === agency.id);
      const nums = new Set(agencyProjects.map((p) => p.projectNumber));
      const fees = termFees.filter((f) => nums.has(f.projectNumber));
      return {
        id: agency.id,
        projectCount: agencyProjects.length,
        totalFee: fees.reduce((s, f) => s + f.appliedFee, 0),
        billedFee: fees.filter((f) => f.status === "BILLED").reduce((s, f) => s + f.appliedFee, 0),
      };
    });
  }, [fundingAgencies, projects, termFees]);

  const statsById = Object.fromEntries(stats.map((s) => [s.id, s]));

  function handleSubmit(data: Omit<FundingAgency, "id">) {
    if (modal?.mode === "add") addFundingAgency(data);
    else if (modal?.mode === "edit") updateFundingAgency(modal.target.id, data);
    setModal(null);
  }

  const totalProjects = stats.reduce((s, a) => s + a.projectCount, 0);
  const totalFee = stats.reduce((s, a) => s + a.totalFee, 0);
  const activeCount = fundingAgencies.filter((a) => a.status === "ACTIVE").length;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-xs text-slate-500">전담기관 · 총 {fundingAgencies.length}개 기관</p>
        {canEdit && (
          <div className="flex items-center gap-2">
            <button onClick={downloadExcelTemplate} className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-600 bg-slate-50 border border-slate-200 rounded-lg hover:bg-slate-100 transition-colors">
              <svg viewBox="0 0 20 20" fill="currentColor" className="w-3.5 h-3.5"><path fillRule="evenodd" d="M3 17a1 1 0 0 1 1-1h12a1 1 0 1 1 0 2H4a1 1 0 0 1-1-1zM6.293 9.293a1 1 0 0 1 1.414 0L9 10.586V3a1 1 0 1 1 2 0v7.586l1.293-1.293a1 1 0 1 1 1.414 1.414l-3 3a1 1 0 0 1-1.414 0l-3-3a1 1 0 0 1 0-1.414z" clipRule="evenodd" /></svg>
              양식 다운로드
            </button>
            <button onClick={() => setShowUpload(true)} className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg hover:bg-emerald-100 transition-colors">
              <svg viewBox="0 0 20 20" fill="currentColor" className="w-3.5 h-3.5"><path fillRule="evenodd" d="M3 17a1 1 0 0 1 1-1h12a1 1 0 1 1 0 2H4a1 1 0 0 1-1-1zM6.293 6.707a1 1 0 0 1 0-1.414l3-3a1 1 0 0 1 1.414 0l3 3a1 1 0 0 1-1.414 1.414L11 5.414V13a1 1 0 1 1-2 0V5.414L7.707 6.707a1 1 0 0 1-1.414 0z" clipRule="evenodd" /></svg>
              엑셀 업로드
            </button>
            <button onClick={() => setModal({ mode: "add" })} className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors">
              <svg viewBox="0 0 20 20" fill="currentColor" className="w-3.5 h-3.5"><path d="M10.75 4.75a.75.75 0 0 0-1.5 0v4.5h-4.5a.75.75 0 0 0 0 1.5h4.5v4.5a.75.75 0 0 0 1.5 0v-4.5h4.5a.75.75 0 0 0 0-1.5h-4.5v-4.5z" /></svg>
              전담기관 추가
            </button>
          </div>
        )}
      </div>

      <div className="grid grid-cols-4 gap-3">
        {[
          { label: "전담기관 수", value: `${fundingAgencies.length}개` },
          { label: "활성 기관", value: `${activeCount}개` },
          { label: "관리 과제 수", value: `${totalProjects}건` },
          { label: "수수료 합계", value: fmtWon(totalFee) },
        ].map((c) => (
          <div key={c.label} className="bg-white rounded-xl border border-slate-200 px-4 py-3">
            <p className="text-xs text-slate-500">{c.label}</p>
            <p className="text-sm font-bold text-slate-800 mt-0.5">{c.value}</p>
          </div>
        ))}
      </div>

      <div className="bg-white rounded-xl border border-slate-200 px-4 py-3 grid grid-cols-3 gap-3">
        {[
          { label: "기관명", value: filterName,      onChange: setFilterName      },
          { label: "약칭",   value: filterShortName, onChange: setFilterShortName },
          { label: "코드",   value: filterCode,      onChange: setFilterCode      },
        ].map(({ label, value, onChange }) => (
          <div key={label}>
            <p className="text-[10px] font-medium text-slate-400 mb-1">{label}</p>
            <input
              type="text"
              value={value}
              onChange={(e) => onChange(e.target.value)}
              placeholder={`${label} 검색...`}
              className="w-full text-sm border border-slate-200 rounded-lg px-3 py-1.5 text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-400"
            />
          </div>
        ))}
      </div>

      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-100 bg-slate-50">
              <th className="text-left px-5 py-3 text-xs font-medium text-slate-500">전담기관명</th>
              <th className="text-center px-4 py-3 text-xs font-medium text-slate-500 whitespace-nowrap">약칭</th>
              <th className="text-center px-4 py-3 text-xs font-medium text-slate-500 whitespace-nowrap">수수료 정책</th>
              <th className="text-center px-4 py-3 text-xs font-medium text-slate-500 whitespace-nowrap">발송 대상</th>
              <th className="text-center px-4 py-3 text-xs font-medium text-slate-500 whitespace-nowrap">관리 과제</th>
              <th className="text-right px-4 py-3 text-xs font-medium text-slate-500 whitespace-nowrap">수수료 합계</th>
              <th className="text-right px-4 py-3 text-xs font-medium text-slate-500 whitespace-nowrap">청구 완료</th>
              <th className="text-center px-4 py-3 text-xs font-medium text-slate-500 whitespace-nowrap">상태</th>
              <th className="text-center px-4 py-3 text-xs font-medium text-slate-500 whitespace-nowrap">등록일</th>
              <th className="text-center px-4 py-3 text-xs font-medium text-slate-500 whitespace-nowrap">관리</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr><td colSpan={10} className="px-4 py-10 text-center text-sm text-slate-400">검색 결과가 없습니다</td></tr>
            ) : (
              filtered.map((agency) => {
                const st = statsById[agency.id] ?? { projectCount: 0, totalFee: 0, billedFee: 0 };
                const ownPolicy = feePolicies.find((p) => p.agencyId === agency.id && p.status === "ACTIVE");
                return (
                  <tr key={agency.id} className="border-b border-slate-50 hover:bg-slate-50 transition-colors">
                    <td className="px-5 py-4">
                      <button
                        onClick={() => setModal({ mode: "detail", target: agency })}
                        className="text-left"
                      >
                        <p className="font-semibold text-slate-800 hover:text-blue-600 transition-colors">{agency.name}</p>
                        <p className="text-xs text-slate-400 mt-0.5">{agency.contactName} · {agency.contactPhone}</p>
                      </button>
                    </td>
                    <td className="px-4 py-4 text-center">
                      <span className="inline-block font-mono text-xs font-semibold text-blue-700 bg-blue-50 px-2 py-0.5 rounded">{agency.shortName}</span>
                    </td>
                    <td className="px-4 py-4 text-center">
                      {ownPolicy ? (
                        <StatusBadge label="자체 정책" color="purple" />
                      ) : (
                        <StatusBadge label="공통 정책" color="slate" />
                      )}
                    </td>
                    <td className="px-4 py-4 text-center">
                      <StatusBadge
                        label={NOTICE_SCOPE_LABEL[agency.noticeRecipientScope]}
                        color={agency.noticeRecipientScope === "LEAD_AND_PARTICIPANTS" ? "amber" : "slate"}
                      />
                    </td>
                    <td className="px-4 py-4 text-center text-sm font-medium text-slate-700">{st.projectCount}건</td>
                    <td className="px-4 py-4 text-right text-sm font-medium text-slate-800 whitespace-nowrap">{fmtWon(st.totalFee)}</td>
                    <td className="px-4 py-4 text-right text-sm text-green-700 font-medium whitespace-nowrap">{fmtWon(st.billedFee)}</td>
                    <td className="px-4 py-4 text-center">
                      <StatusBadge label={agency.status === "ACTIVE" ? "활성" : "비활성"} color={agency.status === "ACTIVE" ? "green" : "slate"} />
                    </td>
                    <td className="px-4 py-4 text-center text-xs text-slate-500 whitespace-nowrap">{fmtDate(agency.registeredAt)}</td>
                    <td className="px-4 py-4 text-center">
                      <div className="flex items-center justify-center gap-1.5">
                        {AGENCY_GUIDE[agency.shortName] && (
                          <button
                            onClick={() => setModal({ mode: "guide", target: agency })}
                            className="px-2 py-1 text-[11px] font-medium text-indigo-600 bg-indigo-50 hover:bg-indigo-100 rounded transition-colors whitespace-nowrap"
                          >
                            운용 안내
                          </button>
                        )}
                        {canEdit && (
                          <button onClick={() => setModal({ mode: "edit", target: agency })} className="p-1.5 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded transition-colors" title="수정">
                            <FiEdit2 size={14} />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
        <div className="px-5 py-2.5 border-t border-slate-100 text-xs text-slate-400">
          총 {filtered.length}개 표시 (전체 {fundingAgencies.length}개)
        </div>
      </div>

      {modal?.mode === "detail" && (
        <Modal title={`${modal.target.name} (${modal.target.shortName})`} onClose={() => setModal(null)} size="xl">
          <DetailModal
            agency={modal.target}
            projects={projects}
            termFees={termFees}
            feePolicies={feePolicies}
            onClose={() => setModal(null)}
          />
        </Modal>
      )}

      {showUpload && <ExcelUploadModal onClose={() => setShowUpload(false)} />}

      {modal?.mode === "guide" && (
        <Modal
          title={`${modal.target.name} (${modal.target.shortName}) — 운용 안내`}
          onClose={() => setModal(null)}
          size="xl"
        >
          <AgencyGuideModal agency={modal.target} />
        </Modal>
      )}

      {(modal?.mode === "add" || modal?.mode === "edit") && (
        <Modal
          title={modal.mode === "add" ? "전담기관 추가" : "전담기관 수정"}
          onClose={() => setModal(null)}
          size="xl"
        >
          <AgencyForm
            agencyId={modal.mode === "edit" ? modal.target.id : null}
            initial={modal.mode === "edit" ? modal.target : EMPTY}
            feePolicies={feePolicies}
            onSubmit={handleSubmit}
            onClose={() => setModal(null)}
          />
        </Modal>
      )}
    </div>
  );
}
