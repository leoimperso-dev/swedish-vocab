-- Spanish feminine nouns whose first syllable carries a stressed /a/ take "el"
-- in the singular: el área, el álgebra. The imported headwords used "la".
UPDATE "Word" SET term = 'el área'    WHERE pair = 'es-fr' AND term = 'la área';
UPDATE "Word" SET term = 'el álgebra' WHERE pair = 'es-fr' AND term = 'la álgebra';
