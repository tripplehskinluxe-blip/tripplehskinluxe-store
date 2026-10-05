import fs from 'node:fs';
import { SEED_PRODUCTS } from '../data/seed-products.js';
const H = ['sku','name','brand','category','subcategory','price','old_price','stock','short_description','description','ingredients','how_to_use','tags','concerns','image_urls','featured','best_seller','new'];
const esc = (v) => { v = v == null ? '' : String(v); return /[",\n\r]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; };
const rows = SEED_PRODUCTS.map((p) => [p.sku, p.name, p.brand, p.category, p.subcategory, p.price, p.oldPrice || '', p.stock, p.shortDescription, p.description, p.ingredients, p.howToUse, p.tags.join('|'), p.concerns.join('|'), '', p.isFeatured ? 1 : 0, p.isBestSeller ? 1 : 0, p.isNew ? 1 : 0]);
fs.writeFileSync(new URL('../data/products.csv', import.meta.url), [H.join(','), ...rows.map((r) => r.map(esc).join(','))].join('\r\n'));
console.log('wrote data/products.csv with', rows.length, 'products');
