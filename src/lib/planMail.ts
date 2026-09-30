export type MailVisit = {
  party_name?: string;
  contact_person?: string;
  contact_number?: string;
  contact_email?: string;
  contacts?: Array<{
    contact_person?: string;
    contact_number?: string;
    contact_email?: string;
  }>;
  address?: string;
  status?: string;
  planned_start_time?: string;
};

export type MailTask = {
  title?: string;
  description?: string;
  status?: string;
  planned_start_time?: string;
};

export type PlanMailSummary = {
  action: string;
  executiveName: string;
  fromEmail: string;
  planDate: string;
  planType: string;
  location: string;
  discussedLabel: string;
  remarks: string;
  visits: MailVisit[];
  tasks: MailTask[];
};

function esc(value?: string | null) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function mailStatusLabel(status?: string) {
  return String(status || "created").replace(/_/g, " ").toUpperCase();
}

function badgeStyle(status?: string) {
  const value = String(status || "created").toLowerCase().trim();
  if (value === "completed") return "background-color: #dcfce7; color: #15803d;";
  if (value === "in_progress") return "background-color: #fef9c3; color: #a16207;";
  if (value === "cancelled" || value === "rejected") return "background-color: #ffe4e6; color: #be123c;";
  if (value === "pending") return "background-color: #ffedd5; color: #c2410c;";
  return "background-color: #e0f2fe; color: #0369a1;";
}

function badge(status?: string) {
  return `<span style="${badgeStyle(status)} padding: 2px 6px; border-radius: 4px; font-weight: bold; font-size: 11px;">${esc(mailStatusLabel(status))}</span>`;
}

export type DayEndVisit = MailVisit & {
  purpose?: string;
  planned_end_time?: string;
  outcome?: string;
  pending_remarks?: string;
  in_progress_remarks?: string;
  meeting_with_doctor?: boolean;
  meeting_with_purchase?: boolean;
  meeting_with_finance?: boolean;
  meeting_with_engineer?: boolean;
  new_product_introduced?: boolean;
  order_received?: boolean;
};

export type DayEndTask = MailTask & {
  pending_remarks?: string;
  in_progress_remarks?: string;
  completion_remarks?: string;
  outcome?: string;
};

export type DayEndMailSummary = {
  executiveName: string;
  fromEmail: string;
  planDate: string;
  planType: string;
  location: string;
  expensesTotal: number;
  remarks: string;
  visits: DayEndVisit[];
  tasks: DayEndTask[];
};

function dayEndBadgeStyle(status?: string) {
  const value = String(status || "pending").toLowerCase().trim();
  if (value === "completed") return "background-color: #dcfce7; color: #15803d; border: 1px solid #bbf7d0;";
  if (value === "in_progress") return "background-color: #fef3c7; color: #b45309; border: 1px solid #fde68a;";
  if (value === "created") return "background-color: #e0f2fe; color: #0369a1; border: 1px solid #bae6fd;";
  if (["cancelled", "skipped", "rejected"].includes(value)) return "background-color: #fee2e2; color: #b91c1c; border: 1px solid #fecaca;";
  return "background-color: #f1f5f9; color: #475569; border: 1px solid #cbd5e1;";
}

function remarkHtml(status: string, completed: string, inProgress: string, pending: string, other: string) {
  if (status === "completed") return completed ? `<div style="color: #15803d; font-weight: 500;">${esc(completed)}</div>` : "—";
  if (status === "in_progress") {
    return inProgress
      ? `<div><span style="color: #b45309; font-weight: 700; font-size: 11px; text-transform: uppercase;">In Progress:</span> <span style="color: #334155;">${esc(inProgress)}</span></div>`
      : "—";
  }
  if (status === "pending" || status === "created") {
    return pending
      ? `<div><span style="color: #475569; font-weight: 700; font-size: 11px; text-transform: uppercase;">Pending Reason:</span> <span style="color: #334155;">${esc(pending)}</span></div>`
      : "—";
  }
  return other ? esc(other) : "—";
}

