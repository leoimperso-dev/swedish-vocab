-- Normalise the language-specific JSON keys so they read correctly for any pair:
--   Word.examples      [{sv, fr?, blank}] -> [{term, translation?, blank}]
--   Word.details.usage [{sv, fr}]         -> [{term, translation}]
-- The "does the first element still use the old key" guard makes this re-runnable.
-- jsonb_exists() is used instead of the `?` operator to stay driver-agnostic.

UPDATE "Word" w
SET examples = sub.value
FROM (
  SELECT "Word".id,
         jsonb_agg(
           jsonb_strip_nulls(jsonb_build_object(
             'term', e.value ->> 'sv',
             'translation', e.value ->> 'fr',
             'blank', e.value ->> 'blank'
           )) ORDER BY e.ord
         ) AS value
  FROM "Word", jsonb_array_elements("Word".examples) WITH ORDINALITY AS e(value, ord)
  WHERE jsonb_typeof("Word".examples) = 'array'
    AND jsonb_array_length("Word".examples) > 0
    AND jsonb_exists("Word".examples -> 0, 'sv')
  GROUP BY "Word".id
) sub
WHERE w.id = sub.id;

UPDATE "Word" w
SET details = jsonb_set(w.details, '{usage}', sub.value)
FROM (
  SELECT "Word".id,
         jsonb_agg(
           jsonb_build_object(
             'term', u.value ->> 'sv',
             'translation', u.value ->> 'fr'
           ) ORDER BY u.ord
         ) AS value
  FROM "Word", jsonb_array_elements("Word".details -> 'usage') WITH ORDINALITY AS u(value, ord)
  WHERE jsonb_exists("Word".details, 'usage')
    AND jsonb_typeof("Word".details -> 'usage') = 'array'
    AND jsonb_array_length("Word".details -> 'usage') > 0
    AND jsonb_exists("Word".details -> 'usage' -> 0, 'sv')
  GROUP BY "Word".id
) sub
WHERE w.id = sub.id;
