import { timingSafeEqual } from "node:crypto";
import {
  buildSubscriptionState,
  expiredSubscriptionKey,
  getPushStore,
  subscriptionHash,
  subscriptionKey,
  updateState,
  validateSubscription,
} from "./push-core.mjs";

function jsonResponse(status, payload, headers = {}) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", ...headers },
  });
}

function responseHeaders(request) {
  const allowedOrigin = process.env.PUSH_ALLOWED_ORIGIN;
  const origin = request.headers.get("origin");
  if (!allowedOrigin || (origin && origin !== allowedOrigin)) {
    throw new Error("This Daymark origin is not allowed by the push server.");
  }
  return {
    "Access-Control-Allow-Origin": allowedOrigin,
    "Access-Control-Allow-Headers": "Authorization, Content-Type",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Vary": "Origin",
  };
}

function hasValidToken(request) {
  const expected = process.env.PUSH_API_TOKEN;
  const supplied = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") || "";
  if (!expected || !supplied) return false;
  const expectedBuffer = Buffer.from(expected);
  const suppliedBuffer = Buffer.from(supplied);
  return expectedBuffer.length === suppliedBuffer.length && timingSafeEqual(expectedBuffer, suppliedBuffer);
}

export async function handler(request) {
  let headers;
  try {
    headers = responseHeaders(request);
  } catch (error) {
    return jsonResponse(403, { ok: false, error: error.message });
  }
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers });
  if (request.method === "GET") {
    if (!hasValidToken(request)) return jsonResponse(401, { ok: false, error: "The push API token is missing or invalid." }, headers);
    if (!process.env.VAPID_PUBLIC_KEY || !process.env.VAPID_PRIVATE_KEY || !process.env.VAPID_SUBJECT) {
      return jsonResponse(503, { ok: false, error: "The push sender has not been configured." }, headers);
    }
    return jsonResponse(200, { ok: true, vapidPublicKey: process.env.VAPID_PUBLIC_KEY }, headers);
  }
  if (request.method !== "POST") return jsonResponse(405, { ok: false, error: "Method not allowed." }, headers);
  if (!hasValidToken(request)) return jsonResponse(401, { ok: false, error: "The push API token is missing or invalid." }, headers);

  let input;
  try {
    input = await request.json();
  } catch {
    return jsonResponse(400, { ok: false, error: "The request body must be valid JSON." }, headers);
  }
  if (!validateSubscription(input?.subscription)) {
    return jsonResponse(400, { ok: false, error: "The Web Push subscription is invalid." }, headers);
  }

  try {
    if (input.action === "unsubscribe") {
      const store = getPushStore();
      const hash = subscriptionHash(input.subscription);
      const key = subscriptionKey(hash);
      await store.delete(key);
      await store.delete(expiredSubscriptionKey(hash));
      return jsonResponse(200, { ok: true }, headers);
    }
    if (input.action !== "sync") {
      return jsonResponse(400, { ok: false, error: "The requested push operation is not supported." }, headers);
    }
    try {
      buildSubscriptionState(input);
    } catch (error) {
      return jsonResponse(400, { ok: false, error: error.message }, headers);
    }
    const store = getPushStore();
    const hash = subscriptionHash(input.subscription);
    const key = subscriptionKey(hash);
    const expiredKey = expiredSubscriptionKey(hash);
    if (await store.get(expiredKey, { type: "text", consistency: "strong" })) {
      await store.delete(expiredKey);
      return jsonResponse(409, {
        ok: false,
        code: "subscription-expired",
        error: "The saved Web Push subscription expired. Daymark will try to create a fresh subscription.",
      }, headers);
    }
    const savedState = await updateState(store, key, (previous) => buildSubscriptionState(input, previous));
    return jsonResponse(200, { ok: true, scheduled: savedState.events.length }, headers);
  } catch (error) {
    console.error("Daymark Web Push API operation failed:", error.message);
    return jsonResponse(500, { ok: false, error: "The push server could not save this schedule. Please retry." }, headers);
  }
}

export default async (request) => handler(request);