function checklistHtml(visit: DayEndVisit) {
  const flags = [
    visit.meeting_with_doctor,
    visit.meeting_with_purchase,
    visit.meeting_with_finance,
    visit.meeting_with_engineer,
    visit.new_product_introduced,
    visit.order_received,
  ];
  if (!flags.some((value) => value !== undefined && value !== null)) return "";
  const tag = (label: string, value?: boolean) => {
    const yes = Boolean(value);
    const style = yes
      ? "background-color: #dcfce7; color: #166534; border: 1px solid #bbf7d0;"
      : "background-color: #f1f5f9; color: #64748b; border: 1px solid #e2e8f0;";
    return `<span style="display: inline-block; padding: 2px 6px; margin: 2px 4px 2px 0; border-radius: 4px; font-size: 10px; font-weight: 600; ${style}">${label}: ${yes ? "✓ Yes" : "✗ No"}</span>`;
  };
  return `<div style="margin-top: 4px; padding-top: 4px; border-top: 1px dashed #cbd5e1;">
<div style="font-size: 10px; font-weight: 700; color: #64748b; text-transform: uppercase; margin-bottom: 2px;">Checklist:</div>
<div>${tag("Doctor", visit.meeting_with_doctor)}${tag("Purchase", visit.meeting_with_purchase)}${tag("Finance", visit.meeting_with_finance)}${tag("Engineer", visit.meeting_with_engineer)}${tag("New Product", visit.new_product_introduced)}${tag("Order", visit.order_received)}</div>
</div>`;
}

export function buildDayEndMailHtml(summary: DayEndMailSummary) {
  const visitsHtml = summary.visits.length
    ? `<table style="width: 100%; border-collapse: collapse; margin: 12px 0 20px 0; font-size: 13px; border: 1px solid #e2e8f0;">
<thead><tr style="background-color: #0f172a; color: #ffffff;">
<th style="padding: 10px 12px; text-align: left; border: 1px solid #1e293b;">Client / Party</th>
<th style="padding: 10px 12px; text-align: left; border: 1px solid #1e293b;">Purpose</th>
<th style="padding: 10px 12px; text-align: left; border: 1px solid #1e293b;">Time</th>
<th style="padding: 10px 12px; text-align: center; border: 1px solid #1e293b;">Status</th>
<th style="padding: 10px 12px; text-align: left; border: 1px solid #1e293b;">Outcome / Notes</th>
</tr></thead><tbody>
${summary.visits
  .map((visit, index) => {
    const status = String(visit.status || "pending").toLowerCase();
    const time = visit.planned_start_time
      ? `${visit.planned_start_time}${visit.planned_end_time ? ` - ${visit.planned_end_time}` : ""}`
      : "—";
    const notes =
      status === "completed"
        ? `${visit.outcome ? `<div style="color: #15803d; font-weight: 500; margin-bottom: 6px;">${esc(visit.outcome)}</div>` : ""}${checklistHtml(visit)}` || "—"
        : remarkHtml(status, visit.outcome || "", visit.in_progress_remarks || "", visit.pending_remarks || "", visit.outcome || visit.in_progress_remarks || visit.pending_remarks || "");
    const visitContacts = Array.isArray(visit.contacts) && visit.contacts.length > 0
      ? visit.contacts
      : (visit.contact_person || visit.contact_number || visit.contact_email)
        ? [{ contact_person: visit.contact_person, contact_number: visit.contact_number, contact_email: visit.contact_email }]
        : [];
    const contactInfoHtml = visitContacts.length > 0
      ? visitContacts.map((c) => `<div style="font-size: 11px; color: #64748b;">Contact: ${esc([c.contact_person, c.contact_number].filter(Boolean).join(" · "))}</div>`).join("")
      : (visit.contact_person ? `<div style="font-size: 11px; color: #64748b;">Contact: ${esc(visit.contact_person)}</div>` : "");

    return `<tr style="background-color: ${index % 2 === 0 ? "#ffffff" : "#f8fafc"};">
<td style="padding: 10px 12px; border: 1px solid #e2e8f0;"><div style="font-weight: 600;">${index + 1}. ${esc(visit.party_name || "N/A")}</div>${contactInfoHtml}</td>
<td style="padding: 10px 12px; border: 1px solid #e2e8f0;">${esc(visit.purpose || "General")}</td>
<td style="padding: 10px 12px; border: 1px solid #e2e8f0;">${esc(time)}</td>
<td style="padding: 10px 12px; border: 1px solid #e2e8f0; text-align: center;"><span style="display: inline-block; padding: 3px 8px; border-radius: 9999px; font-size: 11px; font-weight: 700; ${dayEndBadgeStyle(status)}">${esc(mailStatusLabel(status))}</span></td>
<td style="padding: 10px 12px; border: 1px solid #e2e8f0;">${notes}</td>
</tr>`;
  })
  .join("")}
</tbody></table>`
    : `<p style="font-size: 13px; color: #64748b; font-style: italic; margin: 8px 0;">No visits recorded for this plan.</p>`;

  const tasksHtml = summary.tasks.length
    ? `<table style="width: 100%; border-collapse: collapse; margin: 12px 0 20px 0; font-size: 13px; border: 1px solid #e2e8f0;">
<thead><tr style="background-color: #0f172a; color: #ffffff;">
<th style="padding: 10px 12px; text-align: left; border: 1px solid #1e293b;">Task Title</th>
<th style="padding: 10px 12px; text-align: left; border: 1px solid #1e293b;">Description</th>
<th style="padding: 10px 12px; text-align: center; border: 1px solid #1e293b;">Status</th>
<th style="padding: 10px 12px; text-align: left; border: 1px solid #1e293b;">Remarks</th>
</tr></thead><tbody>
${summary.tasks
  .map((task, index) => {
    const status = String(task.status || "pending").toLowerCase();
    const notes = remarkHtml(
      status,
      task.completion_remarks || task.outcome || "",
      task.in_progress_remarks || "",
      task.pending_remarks || "",
      task.completion_remarks || task.outcome || task.in_progress_remarks || task.pending_remarks || "",
    );
    return `<tr style="background-color: ${index % 2 === 0 ? "#ffffff" : "#f8fafc"};">
<td style="padding: 10px 12px; border: 1px solid #e2e8f0; font-weight: 600;">${index + 1}. ${esc(task.title || "Task")}</td>
<td style="padding: 10px 12px; border: 1px solid #e2e8f0;">${esc(task.description || "—")}</td>
<td style="padding: 10px 12px; border: 1px solid #e2e8f0; text-align: center;"><span style="display: inline-block; padding: 3px 8px; border-radius: 9999px; font-size: 11px; font-weight: 700; ${dayEndBadgeStyle(status)}">${esc(mailStatusLabel(status))}</span></td>
<td style="padding: 10px 12px; border: 1px solid #e2e8f0;">${notes}</td>
</tr>`;
  })
  .join("")}
</tbody></table>`
    : `<p style="font-size: 13px; color: #64748b; font-style: italic; margin: 8px 0;">No tasks recorded for this plan.</p>`;

  const total = Number(summary.expensesTotal) || 0;
  return `<div style="font-family: Arial, sans-serif; line-height: 1.6; color: #1e293b;">
<div style="background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 16px; margin-bottom: 20px;">
<h2 style="margin: 0 0 12px 0; color: #0f172a; font-size: 18px;">Day End Report — Summary</h2>
<p style="margin: 4px 0; font-size: 14px;"><strong>Executive:</strong> ${esc(summary.executiveName)} ${summary.fromEmail ? `(${esc(summary.fromEmail)})` : ""}</p>
<p style="margin: 4px 0; font-size: 14px;"><strong>Plan Date:</strong> ${esc(summary.planDate)}</p>
<p style="margin: 4px 0; font-size: 14px;"><strong>Plan Type:</strong> ${esc(summary.planType)} | <strong>Location:</strong> ${esc(summary.location || "N/A")}</p>
<p style="margin: 4px 0; font-size: 14px;"><strong>Total Expenses Logged:</strong> ₹${esc(total.toLocaleString("en-IN"))}</p>
</div>
<h3 style="color: #0f172a; font-size: 16px; border-bottom: 2px solid #0284c7; padding-bottom: 6px; margin-top: 24px;">Field Visits (${summary.visits.length})</h3>
${visitsHtml}
<h3 style="color: #0f172a; font-size: 16px; border-bottom: 2px solid #059669; padding-bottom: 6px; margin-top: 24px;">Tasks / Work Items (${summary.tasks.length})</h3>
${tasksHtml}
<h3 style="color: #0f172a; font-size: 16px; border-bottom: 2px solid #475569; padding-bottom: 6px; margin-top: 24px;">Key Highlights &amp; Day End Remarks</h3>
<p style="font-size: 14px; color: #334155; padding: 12px; background: #f1f5f9; border-radius: 6px;">${esc(summary.remarks || "Please add any specific highlights, order wins, follow-ups, or escalations here...")}</p>
</div>`;
}

