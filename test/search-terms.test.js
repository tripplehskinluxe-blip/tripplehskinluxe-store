import test from 'node:test';
import assert from 'node:assert/strict';
import { searchWords, wordVariants, buildSearchFilters } from '../lib/search-terms.js';
import { filterProducts } from '../lib/filter.js';
import { slugify } from '../lib/rows.js';

const C1 = '11111111-1111-4111-8111-111111111111', C2 = '22222222-2222-4222-8222-222222222222';

test('search words: lower-case letters and digits only, no filler words, no repeats, at most 5', () => {
  assert.deepEqual(searchWords('  Body   SCRUB!! '), ['body', 'scrub']);
  assert.deepEqual(searchWords('face wash for oily skin'), ['face', 'wash', 'oily', 'skin']);
  assert.deepEqual(searchWords('the and for'), ['the', 'and', 'for']);          // only filler: keep what they typed
  assert.deepEqual(searchWords('serum serum SERUM'), ['serum']);
  assert.equal(searchWords('b c d e f g h').length, 5);
  assert.deepEqual(searchWords('spf50+ (vitamin-c)'), ['spf50', 'vitamin', 'c']);
  assert.deepEqual(searchWords('crème brûlée'), ['crème', 'brûlée']);
  assert.equal(searchWords('x'.repeat(100))[0].length, 30);
  for (const empty of ['', '   ', null, undefined, '!!!']) assert.deepEqual(searchWords(empty), []);
});

test('word variants: plurals and UK/US spellings are forgiven; the typed word comes first; at most 4', () => {
  assert.deepEqual(wordVariants('scrub'), ['scrub']);
  assert.ok(wordVariants('scrubs').includes('scrub'));
  assert.ok(wordVariants('washes').includes('wash'));
  assert.ok(wordVariants('berries').includes('berry'));
  assert.ok(wordVariants('moisturisers').includes('moisturiser') && wordVariants('moisturisers').includes('moisturizer'));
  assert.ok(wordVariants('moisturizer').includes('moisturiser'));
  assert.ok(wordVariants('colour').includes('color') && wordVariants('color').includes('colour'));
  assert.ok(!wordVariants('glass').includes('glas'), 'a double s is not a plural');
  for (const w of ['serums', 'lotions', 'sunscreens', 'moisturisers', 'toners', 'masks', 'cleansers', 'shampoos', 'balms', 'oils', 'a', 'ab', 'spf50']) {
    const v = wordVariants(w); assert.equal(v[0], w); assert.ok(v.length <= 4); assert.equal(new Set(v).size, v.length);
  }
});

const SUBS = [{ name: 'Serums', group_name: 'Face', category: 'Skincare' }, { name: 'Toners', group_name: 'Face', category: 'Skincare' }, { name: 'Body Scrubs', group_name: 'Body Care', category: 'Skincare' }, { name: 'Shampoo', group_name: '', category: 'Hair Care' }];
const CATS = [{ id: C1, name: 'Skincare' }, { id: C2, name: 'Hair Care' }];

