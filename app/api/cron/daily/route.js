import { supabase } from '@/lib/supabase';

export async function GET(request) {
  return handleDailyReport(request);
}

export async function POST(request) {
  return handleDailyReport(request);
}

async function handleDailyReport(request) {
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

    if (!s.gunluk_rapor_aktif) {
      return Response.json({ basari: true, mesaj: 'Günlük rapor gönderme ayarı kapalı.' });
    }

    if (!s.rapor_eposta || !s.rapor_eposta.trim()) {
      return Response.json({ basari: false, mesaj: 'Rapor gönderilecek e-posta adresi ayarlanmamış.' });
    }

    const aliciEposta = s.rapor_eposta.trim();

    // 3. Zaman Aralığını Belirle (Bugün 00:00:00 - 23:59:59)
    const simdi = new Date();
    // Türkiye saat dilimi (UTC+3) veya yerel saat dilimine göre bugünü belirleyelim.
    // UTC üzerinden tarih filtrelemesi için bugünün başlangıç ve bitişini oluşturuyoruz.
    const startOfToday = new Date(simdi.getFullYear(), simdi.getMonth(), simdi.getDate(), 0, 0, 0, 0).toISOString();
    const endOfToday = new Date(simdi.getFullYear(), simdi.getMonth(), simdi.getDate(), 23, 59, 59, 999).toISOString();

    // 4. Verileri Supabase'den Çek
    // A. Giriş-Çıkış Kayıtları
    const { data: girisCikis } = await supabase
      .from('giris_cikis')
      .select('*')
      .gte('giris_saati', startOfToday)
      .lte('giris_saati', endOfToday);

    // B. Bugün Tamamlanan Görevler
    const { data: tamamlananGorevler } = await supabase
      .from('gorevler')
      .select('*')
      .eq('durum', 'Tamamlandı')
      .gte('tamamlanma_tarihi', startOfToday)
      .lte('tamamlanma_tarihi', endOfToday);

    // C. Devam Eden Görevler
    const { data: devamEdenGorevler } = await supabase
      .from('gorevler')
      .select('*')
      .eq('durum', 'Devam Ediyor');

    // D. Araç Kullanımları
    const { data: aracKullanim } = await supabase
      .from('arac_kullanim')
      .select('*')
      .gte('tarih', startOfToday)
      .lte('tarih', endOfToday);

    // E. Bugün Girilen Saha Masrafları
    const { data: sahaVerileri } = await supabase
      .from('saha_verileri')
      .select('*')
      .gte('tarih', startOfToday)
      .lte('tarih', endOfToday);

    // 5. İstatistikleri Hesapla
    const aktifPersonelSayisi = new Set((girisCikis || []).map(g => g.personel_no)).size;
    const toplamMasraf = (sahaVerileri || []).reduce((sum, v) => sum + (Number(v.toplam) || 0), 0);
    const toplamKatedilenKm = (aracKullanim || []).reduce((sum, a) => sum + (Number(a.katedilen_km) || 0), 0);

    const tarihFormatli = simdi.toLocaleDateString('tr-TR', { day: '2-digit', month: 'long', year: 'numeric', weekday: 'long' });

    // 6. HTML E-posta Taslağını Oluştur
    const htmlContent = generateDailyReportHtml({
      tarih: tarihFormatli,
      aktifPersonelSayisi,
      toplamMasraf,
      toplamKatedilenKm,
      girisCikis: girisCikis || [],
      tamamlananGorevler: tamamlananGorevler || [],
      devamEdenGorevler: devamEdenGorevler || [],
      aracKullanim: aracKullanim || [],
      sahaVerileri: sahaVerileri || []
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
          subject: `Günlük Saha Takip Özeti — ${simdi.toLocaleDateString('tr-TR')}`,
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
          tarih: tarihFormatli,
          aktifPersonelSayisi,
          toplamMasraf,
          toplamKatedilenKm,
          girisCikisSayisi: (girisCikis || []).length,
          tamamlananGorevSayisi: (tamamlananGorevler || []).length,
          devamEdenGorevSayisi: (devamEdenGorevler || []).length,
          aracKullanimSayisi: (aracKullanim || []).length,
          masrafKalemSayisi: (sahaVerileri || []).length
        },
        icerik: htmlContent
      });
    }
  } catch (err) {
    return Response.json({ basari: false, mesaj: 'Sunucu hatası: ' + err.message }, { status: 500 });
  }
}

