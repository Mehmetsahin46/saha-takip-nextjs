// Bu dosya, personel panelinizdeki (app/personel/page.js) TÜM İÇERİĞİN yerine
// geçecek güncellenmiş halidir. Kopyalayıp dosyanın tamamının üzerine yapıştırın.
//
// ÖNEMLİ: Bu dosyayı kullanmadan önce Supabase'de sırasıyla şu SQL dosyalarını
// çalıştırmayı unutmayın: migration-lokasyon-ekle.sql, migration-projeler.sql

'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';

export default function PersonelPanel() {
  const router = useRouter();
  const [oturum, setOturum] = useState(null);
  const [tab, setTab] = useState('mesai');
  const [saat, setSaat] = useState('');
  const [tarihMetni, setTarihMetni] = useState('');
  const [aktifLokasyon, setAktifLokasyon] = useState(null); // o günkü seçilen lokasyon

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
        <button className={tab === 'veri' ? 'active-personel' : ''} onClick={() => setTab('veri')}>Gider</button>
        <button className={tab === 'projeler' ? 'active-personel' : ''} onClick={() => setTab('projeler')}>Projelerim</button>
      </div>
      <div className="content">
        {tab === 'mesai' && (
          <MesaiTab
            oturum={oturum}
            saat={saat}
            tarihMetni={tarihMetni}
            lokasyonAyarlandi={setAktifLokasyon}
          />
        )}
        {tab === 'arac' && <AracTab oturum={oturum} />}
        {tab === 'veri' && <VeriTab oturum={oturum} aktifLokasyon={aktifLokasyon} />}
        {tab === 'projeler' && <ProjelerimTab oturum={oturum} aktifLokasyon={aktifLokasyon} />}
      </div>
    </div>
  );
}

