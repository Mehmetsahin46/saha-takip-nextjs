'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';

const KM_BIRIM_MALIYET = 5; // TL / km, tahmini yakıt + aşınma

export default function PatronPanel() {
  const router = useRouter();
  const [oturum, setOturum] = useState(null);
  const [tab, setTab] = useState('genel');

  useEffect(() => {
    const kayit = localStorage.getItem('aktifOturum');
    if (!kayit) { router.push('/'); return; }
    const parsed = JSON.parse(kayit);
    if (parsed.rol !== 'patron') { router.push('/'); return; }
    setOturum(parsed);
  }, [router]);

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
        <button className="logout" onClick={cikisYapOturum}>Çıkış</button>
      </div>
      <div className="tabbar">
        <button className={tab === 'genel' ? 'active-patron' : ''} onClick={() => setTab('genel')}>Genel Bakış</button>
        <button className={tab === 'lokasyonlar' ? 'active-patron' : ''} onClick={() => setTab('lokasyonlar')}>Lokasyonlar</button>
        <button className={tab === 'araclar' ? 'active-patron' : ''} onClick={() => setTab('araclar')}>Araçlar</button>
        <button className={tab === 'teklifler' ? 'active-patron' : ''} onClick={() => setTab('teklifler')}>Teklifler</button>
        <button className={tab === 'ayarlar' ? 'active-patron' : ''} onClick={() => setTab('ayarlar')}>Ayarlar</button>
      </div>
      <div className="content">
        {tab === 'genel' && <GenelBakis />}
        {tab === 'lokasyonlar' && <Lokasyonlar />}
        {tab === 'araclar' && <Araclar />}
        {tab === 'teklifler' && <Teklifler />}
        {tab === 'ayarlar' && <Ayarlar />}
      </div>
    </div>
  );
}

