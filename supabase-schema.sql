-- SAHA TAKİP SİSTEMİ — Supabase veritabanı şeması
-- Supabase panelinde: SQL Editor > New query > bu dosyanın tamamını yapıştır > Run

create extension if not exists "pgcrypto";

create table personel (
  id uuid primary key default gen_random_uuid(),
  personel_no text unique not null,
  sifre text not null,
  ad text not null,
  lokasyon text,
  rol text not null default 'personel',
  created_at timestamptz default now()
);

create table lokasyonlar (
  id uuid primary key default gen_random_uuid(),
  ad text unique not null
);

create table kalem_turleri (
  id uuid primary key default gen_random_uuid(),
  ad text unique not null
);

create table araclar (
  id uuid primary key default gen_random_uuid(),
  plaka text unique not null,
  durum text not null default 'Boşta'
);

create table giris_cikis (
  id uuid primary key default gen_random_uuid(),
  personel_no text not null,
  ad text not null,
  giris_saati timestamptz,
  cikis_saati timestamptz,
  sure_saat numeric,
  durum text not null default 'Açık'
);

create table saha_verileri (
  id uuid primary key default gen_random_uuid(),
  tarih timestamptz default now(),
  personel_no text not null,
  ad text not null,
  lokasyon text not null,
  kalem_turu text not null,
  miktar numeric not null,
  birim_fiyat numeric not null,
  toplam numeric not null,
  aciklama text
);

create table arac_kullanim (
  id uuid primary key default gen_random_uuid(),
  tarih timestamptz default now(),
  personel_no text not null,
  ad text not null,
  plaka text not null,
  alis_km numeric not null,
  teslim_km numeric,
  katedilen_km numeric,
  durum text not null default 'Açık'
);

create table teklifler (
  id uuid primary key default gen_random_uuid(),
  tarih timestamptz default now(),
  lokasyon text not null,
  toplam_maliyet numeric not null,
  teklif_metni text not null,
  durum text not null default 'Onay Bekliyor'
);

-- Bu uygulama kendi giriş sistemini kullanıyor (Supabase Auth değil),
-- bu yüzden RLS'i kapatıp anon key üzerinden okuma/yazmaya izin veriyoruz.
-- Not: Bu, internal/kapalı kullanım için kabul edilebilir bir seçim ama
-- tabloların URL+anon key bilenler tarafından erişilebilir olduğunu unutmayın.
alter table personel disable row level security;
alter table lokasyonlar disable row level security;
alter table kalem_turleri disable row level security;
alter table araclar disable row level security;
alter table giris_cikis disable row level security;
alter table saha_verileri disable row level security;
alter table arac_kullanim disable row level security;
alter table teklifler disable row level security;

-- Başlangıç verileri (kendi verilerinle değiştir/çoğalt)
insert into lokasyonlar (ad) values ('Şantiye A · Kadıköy'), ('Şantiye B · Beşiktaş'), ('Şantiye C · Ümraniye');
insert into kalem_turleri (ad) values ('Malzeme'), ('İşçilik'), ('Nakliye'), ('Diğer');
insert into araclar (plaka, durum) values ('34 ABC 123', 'Boşta'), ('34 XYZ 456', 'Boşta'), ('06 DEF 789', 'Boşta');

insert into personel (personel_no, sifre, ad, lokasyon, rol) values
  ('1001', '1234', 'Ahmet Yılmaz', 'Şantiye A · Kadıköy', 'personel'),
  ('1002', '1234', 'Mehmet Kaya', 'Şantiye B · Beşiktaş', 'personel'),
  ('1003', '1234', 'Ayşe Demir', 'Şantiye C · Ümraniye', 'personel'),
  ('9001', 'admin123', 'Patron', null, 'patron');
