-- 0055_jge_aug30_bio_lock.sql
-- Align JGE brand bio with the Aug 30 specials lock.
-- Do not market roster/presale, listening parties, or songwriter rounds.
-- Do not touch Nellie's.
-- Safe to re-run.

update public.brands
   set bio = $bio$Jonas Group Entertainment is a full-service entertainment company on Nashville's historic Music Row, owned by the Jonas family. We are a label, a publisher, an artist-management group, and a steward of some of the most influential catalogs in country and pop.

Under our roof: Red Van Records (label), Jonas Group Publishing (songwriter representation and catalog), and a management roster that includes Rhett Akins, Aaron Gillespie, Levi Hummon, RaeLynn, Bailee Madison, Franklin Jonas, Justin Ebach, David Kalmusky, Hunter Hawkins, Amy Stroup, and Dan Marshall. Jonas Group Publishing champions Music Row catalogs through signings, acquisitions, and sync — including the acquired Jonas Brothers catalog.

This page is for the people who've been on our list for years — fans of the artists, friends of the family, and members of the broader Jonas universe. Live access includes a Music Row house tour, early writer and artist listens, and capped rotating live sessions with Kevin, Leslie, Amanda, Abby, and Raymond.$bio$
 where slug = 'jonas-group-ent';
