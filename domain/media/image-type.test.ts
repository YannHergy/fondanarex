import { describe, expect, it } from 'vitest';

import {
    MAX_UPLOAD_BYTES,
    rejectUpload,
    rejectionMessage,
    sniffImageType,
} from './image-type';

/** Builds a buffer whose first bytes are the given signature. */
function withSignature(...signature: number[]): Uint8Array {
    const bytes = new Uint8Array(32);
    bytes.set(signature, 0);
    return bytes;
}

const PNG = withSignature(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a);
const JPEG = withSignature(0xff, 0xd8, 0xff, 0xe0);
const GIF = withSignature(0x47, 0x49, 0x46, 0x38, 0x39, 0x61);

function webp(): Uint8Array {
    const bytes = new Uint8Array(32);
    bytes.set([0x52, 0x49, 0x46, 0x46], 0); // RIFF
    bytes.set([0x2a, 0x00, 0x00, 0x00], 4); // size, not part of the signature
    bytes.set([0x57, 0x45, 0x42, 0x50], 8); // WEBP
    return bytes;
}

describe('sniffImageType', () => {
    it('identifies each supported format', () => {
        expect(sniffImageType(PNG)).toBe('image/png');
        expect(sniffImageType(JPEG)).toBe('image/jpeg');
        expect(sniffImageType(GIF)).toBe('image/gif');
        expect(sniffImageType(webp())).toBe('image/webp');
    });

    it('rejects an HTML document however it was labelled', () => {
        // The whole reason this function exists: a browser will upload this
        // with `type: "image/png"` if the client says so, and serving it back
        // inline from our own origin would execute it.
        const html = new TextEncoder().encode('<!doctype html><script>alert(1)</script>');
        expect(sniffImageType(html)).toBeNull();
    });

    it('rejects an SVG, which is a script container', () => {
        const svg = new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg"></svg>');
        expect(sniffImageType(svg)).toBeNull();
    });

    it('rejects a buffer too short to identify', () => {
        expect(sniffImageType(new Uint8Array([0x89, 0x50, 0x4e]))).toBeNull();
    });

    it('rejects an empty buffer', () => {
        expect(sniffImageType(new Uint8Array(0))).toBeNull();
    });

    it('does not match a near-miss signature', () => {
        expect(sniffImageType(withSignature(0x89, 0x50, 0x4e, 0x48))).toBeNull();
    });

    it('requires WEBP after RIFF, not just RIFF', () => {
        // RIFF also fronts WAV and AVI.
        const wav = new Uint8Array(32);
        wav.set([0x52, 0x49, 0x46, 0x46], 0);
        wav.set([0x57, 0x41, 0x56, 0x45], 8); // WAVE
        expect(sniffImageType(wav)).toBeNull();
    });
});

describe('rejectUpload', () => {
    it('accepts a normal screenshot', () => {
        expect(rejectUpload(PNG.length, PNG)).toBeNull();
    });

    it('rejects an empty file before looking at its bytes', () => {
        expect(rejectUpload(0, new Uint8Array(0))).toBe('empty');
    });

    it('rejects a file over the ceiling even when it is a valid image', () => {
        expect(rejectUpload(MAX_UPLOAD_BYTES + 1, PNG)).toBe('too-large');
    });

    it('accepts a file exactly at the ceiling', () => {
        expect(rejectUpload(MAX_UPLOAD_BYTES, PNG)).toBeNull();
    });

    it('rejects a disguised non-image', () => {
        const html = new TextEncoder().encode('<!doctype html><script>alert(1)</script>');
        expect(rejectUpload(html.length, html)).toBe('unsupported-type');
    });

    it('has a message for every rejection', () => {
        for (const rejection of ['empty', 'too-large', 'unsupported-type'] as const) {
            expect(rejectionMessage(rejection).length).toBeGreaterThan(0);
        }
    });
});
