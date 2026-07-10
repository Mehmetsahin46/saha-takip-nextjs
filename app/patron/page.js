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

  useEffect(() => {
    (async () => {
      const { data: veriler } = await supabase.from('saha_verileri').select('lokasyon, toplam');
      const { count: acikSayisi } = await supabase.from('giris_cikis').select('*', { count: 'exact', head: true }).eq('durum', 'Açık');
      const { data: araclar } = await supabase.from('arac_kullanim').select('katedilen_km');

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
        <thead><tr><th>Tarih</th><th>Personel</th><th>Plaka</th><th>Alış km</th><th>Teslim km</th><th>Kat edilen</th><th>Durum</th></tr></thead>
        <tbody>
          {kayitlar.map((k) => (
            <tr key={k.id}>
              <td>{new Date(k.tarih).toLocaleDateString('tr-TR')}</td>
              <td>{k.ad}</td>
              <td>{k.plaka}</td>
              <td>{Number(k.alis_km).toLocaleString('tr-TR')}</td>
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
    await supabase.from('araclar').insert({ plaka: yeniPlaka.trim(), durum: 'Boşta' });
    setYeniPlaka('');
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
        <div style={{ fontSize: 12, color: 'var(--ink-soft)', marginTop: 4 }}>
          Lokasyon burada seçilmiyor — işçi ilk mesai girişinde kendi lokasyonunu seçecek.
        </div>
        <button className="action btn-ai" onClick={personelEkle}>Personel Ekle</button>
        {ypMesaj && <div className={'feedback ' + ypMesaj.tip}>{ypMesaj.metin}</div>}
      </div>
    </div>
  );
}
