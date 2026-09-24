import { File, Paths } from "expo-file-system";
import * as Print from "expo-print";
import * as Sharing from "expo-sharing";
import { formatPlanDate, isoDate, personName, stripHtml } from "@/lib/dates";
import type { WorkPlanExpenseRecord, WorkPlanRecord, WorkPlanVisitRecord, WorkPlanWorkRecord } from "@/types/workPlanner";

export type ReportColumn = { key: string; label: string };
export type ReportRow = Record<string, string | number | null | undefined>;

function u16(n: number): Uint8Array {
  return Uint8Array.of(n & 0xff, (n >> 8) & 0xff);
}

function u32(n: number): Uint8Array {
  return Uint8Array.of(n & 0xff, (n >> 8) & 0xff, (n >> 16) & 0xff, (n >> 24) & 0xff);
}

function concatBytes(chunks: Uint8Array[]): Uint8Array {
  const out = new Uint8Array(chunks.reduce((sum, chunk) => sum + chunk.length, 0));
  let pos = 0;
  for (const chunk of chunks) {
    out.set(chunk, pos);
    pos += chunk.length;
  }
  return out;
}

const CRC32_TABLE = new Uint32Array(256);
for (let i = 0; i < 256; i += 1) {
  let c = i;
  for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  CRC32_TABLE[i] = c >>> 0;
}

