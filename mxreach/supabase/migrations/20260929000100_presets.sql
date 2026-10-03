-- mxReach — audience presets.
--
-- A preset describes who you're reaching: which finders run and in what order,
-- and the sequence a new campaign starts from. Adding an audience means adding
-- a row here, never forking the code.
--
-- Starter copy contains [[...]] placeholders on purpose. A sequence can't be
-- activated while any are left, so nobody sends "[[your offer]]" to a real person.
--
-- Variables: {{first_name}}, {{last_name}}, {{name}}, {{company}}, {{role_title}},
-- {{sender_name}}. {{var|fallback}} uses the fallback when the value is empty.

insert into public.presets (id, name, description, finders, starter, sort) values
(
  'video-creators',
  'Video creators',
  'YouTubers, streamers and short-form creators. Most have no company domain, so the published business email on their site or link-in-bio comes first.',
  array['public_page', 'domain_api'],
  $json$[
    {"channel": "email", "delay_hours": 0,
     "subject": "{{first_name|Quick}} idea for a collab",
     "body": "Hi {{first_name|there}},\n\n[[One line on a video of theirs you actually watched and why it stuck.]]\n\n[[Who you are and what you'd like to do together, in one or two sentences.]]\n\nWould you be open to a quick chat about it?\n\n{{sender_name}}"},
    {"channel": "email", "delay_hours": 72,
     "subject": "",
     "body": "Hi {{first_name|there}}, just bringing this back to the top of your inbox in case it got buried. Happy to send details over email if that's easier.\n\n{{sender_name}}"},
    {"channel": "instagram", "delay_hours": 96,
     "subject": "",
     "body": "Hey {{first_name|there}}! Sent you an email about a collab a few days ago. Wanted to make sure it didn't land in spam. No pressure either way."}
  ]$json$::jsonb,
  1
),
(
  'music-artists',
  'Music artists',
  'Independent artists, producers and their teams. Booking and management emails are usually on their site or link-in-bio.',
  array['public_page', 'domain_api'],
  $json$[
    {"channel": "email", "delay_hours": 0,
     "subject": "{{first_name|Hey}}, working together",
     "body": "Hi {{first_name|there}},\n\n[[One line on a track or release of theirs, and why you're reaching out to them specifically.]]\n\n[[What you're proposing: feature, placement, sponsorship, show.]]\n\nIf this is better for your management, feel free to forward it.\n\n{{sender_name}}"},
    {"channel": "email", "delay_hours": 96,
     "subject": "",
     "body": "Hi {{first_name|there}}, following up on my note below. Let me know if someone else on your team handles this.\n\n{{sender_name}}"}
  ]$json$::jsonb,
  2
),
(
  'startup-founders',
  'Startup founders',
  'Founders and early teams. They almost always have a company domain, so the paid lookup runs first.',
  array['domain_api', 'public_page'],
  $json$[
    {"channel": "email", "delay_hours": 0,
     "subject": "{{company|Partnership}} x [[your company]]",
     "body": "Hi {{first_name|there}},\n\n[[Why {{company}} specifically, in one line.]]\n\n[[The partnership or offer, and what's in it for them.]]\n\nWorth a 15-minute call?\n\n{{sender_name}}"},
    {"channel": "email", "delay_hours": 72,
     "subject": "",
     "body": "Hi {{first_name|there}}, quick follow-up on the note below. If it's not a fit right now, just say so and I won't follow up again.\n\n{{sender_name}}"},
    {"channel": "linkedin", "delay_hours": 120,
     "subject": "",
     "body": "Hi {{first_name|there}}, I emailed you last week about a partnership with {{company|your team}}. Happy to share the details here if that's easier."}
  ]$json$::jsonb,
  3
),
(
  'community-owners',
  'Community owners',
  'Discord server owners, community leads and newsletter writers. Sponsorship and partnership contacts are usually published on their site.',
  array['public_page', 'domain_api'],
  $json$[
    {"channel": "email", "delay_hours": 0,
     "subject": "Partnership with {{company|your community}}",
     "body": "Hi {{first_name|there}},\n\n[[What you noticed about their community and why it's a fit.]]\n\n[[The partnership: cross-promo, sponsorship, event. Include what they get.]]\n\nOpen to talking it through?\n\n{{sender_name}}"},
    {"channel": "email", "delay_hours": 72,
     "subject": "",
     "body": "Hi {{first_name|there}}, following up on my note about a partnership. Happy to adjust it to what works for your community.\n\n{{sender_name}}"},
    {"channel": "discord", "delay_hours": 96,
     "subject": "",
     "body": "Hey {{first_name|there}}! I sent a partnership email to your business address earlier this week. Wanted to make sure it reached you."}
  ]$json$::jsonb,
  4
)
on conflict (id) do update set
  name = excluded.name, description = excluded.description, finders = excluded.finders,
  starter = excluded.starter, sort = excluded.sort;
