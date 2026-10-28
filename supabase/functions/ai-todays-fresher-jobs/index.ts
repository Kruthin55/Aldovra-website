// Retired 28 Oct 2026: this experimental job finder called paid AI search (OpenAI / Gemini) and is not
// used by the site. Fresher jobs come from the free employer-API pipeline (sync-job-sources etc.).
// Kept as a stub so the public URL cannot run up AI costs. The old code is in git history.
Deno.serve(() =>
  new Response(JSON.stringify({ error: "This endpoint has been retired." }), {
    status: 410,
    headers: { "Content-Type": "application/json" },
  })
);
