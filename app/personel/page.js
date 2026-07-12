// Bu dosya, personel panelinizdeki (örn. app/personel/page.js) TÜM İÇERİĞİN
// yerine geçecek güncellenmiş halidir. Aşağıdaki 4 parça birbirine bağlı
// çalıştığı için hepsini birlikte, olduğu gibi kopyalayın.
//
// ÖNEMLİ: Bu dosyayı kullanmadan önce Supabase'de migration-lokasyon-ekle.sql
// (giris_cikis'e lokasyon sütunu) VE migration-son-km.sql (araclar'a son_km
// sütunu) dosyalarının ikisinin de çalıştırılmış olması gerekiyor.

'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { getInitialTheme, temaUygula, temaDegistir } from '@/lib/theme';
import { konumAl, mesafeMetre } from '@/lib/geo';
import QrOkuyucu from '@/components/QrOkuyucu';

// Ondalık saat değerini (örn. 0.03) "1 dk" veya "1 sa 48 dk" gibi okunabilir metne çevirir.
function sureFormatla(saatOndalik) {
  const toplamDakika = Math.round((Number(saatOndalik) || 0) * 60);
  const saat = Math.floor(toplamDakika / 60);
  const dakika = toplamDakika % 60;
  if (saat === 0) return dakika + ' dk';
  if (dakika === 0) return saat + ' sa';
  return saat + ' sa ' + dakika + ' dk';
}

