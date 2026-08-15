-- N2 post-import validation (read-only except invalid FK test in rolled-back txn)
SELECT
  (SELECT COUNT(*) FROM public.trade_national_lgu) AS total_lgu,
  (SELECT COUNT(*) FROM public.trade_national_lgu WHERE lgu_type = 'city') AS city_n,
  (SELECT COUNT(*) FROM public.trade_national_lgu WHERE lgu_type = 'municipality') AS mun_n,
  (SELECT COUNT(*) FROM (
     SELECT canonical_id FROM public.trade_national_lgu GROUP BY canonical_id HAVING COUNT(*) > 1
   ) d) AS dup_canonical,
  (SELECT COUNT(*) FROM public.trade_national_lgu_alias WHERE kind = 'legacy_product') AS legacy_alias_n,
  (SELECT COUNT(*) FROM public.trade_local_area_lgu_map) AS local_map_n,
  (SELECT COUNT(*) FROM public.trade_national_lgu WHERE display_name IN (
     'Binondo','Ermita','Intramuros','Malate','Paco','Pandacan','Port Area','Quiapo',
     'Sampaloc','San Miguel','San Nicolas','Santa Ana','Santa Cruz','Tondo I/II'
   ) AND region_code = '13' AND province_code IS NULL AND lgu_type = 'municipality') AS suspicious_manila_submun;
