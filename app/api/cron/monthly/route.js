import { supabase } from '@/lib/supabase';

export async function GET(request) {
  return handleMonthlyReport(request);
}

export async function POST(request) {
  return handleMonthlyReport(request);
}

async function handleMonthlyReport(request) {
  // 1. Güvenlik Doğrulaması (CRON_SECRET)
  const authHeader = request.headers.get('Authorization');
  const { searchParams } = new URL(request.url);
  const token = searchParams.get('token');
  const cronSecret = process.env.CRON_SECRET;

  if (cronSecret) {
    const expectedAuth = `Bearer ${cronSecret}`;
    if (authHeader !== expectedAuth && token !== cronSecret) {
      return Response.json({ basari: false, mesaj: 'Yetkisiz erişim.' }, { status: 401 });
    }
  }

  try {
    // 2. Sistem Ayarlarını Oku
    const { data: s, error: sErr } = await supabase
      .from('sistem_ayarlari')
      .select('*')
      .eq('id', 1)
      .maybeSingle();

    if (sErr) {
      return Response.json({ basari: false, mesaj: 'Sistem ayarları okunamadı: ' + sErr.message }, { status: 500 });
    }

    if (!s) {
      return Response.json({ basari: false, mesaj: 'Sistem ayarları bulunamadı.' }, { status: 404 });
    }

    if (!s.aylik_rapor_aktif) {
      return Response.json({ basari: true, mesaj: 'Aylık rapor gönderme ayarı kapalı.' });
    }

    if (!s.rapor_eposta || !s.rapor_eposta.trim()) {
      return Response.json({ basari: false, mesaj: 'Rapor gönderilecek e-posta adresi ayarlanmamış.' });
    }

    const aliciEposta = s.rapor_eposta.trim();

    // 3. Zaman Aralığını Belirle (Geçen Ayın 1. Günü 00:00:00'den Son Günü 23:59:59'a kadar)
    const simdi = new Date();
    const yil = simdi.getFullYear();
    const ay = simdi.getMonth(); // 0-indexed. Örn: Temmuz ise ay = 6. Geçen ay Haziran (5).

    // Geçen ayın başlangıcı (1. günü)
    const startOfPrevMonth = new Date(yil, ay - 1, 1, 0, 0, 0, 0);
    // Geçen ayın bitişi (bu ayın 0. günü geçen ayın son günüdür)
    const endOfPrevMonth = new Date(yil, ay, 0, 23, 59, 59, 999);

    const startIso = startOfPrevMonth.toISOString();
    const endIso = endOfPrevMonth.toISOString();

    const gecenAyAdi = startOfPrevMonth.toLocaleDateString('tr-TR', { month: 'long', year: 'numeric' });

    // 4. Verileri Supabase'den Çek
    // A. Geçen Ayın Mesai Kayıtları
    const { data: mesailer } = await supabase
      .from('giris_cikis')
      .select('*')
      .eq('durum', 'Kapalı')
      .gte('giris_saati', startIso)
      .lte('giris_saati', endIso);

    // B. Geçen Ay Tamamlanan Görevler
    const { data: tamamlananGorevler } = await supabase
      .from('gorevler')
      .select('*')
      .eq('durum', 'Tamamlandı')
      .gte('tamamlanma_tarihi', startIso)
      .lte('tamamlanma_tarihi', endIso);

    // C. Geçen Ayın Araç Kullanımları
    const { data: aracKullanim } = await supabase
      .from('arac_kullanim')
      .select('*')
      .gte('tarih', startIso)
      .lte('tarih', endIso);

    // D. Geçen Ayın Saha Masrafları
    const { data: sahaVerileri } = await supabase
      .from('saha_verileri')
      .select('*')
      .gte('tarih', startIso)
      .lte('tarih', endIso);

    // 5. İstatistikleri Hesapla
    // A. Çalışma Saatleri (Personel Bazlı)
    let toplamSureSaat = 0;
    const personelSureleri = {}; // { 'Ad Soyad': toplamSaat }
    (mesailer || []).forEach(m => {
      const sure = Number(m.sure_saat) || 0;
      toplamSureSaat += sure;
      personelSureleri[m.ad] = (personelSureleri[m.ad] || 0) + sure;
    });

    const personelOzetListesi = Object.entries(personelSureleri)
      .map(([ad, saat]) => ({ ad, saat: Math.round(saat * 100) / 100 }))
      .sort((a, b) => b.saat - a.saat);

    // B. Masraflar (Lokasyon Bazlı)
    let toplamMasraf = 0;
    const lokasyonMasraflari = {}; // { 'Şantiye A': toplamMasraf }
    (sahaVerileri || []).forEach(v => {
      const tutar = Number(v.toplam) || 0;
      toplamMasraf += tutar;
      lokasyonMasraflari[v.lokasyon] = (lokasyonMasraflari[v.lokasyon] || 0) + tutar;
    });

    const lokasyonMasrafListesi = Object.entries(lokasyonMasraflari)
      .map(([lokasyon, tutar]) => ({ lokasyon, tutar }))
      .sort((a, b) => b.tutar - a.tutar);

    // C. Araç KM & Maliyetleri (Plaka Bazlı)
    let toplamKm = 0;
    const aracKullanimOzet = {}; // { '34 ABC 123': { km: 0, sefer: 0 } }
    (aracKullanim || []).forEach(a => {
      const km = Number(a.katedilen_km) || 0;
      toplamKm += km;
      if (!aracKullanimOzet[a.plaka]) {
        aracKullanimOzet[a.plaka] = { km: 0, sefer: 0 };
      }
      aracKullanimOzet[a.plaka].km += km;
      aracKullanimOzet[a.plaka].sefer += 1;
    });

    const KM_BIRIM_MALIYET = 5; // 5 TL / km
    const aracListesi = Object.entries(aracKullanimOzet)
      .map(([plaka, veri]) => ({
        plaka,
        km: veri.km,
        sefer: veri.sefer,
        maliyet: veri.km * KM_BIRIM_MALIYET
      }))
      .sort((a, b) => b.km - a.km);

    const tahminiToplamAracMaliyeti = toplamKm * KM_BIRIM_MALIYET;

    // 6. HTML E-posta Taslağını Oluştur
    const htmlContent = generateMonthlyReportHtml({
      ayAdi: gecenAyAdi,
      toplamSureSaat: Math.round(toplamSureSaat * 100) / 100,
      toplamMasraf,
      toplamKm,
      tahminiToplamAracMaliyeti,
      tamamlananGorevSayisi: (tamamlananGorevler || []).length,
      personelOzetListesi,
      lokasyonMasrafListesi,
      aracListesi
    });

    // 7. E-postayı Gönder (Resend API)
    const resendApiKey = process.env.RESEND_API_KEY;
    if (resendApiKey) {
      const res = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${resendApiKey}`
        },
        body: JSON.stringify({
          from: 'Saha Takip <onboarding@resend.dev>',
          to: aliciEposta,
          subject: `Aylık Saha Takip Performans Özeti — ${gecenAyAdi}`,
          html: htmlContent
        })
      });

      const resData = await res.json();
      if (res.ok) {
        return Response.json({
          basari: true,
          gonderildi: true,
          eposta: aliciEposta,
          messageId: resData.id
        });
      } else {
        return Response.json({
          basari: false,
          gonderildi: false,
          eposta: aliciEposta,
          mesaj: 'Resend API hatası: ' + JSON.stringify(resData),
          icerik: htmlContent
        }, { status: 502 });
      }
    } else {
      // API Key tanımlı değilse, geliştirme/test için HTML içeriği response olarak döner.
      return Response.json({
        basari: true,
        gonderildi: false,
        eposta: aliciEposta,
        mesaj: 'RESEND_API_KEY bulunamadı, e-posta gönderimi simüle edildi.',
        istatistikler: {
          ayAdi: gecenAyAdi,
          toplamSureSaat,
          toplamMasraf,
          toplamKm,
          tahminiToplamAracMaliyeti,
          tamamlananGorevSayisi: (tamamlananGorevler || []).length,
          personelSayisi: personelOzetListesi.length,
          lokasyonSayisi: lokasyonMasrafListesi.length,
          aracSayisi: aracListesi.length
        },
        icerik: htmlContent
      });
    }
  } catch (err) {
    return Response.json({ basari: false, mesaj: 'Sunucu hatası: ' + err.message }, { status: 500 });
  }
}

// Ondalık saati (örn. 10.5) "10 sa 30 dk" metnine çevirir.
function sureFormatla(saatOndalik) {
  const toplamDakika = Math.round((Number(saatOndalik) || 0) * 60);
  const saat = Math.floor(toplamDakika / 60);
  const dakika = toplamDakika % 60;
  if (saat === 0) return dakika + ' dk';
  if (dakika === 0) return saat + ' sa';
  return saat + ' sa ' + dakika + ' dk';
}

function generateMonthlyReportHtml({
  ayAdi,
  toplamSureSaat,
  toplamMasraf,
  toplamKm,
  tahminiToplamAracMaliyeti,
  tamamlananGorevSayisi,
  personelOzetListesi,
  lokasyonMasrafListesi,
  aracListesi
}) {
  return `
  <!DOCTYPE html>
  <html>
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Aylık Performans Raporu</title>
    <style>
      body {
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
        line-height: 1.6;
        color: #2b302d;
        background-color: #f7f9f8;
        margin: 0;
        padding: 0;
      }
      .wrapper {
        width: 100%;
        max-width: 600px;
        margin: 0 auto;
        padding: 20px 0;
      }
      .container {
        background-color: #ffffff;
        border: 1px solid #e1e5e2;
        border-radius: 12px;
        overflow: hidden;
        box-shadow: 0 4px 6px rgba(0,0,0,0.02);
      }
      .header {
        background: linear-gradient(135deg, #1b3846 0%, #1b5e5c 100%);
        color: #ffffff;
        padding: 35px 24px;
        text-align: center;
      }
      .header h1 {
        margin: 0;
        font-size: 24px;
        font-weight: 700;
        letter-spacing: -0.5px;
      }
      .header p {
        margin: 6px 0 0 0;
        font-size: 15px;
        opacity: 0.95;
      }
      .content {
        padding: 24px;
      }
      .stats-grid {
        display: table;
        width: 100%;
        margin-bottom: 24px;
        border-collapse: separate;
        border-spacing: 8px 0;
      }
      .stat-card {
        display: table-cell;
        width: 25%;
        background-color: #f0f3f1;
        border-radius: 8px;
        padding: 12px 8px;
        text-align: center;
        vertical-align: top;
      }
      .stat-label {
        font-size: 10px;
        color: #5b6560;
        text-transform: uppercase;
        font-weight: 600;
        letter-spacing: 0.5px;
        margin-bottom: 6px;
      }
      .stat-value {
        font-size: 15px;
        font-weight: 700;
        color: #1b3846;
        word-break: break-word;
      }
      .section-title {
        font-size: 14px;
        font-weight: 700;
        color: #1b3846;
        border-bottom: 2px solid #e1e5e2;
        padding-bottom: 8px;
        margin-top: 28px;
        margin-bottom: 12px;
        text-transform: uppercase;
        letter-spacing: 0.5px;
      }
      table {
        width: 100%;
        border-collapse: collapse;
        margin-bottom: 16px;
        font-size: 13px;
      }
      th {
        text-align: left;
        background-color: #f7f9f8;
        color: #5b6560;
        font-weight: 600;
        padding: 8px 10px;
        border-bottom: 1px solid #e1e5e2;
      }
      td {
        padding: 8px 10px;
        border-bottom: 1px solid #f0f2ee;
      }
      tr:last-child td {
        border-bottom: none;
      }
      .empty-state {
        color: #8c9691;
        font-style: italic;
        font-size: 13px;
        padding: 8px 0;
      }
      .footer {
        background-color: #f7f9f8;
        border-top: 1px solid #e1e5e2;
        padding: 16px 24px;
        text-align: center;
        font-size: 11px;
        color: #8c9691;
      }
      .footer a {
        color: #1b5e5c;
        text-decoration: none;
        font-weight: 600;
      }
    </style>
  </head>
  <body>
    <div class="wrapper">
      <div class="container">
        <!-- Header -->
        <div class="header">
          <h1>Saha Takip Sistemi</h1>
          <p>Aylık Performans Raporu &bull; ${ayAdi}</p>
        </div>

        <!-- Content -->
        <div class="content">
          <!-- Stats Grid -->
          <div class="stats-grid">
            <div class="stat-card">
              <div class="stat-label">Toplam Mesai</div>
              <div class="stat-value">${sureFormatla(toplamSureSaat)}</div>
            </div>
            <div class="stat-card">
              <div class="stat-label">Toplam Masraf</div>
              <div class="stat-value">${toplamMasraf.toLocaleString('tr-TR')} TL</div>
            </div>
            <div class="stat-card">
              <div class="stat-label">Toplam KM</div>
              <div class="stat-value">${toplamKm.toLocaleString('tr-TR')} km</div>
            </div>
            <div class="stat-card">
              <div class="stat-label">Biten Görev</div>
              <div class="stat-value">${tamamlananGorevSayisi} Adet</div>
            </div>
          </div>

          <!-- Personel Performans Listesi -->
          <div class="section-title">Personel Çalışma Saatleri</div>
          ${personelOzetListesi.length > 0 ? `
            <table>
              <thead>
                <tr>
                  <th>Sıra</th>
                  <th>Personel Ad Soyad</th>
                  <th style="text-align: right;">Toplam Çalışma Süresi</th>
                </tr>
              </thead>
              <tbody>
                ${personelOzetListesi.map((p, index) => `
                  <tr>
                    <td style="width: 40px; color:#8c9691;">#${index + 1}</td>
                    <td><strong>${p.ad}</strong></td>
                    <td style="text-align: right; font-weight: 600; color: #1b3846;">${sureFormatla(p.saat)}</td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          ` : `<div class="empty-state">Geçen ay tamamlanmış mesai kaydı bulunmuyor.</div>`}

          <!-- Lokasyon Bazlı Masraf Raporu -->
          <div class="section-title">Lokasyon Bazlı Masraf Dağılımı</div>
          ${lokasyonMasrafListesi.length > 0 ? `
            <table>
              <thead>
                <tr>
                  <th>Lokasyon</th>
                  <th style="text-align: right;">Toplam Harcama</th>
                </tr>
              </thead>
              <tbody>
                ${lokasyonMasrafListesi.map(l => `
                  <tr>
                    <td><strong>${l.lokasyon}</strong></td>
                    <td style="text-align: right; font-weight: 600; color: #b23b0e;">${l.tutar.toLocaleString('tr-TR')} TL</td>
                  </tr>
                `).join('')}
                <tr style="background-color: #f7f9f8; font-weight: 700;">
                  <td style="text-align: left;">Genel Toplam Masraf:</td>
                  <td style="text-align: right; color: #b23b0e;">${toplamMasraf.toLocaleString('tr-TR')} TL</td>
                </tr>
              </tbody>
            </table>
          ` : `<div class="empty-state">Geçen ay saha masraf kaydı bulunmuyor.</div>`}

          <!-- Araç Filosu Kullanımı ve Maliyet -->
          <div class="section-title">Araç Filosu ve Tahmini Maliyet</div>
          <div style="font-size:12px; color:#5b6560; margin-bottom: 10px; font-style: italic;">
            Tahmini araç maliyeti KM başına 5 TL (yakıt, bakım, aşınma) olarak hesaplanmaktadır.
          </div>
          ${aracListesi.length > 0 ? `
            <table>
              <thead>
                <tr>
                  <th>Plaka</th>
                  <th>Sefer</th>
                  <th>Yapılan KM</th>
                  <th style="text-align: right;">Tahmini Maliyet</th>
                </tr>
              </thead>
              <tbody>
                ${aracListesi.map(a => `
                  <tr>
                    <td><strong>${a.plaka}</strong></td>
                    <td>${a.sefer} Sefer</td>
                    <td>${a.km.toLocaleString('tr-TR')} km</td>
                    <td style="text-align: right; font-weight: 600;">${a.maliyet.toLocaleString('tr-TR')} TL</td>
                  </tr>
                `).join('')}
                <tr style="background-color: #f7f9f8; font-weight: 700;">
                  <td colSpan="2" style="text-align: left;">Toplam Filo KM:</td>
                  <td>${toplamKm.toLocaleString('tr-TR')} km</td>
                  <td style="text-align: right; color:#1b3846;">${tahminiToplamAracMaliyeti.toLocaleString('tr-TR')} TL</td>
                </tr>
              </tbody>
            </table>
          ` : `<div class="empty-state">Geçen ay herhangi bir araç kullanımı yapılmadı.</div>`}

        </div>

        <!-- Footer -->
        <div class="footer">
          Bu e-posta Saha Takip Sistemi tarafından otomatik olarak üretilmiştir.<br>
          Rapor ayarlarını değiştirmek için <a href="#">Patron Paneli > Ayarlar</a> sekmesini kullanabilirsiniz.
        </div>
      </div>
    </div>
  </body>
  </html>
  `;
}
