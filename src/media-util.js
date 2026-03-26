import https from "node:https";
import http from "node:http";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

export const TMP_DIR = join(dirname(fileURLToPath(import.meta.url)), "..", "tmp");

const IMAGE_EXTS = [".jpg", ".jpeg", ".png", ".gif", ".webp"];

export function isImageUrl(url) {
  const clean = url.split("?")[0].toLowerCase();
  return IMAGE_EXTS.some((ext) => clean.endsWith(ext));
}

export function guessMimeType(url) {
  const ext = url.split("?")[0].split(".").pop().toLowerCase();
  const types = { jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", gif: "image/gif", webp: "image/webp" };
  return types[ext] || "image/jpeg";
}

export function downloadBuffer(url, redirects = 5) {
  return new Promise((resolve, reject) => {
    if (redirects <= 0) return reject(new Error("Too many redirects"));
    const mod = url.startsWith("https") ? https : http;
    mod.get(url, { timeout: 10000 }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        res.resume();
        return downloadBuffer(res.headers.location, redirects - 1).then(resolve).catch(reject);
      }
      if (res.statusCode < 200 || res.statusCode >= 300) {
        res.resume();
        return reject(new Error(`Download failed: ${res.statusCode}`));
      }
      const chunks = [];
      res.on("data", (c) => chunks.push(c));
      res.on("end", () => resolve(Buffer.concat(chunks)));
      res.on("error", reject);
    }).on("error", reject);
  });
}
