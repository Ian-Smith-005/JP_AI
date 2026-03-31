// functions/api/admin/stats.js
import { neon } from "@neondatabase/serverless";

export async function onRequestGet(context) {
  const { env } = context;
  if (!env.DATABASE_URL) return json({ error: "DATABASE_URL not set" }, 500);

  try {
    const sql = neon(env.DATABASE_URL);
    const [stats] = await sql`
      SELECT
        COUNT(*)                                            AS total_bookings,
        COUNT(*) FILTER (WHERE status = 'confirmed')       AS confirmed_bookings,
        COUNT(*) FILTER (WHERE status = 'pending')         AS pending_bookings,
        COUNT(*) FILTER (WHERE status = 'cancelled')       AS cancelled_bookings,
        COALESCE(SUM(deposit_paid), 0)                     AS total_revenue,
        COALESCE(SUM(total_price) FILTER (WHERE status = 'confirmed'), 0) AS confirmed_value
      FROM bookings b
      LEFT JOIN receipts r ON r.booking_id = b.id
    `;
    return json({
      totalBookings:     Number(stats.total_bookings),
      confirmedBookings: Number(stats.confirmed_bookings),
      pendingBookings:   Number(stats.pending_bookings),
      cancelledBookings: Number(stats.cancelled_bookings),
      totalRevenue:      Number(stats.total_revenue),
      confirmedValue:    Number(stats.confirmed_value),
    });
  } catch (err) {
    return json({ error: err.message }, 500);
  }
}

export async function onRequestOptions() {
  return new Response(null, { headers: cors() });
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: cors() });
}
function cors() {
  return { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" };
}