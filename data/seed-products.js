// Demo catalogue used when no database is connected (so `npm run dev` works immediately).
// Demo products carry no ratings or reviews. Real ones come from the reviews table.
export const CATEGORIES = [
  { name: 'Skincare', slug: 'skincare', description: 'Serums, cleansers and moisturisers for every routine.' },
  { name: 'Body Care', slug: 'body-care', description: 'Butters, scrubs and oils for soft, glowing skin.' },
  { name: 'Hair Care', slug: 'hair-care', description: 'Nourishing care for every curl and coil.' },
  { name: 'Fragrance', slug: 'fragrance', description: 'Signature scents and delicate body mists.' },
  { name: 'Spa & Wellness', slug: 'spa-wellness', description: 'Massage oils, bath soaks and wellness rituals.' },
];

export const BRANDS = ['GlowLab','DermaPure','SkinTheory','LumiSkin','Nourish Co.','Veloura','Aura Beauty','PureHaus','Radiant Skin','Bloom Cosmetics','CeraGlow'];

export const CONCERNS = { acne: 'Acne & Breakouts', dry: 'Dry Skin', darkspots: 'Dark Spots', pigment: 'Hyperpigmentation', sensitive: 'Sensitive Skin', glow: 'Glow & Radiance' };

// name|brand|category|subcategory|price|oldPrice|rating|reviews|stock|shape|concerns|skinType|flags(N,B,F)|short
const ROWS = [
'Gentle Hydrating Cleanser|DermaPure|Skincare|Cleansers|12500|15000|4.8|142|34|t|dry,sensitive|All skin types|B|A creamy cleanser that lifts away dirt without stripping.',
'Vitamin C Brightening Serum|GlowLab|Skincare|Serums|18500|22000|4.8|236|22|d|darkspots,glow,pigment|Normal, dull skin|B,F|A daily antioxidant serum for a brighter, more even-looking tone.',
'Niacinamide 10% Serum|SkinTheory|Skincare|Serums|16000|0|4.7|198|3|d|acne,pigment|Oily, combination skin|B|Helps refine the look of pores and balance shine through the day.',
'Hyaluronic Acid Serum|LumiSkin|Skincare|Serums|17500|20000|4.6|121|18|d|dry,glow|Dry, dehydrated skin|N|Lightweight, multi-weight hydration for plump, comfortable skin.',
'Daily Moisture Cream|CeraGlow|Skincare|Moisturisers|14500|0|4.7|164|27|j|dry,sensitive|All skin types|F|A cushiony, fragrance-free cream for all-day comfort.',
'SPF 50 Daily Sunscreen|DermaPure|Skincare|Sun Care|15500|18000|4.9|312|40|t|darkspots,pigment|All skin types|B,F|A weightless broad-spectrum sunscreen with no white cast.',
'Salicylic Acid Cleanser|SkinTheory|Skincare|Cleansers|11500|0|4.5|87|4|t|acne|Oily, acne-prone skin|N|A clarifying gel cleanser that helps keep breakouts in check.',
'Barrier Repair Cream|CeraGlow|Skincare|Moisturisers|19500|23000|4.8|109|0|j|sensitive,dry|Sensitive skin|N|A rich ceramide cream that comforts and supports the skin barrier.',
'Shea Body Butter|Nourish Co.|Body Care|Body Butter|9500|0|4.9|276|45|j|dry|All skin types|B|Whipped, unrefined shea for deep, long-lasting softness.',
'Exfoliating Body Scrub|Veloura|Body Care|Scrubs|8500|10000|4.6|94|2|j|glow,darkspots|All skin types|N|A sugar and oil scrub that buffs away dullness.',
'Hydrating Shower Gel|Nourish Co.|Body Care|Body Wash|6500|0|4.4|66|38|p|dry|All skin types||A creamy, soap-free wash that leaves skin soft, never tight.',
'Body Glow Oil|Veloura|Body Care|Body Oils|13500|16000|4.7|131|15|p|glow,dry|All skin types|F|A silky dry oil with a soft, radiant shimmer.',
'Nourishing Body Lotion|PureHaus|Body Care|Lotions|7500|0|4.6|158|50|p|dry|All skin types|B|A fast-absorbing daily lotion for all-day moisture.',
'Strengthening Shampoo|Bloom Cosmetics|Hair Care|Shampoo|9000|0|4.5|73|29|p||All hair types||A gentle cleanse that supports stronger-looking hair.',
'Hydrating Conditioner|Bloom Cosmetics|Hair Care|Conditioner|9500|11000|4.6|81|3|p||Dry, textured hair|N|Deep slip and moisture for easier detangling.',
'Leave-In Curl Cream|Aura Beauty|Hair Care|Styling|11000|0|4.8|203|21|j||Curly, coily hair|B,F|Defines curls and coils with soft, frizz-free hold.',
'Scalp Treatment Oil|PureHaus|Hair Care|Treatments|8500|10000|4.5|59|0|d||All hair types||A lightweight blend to soothe and nourish the scalp.',
'Hair Growth Serum|Radiant Skin|Hair Care|Treatments|14000|0|4.4|102|17|d||Thinning, fragile hair|N|A daily scalp serum to support fuller-looking hair.',
'Eau de Parfum|Veloura|Fragrance|Perfume|32000|38000|4.8|145|12|f||All|B,F|A warm floral-amber signature scent with lasting wear.',
'Body Mist|Aura Beauty|Fragrance|Body Mists|7500|0|4.5|88|35|p||All||A light, fresh veil of scent for everyday.',
'Vanilla Fragrance Oil|Radiant Skin|Fragrance|Fragrance Oils|11500|0|4.6|54|19|d||All|N|A cosy, alcohol-free oil with creamy vanilla warmth.',
'Beauty Gummies|LumiSkin|Spa & Wellness|Supplements|18000|21000|4.5|96|26|s|glow|All|F,N|A daily gummy with biotin and vitamin C.',
'Collagen Powder|GlowLab|Spa & Wellness|Supplements|24500|0|4.6|112|14|s|glow|All|B|An unflavoured collagen peptide powder that mixes easily.',
'Aromatherapy Massage Oil|Veloura|Spa & Wellness|Massage|16500|19000|0|0|20|d||All|F,N|A warming blend of lavender and sweet almond oil for relaxing massage.',
'Lavender Bath Soak|Nourish Co.|Spa & Wellness|Bath & Soak|8500|0|0|0|30|j||All|N|Mineral salts with lavender to soften skin and unwind after a long day.',
'Soy Wax Candle|PureHaus|Spa & Wellness|Candles|9500|0|0|0|3|j||All||A slow-burning candle with calming vanilla and sandalwood notes.',
'Calming Herbal Tea|Radiant Skin|Spa & Wellness|Tea|5500|0|0|0|40|s||All||A caffeine-free blend of chamomile, lemongrass and mint.',
'Silk Sleep Eye Mask|Aura Beauty|Spa & Wellness|Accessories|7000|0|0|0|0|s||All||A soft, light-blocking mask for deeper rest.',
];

