import "server-only";

import { prisma } from "@/lib/prisma";
import { deleteAttachment, putAttachment } from "@/lib/storage";

/**
 * Attachment rows.
 *
 * One table serves trades, plan setups and setup reviews. Exactly one parent
 * column is set per row; the schema cannot express that constraint, so
 * `attachTo` is the only writer and it takes a discriminated parent rather than
 * three optional ids — a caller cannot construct an orphan or a row with two
 * parents.
 */

export type AttachmentParent =
  | { kind: "trade"; id: string }
  | { kind: "planSetup"; id: string }
  | { kind: "setupReview"; id: string };

export interface AttachmentRow {
  id: string;
  url: string;
  mimeType: string;
  sizeBytes: number;
  caption: string | null;
  position: number;
}

function parentColumns(parent: AttachmentParent) {
  return {
    tradeId: parent.kind === "trade" ? parent.id : null,
    planSetupId: parent.kind === "planSetup" ? parent.id : null,
    setupReviewId: parent.kind === "setupReview" ? parent.id : null,
  };
}

/**
 * Stores a file and records it against its parent.
 *
 * The blob is written first. If the row insert then fails the blob is deleted
 * again, because an orphaned blob nothing points at is invisible and bills
 * forever; the reverse order would risk a row pointing at nothing, which the
 * UI would render as a broken image.
 */
export async function attachTo(
  userId: string,
  parent: AttachmentParent,
  file: File,
  caption?: string,
): Promise<AttachmentRow> {
  const stored = await putAttachment(userId, file);

  try {
    const last = await prisma.attachment.findFirst({
      where: { userId, ...parentColumns(parent) },
      orderBy: { position: "desc" },
      select: { position: true },
    });

    const row = await prisma.attachment.create({
      data: {
        userId,
        url: "",
        blobPath: stored.blobPath,
        mimeType: stored.mimeType,
        sizeBytes: stored.sizeBytes,
        caption: caption ?? null,
        position: (last?.position ?? -1) + 1,
        ...parentColumns(parent),
      },
      select: { id: true, mimeType: true, sizeBytes: true, caption: true, position: true },
    });

    // The public URL is derived from the row id, not stored twice. The
    // schema's `url` column stays empty rather than holding a second copy that
    // could drift from the route that actually serves the bytes.
    return { ...row, url: `/api/attachments/${row.id}` };
  } catch (error) {
    await deleteAttachment(stored.blobPath);
    throw error;
  }
}

export async function listAttachments(
  userId: string,
  parent: AttachmentParent,
): Promise<AttachmentRow[]> {
  const rows = await prisma.attachment.findMany({
    where: { userId, ...parentColumns(parent) },
    orderBy: { position: "asc" },
    select: { id: true, mimeType: true, sizeBytes: true, caption: true, position: true },
  });

  return rows.map((row) => ({ ...row, url: `/api/attachments/${row.id}` }));
}

/** Removes an attachment, blob included. Scoped by user, so it cannot delete someone else's. */
export async function removeAttachment(userId: string, attachmentId: string): Promise<void> {
  const row = await prisma.attachment.findFirst({
    where: { id: attachmentId, userId },
    select: { id: true, blobPath: true },
  });
  if (!row) return;

  await prisma.attachment.delete({ where: { id: row.id } });
  await deleteAttachment(row.blobPath);
}

/** Blob path for a row the given user owns, or null. Used by the serving route. */
export async function resolveBlobPath(
  userId: string,
  attachmentId: string,
): Promise<string | null> {
  const row = await prisma.attachment.findFirst({
    where: { id: attachmentId, userId },
    select: { blobPath: true },
  });
  return row?.blobPath ?? null;
}
