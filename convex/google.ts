import { action, internalAction, internalMutation, internalQuery, mutation, query } from "./_generated/server";
import { internal } from "./_generated/api";
import { ConvexError, v } from "convex/values";
import { requireActive, requireCommunity, requireUser, randomCode, accessState } from "./lib/auth";
import { businessReviews, googleError, placeDetails } from "./lib/google";
import { Id } from "./_generated/dataModel";
import { ActionCtx } from "./_generated/server";

const SCOPES = [
  "https://www.googleapis.com/auth/business.manage",
  "https://www.googleapis.com/auth/userinfo.email",
].join(" ");

function oauthConfig() {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const appUrl = process.env.APP_URL;
  if (!clientId || !clientSecret || !appUrl) {
    throw new ConvexError("Google sign-in is not configured (GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, APP_URL).");
  }
  return { clientId, clientSecret, redirectUri: `${appUrl}/api/google/callback` };
}

export const status = query({
  args: {},
  handler: async (ctx) => {
    const user = await requireUser(ctx);
    const conn = await ctx.db
      .query("googleConnections")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .unique();
    return { connected: !!conn, googleEmail: conn?.googleEmail ?? null };
  },
});

/** Step 1: returns the Google consent URL. The state ties the callback to this user. */
export const startConnect = mutation({
  args: {},
  handler: async (ctx) => {
    const user = await requireUser(ctx);
    const { clientId, redirectUri } = oauthConfig();
    const state = randomCode(32);
    await ctx.db.insert("oauthStates", { userId: user._id, state, createdAt: Date.now() });
    const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
    url.searchParams.set("client_id", clientId);
    url.searchParams.set("redirect_uri", redirectUri);
    url.searchParams.set("response_type", "code");
    url.searchParams.set("scope", SCOPES);
    url.searchParams.set("access_type", "offline");
    url.searchParams.set("prompt", "consent");
    url.searchParams.set("state", state);
    return url.toString();
  },
});

export const consumeState = internalMutation({
  args: { state: v.string() },
  handler: async (ctx, { state }) => {
    const user = await requireUser(ctx);
    const row = await ctx.db.query("oauthStates").withIndex("by_state", (q) => q.eq("state", state)).unique();
    if (!row || row.userId !== user._id || Date.now() - row.createdAt > 15 * 60 * 1000) {
      throw new ConvexError("This Google sign-in link expired. Please try connecting again.");
    }
    await ctx.db.delete(row._id);
    return user._id;
  },
});

export const saveConnection = internalMutation({
  args: {
    userId: v.id("users"),
    googleEmail: v.optional(v.string()),
    accessToken: v.string(),
    refreshToken: v.optional(v.string()),
    expiresAt: v.number(),
    scope: v.string(),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("googleConnections")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .unique();
    if (existing) {
      await ctx.db.patch(existing._id, {
        ...args,
        // Google only sends a refresh token on first consent; keep the old one.
        refreshToken: args.refreshToken ?? existing.refreshToken,
        googleEmail: args.googleEmail ?? existing.googleEmail,
      });
    } else {
      await ctx.db.insert("googleConnections", args);
    }
  },
});

/** Step 2: called by /api/google/callback with the signed-in user's token. */
export const completeConnect = action({
  args: { code: v.string(), state: v.string() },
  handler: async (ctx, { code, state }): Promise<null> => {
    const userId: Id<"users"> = await ctx.runMutation(internal.google.consumeState, { state });
    const { clientId, clientSecret, redirectUri } = oauthConfig();
    const res = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        code,
        grant_type: "authorization_code",
        redirect_uri: redirectUri,
      }),
    });
    if (!res.ok) throw new ConvexError(await googleError(res));
    const token = await res.json();
    if (!String(token.scope ?? "").includes("business.manage")) {
      throw new ConvexError("Google did not grant Business Profile access. Tick the Business Profile box on the consent screen.");
    }
    let googleEmail: string | undefined;
    const info = await fetch("https://www.googleapis.com/oauth2/v2/userinfo", {
      headers: { Authorization: `Bearer ${token.access_token}` },
    });
    if (info.ok) googleEmail = (await info.json()).email;
    await ctx.runMutation(internal.google.saveConnection, {
      userId,
      googleEmail,
      accessToken: token.access_token,
      refreshToken: token.refresh_token,
      expiresAt: Date.now() + (token.expires_in ?? 3600) * 1000,
      scope: token.scope,
    });
    return null;
  },
});

