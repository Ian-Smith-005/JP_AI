// functions/api/admin/bookings.js
import { neon } from "@neondatabase/serverless";

export async function onRequestGet(context) {
  const { request, env } = context;
  if (!env.DATABASE_URL) return j({ error: "DATABASE_URL not set" }, 500);
  const sql    = neon(env.DATABASE_URL);
  const status = new URL(request.url).searchParams.get("status");

  const bookings = status
    ? await sql`
        SELECT b.id,b.booking_ref,b.status,b.event_date,b.event_time,b.event_location,
               b.total_price,b.deposit_amount,b.created_at,
               c.name AS client_name,c.email AS client_email,c.phone AS client_phone,
               s.name AS service_name,p.name AS package_name,e.name AS extra_name,
               r.receipt_ref,r.deposit_paid,r.balance_due,r.payment_ref
        FROM bookings b
        LEFT JOIN clients c ON c.id=b.client_id LEFT JOIN services s ON s.id=b.service_id
        LEFT JOIN packages p ON p.id=b.package_id LEFT JOIN extra_services e ON e.id=b.extra_service_id
        LEFT JOIN receipts r ON r.booking_id=b.id
        WHERE b.status=${status} ORDER BY b.created_at DESC`
    : await sql`
        SELECT b.id,b.booking_ref,b.status,b.event_date,b.event_time,b.event_location,
               b.total_price,b.deposit_amount,b.created_at,
               c.name AS client_name,c.email AS client_email,c.phone AS client_phone,
               s.name AS service_name,p.name AS package_name,e.name AS extra_name,
               r.receipt_ref,r.deposit_paid,r.balance_due,r.payment_ref
        FROM bookings b
        LEFT JOIN clients c ON c.id=b.client_id LEFT JOIN services s ON s.id=b.service_id
        LEFT JOIN packages p ON p.id=b.package_id LEFT JOIN extra_services e ON e.id=b.extra_service_id
        LEFT JOIN receipts r ON r.booking_id=b.id
        WHERE NOT (b.status='pending_payment' AND b.created_at < NOW()-INTERVAL '24 hours')
        ORDER BY b.created_at DESC`;

  return j({ bookings });
}

export async function onRequestPut(context) {
  const { request, env } = context;
  const id = new URL(request.url).pathname.split("/").filter(Boolean).pop();
  if (!id||isNaN(id)) return j({ error: "Invalid ID" }, 400);
  if (!env.DATABASE_URL) return j({ error: "DATABASE_URL not set" }, 500);
  let body; try { body=await request.json(); } catch(_){ return j({error:"Bad JSON"},400); }
  const sql = neon(env.DATABASE_URL);
  await sql`UPDATE bookings SET status=COALESCE(${body.status||null},status), event_date=COALESCE(${body.eventDate||null},event_date), event_location=COALESCE(${body.eventLocation||null},event_location), updated_at=NOW() WHERE id=${id}`;
  return j({ success: true });
}

export async function onRequestDelete(context) {
  const { request, env } = context;
  const id = new URL(request.url).pathname.split("/").filter(Boolean).pop();
  if (!id||isNaN(id)) return j({ error: "Invalid ID" }, 400);
  if (!env.DATABASE_URL) return j({ error: "DATABASE_URL not set" }, 500);
  const sql = neon(env.DATABASE_URL);
  // CASCADE handles payments + receipts automatically (see schema-update.sql)
  const res = await sql`DELETE FROM bookings WHERE id=${id} RETURNING id`;
  if (!res.length) return j({ error: "Not found" }, 404);
  return j({ success: true });
}

export async function onRequestOptions() { return new Response(null, { headers: cors() }); }
function j(d,s=200){return new Response(JSON.stringify(d),{status:s,headers:cors()});}
function cors(){return{"Content-Type":"application/json","Access-Control-Allow-Origin":"*","Access-Control-Allow-Methods":"GET,PUT,DELETE,OPTIONS","Access-Control-Allow-Headers":"Content-Type"};}