test('search filters: every word must match (one expression per word); empty search gives none', () => {
  const f = buildSearchFilters({ q: 'body scrub', categories: CATS, subcategories: SUBS });
  assert.equal(f.length, 2);
  assert.match(f[0], /name\.ilike\.%body%/); assert.match(f[1], /name\.ilike\.%scrub%/); assert.match(f[1], /subcategory\.ilike\.%scrub%/);
  assert.deepEqual(buildSearchFilters({ q: '', categories: CATS, subcategories: SUBS }), []);
});
test('search filters: a category name, a subcategory name and a group heading each find the products inside', () => {
  assert.match(buildSearchFilters({ q: 'skincare', categories: CATS, subcategories: SUBS })[0], new RegExp(`category_id\\.in\\.\\(${C1}\\)`));
  assert.match(buildSearchFilters({ q: 'hair', categories: CATS, subcategories: SUBS })[0], new RegExp(`category_id\\.in\\.\\(${C2}\\)`));
  assert.match(buildSearchFilters({ q: 'face', categories: CATS, subcategories: SUBS })[0], /subcategory\.in\.\("Serums","Toners"\)/);
  assert.match(buildSearchFilters({ q: 'shampoo', categories: CATS, subcategories: SUBS })[0], /subcategory\.in\.\("Shampoo"\)/);
  assert.match(buildSearchFilters({ q: 'scrubs', categories: CATS, subcategories: SUBS })[0], /subcategory\.in\.\("Body Scrubs"\)/);
  assert.match(buildSearchFilters({ q: 'body care', categories: CATS, subcategories: SUBS })[0], /subcategory\.in\.\("Body Scrubs"\)/);
});
test('search filters: UK and US spellings and plurals match the same things', () => {
  const us = buildSearchFilters({ q: 'moisturizers', categories: [], subcategories: [{ name: 'Moisturisers', group_name: 'Face' }] })[0];
  assert.match(us, /name\.ilike\.%moisturisers%/); assert.match(us, /subcategory\.in\.\("Moisturisers"\)/);
});
test('search filters: "any word" mode is one expression covering every word', () => {
  const f = buildSearchFilters({ q: 'body scrub', categories: CATS, subcategories: SUBS, mode: 'any' });
  assert.equal(f.length, 1); assert.match(f[0], /name\.ilike\.%body%/); assert.match(f[0], /name\.ilike\.%scrub%/);
});
test('search filters: typed text can never add filter syntax; only letters and digits reach the query', () => {
  for (const evil of ['a,b)(c"d*%', 'x.eq.1,or(id.eq.2)', '"; drop table products; --', 'name.ilike.%25', '\\"),sku.neq.x']) {
    for (const mode of ['all', 'any']) {
      for (const expr of buildSearchFilters({ q: evil, categories: CATS, subcategories: SUBS, mode })) {
        const patterns = [...expr.matchAll(/(\w+)\.ilike\.%([^%,]*)%/g)];
        assert.ok(patterns.length > 0);
        for (const [, , word] of patterns) assert.match(word, /^[\p{L}\p{N}]+$/u, evil);
        const left = expr.replace(/(name|brand|sku|subcategory)\.ilike\.%[\p{L}\p{N}]+%/gu, '').replace(/subcategory\.in\.\(("[^"\\]*",?)+\)/g, '').replace(/category_id\.in\.\([0-9a-f,-]+\)/g, '').replace(/,/g, '').trim();
        assert.equal(left, '', `unexpected syntax left over for ${evil}: ${left}`);
      }
    }
  }
  const quoted = buildSearchFilters({ q: 'weird', categories: [], subcategories: [{ name: 'Weird "name"\\', group_name: '' }] })[0];
  assert.match(quoted, /subcategory\.in\.\("Weird name"\)/, 'quotes and backslashes are stripped inside the list');
  assert.equal(buildSearchFilters({ q: 'skincare', categories: [{ id: 'not-a-uuid', name: 'Skincare' }], subcategories: [] })[0].includes('category_id'), false, 'a bad id is never put in the query');
});

const P = (o) => ({ id: 'x', name: '', brand: 'B', category: 'Skincare', subcategory: '', sku: 'S', tags: [], concerns: [], rating: 0, reviewCount: 0, price: 1000, stock: 5, isNew: false, isBestSeller: false, isFeatured: false, discount: 0, ...o });
const ids = (l) => l.map((p) => p.id).sort();
test('demo catalogue: subcategory filter and forgiving search', () => {
  const list = [P({ id: '1', name: 'Sugar Polish', subcategory: 'Body Scrubs' }), P({ id: '2', name: 'Hydra Moisturiser' }), P({ id: '3', name: 'Rose Toner', subcategory: 'Toners' })];
  assert.deepEqual(ids(filterProducts(list, { sub: 'Toners' }).items ?? filterProducts(list, { sub: 'Toners' })), ['3']);
  const run = (o) => { const r = filterProducts(list, o); return ids(Array.isArray(r) ? r : r.items); };
  assert.deepEqual(run({ q: 'body scrub' }), ['1']);
  assert.deepEqual(run({ q: 'moisturizer' }), ['2']);
  assert.deepEqual(run({ q: 'toners' }), ['3']);
  assert.deepEqual(run({ q: 'skincare' }), ['1', '2', '3']);
  assert.deepEqual(run({ q: 'nothing like this' }), []);
});

test('subcategory slugs: any name an admin types makes a valid web address (or is refused), never a broken one', () => {
  const OK = /^[a-z0-9]+(-[a-z0-9]+)*$/;
  for (const n of ['Body Washes', 'Hair Treatments', "Men's Care", 'Lip Mask', 'SPF 50+', 'Moisturisers & Creams', '  Face  ', 'Café', '--', '&&&', 'A  -  B']) {
    const s = slugify(n); assert.ok(s === '' || (OK.test(s) && s.length <= 60), `${n} -> "${s}"`);
  }
  assert.equal(slugify('Body Washes'), 'body-washes');
});