export const disconnect = mutation({
  args: {},
  handler: async (ctx) => {
    const user = await requireUser(ctx);
    const conn = await ctx.db.query("googleConnections").withIndex("by_user", (q) => q.eq("userId", user._id)).unique();
    if (conn) await ctx.db.delete(conn._id);
    const mine = await ctx.db.query("communities").withIndex("by_owner", (q) => q.eq("ownerId", user._id)).collect();
    for (const c of mine) await ctx.db.patch(c._id, { gbpLocation: undefined, gbpLocationTitle: undefined });
  },
});

export const connectionFor = internalQuery({
  args: { userId: v.id("users") },
  handler: async (ctx, { userId }) =>
    await ctx.db.query("googleConnections").withIndex("by_user", (q) => q.eq("userId", userId)).unique(),
});

/** A valid access token for the user, refreshed if needed. */
async function accessToken(ctx: ActionCtx, userId: Id<"users">): Promise<string> {
  const conn = await ctx.runQuery(internal.google.connectionFor, { userId });
  if (!conn) throw new ConvexError("Connect your Google Business Profile first.");
  if (conn.expiresAt > Date.now() + 60_000) return conn.accessToken;
  if (!conn.refreshToken) throw new ConvexError("Google sign-in expired. Reconnect Google in Settings.");
  const { clientId, clientSecret } = oauthConfig();
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: conn.refreshToken,
      grant_type: "refresh_token",
    }),
  });
  if (!res.ok) throw new ConvexError("Google sign-in expired. Reconnect Google in Settings.");
  const token = await res.json();
  await ctx.runMutation(internal.google.saveConnection, {
    userId,
    accessToken: token.access_token,
    expiresAt: Date.now() + (token.expires_in ?? 3600) * 1000,
    scope: token.scope ?? conn.scope,
  });
  return token.access_token;
}

export type GbpLocation = { location: string; title: string; address: string };

/** Every Business Profile location the connected Google account can manage. */
export const listLocations = action({
  args: {},
  handler: async (ctx): Promise<GbpLocation[]> => {
    const user = await ctx.runQuery(internal.users.current, {});
    const token = await accessToken(ctx, user._id);
    const headers = { Authorization: `Bearer ${token}` };
    const out: GbpLocation[] = [];
    let accountPage: string | undefined;
    do {
      const aUrl = new URL("https://mybusinessaccountmanagement.googleapis.com/v1/accounts");
      if (accountPage) aUrl.searchParams.set("pageToken", accountPage);
      const aRes = await fetch(aUrl, { headers });
      if (!aRes.ok) throw new ConvexError(await googleError(aRes));
      const aData = await aRes.json();
      for (const account of aData.accounts ?? []) {
        let page: string | undefined;
        do {
          const lUrl = new URL(`https://mybusinessbusinessinformation.googleapis.com/v1/${account.name}/locations`);
          lUrl.searchParams.set("readMask", "name,title,storefrontAddress");
          lUrl.searchParams.set("pageSize", "100");
          if (page) lUrl.searchParams.set("pageToken", page);
          const lRes = await fetch(lUrl, { headers });
          if (!lRes.ok) throw new ConvexError(await googleError(lRes));
          const lData = await lRes.json();
          for (const loc of lData.locations ?? []) {
            const a = loc.storefrontAddress;
            out.push({
              // The reviews API wants the account-qualified name.
              location: `${account.name}/${loc.name}`,
              title: loc.title ?? "Untitled location",
              address: a ? [...(a.addressLines ?? []), a.locality, a.administrativeArea].filter(Boolean).join(", ") : "",
            });
          }
          page = lData.nextPageToken;
        } while (page);
      }
      accountPage = aData.nextPageToken;
    } while (accountPage);
    return out;
  },
});

export const linkLocation = mutation({
  args: { communityId: v.id("communities"), location: v.string(), title: v.string() },
  handler: async (ctx, { communityId, location, title }) => {
    const { user } = await requireCommunity(ctx, communityId);
    requireActive(user);
    if (!/^accounts\/[^/]+\/locations\/[^/]+$/.test(location)) throw new ConvexError("Invalid location.");
    await ctx.db.patch(communityId, { gbpLocation: location, gbpLocationTitle: title });
    await ctx.scheduler.runAfter(0, internal.google.sync, { communityId });
  },
});

