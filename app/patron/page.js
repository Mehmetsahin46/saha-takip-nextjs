'use client';

import { useEffect, useState, useCallback } from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, LineChart, Line } from 'recharts';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { getInitialTheme, temaUygula, temaDegistir } from '@/lib/theme';
import { konumAl } from '@/lib/geo';
import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';
import QRCode from 'qrcode';

const KM_BIRIM_MALIYET = 5; // PLN / km, tahmini yakıt + aşınma

function formatPLN(deger) {
  return new Intl.NumberFormat('pl-PL', { style: 'currency', currency: 'PLN' }).format(Number(deger) || 0);
}

function excelIndir(veriler, dosyaAdi) {
  const ws = XLSX.utils.json_to_sheet(veriler);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Veri');
  XLSX.writeFile(wb, dosyaAdi);
}

function teklifPdfIndir(teklif) {
  const doc = new jsPDF();
  doc.setFontSize(16);
  doc.text('Teklif', 14, 18);
  doc.setFontSize(11);
  doc.text('Lokasyon: ' + teklif.lokasyon, 14, 28);
  doc.text('Tarih: ' + new Date(teklif.tarih).toLocaleString('tr-TR'), 14, 34);
  doc.text('Toplam Maliyet: ' + formatPLN(teklif.toplam_maliyet), 14, 40);
  const satirlar = doc.splitTextToSize(teklif.teklif_metni, 180);
  doc.text(satirlar, 14, 50);
  doc.save('teklif-' + teklif.lokasyon.replace(/\s+/g, '-') + '.pdf');
}

// Ondalık saat değerini (örn. 0.03) "1 dk" veya "1 sa 48 dk" gibi okunabilir metne çevirir.
function sureFormatla(saatOndalik) {
  const toplamDakika = Math.round((Number(saatOndalik) || 0) * 60);
  const saat = Math.floor(toplamDakika / 60);
  const dakika = toplamDakika % 60;
  if (saat === 0) return dakika + ' dk';
  if (dakika === 0) return saat + ' sa';
  return saat + ' sa ' + dakika + ' dk';
}

export default function PatronPanel() {
  const router = useRouter();
  const [oturum, setOturum] = useState(null);
  const [tab, setTab] = useState('genel');
  const [tema, setTema] = useState('light');
  const [yeniRaporSayisi, setYeniRaporSayisi] = useState(0);
  const [bildirimKutusuAcik, setBildirimKutusuAcik] = useState(false);
  const [yeniRaporlar, setYeniRaporlar] = useState([]);

  useEffect(() => {
    const kayit = localStorage.getItem('aktifOturum');
    if (!kayit) { router.push('/'); return; }
    const parsed = JSON.parse(kayit);
    if (parsed.rol !== 'patron') { router.push('/'); return; }
    setOturum(parsed);
  }, [router]);

  useEffect(() => {
    const t = getInitialTheme();
    setTema(t);
    temaUygula(t);
  }, []);

  const defterBildirimYukle = useCallback(async () => {
    const { data } = await supabase.from('santiye_defterleri').select('*').eq('durum', 'Yeni').order('created_at', { ascending: false });
    setYeniRaporlar(data || []);
    setYeniRaporSayisi(data ? data.length : 0);
  }, []);

  useEffect(() => { defterBildirimYukle(); }, [defterBildirimYukle]);

  useEffect(() => {
    if (typeof Notification !== 'undefined' && Notification.permission === 'default') {
      Notification.requestPermission();
    }
    const kanal = supabase
      .channel('patron-santiye-defteri')
      .on('postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'santiye_defterleri' },
        (payload) => {
          defterBildirimYukle();
          if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
            new Notification('📋 Yeni Şantiye Defteri Raporu!', {
              body: (payload.new.formen_adi || 'Formen') + ' — ' + payload.new.lokasyon,
              icon: '/favicon.ico',
            });
          }
        }
      )
      .subscribe();
    return () => { supabase.removeChannel(kanal); };
  }, [defterBildirimYukle]);

  function cikisYapOturum() {
    localStorage.removeItem('aktifOturum');
    router.push('/');
  }

  if (!oturum) return null;

  return (
    <div>
      <div className="app-header">
        <span className="brand">Saha Takip</span>
        <span className="who">Yönetim Paneli — <b>Patron</b></span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, position: 'relative' }}>
          <button
            onClick={() => setBildirimKutusuAcik(!bildirimKutusuAcik)}
            style={{ position: 'relative', border: '1px solid var(--border)', background: 'var(--card)', color: 'var(--ink)', borderRadius: 9, padding: '7px 10px', cursor: 'pointer', fontSize: 15 }}
          >
            🔔
            {yeniRaporSayisi > 0 && (
              <span style={{ position: 'absolute', top: -4, right: -4, background: '#D32F2F', color: '#fff', borderRadius: 10, padding: '2px 6px', fontSize: 11, fontWeight: 'bold', lineHeight: 1 }}>
                {yeniRaporSayisi}
              </span>
            )}
          </button>
          {bildirimKutusuAcik && (
            <div style={{ position: 'absolute', top: '110%', right: 0, width: 300, maxHeight: 360, overflowY: 'auto', background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 10, boxShadow: '0 8px 24px rgba(0,0,0,0.2)', zIndex: 50, padding: 10 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                <b style={{ fontSize: 13 }}>Yeni Şantiye Defteri Raporları</b>
                <span style={{ cursor: 'pointer', color: 'var(--ink-soft)' }} onClick={() => setBildirimKutusuAcik(false)}>✕</span>
              </div>
              {yeniRaporlar.length === 0 ? (
                <div style={{ fontSize: 12, color: 'var(--ink-soft)' }}>Yeni rapor yok.</div>
              ) : (
                yeniRaporlar.map((r) => (
                  <div
                    key={r.id}
                    onClick={() => { setTab('defter'); setBildirimKutusuAcik(false); }}
                    style={{ padding: '8px 6px', borderBottom: '1px solid var(--border)', cursor: 'pointer', fontSize: 12 }}
                  >
                    <b>{r.formen_adi}</b> — {r.lokasyon}
                    <div style={{ color: 'var(--ink-soft)', fontSize: 11 }}>{new Date(r.created_at).toLocaleString('tr-TR')}</div>
                  </div>
                ))
              )}
            </div>
          )}
          <button className="theme-toggle" onClick={() => setTema(temaDegistir(tema))}>{tema === 'dark' ? '☀️' : '🌙'}</button>
          <button className="logout" onClick={cikisYapOturum}>Çıkış</button>
        </div>
      </div>
      <div className="tabbar">
        <button className={tab === 'genel' ? 'active-patron' : ''} onClick={() => setTab('genel')}>Genel Bakış</button>
        <button className={tab === 'lokasyonlar' ? 'active-patron' : ''} onClick={() => setTab('lokasyonlar')}>Lokasyonlar</button>
        <button className={tab === 'araclar' ? 'active-patron' : ''} onClick={() => setTab('araclar')}>Araç Filosu</button>
        <button className={tab === 'gorevler' ? 'active-patron' : ''} onClick={() => setTab('gorevler')}>Görevler</button>
        <button className={tab === 'defter' ? 'active-patron' : ''} onClick={() => setTab('defter')}>
          📋 Şantiye Defteri{yeniRaporSayisi > 0 ? ' (' + yeniRaporSayisi + ')' : ''}
        </button>
        <button className={tab === 'projeler' ? 'active-patron' : ''} onClick={() => setTab('projeler')}>Projeler</button>
        <button className={tab === 'teklifler' ? 'active-patron' : ''} onClick={() => setTab('teklifler')}>Teklifler</button>
        <button className={tab === 'ayarlar' ? 'active-patron' : ''} onClick={() => setTab('ayarlar')}>Ayarlar</button>
      </div>
      <div className="content">
        {tab === 'genel' && <GenelBakis />}
        {tab === 'lokasyonlar' && <Lokasyonlar />}
        {tab === 'araclar' && <Araclar />}
        {tab === 'gorevler' && <GorevlerTab />}
        {tab === 'defter' && <SantiyeDefteriTab onDurumDegisti={defterBildirimYukle} />}
        {tab === 'projeler' && <ProjelerTab />}
        {tab === 'teklifler' && <Teklifler />}
        {tab === 'ayarlar' && <Ayarlar />}
      </div>
    </div>
  );
}

