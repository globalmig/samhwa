import ExcelJS from "exceljs";

// 엑셀 "양식 다운로드" 파일들의 공통 스타일 유틸 — exceljs로 생성한다
// (xlsx 무료버전은 셀 색상·드롭다운(데이터 유효성 검사)을 저장하지 못해서 별도로 둔다).
// 업로드(읽기) 쪽은 여전히 xlsx를 쓰고, "쓰기" 전용으로만 이 유틸들을 쓴다.

export const TEMPLATE_HEADER_FILL: ExcelJS.Fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1D4ED8" } };
export const TEMPLATE_REQUIRED_FILL: ExcelJS.Fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFEE2E2" } };
export const TEMPLATE_OPTIONAL_FILL: ExcelJS.Fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF1F5F9" } };
export const TEMPLATE_STRIPE_FILL: ExcelJS.Fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF8FAFC" } };
export const TEMPLATE_BORDER: Partial<ExcelJS.Borders> = {
  top: { style: "thin", color: { argb: "FFE2E8F0" } },
  left: { style: "thin", color: { argb: "FFE2E8F0" } },
  bottom: { style: "thin", color: { argb: "FFE2E8F0" } },
  right: { style: "thin", color: { argb: "FFE2E8F0" } },
};

// 샘플 행 아래로 사용자가 직접 입력할 빈 행까지 드롭다운이 미리 적용되어 있도록 여유를 둔다.
export const TEMPLATE_BLANK_ROWS = 200;

// notes 행(※필수/선택 안내)과 headers 행을 색칠한다 — 필수는 붉은 계열, 선택은 회색 계열로 구분.
export function styleTemplateHeader(ws: ExcelJS.Worksheet, notes: string[], headerRowNum: number) {
  const noteRow = ws.getRow(headerRowNum - 1);
  const headerRow = ws.getRow(headerRowNum);
  notes.forEach((note, i) => {
    const cell = noteRow.getCell(i + 1);
    const required = note.startsWith("※필수");
    cell.fill = required ? TEMPLATE_REQUIRED_FILL : TEMPLATE_OPTIONAL_FILL;
    cell.font = { size: 9, italic: true, color: { argb: required ? "FFB91C1C" : "FF64748B" } };
    cell.alignment = { vertical: "middle", wrapText: true };
    cell.border = TEMPLATE_BORDER;
  });
  headerRow.eachCell((cell) => {
    cell.fill = TEMPLATE_HEADER_FILL;
    cell.font = { bold: true, color: { argb: "FFFFFFFF" }, size: 11 };
    cell.alignment = { vertical: "middle", horizontal: "center" };
    cell.border = TEMPLATE_BORDER;
  });
  noteRow.height = 30;
  headerRow.height = 20;
}

// 데이터 행(샘플 + 사용자가 채울 빈 행)에 옅은 줄무늬 배경 + 테두리를 준다.
export function styleTemplateDataRows(ws: ExcelJS.Worksheet, fromRow: number, toRow: number, colCount: number) {
  for (let r = fromRow; r <= toRow; r++) {
    const row = ws.getRow(r);
    const striped = (r - fromRow) % 2 === 1;
    for (let c = 1; c <= colCount; c++) {
      const cell = row.getCell(c);
      cell.border = TEMPLATE_BORDER;
      if (striped) cell.fill = TEMPLATE_STRIPE_FILL;
    }
  }
}

// 특정 컬럼(1-based)에 드롭다운(목록 유효성 검사)을 지정된 행 범위에 적용한다.
export function applyDropdown(ws: ExcelJS.Worksheet, col: number, options: string[], fromRow: number, toRow: number) {
  const formula = `"${options.join(",")}"`;
  for (let r = fromRow; r <= toRow; r++) {
    ws.getCell(r, col).dataValidation = {
      type: "list",
      allowBlank: true,
      formulae: [formula],
      showErrorMessage: true,
      errorStyle: "warning",
      error: "목록에 없는 값입니다. 필요하면 무시하고 계속 입력할 수 있습니다.",
    };
  }
}

export async function downloadWorkbook(wb: ExcelJS.Workbook, filename: string) {
  const buffer = await wb.xlsx.writeBuffer();
  const blob = new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