export const unlinkLocation = mutation({
  args: { communityId: v.id("communities") },
  handler: async (ctx, { communityId }) => {
    await requireCommunity(ctx, communityId);
    await ctx.db.patch(communityId, { gbpLocation: undefined, gbpLocationTitle: undefined });
  },
});

/** Pull reviews: full owner feed when linked, otherwise Google's public 5-review sample. */
export const sync = internalAction({
  args: { communityId: v.id("communities") },
  handler: async (ctx, { communityId }): Promise<{ ok: boolean; error?: string }> => {
    const community = await ctx.runQuery(internal.communities.byId, { communityId });
    if (!community) return { ok: false, error: "Property not found." };
    const source = community.gbpLocation ? "business" as const : "places" as const;
    try {
      if (community.gbpLocation) {
        const token = await accessToken(ctx, community.ownerId);
        const { reviews, rating, total } = await businessReviews(token, community.gbpLocation);
        await ctx.runMutation(internal.reviews.clearPlacesSample, { communityId });
        for (let i = 0; i < reviews.length; i += 100) {
          await ctx.runMutation(internal.reviews.upsertBatch, {
            communityId,
            source,
            reviews: reviews.slice(i, i + 100),
            rating,
            totalReviews: total,
          });
        }
      } else {
        const place = await placeDetails(community.googlePlaceId);
        await ctx.runMutation(internal.reviews.upsertBatch, {
          communityId,
          source,
          reviews: place.reviews,
          rating: place.rating,
          totalReviews: place.totalReviews,
        });
      }
      await ctx.runMutation(internal.communities.setSyncResult, { communityId, source });
      await ctx.scheduler.runAfter(0, internal.ai.analyzePending, { communityId });
      return { ok: true };
    } catch (e) {
      const error = e instanceof ConvexError ? String(e.data) : e instanceof Error ? e.message : "Sync failed.";
      await ctx.runMutation(internal.communities.setSyncResult, { communityId, source, error });
      return { ok: false, error };
    }
  },
});

export const syncNow = action({
  args: { communityId: v.id("communities") },
  handler: async (ctx, { communityId }): Promise<{ ok: boolean; error?: string }> => {
    const { user } = await ctx.runQuery(internal.communities.access, { communityId });
    requireActive(user);
    return await ctx.runAction(internal.google.sync, { communityId });
  },
});

/** Cron: refresh every property whose owner still has access. */
export const syncAll = internalAction({
  args: {},
  handler: async (ctx): Promise<null> => {
    const ids = await ctx.runQuery(internal.communities.allIds, {});
    let delay = 0;
    for (const communityId of ids) {
      const community = await ctx.runQuery(internal.communities.byId, { communityId });
      if (!community) continue;
      const owner = await ctx.runQuery(internal.users.byId, { userId: community.ownerId });
      if (!owner || !accessState(owner, Date.now()).active) continue;
      await ctx.scheduler.runAfter(delay, internal.google.sync, { communityId });
      delay += 2000;
    }
    return null;
  },
});

/** Publish a manager-approved reply on Google. */
export const postReply = action({
  args: { reviewId: v.id("reviews"), text: v.string() },
  handler: async (ctx, { reviewId, text }): Promise<null> => {
    const { review, user, community } = await ctx.runQuery(internal.reviews.forAction, { reviewId });
    requireActive(user);
    const comment = text.trim();
    if (!comment) throw new ConvexError("Reply text is empty.");
    if (comment.length > 4000) throw new ConvexError("Google limits replies to 4,000 characters.");
    if (!community.gbpLocation || review.source !== "business") {
      throw new ConvexError("Link this property to its Google Business Profile to post replies from here.");
    }
    const token = await accessToken(ctx, community.ownerId);
    const res = await fetch(
      `https://mybusiness.googleapis.com/v4/${community.gbpLocation}/reviews/${encodeURIComponent(review.externalId)}/reply`,
      {
        method: "PUT",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ comment }),
      },
    );
    if (!res.ok) throw new ConvexError(await googleError(res));
    await ctx.runMutation(internal.reviews.setReply, { reviewId, text: comment });
    return null;
  },
});
