import { NextResponse } from "next/server";

import { resolveBlobPath } from "@/lib/attachments";
import { currentUserId } from "@/lib/session";
import { getAttachment } from "@/lib/storage";

export const dynamic = "force-dynamic";

/**
 * Serves an uploaded screenshot.
 *
 * Ownership is checked against the session on every request rather than
 * trusting the id. The blob path is deliberately not part of the URL: it is
 * randomised and namespaced by user, so it never leaves the server and cannot
 * be enumerated or shared as a bearer token for someone else's image.
 */
export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const userId = await currentUserId();
  if (!userId) return new NextResponse("Unauthorized", { status: 401 });

  const { id } = await context.params;

  const blobPath = await resolveBlobPath(userId, id);
  // 404 rather than 403 for a row owned by someone else: distinguishing the
  // two would confirm the id exists.
  if (!blobPath) return new NextResponse("Not found", { status: 404 });

  const blob = await getAttachment(blobPath);
  if (!blob) return new NextResponse("Not found", { status: 404 });

  return new NextResponse(blob.bytes, {
    headers: {
      "Content-Type": blob.mimeType,
      // The bytes at an id never change — an attachment is replaced by
      // creating a new row — so this can be cached hard. Private, because the
      // response is scoped to one user's session.
      "Cache-Control": "private, max-age=31536000, immutable",
      // Belt and braces alongside the magic-byte sniffing on upload.
      "X-Content-Type-Options": "nosniff",
      "Content-Disposition": "inline",
    },
  });
}
