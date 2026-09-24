export function todayISO(): string {
  const d = new Date();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${month}-${day}`;
}

export function shiftISO(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00`);
  d.setDate(d.getDate() + days);
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${month}-${day}`;
}

export function monthBounds(year: number, monthIndex: number): { from: string; to: string } {
  const from = new Date(year, monthIndex, 1);
  const to = new Date(year, monthIndex + 1, 0);
  const fmt = (d: Date) => {
    const month = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${d.getFullYear()}-${month}-${day}`;
  };
  return { from: fmt(from), to: fmt(to) };
}

export function formatPlanDate(dateVal?: string | null): string {
  if (!dateVal) return "—";
  const d = new Date(String(dateVal));
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

export function isoDate(dateVal?: string | null): string {
  if (!dateVal) return "";
  const d = new Date(String(dateVal));
  if (Number.isNaN(d.getTime())) return String(dateVal).slice(0, 10);
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${month}-${day}`;
}

export function stripHtml(html?: string | null): string {
  if (!html) return "";
  return String(html)
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .trim();
}

export function personName(
  user?: string | { _id?: string; id?: string; name?: string; email?: string } | null,
): string {
  if (!user) return "";
  if (typeof user === "string") return "";
  return user.name || user.email || "";
}

function localPlanDay(planDate: string): Date | null {
  const match = planDate.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (match) return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  const parsed = new Date(planDate);
  if (Number.isNaN(parsed.getTime())) return null;
  return new Date(parsed.getFullYear(), parsed.getMonth(), parsed.getDate());
}

/**
 * A work plan stays open on its date and the next 2 days (3 days total).
 * After that, visits, tasks, and the plan itself are read only.
 */
export function earliestOpenPlanDate(): string {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  today.setDate(today.getDate() - 2);
  const month = String(today.getMonth() + 1).padStart(2, "0");
  const day = String(today.getDate()).padStart(2, "0");
  return `${today.getFullYear()}-${month}-${day}`;
}

export function isPlanWindowClosed(planDate?: string | null): boolean {
  const targetDay = localPlanDay(String(planDate || ""));
  if (!targetDay) return false;
  const earliest = localPlanDay(earliestOpenPlanDate());
  if (!earliest) return false;
  return targetDay < earliest;
}

export function personId(
  user?: string | { _id?: string; id?: string } | null,
): string {
  if (!user) return "";
  if (typeof user === "string") return user;
  return String(user._id || user.id || "");
}
