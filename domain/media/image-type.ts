// ================================================================
// IMAGE TYPE SNIFFING
//
// The declared type of an upload is whatever the client typed into
// the request. A browser will happily send an HTML document
// labelled `image/png`, and anything served back inline from our
// own origin under a forged type is a stored-XSS vector — so the
// type is read from the file's magic bytes instead.
//
// Pure — no I/O.
// ================================================================

/** Formats a browser displays inline and we are willing to serve back. */
export const ALLOWED_MIME_TYPES = ['image/png', 'image/jpeg', 'image/webp', 'image/gif'] as const;

export type AllowedMimeType = (typeof ALLOWED_MIME_TYPES)[number];

/** Per-file ceiling. A chart screenshot does not legitimately exceed this. */
export const MAX_UPLOAD_BYTES = 6 * 1024 * 1024;

/**
 * Image type from the leading bytes, or null if unrecognised.
 *
 * Only the four allowed formats are detected. Anything else — including a
 * valid image in another format — returns null and is rejected by the caller,
 * which is the safe direction to fail in.
 */
export function sniffImageType(bytes: Uint8Array): AllowedMimeType | null {
    // The WebP check reads byte 11, so anything shorter cannot be identified.
    if (bytes.length < 12) return null;

    const startsWith = (...signature: number[]): boolean =>
        signature.every((byte, index) => bytes[index] === byte);

    if (startsWith(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a)) return 'image/png';
    if (startsWith(0xff, 0xd8, 0xff)) return 'image/jpeg';
    if (startsWith(0x47, 0x49, 0x46, 0x38)) return 'image/gif';

    // "RIFF" .... "WEBP" — the four size bytes in between are not part of the
    // signature, so this cannot be written as a single prefix check.
    if (
        startsWith(0x52, 0x49, 0x46, 0x46) &&
        bytes[8] === 0x57 &&
        bytes[9] === 0x45 &&
        bytes[10] === 0x42 &&
        bytes[11] === 0x50
    ) {
        return 'image/webp';
    }

    return null;
}

export type UploadRejection = 'empty' | 'too-large' | 'unsupported-type';

/** Why an upload should be refused, or null when it is acceptable. */
export function rejectUpload(sizeBytes: number, bytes: Uint8Array): UploadRejection | null {
    if (sizeBytes === 0) return 'empty';
    if (sizeBytes > MAX_UPLOAD_BYTES) return 'too-large';
    if (!sniffImageType(bytes)) return 'unsupported-type';
    return null;
}

const REJECTION_MESSAGES: Record<UploadRejection, string> = {
    empty: 'Fichier vide',
    'too-large': `Fichier trop volumineux (maximum ${MAX_UPLOAD_BYTES / 1024 / 1024} Mo)`,
    'unsupported-type': 'Format non supporté — PNG, JPEG, WebP ou GIF uniquement',
};

export function rejectionMessage(rejection: UploadRejection): string {
    return REJECTION_MESSAGES[rejection];
}
