-- SHIPPING ADMIN (migration 021). Run once in the SHOP project, SQL Editor, AFTER 020. Safe to re-run.
-- Every function checks is_admin() (admin account + two-factor), the same rule as the Settings screen.
-- Every save is written to the audit log.

CREATE OR REPLACE FUNCTION public.shipping_admin_snapshot() RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501'; END IF;
  RETURN jsonb_build_object(
    'zones', coalesce((SELECT jsonb_agg(jsonb_build_object('id', id, 'name', name, 'kind', kind, 'fee_ngn', fee_ngn, 'active', active, 'sort_order', sort_order) ORDER BY sort_order, name) FROM public.shipping_zones), '[]'::jsonb),
    'lgas', coalesce((SELECT jsonb_agg(jsonb_build_object('name', name, 'zone_id', zone_id) ORDER BY name) FROM public.shipping_lgas), '[]'::jsonb),
    'areas', coalesce((SELECT jsonb_agg(jsonb_build_object('id', id, 'lga', lga, 'name', name, 'aliases', to_jsonb(aliases), 'zone_id', zone_id, 'fee_ngn', fee_ngn, 'active', active) ORDER BY lga, name) FROM public.shipping_areas), '[]'::jsonb),
    'cities', coalesce((SELECT jsonb_agg(jsonb_build_object('id', id, 'state', state, 'city', city, 'fee_ngn', fee_ngn, 'active', active) ORDER BY state, city) FROM public.shipping_interstate_cities), '[]'::jsonb));
END $$;

CREATE OR REPLACE FUNCTION public.shipping_save_zone(p_id uuid, p_name text, p_fee integer, p_active boolean, p_sort integer) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_name text := btrim(coalesce(p_name, '')); v_id uuid; v_kind text; v_used integer;
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501'; END IF;
  IF char_length(v_name) < 2 OR char_length(v_name) > 60 THEN RAISE EXCEPTION 'the zone name must be 2 to 60 characters'; END IF;
  IF p_fee IS NOT NULL AND (p_fee < 0 OR p_fee > 1000000) THEN RAISE EXCEPTION 'the fee must be between 0 and 1,000,000 naira, or blank'; END IF;
  IF p_active IS NULL THEN RAISE EXCEPTION 'choose active or inactive'; END IF;
  IF EXISTS (SELECT 1 FROM public.shipping_zones WHERE lower(name) = lower(v_name) AND id IS DISTINCT FROM p_id) THEN RAISE EXCEPTION 'a zone with that name already exists'; END IF;
  IF p_id IS NULL THEN
    INSERT INTO public.shipping_zones (name, kind, fee_ngn, active, sort_order) VALUES (v_name, 'zone', p_fee, p_active, coalesce(p_sort, 0)) RETURNING id INTO v_id;
  ELSE
    SELECT kind INTO v_kind FROM public.shipping_zones WHERE id = p_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'zone not found'; END IF;
    IF NOT p_active AND v_kind = 'interstate' THEN RAISE EXCEPTION 'the Inter-state zone must stay on'; END IF;
    IF NOT p_active THEN
      SELECT (SELECT count(*) FROM public.shipping_lgas WHERE zone_id = p_id) + (SELECT count(*) FROM public.shipping_areas WHERE zone_id = p_id) INTO v_used;
      IF v_used > 0 THEN RAISE EXCEPTION 'this zone still covers % local government or area(s). Move them to another zone first', v_used; END IF;
    END IF;
    UPDATE public.shipping_zones SET name = v_name, fee_ngn = p_fee, active = p_active, sort_order = coalesce(p_sort, sort_order), updated_at = now() WHERE id = p_id;
    v_id := p_id;
  END IF;
  INSERT INTO public.audit_log (actor, action, entity, entity_id, meta) VALUES (auth.uid(), 'shipping_zone_saved', 'shipping_zones', v_id::text, jsonb_build_object('name', v_name, 'fee', p_fee, 'active', p_active));
  RETURN v_id;
END $$;

CREATE OR REPLACE FUNCTION public.shipping_save_lga(p_name text, p_zone uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.shipping_lgas WHERE name = p_name) THEN RAISE EXCEPTION 'unknown local government'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.shipping_zones WHERE id = p_zone AND kind = 'zone' AND active) THEN RAISE EXCEPTION 'choose an active zone'; END IF;
  UPDATE public.shipping_lgas SET zone_id = p_zone WHERE name = p_name;
  INSERT INTO public.audit_log (actor, action, entity, entity_id, meta) VALUES (auth.uid(), 'shipping_lga_saved', 'shipping_lgas', p_name, jsonb_build_object('zone_id', p_zone));
END $$;

