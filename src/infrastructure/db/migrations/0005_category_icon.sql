ALTER TABLE "budget_categories" ADD COLUMN "icon" text DEFAULT 'tag' NOT NULL;--> statement-breakpoint
-- Categorias que já existem ganham um ícone pelo nome; o resto fica com "tag".
UPDATE "budget_categories" SET "icon" = CASE
  WHEN "name" ILIKE '%merc%' THEN 'shopping-cart'
  WHEN "name" ILIKE '%restaur%' OR "name" ILIKE '%comida%' OR "name" ILIKE '%almo%' OR "name" ILIKE '%lanche%' THEN 'utensils'
  WHEN "name" ILIKE '%ônibus%' OR "name" ILIKE '%onibus%' OR "name" ILIKE '%metr%' THEN 'bus'
  WHEN "name" ILIKE '%transp%' OR "name" ILIKE '%uber%' OR "name" ILIKE '%combust%' OR "name" ILIKE '%carro%' THEN 'car'
  WHEN "name" ILIKE '%farm%' OR "name" ILIKE '%saúde%' OR "name" ILIKE '%saude%' THEN 'pill'
  WHEN "name" ILIKE '%manuten%' THEN 'wrench'
  WHEN "name" ILIKE '%casa%' THEN 'house'
  WHEN "name" ILIKE '%pet%' THEN 'paw-print'
  WHEN "name" ILIKE '%namor%' THEN 'heart'
  WHEN "name" ILIKE '%lazer%' OR "name" ILIKE '%rolê%' THEN 'star'
  WHEN "name" ILIKE '%assinat%' THEN 'repeat'
  WHEN "name" ILIKE '%compra%' THEN 'shopping-bag'
  WHEN "name" ILIKE '%roupa%' THEN 'shirt'
  WHEN "name" ILIKE '%presente%' THEN 'gift'
  WHEN "name" ILIKE '%curso%' OR "name" ILIKE '%educa%' THEN 'graduation-cap'
  ELSE 'tag'
END;
