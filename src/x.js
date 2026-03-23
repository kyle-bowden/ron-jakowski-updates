import crypto from "node:crypto";
import https from "node:https";
import http from "node:http";
import { config } from "./config.js";

function percentEncode(str) {
  return encodeURIComponent(str).replace(/[!'()*]/g, (c) => "%" + c.charCodeAt(0).toString(16).toUpperCase());
}

function oauthSign(method, url, params = {}) {
  const nonce = crypto.randomBytes(16).toString("hex");
  const timestamp = Math.floor(Date.now() / 1000).toString();

  const oauthParams = {
    oauth_consumer_key: config.xApiKey,
    oauth_nonce: nonce,
    oauth_signature_method: "HMAC-SHA1",
    oauth_timestamp: timestamp,
    oauth_token: config.xAccessToken,
    oauth_version: "1.0",
  };

  const allParams = { ...params, ...oauthParams };
  const paramString = Object.keys(allParams)
    .sort()
    .map((k) => percentEncode(k) + "=" + percentEncode(allParams[k]))
    .join("&");

  const baseString = method.toUpperCase() + "&" + percentEncode(url) + "&" + percentEncode(paramString);
  const signingKey = percentEncode(config.xApiSecret) + "&" + percentEncode(config.xAccessTokenSecret);
  const signature = crypto.createHmac("sha1", signingKey).update(baseString).digest("base64");

  const authEntries = { ...oauthParams, oauth_signature: signature };
  return "OAuth " + Object.entries(authEntries)
    .map(([k, v]) => percentEncode(k) + '="' + percentEncode(v) + '"')
    .join(", ");
}

function request(method, url, headers = {}, body = null) {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url);
    const opts = {
      hostname: parsed.hostname,
      path: parsed.pathname + parsed.search,
      method,
      headers,
    };
    const req = https.request(opts, (res) => {
      let data = "";
      res.on("data", (c) => (data += c));
      res.on("end", () => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          resolve({ status: res.statusCode, data: JSON.parse(data) });
        } else if (res.statusCode === 429) {
          reject(new Error(`[X] Rate limited (429). Retry after: ${res.headers["x-rate-limit-reset"] || "unknown"}`));
        } else if (res.statusCode === 401 || res.statusCode === 403) {
          reject(new Error(`[X] Auth failure (${res.statusCode}): ${data}. Check X API credentials.`));
        } else {
          reject(new Error(`[X] API error ${res.statusCode}: ${data}`));
        }
      });
    });
    req.on("error", reject);
    if (body) req.write(body);
    req.end();
  });
}

export async function verifyCredentials() {
  const url = "https://api.x.com/2/users/me";
  const auth = oauthSign("GET", url);
  return request("GET", url, { Authorization: auth });
}

async function createTweet(text, mediaIds = []) {
  const url = "https://api.x.com/2/tweets";
  // Do NOT pass JSON body params to oauthSign — only query params go in the signature
  const auth = oauthSign("POST", url);
  const payload = { text };
  if (mediaIds.length > 0) {
    payload.media = { media_ids: mediaIds };
  }
  const body = JSON.stringify(payload);
  return request("POST", url, {
    Authorization: auth,
    "Content-Type": "application/json",
  }, body);
}

export async function postTweet(text) {
  console.log(`[X] Posting tweet: ${text.slice(0, 50)}...`);
  const result = await createTweet(text);
  console.log(`[X] Tweet posted: ${result.data.data.id}`);
  return result.data.data.id;
}