/* ---------------- GENEL BAKIŞ ---------------- */
function GenelBakis() {
  const [toplamMaliyet, setToplamMaliyet] = useState(0);
  const [icerdekiler, setIcerdekiler] = useState(0);
  const [toplamKm, setToplamKm] = useState(0);
  const [lokasyonOzet, setLokasyonOzet] = useState([]);
  const [saatGun, setSaatGun] = useState(0);
  const [saatHafta, setSaatHafta] = useState(0);
  const [saatAy, setSaatAy] = useState(0);
  const [personelAySaat, setPersonelAySaat] = useState([]);
  const [muayeneUyarilari, setMuayeneUyarilari] = useState([]);

  useEffect(() => {
    (async () => {
      const { data: veriler } = await supabase.from('saha_verileri').select('lokasyon, toplam');
      const { count: acikSayisi } = await supabase.from('giris_cikis').select('*', { count: 'exact', head: true }).eq('durum', 'Açık');
      const { data: araclar } = await supabase.from('arac_kullanim').select('katedilen_km');
      const { data: mesailer } = await supabase.from('giris_cikis').select('*').eq('durum', 'Kapalı');
      const { data: tumAraclar } = await supabase.from('araclar').select('plaka, marka, model, sonraki_muayene_tarihi');

      const bugun = new Date(); bugun.setHours(0, 0, 0, 0);
      const uyarilar = (tumAraclar || [])
        .filter((a) => a.sonraki_muayene_tarihi)
        .map((a) => {
          const gunKalan = Math.round((new Date(a.sonraki_muayene_tarihi) - bugun) / 86400000);
          return { ...a, gunKalan };
        })
        .filter((a) => a.gunKalan <= 10)
        .sort((x, y) => x.gunKalan - y.gunKalan);
      setMuayeneUyarilari(uyarilar);

      const tm = (veriler || []).reduce((a, v) => a + Number(v.toplam), 0);
      setToplamMaliyet(tm);
      setIcerdekiler(acikSayisi || 0);
      setToplamKm((araclar || []).reduce((a, v) => a + (Number(v.katedilen_km) || 0), 0));

      const grup = {};
      (veriler || []).forEach((v) => {
        if (!grup[v.lokasyon]) grup[v.lokasyon] = { adet: 0, toplam: 0 };
        grup[v.lokasyon].adet += 1;
        grup[v.lokasyon].toplam += Number(v.toplam);
      });
      setLokasyonOzet(Object.entries(grup).map(([lokasyon, v]) => ({ lokasyon, ...v })));

      const now = new Date();
      const bugunBaslangic = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      const haftaBaslangic = new Date(now);
      haftaBaslangic.setDate(now.getDate() - 7);
      const ayBaslangic = new Date(now.getFullYear(), now.getMonth(), 1);

      let g = 0, h = 0, a = 0;
      const kisiAy = {};
      (mesailer || []).forEach((m) => {
        const tarih = new Date(m.giris_saati);
        const sure = Number(m.sure_saat) || 0;
        if (tarih >= bugunBaslangic) g += sure;
        if (tarih >= haftaBaslangic) h += sure;
        if (tarih >= ayBaslangic) {
          a += sure;
          kisiAy[m.ad] = (kisiAy[m.ad] || 0) + sure;
        }
      });
      setSaatGun(Math.round(g * 100) / 100);
      setSaatHafta(Math.round(h * 100) / 100);
      setSaatAy(Math.round(a * 100) / 100);
      setPersonelAySaat(Object.entries(kisiAy).map(([ad, saat]) => ({ ad, saat: Math.round(saat * 100) / 100 })).sort((x, y) => y.saat - x.saat));
    })();
  }, []);

  // EXCEL AKTARMA FONKSİYONU
  const genelOzetExcelIndir = () => {
    if (typeof excelIndir !== 'function') {
      alert("excelIndir fonksiyonu bu dosyada tanımlı değil!");
      return;
    }
    const veriler = [
      { Kategori: 'Genel', Kalem: 'Toplam Maliyet', Deger: formatPLN(toplamMaliyet) },
      { Kategori: 'Genel', Kalem: 'Şu An İçerideki Personel', Deger: icerdekiler + ' Kişi' },
      { Kategori: 'Genel', Kalem: 'Toplam Kat Edilen KM', Deger: toplamKm.toLocaleString('tr-TR') + ' KM' },
      { Kategori: 'Çalışma', Kalem: 'Bugün Toplam Saat', Deger: sureFormatla(saatGun) },
      { Kategori: 'Çalışma', Kalem: 'Bu Hafta Toplam Saat', Deger: sureFormatla(saatHafta) },
      { Kategori: 'Çalışma', Kalem: 'Bu Ay Toplam Saat', Deger: sureFormatla(saatAy) },
      ...lokasyonOzet.map(l => ({ Kategori: 'Lokasyon Maliyeti', Kalem: l.lokasyon, Deger: formatPLN(l.toplam) + ' (' + l.adet + ' kalem)' })),
      ...personelAySaat.map(p => ({ Kategori: 'Personel Mesai (Bu Ay)', Kalem: p.ad, Deger: sureFormatla(p.saat) }))
    ];
    excelIndir(veriler, 'genel-bakis-ozeti.xlsx');
  };

  // PDF AKTARMA FONKSİYONU
  const genelOzetPdfIndir = () => {
    const raporIcerik = `
      <html>
      <head>
        <title>Saha Takip - Genel Bakış Raporu</title>
        <style>
          body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; padding: 30px; color: #333; line-height: 1.5; }
          .header { text-align: center; border-bottom: 2px solid #2B5876; padding-bottom: 15px; margin-bottom: 25px; }
          .header h1 { margin: 0; font-size: 24px; color: #2B5876; }
          .header p { margin: 5px 0 0 0; color: #666; font-size: 13px; }
          table { width: 100%; border-collapse: collapse; margin-top: 15px; margin-bottom: 30px; }
          th, td { border: 1px solid #e0e0e0; padding: 10px 12px; text-align: left; font-size: 13px; }
          th { background-color: #f7f9fa; color: #2B5876; font-weight: bold; }
          tr:nth-child(even) { background-color: #fafbfc; }
          .section-title { font-size: 16px; font-weight: bold; color: #2B5876; margin-top: 20px; border-left: 4px solid #2B5876; padding-left: 8px; }
          .footer { text-align: center; margin-top: 50px; font-size: 11px; color: #999; border-top: 1px solid #eee; padding-top: 10px; }
        </style>
      </head>
      <body>
        <div class="header">
          <h1>📊 SAHA TAKİP SİSTEMİ</h1>
          <p>Genel Bakış Yönetici Raporu &nbsp;|&nbsp; Tarih: ${new Date().toLocaleDateString('tr-TR')} ${new Date().toLocaleTimeString('tr-TR')}</p>
        </div>

        <div class="section-title">Genel Durum Özetleri</div>
        <table>
          <thead><tr><th>Metrik / Kalem</th><th>Mevcut Değer</th></tr></thead>
          <tbody>
            <tr><td>Toplam Birikmiş Maliyet</td><td><strong>${formatPLN(toplamMaliyet)}</strong></td></tr>
            <tr><td>Şu An Sahada Aktif Olan Personel</td><td>${icerdekiler} Kişi</td></tr>
            <tr><td>Araçlar Tarafından Kat Edilen Toplam Mesafe</td><td>${toplamKm.toLocaleString('tr-TR')} KM</td></tr>
          </tbody>
        </table>

        <div class="section-title">Çalışma Süre Özetleri (Tüm Personel Toplamı)</div>
        <table>
          <thead><tr><th>Dönem</th><th>Toplam Çalışma Süresi</th></tr></thead>
          <tbody>
            <tr><td>Bugün</td><td>${sureFormatla(saatGun)}</td></tr>
            <tr><td>Bu Hafta</td><td>${sureFormatla(saatHafta)}</td></tr>
            <tr><td>Bu Ay</td><td>${sureFormatla(saatAy)}</td></tr>
          </tbody>
        </table>

        <div class="section-title">Lokasyon Bazlı Maliyet Dağılımı</div>
        <table>
          <thead><tr><th>Lokasyon Adı</th><th>Giriş Yapılan Kalem Sayısı</th><th>Toplam Maliyet</th></tr></thead>
          <tbody>
            ${lokasyonOzet.map(l => `<tr><td>${l.lokasyon}</td><td>${l.adet} adet veri</td><td>${formatPLN(l.toplam)}</td></tr>`).join('')}
            ${lokasyonOzet.length === 0 ? '<tr><td colspan="3">Kayıtlı maliyet verisi bulunmuyor.</td></tr>' : ''}
          </tbody>
        </table>

        <div class="section-title">Personel Bazlı Aylık Toplam Mesai Listesi</div>
        <table>
          <thead><tr><th>Personel Ad Soyad</th><th>Bu Ayki Toplam Çalışma Süresi</th></tr></thead>
          <tbody>
            ${personelAySaat.map(p => `<tr><td>${p.ad}</td><td>${sureFormatla(p.saat)}</td></tr>`).join('')}
            ${personelAySaat.length === 0 ? '<tr><td colspan="2">Bu ay tamamlanmış mesai kaydı bulunmuyor.</td></tr>' : ''}
          </tbody>
        </table>

        <div class="footer">Bu rapor Saha Takip sistemi yönetim paneli üzerinden otomatik olarak üretilmiştir.</div>
      </body>
      </html>
    `;
    const pencere = window.open('', '_blank');
    pencere.document.write(raporIcerik);
    pencere.document.close();
    pencere.print();
  };

  return (
    <>
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginBottom: 12 }}>
        <button className="action btn-secondary" style={{ width: 'auto', padding: '8px 16px', fontSize: 13 }} onClick={genelOzetExcelIndir}>
          📊 Excel'e Aktar
        </button>
        <button className="action btn-secondary" style={{ width: 'auto', padding: '8px 16px', fontSize: 13, backgroundColor: '#A83232', color: '#fff', borderColor: '#A83232' }} onClick={genelOzetPdfIndir}>
          📄 PDF Raporu Al
        </button>
      </div>

      {muayeneUyarilari.length > 0 && (
        <div style={{ display: 'grid', gap: 8, marginBottom: 16 }}>
          {muayeneUyarilari.map((a) => {
            const gecti = a.gunKalan < 0;
            return (
              <div
                key={a.plaka}
                style={{
                  padding: '10px 14px', borderRadius: 9, fontSize: 13, fontWeight: 600,
                  background: gecti ? 'rgba(220, 38, 38, 0.14)' : 'rgba(245, 158, 11, 0.14)',
                  color: gecti ? '#ef4444' : '#f59e0b',
                  border: '1px solid ' + (gecti ? 'rgba(220, 38, 38, 0.3)' : 'rgba(245, 158, 11, 0.3)'),
                }}
              >
                🔧 {[a.marka, a.model].filter(Boolean).join(' ')} ({a.plaka}) — muayene (przegląd){' '}
                {gecti ? (Math.abs(a.gunKalan) + ' gün önce süresi geçti!') : (a.gunKalan + ' gün sonra doluyor')}
              </div>
            );
          })}
        </div>
      )}

      <div className="grid cols-3">
        <div className="stat-card"><div className="label">Toplam maliyet</div><div className="value">{formatPLN(toplamMaliyet)}</div></div>
        <div className="stat-card"><div className="label">Şu an içeride</div><div className="value">{icerdekiler} kişi</div></div>
        <div className="stat-card"><div className="label">Toplam kat edilen km</div><div className="value">{toplamKm.toLocaleString('tr-TR')} km</div></div>
      </div>

      <div className="card" style={{ marginTop: 16 }}>
        <h2 className="section">Çalışma Saatleri (tüm personel toplamı)</h2>
        <div className="grid cols-3" style={{ marginTop: 10 }}>
          <div className="stat-card"><div className="label">Bugün</div><div className="value">{sureFormatla(saatGun)}</div></div>
          <div className="stat-card"><div className="label">Bu hafta</div><div className="value">{sureFormatla(saatHafta)}</div></div>
          <div className="stat-card"><div className="label">Bu ay</div><div className="value">{sureFormatla(saatAy)}</div></div>
        </div>
        <div style={{ fontSize: 12, color: 'var(--ink-soft)', marginTop: 10 }}>Süreler, her mesaideki 1 saatlik mola düşülerek hesaplanmıştır.</div>
        <table style={{ marginTop: 8 }}>
          <thead><tr><th>Personel</th><th>Bu ay toplam</th></tr></thead>
          <tbody>
            {personelAySaat.map((p) => (
              <tr key={p.ad}><td>{p.ad}</td><td>{sureFormatla(p.saat)}</td></tr>
            ))}
            {personelAySaat.length === 0 && <tr><td colSpan={2}>Bu ay tamamlanmış mesai kaydı yok.</td></tr>}
          </tbody>
        </table>
      </div>

      <div className="card" style={{ marginTop: 16 }}>
        <h2 className="section">Lokasyon bazlı maliyet</h2>
        {lokasyonOzet.length > 0 && (
          <div style={{ width: '100%', height: 220, marginTop: 12 }}>
            <ResponsiveContainer>
              <BarChart data={lokasyonOzet}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                <XAxis dataKey="lokasyon" tick={{ fontSize: 11, fill: 'var(--ink-soft)' }} />
                <YAxis tick={{ fontSize: 11, fill: 'var(--ink-soft)' }} />
                <Tooltip formatter={(v) => formatPLN(v)} contentStyle={{ background: 'var(--card)', border: '1px solid var(--border)', fontSize: 12 }} />
                <Bar dataKey="toplam" fill="var(--accent-patron)" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
        <table>
          <thead><tr><th>Lokasyon</th><th>Kalem</th><th>Toplam</th></tr></thead>
          <tbody>
            {lokasyonOzet.map((l) => (
              <tr key={l.lokasyon}><td>{l.lokasyon}</td><td>{l.adet}</td><td>{formatPLN(l.toplam)}</td></tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

/* ---------------- LOKASYONLAR + AI TEKLİF ---------------- */
function Lokasyonlar() {
  const [lokasyonlar, setLokasyonlar] = useState([]);
  const [secili, setSecili] = useState('');
  const [kalemler, setKalemler] = useState([]);
  const [teklifMetni, setTeklifMetni] = useState('');
  const [yukleniyor, setYukleniyor] = useState(false);
  const [hata, setHata] = useState('');

  useEffect(() => {
    supabase.from('lokasyonlar').select('*').then(({ data }) => {
      setLokasyonlar(data || []);
      if (data && data.length) setSecili(data[0].ad);
    });
  }, []);

  useEffect(() => {
    if (!secili) return;
    setTeklifMetni('');
    supabase.from('saha_verileri').select('*').eq('lokasyon', secili).then(({ data }) => setKalemler(data || []));
  }, [secili]);

  const toplam = kalemler.reduce((a, k) => a + Number(k.toplam), 0);

  async function teklifOlustur() {
    setHata(''); setYukleniyor(true);
    const res = await fetch('/api/teklif', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ lokasyon: secili, toplamMaliyet: toplam, kalemler }),
    });
    const data = await res.json();
    setYukleniyor(false);
    if (!data.basari) { setHata(data.mesaj); return; }
    setTeklifMetni(data.teklifMetni);
    await supabase.from('teklifler').insert({ lokasyon: secili, toplam_maliyet: toplam, teklif_metni: data.teklifMetni, durum: 'Onay Bekliyor' });
  }

  return (
    <div className="card">
      <label>Lokasyon seç</label>
      <select value={secili} onChange={(e) => setSecili(e.target.value)}>
        {lokasyonlar.map((l) => <option key={l.ad} value={l.ad}>{l.ad}</option>)}
      </select>
      <div className="summary-total">{formatPLN(toplam)}</div>
      <div className="summary-sub">{kalemler.length} kalem girildi</div>
      <button
        className="action btn-secondary"
        style={{ marginTop: 10 }}
        disabled={!kalemler.length}
        onClick={() => excelIndir(
          kalemler.map((k) => ({ Kalem: k.kalem_turu, Personel: k.ad, Miktar: k.miktar, 'Birim Fiyat': k.birim_fiyat, Toplam: k.toplam, Açıklama: k.aciklama || '' })),
          secili.replace(/\s+/g, '-') + '-maliyet.xlsx'
        )}
      >
        📊 Excel'e Aktar
      </button>
      <table>
        <thead><tr><th>Kalem</th><th>Miktar</th><th>Birim</th><th>Toplam</th></tr></thead>
        <tbody>
          {kalemler.map((k) => (
            <tr key={k.id}><td>{k.kalem_turu}</td><td>{k.miktar}</td><td>{formatPLN(k.birim_fiyat)}</td><td>{formatPLN(k.toplam)}</td></tr>
          ))}
        </tbody>
      </table>
      <button className="action btn-ai" onClick={teklifOlustur} disabled={yukleniyor || !kalemler.length}>
        {yukleniyor ? 'Teklif hazırlanıyor...' : 'AI Teklif Oluştur'}
      </button>
      {hata && <div className="feedback err">{hata}</div>}
      {teklifMetni && <div className="quote-box">{teklifMetni}</div>}
    </div>
  );
}

/* ---------------- ARAÇLAR ---------------- */
function Araclar() {
  const [araclar, setAraclar] = useState([]);
  const [kayitlar, setKayitlar] = useState([]);
  const [seciliPlaka, setSeciliPlaka] = useState(null);
  const [baslangicTarih, setBaslangicTarih] = useState('');
  const [bitisTarih, setBitisTarih] = useState('');
  const [personelArama, setPersonelArama] = useState('');
  const [editInspectionPlaka, setEditInspectionPlaka] = useState(null);
  const [sonMuayeneVal, setSonMuayeneVal] = useState('');
  const [sonrakiMuayeneVal, setSonrakiMuayeneVal] = useState('');

  function araclariYukle() {
    supabase.from('araclar').select('*').then(({ data }) => setAraclar(data || []));
  }

  useEffect(() => {
    araclariYukle();
    supabase.from('arac_kullanim').select('*').order('tarih', { ascending: false }).then(({ data }) => setKayitlar(data || []));
  }, []);

  function muayeneDurumu(a) {
    if (!a.sonraki_muayene_tarihi) return null;
    const bugun = new Date(); bugun.setHours(0, 0, 0, 0);
    const hedef = new Date(a.sonraki_muayene_tarihi);
    const gunKalan = Math.round((hedef - bugun) / 86400000);
    if (gunKalan < 0) return { seviye: 'gecti', gunKalan, metin: (Math.abs(gunKalan)) + ' gün önce süresi geçti!' };
    if (gunKalan <= 10) return { seviye: 'yakin', gunKalan, metin: gunKalan + ' gün kaldı' };
    return { seviye: 'normal', gunKalan, metin: gunKalan + ' gün kaldı' };
  }

  async function muayeneKaydet(plaka) {
    if (!sonrakiMuayeneVal) { alert('Lütfen bir sonraki muayene tarihini girin.'); return; }
    await supabase.from('araclar').update({
      son_muayene_tarihi: sonMuayeneVal || null,
      sonraki_muayene_tarihi: sonrakiMuayeneVal,
    }).eq('plaka', plaka);
    setEditInspectionPlaka(null);
    setSonMuayeneVal(''); setSonrakiMuayeneVal('');
    araclariYukle();
  }

  let gosterilenKayitlar = seciliPlaka ? kayitlar.filter((k) => k.plaka === seciliPlaka) : kayitlar;
  if (baslangicTarih) gosterilenKayitlar = gosterilenKayitlar.filter((k) => new Date(k.tarih) >= new Date(baslangicTarih));
  if (bitisTarih) gosterilenKayitlar = gosterilenKayitlar.filter((k) => new Date(k.tarih) <= new Date(bitisTarih + 'T23:59:59'));
  if (personelArama.trim()) gosterilenKayitlar = gosterilenKayitlar.filter((k) => k.ad.toLocaleLowerCase('tr-TR').includes(personelArama.trim().toLocaleLowerCase('tr-TR')));

  const toplamKm = gosterilenKayitlar.reduce((a, k) => a + (Number(k.katedilen_km) || 0), 0);

  function sureMetni(baslangic, bitis) {
    if (!baslangic || !bitis) return '—';
    const dakika = Math.round((new Date(bitis) - new Date(baslangic)) / 60000);
    if (dakika < 60) return dakika + ' dk';
    return Math.floor(dakika / 60) + ' sa ' + (dakika % 60) + ' dk';
  }

  function kartaTiklandi(e, plaka) {
    e.stopPropagation();
    setSeciliPlaka((mevcut) => (mevcut === plaka ? null : plaka));
  }

  return (
    <div onClick={() => setSeciliPlaka(null)}>
      <div className="card">
        <h2 className="section">Araç Filosu</h2>
        {seciliPlaka && (
          <div style={{ fontSize: 12, color: 'var(--ink-soft)', marginTop: 6 }}>
            <b style={{ color: 'var(--ink)' }}>{seciliPlaka}</b> filtreleniyor — seçimi kaldırmak için boş bir yere tıklayın.
          </div>
        )}
        <div className="grid cols-3" style={{ marginTop: 10 }}>
          {araclar.map((a) => {
            const secili = seciliPlaka === a.plaka;
            return (
              <div
                key={a.plaka}
                className="card"
                onClick={(e) => kartaTiklandi(e, a.plaka)}
                style={{
                  padding: 12, marginBottom: 0, cursor: 'pointer',
                  border: secili ? '2px solid var(--accent-patron)' : '1px solid var(--border)',
                  transition: 'border-color 0.15s',
                }}
              >
                <div style={{
                  width: '100%', height: 110, borderRadius: 8, background: 'rgba(127, 127, 127, 0.12)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', marginBottom: 10,
                }}>
                  {a.resim_url
                    ? <img src={a.resim_url} alt={a.plaka} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                    : <span style={{ fontSize: 32 }}>🚐</span>}
                </div>
                <div style={{ fontWeight: 700, fontSize: 14 }}>{[a.marka, a.model].filter(Boolean).join(' ') || 'Marka/model girilmedi'}</div>
                <div style={{ fontSize: 13, color: 'var(--ink-soft)', marginTop: 2 }}>{a.plaka}</div>
                <div style={{ marginTop: 8, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span className={'status-tag' + (a.durum === 'Boşta' ? ' open' : '')}>{a.durum}</span>
                  <span style={{ fontSize: 12, color: 'var(--ink-soft)' }}>{(a.son_km || 0).toLocaleString('tr-TR')} km</span>
                  {secili && <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--accent-patron)' }}>✓ Seçili</span>}
                </div>

                <div style={{ marginTop: 8, paddingTop: 8, borderTop: '1px solid var(--border)' }} onClick={(e) => e.stopPropagation()}>
                  {muayeneDurumu(a) ? (
                    <div style={{
                      fontSize: 12, fontWeight: 700,
                      color: muayeneDurumu(a).seviye === 'gecti' ? '#ef4444' : (muayeneDurumu(a).seviye === 'yakin' ? '#f59e0b' : 'var(--ink-soft)'),
                    }}>
                      🔧 Muayene (Przegląd): {muayeneDurumu(a).metin}
                    </div>
                  ) : (
                    <div style={{ fontSize: 12, color: 'var(--ink-soft)' }}>🔧 Muayene tarihi girilmedi</div>
                  )}

                  {editInspectionPlaka === a.plaka ? (
                    <div style={{ display: 'grid', gap: 6, marginTop: 8 }}>
                      <label style={{ margin: 0, fontSize: 11 }}>Son muayene tarihi</label>
                      <input type="date" value={sonMuayeneVal} onChange={(e) => setSonMuayeneVal(e.target.value)} style={{ padding: 6, fontSize: 12 }} />
                      <label style={{ margin: 0, fontSize: 11 }}>Bir sonraki muayene tarihi</label>
                      <input type="date" value={sonrakiMuayeneVal} onChange={(e) => setSonrakiMuayeneVal(e.target.value)} style={{ padding: 6, fontSize: 12 }} />
                      <div style={{ display: 'flex', gap: 6 }}>
                        <button className="action btn-secondary" style={{ width: 'auto', padding: '6px 10px', fontSize: 11, margin: 0 }} onClick={() => muayeneKaydet(a.plaka)}>Kaydet</button>
                        <button className="action btn-secondary" style={{ width: 'auto', padding: '6px 10px', fontSize: 11, margin: 0 }} onClick={() => setEditInspectionPlaka(null)}>İptal</button>
                      </div>
                    </div>
                  ) : (
                    <button
                      className="action btn-secondary"
                      style={{ width: 'auto', padding: '6px 10px', fontSize: 11, marginTop: 6 }}
                      onClick={() => {
                        setEditInspectionPlaka(a.plaka);
                        setSonMuayeneVal(a.son_muayene_tarihi || '');
                        setSonrakiMuayeneVal(a.sonraki_muayene_tarihi || '');
                      }}
                    >
                      📝 Muayene Tarihini Güncelle
                    </button>
                  )}
                </div>
              </div>
            );
          })}
          {araclar.length === 0 && <div style={{ color: 'var(--ink-soft)', fontSize: 13 }}>Henüz araç eklenmedi.</div>}
        </div>
      </div>

      <div className="card" onClick={(e) => e.stopPropagation()}>
        <div className="grid cols-2">
          <div className="stat-card"><div className="label">Toplam kat edilen km</div><div className="value">{toplamKm.toLocaleString('tr-TR')} km</div></div>
          <div className="stat-card"><div className="label">Tahmini araç maliyeti</div><div className="value">{formatPLN(toplamKm * KM_BIRIM_MALIYET)}</div></div>
        </div>
        <h2 className="section" style={{ marginTop: 18 }}>
          {seciliPlaka ? seciliPlaka + ' — kullanım geçmişi' : 'Araç kullanım geçmişi (tüm araçlar)'}
        </h2>
        <div className="grid cols-3" style={{ marginTop: 8 }}>
          <div>
            <label>Başlangıç tarihi</label>
            <input type="date" value={baslangicTarih} onChange={(e) => setBaslangicTarih(e.target.value)} />
          </div>
          <div>
            <label>Bitiş tarihi</label>
            <input type="date" value={bitisTarih} onChange={(e) => setBitisTarih(e.target.value)} />
          </div>
          <div>
            <label>Personel ara</label>
            <input placeholder="isim yazın" value={personelArama} onChange={(e) => setPersonelArama(e.target.value)} />
          </div>
        </div>
        <button
          className="action btn-secondary"
          disabled={!gosterilenKayitlar.length}
          onClick={() => excelIndir(
            gosterilenKayitlar.map((k) => ({
              Tarih: new Date(k.tarih).toLocaleDateString('tr-TR'), Personel: k.ad, Plaka: k.plaka,
              'Alış Saati': new Date(k.tarih).toLocaleTimeString('tr-TR'), 'Alış Km': k.alis_km,
              'Teslim Saati': k.teslim_saati ? new Date(k.teslim_saati).toLocaleTimeString('tr-TR') : '',
              'Teslim Km': k.teslim_km || '', 'Kat Edilen Km': k.katedilen_km || '', Durum: k.durum,
            })),
            'arac-kullanim-gecmisi.xlsx'
          )}
        >
          📊 Excel'e Aktar
        </button>
        <table>
          <thead>
            <tr>
              <th>Tarih</th><th>Personel</th><th>Plaka</th>
              <th>Alış saati</th><th>Alış km</th>
              <th>Teslim saati</th><th>Teslim km</th>
              <th>Süre</th><th>Kat edilen</th><th>Durum</th>
            </tr>
          </thead>
          <tbody>
            {gosterilenKayitlar.map((k) => (
              <tr key={k.id}>
                <td>{new Date(k.tarih).toLocaleDateString('tr-TR')}</td>
                <td>{k.ad}</td>
                <td>{k.plaka}</td>
                <td>{new Date(k.tarih).toLocaleTimeString('tr-TR')}</td>
                <td>{Number(k.alis_km).toLocaleString('tr-TR')}</td>
                <td>{k.teslim_saati ? new Date(k.teslim_saati).toLocaleTimeString('tr-TR') : '—'}</td>
                <td>{k.teslim_km ? Number(k.teslim_km).toLocaleString('tr-TR') : '—'}</td>
                <td>{sureMetni(k.tarih, k.teslim_saati)}</td>
                <td>{k.katedilen_km ? Number(k.katedilen_km).toLocaleString('tr-TR') + ' km' : '—'}</td>
                <td><span className={'status-tag' + (k.durum === 'Açık' ? ' open' : '')}>{k.durum}</span></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* ---------------- GÖREVLER ---------------- */
function GorevlerTab() {
  const [lokasyonlar, setLokasyonlar] = useState([]);
  const [personeller, setPersoneller] = useState([]);
  const [gorevler, setGorevler] = useState([]);
  const [durumFiltre, setDurumFiltre] = useState('Tümü');

  const [yLokasyon, setYLokasyon] = useState('');
  const [yBaslik, setYBaslik] = useState('');
  const [yAciklama, setYAciklama] = useState('');
  const [yOncelik, setYOncelik] = useState('Normal');
  const [ySonTarih, setYSonTarih] = useState('');
  const [ySeciliPersonel, setYSeciliPersonel] = useState([]);
  const [mesaj, setMesaj] = useState(null);
  const [ekleniyor, setEkleniyor] = useState(false);

  async function hepsiniYukle() {
    const { data: l } = await supabase.from('lokasyonlar').select('*');
    const { data: p } = await supabase.from('personel').select('*').neq('rol', 'patron');
    const { data: g } = await supabase.from('gorevler').select('*').order('olusturulma_tarihi', { ascending: false });
    setLokasyonlar(l || []);
    setPersoneller(p || []);
    setGorevler(g || []);
    if (l && l.length && !yLokasyon) setYLokasyon(l[0].ad);
  }

  useEffect(() => { hepsiniYukle(); }, []); // eslint-disable-line

  function personelSecimiDegistir(no) {
    setYSeciliPersonel((mevcut) => (mevcut.includes(no) ? mevcut.filter((x) => x !== no) : [...mevcut, no]));
  }

  async function gorevOlustur() {
    setMesaj(null);
    if (!yBaslik.trim() || !yLokasyon) { setMesaj({ tip: 'err', metin: 'Başlık ve lokasyon gerekli.' }); return; }
    if (!ySeciliPersonel.length) { setMesaj({ tip: 'err', metin: 'En az bir personel seçin.' }); return; }
    setEkleniyor(true);
    const adlar = ySeciliPersonel.map((no) => personeller.find((p) => p.personel_no === no)?.ad || no);
    const { error } = await supabase.from('gorevler').insert({
      lokasyon: yLokasyon, baslik: yBaslik.trim(), aciklama: yAciklama.trim() || null,
      oncelik: yOncelik, son_tarih: ySonTarih || null,
      atanan_personel_no: ySeciliPersonel, atanan_adlar: adlar, durum: 'Bekliyor',
    });
    setEkleniyor(false);
    if (error) { setMesaj({ tip: 'err', metin: error.message }); return; }
    setMesaj({ tip: 'ok', metin: 'Görev oluşturuldu.' });
    setYBaslik(''); setYAciklama(''); setYOncelik('Normal'); setYSonTarih(''); setYSeciliPersonel([]);
    hepsiniYukle();
  }

  async function durumDegistir(gorev, yeniDurum) {
    await supabase.from('gorevler').update({
      durum: yeniDurum,
      tamamlanma_tarihi: yeniDurum === 'Tamamlandı' ? new Date().toISOString() : null,
    }).eq('id', gorev.id);
    hepsiniYukle();
  }

  async function gorevSil(id) {
    if (!confirm('Bu görevi silmek istediğine emin misin?')) return;
    await supabase.from('gorevler').delete().eq('id', id);
    hepsiniYukle();
  }

  const gosterilenGorevler = durumFiltre === 'Tümü' ? gorevler : gorevler.filter((g) => g.durum === durumFiltre);
  const oncelikRengi = { 'Düşük': '#5B6560', 'Normal': '#2B4C5C', 'Yüksek': '#A0592A', 'Acil': '#B23B0E' };

  return (
    <div className="grid cols-2">
      <div className="card">
        <h2 className="section">Yeni Görev Oluştur</h2>
        <label>Lokasyon</label>
        <select value={yLokasyon} onChange={(e) => setYLokasyon(e.target.value)}>
          {lokasyonlar.map((l) => <option key={l.ad} value={l.ad}>{l.ad}</option>)}
        </select>
        <label>Başlık</label>
        <input value={yBaslik} onChange={(e) => setYBaslik(e.target.value)} placeholder="örn. Zemin betonu dökümü" />
        <label>Açıklama</label>
        <input value={yAciklama} onChange={(e) => setYAciklama(e.target.value)} placeholder="detaylar (opsiyonel)" />
        <label>Öncelik</label>
        <select value={yOncelik} onChange={(e) => setYOncelik(e.target.value)}>
          <option>Düşük</option><option>Normal</option><option>Yüksek</option><option>Acil</option>
        </select>
        <label>Son tarih</label>
        <input type="date" value={ySonTarih} onChange={(e) => setYSonTarih(e.target.value)} />
        <label>Atanacak personel</label>
        <div className="tag-list">
          {personeller.map((p) => (
            <span
              key={p.personel_no}
              className={'chip' + (ySeciliPersonel.includes(p.personel_no) ? ' sel' : '')}
              onClick={() => personelSecimiDegistir(p.personel_no)}
            >
              {p.ad}
            </span>
          ))}
          {personeller.length === 0 && <span style={{ fontSize: 13, color: 'var(--ink-soft)' }}>Henüz personel yok.</span>}
        </div>
        <button className="action btn-ai" onClick={gorevOlustur} disabled={ekleniyor}>
          {ekleniyor ? 'Oluşturuluyor...' : 'Görevi Oluştur'}
        </button>
        {mesaj && <div className={'feedback ' + mesaj.tip}>{mesaj.metin}</div>}
      </div>

      <div className="card">
        <h2 className="section">Görevler</h2>
        <label>Durum filtrele</label>
        <select value={durumFiltre} onChange={(e) => setDurumFiltre(e.target.value)}>
          <option>Tümü</option><option>Bekliyor</option><option>Devam Ediyor</option><option>Tamamlandı</option>
        </select>
        <div style={{ display: 'grid', gap: 8, marginTop: 12 }}>
          {gosterilenGorevler.map((g) => (
            <div key={g.id} style={{ border: '1px solid var(--border)', borderRadius: 9, padding: 10 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', gap: 8 }}>
                <div>
                  <div style={{ fontWeight: 700, fontSize: 14 }}>{g.baslik}</div>
                  <div style={{ fontSize: 12, color: 'var(--ink-soft)', marginTop: 2 }}>{g.lokasyon} · {(g.atanan_adlar || []).join(', ')}</div>
                  {g.aciklama && <div style={{ fontSize: 13, marginTop: 6 }}>{g.aciklama}</div>}
                  <div style={{ fontSize: 11, marginTop: 6, display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                    <span style={{ fontWeight: 700, color: oncelikRengi[g.oncelik] || 'var(--ink-soft)' }}>{g.oncelik}</span>
                    {g.son_tarih && <span style={{ color: 'var(--ink-soft)' }}>Son tarih: {new Date(g.son_tarih).toLocaleDateString('tr-TR')}</span>}
                    <span className={'status-tag' + (g.durum === 'Tamamlandı' ? ' open' : '')}>{g.durum}</span>
                  </div>
                </div>
                <button onClick={() => gorevSil(g.id)} style={{ border: 'none', background: 'rgba(220, 38, 38, 0.14)', color: '#ef4444', borderRadius: 7, padding: '4px 8px', fontSize: 11, fontWeight: 700, cursor: 'pointer' }}>Sil</button>
              </div>
              <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
                {g.durum !== 'Bekliyor' && <button onClick={() => durumDegistir(g, 'Bekliyor')} style={{ fontSize: 11, border: '1px solid var(--border)', background: 'var(--card)', borderRadius: 7, padding: '4px 8px', cursor: 'pointer' }}>Bekliyor yap</button>}
                {g.durum !== 'Devam Ediyor' && <button onClick={() => durumDegistir(g, 'Devam Ediyor')} style={{ fontSize: 11, border: '1px solid var(--border)', background: 'var(--card)', borderRadius: 7, padding: '4px 8px', cursor: 'pointer' }}>Devam Ediyor yap</button>}
                {g.durum !== 'Tamamlandı' && <button onClick={() => durumDegistir(g, 'Tamamlandı')} style={{ fontSize: 11, border: '1px solid var(--border)', background: 'rgba(34, 197, 94, 0.16)', color: '#22c55e', borderRadius: 7, padding: '4px 8px', cursor: 'pointer' }}>Tamamlandı yap</button>}
              </div>
            </div>
          ))}
          {gosterilenGorevler.length === 0 && <div style={{ color: 'var(--ink-soft)', fontSize: 13 }}>Gösterilecek görev yok.</div>}
        </div>
      </div>
    </div>
  );
}

/* ---------------- ŞANTİYE DEFTERİ (patron görüntüleme + düzenleme) ---------------- */
function SantiyeDefteriTab({ onDurumDegisti }) {
  const [raporlar, setRaporlar] = useState([]);
  const [lokasyonFiltre, setLokasyonFiltre] = useState('Tümü');
  const [lokasyonlar, setLokasyonlar] = useState([]);
  const [acikRapor, setAcikRapor] = useState(null);
  const [duzenleme, setDuzenleme] = useState(null);
  const [kaydediliyor, setKaydediliyor] = useState(false);

  async function raporlariYukle() {
    const { data: r } = await supabase.from('santiye_defterleri').select('*').order('created_at', { ascending: false });
    const { data: l } = await supabase.from('lokasyonlar').select('*');
    setRaporlar(r || []);
    setLokasyonlar(l || []);
  }

  useEffect(() => { raporlariYukle(); }, []);

  async function raporAc(r) {
    setAcikRapor(r);
    setDuzenleme({
      lokasyon: r.lokasyon,
      saha_formen_sayisi: r.saha_formen_sayisi ?? 0,
      saha_usta_sayisi: r.saha_usta_sayisi ?? 0,
      saha_isci_sayisi: r.saha_isci_sayisi ?? 0,
      ofis_personel_sayisi: r.ofis_personel_sayisi ?? 0,
      arac_ekipman: r.arac_ekipman && r.arac_ekipman.length ? r.arac_ekipman : [{ cins: '', adet: '' }],
      bugun_yapilan: r.bugun_yapilan || '',
      yarin_yapilacak: r.yarin_yapilacak || '',
      notlar: r.notlar || '',
    });

    if (r.durum === 'Yeni') {
      await supabase.from('santiye_defterleri').update({ durum: 'Görüldü' }).eq('id', r.id);
      raporlariYukle();
      if (onDurumDegisti) onDurumDegisti();
    }
  }

  function aracSatiriDegistir(i, alan, deger) {
    setDuzenleme((onceki) => ({
      ...onceki,
      arac_ekipman: onceki.arac_ekipman.map((a, idx) => (idx === i ? { ...a, [alan]: deger } : a)),
    }));
  }
  function aracSatiriEkle() {
    setDuzenleme((onceki) => ({ ...onceki, arac_ekipman: [...onceki.arac_ekipman, { cins: '', adet: '' }] }));
  }
  function aracSatiriSil(i) {
    setDuzenleme((onceki) => ({ ...onceki, arac_ekipman: onceki.arac_ekipman.filter((_, idx) => idx !== i) }));
  }

  async function degisiklikleriKaydet() {
    setKaydediliyor(true);
    const temizAraclar = duzenleme.arac_ekipman.filter((a) => a.cins.trim());
    const { error } = await supabase.from('santiye_defterleri').update({
      lokasyon: duzenleme.lokasyon,
      saha_formen_sayisi: Number(duzenleme.saha_formen_sayisi) || 0,
      saha_usta_sayisi: Number(duzenleme.saha_usta_sayisi) || 0,
      saha_isci_sayisi: Number(duzenleme.saha_isci_sayisi) || 0,
      ofis_personel_sayisi: Number(duzenleme.ofis_personel_sayisi) || 0,
      arac_ekipman: temizAraclar,
      bugun_yapilan: duzenleme.bugun_yapilan,
      yarin_yapilacak: duzenleme.yarin_yapilacak || null,
      notlar: duzenleme.notlar || null,
    }).eq('id', acikRapor.id);
    setKaydediliyor(false);
    if (error) { alert(error.message); return; }
    setAcikRapor(null);
    setDuzenleme(null);
    raporlariYukle();
  }

  async function raporSil(id) {
    if (!confirm('Bu raporu silmek istediğinize emin misiniz?')) return;
    await supabase.from('santiye_defterleri').delete().eq('id', id);
    setAcikRapor(null);
    raporlariYukle();
  }

  const gosterilenler = lokasyonFiltre === 'Tümü' ? raporlar : raporlar.filter((r) => r.lokasyon === lokasyonFiltre);

  if (acikRapor && duzenleme) {
    return (
      <div className="card">
        <button className="action btn-secondary" style={{ width: 'auto', marginBottom: 12 }} onClick={() => { setAcikRapor(null); setDuzenleme(null); }}>← Listeye dön</button>
        <h2 className="section">📋 {acikRapor.formen_adi} — {new Date(acikRapor.created_at).toLocaleString('tr-TR')}</h2>

        <label>Lokasyon</label>
        <input value={duzenleme.lokasyon} onChange={(e) => setDuzenleme({ ...duzenleme, lokasyon: e.target.value })} />

        <label style={{ marginTop: 12 }}>Saha personel sayıları</label>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
          <div>
            <div style={{ fontSize: 11, color: 'var(--ink-soft)', marginBottom: 4 }}>Formen</div>
            <input type="number" value={duzenleme.saha_formen_sayisi} onChange={(e) => setDuzenleme({ ...duzenleme, saha_formen_sayisi: e.target.value })} />
          </div>
          <div>
            <div style={{ fontSize: 11, color: 'var(--ink-soft)', marginBottom: 4 }}>Usta</div>
            <input type="number" value={duzenleme.saha_usta_sayisi} onChange={(e) => setDuzenleme({ ...duzenleme, saha_usta_sayisi: e.target.value })} />
          </div>
          <div>
            <div style={{ fontSize: 11, color: 'var(--ink-soft)', marginBottom: 4 }}>Düz İşçi</div>
            <input type="number" value={duzenleme.saha_isci_sayisi} onChange={(e) => setDuzenleme({ ...duzenleme, saha_isci_sayisi: e.target.value })} />
          </div>
        </div>

        <label>Ofis / idari personel sayısı</label>
        <input type="number" value={duzenleme.ofis_personel_sayisi} onChange={(e) => setDuzenleme({ ...duzenleme, ofis_personel_sayisi: e.target.value })} />

        <label style={{ marginTop: 16 }}>Makina, Ekipman ve Araç Durumu</label>
        <div style={{ display: 'grid', gap: 6 }}>
          {duzenleme.arac_ekipman.map((a, i) => (
            <div key={i} style={{ display: 'flex', gap: 6 }}>
              <input placeholder="Cinsi" value={a.cins} onChange={(e) => aracSatiriDegistir(i, 'cins', e.target.value)} style={{ flex: 2 }} />
              <input placeholder="Adet" type="number" value={a.adet} onChange={(e) => aracSatiriDegistir(i, 'adet', e.target.value)} style={{ flex: 1 }} />
              {duzenleme.arac_ekipman.length > 1 && (
                <button type="button" onClick={() => aracSatiriSil(i)} style={{ border: 'none', background: 'rgba(220, 38, 38, 0.14)', color: '#ef4444', borderRadius: 7, padding: '0 12px', fontWeight: 700, cursor: 'pointer' }}>✕</button>
              )}
            </div>
          ))}
        </div>
        <button type="button" className="action btn-secondary" style={{ marginTop: 8 }} onClick={aracSatiriEkle}>+ Satır Ekle</button>

        <label style={{ marginTop: 16 }}>Bugün Yapılan İşler</label>
        <textarea rows={4} value={duzenleme.bugun_yapilan} onChange={(e) => setDuzenleme({ ...duzenleme, bugun_yapilan: e.target.value })} style={{ width: '100%', padding: 10, borderRadius: 8, border: '1px solid var(--border)', background: 'var(--card)', color: 'var(--ink)', fontFamily: 'inherit', fontSize: 14 }} />

        <label style={{ marginTop: 12 }}>Yarın Yapılacak İşler</label>
        <textarea rows={3} value={duzenleme.yarin_yapilacak} onChange={(e) => setDuzenleme({ ...duzenleme, yarin_yapilacak: e.target.value })} style={{ width: '100%', padding: 10, borderRadius: 8, border: '1px solid var(--border)', background: 'var(--card)', color: 'var(--ink)', fontFamily: 'inherit', fontSize: 14 }} />

        <label style={{ marginTop: 12 }}>Notlar / Açıklamalar / Sıkıntılar</label>
        <textarea rows={3} value={duzenleme.notlar} onChange={(e) => setDuzenleme({ ...duzenleme, notlar: e.target.value })} style={{ width: '100%', padding: 10, borderRadius: 8, border: '1px solid var(--border)', background: 'var(--card)', color: 'var(--ink)', fontFamily: 'inherit', fontSize: 14 }} />

        <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
          <button className="action btn-ai" onClick={degisiklikleriKaydet} disabled={kaydediliyor}>
            {kaydediliyor ? 'Kaydediliyor...' : 'Değişiklikleri Kaydet'}
          </button>
          <button
            onClick={() => raporSil(acikRapor.id)}
            style={{ border: 'none', background: 'rgba(220, 38, 38, 0.14)', color: '#ef4444', borderRadius: 9, padding: '0 16px', fontWeight: 700, cursor: 'pointer' }}
          >
            Sil
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="card">
      <h2 className="section">📋 Şantiye Defteri — Formen Raporları</h2>
      <label>Lokasyon filtrele</label>
      <select value={lokasyonFiltre} onChange={(e) => setLokasyonFiltre(e.target.value)}>
        <option>Tümü</option>
        {lokasyonlar.map((l) => <option key={l.ad} value={l.ad}>{l.ad}</option>)}
      </select>
      <div style={{ display: 'grid', gap: 8, marginTop: 12 }}>
        {gosterilenler.map((r) => (
          <div
            key={r.id}
            onClick={() => raporAc(r)}
            style={{ border: '1px solid var(--border)', borderRadius: 9, padding: 10, cursor: 'pointer' }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', gap: 8 }}>
              <div>
                <div style={{ fontWeight: 700, fontSize: 14 }}>{r.lokasyon}</div>
                <div style={{ fontSize: 12, color: 'var(--ink-soft)', marginTop: 2 }}>
                  {r.formen_adi} · {new Date(r.created_at).toLocaleString('tr-TR')}
                </div>
                <div style={{ fontSize: 13, marginTop: 6, color: 'var(--ink-soft)' }}>
                  {(r.bugun_yapilan || '').slice(0, 80)}{(r.bugun_yapilan || '').length > 80 ? '...' : ''}
                </div>
              </div>
              <span className={'status-tag' + (r.durum === 'Görüldü' ? ' open' : '')}>{r.durum}</span>
            </div>
          </div>
        ))}
        {gosterilenler.length === 0 && <div style={{ color: 'var(--ink-soft)', fontSize: 13 }}>Henüz rapor gönderilmedi.</div>}
      </div>
    </div>
  );
}

/* ---------------- PROJELER (mimar planları + hata işaretleme) ---------------- */
function ProjelerTab() {
  const [lokasyonlar, setLokasyonlar] = useState([]);
  const [seciliLokasyon, setSeciliLokasyon] = useState('');
  const [projeler, setProjeler] = useState([]);
  const [seciliProje, setSeciliProje] = useState(null);
  const [notlar, setNotlar] = useState([]);
  const [yeniBaslik, setYeniBaslik] = useState('');
  const [yeniDosya, setYeniDosya] = useState(null);
  const [yukleniyor, setYukleniyor] = useState(false);
  const [mesaj, setMesaj] = useState(null);
  const [yeniPin, setYeniPin] = useState(null); // { x, y } — henüz kaydedilmemiş
  const [pinMetni, setPinMetni] = useState('');
  const [acikPin, setAcikPin] = useState(null); // görüntülenen pin detayı
  const [pinEklemeModu, setPinEklemeModu] = useState(false);

  useEffect(() => {
    supabase.from('lokasyonlar').select('*').then(({ data }) => {
      setLokasyonlar(data || []);
      if (data && data.length) setSeciliLokasyon(data[0].ad);
    });
  }, []);

  async function projeleriYukle() {
    if (!seciliLokasyon) return;
    const { data } = await supabase.from('projeler').select('*').eq('lokasyon', seciliLokasyon).order('created_at', { ascending: false });
    setProjeler(data || []);
  }

  useEffect(() => { projeleriYukle(); setSeciliProje(null); }, [seciliLokasyon]); // eslint-disable-line

  async function notlariYukle(projeId) {
    const { data } = await supabase.from('proje_notlari').select('*').eq('proje_id', projeId).order('created_at', { ascending: true });
    setNotlar(data || []);
  }

  async function projeSec(p) {
    setSeciliProje(p);
    setAcikPin(null);
    setYeniPin(null);
    await notlariYukle(p.id);
  }

  async function projeEkle() {
    setMesaj(null);
    if (!yeniBaslik.trim() || !yeniDosya) { setMesaj({ tip: 'err', metin: 'Başlık ve resim gerekli.' }); return; }
    setYukleniyor(true);
    const dosyaAdi = Date.now() + '-' + yeniDosya.name.replace(/\s+/g, '-');
    const { error: yuklemeHatasi } = await supabase.storage.from('proje-resimleri').upload(dosyaAdi, yeniDosya);
    if (yuklemeHatasi) { setMesaj({ tip: 'err', metin: yuklemeHatasi.message }); setYukleniyor(false); return; }
    const { data: urlData } = supabase.storage.from('proje-resimleri').getPublicUrl(dosyaAdi);
    const { error } = await supabase.from('projeler').insert({
      lokasyon: seciliLokasyon, baslik: yeniBaslik.trim(), resim_url: urlData.publicUrl,
    });
    setYukleniyor(false);
    if (error) { setMesaj({ tip: 'err', metin: error.message }); return; }
    setMesaj({ tip: 'ok', metin: 'Proje eklendi.' });
    setYeniBaslik(''); setYeniDosya(null);
    projeleriYukle();
  }

  function resmeTiklandi(e) {
    if (!seciliProje || !pinEklemeModu) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * 100;
    const y = ((e.clientY - rect.top) / rect.height) * 100;
    setAcikPin(null);
    setYeniPin({ x, y });
    setPinMetni('');
  }

  async function pinKaydet() {
    if (!pinMetni.trim() || !yeniPin) return;
    const { error } = await supabase.from('proje_notlari').insert({
      proje_id: seciliProje.id, x: yeniPin.x, y: yeniPin.y, aciklama: pinMetni.trim(), durum: 'Açık', olusturan: 'Patron',
    });
    if (error) { setMesaj({ tip: 'err', metin: error.message }); return; }
    setYeniPin(null); setPinMetni(''); setPinEklemeModu(false);
    notlariYukle(seciliProje.id);
  }

  async function pinSil(id) {
    await supabase.from('proje_notlari').delete().eq('id', id);
    setAcikPin(null);
    notlariYukle(seciliProje.id);
  }

  // --- Proje açıksa: plan görüntüleme + işaretleme ekranı ---
  if (seciliProje) {
    return (
      <div className="card">
        <style>{`
          @keyframes pinNabiz { 0% { box-shadow: 0 0 0 0 rgba(220,38,38,0.5); } 70% { box-shadow: 0 0 0 12px rgba(220,38,38,0); } 100% { box-shadow: 0 0 0 0 rgba(220,38,38,0); } }
          .proje-pin { position: absolute; width: 22px; height: 22px; border-radius: 50%; transform: translate(-50%, -50%); cursor: pointer; border: 2px solid white; }
          .proje-pin.acik { background: #dc2626; animation: pinNabiz 1.6s infinite; }
          .proje-pin.cozuldu { background: #16a34a; }
        `}</style>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 12, flexWrap: 'wrap' }}>
          <button className="action btn-secondary" style={{ width: 'auto' }} onClick={() => setSeciliProje(null)}>← Projelere dön</button>
          <button
            className={'action' + (pinEklemeModu ? ' btn-punch cikis' : ' btn-ai')}
            style={{ width: 'auto' }}
            onClick={() => { setPinEklemeModu((m) => !m); setYeniPin(null); setAcikPin(null); }}
          >
            {pinEklemeModu ? '✕ Pin Eklemeyi İptal Et' : '📍 Pin Ekle'}
          </button>
        </div>
        <h2 className="section">{seciliProje.baslik}</h2>
        <div style={{ fontSize: 13, color: pinEklemeModu ? 'var(--ink)' : 'var(--ink-soft)', marginBottom: 10 }}>
          {pinEklemeModu ? 'Pin ekleme modu açık — hatayı işaretlemek için planın üzerine tıklayın.' : '"Pin Ekle" butonuna basıp planda işaretlemek istediğiniz noktaya tıklayın.'}
        </div>
        <div style={{ position: 'relative', display: 'inline-block', maxWidth: '100%' }}>
          <img
            src={seciliProje.resim_url}
            alt={seciliProje.baslik}
            onClick={resmeTiklandi}
            style={{ maxWidth: '100%', display: 'block', cursor: pinEklemeModu ? 'crosshair' : 'default', borderRadius: 8 }}
          />
          {notlar.map((n) => (
            <div
              key={n.id}
              className={'proje-pin ' + (n.durum === 'Açık' ? 'acik' : 'cozuldu')}
              style={{ left: n.x + '%', top: n.y + '%' }}
              onClick={(e) => { e.stopPropagation(); setYeniPin(null); setAcikPin(n); }}
            />
          ))}
          {yeniPin && <div className="proje-pin acik" style={{ left: yeniPin.x + '%', top: yeniPin.y + '%' }} />}
        </div>

        {yeniPin && (
          <div style={{ marginTop: 14 }}>
            <label>Hata açıklaması</label>
            <input value={pinMetni} onChange={(e) => setPinMetni(e.target.value)} placeholder="örn. bu duvarın ölçüsü yanlış" />
            <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
              <button className="action btn-ai" onClick={pinKaydet}>İşaretle</button>
              <button className="action btn-secondary" onClick={() => { setYeniPin(null); setPinEklemeModu(false); }}>İptal</button>
            </div>
          </div>
        )}

        {acikPin && (
          <div className="card" style={{ marginTop: 14 }}>
            <div style={{ fontSize: 13, marginBottom: 8 }}>
              <span className={'status-tag' + (acikPin.durum === 'Açık' ? ' open' : '')}>{acikPin.durum}</span>
            </div>
            <div style={{ marginBottom: 10 }}>{acikPin.aciklama}</div>
            {acikPin.cozen && <div style={{ fontSize: 12, color: 'var(--ink-soft)', marginBottom: 8 }}>Düzelten: {acikPin.cozen}</div>}
            <div style={{ display: 'flex', gap: 8 }}>
              <button className="action btn-secondary" onClick={() => pinSil(acikPin.id)}>Sil</button>
              <button className="action btn-secondary" onClick={() => setAcikPin(null)}>Kapat</button>
            </div>
          </div>
        )}
        {mesaj && <div className={'feedback ' + mesaj.tip}>{mesaj.metin}</div>}
      </div>
    );
  }

  // --- Proje seçilmemişse: liste + yeni proje ekleme ekranı ---
  return (
    <div className="grid cols-2">
      <div className="card">
        <h2 className="section">Projeler</h2>
        <label>Lokasyon</label>
        <select value={seciliLokasyon} onChange={(e) => setSeciliLokasyon(e.target.value)}>
          {lokasyonlar.map((l) => <option key={l.ad} value={l.ad}>{l.ad}</option>)}
        </select>
        {projeler.length === 0 && (
          <div style={{ fontSize: 13, color: 'var(--ink-soft)', marginTop: 10 }}>Bu lokasyonda henüz proje yok.</div>
        )}
        <div style={{ display: 'grid', gap: 10, marginTop: 12 }}>
          {projeler.map((p) => (
            <div key={p.id} className="card" style={{ cursor: 'pointer', padding: 10 }} onClick={() => projeSec(p)}>
              <img src={p.resim_url} alt={p.baslik} style={{ width: '100%', height: 120, objectFit: 'cover', borderRadius: 6 }} />
              <div style={{ marginTop: 6, fontWeight: 600 }}>{p.baslik}</div>
            </div>
          ))}
        </div>
      </div>
      <div className="card">
        <h2 className="section">Yeni Proje Ekle</h2>
        <label>Başlık</label>
        <input value={yeniBaslik} onChange={(e) => setYeniBaslik(e.target.value)} placeholder="örn. Zemin kat planı" />
        <label>Proje / plan resmi</label>
        <input type="file" accept="image/*" onChange={(e) => setYeniDosya(e.target.files?.[0] || null)} />
        <button className="action btn-ai" onClick={projeEkle} disabled={yukleniyor}>
          {yukleniyor ? 'Yükleniyor...' : 'Projeyi Ekle'}
        </button>
        {mesaj && <div className={'feedback ' + mesaj.tip}>{mesaj.metin}</div>}
      </div>
    </div>
  );
}

/* ---------------- TEKLİFLER ---------------- */
function Teklifler() {
  const [teklifler, setTeklifler] = useState([]);
  const [arama, setArama] = useState('');

  useEffect(() => {
    supabase.from('teklifler').select('*').order('tarih', { ascending: false }).then(({ data }) => setTeklifler(data || []));
  }, []);

  const gosterilenler = arama.trim()
    ? teklifler.filter((t) => t.lokasyon.toLocaleLowerCase('tr-TR').includes(arama.trim().toLocaleLowerCase('tr-TR')))
    : teklifler;

  return (
    <div className="card">
      <h2 className="section">Geçmiş Teklifler</h2>
      <label>Lokasyona göre ara</label>
      <input placeholder="lokasyon adı yazın" value={arama} onChange={(e) => setArama(e.target.value)} />
      <button
        className="action btn-secondary"
        disabled={!gosterilenler.length}
        onClick={() => excelIndir(
          gosterilenler.map((t) => ({ Tarih: new Date(t.tarih).toLocaleString('tr-TR'), Lokasyon: t.lokasyon, 'Toplam Maliyet': t.toplam_maliyet, Durum: t.durum })),
          'teklifler.xlsx'
        )}
      >
        📊 Excel'e Aktar
      </button>
      {gosterilenler.length === 0 && <div style={{ color: 'var(--ink-soft)', fontSize: 13, marginTop: 10 }}>Gösterilecek teklif yok.</div>}
      {gosterilenler.map((t) => (
        <div key={t.id} style={{ borderBottom: '1px solid var(--border)', padding: '10px 0', fontSize: 13, display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 6 }}>
          <span>
            {new Date(t.tarih).toLocaleString('tr-TR')} · {t.lokasyon} · {formatPLN(t.toplam_maliyet)}{' '}
            <span className="status-tag">{t.durum}</span>
          </span>
          <button
            onClick={() => teklifPdfIndir(t)}
            style={{ border: 'none', background: 'var(--accent-patron-soft)', color: 'var(--accent-patron)', borderRadius: 7, padding: '5px 10px', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}
          >
            📄 PDF İndir
          </button>
        </div>
      ))}
    </div>
  );
}

/* ---------------- AYARLAR ---------------- */
function Ayarlar() {
  const [lokasyonlar, setLokasyonlar] = useState([]);
  const [kalemTurleri, setKalemTurleri] = useState([]);
  const [araclar, setAraclar] = useState([]);
  const [yeniLokasyon, setYeniLokasyon] = useState('');
  const [yeniEnlem, setYeniEnlem] = useState('');
  const [yeniBoylam, setYeniBoylam] = useState('');
  const [yeniYaricap, setYeniYaricap] = useState('150');
  const [konumAliniyor, setKonumAliniyor] = useState(false);
  const [gorunenQr, setGorunenQr] = useState(null); // { ad, dataUrl }
  const [ayarlar, setAyarlar] = useState({ konum_dogrulama_aktif: false, qr_dogrulama_aktif: false, gunluk_rapor_aktif: false, haftalik_rapor_aktif: false, aylik_rapor_aktif: false, rapor_eposta: '' });
  const [yeniKalem, setYeniKalem] = useState('');
  const [yeniPlaka, setYeniPlaka] = useState('');
  const [yeniPlakaKm, setYeniPlakaKm] = useState('');
  const [yeniMarka, setYeniMarka] = useState('');
  const [yeniModel, setYeniModel] = useState('');
  const [yeniResimDosya, setYeniResimDosya] = useState(null);
  const [yeniSonMuayene, setYeniSonMuayene] = useState('');
  const [yeniSonrakiMuayene, setYeniSonrakiMuayene] = useState('');
  const [ekleniyor, setEkleniyor] = useState(false);
  const [ypNo, setYpNo] = useState('');
  const [ypSifre, setYpSifre] = useState('');
  const [ypAd, setYpAd] = useState('');
  const [ypRol, setYpRol] = useState('personel');
  const [ypMesaj, setYpMesaj] = useState(null);
  const [tumPersonel, setTumPersonel] = useState([]);
  const [testGonderiliyor, setTestGonderiliyor] = useState(false);
  const [testMesaj, setTestMesaj] = useState(null);
  const [duzenlenenKalemId, setDuzenlenenKalemId] = useState(null);
  const [duzenlenenKalemAd, setDuzenlenenKalemAd] = useState('');

  async function hepsiniYukle() {
    const { data: l } = await supabase.from('lokasyonlar').select('*');
    const { data: k } = await supabase.from('kalem_turleri').select('*');
    const { data: a } = await supabase.from('araclar').select('*');
    const { data: s } = await supabase.from('sistem_ayarlari').select('*').eq('id', 1).maybeSingle();
    const { data: p } = await supabase.from('personel').select('*').neq('rol', 'patron').order('ad');
    setLokasyonlar(l || []);
    setKalemTurleri(k || []);
    setAraclar(a || []);
    if (s) setAyarlar(s);
    setTumPersonel(p || []);
  }

  useEffect(() => { hepsiniYukle(); }, []);

  async function ayarGuncelle(alan, deger) {
    const yeniAyarlar = { ...ayarlar, [alan]: deger };
    setAyarlar(yeniAyarlar);
    await supabase.from('sistem_ayarlari').update({ [alan]: deger }).eq('id', 1);
  }

  async function testEpostasiGonder() {
    if (!ayarlar.rapor_eposta || !ayarlar.rapor_eposta.trim()) {
      setTestMesaj({ tip: 'err', metin: 'Lütfen geçerli bir e-posta adresi girin.' });
      return;
    }
    setTestGonderiliyor(true);
    setTestMesaj(null);
    try {
      const res = await fetch('/api/cron/test-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ eposta: ayarlar.rapor_eposta.trim() }),
      });
      const data = await res.json();
      if (data.basari) {
        setTestMesaj({ tip: 'ok', metin: data.mesaj || 'Test e-postası başarıyla gönderildi!' });
      } else {
        setTestMesaj({ tip: 'err', metin: data.mesaj || 'Gönderim başarısız.' });
      }
    } catch (err) {
      setTestMesaj({ tip: 'err', metin: 'İstek hatası: ' + err.message });
    }
    setTestGonderiliyor(false);
  }

  async function suankiKonumuKullan() {
    setKonumAliniyor(true);
    try {
      const { lat, lon } = await konumAl();
      setYeniEnlem(String(lat));
      setYeniBoylam(String(lon));
    } catch (err) {
      alert(err.message);
    }
    setKonumAliniyor(false);
  }

  async function lokasyonEkle() {
    if (!yeniLokasyon.trim()) return;
    const qrKodu = (typeof crypto !== 'undefined' && crypto.randomUUID) ? crypto.randomUUID() : String(Date.now()) + Math.random();
    await supabase.from('lokasyonlar').insert({
      ad: yeniLokasyon.trim(),
      enlem: yeniEnlem ? Number(yeniEnlem) : null,
      boylam: yeniBoylam ? Number(yeniBoylam) : null,
      yaricap_metre: Number(yeniYaricap) || 150,
      qr_kodu: qrKodu,
    });
    setYeniLokasyon(''); setYeniEnlem(''); setYeniBoylam(''); setYeniYaricap('150');
    hepsiniYukle();
  }

  async function lokasyonSil(ad) {
    if (!confirm(ad + ' lokasyonunu silmek istediğine emin misin?')) return;
    await supabase.from('lokasyonlar').delete().eq('ad', ad);
    hepsiniYukle();
  }

  async function qrGoster(lokasyon) {
    if (!lokasyon.qr_kodu) { alert('Bu lokasyon için QR kod tanımlı değil.'); return; }
    const dataUrl = await QRCode.toDataURL(lokasyon.qr_kodu, { width: 260 });
    setGorunenQr({ ad: lokasyon.ad, dataUrl });
  }

  async function kalemEkle() {
    if (!yeniKalem.trim()) return;
    await supabase.from('kalem_turleri').insert({ ad: yeniKalem.trim() });
    setYeniKalem('');
    hepsiniYukle();
  }
  async function kalemSil(id, ad) {
    if (!confirm(ad + ' kalem türünü silmek istediğine emin misin?')) return;
    await supabase.from('kalem_turleri').delete().eq('id', id);
    hepsiniYukle();
  }
  async function kalemGuncelle(id) {
    if (!duzenlenenKalemAd.trim()) return;
    await supabase.from('kalem_turleri').update({ ad: duzenlenenKalemAd.trim() }).eq('id', id);
    setDuzenlenenKalemId(null);
    setDuzenlenenKalemAd('');
    hepsiniYukle();
  }
  async function plakaEkle() {
    if (!yeniPlaka.trim()) return;
    setEkleniyor(true);

    let resimUrl = null;
    if (yeniResimDosya) {
      const dosyaAdi = Date.now() + '-' + yeniResimDosya.name.replace(/\s+/g, '-');
      const { error: yuklemeHatasi } = await supabase.storage.from('arac-resimleri').upload(dosyaAdi, yeniResimDosya);
      if (yuklemeHatasi) {
        alert('Resim yüklenemedi: ' + yuklemeHatasi.message);
        setEkleniyor(false);
        return;
      }
      const { data: urlData } = supabase.storage.from('arac-resimleri').getPublicUrl(dosyaAdi);
      resimUrl = urlData.publicUrl;
    }

    await supabase.from('araclar').insert({
      plaka: yeniPlaka.trim(),
      durum: 'Boşta',
      son_km: Number(yeniPlakaKm) || 0,
      marka: yeniMarka.trim() || null,
      model: yeniModel.trim() || null,
      resim_url: resimUrl,
      son_muayene_tarihi: yeniSonMuayene || null,
      sonraki_muayene_tarihi: yeniSonrakiMuayene || null,
    });
    setYeniPlaka(''); setYeniPlakaKm(''); setYeniMarka(''); setYeniModel(''); setYeniResimDosya(null);
    setYeniSonMuayene(''); setYeniSonrakiMuayene('');
    setEkleniyor(false);
    hepsiniYukle();
  }
  async function plakaSil(plaka, durum) {
    if (durum === 'Kullanımda') {
      alert('Bu araç şu an kullanımda, önce personel tarafından teslim edilmesi gerekiyor.');
      return;
    }
    if (!confirm(plaka + ' plakalı aracı silmek istediğine emin misin?')) return;
    await supabase.from('araclar').delete().eq('plaka', plaka);
    hepsiniYukle();
  }
  async function personelEkle() {
    setYpMesaj(null);
    if (!ypNo.trim() || !ypSifre.trim() || !ypAd.trim()) { setYpMesaj({ tip: 'err', metin: 'Tüm alanları doldurun.' }); return; }
    const { error } = await supabase.from('personel').insert({
      personel_no: ypNo.trim(), sifre: ypSifre.trim(), ad: ypAd.trim(), rol: ypRol,
    });
    if (error) { setYpMesaj({ tip: 'err', metin: error.message }); return; }
    setYpMesaj({ tip: 'ok', metin: ypAd + ' eklendi (' + ypNo + ', ' + (ypRol === 'formen' ? 'Formen' : 'Personel') + ').' });
    setYpNo(''); setYpSifre(''); setYpAd(''); setYpRol('personel');
    hepsiniYukle();
  }

  async function rolDegistir(personel_no, yeniRol) {
    await supabase.from('personel').update({ rol: yeniRol }).eq('personel_no', personel_no);
    hepsiniYukle();
  }

  async function personelSil(personel_no, ad) {
    if (!confirm(ad + ' adlı personeli silmek istediğine emin misin? Geçmiş kayıtları (mesai, masraf vb.) etkilenmez.')) return;
    await supabase.from('personel').delete().eq('personel_no', personel_no);
    hepsiniYukle();
  }

  return (
    <div className="grid cols-2">
      <div className="card">
        <h2 className="section">Doğrulama Ayarları</h2>
        <div style={{ fontSize: 12, color: 'var(--ink-soft)', marginTop: 4, marginBottom: 12 }}>
          Açarsan, personel mesai giriş/çıkışında bu doğrulamaları geçmek zorunda kalır.
        </div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 0', borderBottom: '1px solid var(--border)' }}>
          <span style={{ fontSize: 14 }}>📍 Konum doğrulaması</span>
          <button
            onClick={() => ayarGuncelle('konum_dogrulama_aktif', !ayarlar.konum_dogrulama_aktif)}
            style={{
              border: 'none', borderRadius: 20, padding: '6px 14px', fontSize: 12, fontWeight: 700, cursor: 'pointer',
              background: ayarlar.konum_dogrulama_aktif ? 'rgba(34, 197, 94, 0.16)' : 'rgba(127, 127, 127, 0.12)',
              color: ayarlar.konum_dogrulama_aktif ? '#22c55e' : 'var(--ink-soft)',
            }}
          >
            {ayarlar.konum_dogrulama_aktif ? 'Aktif' : 'Pasif'}
          </button>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 0' }}>
          <span style={{ fontSize: 14 }}>📷 QR kod doğrulaması</span>
          <button
            onClick={() => ayarGuncelle('qr_dogrulama_aktif', !ayarlar.qr_dogrulama_aktif)}
            style={{
              border: 'none', borderRadius: 20, padding: '6px 14px', fontSize: 12, fontWeight: 700, cursor: 'pointer',
              background: ayarlar.qr_dogrulama_aktif ? 'rgba(34, 197, 94, 0.16)' : 'rgba(127, 127, 127, 0.12)',
              color: ayarlar.qr_dogrulama_aktif ? '#22c55e' : 'var(--ink-soft)',
            }}
          >
            {ayarlar.qr_dogrulama_aktif ? 'Aktif' : 'Pasif'}
          </button>
        </div>
      </div>

      <div className="card">
        <h2 className="section">E-Posta Raporları</h2>
        <div style={{ fontSize: 12, color: 'var(--ink-soft)', marginTop: 4, marginBottom: 12 }}>
          Günlük ve aylık özet raporlarının gönderileceği e-posta adresini ve durumunu ayarlayın.
        </div>
        <div style={{ marginBottom: 12 }}>
          <label style={{ fontSize: 13, fontWeight: 'bold' }}>Rapor Gönderilecek E-posta</label>
          <input
            type="email"
            placeholder="ornek@firma.com"
            value={ayarlar.rapor_eposta || ''}
            onChange={(e) => setAyarlar({ ...ayarlar, rapor_eposta: e.target.value })}
            onBlur={(e) => ayarGuncelle('rapor_eposta', e.target.value.trim())}
            style={{ marginTop: 6 }}
          />
          <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
            <button
              onClick={testEpostasiGonder}
              disabled={testGonderiliyor || !ayarlar.rapor_eposta}
              className="action btn-secondary"
              style={{
                width: 'auto', fontSize: 12, padding: '6px 12px', height: 'auto', cursor: 'pointer',
                background: 'var(--card)', color: 'var(--ink)', border: '1px solid var(--border)',
                opacity: (testGonderiliyor || !ayarlar.rapor_eposta) ? 0.5 : 1,
              }}
            >
              {testGonderiliyor ? 'Gönderiliyor...' : '⚡ Test E-postası Gönder'}
            </button>
          </div>
          {testMesaj && <div className={`feedback ${testMesaj.tip}`} style={{ marginTop: 8, fontSize: 12 }}>{testMesaj.metin}</div>}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 0', borderBottom: '1px solid var(--border)' }}>
          <span style={{ fontSize: 14 }}>✉️ Günlük E-posta Raporu</span>
          <button
            onClick={() => ayarGuncelle('gunluk_rapor_aktif', !ayarlar.gunluk_rapor_aktif)}
            style={{
              border: 'none', borderRadius: 20, padding: '6px 14px', fontSize: 12, fontWeight: 700, cursor: 'pointer',
              background: ayarlar.gunluk_rapor_aktif ? 'rgba(34, 197, 94, 0.16)' : 'rgba(127, 127, 127, 0.12)',
              color: ayarlar.gunluk_rapor_aktif ? '#22c55e' : 'var(--ink-soft)',
            }}
          >
            {ayarlar.gunluk_rapor_aktif ? 'Aktif' : 'Pasif'}
          </button>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 0', borderBottom: '1px solid var(--border)' }}>
          <span style={{ fontSize: 14 }}>📅 Haftalık E-posta Raporu</span>
          <button
            onClick={() => ayarGuncelle('haftalik_rapor_aktif', !ayarlar.haftalik_rapor_aktif)}
            style={{
              border: 'none', borderRadius: 20, padding: '6px 14px', fontSize: 12, fontWeight: 700, cursor: 'pointer',
              background: ayarlar.haftalik_rapor_aktif ? 'rgba(34, 197, 94, 0.16)' : 'rgba(127, 127, 127, 0.12)',
              color: ayarlar.haftalik_rapor_aktif ? '#22c55e' : 'var(--ink-soft)',
            }}
          >
            {ayarlar.haftalik_rapor_aktif ? 'Aktif' : 'Pasif'}
          </button>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 0' }}>
          <span style={{ fontSize: 14 }}>📅 Aylık E-posta Raporu</span>
          <button
            onClick={() => ayarGuncelle('aylik_rapor_aktif', !ayarlar.aylik_rapor_aktif)}
            style={{
              border: 'none', borderRadius: 20, padding: '6px 14px', fontSize: 12, fontWeight: 700, cursor: 'pointer',
              background: ayarlar.aylik_rapor_aktif ? 'rgba(34, 197, 94, 0.16)' : 'rgba(127, 127, 127, 0.12)',
              color: ayarlar.aylik_rapor_aktif ? '#22c55e' : 'var(--ink-soft)',
            }}
          >
            {ayarlar.aylik_rapor_aktif ? 'Aktif' : 'Pasif'}
          </button>
        </div>
      </div>

      <div className="card">
        <h2 className="section">Lokasyonlar</h2>
        <div style={{ display: 'grid', gap: 8, marginTop: 10 }}>
          {lokasyonlar.map((l) => (
            <div key={l.ad} style={{ border: '1px solid var(--border)', borderRadius: 9, padding: '8px 12px' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div style={{ fontSize: 13 }}>
                  <b>{l.ad}</b> {l.enlem != null ? ' · 📍 konum tanımlı' : ' · konum yok'} · yarıçap {l.yaricap_metre || 150} m
                </div>
                <div style={{ display: 'flex', gap: 6 }}>
                  <button onClick={() => qrGoster(l)} style={{ border: 'none', background: 'var(--accent-patron-soft)', color: 'var(--accent-patron)', borderRadius: 7, padding: '5px 10px', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>QR</button>
                  <button onClick={() => lokasyonSil(l.ad)} style={{ border: 'none', background: 'rgba(220, 38, 38, 0.14)', color: '#ef4444', borderRadius: 7, padding: '5px 10px', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>Sil</button>
                </div>
              </div>
            </div>
          ))}
          {lokasyonlar.length === 0 && <div style={{ color: 'var(--ink-soft)', fontSize: 13 }}>Henüz lokasyon eklenmedi.</div>}
        </div>

        {gorunenQr && (
          <div className="card" style={{ marginTop: 12, textAlign: 'center' }}>
            <div style={{ fontWeight: 700, marginBottom: 8 }}>{gorunenQr.ad}</div>
            <img src={gorunenQr.dataUrl} alt="QR kod" style={{ width: 180, height: 180, margin: '0 auto' }} />
            <div style={{ display: 'flex', gap: 8, marginTop: 10, justifyContent: 'center' }}>
              <a href={gorunenQr.dataUrl} download={gorunenQr.ad + '-qr.png'} className="action btn-secondary" style={{ width: 'auto', padding: '8px 14px', textDecoration: 'none' }}>İndir</a>
              <button className="action btn-secondary" style={{ width: 'auto', padding: '8px 14px' }} onClick={() => setGorunenQr(null)}>Kapat</button>
            </div>
          </div>
        )}

        <div style={{ display: 'grid', gap: 8, marginTop: 14 }}>
          <input placeholder="Yeni lokasyon adı" value={yeniLokasyon} onChange={(e) => setYeniLokasyon(e.target.value)} />
          <div style={{ display: 'flex', gap: 8 }}>
            <input placeholder="Enlem (opsiyonel)" value={yeniEnlem} onChange={(e) => setYeniEnlem(e.target.value)} />
            <input placeholder="Boylam (opsiyonel)" value={yeniBoylam} onChange={(e) => setYeniBoylam(e.target.value)} />
          </div>
          <button onClick={suankiKonumuKullan} disabled={konumAliniyor} style={{ border: '1px solid var(--border)', background: 'var(--card)', color: 'var(--ink)', borderRadius: 9, padding: '9px 0', fontWeight: 600, cursor: 'pointer', fontSize: 13 }}>
            {konumAliniyor ? 'Konum alınıyor...' : '📍 Şu Anki Konumu Kullan (sahadayken)'}
          </button>
          <input placeholder="İzin verilen yarıçap (metre)" type="number" value={yeniYaricap} onChange={(e) => setYeniYaricap(e.target.value)} />
          <button onClick={lokasyonEkle} style={{ border: 'none', background: 'var(--accent-patron)', color: '#fff', borderRadius: 9, padding: '10px 0', fontWeight: 700, cursor: 'pointer' }}>Lokasyon Ekle</button>
        </div>
      </div>
      <div className="card">
        <h2 className="section">Kalem Türleri</h2>
        <div style={{ display: 'grid', gap: 8, marginTop: 10, marginBottom: 12 }}>
          {kalemTurleri.map((k) => (
            <div key={k.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', border: '1px solid var(--border)', borderRadius: 9, padding: '8px 12px' }}>
              {duzenlenenKalemId === k.id ? (
                <div style={{ display: 'flex', gap: 6, width: '100%' }}>
                  <input
                    value={duzenlenenKalemAd}
                    onChange={(e) => setDuzenlenenKalemAd(e.target.value)}
                    style={{ padding: '5px 8px', fontSize: 13, flex: 1 }}
                  />
                  <button
                    onClick={() => kalemGuncelle(k.id)}
                    style={{ border: 'none', background: 'rgba(34, 197, 94, 0.16)', color: '#22c55e', borderRadius: 7, padding: '5px 10px', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}
                  >
                    Kaydet
                  </button>
                  <button
                    onClick={() => { setDuzenlenenKalemId(null); setDuzenlenenKalemAd(''); }}
                    style={{ border: '1px solid var(--border)', background: 'var(--card)', color: 'var(--ink)', borderRadius: 7, padding: '5px 10px', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}
                  >
                    İptal
                  </button>
                </div>
              ) : (
                <>
                  <span style={{ fontSize: 13, fontWeight: 600 }}>{k.ad}</span>
                  <div style={{ display: 'flex', gap: 6 }}>
                    <button
                      onClick={() => { setDuzenlenenKalemId(k.id); setDuzenlenenKalemAd(k.ad); }}
                      style={{ border: 'none', background: 'var(--accent-patron-soft)', color: 'var(--accent-patron)', borderRadius: 7, padding: '5px 10px', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}
                    >
                      Düzenle
                    </button>
                    <button
                      onClick={() => kalemSil(k.id, k.ad)}
                      style={{ border: 'none', background: 'rgba(220, 38, 38, 0.14)', color: '#ef4444', borderRadius: 7, padding: '5px 10px', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}
                    >
                      Sil
                    </button>
                  </div>
                </>
              )}
            </div>
          ))}
          {kalemTurleri.length === 0 && <div style={{ color: 'var(--ink-soft)', fontSize: 13 }}>Henüz kalem türü eklenmedi.</div>}
        </div>
        <div className="add-row">
          <input placeholder="Yeni kalem türü" value={yeniKalem} onChange={(e) => setYeniKalem(e.target.value)} />
          <button onClick={kalemEkle}>Ekle</button>
        </div>
      </div>
      <div className="card">
        <h2 className="section">Araç Filosu</h2>
        <div style={{ display: 'grid', gap: 8, marginTop: 10 }}>
          {araclar.map((a) => (
            <div key={a.plaka} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', border: '1px solid var(--border)', borderRadius: 9, padding: '8px 12px' }}>
              <div style={{ fontSize: 13 }}>
                <b>{a.plaka}</b> · {[a.marka, a.model].filter(Boolean).join(' ') || 'marka/model yok'} · {a.durum} · {(a.son_km || 0).toLocaleString('tr-TR')} km
              </div>
              <button
                onClick={() => plakaSil(a.plaka, a.durum)}
                style={{ border: 'none', background: 'rgba(220, 38, 38, 0.14)', color: '#ef4444', borderRadius: 7, padding: '5px 10px', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}
              >
                Sil
              </button>
            </div>
          ))}
          {araclar.length === 0 && <div style={{ color: 'var(--ink-soft)', fontSize: 13 }}>Henüz araç eklenmedi.</div>}
        </div>
        <div style={{ display: 'grid', gap: 8, marginTop: 12 }}>
          <input placeholder="Plaka (örn. 34 AB 123)" value={yeniPlaka} onChange={(e) => setYeniPlaka(e.target.value.toLocaleUpperCase('tr-TR'))} style={{ textTransform: 'uppercase' }} />
          <div style={{ display: 'flex', gap: 8 }}>
            <input placeholder="Marka (örn. Ford)" value={yeniMarka} onChange={(e) => setYeniMarka(e.target.value)} />
            <input placeholder="Model (örn. Transit)" value={yeniModel} onChange={(e) => setYeniModel(e.target.value)} />
          </div>
          <input placeholder="Başlangıç km" type="number" value={yeniPlakaKm} onChange={(e) => setYeniPlakaKm(e.target.value)} />
          <label style={{ margin: '2px 0 0' }}>Son muayene tarihi (opsiyonel)</label>
          <input type="date" value={yeniSonMuayene} onChange={(e) => setYeniSonMuayene(e.target.value)} />
          <label style={{ margin: '2px 0 0' }}>Bir sonraki muayene tarihi (Przegląd — opsiyonel)</label>
          <input type="date" value={yeniSonrakiMuayene} onChange={(e) => setYeniSonrakiMuayene(e.target.value)} />
          <label style={{ margin: '2px 0 0' }}>Araç fotoğrafı (opsiyonel)</label>
          <input type="file" accept="image/*" onChange={(e) => setYeniResimDosya(e.target.files?.[0] || null)} />
          <button onClick={plakaEkle} disabled={ekleniyor} style={{ border: 'none', background: 'var(--accent-patron)', color: '#fff', borderRadius: 9, padding: '10px 0', fontWeight: 700, cursor: 'pointer' }}>
            {ekleniyor ? 'Ekleniyor...' : 'Aracı Ekle'}
          </button>
        </div>
      </div>
      <div className="card">
        <h2 className="section">Personel Yönetimi</h2>
        <div style={{ fontSize: 12, color: 'var(--ink-soft)', marginTop: 4, marginBottom: 10 }}>
          Sadece <b>Formen</b> rolündeki kişiler Saha Verisi (masraf) girebilir ve Şantiye Defteri raporu doldurabilir. Personel rolü bu ekranlara erişemez.
        </div>
        <div style={{ display: 'grid', gap: 8 }}>
          {tumPersonel.map((p) => (
            <div key={p.personel_no} style={{ border: '1px solid var(--border)', borderRadius: 9, padding: '8px 12px' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
                <div style={{ fontSize: 13 }}>
                  <b>{p.ad}</b> · {p.personel_no}
                </div>
                <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                  <select
                    value={p.rol}
                    onChange={(e) => rolDegistir(p.personel_no, e.target.value)}
                    style={{ padding: '5px 8px', fontSize: 12, width: 'auto' }}
                  >
                    <option value="personel">Personel</option>
                    <option value="formen">Formen</option>
                  </select>
                  <button
                    onClick={() => personelSil(p.personel_no, p.ad)}
                    style={{ border: 'none', background: 'rgba(220, 38, 38, 0.14)', color: '#ef4444', borderRadius: 7, padding: '5px 10px', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}
                  >
                    Sil
                  </button>
                </div>
              </div>
            </div>
          ))}
          {tumPersonel.length === 0 && <div style={{ color: 'var(--ink-soft)', fontSize: 13 }}>Henüz personel eklenmedi.</div>}
        </div>

        <h2 className="section" style={{ marginTop: 18 }}>Yeni Personel Ekle</h2>
        <label>Personel no</label><input value={ypNo} onChange={(e) => setYpNo(e.target.value)} placeholder="1004" />
        <label>Şifre</label><input value={ypSifre} onChange={(e) => setYpSifre(e.target.value)} placeholder="1234" />
        <label>Ad Soyad</label><input value={ypAd} onChange={(e) => setYpAd(e.target.value)} placeholder="Ad Soyad" />
        <label>Rol</label>
        <select value={ypRol} onChange={(e) => setYpRol(e.target.value)}>
          <option value="personel">Personel</option>
          <option value="formen">Formen</option>
        </select>
        <div style={{ fontSize: 12, color: 'var(--ink-soft)', marginTop: 4 }}>
          Lokasyon burada seçilmiyor — kişi ilk mesai girişinde kendi lokasyonunu seçecek.
        </div>
        <button className="action btn-ai" onClick={personelEkle}>Personel Ekle</button>
        {ypMesaj && <div className={'feedback ' + ypMesaj.tip}>{ypMesaj.metin}</div>}
      </div>
    </div>
  );
}