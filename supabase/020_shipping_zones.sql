-- SHIPPING ZONES (migration 020). Run once in the SHOP project, SQL Editor. Safe to re-run.
-- The local government is the anchor: every Lagos local government belongs to one zone.
-- A specific area (inside a local government) can have its own zone and fee. A zone or fee left empty is "not set yet".
-- Only the server writes these tables (service role). Customers and the browser cannot.

CREATE TABLE IF NOT EXISTS public.shipping_zones (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE CHECK (char_length(name) BETWEEN 2 AND 60),
  kind text NOT NULL DEFAULT 'zone' CHECK (kind IN ('zone','interstate')),
  fee_ngn integer CHECK (fee_ngn IS NULL OR (fee_ngn >= 0 AND fee_ngn <= 1000000)),
  active boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS shipping_zones_one_interstate ON public.shipping_zones (kind) WHERE kind = 'interstate';

CREATE TABLE IF NOT EXISTS public.shipping_lgas (
  name text PRIMARY KEY CHECK (name IN ('Agege','Ajeromi-Ifelodun','Alimosho','Amuwo-Odofin','Apapa','Badagry','Epe','Eti-Osa','Ibeju-Lekki','Ifako-Ijaiye','Ikeja','Ikorodu','Kosofe','Lagos Island','Lagos Mainland','Mushin','Ojo','Oshodi-Isolo','Shomolu','Surulere')),
  zone_id uuid NOT NULL REFERENCES public.shipping_zones(id) ON DELETE RESTRICT
);

CREATE TABLE IF NOT EXISTS public.shipping_areas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lga text NOT NULL REFERENCES public.shipping_lgas(name) ON DELETE CASCADE,
  name text NOT NULL CHECK (char_length(name) BETWEEN 2 AND 60),
  aliases text[] NOT NULL DEFAULT '{}',
  zone_id uuid REFERENCES public.shipping_zones(id) ON DELETE RESTRICT,
  fee_ngn integer CHECK (fee_ngn IS NULL OR (fee_ngn >= 0 AND fee_ngn <= 1000000)),
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (lga, name)
);

CREATE TABLE IF NOT EXISTS public.shipping_interstate_cities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  state text NOT NULL CHECK (char_length(state) BETWEEN 2 AND 60),
  city text NOT NULL CHECK (char_length(city) BETWEEN 2 AND 60),
  fee_ngn integer CHECK (fee_ngn IS NULL OR (fee_ngn >= 0 AND fee_ngn <= 1000000)),
  active boolean NOT NULL DEFAULT true,
  UNIQUE (state, city)
);

ALTER TABLE public.shipping_zones ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.shipping_lgas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.shipping_areas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.shipping_interstate_cities ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.shipping_zones, public.shipping_lgas, public.shipping_areas, public.shipping_interstate_cities FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.shipping_zones, public.shipping_lgas, public.shipping_areas, public.shipping_interstate_cities TO service_role;

-- SEED: the zones from the current Bumpa checkout (prices as shown there). Inter-state is left blank for the admin.
INSERT INTO public.shipping_zones (name, kind, fee_ngn, sort_order) VALUES
  ('Lagos Mainland', 'zone', 3500, 1),
  ('Yaba', 'zone', 2000, 2),
  ('Lagos Island', 'zone', 4500, 3),
  ('Inter-state', 'interstate', NULL, 9)
ON CONFLICT (name) DO NOTHING;

-- SEED: all 20 Lagos local governments. Eti-Osa and Lagos Island go to Lagos Island; every other local government
-- starts on Lagos Mainland, the nearest zone, until the admin gives it its own zone (as agreed).
INSERT INTO public.shipping_lgas (name, zone_id)
SELECT l.name, z.id FROM (VALUES
  ('Agege','Lagos Mainland'),('Ajeromi-Ifelodun','Lagos Mainland'),('Alimosho','Lagos Mainland'),('Amuwo-Odofin','Lagos Mainland'),
  ('Apapa','Lagos Mainland'),('Badagry','Lagos Mainland'),('Epe','Lagos Mainland'),('Eti-Osa','Lagos Island'),
  ('Ibeju-Lekki','Lagos Mainland'),('Ifako-Ijaiye','Lagos Mainland'),('Ikeja','Lagos Mainland'),('Ikorodu','Lagos Mainland'),
  ('Kosofe','Lagos Mainland'),('Lagos Island','Lagos Island'),('Lagos Mainland','Lagos Mainland'),('Mushin','Lagos Mainland'),
  ('Ojo','Lagos Mainland'),('Oshodi-Isolo','Lagos Mainland'),('Shomolu','Lagos Mainland'),('Surulere','Lagos Mainland')
) AS l(name, zone) JOIN public.shipping_zones z ON z.name = l.zone
ON CONFLICT (name) DO NOTHING;

-- SEED: specific areas, only where a source places them in that local government. No area fee is set: it uses its zone's price.
-- Yaba and Ebute Metta follow the Bumpa "Yaba" zone (their own zone and price).
INSERT INTO public.shipping_areas (lga, name, aliases, zone_id)
SELECT a.lga, a.name, a.aliases, CASE WHEN a.zone IS NULL THEN NULL ELSE z.id END
FROM (VALUES
  ('Ojo','Ojo town','{}'::text[],NULL),
  ('Ojo','Iyana Iba','{}'::text[],NULL),
  ('Ojo','Alaba','{}'::text[],NULL),
  ('Ojo','Ajangbadi','{}'::text[],NULL),
  ('Ojo','Imude','{"Imude-Shibiri"}'::text[],NULL),
  ('Ojo','Egan','{}'::text[],NULL),
  ('Ojo','Etegbin','{}'::text[],NULL),
  ('Ojo','Iba','{}'::text[],NULL),
  ('Lagos Mainland','Yaba','{}'::text[],'Yaba'),
  ('Lagos Mainland','Ebute Metta','{}'::text[],'Yaba'),
  ('Lagos Mainland','Sabo','{}'::text[],'Yaba'),
  ('Lagos Mainland','Alagomeji','{}'::text[],'Yaba'),
  ('Lagos Mainland','Otto','{Iddo}'::text[],NULL),
  ('Lagos Mainland','Olaleye','{}'::text[],NULL),
  ('Lagos Mainland','Maroko','{}'::text[],NULL),
  ('Lagos Mainland','Glover','{}'::text[],NULL),
  ('Lagos Mainland','Oko Baba','{Oko-Baba}'::text[],NULL),
  ('Lagos Mainland','Oyadiran','{}'::text[],NULL),
  ('Lagos Mainland','Abule Oja','{Abule-Oja}'::text[],NULL),
  ('Lagos Mainland','Iwaya','{}'::text[],NULL),
  ('Lagos Mainland','Igbobi','{}'::text[],NULL),
  ('Eti-Osa','Obalende','{}'::text[],NULL),
  ('Eti-Osa','Agungi','{}'::text[],NULL),
  ('Eti-Osa','Osapa London','{Osapa-London}'::text[],NULL),
  ('Eti-Osa','Ajah','{}'::text[],NULL),
  ('Oshodi-Isolo','Isolo','{}'::text[],NULL),
  ('Oshodi-Isolo','Mafoloku','{}'::text[],NULL),
  ('Oshodi-Isolo','Shogunle','{}'::text[],NULL),
  ('Oshodi-Isolo','Oke Afa','{Oke-Afa}'::text[],NULL),
  ('Ikorodu','Ikorodu town','{}'::text[],NULL)
) AS a(lga, name, aliases, zone)
LEFT JOIN public.shipping_zones z ON z.name = a.zone
ON CONFLICT (lga, name) DO NOTHING;
