// Aviso por correo de un pedido nuevo de un asesor, con invitación de calendario.
// La dispara la base (trigger en agenda_requests) con el id del pedido.
// Seguridad: no confía en lo que recibe; relee el pedido con la clave de servicio,
// solo avisa pedidos reales de las últimas 48 h y una sola vez por pedido.
// Requiere el secreto RESEND_API_KEY (Supabase → Edge Functions → Secrets).

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const RESEND_KEY = Deno.env.get("RESEND_API_KEY");
const FROM = Deno.env.get("AGENDA_MAIL_FROM") || "Agenda Amauta <onboarding@resend.dev>";
const APP = "https://agenda-amauta.vercel.app";

const db = (path: string, init: RequestInit = {}) =>
  fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    ...init,
    headers: {
      apikey: SERVICE_KEY,
      Authorization: `Bearer ${SERVICE_KEY}`,
      "Content-Type": "application/json",
      ...(init.headers || {}),
    },
  });

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

const esc = (s: string) =>
  s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);
const icsText = (s: string) => s.replace(/\\/g, "\\\\").replace(/\n/g, "\\n").replace(/[,;]/g, (c) => "\\" + c);
const name = (email: string) => {
  const n = email.split("@")[0] || email;
  return n.charAt(0).toUpperCase() + n.slice(1);
};

function baToday(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Argentina/Buenos_Aires" }).format(new Date());
}
function addDays(date: string, days: number) {
  const d = new Date(date + "T12:00:00Z");
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}
/** El día que pidió el asesor o, si no puso (o ya pasó), el próximo día hábil. */
function eventDate(desired: string | null, today: string) {
  if (desired && desired >= today) return desired;
  let d = addDays(today, 1);
  while ([0, 6].includes(new Date(d + "T12:00:00Z").getUTCDay())) d = addDays(d, 1);
  return d;
}
const fmt = (d: string) => d.split("-").reverse().join("/");

Deno.serve(async (req) => {
  if (req.method !== "POST") return json({ error: "method" }, 405);
  let id = "";
  try {
    id = String((await req.json()).id || "");
  } catch {
    return json({ error: "body" }, 400);
  }
  if (!/^[0-9a-f-]{36}$/.test(id)) return json({ error: "id" }, 400);
  if (!RESEND_KEY) return json({ skipped: "Falta RESEND_API_KEY" });

  const rows = await (
    await db(`agenda_requests?id=eq.${id}&select=*,agenda_clients(name)`)
  ).json();
  const r = Array.isArray(rows) ? rows[0] : null;
  if (!r) return json({ skipped: "no existe" });
  if (Date.now() - Date.parse(r.created_at) > 48 * 3600 * 1000) return json({ skipped: "viejo" });

  // Una sola vez por pedido: si ya existe el registro, no se reenvía.
  const claim = await db("agenda_request_notifications", {
    method: "POST",
    headers: { Prefer: "return=minimal" },
    body: JSON.stringify({ request_id: id }),
  });
  if (!claim.ok) return json({ skipped: "ya avisado" });

  const owners = await (
    await db("agenda_access?role=eq.owner&active=eq.true&select=email")
  ).json();
  const to = (owners as { email: string }[])
    .map((o) => o.email)
    .filter((e) => e.endsWith("@amautainversiones.com"));
  if (!to.length) return json({ skipped: "sin destinatario" });

  const client = r.agenda_clients?.name || r.client_id;
  const author = name(r.author_email);
  const kind = r.kind === "pedido" ? "Pedido" : "Indicación";
  const link = `${APP}/clientes/${r.client_id}`;
  const subject = `${kind} de ${author} · ${client}`;
  const today = baToday();
  const date = eventDate(r.desired_date, today);
  const html = `<div style="font-family:Arial,sans-serif;font-size:14px;color:#231F20">
<p><strong>${esc(author)}</strong> te dejó un${r.kind === "pedido" ? " pedido" : "a indicación"} sobre <strong>${esc(client)}</strong>${r.desired_date ? ` para el <strong>${fmt(r.desired_date)}</strong>` : ""}.</p>
<blockquote style="border-left:3px solid #F3CF11;margin:12px 0;padding:4px 12px;white-space:pre-wrap">${esc(r.body)}</blockquote>
<p><a href="${link}">Abrir la ficha en Agenda Amauta</a></p>
${r.kind === "pedido" ? `<p style="color:#666;font-size:12px">Te agregamos un bloque de 30 minutos el ${fmt(date)} a las 10:00 en tu calendario.</p>` : ""}
</div>`;
  const text = `${author} te dejó un ${kind.toLowerCase()} sobre ${client}${r.desired_date ? ` para el ${fmt(r.desired_date)}` : ""}.\n\n${r.body}\n\n${link}`;

  const attachments: { filename: string; content: string; content_type: string }[] = [];
  if (r.kind === "pedido") {
    const stamp = new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d+Z$/, "Z");
    const d = date.replace(/-/g, "");
    const ics = [
      "BEGIN:VCALENDAR",
      "VERSION:2.0",
      "PRODID:-//Agenda Amauta//Pedidos//ES",
      "METHOD:REQUEST",
      "BEGIN:VEVENT",
      `UID:pedido-${id}@agenda-amauta`,
      `DTSTAMP:${stamp}`,
      // 10:00 de Buenos Aires = 13:00 UTC.
      `DTSTART:${d}T130000Z`,
      `DTEND:${d}T133000Z`,
      `SUMMARY:${icsText(subject)}`,
      `DESCRIPTION:${icsText(r.body + "\n\n" + link)}`,
      `URL:${link}`,
      "ORGANIZER;CN=Agenda Amauta:mailto:onboarding@resend.dev",
      ...to.map((e) => `ATTENDEE;CN=${e};PARTSTAT=NEEDS-ACTION;RSVP=FALSE:mailto:${e}`),
      "CLASS:PRIVATE",
      "TRANSP:OPAQUE",
      "END:VEVENT",
      "END:VCALENDAR",
    ].join("\r\n");
    attachments.push({
      filename: "pedido.ics",
      content: btoa(unescape(encodeURIComponent(ics))),
      content_type: "text/calendar; method=REQUEST; charset=UTF-8",
    });
  }

  const sent = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${RESEND_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from: FROM, to, subject, html, text, attachments }),
  });
  if (!sent.ok) {
    // Libera el registro para que un reintento manual pueda volver a enviarlo.
    await db(`agenda_request_notifications?request_id=eq.${id}`, { method: "DELETE" });
    return json({ error: "resend", status: sent.status, detail: await sent.text() }, 502);
  }
  return json({ sent: true });
});
