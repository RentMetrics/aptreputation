import { httpRouter } from "convex/server";
import { httpAction } from "./_generated/server";
import { api, internal } from "./_generated/api";

const http = httpRouter();

function hex(buffer: ArrayBuffer) {
  return Array.from(new Uint8Array(buffer), (b) => b.toString(16).padStart(2, "0")).join("");
}

function timingSafeEqual(a: string, b: string) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/** Verifies Stripe's `Stripe-Signature` header (HMAC-SHA256 over "<t>.<body>"). */
async function verifyStripe(body: string, header: string | null, secret: string) {
  if (!header) return false;
  const parts = header.split(",").map((p) => p.split("="));
  const t = parts.find(([k]) => k === "t")?.[1];
  const signatures = parts.filter(([k]) => k === "v1").map(([, s]) => s);
  if (!t || signatures.length === 0) return false;
  if (Math.abs(Date.now() / 1000 - Number(t)) > 300) return false;
  const key = await crypto.subtle.importKey(
    "raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"],
  );
  const expected = hex(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(`${t}.${body}`)));
  return signatures.some((s) => timingSafeEqual(s, expected));
}

http.route({
  path: "/stripe/webhook",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    const secret = process.env.STRIPE_WEBHOOK_SECRET;
    if (!secret) return new Response("Webhook secret not configured", { status: 500 });
    const body = await request.text();
    if (!(await verifyStripe(body, request.headers.get("stripe-signature"), secret))) {
      return new Response("Invalid signature", { status: 400 });
    }
    const event = JSON.parse(body);
    if (
      event.type === "customer.subscription.created" ||
      event.type === "customer.subscription.updated" ||
      event.type === "customer.subscription.deleted"
    ) {
      const sub = event.data.object;
      await ctx.runMutation(internal.billing.applySubscription, {
        stripeCustomerId: typeof sub.customer === "string" ? sub.customer : sub.customer.id,
        subscriptionId: sub.id,
        status: sub.status,
      });
    }
    return new Response("ok");
  }),
});

/** One-click unsubscribe (the List-Unsubscribe header mail apps use). */
http.route({
  path: "/outreach/unsubscribe",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    const token = new URL(request.url).searchParams.get("t") ?? "";
    await ctx.runMutation(api.outreach.unsubscribe, { token });
    return new Response("Unsubscribed");
  }),
});

/** Verifies a Resend (Svix) webhook: HMAC-SHA256 over "<id>.<timestamp>.<body>". */
async function verifySvix(body: string, headers: Headers, secret: string) {
  const id = headers.get("svix-id");
  const ts = headers.get("svix-timestamp");
  const sig = headers.get("svix-signature");
  if (!id || !ts || !sig || Math.abs(Date.now() / 1000 - Number(ts)) > 300) return false;
  const raw = Uint8Array.from(atob(secret.replace(/^whsec_/, "")), (c) => c.charCodeAt(0));
  const key = await crypto.subtle.importKey("raw", raw, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const mac = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(`${id}.${ts}.${body}`));
  const expected = btoa(String.fromCharCode(...new Uint8Array(mac)));
  return sig.split(" ").some((part) => timingSafeEqual(part.replace(/^v1,/, ""), expected));
}

/** Bounces and spam complaints: the address is never emailed again. */
http.route({
  path: "/resend/webhook",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    const secret = process.env.RESEND_WEBHOOK_SECRET;
    if (!secret) return new Response("Webhook secret not configured", { status: 500 });
    const body = await request.text();
    if (!(await verifySvix(body, request.headers, secret))) return new Response("Invalid signature", { status: 400 });
    const event = JSON.parse(body);
    const reason = event.type === "email.bounced" ? "bounced" : event.type === "email.complained" ? "spam complaint" : null;
    if (reason && event.data?.email_id) {
      await ctx.runMutation(internal.outreach.providerEvent, { resendId: event.data.email_id, reason });
    }
    return new Response("ok");
  }),
});

export default http;
