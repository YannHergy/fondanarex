import "server-only";

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
 * Blobs live in Netlify Blobs; the row in Postgres holds the path and the
 * metadata. Deleting the row is the source of truth, and the blob is deleted
 * with it.
 */

const STORE_NAME = "attachments";

let cached: Store | undefined;

/**
 * The blob store, or null when the deployment has no Blobs binding.
 *
 * Returning null rather than throwing is deliberate: an unconfigured store must
 * degrade to "uploads unavailable" on one panel, not take down every screen
 * that happens to render an attachment list.
 */
function store(): Store | null {
  if (cached) return cached;

  try {
    // On Netlify the binding is ambient. Elsewhere it needs explicit
    // credentials, which is also what makes local development work.
    const siteID = process.env.NETLIFY_SITE_ID;
    const token = process.env.NETLIFY_API_TOKEN;

    cached =
      siteID && token
        ? getStore({ name: STORE_NAME, siteID, token, consistency: "strong" })
        : getStore({ name: STORE_NAME, consistency: "strong" });

    return cached;
  } catch {
    return null;
  }
}

export function storageConfigured(): boolean {
  return store() !== null;
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
  const blobs = store();
  if (!blobs) throw new UploadError("Stockage des fichiers non configuré");

  const bytes = new Uint8Array(await file.arrayBuffer());

  const rejection = rejectUpload(file.size, bytes);
  if (rejection) throw new UploadError(rejectionMessage(rejection));

  // Non-null: rejectUpload already refused anything unsniffable.
  const mimeType = sniffImageType(bytes)!;

  // The path is namespaced by user so a bug in a query cannot serve someone
  // else's blob, and randomised so a path is not guessable from a row id.
  const blobPath = `${userId}/${crypto.randomUUID()}`;

  // `bytes.buffer` rather than the view: the Blobs client accepts an
  // ArrayBuffer, and the view was created from a full-length arrayBuffer() so
  // the two cover the same range.
  await blobs.set(blobPath, bytes.buffer as ArrayBuffer, { metadata: { mimeType, userId } });

  return { blobPath, mimeType, sizeBytes: file.size };
}

export async function getAttachment(
  blobPath: string,
): Promise<{ bytes: ArrayBuffer; mimeType: string } | null> {
  const blobs = store();
  if (!blobs) return null;

  const result = await blobs.getWithMetadata(blobPath, { type: "arrayBuffer" });
  if (!result) return null;

  const mimeType = String(result.metadata?.mimeType ?? "application/octet-stream");
  return { bytes: result.data, mimeType };
}

export async function deleteAttachment(blobPath: string): Promise<void> {
  const blobs = store();
  if (!blobs) return;

  // A blob that fails to delete leaves an orphan, which is wasteful but
  // harmless; failing the whole request would leave the row instead, which is
  // worse — the UI would keep showing an image the user asked to remove.
  try {
    await blobs.delete(blobPath);
  } catch {
    /* orphaned blob */
  }
}