// Ondalık saati (örn. 0.03) "1 dk" veya "1 sa 48 dk" metnine çevirir.
function sureFormatla(saatOndalik) {
  const toplamDakika = Math.round((Number(saatOndalik) || 0) * 60);
  const saat = Math.floor(toplamDakika / 60);
  const dakika = toplamDakika % 60;
  if (saat === 0) return dakika + ' dk';
  if (dakika === 0) return saat + ' sa';
  return saat + ' sa ' + dakika + ' dk';
}

function generateDailyReportHtml({
  tarih,
  aktifPersonelSayisi,
  toplamMasraf,
  toplamKatedilenKm,
  girisCikis,
  tamamlananGorevler,
  devamEdenGorevler,
  aracKullanim,
  sahaVerileri
}) {
  return `
  <!DOCTYPE html>
  <html>
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Günlük Özet Raporu</title>
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
        background: linear-gradient(135deg, #1b3846 0%, #2b4c5c 100%);
        color: #ffffff;
        padding: 30px 24px;
        text-align: center;
      }
      .header h1 {
        margin: 0;
        font-size: 22px;
        font-weight: 700;
        letter-spacing: -0.5px;
      }
      .header p {
        margin: 6px 0 0 0;
        font-size: 14px;
        opacity: 0.9;
      }
      .content {
        padding: 24px;
      }
      .stats-grid {
        display: table;
        width: 100%;
        margin-bottom: 24px;
        border-collapse: separate;
        border-spacing: 10px 0;
      }
      .stat-card {
        display: table-cell;
        width: 33.33%;
        background-color: #f0f3f1;
        border-radius: 8px;
        padding: 16px;
        text-align: center;
        vertical-align: top;
      }
      .stat-label {
        font-size: 11px;
        color: #5b6560;
        text-transform: uppercase;
        font-weight: 600;
        letter-spacing: 0.5px;
        margin-bottom: 6px;
      }
      .stat-value {
        font-size: 18px;
        font-weight: 700;
        color: #1b3846;
      }
      .section-title {
        font-size: 15px;
        font-weight: 700;
        color: #1b3846;
        border-bottom: 2px solid #e1e5e2;
        padding-bottom: 8px;
        margin-top: 24px;
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
        color: #2b302d;
      }
      tr:last-child td {
        border-bottom: none;
      }
      .tag {
        display: inline-block;
        font-size: 11px;
        font-weight: 700;
        padding: 2px 6px;
        border-radius: 4px;
        text-transform: uppercase;
      }
      .tag.open {
        background-color: #e4f3ea;
        color: #2f8f5b;
      }
      .tag.closed {
        background-color: #f0f2ee;
        color: #5b6560;
      }
      .tag.high {
        background-color: #fbe9e2;
        color: #b23b0e;
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
        color: #2b4c5c;
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
          <p>Günlük Saha Özet Raporu &bull; ${tarih}</p>
        </div>

        <!-- Content -->
        <div class="content">
          <!-- Stats Grid -->
          <div class="stats-grid">
            <div class="stat-card">
              <div class="stat-label">Aktif Personel</div>
              <div class="stat-value">${aktifPersonelSayisi} Kişi</div>
            </div>
            <div class="stat-card">
              <div class="stat-label">Toplam Masraf</div>
              <div class="stat-value">${toplamMasraf.toLocaleString('tr-TR')} TL</div>
            </div>
            <div class="stat-card">
              <div class="stat-label">Kat Edilen Yol</div>
              <div class="stat-value">${toplamKatedilenKm.toLocaleString('tr-TR')} km</div>
            </div>
          </div>

          <!-- Mesai Giriş-Çıkış Kayıtları -->
          <div class="section-title">Personel Mesai Kayıtları</div>
          ${girisCikis.length > 0 ? `
            <table>
              <thead>
                <tr>
                  <th>Ad Soyad</th>
                  <th>Giriş Saati</th>
                  <th>Çıkış Saati</th>
                  <th>Süre</th>
                </tr>
              </thead>
              <tbody>
                ${girisCikis.map(g => `
                  <tr>
                    <td><strong>${g.ad}</strong></td>
                    <td>${g.giris_saati ? new Date(g.giris_saati).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' }) : '—'}</td>
                    <td>${g.cikis_saati ? new Date(g.cikis_saati).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' }) : '—'}</td>
                    <td>${g.durum === 'Açık' ? '<span class="tag open">İçeride</span>' : sureFormatla(g.sure_saat)}</td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          ` : `<div class="empty-state">Bugün herhangi bir mesai girişi yapılmadı.</div>`}

          <!-- Görev Durumu -->
          <div class="section-title">Görevler</div>
          
          <div style="margin-bottom: 12px; font-weight: 600; font-size: 13px; color: #1b3846;">Bugün Tamamlanan Görevler:</div>
          ${tamamlananGorevler.length > 0 ? `
            <table style="margin-bottom: 14px;">
              <thead>
                <tr>
                  <th>Görev</th>
                  <th>Lokasyon</th>
                  <th>Atananlar</th>
                </tr>
              </thead>
              <tbody>
                ${tamamlananGorevler.map(t => `
                  <tr>
                    <td><strong>${t.baslik}</strong></td>
                    <td>${t.lokasyon}</td>
                    <td>${(t.atanan_adlar || []).join(', ')}</td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          ` : `<div class="empty-state" style="margin-bottom: 14px;">Bugün tamamlanan görev bulunmuyor.</div>`}

          <div style="margin-bottom: 12px; font-weight: 600; font-size: 13px; color: #1b3846;">Aktif Devam Eden Görevler:</div>
          ${devamEdenGorevler.length > 0 ? `
            <table>
              <thead>
                <tr>
                  <th>Görev</th>
                  <th>Lokasyon</th>
                  <th>Öncelik</th>
                </tr>
              </thead>
              <tbody>
                ${devamEdenGorevler.map(d => `
                  <tr>
                    <td><strong>${d.baslik}</strong></td>
                    <td>${d.lokasyon}</td>
                    <td><span class="tag ${d.oncelik === 'Acil' || d.oncelik === 'Yüksek' ? 'high' : 'closed'}">${d.oncelik}</span></td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          ` : `<div class="empty-state">Devam eden görev bulunmuyor.</div>`}

          <!-- Araç Kullanımları -->
          <div class="section-title">Araç Kullanımları</div>
          ${aracKullanim.length > 0 ? `
            <table>
              <thead>
                <tr>
                  <th>Personel</th>
                  <th>Plaka</th>
                  <th>Kat Edilen</th>
                  <th>Durum</th>
                </tr>
              </thead>
              <tbody>
                ${aracKullanim.map(a => `
                  <tr>
                    <td><strong>${a.ad}</strong></td>
                    <td>${a.plaka}</td>
                    <td>${a.katedilen_km ? a.katedilen_km + ' km' : '—'}</td>
                    <td><span class="tag ${a.durum === 'Açık' ? 'open' : 'closed'}">${a.durum === 'Açık' ? 'Teslim Edilmedi' : 'Teslim Edildi'}</span></td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          ` : `<div class="empty-state">Bugün araç kullanımı yapılmadı.</div>`}

          <!-- Saha Masrafları -->
          <div class="section-title">Günlük Saha Masrafları</div>
          ${sahaVerileri.length > 0 ? `
            <table>
              <thead>
                <tr>
                  <th>Kalem</th>
                  <th>Lokasyon</th>
                  <th>Personel</th>
                  <th>Tutar</th>
                </tr>
              </thead>
              <tbody>
                ${sahaVerileri.map(v => `
                  <tr>
                    <td><strong>${v.kalem_turu}</strong><br><span style="font-size: 11px; color:#5b6560;">${v.aciklama || ''}</span></td>
                    <td>${v.lokasyon}</td>
                    <td>${v.ad}</td>
                    <td><strong>${Number(v.toplam).toLocaleString('tr-TR')} TL</strong></td>
                  </tr>
                `).join('')}
                <tr style="background-color: #f7f9f8; font-weight: 700;">
                  <td colSpan="3" style="text-align: right; padding-right: 10px;">Toplam:</td>
                  <td>${toplamMasraf.toLocaleString('tr-TR')} TL</td>
                </tr>
              </tbody>
            </table>
          ` : `<div class="empty-state">Bugün herhangi bir saha masrafı girilmedi.</div>`}

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