function crc32(bytes: Uint8Array): number {
  let c = 0xffffffff;
  for (let i = 0; i < bytes.length; i += 1) c = CRC32_TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function zipStore(files: Array<{ name: string; data: Uint8Array }>): Uint8Array {
  const encoder = new TextEncoder();
  const localParts: Uint8Array[] = [];
  const centralParts: Uint8Array[] = [];
  let offset = 0;
  for (const file of files) {
    const nameBytes = encoder.encode(file.name);
    const crc = crc32(file.data);
    const localHeader = concatBytes([
      u32(0x04034b50),
      u16(20),
      u16(0),
      u16(0),
      u16(0),
      u16(0),
      u32(crc),
      u32(file.data.length),
      u32(file.data.length),
      u16(nameBytes.length),
      u16(0),
      nameBytes,
    ]);
    localParts.push(localHeader, file.data);
    centralParts.push(
      concatBytes([
        u32(0x02014b50),
        u16(20),
        u16(20),
        u16(0),
        u16(0),
        u16(0),
        u16(0),
        u32(crc),
        u32(file.data.length),
        u32(file.data.length),
        u16(nameBytes.length),
        u16(0),
        u16(0),
        u16(0),
        u16(0),
        u32(0),
        u32(offset),
        nameBytes,
      ]),
    );
    offset += localHeader.length + file.data.length;
  }
  const central = concatBytes(centralParts);
  const end = concatBytes([
    u32(0x06054b50),
    u16(0),
    u16(0),
    u16(files.length),
    u16(files.length),
    u32(central.length),
    u32(offset),
    u16(0),
  ]);
  return concatBytes([...localParts, central, end]);
}

function xmlEscape(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function colLetter(index: number) {
  let n = index;
  let s = "";
  while (n >= 0) {
    s = String.fromCharCode((n % 26) + 65) + s;
    n = Math.floor(n / 26) - 1;
  }
  return s;
}

function toBase64(bytes: Uint8Array) {
  let binary = "";
  const size = 0x2000;
  for (let i = 0; i < bytes.length; i += size) {
    binary += String.fromCharCode(...bytes.subarray(i, i + size));
  }
  return globalThis.btoa(binary);
}

function clock(value?: string | null) {
  if (!value) return "—";
  const match = String(value).match(/T(\d{2}:\d{2})/);
  if (match) return match[1];
  if (/^\d{2}:\d{2}/.test(value)) return value.slice(0, 5);
  return value;
}

function statusLabel(value?: string | null) {
  return String(value || "—").replace(/_/g, " ").toUpperCase();
}

function ownerEmail(user: WorkPlanRecord["sales_user"]) {
  return typeof user === "object" ? user?.email || "" : "";
}

async function shareFile(uri: string, mimeType: string, uti: string) {
  if (!(await Sharing.isAvailableAsync())) {
    throw new Error("Sharing is not available on this device");
  }
  await Sharing.shareAsync(uri, { mimeType, UTI: uti });
}

export async function shareExcelReport(options: {
  filename: string;
  sheetName: string;
  title: string;
  columns: ReportColumn[];
  rows: ReportRow[];
}) {
  const encoder = new TextEncoder();
  const safeSheet = options.sheetName.replace(/[\\/*?:[\]]/g, "_").slice(0, 31) || "Sheet1";
  const sheetRows: string[] = [];
  let rowIdx = 1;
  sheetRows.push(`<row r="${rowIdx}"><c r="A${rowIdx}" t="inlineStr"><is><t>${xmlEscape(options.title)}</t></is></c></row>`);
  rowIdx += 2;
  sheetRows.push(
    `<row r="${rowIdx}">${options.columns
      .map((col, i) => `<c r="${colLetter(i)}${rowIdx}" t="inlineStr"><is><t>${xmlEscape(col.label)}</t></is></c>`)
      .join("")}</row>`,
  );
  rowIdx += 1;
  for (const row of options.rows) {
    const cells = options.columns
      .map((col, i) => {
        const text = xmlEscape(stripHtml(String(row[col.key] ?? "")));
        return `<c r="${colLetter(i)}${rowIdx}" t="inlineStr"><is><t>${text}</t></is></c>`;
      })
      .join("");
    sheetRows.push(`<row r="${rowIdx}">${cells}</row>`);
    rowIdx += 1;
  }
  const lastCol = colLetter(Math.max(0, options.columns.length - 1));
  const sheetXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <dimension ref="A1:${lastCol}${Math.max(1, rowIdx - 1)}"/>
  <sheetData>${sheetRows.join("")}</sheetData>
</worksheet>`;
  const bytes = zipStore([
    {
      name: "[Content_Types].xml",
      data: encoder.encode(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
  <Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>
</Types>`),
    },
    {
      name: "_rels/.rels",
      data: encoder.encode(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
</Relationships>`),
    },
    {
      name: "xl/workbook.xml",
      data: encoder.encode(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <sheets><sheet name="${xmlEscape(safeSheet)}" sheetId="1" r:id="rId1"/></sheets>
</workbook>`),
    },
    {
      name: "xl/_rels/workbook.xml.rels",
      data: encoder.encode(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>
</Relationships>`),
    },
    { name: "xl/worksheets/sheet1.xml", data: encoder.encode(sheetXml) },
  ]);
  const filename = options.filename.endsWith(".xlsx") ? options.filename : `${options.filename}.xlsx`;
  const file = new File(Paths.cache, filename);
  file.create({ overwrite: true });
  file.write(toBase64(bytes), { encoding: "base64" });
  await shareFile(file.uri, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "org.openxmlformats.spreadsheetml.sheet");
}

export async function sharePdfReport(options: {
  filename: string;
  title: string;
  subtitle: string;
  company: string;
  columns: ReportColumn[];
  rows: ReportRow[];
}) {
  const head = options.columns.map((col) => `<th>${xmlEscape(col.label)}</th>`).join("");
  const body = options.rows
    .map(
      (row) =>
        `<tr>${options.columns.map((col) => `<td>${xmlEscape(stripHtml(String(row[col.key] ?? "")))}</td>`).join("")}</tr>`,
    )
    .join("");
  const html = `<!DOCTYPE html><html><head><meta charset="utf-8"/>
<style>
  body { font-family: -apple-system, sans-serif; color: #111; padding: 16px; }
  h1 { font-size: 18px; margin: 0 0 4px; }
  p { font-size: 11px; color: #555; margin: 0 0 12px; }
  table { width: 100%; border-collapse: collapse; font-size: 9px; }
  th, td { border: 1px solid #ddd; padding: 4px; text-align: left; vertical-align: top; }
  th { background: #f4f4f5; }
</style></head><body>
<h1>${xmlEscape(options.title)}</h1>
<p>${xmlEscape(options.company)} · ${xmlEscape(options.subtitle)}</p>
<table><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table>
</body></html>`;
  const printed = await Print.printToFileAsync({ html });
  await shareFile(printed.uri, "application/pdf", "com.adobe.pdf");
}

function visitParty(visit: WorkPlanVisitRecord) {
  return visit.party_name || (typeof visit.party === "object" ? visit.party?.party_name : "") || "Field visit";
}

export function buildPlanReportRows(plans: WorkPlanRecord[], activity: "all" | "visits" | "tasks", itemStatus: string, search: string) {
  const rows: ReportRow[] = [];
  const needle = search.trim().toLowerCase();
  let planIndex = 0;
  for (const plan of plans) {
    const visits = (plan.visits || []).filter((visit) => {
      if (activity === "tasks") return false;
      if (itemStatus !== "all" && visit.status !== itemStatus) return false;
      return true;
    });
    const tasks = (plan.works || []).filter((work) => {
      if (activity === "visits") return false;
      if (itemStatus !== "all" && work.status !== itemStatus) return false;
      return true;
    });
    if (activity === "visits" && visits.length === 0) continue;
    if (activity === "tasks" && tasks.length === 0) continue;
    const executive = personName(plan.sales_user) || "—";
    const discussed = plan.is_discussed_with_manager
      ? `Discussed with ${plan.discussed_manager_name || "manager"}`
      : "";
    const remarks = [stripHtml(plan.remarks), discussed].filter(Boolean).join(" | ") || "—";
    const haystack = `${executive} ${plan.location || ""} ${plan.plan_type || ""} ${remarks} ${visits.map(visitParty).join(" ")} ${tasks.map((work) => work.title).join(" ")}`.toLowerCase();
    if (needle && !haystack.includes(needle)) continue;
    planIndex += 1;
    const visitCount = visits.length;
    const taskCount = tasks.length;
    rows.push({
      hierarchyId: String(planIndex),
      rowType: "WORK PLAN",
      date: formatPlanDate(plan.plan_date),
      executive,
      activity: plan.plan_type === "Visits" ? `Visits plan (${visitCount})` : `${plan.plan_type || "Plan"} (${taskCount} tasks)`,
      details: plan.location || "—",
      plannedTime: "Full day",
      status: statusLabel(plan.status),
      remarks,
    });
    visits.forEach((visit, index) => {
      rows.push({
        hierarchyId: `${planIndex}.${index + 1}`,
        rowType: "FIELD VISIT",
        date: formatPlanDate(plan.plan_date),
        executive,
        activity: `Field visit: ${visitParty(visit)}`,
        details: [visit.contact_person, visit.contact_number || visit.phone, visit.address || plan.location].filter(Boolean).join(" | ") || "—",
        plannedTime: clock(visit.planned_start_time),
        status: statusLabel(visit.status),
        remarks: stripHtml(visit.outcome || visit.notes || visit.purpose) || "—",
      });
    });
    tasks.forEach((work, index) => {
      rows.push({
        hierarchyId: `${planIndex}.${visitCount + index + 1}`,
        rowType: "WORK TASK",
        date: formatPlanDate(plan.plan_date),
        executive,
        activity: `Work task: ${work.title}`,
        details: stripHtml(work.description) || plan.location || "—",
        plannedTime: clock(work.planned_start_time),
        status: statusLabel(work.status),
        remarks: stripHtml(work.completion_remarks || work.outcome) || "—",
      });
    });
  }
  return rows;
}

export const PLAN_COLUMNS: ReportColumn[] = [
  { key: "hierarchyId", label: "#" },
  { key: "rowType", label: "Record level" },
  { key: "date", label: "Plan date" },
  { key: "executive", label: "Executive" },
  { key: "activity", label: "Activity" },
  { key: "details", label: "Contact / address / details" },
  { key: "plannedTime", label: "Schedule" },
  { key: "status", label: "Status" },
  { key: "remarks", label: "Remarks / outcome" },
];

export function buildTaskReportRows(plans: WorkPlanRecord[], category: "all" | "visits" | "tasks", status: string, search: string, from: string, to: string) {
  const rows: ReportRow[] = [];
  const needle = search.trim().toLowerCase();
  const push = (item: {
    planDate: string;
    itemType: "visit" | "task";
    executiveName: string;
    executiveEmail: string;
    titleOrParty: string;
    contactPerson: string;
    contactNumber: string;
    locationOrAddress: string;
    descriptionOrNotes: string;
    plannedTime: string;
    status: string;
  }) => {
    const day = isoDate(item.planDate);
    if (from && day && day < from) return;
    if (to && day && day > to) return;
    if (category === "visits" && item.itemType !== "visit") return;
    if (category === "tasks" && item.itemType !== "task") return;
    if (status !== "all" && item.status !== status) return;
    const text = `${item.titleOrParty} ${item.executiveName} ${item.contactPerson} ${item.locationOrAddress} ${item.descriptionOrNotes} ${item.status}`.toLowerCase();
    if (needle && !text.includes(needle)) return;
    rows.push({
      planDate: formatPlanDate(item.planDate),
      itemType: item.itemType === "visit" ? "Field visit" : "Work task",
      executiveName: item.executiveName,
      executiveEmail: item.executiveEmail,
      titleOrParty: item.titleOrParty,
      contactPerson: item.contactPerson,
      contactNumber: item.contactNumber,
      locationOrAddress: item.locationOrAddress,
      descriptionOrNotes: item.descriptionOrNotes,
      plannedTime: item.plannedTime,
      status: statusLabel(item.status),
    });
  };
  for (const plan of plans) {
    const executiveName = personName(plan.sales_user) || "—";
    const email = ownerEmail(plan.sales_user);
    for (const visit of plan.visits || []) {
      push({
        planDate: plan.plan_date,
        itemType: "visit",
        executiveName,
        executiveEmail: email,
        titleOrParty: visitParty(visit),
        contactPerson: visit.contact_person || "—",
        contactNumber: visit.contact_number || visit.phone || "—",
        locationOrAddress: visit.address || plan.location || "—",
        descriptionOrNotes: stripHtml(visit.purpose || visit.notes) || "—",
        plannedTime: clock(visit.planned_start_time),
        status: visit.status || "created",
      });
    }
    for (const work of plan.works || []) {
      push({
        planDate: plan.plan_date,
        itemType: "task",
        executiveName,
        executiveEmail: email,
        titleOrParty: work.title || "Work task",
        contactPerson: "—",
        contactNumber: "—",
        locationOrAddress: plan.location || "Office / remote",
        descriptionOrNotes: stripHtml(work.description) || "—",
        plannedTime: clock(work.planned_start_time),
        status: work.status || "created",
      });
    }
  }
  return rows;
}

export const TASK_COLUMNS: ReportColumn[] = [
  { key: "planDate", label: "Plan date" },
  { key: "itemType", label: "Category" },
  { key: "executiveName", label: "Executive name" },
  { key: "executiveEmail", label: "Executive email" },
  { key: "titleOrParty", label: "Party / task title" },
  { key: "contactPerson", label: "Contact person" },
  { key: "contactNumber", label: "Contact number" },
  { key: "locationOrAddress", label: "Location / address" },
  { key: "descriptionOrNotes", label: "Purpose / description" },
  { key: "plannedTime", label: "Planned schedule" },
  { key: "status", label: "Status" },
];

function expenseOwner(expense: WorkPlanExpenseRecord) {
  if (typeof expense.work_plan === "object" && expense.work_plan?.sales_user) return personName(expense.work_plan.sales_user);
  return personName(expense.sales_user);
}

export function buildExpenseReportRows(expenses: WorkPlanExpenseRecord[], paymentMode: string, search: string) {
  const needle = search.trim().toLowerCase();
  return expenses
    .filter((expense) => {
      if (paymentMode !== "all" && expense.payment_mode !== paymentMode) return false;
      const owner = expenseOwner(expense);
      const text = `${owner} ${expense.category} ${expense.sub_category || ""} ${expense.vendor_name || ""} ${expense.bill_number || ""} ${expense.description || ""} ${expense.status} ${expense.amount}`.toLowerCase();
      return !needle || text.includes(needle);
    })
    .map((expense, index) => {
      const odometer =
        expense.start_reading != null || expense.closing_reading != null
          ? `${expense.start_reading ?? "—"} -> ${expense.closing_reading ?? "—"}`
          : "—";
      const visit = expense.work_plan_visit;
      const visitPartyName =
        visit && typeof visit === "object"
          ? visit.party_name || (typeof visit.party === "object" ? visit.party?.party_name : "") || "Visit"
          : visit
            ? "Visit"
            : "—";
      return {
        rowNum: index + 1,
        expense_date: formatPlanDate(expense.expense_date),
        sales_user: expenseOwner(expense) || "—",
        category: expense.category || "Other",
        sub_category: expense.sub_category || "—",
        amount: Number(expense.amount) || 0,
        payment_mode: expense.payment_mode || "Cash",
        vendor_name: expense.vendor_name || "—",
        bill_number: expense.bill_number || "—",
        bill_date: formatPlanDate(expense.bill_date),
        visit_party: visitPartyName,
        odometer,
        status: statusLabel(expense.status),
        description: expense.description || "—",
      } satisfies ReportRow;
    });
}

export const EXPENSE_COLUMNS: ReportColumn[] = [
  { key: "rowNum", label: "#" },
  { key: "expense_date", label: "Date" },
  { key: "sales_user", label: "Executive" },
  { key: "category", label: "Category" },
  { key: "sub_category", label: "Sub category" },
  { key: "amount", label: "Amount (₹)" },
  { key: "payment_mode", label: "Payment mode" },
  { key: "vendor_name", label: "Vendor" },
  { key: "bill_number", label: "Bill / invoice" },
  { key: "bill_date", label: "Bill date" },
  { key: "visit_party", label: "Linked visit" },
  { key: "odometer", label: "Odometer" },
  { key: "status", label: "Status" },
  { key: "description", label: "Description" },
];
