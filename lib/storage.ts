import "server-only";

import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, resolve, sep } from "node:path";

import { getStore, type Store } from "@netlify/blobs";

import { rejectUpload, rejectionMessage, sniffImageType } from "@/domain/media/image-type";

/**
 * Binary storage for screenshots.
 *
 * The legacy app stored every screenshot as a base64 data URL inside the same
 * localStorage JSON as the plan itself. That has three consequences worth
 * naming, because they are the reason this module exists:
 *
 *   - base64 inflates a file by a third, against a 5 MB per-origin budget;
 *   - the whole plan was re-serialised on every keystroke-triggered save, so
 *     the images were rewritten constantly;
 *   - and when the quota blew, `saveWeekPlan` caught the error and SILENTLY
 *     stripped the screenshots off every plan but the last three, then saved
 *     again. Losing data was the documented recovery path.
 *
 * Blobs live in Netlify Blobs when a deployment provides them, and ON DISK
 * otherwise. The row in Postgres holds the path and the metadata either way;
 * deleting the row is the source of truth, and the blob goes with it.
 *
 * THE DISK FALLBACK IS NOT A CONVENIENCE. Netlify Blobs needs a site binding
 * that does not exist on a developer machine, so every screenshot upload
 * failed with "stockage non configuré" — on a project deliberately being built
 * locally before deployment. A trading journal that cannot hold a chart is not
 * a trading journal.
 */

const STORE_NAME = "attachments";

/** Gitignored, and outside `public/` so nothing is served without the route. */
const LOCAL_ROOT = resolve(process.cwd(), ".attachments");

let cached: Store | null | undefined;

/** Netlify Blobs, or null when this machine has no binding for it. */
function netlifyStore(): Store | null {
  if (cached !== undefined) return cached;

  try {
    // On Netlify the binding is ambient. Elsewhere it needs explicit
    // credentials, and without them `getStore` throws rather than degrading.
    const siteID = process.env.NETLIFY_SITE_ID;
    const token = process.env.NETLIFY_API_TOKEN;

    cached =
      siteID && token
        ? getStore({ name: STORE_NAME, siteID, token, consistency: "strong" })
        : getStore({ name: STORE_NAME, consistency: "strong" });
  } catch {
    cached = null;
  }

  return cached;
}

/**
 * Resolves a stored path under the local root, refusing to escape it.
 *
 * Paths are generated here and read back from our own table, so traversal
 * would take a compromised row to exploit — but a check costing one string
 * comparison is worth more than the argument that it cannot happen.
 */
function localPath(blobPath: string): string | null {
  const full = resolve(LOCAL_ROOT, blobPath);
  return full.startsWith(LOCAL_ROOT + sep) ? full : null;
}

/**
 * Whether uploads are possible. Always true now: the disk is the floor.
 *
 * Kept as a function because callers branch on it to hide upload controls, and
 * because a future backend could genuinely be absent.
 */
export function storageConfigured(): boolean {
  return true;
}

export class UploadError extends Error {}

/**
 * Validates and stores one file, returning the blob path.
 *
 * The MIME type is taken from the sniffed magic bytes, not from the
 * client-supplied `file.type`, which is trivially forged — a browser will
 * happily upload an HTML document labelled `image/png`, and anything we later
 * serve inline from our own origin under a forged type is a stored-XSS vector.
 */
export async function putAttachment(
  userId: string,
  file: File,
): Promise<{ blobPath: string; mimeType: string; sizeBytes: number }> {
  const bytes = new Uint8Array(await file.arrayBuffer());

  const rejection = rejectUpload(file.size, bytes);
  if (rejection) throw new UploadError(rejectionMessage(rejection));

  // Non-null: rejectUpload already refused anything unsniffable.
  const mimeType = sniffImageType(bytes)!;

  // The path is namespaced by user so a bug in a query cannot serve someone
  // else's blob, and randomised so a path is not guessable from a row id.
  const blobPath = `${userId}/${crypto.randomUUID()}`;

  const blobs = netlifyStore();

  if (blobs) {
    // `bytes.buffer` rather than the view: the Blobs client accepts an
    // ArrayBuffer, and the view was created from a full-length arrayBuffer() so
    // the two cover the same range.
    await blobs.set(blobPath, bytes.buffer as ArrayBuffer, { metadata: { mimeType, userId } });
  } else {
    const full = localPath(blobPath);
    if (!full) throw new UploadError("Chemin de fichier invalide");

    await mkdir(dirname(full), { recursive: true });
    await writeFile(full, bytes);
    // A sidecar rather than an extension on the filename: a MIME type encoded
    // in a path is one rename away from being wrong, and the route serves this
    // value byte for byte.
    await writeFile(`${full}.json`, JSON.stringify({ mimeType, userId }), "utf8");
  }

  return { blobPath, mimeType, sizeBytes: file.size };
}

export async function getAttachment(
  blobPath: string,
): Promise<{ bytes: ArrayBuffer; mimeType: string } | null> {
  const blobs = netlifyStore();

  if (blobs) {
    const result = await blobs.getWithMetadata(blobPath, { type: "arrayBuffer" });
    if (!result) return null;

    const mimeType = String(result.metadata?.mimeType ?? "application/octet-stream");
    return { bytes: result.data, mimeType };
  }

  const full = localPath(blobPath);
  if (!full) return null;

  try {
    const buffer = await readFile(full);

    let mimeType = "application/octet-stream";
    try {
      const meta = JSON.parse(await readFile(`${full}.json`, "utf8")) as { mimeType?: string };
      if (meta.mimeType) mimeType = meta.mimeType;
    } catch {
      // Missing sidecar: served as a generic download rather than not at all.
    }

    // Sliced to the view's own range: a Buffer can be a window onto a larger
    // pooled allocation, and handing out the whole pool would leak neighbouring
    // files' bytes into the response.
    const bytes = buffer.buffer.slice(
      buffer.byteOffset,
      buffer.byteOffset + buffer.byteLength,
    ) as ArrayBuffer;

    return { bytes, mimeType };
  } catch {
    return null;
  }
}

export async function deleteAttachment(blobPath: string): Promise<void> {
  // A blob that fails to delete leaves an orphan, which is wasteful but
  // harmless; failing the whole request would leave the row instead, which is
  // worse — the UI would keep showing an image the user asked to remove.
  try {
    const blobs = netlifyStore();

    if (blobs) {
      await blobs.delete(blobPath);
      return;
    }

    const full = localPath(blobPath);
    if (!full) return;

    await rm(full, { force: true });
    await rm(`${full}.json`, { force: true });
  } catch {
    /* orphaned blob */
  }
}
