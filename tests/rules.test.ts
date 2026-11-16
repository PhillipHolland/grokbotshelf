import { describe, expect, it } from 'vitest';
import { BUCKETS, bucketOf, cleanName, implausible, maxDist, parseResult, publishedBy, type Result } from '../api/_lib/rules';
import { BOT_CREATOR } from '../api/_lib/bots';

const ok: Result = { score: 4000, t: 60, dist: 900, grabbed: 12, shelves: 2, close: 3, likes: 40, bots: [] };

describe('parseResult', () => {
  it('accepts a well formed result and floors counts', () => {
    expect(parseResult({ ...ok, score: 4000.7, bots: ['a', 'b'] })).toEqual({ ...ok, score: 4000, bots: ['a', 'b'] });
  });

  it.each([
    ['a string score', { score: '4000' }],
    ['a negative count', { grabbed: -1 }],
    ['NaN', { dist: NaN }],
    ['Infinity', { likes: Infinity }],
    ['zero game time', { t: 0 }],
    ['over 4 hours of game time', { t: 4 * 3600 }],
    ['a huge score', { score: 1e9 }],
    ['a missing field', { close: undefined }],
  ])('rejects %s', (_, over) => {
    expect(parseResult({ ...ok, ...over })).toBeNull();
  });

  it('drops bad bot ids and caps the list', () => {
    const bots = ['ok', 7, null, 'x'.repeat(40), ...Array(500).fill('b')];
    const r = parseResult({ ...ok, bots })!;
    expect(r.bots[0]).toBe('ok');
    expect(r.bots).toHaveLength(400);
  });

  it('treats a non-array bots field as no bots', () => {
    expect(parseResult({ ...ok, bots: 'abc' })?.bots).toEqual([]);
  });
});

describe('implausible', () => {
  it('passes an ordinary run', () => {
    expect(implausible(ok, 61)).toBe('');
  });

  it.each([
    ['game time longer than the run', {}, 50],
    ['too far', { dist: 5000 }, 61],
    ['too many bots', { grabbed: 400 }, 61],
    ['too many shelves', { shelves: 4 }, 61],
    ['too many close calls', { close: 200 }, 61],
    ['too many likes', { likes: 1000 }, 61],
    ['too many published bots', { bots: Array(9).fill('b') }, 61],
    ['score too high', { score: 100_000 }, 61],
  ])('says %s', (why, over, elapsed) => {
    expect(implausible({ ...ok, ...over }, elapsed as number)).toBe(why);
  });

  it('allows a few seconds of clock drift', () => {
    expect(implausible(ok, 58)).toBe('');
  });

  it('maxDist grows with time', () => {
    expect(maxDist(10)).toBeLessThan(maxDist(20));
    expect(maxDist(200)).toBeLessThan(maxDist(300));
  });
});

describe('publishedBy', () => {
  const [a, b] = Object.keys(BOT_CREATOR);
  it('dedupes ids, drops unknown ones and maps to creators', () => {
    expect(publishedBy([a, a, 'nope', b])).toEqual({ bots: [a, b], creators: [BOT_CREATOR[a], BOT_CREATOR[b]] });
  });
});

describe('bucketOf', () => {
  it.each([
    [0, '0'],
    [999, '0'],
    [1000, '1000'],
    [24_999, '10000'],
    [10_000_000, '100000'],
  ])('puts %i in bucket %s', (score, bucket) => {
    expect(bucketOf(score)).toBe(bucket);
    expect(BUCKETS.map(String)).toContain(bucket);
  });
});

describe('cleanName', () => {
  it.each([
    ['Nick', 'nick'],
    ['@Nick', 'nick'],
    ['  Shelf   Fan ', 'shelf fan'],
    ["O'Brien-Smith", "o'brien-smith"],
    ['Zoë', 'zoë'],
    ['東京ランナー', '東京ランナー'],
    ['Dickens', 'dickens'],
    ['Scunthorpe', 'scunthorpe'],
    ['Hancock', 'hancock'],
  ])('allows %s', (name, key) => {
    expect(cleanName(name)?.key).toBe(key);
  });

  it('keeps the name as typed apart from spaces', () => {
    expect(cleanName('  @Shelf   Fan ')).toEqual({ name: '@Shelf Fan', key: 'shelf fan' });
  });

  it('treats "@Nick" and "nick" as one entry', () => {
    expect(cleanName('@Nick')?.key).toBe(cleanName('nick')?.key);
  });

  it.each([
    ['too short', 'a'],
    ['too long', 'a'.repeat(21)],
    ['not a string', 42],
    ['empty', ''],
    ['HTML', '<b>hi</b>'],
    ['a URL', 'evil.com/x?y'],
    ['a second @', 'a@b'],
    ['a slur', 'faggot'],
    ['a slur with look-alikes', 'f4gg0t'],
    ['a slur in the middle', 'bigfuckguy'],
    ['a whole bad word', 'big dick'],
    ['a bad word with digits', 'sh1t'],
  ])('refuses %s', (_, name) => {
    expect(cleanName(name)).toBeNull();
  });
});