/* ---------------- GENEL BAKIŞ ---------------- */
function GenelBakis() {
  const [toplamMaliyet, setToplamMaliyet] = useState(0);
  const [toplamKm, setToplamKm] = useState(0);
  const [lokasyonOzet, setLokasyonOzet] = useState([]);
  const [icerdekiler, setIcerdekiler] = useState([]);
  const [disardakiler, setDisardakiler] = useState([]);

  useEffect(() => {
    (async () => {
      const { data: veriler } = await supabase.from('saha_verileri').select('lokasyon, toplam');
      const { data: araclar } = await supabase.from('arac_kullanim').select('katedilen_km');
      const { data: tumPersonel } = await supabase.from('personel').select('personel_no, ad, lokasyon').eq('rol', 'personel');
      const { data: acikMesailer } = await supabase.from('giris_cikis').select('personel_no, giris_saati').eq('durum', 'Açık');

      const tm = (veriler || []).reduce((a, v) => a + Number(v.toplam), 0);
      setToplamMaliyet(tm);
      setToplamKm((araclar || []).reduce((a, v) => a + (Number(v.katedilen_km) || 0), 0));

      const grup = {};
      (veriler || []).forEach((v) => {
        if (!grup[v.lokasyon]) grup[v.lokasyon] = { adet: 0, toplam: 0 };
        grup[v.lokasyon].adet += 1;
        grup[v.lokasyon].toplam += Number(v.toplam);
      });
      setLokasyonOzet(Object.entries(grup).map(([lokasyon, v]) => ({ lokasyon, ...v })));

      const acikMap = {};
      (acikMesailer || []).forEach((m) => { acikMap[m.personel_no] = m.giris_saati; });
      const icerde = [];
      const disarda = [];
      (tumPersonel || []).forEach((p) => {
        if (acikMap[p.personel_no]) icerde.push({ ...p, girisSaati: acikMap[p.personel_no] });
        else disarda.push(p);
      });
      setIcerdekiler(icerde);
      setDisardakiler(disarda);
    })();
  }, []);

  return (
    <>
      <div className="grid cols-3">
        <div className="stat-card"><div className="label">Toplam maliyet</div><div className="value">{toplamMaliyet.toLocaleString('tr-TR')} TL</div></div>
        <div className="stat-card"><div className="label">Şu an içeride</div><div className="value">{icerdekiler.length} kişi</div></div>
        <div className="stat-card"><div className="label">Toplam kat edilen km</div><div className="value">{toplamKm.toLocaleString('tr-TR')} km</div></div>
      </div>

      <div className="grid cols-2" style={{ marginTop: 16 }}>
        <div className="card">
          <h2 className="section">İçeride olanlar</h2>
          {icerdekiler.length === 0 && <div style={{ color: 'var(--ink-soft)', fontSize: 13 }}>Şu an içeride kimse yok.</div>}
          {icerdekiler.map((p) => (
            <div key={p.personel_no} style={{ borderBottom: '1px solid var(--border)', padding: '9px 0', fontSize: 13, display: 'flex', justifyContent: 'space-between' }}>
              <span><span className="dot icerde" style={{ marginRight: 8 }}></span>{p.ad} · {p.lokasyon}</span>
              <span style={{ color: 'var(--ink-soft)' }}>{new Date(p.girisSaati).toLocaleTimeString('tr-TR')}&apos;den beri</span>
            </div>
          ))}
        </div>
        <div className="card">
          <h2 className="section">Dışarıda / çalışmayanlar</h2>
          {disardakiler.length === 0 && <div style={{ color: 'var(--ink-soft)', fontSize: 13 }}>Herkes içeride.</div>}
          {disardakiler.map((p) => (
            <div key={p.personel_no} style={{ borderBottom: '1px solid var(--border)', padding: '9px 0', fontSize: 13 }}>
              <span className="dot disarda" style={{ marginRight: 8 }}></span>{p.ad} · {p.lokasyon}
            </div>
          ))}
        </div>
      </div>

      <div className="card" style={{ marginTop: 16 }}>
        <h2 className="section">Lokasyon bazlı maliyet</h2>
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
      <table>
        <thead><tr><th>Kalem</th><th>Miktar</th><th>Birim</th><th>Toplam</th><th>Açıklama</th></tr></thead>
        <tbody>
          {kalemler.map((k) => (
            <tr key={k.id}>
              <td>{k.kalem_turu}</td><td>{k.miktar}</td><td>{k.birim_fiyat} TL</td><td>{Number(k.toplam).toLocaleString('tr-TR')} TL</td>
              <td style={{ color: 'var(--ink-soft)' }}>{k.aciklama || '—'}</td>
            </tr>
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
  const [kayitlar, setKayitlar] = useState([]);

  useEffect(() => {
    supabase.from('arac_kullanim').select('*').order('tarih', { ascending: false }).then(({ data }) => setKayitlar(data || []));
  }, []);

  const toplamKm = kayitlar.reduce((a, k) => a + (Number(k.katedilen_km) || 0), 0);

  return (
    <div className="card">
      <div className="grid cols-2">
        <div className="stat-card"><div className="label">Toplam kat edilen km</div><div className="value">{toplamKm.toLocaleString('tr-TR')} km</div></div>
        <div className="stat-card"><div className="label">Tahmini araç maliyeti</div><div className="value">{(toplamKm * KM_BIRIM_MALIYET).toLocaleString('tr-TR')} TL</div></div>
      </div>
      <h2 className="section" style={{ marginTop: 18 }}>Araç kullanım geçmişi</h2>
      <table>
        <thead>
          <tr>
            <th>Tarih</th><th>Personel</th><th>Plaka</th>
            <th>Alış saati</th><th>Alış km</th>
            <th>Teslim saati</th><th>Teslim km</th>
            <th>Kat edilen</th><th>Durum</th>
          </tr>
        </thead>
        <tbody>
          {kayitlar.map((k) => (
            <tr key={k.id}>
              <td>{new Date(k.tarih).toLocaleDateString('tr-TR')}</td>
              <td>{k.ad}</td>
              <td>{k.plaka}</td>
              <td>{new Date(k.tarih).toLocaleTimeString('tr-TR')}</td>
              <td>{Number(k.alis_km).toLocaleString('tr-TR')}</td>
              <td>{k.teslim_saati ? new Date(k.teslim_saati).toLocaleTimeString('tr-TR') : '—'}</td>
              <td>{k.teslim_km ? Number(k.teslim_km).toLocaleString('tr-TR') : '—'}</td>
              <td>{k.katedilen_km ? Number(k.katedilen_km).toLocaleString('tr-TR') + ' km' : '—'}</td>
              <td><span className={'status-tag' + (k.durum === 'Açık' ? ' open' : '')}>{k.durum}</span></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/* ---------------- TEKLİFLER ---------------- */
function Teklifler() {
  const [teklifler, setTeklifler] = useState([]);

  useEffect(() => {
    supabase.from('teklifler').select('*').order('tarih', { ascending: false }).then(({ data }) => setTeklifler(data || []));
  }, []);

  return (
    <div className="card">
      <h2 className="section">Geçmiş Teklifler</h2>
      {teklifler.length === 0 && <div style={{ color: 'var(--ink-soft)', fontSize: 13 }}>Henüz teklif oluşturulmadı.</div>}
      {teklifler.map((t) => (
        <div key={t.id} style={{ borderBottom: '1px solid var(--border)', padding: '10px 0', fontSize: 13 }}>
          {new Date(t.tarih).toLocaleString('tr-TR')} · {t.lokasyon} · {Number(t.toplam_maliyet).toLocaleString('tr-TR')} TL{' '}
          <span className="status-tag">{t.durum}</span>
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
  const [ypNo, setYpNo] = useState('');
  const [ypSifre, setYpSifre] = useState('');
  const [ypAd, setYpAd] = useState('');
  const [ypLokasyon, setYpLokasyon] = useState('');
  const [ypMesaj, setYpMesaj] = useState(null);

  async function hepsiniYukle() {
    const { data: l } = await supabase.from('lokasyonlar').select('*');
    const { data: k } = await supabase.from('kalem_turleri').select('*');
    const { data: a } = await supabase.from('araclar').select('*');
    setLokasyonlar(l || []);
    setKalemTurleri(k || []);
    setAraclar(a || []);
    if (l && l.length) setYpLokasyon(l[0].ad);
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
    await supabase.from('araclar').insert({ plaka: yeniPlaka.trim(), durum: 'Boşta' });
    setYeniPlaka('');
    hepsiniYukle();
  }
  async function personelEkle() {
    setYpMesaj(null);
    if (!ypNo.trim() || !ypSifre.trim() || !ypAd.trim()) { setYpMesaj({ tip: 'err', metin: 'Tüm alanları doldurun.' }); return; }
    const { error } = await supabase.from('personel').insert({
      personel_no: ypNo.trim(), sifre: ypSifre.trim(), ad: ypAd.trim(), lokasyon: ypLokasyon, rol: 'personel',
    });
    if (error) { setYpMesaj({ tip: 'err', metin: error.message }); return; }
    setYpMesaj({ tip: 'ok', metin: ypAd + ' eklendi (' + ypNo + ').' });
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
        <h2 className="section">Araçlar</h2>
        <div className="tag-list">{araclar.map((a) => <span key={a.plaka} className="tag-pill">{a.plaka} · {a.durum}</span>)}</div>
        <div className="add-row">
          <input placeholder="Yeni plaka (örn. 34 AB 123)" value={yeniPlaka} onChange={(e) => setYeniPlaka(e.target.value)} />
          <button onClick={plakaEkle}>Ekle</button>
        </div>
      </div>
      <div className="card">
        <h2 className="section">Yeni Personel</h2>
        <label>Personel no</label><input value={ypNo} onChange={(e) => setYpNo(e.target.value)} placeholder="1004" />
        <label>Şifre</label><input value={ypSifre} onChange={(e) => setYpSifre(e.target.value)} placeholder="1234" />
        <label>Ad Soyad</label><input value={ypAd} onChange={(e) => setYpAd(e.target.value)} placeholder="Ad Soyad" />
        <label>Lokasyon</label>
        <select value={ypLokasyon} onChange={(e) => setYpLokasyon(e.target.value)}>
          {lokasyonlar.map((l) => <option key={l.ad} value={l.ad}>{l.ad}</option>)}
        </select>
        <button className="action btn-ai" onClick={personelEkle}>Personel Ekle</button>
        {ypMesaj && <div className={'feedback ' + ypMesaj.tip}>{ypMesaj.metin}</div>}
      </div>
    </div>
  );
}
