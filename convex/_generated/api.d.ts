/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as admin from "../admin.js";
import type * as ai from "../ai.js";
import type * as audit from "../audit.js";
import type * as billing from "../billing.js";
import type * as communities from "../communities.js";
import type * as crons from "../crons.js";
import type * as google from "../google.js";
import type * as http from "../http.js";
import type * as lib_auth from "../lib/auth.js";
import type * as lib_google from "../lib/google.js";
import type * as members from "../members.js";
import type * as notify from "../notify.js";
import type * as prospects from "../prospects.js";
import type * as reviews from "../reviews.js";
import type * as staff from "../staff.js";
import type * as tags from "../tags.js";
import type * as users from "../users.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  admin: typeof admin;
  ai: typeof ai;
  audit: typeof audit;
  billing: typeof billing;
  communities: typeof communities;
  crons: typeof crons;
  google: typeof google;
  http: typeof http;
  "lib/auth": typeof lib_auth;
  "lib/google": typeof lib_google;
  members: typeof members;
  notify: typeof notify;
  prospects: typeof prospects;
  reviews: typeof reviews;
  staff: typeof staff;
  tags: typeof tags;
  users: typeof users;
}>;

/**
 * A utility for referencing Convex functions in your app's public API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;

/**
 * A utility for referencing Convex functions in your app's internal API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = internal.myModule.myFunction;
 * ```
 */
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;

export declare const components: {};
