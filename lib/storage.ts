import "server-only";

import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, resolve, sep } from "node:path";

import { getStore, type Store } from "@netlify/blobs";
import { del as vercelDel, get as vercelGet, put as vercelPut } from "@vercel/blob";

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
 * THREE BACKENDS, tried in this order, because the app runs in three places:
 *
 *   1. VERCEL BLOB, whenever a read-write token is present. This is the only
 *      one that survives on Vercel — see the note on LOCAL_ROOT below.
 *   2. NETLIFY BLOBS, when a site binding provides it.
 *   3. THE DISK, otherwise.
 *
 * The row in Postgres holds the path and the metadata whichever one served it,
 * and deleting the row is the source of truth — the blob goes with it. The
 * path is generated here and never derived from the backend, so the same row
 * resolves identically after a move between hosts.
 *
 * THE DISK FALLBACK IS NOT A CONVENIENCE. Netlify Blobs needs a site binding
 * that does not exist on a developer machine, so every screenshot upload
 * failed with "stockage non configuré" — on a project deliberately being built
 * locally before deployment. A trading journal that cannot hold a chart is not
 * a trading journal.
 */

const STORE_NAME = "attachments";

/**
 * Vercel Blob, when the project has a store linked.
 *
 * PRIVATE, never public. A public blob is readable by anyone holding the URL,
 * with no way to revoke it short of deleting the object; these are screenshots
 * of someone's positions. Every read goes through `/api/attachments/[id]`,
 * which checks ownership first, so the store never needs to be reachable from
 * a browser at all.
 *
 * The SDK reads `BLOB_READ_WRITE_TOKEN` from the environment on its own — the
 * token is deliberately not passed explicitly, so there is one place it can be
 * wrong instead of three.
 */
function vercelBlobConfigured(): boolean {
  return Boolean(process.env.BLOB_READ_WRITE_TOKEN);
}

/**
 * Where blobs land when Netlify Blobs is absent.
 *
 * The working directory on a developer machine, and the system temp directory
 * on a serverless host — where the deployment bundle is READ-ONLY and only
 * /tmp accepts a write. Getting this wrong does not degrade, it throws EROFS
 * on the first upload.
 *
 * On serverless the directory is also per-instance and short-lived, so a
 * screenshot uploaded there survives the session and not much longer. That is
 * a real limitation of running without a blob store, and the reason to bind
 * one before this matters.
 */
const LOCAL_ROOT = process.env.VERCEL
  ? resolve(tmpdir(), "fondanarex-attachments")
  : resolve(process.cwd(), ".attachments");

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

  if (vercelBlobConfigured()) {
    // `addRandomSuffix` defaults to false in v2, which is what makes this
    // correct: the pathname is stored verbatim, so the value written to
    // Postgres is the value that reads the blob back. Were a suffix appended,
    // every row would point at an object that does not exist.
    // `Buffer.from` rather than the view itself: `PutBody` accepts a Buffer,
    // Blob, File or stream, and a bare Uint8Array is none of them. The copy is
    // a few hundred kilobytes on an image already capped well below that cost.
    await vercelPut(blobPath, Buffer.from(bytes), {
      access: "private",
      contentType: mimeType,
      // The path already carries a UUID, so a collision means a repeated UUID
      // and not a legitimate replacement. Refusing is the honest response.
      allowOverwrite: false,
    });

    return { blobPath, mimeType, sizeBytes: file.size };
  }

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
  if (vercelBlobConfigured()) {
    try {
      const result = await vercelGet(blobPath, { access: "private" });

      // Null when absent; 304 only ever arrives in answer to `ifNoneMatch`,
      // which is not sent here — but the union carries it, and treating an
      // unexpected 304 as "no bytes" beats reading a null stream.
      if (!result || result.statusCode !== 200) return null;

      return {
        bytes: await new Response(result.stream).arrayBuffer(),
        mimeType: result.blob.contentType || "application/octet-stream",
      };
    } catch {
      // A missing blob throws rather than resolving null on some paths. The
      // caller renders "image unavailable"; it must not fail the whole page.
      return null;
    }
  }

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
    if (vercelBlobConfigured()) {
      await vercelDel(blobPath);
      return;
    }

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
