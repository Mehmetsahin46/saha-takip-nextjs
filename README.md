# Saha Takip Sistemi — Next.js + Supabase

## 1. Bağımlılıkları kur

VS Code'da bu klasörü aç, terminali aç (Terminal > New Terminal) ve:

```
npm install
```

## 2. Supabase veritabanını kur

1. Supabase panelinde projenin içine gir.
2. Sol menüden **SQL Editor** → **New query**.
3. Bu paketteki `supabase-schema.sql` dosyasının tüm içeriğini yapıştır → **Run**.
4. Bu işlem 8 tabloyu oluşturur ve örnek personel/lokasyon/araç verilerini ekler.

## 3. Ortam değişkenlerini ayarla

1. `.env.local.example` dosyasını kopyala, adını `.env.local` yap.
2. Supabase panelinde **Project Settings → API** kısmından `Project URL` ve `anon public` key'i kopyala, `.env.local` içine yapıştır.
3. `ANTHROPIC_API_KEY` için console.anthropic.com'dan bir API anahtarı al ve yapıştır (AI teklif özelliği için gerekli; olmadan sistemin geri kalanı çalışır, sadece teklif oluşturma çalışmaz).

## 4. Yerelde çalıştır

```
npm run dev
```

Tarayıcıda `http://localhost:3000` aç. Demo hesaplar (SQL şemasıyla otomatik eklendi):

- **Personel:** 1001 / 1234 (Ahmet Yılmaz → Şantiye A)
- **Patron:** 9001 / admin123

## 5. İnternete yayınla (Vercel — ücretsiz)

1. Bu projeyi GitHub'a gönder:
   ```
   git init
   git add .
   git commit -m "ilk versiyon"
   ```
   GitHub'da yeni bir repo oluştur, sonra:
   ```
   git remote add origin <repo-url>
   git push -u origin main
   ```
2. vercel.com'a git, GitHub hesabınla giriş yap, "New Project" ile bu repoyu seç.
3. Deploy ekranında **Environment Variables** kısmına `.env.local` dosyandaki 3 değişkeni aynı isimlerle ekle.
4. Deploy'a bas. Birkaç dakika içinde sana `https://senin-projen.vercel.app` gibi bir link verecek — bu link telefondan ve bilgisayardan herkesin girebileceği canlı adresin.

## Notlar

- Veriler artık Supabase'deki gerçek bir Postgres veritabanında — kalıcı, çok kullanıcı destekli, senin Google hesabına bağlı değil.
- Yeni lokasyon, kalem türü, araç veya personel eklemek için kod değiştirmene gerek yok — Patron panelindeki **Ayarlar** sekmesi bunun için var.
- KM bazlı tahmini araç maliyeti `app/patron/page.js` dosyasındaki `KM_BIRIM_MALIYET` sabitinden ayarlanabilir (şu an 5 TL/km).
- Güvenlik notu: Bu sistem kendi basit personel-no + şifre girişini kullanıyor (Supabase Auth değil), bu yüzden veritabanı tabloları RLS kapalı şekilde anon key ile erişilebilir durumda. Şirket-içi/kapalı kullanım için kabul edilebilir, ama halka açık bir üründe daha sıkı bir yetkilendirme katmanı eklenmeli.
