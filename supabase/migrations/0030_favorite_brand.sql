-- 0030_favorite_brand.sql (BEP)
-- Rename members.favorite_song → members.favorite_brand
-- Captures preferred brand category instead of a free-text song name.

alter table public.members
  rename column favorite_song to favorite_brand;

comment on column public.members.favorite_brand is
  'Preferred brand category (Restaurants & Food, Retail & Apparel, Fitness & Wellness, Beauty & Personal Care, Entertainment & Media, Travel & Hospitality, Tech & Gadgets, or freeform "Other" answer).';
