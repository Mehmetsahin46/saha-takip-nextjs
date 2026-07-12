-- SAHA TAKİP SİSTEMİ — E-Posta Raporları SQL Güncellemesi
-- Supabase panelinde: SQL Editor > New query > bu dosyanın tamamını yapıştır > Run

-- 1. sistem_ayarlari tablosu yoksa oluştur, varsa sütunları kontrol et
create table if not exists sistem_ayarlari (
  id bigint primary key default 1,
  konum_dogrulama_aktif boolean default false,
  qr_dogrulama_aktif boolean default false,
  gunluk_rapor_aktif boolean default false,
  haftalik_rapor_aktif boolean default false,
  aylik_rapor_aktif boolean default false,
  rapor_eposta text
);

-- Sütunların varlığından emin olmak için (varsa hata vermez)
alter table sistem_ayarlari add column if not exists gunluk_rapor_aktif boolean default false;
alter table sistem_ayarlari add column if not exists haftalik_rapor_aktif boolean default false;
alter table sistem_ayarlari add column if not exists aylik_rapor_aktif boolean default false;
alter table sistem_ayarlari add column if not exists rapor_eposta text;

-- 2. RLS (Satır düzeyinde güvenlik) kuralını devre dışı bırak
alter table sistem_ayarlari disable row level security;

-- 3. İlk/varsayılan ayar kaydı yoksa ekle (id'si 1 olan tek bir satır olmalı)
insert into sistem_ayarlari (id, konum_dogrulama_aktif, qr_dogrulama_aktif, gunluk_rapor_aktif, haftalik_rapor_aktif, aylik_rapor_aktif, rapor_eposta)
values (1, false, false, false, false, false, '')
on conflict (id) do nothing;
