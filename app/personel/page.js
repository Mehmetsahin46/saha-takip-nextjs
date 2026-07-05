'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';

export default function PersonelPanel() {
  const router = useRouter();
  const [oturum, setOturum] = useState(null);
  const [tab, setTab] = useState('mesai');
  const [saat, setSaat] = useState('');
  const [tarihMetni, setTarihMetni] = useState('');

  useEffect(() => {
    const kayit = localStorage.getItem('aktifOturum');
    if (!kayit) { router.push('/'); return; }
    const parsed = JSON.parse(kayit);
    if (parsed.rol !== 'personel') { router.push('/'); return; }
    setOturum(parsed);
  }, [router]);

  useEffect(() => {
    const tick = () => {
      const now = new Date();
      setSaat(now.toLocaleTimeString('tr-TR'));
      setTarihMetni(now.toLocaleDateString('tr-TR', { weekday: 'long', day: 'numeric', month: 'long' }));
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
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
        <span className="who">Merhaba, <b>{oturum.ad}</b></span>
        <button className="logout" onClick={cikisYapOturum}>Çıkış</button>
      </div>
      <div className="tabbar">
        <button className={tab === 'mesai' ? 'active-personel' : ''} onClick={() => setTab('mesai')}>Mesai</button>
        <button className={tab === 'arac' ? 'active-personel' : ''} onClick={() => setTab('arac')}>Araç</button>
        <button className={tab === 'veri' ? 'active-personel' : ''} onClick={() => setTab('veri')}>Saha Verisi</button>
      </div>
      <div className="content">
        {tab === 'mesai' && <MesaiTab oturum={oturum} saat={saat} tarihMetni={tarihMetni} />}
        {tab === 'arac' && <AracTab oturum={oturum} />}
        {tab === 'veri' && <VeriTab oturum={oturum} />}
      </div>
    </div>
  );
}

/* ---------------- MESAİ ---------------- */
function MesaiTab({ oturum, saat, tarihMetni }) {
  const [acikKayit, setAcikKayit] = useState(null);
  const [yukleniyor, setYukleniyor] = useState(true);
  const [mesaj, setMesaj] = useState(null);

  async function durumYukle() {
    setYukleniyor(true);
    const { data } = await supabase
      .from('giris_cikis')
      .select('*')
      .eq('personel_no', oturum.personel_no)
      .eq('durum', 'Açık')
      .order('giris_saati', { ascending: false })
      .limit(1)
      .maybeSingle();
    setAcikKayit(data || null);
    setYukleniyor(false);
  }

  useEffect(() => { durumYukle(); }, []); // eslint-disable-line

  async function girisYap() {
    setMesaj(null);
    const now = new Date().toISOString();
    const { error } = await supabase.from('giris_cikis').insert({
      personel_no: oturum.personel_no, ad: oturum.ad, giris_saati: now, durum: 'Açık',
    });
    if (error) { setMesaj({ tip: 'err', metin: error.message }); return; }
    setMesaj({ tip: 'ok', metin: 'Giriş kaydedildi: ' + new Date().toLocaleTimeString('tr-TR') });
    durumYukle();
  }

  async function cikisYap() {
    setMesaj(null);
    const now = new Date();
    const girisSaati = new Date(acikKayit.giris_saati);
    const sureSaat = Math.round(((now - girisSaati) / 3600000) * 100) / 100;
    const { error } = await supabase
      .from('giris_cikis')
      .update({ cikis_saati: now.toISOString(), sure_saat: sureSaat, durum: 'Kapalı' })
      .eq('id', acikKayit.id);
    if (error) { setMesaj({ tip: 'err', metin: error.message }); return; }
    setMesaj({ tip: 'ok', metin: 'Çıkış kaydedildi. Süre: ' + sureSaat + ' saat' });
    durumYukle();
  }

  const icerde = !!acikKayit;

  return (
    <>
      <div className="clock">{saat || '--:--:--'}</div>
      <div className="date-label">{tarihMetni}</div>
      <div className="card">
        <h2 className="section">Mesai</h2>
        <div className="loc-badge">
          <div>
            <div className="label">Atanan lokasyon</div>
            <div className="value">{oturum.lokasyon}</div>
          </div>
        </div>
        <div className="status-row">
          <span className={'dot ' + (icerde ? 'icerde' : 'disarda')}></span>
          <span>{yukleniyor ? 'durum kontrol ediliyor' : (oturum.ad + (icerde ? ' şu an içeride' : ' şu an dışarıda'))}</span>
        </div>
        <button
          className={'action btn-punch' + (icerde ? ' cikis' : '')}
          onClick={icerde ? cikisYap : girisYap}
          disabled={yukleniyor}
        >
          {icerde ? 'Çıkış Yap' : 'Giriş Yap'}
        </button>
        {mesaj && <div className={'feedback ' + mesaj.tip}>{mesaj.metin}</div>}
      </div>
    </>
  );
}

/* ---------------- ARAÇ ---------------- */
function AracTab({ oturum }) {
  const [acikKayit, setAcikKayit] = useState(null);
  const [bostaAraclar, setBostaAraclar] = useState([]);
  const [plaka, setPlaka] = useState('');
  const [alisKm, setAlisKm] = useState('');
  const [teslimKm, setTeslimKm] = useState('');
  const [mesaj, setMesaj] = useState(null);
  const [yukleniyor, setYukleniyor] = useState(true);

  async function veriYukle() {
    setYukleniyor(true);
    const { data: acik } = await supabase
      .from('arac_kullanim')
      .select('*')
      .eq('personel_no', oturum.personel_no)
      .eq('durum', 'Açık')
      .maybeSingle();
    setAcikKayit(acik || null);

    if (!acik) {
      const { data: bosta } = await supabase.from('araclar').select('*').eq('durum', 'Boşta');
      setBostaAraclar(bosta || []);
      if (bosta && bosta.length) setPlaka(bosta[0].plaka);
    }
    setYukleniyor(false);
  }

  useEffect(() => { veriYukle(); }, []); // eslint-disable-line

  async function teslimAl() {
    setMesaj(null);
    if (!plaka || !alisKm) { setMesaj({ tip: 'err', metin: 'Plaka ve alış kilometresi gerekli.' }); return; }
    const { error: e1 } = await supabase.from('arac_kullanim').insert({
      personel_no: oturum.personel_no, ad: oturum.ad, plaka, alis_km: Number(alisKm), durum: 'Açık',
    });
    if (e1) { setMesaj({ tip: 'err', metin: e1.message }); return; }
    await supabase.from('araclar').update({ durum: 'Kullanımda' }).eq('plaka', plaka);
    setMesaj({ tip: 'ok', metin: plaka + ' teslim alındı.' });
    setAlisKm('');
    veriYukle();
  }

  async function teslimEt() {
    setMesaj(null);
    const t = Number(teslimKm);
    if (!t || t < acikKayit.alis_km) { setMesaj({ tip: 'err', metin: "Geçerli bir teslim km girin (alış km'den küçük olamaz)." }); return; }
    const katedilen = t - acikKayit.alis_km;
    const { error: e1 } = await supabase
      .from('arac_kullanim')
      .update({ teslim_km: t, katedilen_km: katedilen, durum: 'Kapalı' })
      .eq('id', acikKayit.id);
    if (e1) { setMesaj({ tip: 'err', metin: e1.message }); return; }
    await supabase.from('araclar').update({ durum: 'Boşta' }).eq('plaka', acikKayit.plaka);
    setMesaj({ tip: 'ok', metin: 'Araç teslim edildi. Kat edilen: ' + katedilen.toLocaleString('tr-TR') + ' km' });
    setTeslimKm('');
    veriYukle();
  }

  if (yukleniyor) return <div className="loading-text">Yükleniyor...</div>;

  if (acikKayit) {
    const fark = teslimKm ? Number(teslimKm) - acikKayit.alis_km : null;
    return (
      <div className="card">
        <h2 className="section">Araç Teslim Et</h2>
        <div className="loc-badge">
          <div><div className="label">Kullanımdaki araç</div><div className="value">{acikKayit.plaka}</div></div>
          <div><div className="label">Alış km</div><div className="value">{acikKayit.alis_km.toLocaleString('tr-TR')}</div></div>
        </div>
        <label>Teslim kilometresi</label>
        <input type="number" value={teslimKm} onChange={(e) => setTeslimKm(e.target.value)} placeholder="örn. 84350" />
        {fark > 0 && <div className="km-diff">{fark.toLocaleString('tr-TR')} km</div>}
        <button className="action btn-punch cikis" onClick={teslimEt}>Aracı Teslim Et</button>
        {mesaj && <div className={'feedback ' + mesaj.tip}>{mesaj.metin}</div>}
      </div>
    );
  }

  return (
    <div className="card">
      <h2 className="section">Araç Teslim Al</h2>
      <label>Plaka seç</label>
      <select value={plaka} onChange={(e) => setPlaka(e.target.value)}>
        {bostaAraclar.length === 0 && <option value="">Boşta araç yok</option>}
        {bostaAraclar.map((a) => <option key={a.plaka} value={a.plaka}>{a.plaka}</option>)}
      </select>
      <label>Alış kilometresi</label>
      <input type="number" value={alisKm} onChange={(e) => setAlisKm(e.target.value)} placeholder="örn. 84210" />
      <button className="action btn-punch" onClick={teslimAl} disabled={!bostaAraclar.length}>Aracı Teslim Al</button>
      {mesaj && <div className={'feedback ' + mesaj.tip}>{mesaj.metin}</div>}
    </div>
  );
}

/* ---------------- SAHA VERİSİ ---------------- */
function VeriTab({ oturum }) {
  const [kalemTurleri, setKalemTurleri] = useState([]);
  const [kalemTuru, setKalemTuru] = useState('');
  const [miktar, setMiktar] = useState('');
  const [birimFiyat, setBirimFiyat] = useState('');
  const [aciklama, setAciklama] = useState('');
  const [mesaj, setMesaj] = useState(null);

  useEffect(() => {
    supabase.from('kalem_turleri').select('*').then(({ data }) => setKalemTurleri(data || []));
  }, []);

  const toplam = (Number(miktar) || 0) * (Number(birimFiyat) || 0);

  async function kaydet() {
    setMesaj(null);
    if (!kalemTuru.trim() || !miktar || !birimFiyat) { setMesaj({ tip: 'err', metin: 'Kalem türü, miktar ve birim fiyat gerekli.' }); return; }

    if (!kalemTurleri.find((k) => k.ad === kalemTuru.trim())) {
      await supabase.from('kalem_turleri').insert({ ad: kalemTuru.trim() });
      setKalemTurleri([...kalemTurleri, { ad: kalemTuru.trim() }]);
    }

    const { error } = await supabase.from('saha_verileri').insert({
      personel_no: oturum.personel_no,
      ad: oturum.ad,
      lokasyon: oturum.lokasyon,
      kalem_turu: kalemTuru.trim(),
      miktar: Number(miktar),
      birim_fiyat: Number(birimFiyat),
      toplam: toplam,
      aciklama: aciklama || null,
    });
    if (error) { setMesaj({ tip: 'err', metin: error.message }); return; }
    setMesaj({ tip: 'ok', metin: 'Kaydedildi. Toplam: ' + toplam.toLocaleString('tr-TR') + ' TL' });
    setKalemTuru(''); setMiktar(''); setBirimFiyat(''); setAciklama('');
  }

  return (
    <div className="card">
      <h2 className="section">Saha Verisi Ekle</h2>
      <div style={{ fontSize: 13, color: 'var(--ink-soft)', marginTop: 6 }}>
        Lokasyon otomatik: <b style={{ color: 'var(--ink)' }}>{oturum.lokasyon}</b>
      </div>
      <label>Kalem türü</label>
      <div className="chip-row">
        {kalemTurleri.map((k) => (
          <span key={k.ad} className={'chip' + (kalemTuru === k.ad ? ' sel' : '')} onClick={() => setKalemTuru(k.ad)}>{k.ad}</span>
        ))}
      </div>
      <input style={{ marginTop: 8 }} placeholder="veya yeni kalem türü yazın" value={kalemTuru} onChange={(e) => setKalemTuru(e.target.value)} />
      <label>Miktar</label>
      <input type="number" step="0.01" value={miktar} onChange={(e) => setMiktar(e.target.value)} placeholder="0" />
      <label>Birim fiyat (TL)</label>
      <input type="number" step="0.01" value={birimFiyat} onChange={(e) => setBirimFiyat(e.target.value)} placeholder="0" />
      <div className="total">Toplam: {toplam.toLocaleString('tr-TR')} TL</div>
      <label>Açıklama (opsiyonel)</label>
      <input value={aciklama} onChange={(e) => setAciklama(e.target.value)} placeholder="kısa not" />
      <button className="action btn-secondary" onClick={kaydet}>Kaydet</button>
      {mesaj && <div className={'feedback ' + mesaj.tip}>{mesaj.metin}</div>}
    </div>
  );
}