/* ---------------- MESAİ ---------------- */
function MesaiTab({ oturum, saat, tarihMetni, lokasyonAyarlandi }) {
  const [acikKayit, setAcikKayit] = useState(null);
  const [yukleniyor, setYukleniyor] = useState(true);
  const [mesaj, setMesaj] = useState(null);
  const [lokasyonlar, setLokasyonlar] = useState([]);
  const [seciliLokasyon, setSeciliLokasyon] = useState('');

  useEffect(() => {
    supabase.from('lokasyonlar').select('*').then(({ data }) => {
      setLokasyonlar(data || []);
      if (data && data.length) setSeciliLokasyon(data[0].ad);
    });
  }, []);

  async function durumYukle() {
    setYukleniyor(true);
    const { data } = await supabase
      .from('giris_cikis')
      .select('*')
      .eq('personel_no', oturum.personel_no)
      .order('giris_saati', { ascending: false })
      .limit(1)
      .maybeSingle();

    const acikMi = !!(data && data.durum === 'Açık');
    setAcikKayit(acikMi ? data : null);
    lokasyonAyarlandi(data ? data.lokasyon : null);
    setYukleniyor(false);
  }

  useEffect(() => { durumYukle(); }, []); // eslint-disable-line

  async function girisYap() {
    setMesaj(null);
    if (!seciliLokasyon) { setMesaj({ tip: 'err', metin: 'Lütfen bugünkü lokasyonunuzu seçin.' }); return; }
    const now = new Date().toISOString();
    const { error } = await supabase.from('giris_cikis').insert({
      personel_no: oturum.personel_no,
      ad: oturum.ad,
      giris_saati: now,
      durum: 'Açık',
      lokasyon: seciliLokasyon,
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

        {icerde ? (
          <div className="loc-badge">
            <div>
              <div className="label">Bugünkü lokasyon</div>
              <div className="value">{acikKayit.lokasyon || '—'}</div>
            </div>
          </div>
        ) : (
          <>
            <label>Bugün hangi lokasyondasınız?</label>
            <select value={seciliLokasyon} onChange={(e) => setSeciliLokasyon(e.target.value)}>
              {lokasyonlar.length === 0 && <option value="">Henüz lokasyon tanımlı değil</option>}
              {lokasyonlar.map((l) => <option key={l.ad} value={l.ad}>{l.ad}</option>)}
            </select>
          </>
        )}

        <div className="status-row">
          <span className={'dot ' + (icerde ? 'icerde' : 'disarda')}></span>
          <span>{yukleniyor ? 'durum kontrol ediliyor' : (oturum.ad + (icerde ? ' şu an içeride' : ' şu an dışarıda'))}</span>
        </div>
        <button
          className={'action btn-punch' + (icerde ? ' cikis' : '')}
          onClick={icerde ? cikisYap : girisYap}
          disabled={yukleniyor || (!icerde && !lokasyonlar.length)}
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

/* ---------------- GİDER (eski adıyla Saha Verisi) ---------------- */
function VeriTab({ oturum, aktifLokasyon }) {
  const [kalemTurleri, setKalemTurleri] = useState([]);
  const [kalemTuru, setKalemTuru] = useState('');
  const [miktar, setMiktar] = useState('');
  const [birimFiyat, setBirimFiyat] = useState('');
  const [aciklama, setAciklama] = useState('');
  const [mesaj, setMesaj] = useState(null);
  const [taraniyor, setTaraniyor] = useState(false);
  const dosyaInputRef = useRef(null);

  useEffect(() => {
    supabase.from('kalem_turleri').select('*').then(({ data }) => setKalemTurleri(data || []));
  }, []);

  const toplam = (Number(miktar) || 0) * (Number(birimFiyat) || 0);

  async function kaydet(otomatikVeri) {
    if (!aktifLokasyon) {
      setMesaj({ tip: 'err', metin: 'Önce "Mesai" sekmesinden giriş yapıp bugünkü lokasyonunuzu seçmelisiniz.' });
      return;
    }

    const kt = otomatikVeri ? otomatikVeri.kalem_turu : kalemTuru;
    const mk = otomatikVeri ? otomatikVeri.miktar : miktar;
    const bf = otomatikVeri ? otomatikVeri.birim_fiyat : birimFiyat;
    const ak = otomatikVeri ? otomatikVeri.aciklama : aciklama;
    const tp = (Number(mk) || 0) * (Number(bf) || 0);

    setMesaj(null);
    if (!kt || !String(kt).trim() || !mk || !bf) {
      setMesaj({ tip: 'err', metin: 'Kalem türü, miktar ve birim fiyat gerekli.' });
      return;
    }

    if (!kalemTurleri.find((k) => k.ad === String(kt).trim())) {
      await supabase.from('kalem_turleri').insert({ ad: String(kt).trim() });
      setKalemTurleri((onceki) => [...onceki, { ad: String(kt).trim() }]);
    }

    const { error } = await supabase.from('saha_verileri').insert({
      personel_no: oturum.personel_no,
      ad: oturum.ad,
      lokasyon: aktifLokasyon,
      kalem_turu: String(kt).trim(),
      miktar: Number(mk),
      birim_fiyat: Number(bf),
      toplam: tp,
      aciklama: ak || null,
    });
    if (error) { setMesaj({ tip: 'err', metin: error.message }); return; }

    setMesaj({
      tip: 'ok',
      metin: (otomatikVeri ? '📷 Fişten okundu ve kaydedildi. ' : 'Kaydedildi. ') + 'Toplam: ' + tp.toLocaleString('tr-TR') + ' TL',
    });
    setKalemTuru(''); setMiktar(''); setBirimFiyat(''); setAciklama('');
  }

  function kameraAc() {
    dosyaInputRef.current?.click();
  }

  async function fisSecildi(e) {
    const dosya = e.target.files?.[0];
    e.target.value = '';
    if (!dosya) return;
    if (!aktifLokasyon) {
      setMesaj({ tip: 'err', metin: 'Önce "Mesai" sekmesinden giriş yapıp bugünkü lokasyonunuzu seçmelisiniz.' });
      return;
    }

    setMesaj(null);
    setTaraniyor(true);

    try {
      const base64 = await new Promise((resolve, reject) => {
        const okuyucu = new FileReader();
        okuyucu.onload = () => resolve(okuyucu.result);
        okuyucu.onerror = () => reject(new Error('Görsel okunamadı.'));
        okuyucu.readAsDataURL(dosya);
      });

      const yanit = await fetch('/api/fis-oku', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ image: base64, mediaType: dosya.type || 'image/jpeg' }),
      });
      const sonuc = await yanit.json();

      if (!sonuc.basari || !sonuc.veri) {
        setMesaj({ tip: 'err', metin: sonuc.mesaj || 'Fiş okunamadı, lütfen bilgileri elle girin.' });
        return;
      }

      const { kalem_turu, miktar: okunanMiktar, birim_fiyat, aciklama: okunanAciklama } = sonuc.veri;

      setKalemTuru(kalem_turu || '');
      setMiktar(okunanMiktar ?? '');
      setBirimFiyat(birim_fiyat ?? '');
      setAciklama(okunanAciklama || '');

      if (kalem_turu && okunanMiktar && birim_fiyat) {
        await kaydet({ kalem_turu, miktar: okunanMiktar, birim_fiyat, aciklama: okunanAciklama });
      } else {
        setMesaj({ tip: 'err', metin: 'Fişten bazı bilgiler net okunamadı, lütfen kontrol edip Kaydet\'e basın.' });
      }
    } catch (err) {
      setMesaj({ tip: 'err', metin: err.message || 'Fiş taranırken hata oluştu.' });
    } finally {
      setTaraniyor(false);
    }
  }

  return (
    <div className="card">
      <h2 className="section">GİDER</h2>

      {aktifLokasyon ? (
        <div style={{ fontSize: 13, color: 'var(--ink-soft)', marginTop: 6 }}>
          Bugünkü lokasyon: <b style={{ color: 'var(--ink)' }}>{aktifLokasyon}</b>
        </div>
      ) : (
        <div className="feedback err" style={{ marginTop: 6 }}>
          Önce "Mesai" sekmesinden giriş yapıp bugünkü lokasyonunuzu seçin.
        </div>
      )}

      <input
        ref={dosyaInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        style={{ display: 'none' }}
        onChange={fisSecildi}
      />
      <button
        type="button"
        className="action btn-ai"
        style={{ marginTop: 10 }}
        onClick={kameraAc}
        disabled={taraniyor || !aktifLokasyon}
      >
        {taraniyor ? '📷 Fiş okunuyor...' : '📷 Fiş Tara (Kamera)'}
      </button>

      <label style={{ marginTop: 16 }}>Kalem türü</label>
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
      <button className="action btn-secondary" onClick={() => kaydet()} disabled={!aktifLokasyon}>Kaydet</button>
      {mesaj && <div className={'feedback ' + mesaj.tip}>{mesaj.metin}</div>}
    </div>
  );
}

/* ---------------- PROJELERİM ---------------- */
function ProjelerimTab({ oturum, aktifLokasyon }) {
  const [projeler, setProjeler] = useState([]);
  const [seciliProje, setSeciliProje] = useState(null);
  const [notlar, setNotlar] = useState([]);
  const [acikPin, setAcikPin] = useState(null);
  const [mesaj, setMesaj] = useState(null);

  useEffect(() => {
    if (!aktifLokasyon) { setProjeler([]); return; }
    supabase
      .from('projeler')
      .select('*')
      .eq('lokasyon', aktifLokasyon)
      .order('created_at', { ascending: false })
      .then(({ data }) => setProjeler(data || []));
  }, [aktifLokasyon]);

  async function notlariYukle(projeId) {
    const { data } = await supabase.from('proje_notlari').select('*').eq('proje_id', projeId).order('created_at', { ascending: true });
    setNotlar(data || []);
  }

  async function projeSec(p) {
    setSeciliProje(p);
    setAcikPin(null);
    await notlariYukle(p.id);
  }

  async function duzelttim(pin) {
    setMesaj(null);
    const { error } = await supabase
      .from('proje_notlari')
      .update({ durum: 'Çözüldü', cozen: oturum.ad, cozuldu_at: new Date().toISOString() })
      .eq('id', pin.id);
    if (error) { setMesaj({ tip: 'err', metin: error.message }); return; }
    setAcikPin(null);
    notlariYukle(seciliProje.id);
  }

  if (!aktifLokasyon) {
    return (
      <div className="card">
        <h2 className="section">Projelerim</h2>
        <div className="feedback err" style={{ marginTop: 6 }}>
          Önce "Mesai" sekmesinden giriş yapıp bugünkü lokasyonunuzu seçin.
        </div>
      </div>
    );
  }

  if (seciliProje) {
    return (
      <div className="card">
        <style>{`
          @keyframes pinNabiz { 0% { box-shadow: 0 0 0 0 rgba(220,38,38,0.5); } 70% { box-shadow: 0 0 0 12px rgba(220,38,38,0); } 100% { box-shadow: 0 0 0 0 rgba(220,38,38,0); } }
          .proje-pin { position: absolute; width: 22px; height: 22px; border-radius: 50%; transform: translate(-50%, -50%); cursor: pointer; border: 2px solid white; }
          .proje-pin.acik { background: #dc2626; animation: pinNabiz 1.6s infinite; }
          .proje-pin.cozuldu { background: #16a34a; }
        `}</style>
        <button className="action btn-secondary" style={{ marginBottom: 12 }} onClick={() => setSeciliProje(null)}>← Projelere dön</button>
        <h2 className="section">{seciliProje.baslik}</h2>
        <div style={{ position: 'relative', display: 'inline-block', maxWidth: '100%' }}>
          <img src={seciliProje.resim_url} alt={seciliProje.baslik} style={{ maxWidth: '100%', display: 'block', borderRadius: 8 }} />
          {notlar.map((n) => (
            <div
              key={n.id}
              className={'proje-pin ' + (n.durum === 'Açık' ? 'acik' : 'cozuldu')}
              style={{ left: n.x + '%', top: n.y + '%' }}
              onClick={() => setAcikPin(n)}
            />
          ))}
        </div>

        {acikPin && (
          <div className="card" style={{ marginTop: 14 }}>
            <div style={{ fontSize: 13, marginBottom: 8 }}>
              <span className={'status-tag' + (acikPin.durum === 'Açık' ? ' open' : '')}>{acikPin.durum}</span>
            </div>
            <div style={{ marginBottom: 10 }}>{acikPin.aciklama}</div>
            {acikPin.durum === 'Açık' ? (
              <button className="action btn-ai" onClick={() => duzelttim(acikPin)}>Düzelttim</button>
            ) : (
              <div style={{ fontSize: 12, color: 'var(--ink-soft)' }}>{acikPin.cozen} tarafından düzeltildi.</div>
            )}
            <button className="action btn-secondary" style={{ marginTop: 8 }} onClick={() => setAcikPin(null)}>Kapat</button>
          </div>
        )}
        {mesaj && <div className={'feedback ' + mesaj.tip}>{mesaj.metin}</div>}
      </div>
    );
  }

  return (
    <div className="card">
      <h2 className="section">Projelerim</h2>
      {projeler.length === 0 && (
        <div style={{ fontSize: 13, color: 'var(--ink-soft)', marginTop: 8 }}>
          Bu lokasyonda henüz proje eklenmemiş.
        </div>
      )}
      <div style={{ display: 'grid', gap: 10, marginTop: 10 }}>
        {projeler.map((p) => (
          <div key={p.id} className="card" style={{ cursor: 'pointer', padding: 10 }} onClick={() => projeSec(p)}>
            <img src={p.resim_url} alt={p.baslik} style={{ width: '100%', height: 120, objectFit: 'cover', borderRadius: 6 }} />
            <div style={{ marginTop: 6, fontWeight: 600 }}>{p.baslik}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
