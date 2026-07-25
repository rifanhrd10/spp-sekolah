type ExcelCell = string | number | boolean | Date | null | undefined;

export type ExcelSheet = {
  name: string;
  rows: ExcelCell[][];
};

function xmlEscape(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function sheetName(value: string) {
  return xmlEscape(value.replace(/[\\/?*:[\]]/g, " ").slice(0, 31) || "Sheet");
}

function cellXml(value: ExcelCell) {
  if (value === null || value === undefined) {
    return "<Cell><Data ss:Type=\"String\"></Data></Cell>";
  }

  if (typeof value === "number" && Number.isFinite(value)) {
    return `<Cell><Data ss:Type="Number">${value}</Data></Cell>`;
  }

  if (typeof value === "boolean") {
    return `<Cell><Data ss:Type="String">${value ? "Ya" : "Tidak"}</Data></Cell>`;
  }

  const text = value instanceof Date
    ? value.toISOString().slice(0, 10)
    : String(value);

  return `<Cell><Data ss:Type="String">${xmlEscape(text)}</Data></Cell>`;
}

export function excelXml(sheets: ExcelSheet[]) {
  return `<?xml version="1.0" encoding="UTF-8"?>
<?mso-application progid="Excel.Sheet"?>
<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet"
  xmlns:o="urn:schemas-microsoft-com:office:office"
  xmlns:x="urn:schemas-microsoft-com:office:excel"
  xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet">
  ${sheets.map((sheet) => `
  <Worksheet ss:Name="${sheetName(sheet.name)}">
    <Table>
      ${sheet.rows.map((row) => `<Row>${row.map(cellXml).join("")}</Row>`).join("\n      ")}
    </Table>
  </Worksheet>`).join("\n")}
</Workbook>`;
}

export function excelResponse(filename: string, sheets: ExcelSheet[]) {
  return new Response(excelXml(sheets), {
    status: 200,
    headers: {
      "Content-Type": "application/vnd.ms-excel; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}
