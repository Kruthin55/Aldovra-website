// Fills opportunities.description_feed: the short description the student dashboard downloads
// (first 600 plain-text characters + ~55-character windows around the words the dashboard's job filters read).
// pg_cron (aldovra-description-feed, every 10 min) -> this function, Bearer ALDOVRA_CRON_SECRET.
// If you change the regexes in assets/dashboard/dash-jobs.js (experience / India / skill detection),
// add any new keywords to K below, then null description_feed so it rebuilds:
//   update opportunities set description_feed = null where description_feed is not null;
import { createClient } from "npm:@supabase/supabase-js@2";

const K = /years?|yrs?|experience|\bexp\b|fresher|graduat|entry[ -]?level|intern|trainee|apprentic|junior|new grad|early career|no experience|prior experience|qualification|requirement|what you.ll need|you will need|must have|minimum|\bmin\b|at least|more than|\bover\b|required|mandatory|needed|preferred|nice to have|bonus points|good to have|desirable|india|remote|anywhere|distributed|work from|based in|located in|residents|time ?zone|\bjava\b|python|\bsql\b|postgres|mysql|javascript|\bjs\b|typescript|\breact\b|node\.?js|c\+\+|c#|csharp|html|css|\bexcel\b|power bi|tableau|\baws\b|amazon web services|azure|machine learning|\bml\b|data analy|\bgit\b|github|rest api|restful|spring boot|django|communication skills|verbal and written/gi;
const HEAD = 600, W = 55;

export function buildFeed(desc: string | null): string | null {
  if (desc == null) return null;
  const plain = String(desc).replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
  if (plain.length <= 700) return plain;
  const spans: [number, number][] = [];
  K.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = K.exec(plain)) !== null) {
    let a = Math.max(HEAD, m.index - W), b = Math.min(plain.length, m.index + m[0].length + W);
    if (a > HEAD) { const sp = plain.lastIndexOf(" ", a); a = sp < HEAD ? HEAD : sp + 1; }
    if (b < plain.length) { const sq = plain.indexOf(" ", b); b = sq < 0 ? plain.length : sq; }
    if (b <= HEAD) continue;
    const last = spans[spans.length - 1];
    if (last && a <= last[1]) last[1] = Math.max(last[1], b); else spans.push([a, b]);
  }
  let out = plain.slice(0, HEAD);
  spans.forEach((s, i) => { out += (s[0] === HEAD && i === 0 ? "" : " ; ") + plain.slice(s[0], s[1]); });
  return out;
}

const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  const token = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
  const secret = Deno.env.get("ALDOVRA_CRON_SECRET");
  if (!secret || token !== secret) return json({ error: "Cron authentication required" }, 401);
  const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const started = Date.now();
  let done = 0;
  while (Date.now() - started < 40000) {
    const { data, error } = await db.from("opportunities").select("id,description")
      .eq("active", true).is("description_feed", null).not("description", "is", null).limit(200);
    if (error) return json({ error: error.message, done }, 500);
    if (!data || !data.length) break;
    const rows = data.map((r: { id: string; description: string }) => ({ id: r.id, feed: buildFeed(r.description) ?? "" }));
    const { error: e2 } = await db.rpc("set_description_feed", { p_rows: rows });
    if (e2) return json({ error: e2.message, done }, 500);
    done += rows.length;
    if (data.length < 200) break;
  }
  return json({ ok: true, built: done });
});