CREATE OR REPLACE FUNCTION public.shipping_save_area(p_id uuid, p_lga text, p_name text, p_aliases text[], p_zone uuid, p_fee integer, p_active boolean) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_name text := btrim(coalesce(p_name, '')); v_al text[]; v_id uuid;
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.shipping_lgas WHERE name = p_lga) THEN RAISE EXCEPTION 'unknown local government'; END IF;
  IF char_length(v_name) < 2 OR char_length(v_name) > 60 THEN RAISE EXCEPTION 'the area name must be 2 to 60 characters'; END IF;
  SELECT coalesce(array_agg(btrim(x)), '{}') INTO v_al FROM unnest(coalesce(p_aliases, '{}'::text[])) x WHERE btrim(x) <> '';
  IF array_length(v_al, 1) > 5 THEN RAISE EXCEPTION 'at most 5 other names for an area'; END IF;
  IF EXISTS (SELECT 1 FROM unnest(v_al) x WHERE char_length(x) NOT BETWEEN 2 AND 60) THEN RAISE EXCEPTION 'each other name must be 2 to 60 characters'; END IF;
  IF p_zone IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.shipping_zones WHERE id = p_zone AND kind = 'zone' AND active) THEN RAISE EXCEPTION 'choose an active zone, or leave it on the local government zone'; END IF;
  IF p_fee IS NOT NULL AND (p_fee < 0 OR p_fee > 1000000) THEN RAISE EXCEPTION 'the fee must be between 0 and 1,000,000 naira, or blank'; END IF;
  IF p_active IS NULL THEN RAISE EXCEPTION 'choose active or inactive'; END IF;
  BEGIN
    IF p_id IS NULL THEN
      INSERT INTO public.shipping_areas (lga, name, aliases, zone_id, fee_ngn, active) VALUES (p_lga, v_name, v_al, p_zone, p_fee, p_active) RETURNING id INTO v_id;
    ELSE
      UPDATE public.shipping_areas SET lga = p_lga, name = v_name, aliases = v_al, zone_id = p_zone, fee_ngn = p_fee, active = p_active WHERE id = p_id RETURNING id INTO v_id;
      IF v_id IS NULL THEN RAISE EXCEPTION 'area not found'; END IF;
    END IF;
  EXCEPTION WHEN unique_violation THEN
    RAISE EXCEPTION 'this area is already listed under that local government';
  END;
  INSERT INTO public.audit_log (actor, action, entity, entity_id, meta) VALUES (auth.uid(), 'shipping_area_saved', 'shipping_areas', v_id::text, jsonb_build_object('lga', p_lga, 'name', v_name, 'fee', p_fee, 'active', p_active));
  RETURN v_id;
END $$;

CREATE OR REPLACE FUNCTION public.shipping_delete_area(p_id uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501'; END IF;
  DELETE FROM public.shipping_areas WHERE id = p_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'area not found'; END IF;
  INSERT INTO public.audit_log (actor, action, entity, entity_id) VALUES (auth.uid(), 'shipping_area_deleted', 'shipping_areas', p_id::text);
END $$;

CREATE OR REPLACE FUNCTION public.shipping_save_city(p_id uuid, p_state text, p_city text, p_fee integer, p_active boolean) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_city text := btrim(coalesce(p_city, '')); v_id uuid;
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501'; END IF;
  IF p_state NOT IN ('Abia','Adamawa','Akwa Ibom','Anambra','Bauchi','Bayelsa','Benue','Borno','Cross River','Delta','Ebonyi','Edo','Ekiti','Enugu','FCT - Abuja','Gombe','Imo','Jigawa','Kaduna','Kano','Katsina','Kebbi','Kogi','Kwara','Lagos','Nasarawa','Niger','Ogun','Ondo','Osun','Oyo','Plateau','Rivers','Sokoto','Taraba','Yobe','Zamfara') THEN RAISE EXCEPTION 'choose a state from the list'; END IF;
  IF p_state = 'Lagos' THEN RAISE EXCEPTION 'Lagos is priced by local government, not by city'; END IF;
  IF char_length(v_city) < 2 OR char_length(v_city) > 60 THEN RAISE EXCEPTION 'the city must be 2 to 60 characters'; END IF;
  IF p_fee IS NOT NULL AND (p_fee < 0 OR p_fee > 1000000) THEN RAISE EXCEPTION 'the fee must be between 0 and 1,000,000 naira, or blank'; END IF;
  IF p_active IS NULL THEN RAISE EXCEPTION 'choose active or inactive'; END IF;
  BEGIN
    IF p_id IS NULL THEN
      INSERT INTO public.shipping_interstate_cities (state, city, fee_ngn, active) VALUES (p_state, v_city, p_fee, p_active) RETURNING id INTO v_id;
    ELSE
      UPDATE public.shipping_interstate_cities SET state = p_state, city = v_city, fee_ngn = p_fee, active = p_active WHERE id = p_id RETURNING id INTO v_id;
      IF v_id IS NULL THEN RAISE EXCEPTION 'city not found'; END IF;
    END IF;
  EXCEPTION WHEN unique_violation THEN
    RAISE EXCEPTION 'that city is already listed for that state';
  END;
  INSERT INTO public.audit_log (actor, action, entity, entity_id, meta) VALUES (auth.uid(), 'shipping_city_saved', 'shipping_interstate_cities', v_id::text, jsonb_build_object('state', p_state, 'city', v_city, 'fee', p_fee, 'active', p_active));
  RETURN v_id;
END $$;

CREATE OR REPLACE FUNCTION public.shipping_delete_city(p_id uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501'; END IF;
  DELETE FROM public.shipping_interstate_cities WHERE id = p_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'city not found'; END IF;
  INSERT INTO public.audit_log (actor, action, entity, entity_id) VALUES (auth.uid(), 'shipping_city_deleted', 'shipping_interstate_cities', p_id::text);
END $$;

REVOKE EXECUTE ON FUNCTION public.shipping_admin_snapshot(), public.shipping_save_zone(uuid,text,integer,boolean,integer), public.shipping_save_lga(text,uuid),
  public.shipping_save_area(uuid,text,text,text[],uuid,integer,boolean), public.shipping_delete_area(uuid), public.shipping_save_city(uuid,text,text,integer,boolean),
  public.shipping_delete_city(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.shipping_admin_snapshot(), public.shipping_save_zone(uuid,text,integer,boolean,integer), public.shipping_save_lga(text,uuid),
  public.shipping_save_area(uuid,text,text,text[],uuid,integer,boolean), public.shipping_delete_area(uuid), public.shipping_save_city(uuid,text,text,integer,boolean),
  public.shipping_delete_city(uuid) TO authenticated;
