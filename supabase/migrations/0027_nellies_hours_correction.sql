-- ────────────────────────────────────────────────────────────────────────────
-- 0027_nellies_hours_correction.sql
--
-- Corrects Nellie's hours_json. The seed in 0026 was a plausible placeholder;
-- this migration replaces it with the actual hours per the floor team:
--
--   Mon–Thu  11:00–21:00
--   Fri–Sat  11:00–22:00
--   Sun      10:00–20:00
--
-- Plus a rooftop key — the rooftop stays open one hour past the dining room
-- every night. Nothing reads `hours_json.rooftop` yet, but capturing it here
-- means the future Hours UI gets it for free.
--
-- Idempotent. Safe to re-run.
-- ────────────────────────────────────────────────────────────────────────────

update public.brands set hours_json = '{
  "mon": [{"open":"11:00","close":"21:00"}],
  "tue": [{"open":"11:00","close":"21:00"}],
  "wed": [{"open":"11:00","close":"21:00"}],
  "thu": [{"open":"11:00","close":"21:00"}],
  "fri": [{"open":"11:00","close":"22:00"}],
  "sat": [{"open":"11:00","close":"22:00"}],
  "sun": [{"open":"10:00","close":"20:00"}],
  "rooftop": {
    "mon": [{"open":"11:00","close":"22:00"}],
    "tue": [{"open":"11:00","close":"22:00"}],
    "wed": [{"open":"11:00","close":"22:00"}],
    "thu": [{"open":"11:00","close":"22:00"}],
    "fri": [{"open":"11:00","close":"23:00"}],
    "sat": [{"open":"11:00","close":"23:00"}],
    "sun": [{"open":"10:00","close":"21:00"}]
  }
}'::jsonb
where slug = 'nellies';
