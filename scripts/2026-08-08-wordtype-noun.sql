-- English nouns carry no gender, so they need a type of their own next to the
-- Swedish NOUN_EN / NOUN_ETT. Kept in its own file: a new enum value cannot be
-- used in the transaction that adds it.
ALTER TYPE "WordType" ADD VALUE IF NOT EXISTS 'NOUN' AFTER 'NOUN_ETT';