const ING = {
  Cleansers: 'Aqua, Glycerin, Coco-Glucoside, Panthenol, Allantoin, Sodium Hyaluronate, Aloe Barbadensis Leaf Juice',
  Serums: 'Aqua, Glycerin, Niacinamide, Sodium Hyaluronate, Panthenol, Ascorbyl Glucoside, Ferulic Acid, Phenoxyethanol',
  Moisturisers: 'Aqua, Squalane, Ceramide NP, Glycerin, Shea Butter, Cholesterol, Tocopherol, Allantoin',
  'Sun Care': 'Aqua, Zinc Oxide, Octocrylene, Glycerin, Vitamin E, Niacinamide, Squalane',
  Massage: 'Prunus Amygdalus Dulcis (Sweet Almond) Oil, Lavandula Angustifolia Oil, Tocopherol',
  'Bath & Soak': 'Magnesium Sulfate, Sodium Chloride, Lavandula Angustifolia Oil, Tocopherol',
  Candles: 'Soy Wax, Cotton Wick, Fragrance (Vanilla, Sandalwood)',
  Tea: 'Chamomile, Lemongrass, Peppermint, Hibiscus',
  Skincare: 'Aqua, Glycerin, Panthenol, Allantoin, Tocopherol',
  'Body Care': 'Butyrospermum Parkii (Shea) Butter, Glycerin, Cocos Nucifera Oil, Tocopherol, Parfum',
  'Hair Care': 'Aqua, Glycerin, Panthenol, Hydrolyzed Keratin, Argania Spinosa Kernel Oil, Rosemary Leaf Extract',
  Fragrance: 'Alcohol Denat., Parfum, Aqua, Linalool, Limonene, Coumarin',
  'Spa & Wellness': 'Hydrolyzed Collagen, Biotin, Vitamin C, Natural Flavours',
};
const HOW = {
  Skincare: 'Apply to clean skin morning and/or night. Follow with moisturiser and, in the daytime, sunscreen. Patch test before first use.',
  'Body Care': 'Apply generously to damp or dry skin after bathing. Massage in until absorbed. Avoid broken skin.',
  'Hair Care': 'Apply to clean, damp hair or scalp. Work through lengths, then style as usual. Rinse off if directed on pack.',
  Fragrance: 'Spray or apply to pulse points from about 15cm away. Avoid eyes and broken skin.',
  'Spa & Wellness': 'Use as directed on pack and make it a calming part of your evening. Not a substitute for medical advice; keep out of reach of children.',
};

const slug = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');

export const SEED_PRODUCTS = ROWS.map((r, i) => {
  const f = r.split('|');
  const price = +f[4], old = +f[5], fl = f[12] || '';
  const concerns = f[10] ? f[10].split(',') : [];
  return {
    id: 'seed-' + (i + 1), slug: slug(f[0]), sku: 'THS-' + (1001 + i),
    name: f[0], brand: f[1], category: f[2], subcategory: f[3],
    price, oldPrice: old, discount: old ? Math.round((1 - price / old) * 100) : 0,
    stock: +f[8], images: [], shape: f[9],
    shortDescription: f[13],
    description: `${f[0]} by ${f[1]}. ${f[13]} Made for ${f[11].toLowerCase()}, it fits easily into a daily routine and works well with the rest of the range.`,
    ingredients: ING[f[3]] || ING[f[2]] || '', howToUse: HOW[f[2]] || '',
    skinType: f[11], concerns,
    tags: [f[2].toLowerCase(), f[3].toLowerCase(), f[1].toLowerCase()],
    isNew: fl.includes('N'), isBestSeller: fl.includes('B'), isFeatured: fl.includes('F'),
    rating: 0, reviewCount: 0,   // demo catalogue carries NO invented ratings; real ones come from the reviews table
  };
});
