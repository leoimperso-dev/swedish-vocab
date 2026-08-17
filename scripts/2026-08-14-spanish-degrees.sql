-- Spanish builds its degrees with "más" + adjective, which is a grammar rule,
-- not a form worth storing on 2000 rows. Only these four are suppletive, and
-- they are exactly the ones a learner cannot derive.
UPDATE "Word"
SET forms = COALESCE(forms, '{}'::jsonb) || jsonb_build_object('comparative', v.comparative, 'superlative', v.superlative)
FROM (VALUES
  ('bueno',   'mejor', 'el mejor'),
  ('malo',    'peor',  'el peor'),
  ('grande',  'mayor', 'el mayor'),
  ('pequeño', 'menor', 'el menor')
) AS v(term, comparative, superlative)
WHERE "Word".pair = 'es-fr'
  AND "Word"."wordType" = 'ADJECTIVE'
  AND "Word".term = v.term;
