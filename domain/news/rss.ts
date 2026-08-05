// ================================================================
// RSS PARSING
//
// Headlines from a feed, with no dependency.
//
// Regexes rather than an XML library because a news feed is
// machine-generated, the shape needed is four fields deep, and a
// parser dependency in domain code would break the one rule this
// layer has.
//
// Pure — no I/O.
// ================================================================

export interface FeedItem {
    title: string;
    /** One short sentence. Never the full article: RSS licences the excerpt. */
    summary: string;
    url: string;
    publishedAt: Date | null;
}

const ITEM_RE = /<item\b[^>]*>([\s\S]*?)<\/item>/gi;
/** Atom feeds use <entry> where RSS uses <item>. */
const ENTRY_RE = /<entry\b[^>]*>([\s\S]*?)<\/entry>/gi;

const ENTITIES: Record<string, string> = {
    '&amp;': '&',
    '&lt;': '<',
    '&gt;': '>',
    '&quot;': '"',
    '&apos;': "'",
    '&#39;': "'",
    '&nbsp;': ' ',
    '&hellip;': '…',
    '&rsquo;': '’',
    '&lsquo;': '‘',
    '&ndash;': '–',
    '&mdash;': '—',
};

/** Text of a tag, CDATA unwrapped, inner markup and entities resolved. */
function tagText(block: string, tag: string): string {
    const match = new RegExp(`<${tag}\\b[^>]*>([\\s\\S]*?)<\\/${tag}>`, 'i').exec(block);
    if (!match) return '';

    return decode(match[1] ?? '');
}

function decode(raw: string): string {
    return raw
        .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
        .replace(/<[^>]*>/g, ' ')
        .replace(/&#(\d+);/g, (_, code: string) => String.fromCodePoint(Number(code)))
        .replace(/&[a-z]+;/gi, (entity) => ENTITIES[entity.toLowerCase()] ?? ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

/**
 * A link, from either flavour of feed.
 *
 * RSS puts the URL inside <link>…</link>; Atom puts it in an href attribute on
 * a self-closing <link/>. Reading only the first yields empty strings on half
 * the feeds in existence.
 */
function linkOf(block: string): string {
    const href = /<link\b[^>]*\bhref=["']([^"']+)["']/i.exec(block);
    if (href?.[1]) return href[1];

    return tagText(block, 'link');
}

function dateOf(block: string): Date | null {
    for (const tag of ['pubDate', 'published', 'updated', 'dc:date']) {
        const raw = tagText(block, tag);
        if (!raw) continue;

        const at = new Date(raw);
        if (!Number.isNaN(at.getTime())) return at;
    }

    return null;
}

/**
 * Trims a description to its first sentence.
 *
 * Feeds carry anything from a clause to three paragraphs, and a panel of
 * headlines only stays scannable if every entry is one line. The link is what
 * carries the reader to the rest.
 */
export function firstSentence(text: string, limit = 200): string {
    const trimmed = text.trim();
    if (!trimmed) return '';

    const sentence = /^[^.!?]*[.!?]/.exec(trimmed)?.[0] ?? trimmed;
    const chosen = sentence.trim();

    return chosen.length <= limit ? chosen : `${chosen.slice(0, limit - 1).trimEnd()}…`;
}

export function parseFeed(xml: string): FeedItem[] {
    const blocks = [
        ...[...xml.matchAll(ITEM_RE)].map((match) => match[1] ?? ''),
        ...[...xml.matchAll(ENTRY_RE)].map((match) => match[1] ?? ''),
    ];

    const items: FeedItem[] = [];

    for (const block of blocks) {
        const title = tagText(block, 'title');
        const url = linkOf(block);
        // A headline with no link cannot be attributed or followed, and a feed
        // panel that shows one is showing an assertion with no source.
        if (!title || !url) continue;

        items.push({
            title,
            summary: firstSentence(
                tagText(block, 'description') || tagText(block, 'summary') || tagText(block, 'content'),
            ),
            url,
            publishedAt: dateOf(block),
        });
    }

    return items;
}
