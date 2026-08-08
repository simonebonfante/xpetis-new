-- XPETIS · 0017 · Bucket di Supabase Storage
-- Due bucket privati: i documenti di viaggio non devono essere indovinabili né
-- indicizzabili. Le pagine li servono con signed URL a scadenza generati
-- server-side.

do $$
begin
  if not exists (select 1 from information_schema.schemata where schema_name = 'storage') then
    raise notice 'Schema storage assente: migrazione ignorata (ambiente non Supabase)';
    return;
  end if;

  insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
  values
    ('order-documents', 'order-documents', false, 52428800,
     array['application/pdf', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
           'image/jpeg', 'image/png']),
    ('td-media', 'td-media', true, 10485760,
     array['image/jpeg', 'image/png', 'image/webp'])
  on conflict (id) do nothing;
end $$;
