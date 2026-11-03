-- Buttons placed on a post's cover by the writer in the preview (Nov 2026): each button's text, link, position (% of the
-- cover), size and colour, plus an optional extra height under the picture and its fill colour. Empty by default, so
-- existing posts look exactly as before.
alter table blog_posts add column if not exists cover_buttons jsonb not null default '[]'::jsonb;
alter table blog_posts add column if not exists cover_extra smallint not null default 0 check (cover_extra between 0 and 60);
alter table blog_posts add column if not exists cover_fill text;