export function buildPlanMailHtml(summary: PlanMailSummary) {
  const visitsHtml = summary.visits.length
    ? `<h3 style="color: #0f172a; font-size: 15px; border-bottom: 2px solid #0284c7; padding-bottom: 6px; margin-top: 20px;">Planned Field Visits (${summary.visits.length})</h3>
<table style="width: 100%; border-collapse: collapse; font-size: 13px; margin-top: 10px;">
<thead><tr style="background-color: #f1f5f9; text-align: left; font-weight: bold; color: #475569;">
<th style="padding: 8px; border: 1px solid #cbd5e1;">#</th>
<th style="padding: 8px; border: 1px solid #cbd5e1;">Party Name</th>
<th style="padding: 8px; border: 1px solid #cbd5e1;">Contact / Person</th>
<th style="padding: 8px; border: 1px solid #cbd5e1;">Location / Address</th>
<th style="padding: 8px; border: 1px solid #cbd5e1;">Status</th>
<th style="padding: 8px; border: 1px solid #cbd5e1;">Planned Schedule</th>
</tr></thead><tbody>
${summary.visits
  .map(
    (visit, index) => {
      const visitContacts = Array.isArray(visit.contacts) && visit.contacts.length > 0
        ? visit.contacts
        : (visit.contact_person || visit.contact_number || visit.contact_email)
          ? [{ contact_person: visit.contact_person, contact_number: visit.contact_number, contact_email: visit.contact_email }]
          : [];
      const contactCellHtml = visitContacts.length > 0
        ? visitContacts.map((c) => `<div>${esc(c.contact_person || "—")}${c.contact_number ? `<br/><small style="color:#64748b">${esc(c.contact_number)}</small>` : ""}</div>`).join("<div style='height:4px'></div>")
        : `${esc(visit.contact_person || "—")}<br/><small style="color:#64748b">${esc(visit.contact_number || "")}</small>`;

      return `<tr>
<td style="padding: 8px; border: 1px solid #cbd5e1; font-weight: bold;">${index + 1}</td>
<td style="padding: 8px; border: 1px solid #cbd5e1; font-weight: bold; color: #0f172a;">${esc(visit.party_name || "N/A")}</td>
<td style="padding: 8px; border: 1px solid #cbd5e1;">${contactCellHtml}</td>
<td style="padding: 8px; border: 1px solid #cbd5e1;">${esc(visit.address || "—")}</td>
<td style="padding: 8px; border: 1px solid #cbd5e1;">${badge(visit.status)}</td>
<td style="padding: 8px; border: 1px solid #cbd5e1;">${esc(visit.planned_start_time || "Full Day")}</td>
</tr>`;
    },
  )
  .join("")}
</tbody></table>`
    : "";

  const tasksHtml = summary.tasks.length
    ? `<h3 style="color: #0f172a; font-size: 15px; border-bottom: 2px solid #059669; padding-bottom: 6px; margin-top: 20px;">Planned Work Tasks (${summary.tasks.length})</h3>
<table style="width: 100%; border-collapse: collapse; font-size: 13px; margin-top: 10px;">
<thead><tr style="background-color: #f1f5f9; text-align: left; font-weight: bold; color: #475569;">
<th style="padding: 8px; border: 1px solid #cbd5e1;">#</th>
<th style="padding: 8px; border: 1px solid #cbd5e1;">Task Title</th>
<th style="padding: 8px; border: 1px solid #cbd5e1;">Description</th>
<th style="padding: 8px; border: 1px solid #cbd5e1;">Status</th>
<th style="padding: 8px; border: 1px solid #cbd5e1;">Planned Schedule</th>
</tr></thead><tbody>
${summary.tasks
  .map(
    (task, index) => `<tr>
<td style="padding: 8px; border: 1px solid #cbd5e1; font-weight: bold;">${index + 1}</td>
<td style="padding: 8px; border: 1px solid #cbd5e1; font-weight: bold; color: #0f172a;">${esc(task.title || "Task")}</td>
<td style="padding: 8px; border: 1px solid #cbd5e1;">${esc(task.description || "—")}</td>
<td style="padding: 8px; border: 1px solid #cbd5e1;">${badge(task.status)}</td>
<td style="padding: 8px; border: 1px solid #cbd5e1;">${esc(task.planned_start_time || "Full Day")}</td>
</tr>`,
  )
  .join("")}
</tbody></table>`
    : "";

  return `<div style="font-family: Arial, sans-serif; line-height: 1.6; color: #1e293b;">
<div style="background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 16px; margin-bottom: 20px;">
<h2 style="margin: 0 0 12px 0; color: #0f172a; font-size: 18px;">Work Plan ${esc(summary.action)} — Summary</h2>
<p style="margin: 4px 0; font-size: 14px;"><strong>Executive:</strong> ${esc(summary.executiveName)} (${esc(summary.fromEmail)})</p>
<p style="margin: 4px 0; font-size: 14px;"><strong>Plan Date:</strong> ${esc(summary.planDate)}</p>
<p style="margin: 4px 0; font-size: 14px;"><strong>Plan Type:</strong> ${esc(summary.planType)} | <strong>Location:</strong> ${esc(summary.location || "N/A")}</p>
<p style="margin: 4px 0; font-size: 14px;"><strong>Discussed with Manager:</strong> ${esc(summary.discussedLabel)}</p>
</div>
${visitsHtml}
${tasksHtml}
<h3 style="color: #0f172a; font-size: 15px; border-bottom: 2px solid #475569; padding-bottom: 6px; margin-top: 20px;">Executive Remarks / Notes</h3>
<p style="font-size: 14px; color: #334155; padding: 12px; background: #f1f5f9; border-radius: 6px;">${esc(summary.remarks || "No additional remarks added for this work plan.")}</p>
</div>`;
}
