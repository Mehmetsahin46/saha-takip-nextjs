'use client';

import { useEffect, useState } from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, LineChart, Line } from 'recharts';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { getInitialTheme, temaUygula, temaDegistir } from '@/lib/theme';
import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';

const KM_BIRIM_MALIYET = 5; // TL / km, tahmini yakıt + aşınma

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
  doc.text('Toplam Maliyet: ' + Number(teklif.toplam_maliyet).toLocaleString('tr-TR') + ' TL', 14, 40);
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
        <div>
          <button className="theme-toggle" onClick={() => setTema(temaDegistir(tema))}>{tema === 'dark' ? '☀️' : '🌙'}</button>
          <button className="logout" onClick={cikisYapOturum}>Çıkış</button>
        </div>
      </div>
      <div className="tabbar">
        <button className={tab === 'genel' ? 'active-patron' : ''} onClick={() => setTab('genel')}>Genel Bakış</button>
        <button className={tab === 'lokasyonlar' ? 'active-patron' : ''} onClick={() => setTab('lokasyonlar')}>Lokasyonlar</button>
        <button className={tab === 'araclar' ? 'active-patron' : ''} onClick={() => setTab('araclar')}>Araç Filosu</button>
        <button className={tab === 'projeler' ? 'active-patron' : ''} onClick={() => setTab('projeler')}>Projeler</button>
        <button className={tab === 'teklifler' ? 'active-patron' : ''} onClick={() => setTab('teklifler')}>Teklifler</button>
        <button className={tab === 'ayarlar' ? 'active-patron' : ''} onClick={() => setTab('ayarlar')}>Ayarlar</button>
      </div>
      <div className="content">
        {tab === 'genel' && <GenelBakis />}
        {tab === 'lokasyonlar' && <Lokasyonlar />}
        {tab === 'araclar' && <Araclar />}
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

  useEffect(() => {
    (async () => {
      const { data: veriler } = await supabase.from('saha_verileri').select('lokasyon, toplam');
      const { count: acikSayisi } = await supabase.from('giris_cikis').select('*', { count: 'exact', head: true }).eq('durum', 'Açık');
      const { data: araclar } = await supabase.from('arac_kullanim').select('katedilen_km');
      const { data: mesailer } = await supabase.from('giris_cikis').select('*').eq('durum', 'Kapalı');

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

  return (
    <>
      <div className="grid cols-3">
        <div className="stat-card"><div className="label">Toplam maliyet</div><div className="value">{toplamMaliyet.toLocaleString('tr-TR')} TL</div></div>
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
                <Tooltip formatter={(v) => v.toLocaleString('tr-TR') + ' TL'} contentStyle={{ background: 'var(--card)', border: '1px solid var(--border)', fontSize: 12 }} />
                <Bar dataKey="toplam" fill="var(--accent-patron)" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
        <table>
          <thead><tr><th>Lokasyon</th><th>Kalem</th><th>Toplam</th></tr></thead>
          <tbody>
            {lokasyonOzet.map((l) => (
              <tr key={l.lokasyon}><td>{l.lokasyon}</td><td>{l.adet}</td><td>{l.toplam.toLocaleString('tr-TR')} TL</td></tr>
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
      <div className="summary-total">{toplam.toLocaleString('tr-TR')} TL</div>
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
            <tr key={k.id}><td>{k.kalem_turu}</td><td>{k.miktar}</td><td>{k.birim_fiyat} TL</td><td>{Number(k.toplam).toLocaleString('tr-TR')} TL</td></tr>
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

  useEffect(() => {
    supabase.from('araclar').select('*').then(({ data }) => setAraclar(data || []));
    supabase.from('arac_kullanim').select('*').order('tarih', { ascending: false }).then(({ data }) => setKayitlar(data || []));
  }, []);

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
                  width: '100%', height: 110, borderRadius: 8, background: '#F0F2EE',
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
              </div>
            );
          })}
          {araclar.length === 0 && <div style={{ color: 'var(--ink-soft)', fontSize: 13 }}>Henüz araç eklenmedi.</div>}
        </div>
      </div>

      <div className="card" onClick={(e) => e.stopPropagation()}>
        <div className="grid cols-2">
          <div className="stat-card"><div className="label">Toplam kat edilen km</div><div className="value">{toplamKm.toLocaleString('tr-TR')} km</div></div>
          <div className="stat-card"><div className="label">Tahmini araç maliyeti</div><div className="value">{(toplamKm * KM_BIRIM_MALIYET).toLocaleString('tr-TR')} TL</div></div>
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
            {new Date(t.tarih).toLocaleString('tr-TR')} · {t.lokasyon} · {Number(t.toplam_maliyet).toLocaleString('tr-TR')} TL{' '}
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
  const [yeniKalem, setYeniKalem] = useState('');
  const [yeniPlaka, setYeniPlaka] = useState('');
  const [yeniPlakaKm, setYeniPlakaKm] = useState('');
  const [yeniMarka, setYeniMarka] = useState('');
  const [yeniModel, setYeniModel] = useState('');
  const [yeniResimDosya, setYeniResimDosya] = useState(null);
  const [ekleniyor, setEkleniyor] = useState(false);
  const [ypNo, setYpNo] = useState('');
  const [ypSifre, setYpSifre] = useState('');
  const [ypAd, setYpAd] = useState('');
  const [ypMesaj, setYpMesaj] = useState(null);

  async function hepsiniYukle() {
    const { data: l } = await supabase.from('lokasyonlar').select('*');
    const { data: k } = await supabase.from('kalem_turleri').select('*');
    const { data: a } = await supabase.from('araclar').select('*');
    setLokasyonlar(l || []);
    setKalemTurleri(k || []);
    setAraclar(a || []);
  }

  useEffect(() => { hepsiniYukle(); }, []);

  async function lokasyonEkle() {
    if (!yeniLokasyon.trim()) return;
    await supabase.from('lokasyonlar').insert({ ad: yeniLokasyon.trim() });
    setYeniLokasyon('');
    hepsiniYukle();
  }
  async function kalemEkle() {
    if (!yeniKalem.trim()) return;
    await supabase.from('kalem_turleri').insert({ ad: yeniKalem.trim() });
    setYeniKalem('');
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
    });
    setYeniPlaka(''); setYeniPlakaKm(''); setYeniMarka(''); setYeniModel(''); setYeniResimDosya(null);
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
      personel_no: ypNo.trim(), sifre: ypSifre.trim(), ad: ypAd.trim(), rol: 'personel',
    });
    if (error) { setYpMesaj({ tip: 'err', metin: error.message }); return; }
    setYpMesaj({ tip: 'ok', metin: ypAd + ' eklendi (' + ypNo + '). Lokasyonunu her gün kendisi giriş yaparken seçecek.' });
    setYpNo(''); setYpSifre(''); setYpAd('');
  }

  return (
    <div className="grid cols-2">
      <div className="card">
        <h2 className="section">Lokasyonlar</h2>
        <div className="tag-list">{lokasyonlar.map((l) => <span key={l.ad} className="tag-pill">{l.ad}</span>)}</div>
        <div className="add-row">
          <input placeholder="Yeni lokasyon adı" value={yeniLokasyon} onChange={(e) => setYeniLokasyon(e.target.value)} />
          <button onClick={lokasyonEkle}>Ekle</button>
        </div>
      </div>
      <div className="card">
        <h2 className="section">Kalem Türleri</h2>
        <div className="tag-list">{kalemTurleri.map((k) => <span key={k.ad} className="tag-pill">{k.ad}</span>)}</div>
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
                style={{ border: 'none', background: '#FBE9E2', color: '#B23B0E', borderRadius: 7, padding: '5px 10px', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}
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
          <label style={{ margin: '2px 0 0' }}>Araç fotoğrafı (opsiyonel)</label>
          <input type="file" accept="image/*" onChange={(e) => setYeniResimDosya(e.target.files?.[0] || null)} />
          <button onClick={plakaEkle} disabled={ekleniyor} style={{ border: 'none', background: 'var(--accent-patron)', color: '#fff', borderRadius: 9, padding: '10px 0', fontWeight: 700, cursor: 'pointer' }}>
            {ekleniyor ? 'Ekleniyor...' : 'Aracı Ekle'}
          </button>
        </div>
      </div>
      <div className="card">
        <h2 className="section">Yeni Personel</h2>
        <label>Personel no</label><input value={ypNo} onChange={(e) => setYpNo(e.target.value)} placeholder="1004" />
        <label>Şifre</label><input value={ypSifre} onChange={(e) => setYpSifre(e.target.value)} placeholder="1234" />
        <label>Ad Soyad</label><input value={ypAd} onChange={(e) => setYpAd(e.target.value)} placeholder="Ad Soyad" />
        <div style={{ fontSize: 12, color: 'var(--ink-soft)', marginTop: 4 }}>
          Lokasyon burada seçilmiyor — işçi ilk mesai girişinde kendi lokasyonunu seçecek.
        </div>
        <button className="action btn-ai" onClick={personelEkle}>Personel Ekle</button>
        {ypMesaj && <div className={'feedback ' + ypMesaj.tip}>{ypMesaj.metin}</div>}
      </div>
    </div>
  );
}