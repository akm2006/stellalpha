export const runtime = "nodejs";

// NOTE: Always check latest Jupiter API docs: https://station.jup.ag/docs

import https from "https";
import dns from "dns";

// Force IPv4 DNS resolution
const agent = new https.Agent({
  family: 4,
  lookup: (hostname, opts, cb) => {
    return dns.lookup(hostname, { ...opts, family: 4 }, cb);
  },
});

// Install globally so that Next.js fetch() uses it
// @ts-ignore
globalThis.__NEXT_PRIVATE_CUSTOM_AGENT__ = agent;

process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";

export async function POST(req: Request) {
  try {
    const body = await req.json();

    const res = await fetch("https://lite-api.jup.ag/swap/v1/swap-instructions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      cache: "no-store",
    });

    if (!res.ok) {
        const errorText = await res.text();
        return Response.json({ error: `Jupiter API Error: ${errorText}` }, { status: res.status });
    }

    const data = await res.json();
    return Response.json(data, {
      headers: { "Access-Control-Allow-Origin": "*" },
    });
  } catch (error: any) {
    console.error("Proxy Error:", error);
    return Response.json({ error: error.message }, { status: 500 });
  }
}