export default function PersonelPanel() {
  const router = useRouter();
  const [oturum, setOturum] = useState(null);
  const [tab, setTab] = useState('mesai');
  const [saat, setSaat] = useState('');
  const [tarihMetni, setTarihMetni] = useState('');
  const [aktifLokasyon, setAktifLokasyon] = useState(null); // o günkü seçilen lokasyon
  const [tema, setTema] = useState('light');

  useEffect(() => {
    const kayit = localStorage.getItem('aktifOturum');
    if (!kayit) { router.push('/'); return; }
    const parsed = JSON.parse(kayit);
    if (parsed.rol !== 'personel' && parsed.rol !== 'ustabasi') { router.push('/'); return; }
    setOturum(parsed);
  }, [router]);

  useEffect(() => {
    const t = getInitialTheme();
    setTema(t);
    temaUygula(t);
  }, []);

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
        <span className="who">Merhaba, <b>{oturum.ad}</b> {oturum.rol === 'ustabasi' && '(Ustabaşı)'}</span>
        <div>
          <button className="theme-toggle" onClick={() => setTema(temaDegistir(tema))}>{tema === 'dark' ? '☀️' : '🌙'}</button>
          <button className="logout" onClick={cikisYapOturum}>Çıkış</button>
        </div>
      </div>
      <div className="tabbar">
        <button className={tab === 'mesai' ? 'active-personel' : ''} onClick={() => setTab('mesai')}>Mesai</button>
        <button className={tab === 'saatler' ? 'active-personel' : ''} onClick={() => setTab('saatler')}>Çalışma Saatlerim</button>
        <button className={tab === 'gorevler' ? 'active-personel' : ''} onClick={() => setTab('gorevler')}>Görevlerim</button>
        <button className={tab === 'arac' ? 'active-personel' : ''} onClick={() => setTab('arac')}>Araç</button>
        {oturum.rol === 'ustabasi' && (
          <button className={tab === 'veri' ? 'active-personel' : ''} onClick={() => setTab('veri')}>Saha Verisi</button>
        )}
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
        {tab === 'saatler' && <SaatlerimTab oturum={oturum} />}
        {tab === 'gorevler' && <GorevlerimTab oturum={oturum} />}
        {tab === 'arac' && <AracTab oturum={oturum} />}
        {tab === 'veri' && oturum.rol === 'ustabasi' && <VeriTab oturum={oturum} aktifLokasyon={aktifLokasyon} />}
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
  const [ayarlar, setAyarlar] = useState({ konum_dogrulama_aktif: false, qr_dogrulama_aktif: false });

  const [konumDurum, setKonumDurum] = useState('bekliyor'); // bekliyor | kontrol | basarili | basarisiz
  const [konumMesaj, setKonumMesaj] = useState('');
  const [qrDurum, setQrDurum] = useState('bekliyor'); // bekliyor | tariyor | basarili | basarisiz
  const [qrMesaj, setQrMesaj] = useState('');

  useEffect(() => {
    supabase.from('lokasyonlar').select('*').then(({ data }) => {
      setLokasyonlar(data || []);
      if (data && data.length) setSeciliLokasyon(data[0].ad);
    });
    supabase.from('sistem_ayarlari').select('*').eq('id', 1).maybeSingle().then(({ data }) => {
      if (data) setAyarlar(data);
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
    konumSifirla();
  }

  useEffect(() => { durumYukle(); }, []); // eslint-disable-line

  function konumSifirla() {
    setKonumDurum('bekliyor'); setKonumMesaj('');
    setQrDurum('bekliyor'); setQrMesaj('');
  }
  useEffect(() => { konumSifirla(); }, [seciliLokasyon]);

  // Şu an doğrulanması gereken lokasyon: giriş yapılıyorsa seçilen, çıkış yapılıyorsa aktif kayıttaki lokasyon.
  const hedefLokasyon = acikKayit
    ? lokasyonlar.find((l) => l.ad === acikKayit.lokasyon)
    : lokasyonlar.find((l) => l.ad === seciliLokasyon);

  async function konumDogrula() {
    setKonumDurum('kontrol'); setKonumMesaj('');
    if (!hedefLokasyon || hedefLokasyon.enlem == null || hedefLokasyon.boylam == null) {
      setKonumDurum('basarisiz');
      setKonumMesaj('Bu lokasyon için konum bilgisi tanımlanmamış. Patronunuzla iletişime geçin.');
      return;
    }
    try {
      const { lat, lon } = await konumAl();
      const mesafe = mesafeMetre(lat, lon, hedefLokasyon.enlem, hedefLokasyon.boylam);
      const izinliMesafe = hedefLokasyon.yaricap_metre || 150;
      if (mesafe <= izinliMesafe) {
        setKonumDurum('basarili');
        setKonumMesaj('Konum doğrulandı (yaklaşık ' + mesafe + ' m).');
      } else {
        setKonumDurum('basarisiz');
        setKonumMesaj('Sahada değilsiniz. Lokasyona ' + mesafe + ' m uzaktasınız (izin verilen: ' + izinliMesafe + ' m).');
      }
    } catch (err) {
      setKonumDurum('basarisiz');
      setKonumMesaj(err.message);
    }
  }

  function qrOkundu(kod) {
    if (hedefLokasyon && kod === hedefLokasyon.qr_kodu) {
      setQrDurum('basarili');
      setQrMesaj('QR kod doğrulandı.');
    } else {
      setQrDurum('basarisiz');
      setQrMesaj('Bu QR kod bu lokasyona ait değil.');
    }
  }

  const dogrulamaGerekli = ayarlar.konum_dogrulama_aktif || ayarlar.qr_dogrulama_aktif;
  const dogrulamaTamam =
    (!ayarlar.konum_dogrulama_aktif || konumDurum === 'basarili') &&
    (!ayarlar.qr_dogrulama_aktif || qrDurum === 'basarili');

  async function girisYap() {
    setMesaj(null);
    if (!seciliLokasyon) { setMesaj({ tip: 'err', metin: 'Lütfen bugünkü lokasyonunuzu seçin.' }); return; }
    if (dogrulamaGerekli && !dogrulamaTamam) { setMesaj({ tip: 'err', metin: 'Önce konum/QR doğrulamasını tamamlayın.' }); return; }
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
    if (dogrulamaGerekli && !dogrulamaTamam) { setMesaj({ tip: 'err', metin: 'Önce konum/QR doğrulamasını tamamlayın.' }); return; }
    const now = new Date();
    const girisSaati = new Date(acikKayit.giris_saati);
    const hamSure = (now - girisSaati) / 3600000;
    const sureSaat = Math.round(Math.max(hamSure - 1, 0) * 100) / 100; // 1 saatlik mola otomatik düşülür
    const { error } = await supabase
      .from('giris_cikis')
      .update({ cikis_saati: now.toISOString(), sure_saat: sureSaat, durum: 'Kapalı' })
      .eq('id', acikKayit.id);
    if (error) { setMesaj({ tip: 'err', metin: error.message }); return; }
    setMesaj({ tip: 'ok', metin: 'Çıkış kaydedildi. Süre: ' + sureFormatla(sureSaat) + ' (1 saatlik mola düşüldü)' });
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

        {dogrulamaGerekli && !yukleniyor && (
          <div style={{ marginTop: 14, borderTop: '1px solid var(--border)', paddingTop: 12 }}>
            {ayarlar.konum_dogrulama_aktif && (
              <div style={{ marginBottom: 10 }}>
                {konumDurum !== 'basarili' && (
                  <button className="action btn-secondary" onClick={konumDogrula} disabled={konumDurum === 'kontrol'}>
                    {konumDurum === 'kontrol' ? '📍 Konum kontrol ediliyor...' : '📍 Konumu Doğrula'}
                  </button>
                )}
                {konumDurum === 'basarili' && <div className="feedback ok">✅ {konumMesaj}</div>}
                {konumDurum === 'basarisiz' && <div className="feedback err">{konumMesaj}</div>}
              </div>
            )}
            {ayarlar.qr_dogrulama_aktif && (
              <div>
                {qrDurum !== 'basarili' && qrDurum !== 'tariyor' && (
                  <button className="action btn-secondary" onClick={() => setQrDurum('tariyor')}>📷 QR Kodu Okut</button>
                )}
                {qrDurum === 'tariyor' && (
                  <QrOkuyucu
                    onOkundu={qrOkundu}
                    onIptal={(hata) => { setQrDurum('bekliyor'); if (hata) setQrMesaj(hata); }}
                  />
                )}
                {qrDurum === 'basarili' && <div className="feedback ok">✅ {qrMesaj}</div>}
                {qrDurum === 'basarisiz' && <div className="feedback err">{qrMesaj}</div>}
              </div>
            )}
          </div>
        )}

        <button
          className={'action btn-punch' + (icerde ? ' cikis' : '')}
          onClick={icerde ? cikisYap : girisYap}
          disabled={yukleniyor || (!icerde && !lokasyonlar.length) || (dogrulamaGerekli && !dogrulamaTamam)}
        >
          {icerde ? 'Çıkış Yap' : 'Giriş Yap'}
        </button>
        {mesaj && <div className={'feedback ' + mesaj.tip}>{mesaj.metin}</div>}
      </div>
    </>
  );
}

/* ---------------- ÇALIŞMA SAATLERİM (gün/hafta/ay, 1 saat mola dahil) ---------------- */
function SaatlerimTab({ oturum }) {
  const [yukleniyor, setYukleniyor] = useState(true);
  const [bugun, setBugun] = useState(0);
  const [haftalik, setHaftalik] = useState(0);
  const [aylik, setAylik] = useState(0);
  const [gecmis, setGecmis] = useState([]);

  useEffect(() => {
    (async () => {
      setYukleniyor(true);
      const { data } = await supabase
        .from('giris_cikis')
        .select('*')
        .eq('personel_no', oturum.personel_no)
        .eq('durum', 'Kapalı')
        .order('giris_saati', { ascending: false });

      const kayitlar = data || [];
      const now = new Date();
      const bugunBaslangic = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      const haftaBaslangic = new Date(now);
      haftaBaslangic.setDate(now.getDate() - 7);
      const ayBaslangic = new Date(now.getFullYear(), now.getMonth(), 1);

      let g = 0, h = 0, a = 0;
      kayitlar.forEach((k) => {
        const tarih = new Date(k.giris_saati);
        const sure = Number(k.sure_saat) || 0;
        if (tarih >= bugunBaslangic) g += sure;
        if (tarih >= haftaBaslangic) h += sure;
        if (tarih >= ayBaslangic) a += sure;
      });

      setBugun(Math.round(g * 100) / 100);
      setHaftalik(Math.round(h * 100) / 100);
      setAylik(Math.round(a * 100) / 100);
      setGecmis(kayitlar.slice(0, 15));
      setYukleniyor(false);
    })();
  }, [oturum.personel_no]);

  if (yukleniyor) return <div className="loading-text">Yükleniyor...</div>;

  return (
    <>
      <div className="grid cols-3">
        <div className="stat-card"><div className="label">Bugün</div><div className="value">{sureFormatla(bugun)}</div></div>
        <div className="stat-card"><div className="label">Bu hafta</div><div className="value">{sureFormatla(haftalik)}</div></div>
        <div className="stat-card"><div className="label">Bu ay</div><div className="value">{sureFormatla(aylik)}</div></div>
      </div>
      <div className="card" style={{ marginTop: 16 }}>
        <h2 className="section">Son mesai kayıtları</h2>
        <div style={{ fontSize: 12, color: 'var(--ink-soft)', marginBottom: 8 }}>Süreler, her mesaideki 1 saatlik mola düşülerek hesaplanmıştır.</div>
        <table>
          <thead><tr><th>Tarih</th><th>Giriş</th><th>Çıkış</th><th>Süre</th></tr></thead>
          <tbody>
            {gecmis.map((k) => (
              <tr key={k.id}>
                <td>{new Date(k.giris_saati).toLocaleDateString('tr-TR')}</td>
                <td>{new Date(k.giris_saati).toLocaleTimeString('tr-TR')}</td>
                <td>{k.cikis_saati ? new Date(k.cikis_saati).toLocaleTimeString('tr-TR') : '—'}</td>
                <td>{k.sure_saat ? sureFormatla(k.sure_saat) : '—'}</td>
              </tr>
            ))}
            {gecmis.length === 0 && <tr><td colSpan={4}>Henüz tamamlanmış mesai kaydın yok.</td></tr>}
          </tbody>
        </table>
      </div>
    </>
  );
}

/* ---------------- GÖREVLERİM ---------------- */
function GorevlerimTab({ oturum }) {
  const [gorevler, setGorevler] = useState([]);
  const [yukleniyor, setYukleniyor] = useState(true);
  const [durumFiltre, setDurumFiltre] = useState('Tümü');
  const [hedefGorev, setHedefGorev] = useState(null);
  const [fotoYukleniyor, setFotoYukleniyor] = useState(false);
  const dosyaInputRef = useRef(null);

  async function yukle() {
    setYukleniyor(true);
    const { data } = await supabase
      .from('gorevler')
      .select('*')
      .contains('atanan_personel_no', [oturum.personel_no])
      .order('olusturulma_tarihi', { ascending: false });
    setGorevler(data || []);
    setYukleniyor(false);
  }

  useEffect(() => { yukle(); }, [oturum.personel_no]); // eslint-disable-line

  async function durumDegistir(gorev, yeniDurum) {
    await supabase.from('gorevler').update({
      durum: yeniDurum,
      tamamlanma_tarihi: yeniDurum === 'Tamamlandı' ? new Date().toISOString() : null,
    }).eq('id', gorev.id);
    yukle();
  }

  function tamamlamaBaslat(gorev) {
    setHedefGorev(gorev);
    dosyaInputRef.current?.click();
  }

  async function fotoSecildiVeTamamlandi(e) {
    const dosya = e.target.files?.[0];
    e.target.value = '';
    if (!dosya || !hedefGorev) return;
    setFotoYukleniyor(true);
    const dosyaAdi = Date.now() + '-' + dosya.name.replace(/\s+/g, '-');
    const { error: yuklemeHatasi } = await supabase.storage.from('gorev-fotolari').upload(dosyaAdi, dosya);
    if (yuklemeHatasi) {
      alert('Fotoğraf yüklenemedi: ' + yuklemeHatasi.message);
      setFotoYukleniyor(false);
      return;
    }
    const { data: urlData } = supabase.storage.from('gorev-fotolari').getPublicUrl(dosyaAdi);
    await supabase.from('gorevler').update({
      durum: 'Tamamlandı',
      tamamlanma_tarihi: new Date().toISOString(),
      tamamlanma_foto_url: urlData.publicUrl,
    }).eq('id', hedefGorev.id);
    setFotoYukleniyor(false);
    setHedefGorev(null);
    yukle();
  }

  if (yukleniyor) return <div className="loading-text">Yükleniyor...</div>;

  const gosterilenler = durumFiltre === 'Tümü' ? gorevler : gorevler.filter((g) => g.durum === durumFiltre);
  const oncelikRengi = { 'Düşük': '#5B6560', 'Normal': '#E8590C', 'Yüksek': '#A0592A', 'Acil': '#B23B0E' };

  return (
    <div className="card">
      <h2 className="section">Görevlerim</h2>
      <input ref={dosyaInputRef} type="file" accept="image/*" capture="environment" style={{ display: 'none' }} onChange={fotoSecildiVeTamamlandi} />
      <label>Durum filtrele</label>
      <select value={durumFiltre} onChange={(e) => setDurumFiltre(e.target.value)}>
        <option>Tümü</option><option>Bekliyor</option><option>Devam Ediyor</option><option>Tamamlandı</option>
      </select>
      <div style={{ display: 'grid', gap: 8, marginTop: 12 }}>
        {gosterilenler.map((g) => (
          <div key={g.id} style={{ border: '1px solid var(--border)', borderRadius: 9, padding: 10 }}>
            <div style={{ fontWeight: 700, fontSize: 14 }}>{g.baslik}</div>
            <div style={{ fontSize: 12, color: 'var(--ink-soft)', marginTop: 2 }}>{g.lokasyon}</div>
            {g.aciklama && <div style={{ fontSize: 13, marginTop: 6 }}>{g.aciklama}</div>}
            <div style={{ fontSize: 11, marginTop: 6, display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
              <span style={{ fontWeight: 700, color: oncelikRengi[g.oncelik] || 'var(--ink-soft)' }}>{g.oncelik}</span>
              {g.son_tarih && <span style={{ color: 'var(--ink-soft)' }}>Son tarih: {new Date(g.son_tarih).toLocaleDateString('tr-TR')}</span>}
              <span className={'status-tag' + (g.durum === 'Tamamlandı' ? ' open' : '')}>{g.durum}</span>
            </div>
            {g.tamamlanma_foto_url && (
              <a href={g.tamamlanma_foto_url} target="_blank" rel="noreferrer" style={{ display: 'inline-block', marginTop: 8 }}>
                <img src={g.tamamlanma_foto_url} alt="Tamamlanma fotoğrafı" style={{ width: 70, height: 70, objectFit: 'cover', borderRadius: 6 }} />
              </a>
            )}
            <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
              {g.durum === 'Bekliyor' && <button onClick={() => durumDegistir(g, 'Devam Ediyor')} className="action btn-secondary" style={{ width: 'auto', padding: '7px 12px', fontSize: 12, marginTop: 0 }}>Başladım</button>}
              {g.durum !== 'Tamamlandı' && (
                <button
                  onClick={() => tamamlamaBaslat(g)}
                  className="action btn-punch"
                  style={{ width: 'auto', padding: '7px 12px', fontSize: 12, marginTop: 0 }}
                  disabled={fotoYukleniyor && hedefGorev?.id === g.id}
                >
                  {fotoYukleniyor && hedefGorev?.id === g.id ? 'Yükleniyor...' : '📷 Fotoğrafla Tamamla'}
                </button>
              )}
              {g.durum === 'Tamamlandı' && <button onClick={() => durumDegistir(g, 'Devam Ediyor')} className="action btn-secondary" style={{ width: 'auto', padding: '7px 12px', fontSize: 12, marginTop: 0 }}>Geri al</button>}
            </div>
          </div>
        ))}
        {gosterilenler.length === 0 && <div style={{ color: 'var(--ink-soft)', fontSize: 13 }}>Size atanmış görev yok.</div>}
      </div>
    </div>
  );
}

/* ---------------- ARAÇ (km kilitli + gecmis kullanim listesi) ---------------- */
function AracTab({ oturum }) {
  const [acikKayit, setAcikKayit] = useState(null);
  const [bostaAraclar, setBostaAraclar] = useState([]);
  const [tumAraclar, setTumAraclar] = useState([]);
  const [gecmis, setGecmis] = useState([]);
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
      if (bosta && bosta.length) {
        setPlaka(bosta[0].plaka);
        setAlisKm(bosta[0].son_km != null ? String(bosta[0].son_km) : '');
      }
    }

    const { data: hepsi } = await supabase.from('araclar').select('*');
    setTumAraclar(hepsi || []);

    const { data: gecmisVeri } = await supabase
      .from('arac_kullanim')
      .select('*')
      .eq('personel_no', oturum.personel_no)
      .eq('durum', 'Kapalı')
      .order('tarih', { ascending: false })
      .limit(10);
    setGecmis(gecmisVeri || []);

    setYukleniyor(false);
  }

  useEffect(() => { veriYukle(); }, []); // eslint-disable-line

  function plakaDegisti(yeniPlaka) {
    setPlaka(yeniPlaka);
    const arac = bostaAraclar.find((a) => a.plaka === yeniPlaka);
    setAlisKm(arac && arac.son_km != null ? String(arac.son_km) : '');
  }

  async function teslimAl() {
    setMesaj(null);
    if (!plaka || alisKm === '') { setMesaj({ tip: 'err', metin: 'Plaka ve alış kilometresi gerekli.' }); return; }
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
      .update({ teslim_km: t, katedilen_km: katedilen, durum: 'Kapalı', teslim_saati: new Date().toISOString() })
      .eq('id', acikKayit.id);
    if (e1) { setMesaj({ tip: 'err', metin: e1.message }); return; }
    await supabase.from('araclar').update({ durum: 'Boşta', son_km: t }).eq('plaka', acikKayit.plaka);
    setMesaj({ tip: 'ok', metin: 'Araç teslim edildi. Kat edilen: ' + katedilen.toLocaleString('tr-TR') + ' km' });
    setTeslimKm('');
    veriYukle();
  }

  if (yukleniyor) return <div className="loading-text">Yükleniyor...</div>;

  const secilenArac = bostaAraclar.find((a) => a.plaka === plaka);

  return (
    <>
      <div className="card">
        <h2 className="section">Araç Filosu</h2>
        <div className="grid cols-3" style={{ marginTop: 10 }}>
          {tumAraclar.map((a) => {
            const secilebilir = !acikKayit && a.durum === 'Boşta';
            const secili = secilebilir && plaka === a.plaka;
            return (
              <div
                key={a.plaka}
                className="card"
                onClick={secilebilir ? () => plakaDegisti(a.plaka) : undefined}
                style={{
                  padding: 12,
                  marginBottom: 0,
                  cursor: secilebilir ? 'pointer' : 'default',
                  opacity: secilebilir || acikKayit ? 1 : 0.55,
                  border: secili ? '2px solid var(--accent-personel)' : '1px solid var(--border)',
                  transition: 'border-color 0.15s',
                }}
              >
                <div style={{
                  width: '100%', height: 90, borderRadius: 8, background: '#F0F2EE',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', marginBottom: 8,
                }}>
                  {a.resim_url
                    ? <img src={a.resim_url} alt={a.plaka} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                    : <span style={{ fontSize: 28 }}>🚐</span>}
                </div>
                <div style={{ fontWeight: 700, fontSize: 13 }}>{[a.marka, a.model].filter(Boolean).join(' ') || 'Marka/model girilmedi'}</div>
                <div style={{ fontSize: 12, color: 'var(--ink-soft)', marginTop: 2 }}>{a.plaka}</div>
                <div style={{ marginTop: 6, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <span className={'status-tag' + (a.durum === 'Boşta' ? ' open' : '')}>{a.durum}</span>
                  {secili && <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--accent-personel)' }}>✓ Seçili</span>}
                </div>
              </div>
            );
          })}
          {tumAraclar.length === 0 && <div style={{ color: 'var(--ink-soft)', fontSize: 13 }}>Henüz araç eklenmedi.</div>}
        </div>
      </div>

      {acikKayit ? (
        <div className="card">
          <h2 className="section">Araç Teslim Et</h2>
          <div className="loc-badge">
            <div><div className="label">Kullanımdaki araç</div><div className="value">{acikKayit.plaka}</div></div>
            <div><div className="label">Alış km</div><div className="value">{acikKayit.alis_km.toLocaleString('tr-TR')}</div></div>
          </div>
          <div style={{ fontSize: 12, color: 'var(--ink-soft)', marginTop: 8 }}>
            Alış saati: {new Date(acikKayit.tarih).toLocaleTimeString('tr-TR')}
          </div>
          <label>Teslim kilometresi</label>
          <input type="number" value={teslimKm} onChange={(e) => setTeslimKm(e.target.value)} placeholder="örn. 84350" />
          {teslimKm && Number(teslimKm) - acikKayit.alis_km > 0 && (
            <div className="km-diff">{(Number(teslimKm) - acikKayit.alis_km).toLocaleString('tr-TR')} km</div>
          )}
          <button className="action btn-punch cikis" onClick={teslimEt}>Aracı Teslim Et</button>
          {mesaj && <div className={'feedback ' + mesaj.tip}>{mesaj.metin}</div>}
        </div>
      ) : (
        <div className="card">
          <h2 className="section">Araç Teslim Al</h2>
          <label>Plaka seç</label>
          <select value={plaka} onChange={(e) => plakaDegisti(e.target.value)}>
            {bostaAraclar.length === 0 && <option value="">Boşta araç yok</option>}
            {bostaAraclar.map((a) => (
              <option key={a.plaka} value={a.plaka}>
                {a.plaka}{(a.marka || a.model) ? ' · ' + [a.marka, a.model].filter(Boolean).join(' ') : ''}
              </option>
            ))}
          </select>
          <label>Alış kilometresi</label>
          <input type="number" value={alisKm} readOnly disabled style={{ background: '#F0F2EE', color: 'var(--ink-soft)' }} />
          <div style={{ fontSize: 12, color: 'var(--ink-soft)', marginTop: 4 }}>
            Aracın son bilinen kilometresi — değiştirilemez.
          </div>
          <button className="action btn-punch" onClick={teslimAl} disabled={!bostaAraclar.length}>Aracı Teslim Al</button>
          {mesaj && <div className={'feedback ' + mesaj.tip}>{mesaj.metin}</div>}
        </div>
      )}

      <div className="card">
        <h2 className="section">Geçmiş Araç Kullanımlarım</h2>
        {gecmis.length === 0 && <div style={{ color: 'var(--ink-soft)', fontSize: 13 }}>Henüz tamamlanmış araç kullanımın yok.</div>}
        {gecmis.length > 0 && (
          <table>
            <thead><tr><th>Tarih</th><th>Plaka</th><th>Alış saati</th><th>Alış km</th><th>Teslim saati</th><th>Teslim km</th><th>Kat edilen</th></tr></thead>
            <tbody>
              {gecmis.map((g) => (
                <tr key={g.id}>
                  <td>{new Date(g.tarih).toLocaleDateString('tr-TR')}</td>
                  <td>{g.plaka}</td>
                  <td>{new Date(g.tarih).toLocaleTimeString('tr-TR')}</td>
                  <td>{Number(g.alis_km).toLocaleString('tr-TR')}</td>
                  <td>{g.teslim_saati ? new Date(g.teslim_saati).toLocaleTimeString('tr-TR') : '—'}</td>
                  <td>{g.teslim_km ? Number(g.teslim_km).toLocaleString('tr-TR') : '—'}</td>
                  <td>{g.katedilen_km ? Number(g.katedilen_km).toLocaleString('tr-TR') + ' km' : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </>
  );
}

/* ---------------- SAHA VERİSİ ---------------- */
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
      <h2 className="section">Saha Verisi Ekle</h2>

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