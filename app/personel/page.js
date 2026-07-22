'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { getInitialTheme, temaUygula, temaDegistir } from '@/lib/theme';
import { konumAl, mesafeMetre } from '@/lib/geo';
import QrOkuyucu from '@/components/QrOkuyucu';

function sureFormatla(saatOndalik) {
  const toplamDakika = Math.round((Number(saatOndalik) || 0) * 60);
  const saat = Math.floor(toplamDakika / 60);
  const dakika = toplamDakika % 60;
  if (saat === 0) return dakika + ' dk';
  if (dakika === 0) return saat + ' sa';
  return saat + ' sa ' + dakika + ' dk';
}

function formatPLN(deger) {
  return new Intl.NumberFormat('pl-PL', { style: 'currency', currency: 'PLN' }).format(Number(deger) || 0);
}

export default function PersonelPanel() {
  const router = useRouter();
  const [oturum, setOturum] = useState(null);
  const [tab, setTab] = useState('mesai');
  const [saat, setSaat] = useState('');
  const [tarihMetni, setTarihMetni] = useState('');
  const [aktifLokasyon, setAktifLokasyon] = useState(null);
  const [tema, setTema] = useState('light');
  
  const [aktifGorevSayisi, setAktifGorevSayisi] = useState(0);
  const [bildirimler, setBildirimler] = useState([]); 
  const [bildirimKutusuAcik, setBildirimKutusuAcik] = useState(false);

  useEffect(() => {
    const kayit = localStorage.getItem('aktifOturum');
    if (!kayit) { router.push('/'); return; }
    const parsed = JSON.parse(kayit);
    if (parsed.rol !== 'personel' && parsed.rol !== 'formen') { router.push('/'); return; }
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

  const bildirimleriYukle = useCallback(async () => {
    if (!oturum) return;
    const { data } = await supabase
      .from('gorevler')
      .select('*')
      .contains('atanan_personel_no', [oturum.personel_no])
      .neq('durum', 'Tamamlandı')
      .order('olusturulma_tarihi', { ascending: false });
    
    setBildirimler(data || []);
    setAktifGorevSayisi(data ? data.length : 0);
  }, [oturum]);

  useEffect(() => {
    if (oturum) bildirimleriYukle();
  }, [oturum, bildirimleriYukle]);

  useEffect(() => {
    if (!oturum) return;
    if (typeof Notification !== 'undefined' && Notification.permission === 'default') {
      Notification.requestPermission();
    }
    const kanal = supabase
      .channel('global-gorev-takip-' + oturum.personel_no)
      .on('postgres_changes',
        { event: '*', schema: 'public', table: 'gorevler' }, 
        (payload) => {
          bildirimleriYukle();
          if (payload.eventType === 'INSERT') {
            const yeni = payload.new;
            if (Array.isArray(yeni.atanan_personel_no) && yeni.atanan_personel_no.includes(oturum.personel_no)) {
              if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
                new Notification('📋 Yeni Görev Atandı!', {
                  body: yeni.baslik + (yeni.lokasyon ? ' — ' + yeni.lokasyon : ''),
                  icon: '/favicon.ico',
                });
              }
            }
          }
        }
      )
      .subscribe();

    return () => { supabase.removeChannel(kanal); };
  }, [oturum, bildirimleriYukle]);

  function cikisYapOturum() {
    localStorage.removeItem('aktifOturum');
    router.push('/');
  }

  if (!oturum) return null;

  return (
    <div>
      <div className="app-header" style={{ position: 'relative' }}>
        <span className="brand">Saha Takip</span>
        <span className="who">Merhaba, <b>{oturum.ad}</b> {oturum.rol === 'formen' && '(Formen)'}</span>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', position: 'relative' }}>
          
          <div style={{ position: 'relative' }}>
            <button 
              className="theme-toggle" 
              onClick={() => setBildirimKutusuAcik(!bildirimKutusuAcik)}
              style={{ position: 'relative', fontSize: '16px', cursor: 'pointer' }}
            >
              🔔
              {aktifGorevSayisi > 0 && (
                <span style={{
                  position: 'absolute', top: '-4px', right: '-4px', background: '#D32F2F', color: '#fff',
                  borderRadius: '50%', width: '16px', height: '16px', fontSize: '10px',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 'bold', lineHeight: 1
                }}>
                  {aktifGorevSayisi}
                </span>
              )}
            </button>

            {bildirimKutusuAcik && (
              <div style={{
                position: 'absolute', top: '40px', right: '0', background: 'var(--card)',
                border: '1px solid var(--border)', borderRadius: '8px', boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
                width: '290px', maxHeight: '350px', overflowY: 'auto', zIndex: 9999, padding: '12px'
              }}>
                <div style={{ 
                  fontWeight: 'bold', borderBottom: '1px solid var(--border)', paddingBottom: '8px', 
                  marginBottom: '8px', fontSize: '13px', display: 'flex', justifyContent: 'space-between', color: 'var(--ink)'
                }}>
                  <span>Üzerimdeki Görevler ({aktifGorevSayisi})</span>
                  <span style={{ cursor: 'pointer', color: 'var(--ink-soft)' }} onClick={() => setBildirimKutusuAcik(false)}>✕</span>
                </div>
                
                {bildirimler.length === 0 ? (
                  <div style={{ padding: '15px 0', color: 'var(--ink-soft)', fontSize: '12px', textAlign: 'center' }}>
                    Aktif veya bekleyen göreviniz yok.
                  </div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                    {bildirimler.map(b => (
                      <div 
                        key={b.id} 
                        onClick={() => { setTab('gorevler'); setBildirimKutusuAcik(false); }}
                        style={{ 
                          padding: '8px', borderBottom: '1px solid var(--border)', cursor: 'pointer', 
                          borderRadius: '6px', backgroundColor: 'var(--bg-soft)', textAlign: 'left'
                        }}
                      >
                        <div style={{ fontWeight: '600', fontSize: '12px', color: 'var(--ink)' }}>{b.baslik}</div>
                        <div style={{ fontSize: '11px', color: 'var(--ink-soft)', marginTop: '2px' }}>📍 {b.lokasyon || 'Lokasyon yok'}</div>
                        <div style={{ fontSize: '10px', marginTop: '4px', fontWeight: 'bold', color: b.durum === 'Bekliyor' ? '#E8590C' : '#2B5876' }}>
                          ➔ {b.durum}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          <button className="theme-toggle" onClick={() => setTema(temaDegistir(tema))}>{tema === 'dark' ? '☀️' : '🌙'}</button>
          <button className="logout" onClick={cikisYapOturum}>Çıkış</button>
        </div>
      </div>
      
      <div className="tabbar">
        <button className={tab === 'mesai' ? 'active-personel' : ''} onClick={() => setTab('mesai')}>Mesai</button>
        <button className={tab === 'saatler' ? 'active-personel' : ''} onClick={() => setTab('saatler')}>Çalışma Saatlerim</button>
        <button 
          className={tab === 'gorevler' ? 'active-personel' : ''} 
          onClick={() => setTab('gorevler')}
          style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}
        >
          Görevlerim
          {aktifGorevSayisi > 0 && (
            <span style={{ background: '#D32F2F', color: '#fff', borderRadius: '10px', padding: '2px 7px', fontSize: '11px', fontWeight: 'bold', lineHeight: 1 }}>
              {aktifGorevSayisi}
            </span>
          )}
        </button>
        <button className={tab === 'arac' ? 'active-personel' : ''} onClick={() => setTab('arac')}>Araç</button>
        {oturum.rol === 'formen' && (
          <button className={tab === 'veri' ? 'active-personel' : ''} onClick={() => setTab('veri')}>Saha Verisi</button>
        )}
        {oturum.rol === 'formen' && (
          <button className={tab === 'defter' ? 'active-personel' : ''} onClick={() => setTab('defter')}>📋 Şantiye Defteri</button>
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
        {tab === 'gorevler' && <GorevlerimTab oturum={oturum} onGorevDurumDegisti={bildirimleriYukle} />}
        {tab === 'arac' && <AracTab oturum={oturum} />}
        {tab === 'veri' && oturum.rol === 'formen' && <VeriTab oturum={oturum} aktifLokasyon={aktifLokasyon} />}
        {tab === 'defter' && oturum.rol === 'formen' && <SantiyeDefteriTab oturum={oturum} />}
      </div>
    </div>
  );
}

/* ---------------- MESAİ TAB ---------------- */
function MesaiTab({ oturum, saat, tarihMetni, lokasyonAyarlandi }) {
  const [acikKayit, setAcikKayit] = useState(null);
  const [yukleniyor, setYukleniyor] = useState(true);
  const [mesaj, setMesaj] = useState(null);
  const [lokasyonlar, setLokasyonlar] = useState([]);
  const [seciliLokasyon, setSeciliLokasyon] = useState('');
  const [ayarlar, setAyarlar] = useState({ konum_dogrulama_aktif: false, qr_dogrulama_aktif: false });

  const [konumDurum, setKonumDurum] = useState('bekliyor'); 
  const [konumMesaj, setKonumMesaj] = useState('');
  const [qrDurum, setQrDurum] = useState('bekliyor'); 
  const [qrMesaj, setQrMesaj] = useState('');

  useEffect(() => {
    Promise.all([
      supabase.from('lokasyonlar').select('*'),
      supabase.from('sistem_ayarlari').select('*').eq('id', 1).maybeSingle()
    ]).then(([lokRes, ayarRes]) => {
      const lokData = lokRes.data || [];
      const ayarData = ayarRes.data || { konum_dogrulama_aktif: false, qr_dogrulama_aktif: false };
      
      setLokasyonlar(lokData);
      setAyarlar(ayarData);
      
      if (lokData.length > 0 && !ayarData.qr_dogrulama_aktif) {
        setSeciliLokasyon(lokData[0].ad);
      }
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

  const hedefLokasyon = acikKayit
    ? lokasyonlar.find((l) => l.ad === acikKayit.lokasyon)
    : lokasyonlar.find((l) => l.ad === seciliLokasyon);

  async function konumDogrula() {
    setKonumDurum('kontrol'); setKonumMesaj('');
    if (!hedefLokasyon || hedefLokasyon.enlem == null || hedefLokasyon.boylam == null) {
      setKonumDurum('basarisiz');
      setKonumMesaj('Bu lokasyon için konum bilgisi tanımlanmamış.');
      return;
    }
    try {
      const { lat, lon } = await konumAl();
      const mesafe = mesafeMetre(lat, lon, hedefLokasyon.enlem, hedefLokasyon.boylam);
      const izinliMesafe = hedefLokasyon.yaricap_metre || 150;
      if (mesafe <= izinliMesafe) {
        setKonumDurum('basarili');
        setKonumMesaj('Konum doğrulandı (' + mesafe + ' m).');
      } else {
        setKonumDurum('basarisiz');
        setKonumMesaj('Sahada değilsiniz. Uzaklık: ' + mesafe + ' m');
      }
    } catch (err) {
      setKonumDurum('basarisiz');
      setKonumMesaj(err.message);
    }
  }

  function qrOkundu(kod) {
    if (ayarlar.qr_dogrulama_aktif && !acikKayit) {
      const bulunanLokasyon = lokasyonlar.find((l) => l.qr_kodu === kod);
      if (bulunanLokasyon) {
        setSeciliLokasyon(bulunanLokasyon.ad);
        setQrDurum('basarili');
        setQrMesaj('QR kod doğrulandı: ' + bulunanLokasyon.ad);
      } else {
        setQrDurum('basarisiz');
        setQrMesaj('Tanımsız QR kod.');
      }
    } else if (hedefLokasyon && kod === hedefLokasyon.qr_kodu) {
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
    if (dogrulamaGerekli && !dogrulamaTamam) { setMesaj({ tip: 'err', metin: 'Önce doğrulamayı tamamlayın.' }); return; }
    const now = new Date().toISOString();
    const { error } = await supabase.from('giris_cikis').insert({
      personel_no: oturum.personel_no,
      ad: oturum.ad,
      giris_saati: now,
      durum: 'Açık',
      lokasyon: seciliLokasyon,
    });
    if (error) { setMesaj({ tip: 'err', metin: error.message }); return; }
    setMesaj({ tip: 'ok', metin: 'Giriş kaydedildi.' });
    durumYukle();
  }

  async function cikisYap() {
    setMesaj(null);
    if (dogrulamaGerekli && !dogrulamaTamam) { setMesaj({ tip: 'err', metin: 'Önce doğrulamayı tamamlayın.' }); return; }
    
    const now = new Date();
    const girisSaati = new Date(acikKayit.giris_saati);
    const hamSure = (now - girisSaati) / 3600000; // Saat birimi
    
    // GÜNCELLEME: Lokasyon bazlı mola düşme mantığı (varsayılan mola süresi yoksa 0 dk düşer)
    const molaDakika = Number(hedefLokasyon?.mola_suresi_dakika) || 0;
    const molaSaat = molaDakika / 60;
    const sureSaat = Math.round(Math.max(hamSure - molaSaat, 0) * 100) / 100; 

    const { error } = await supabase
      .from('giris_cikis')
      .update({ cikis_saati: now.toISOString(), sure_saat: sureSaat, durum: 'Kapalı' })
      .eq('id', acikKayit.id);
    if (error) { setMesaj({ tip: 'err', metin: error.message }); return; }
    
    setMesaj({ 
      tip: 'ok', 
      metin: 'Çıkış kaydedildi. Süre: ' + sureFormatla(sureSaat) + (molaDakika > 0 ? ` (${molaDakika} dk mola düşüldü)` : '') 
    });
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
        ) : ayarlar.qr_dogrulama_aktif ? (
          <div className="loc-badge">
            <div>
              <div className="label">{seciliLokasyon ? 'QR ile belirlenen lokasyon' : 'Lokasyon QR okutunca belirlenecek'}</div>
              {seciliLokasyon && <div className="value">{seciliLokasyon}</div>}
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
                  <QrOkuyucu onOkundu={qrOkundu} onIptal={(hata) => { setQrDurum('bekliyor'); if (hata) setQrMesaj(hata); }} />
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

/* ---------------- ÇALIŞMA SAATLERİM TAB ---------------- */
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
      const haftaBaslangic = new Date(now); haftaBaslangic.setDate(now.getDate() - 7);
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
        <div style={{ fontSize: 12, color: 'var(--ink-soft)', marginBottom: 8 }}>Süreler, ilgili projenin/lokasyonun mola ayarları düşülerek hesaplanmıştır.</div>
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

/* ---------------- GÖREVLERİM TAB ---------------- */
function GorevlerimTab({ oturum, onGorevDurumDegisti }) {
  const [gorevler, setGorevler] = useState([]);
  const [yukleniyor, setYukleniyor] = useState(true);
  const [durumFiltre, setDurumFiltre] = useState('Tümü');
  const [fotoYukleniyor, setFotoYukleniyor] = useState(null);

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

  useEffect(() => {
    if (typeof Notification !== 'undefined' && Notification.permission === 'default') {
      Notification.requestPermission();
    }
    const kanal = supabase
      .channel('gorev-bildirim-' + oturum.personel_no)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'gorevler' }, (payload) => {
        const yeni = payload.new;
        if (Array.isArray(yeni.atanan_personel_no) && yeni.atanan_personel_no.includes(oturum.personel_no)) {
          if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
            new Notification('📋 Yeni Görev Atandı!', {
              body: yeni.baslik + (yeni.lokasyon ? ' — ' + yeni.lokasyon : ''),
              icon: '/favicon.ico',
            });
          }
          yukle();
          if (onGorevDurumDegisti) onGorevDurumDegisti();
        }
      })
      .subscribe();

    return () => { supabase.removeChannel(kanal); };
  }, [oturum.personel_no]); // eslint-disable-line

  async function durumDegistir(gorev, yeniDurum) {
    await supabase.from('gorevler').update({
      durum: yeniDurum, tamamlanma_tarihi: yeniDurum === 'Tamamlandı' ? new Date().toISOString() : null,
    }).eq('id', gorev.id);
    yukle();
    if (onGorevDurumDegisti) onGorevDurumDegisti();
  }

  async function fotoSecildiVeTamamlandi(e, gorev) {
    const dosya = e.target.files?.[0];
    e.target.value = '';
    if (!dosya || !gorev) return;
    setFotoYukleniyor(gorev.id);
    const dosyaAdi = Date.now() + '-' + dosya.name.replace(/\s+/g, '-');
    const { error: yuklemeHatasi } = await supabase.storage.from('gorev-fotolari').upload(dosyaAdi, dosya);
    if (yuklemeHatasi) {
      alert('Fotoğraf yüklenemedi: ' + yuklemeHatasi.message);
      setFotoYukleniyor(null);
      return;
    }
    const { data: urlData } = supabase.storage.from('gorev-fotolari').getPublicUrl(dosyaAdi);
    await supabase.from('gorevler').update({
      durum: 'Tamamlandı', tamamlanma_tarihi: new Date().toISOString(), tamamlanma_foto_url: urlData.publicUrl,
    }).eq('id', gorev.id);
    setFotoYukleniyor(null);
    yukle();
    if (onGorevDurumDegisti) onGorevDurumDegisti();
  }

  if (yukleniyor) return <div className="loading-text">Yükleniyor...</div>;

  const gosterilenler = durumFiltre === 'Tümü' ? gorevler : gorevler.filter((g) => g.durum === durumFiltre);
  const oncelikRengi = { 'Düşük': '#5B6560', 'Normal': '#E8590C', 'Yüksek': '#A0592A', 'Acil': '#B23B0E' };

  return (
    <div className="card">
      <h2 className="section">Görevlerim</h2>
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
                <img src={g.tamamlanma_foto_url} alt="Tamamlanma" style={{ width: 70, height: 70, objectFit: 'cover', borderRadius: 6 }} />
              </a>
            )}
            <div style={{ display: 'flex', gap: 6, marginTop: 8, alignItems: 'center', flexWrap: 'wrap' }}>
              {g.durum === 'Bekliyor' && (
                <button onClick={() => durumDegistir(g, 'Devam Ediyor')} className="action btn-secondary" style={{ width: 'auto', padding: '7px 12px', fontSize: 12 }}>Başladım</button>
              )}
              {g.durum !== 'Tamamlandı' && (
                <>
                  <input type="file" accept="image/*" capture="environment" style={{ display: 'none' }} id={'foto-input-' + g.id} onChange={(e) => fotoSecildiVeTamamlandi(e, g)} />
                  <button onClick={() => document.getElementById('foto-input-' + g.id)?.click()} className="action btn-punch" style={{ width: 'auto', padding: '7px 12px', fontSize: 12 }} disabled={fotoYukleniyor === g.id}>
                    {fotoYukleniyor === g.id ? 'Yükleniyor...' : '📷 Fotoğrafla Tamamla'}
                  </button>
                </>
              )}
              {g.durum === 'Tamamlandı' && (
                <button onClick={() => durumDegistir(g, 'Devam Ediyor')} className="action btn-secondary" style={{ width: 'auto', padding: '7px 12px', fontSize: 12 }}>Geri al</button>
              )}
            </div>
          </div>
        ))}
        {gosterilenler.length === 0 && <div style={{ color: 'var(--ink-soft)', fontSize: 13 }}>Size atanmış görev yok.</div>}
      </div>
    </div>
  );
}

/* ---------------- ARAÇ TAB ---------------- */
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
    const { data: acik } = await supabase.from('arac_kullanim').select('*').eq('personel_no', oturum.personel_no).eq('durum', 'Açık').maybeSingle();
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

    const { data: gecmisVeri } = await supabase.from('arac_kullanim').select('*').eq('personel_no', oturum.personel_no).eq('durum', 'Kapalı').order('tarih', { ascending: false }).limit(10);
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
    if (!t || t < acikKayit.alis_km) { setMesaj({ tip: 'err', metin: "Geçerli teslim km girin." }); return; }
    const katedilen = t - acikKayit.alis_km;
    const { error: e1 } = await supabase.from('arac_kullanim').update({ teslim_km: t, katedilen_km: katedilen, durum: 'Kapalı', teslim_saati: new Date().toISOString() }).eq('id', acikKayit.id);
    if (e1) { setMesaj({ tip: 'err', metin: e1.message }); return; }
    await supabase.from('araclar').update({ durum: 'Boşta', son_km: t }).eq('plaka', acikKayit.plaka);
    setMesaj({ tip: 'ok', metin: 'Araç teslim edildi. Kat edilen: ' + katedilen + ' km' });
    setTeslimKm('');
    veriYukle();
  }

  if (yukleniyor) return <div className="loading-text">Yükleniyor...</div>;

  return (
    <>
      <div className="card">
        <h2 className="section">Araç Filosu</h2>
        <div className="grid cols-3" style={{ marginTop: 10 }}>
          {tumAraclar.map((a) => {
            const secilebilir = !acikKayit && a.durum === 'Boşta';
            const secili = secilebilir && plaka === a.plaka;
            return (
              <div key={a.plaka} onClick={secilebilir ? () => plakaDegisti(a.plaka) : undefined} style={{ padding: 12, cursor: secilebilir ? 'pointer' : 'default', opacity: secilebilir || acikKayit ? 1 : 0.55, border: secili ? '2px solid var(--accent-personel)' : '1px solid var(--border)', borderRadius: 8 }}>
                <div style={{ width: '100%', height: 90, borderRadius: 8, background: 'rgba(127, 127, 127, 0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', marginBottom: 8 }}>
                  {a.resim_url ? <img src={a.resim_url} alt={a.plaka} style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : <span style={{ fontSize: 28 }}>🚐</span>}
                </div>
                <div style={{ fontWeight: 700, fontSize: 13 }}>{[a.marka, a.model].filter(Boolean).join(' ')}</div>
                <div style={{ fontSize: 12, color: 'var(--ink-soft)' }}>{a.plaka}</div>
                <div style={{ marginTop: 6, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <span className={'status-tag' + (a.durum === 'Boşta' ? ' open' : '')}>{a.durum}</span>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {acikKayit ? (
        <div className="card">
          <h2 className="section">Araç Teslim Et</h2>
          <div className="loc-badge">
            <div><div className="label">Kullanımdaki araç</div><div className="value">{acikKayit.plaka}</div></div>
            <div><div className="label">Alış km</div><div className="value">{acikKayit.alis_km.toLocaleString('tr-TR')}</div></div>
          </div>
          <label style={{ marginTop: 12 }}>Teslim kilometresi</label>
          <input type="number" value={teslimKm} onChange={(e) => setTeslimKm(e.target.value)} placeholder="örn. 84350" />
          <button className="action btn-punch cikis" onClick={teslimEt}>Aracı Teslim Et</button>
          {mesaj && <div className={'feedback ' + mesaj.tip}>{mesaj.metin}</div>}
        </div>
      ) : (
        <div className="card">
          <h2 className="section">Araç Teslim Al</h2>
          <label>Plaka seç</label>
          <select value={plaka} onChange={(e) => plakaDegisti(e.target.value)}>
            {bostaAraclar.length === 0 && <option value="">Boşta araç yok</option>}
            {bostaAraclar.map((a) => <option key={a.plaka} value={a.plaka}>{a.plaka}</option>)}
          </select>
          <label>Alış kilometresi</label>
          <input type="number" value={alisKm} readOnly disabled style={{ background: 'rgba(127, 127, 127, 0.12)' }} />
          <button className="action btn-punch" onClick={teslimAl} disabled={!bostaAraclar.length}>Aracı Teslim Al</button>
          {mesaj && <div className={'feedback ' + mesaj.tip}>{mesaj.metin}</div>}
        </div>
      )}
    </>
  );
}

/* ---------------- SAHA VERİSİ TAB (USTABAŞI) ---------------- */
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
      setMesaj({ tip: 'err', metin: 'Önce "Mesai" sekmesinden giriş yapmalısınız.' });
      return;
    }

    const kt = otomatikVeri ? otomatikVeri.kalem_turu : kalemTuru;
    const mk = otomatikVeri ? otomatikVeri.miktar : miktar;
    const bf = otomatikVeri ? otomatikVeri.birim_fiyat : birimFiyat;
    const pb = 'PLN';
    const ak = otomatikVeri ? otomatikVeri.aciklama : aciklama;
    const tp = (Number(mk) || 0) * (Number(bf) || 0);

    setMesaj(null);
    if (!kt || !String(kt).trim() || !mk || !bf) {
      setMesaj({ tip: 'err', metin: 'Alanları kontrol edin.' });
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
      para_birimi: pb, // GÜNCELLEME: Veritabanına kaydediliyor
      toplam: tp,
      aciklama: ak || null,
    });
    if (error) { setMesaj({ tip: 'err', metin: error.message }); return; }

    setMesaj({
      tip: 'ok',
      metin: (otomatikVeri ? '📷 Fişten okundu. ' : 'Kaydedildi. ') + 'Toplam: ' + formatPLN(tp),
    });
    setKalemTuru(''); setMiktar(''); setBirimFiyat(''); setAciklama('');
  }

  function kameraAc() { dosyaInputRef.current?.click(); }

  async function fisSecildi(e) {
    const dosya = e.target.files?.[0];
    e.target.value = '';
    if (!dosya || !aktifLokasyon) return;

    setMesaj(null); setTaraniyor(true);
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
        setMesaj({ tip: 'err', metin: 'Fiş tam okunamadı, bilgileri elle girin.' });
        return;
      }

      const { kalem_turu, miktar: okunanMiktar, birim_fiyat, aciklama: okunanAciklama } = sonuc.veri;

      setKalemTuru(kalem_turu || '');
      setMiktar(okunanMiktar ?? '');
      setBirimFiyat(birim_fiyat ?? '');
      setAciklama(okunanAciklama || '');

      if (kalem_turu && okunanMiktar && birim_fiyat) {
        await kaydet({ kalem_turu, miktar: okunanMiktar, birim_fiyat, aciklama: okunanAciklama });
      }
    } catch (err) {
      setMesaj({ tip: 'err', metin: 'Tarama başarısız.' });
    } finally {
      setTaraniyor(false);
    }
  }

  return (
    <div className="card">
      <h2 className="section">Saha Verisi Ekle</h2>
      {aktifLokasyon ? <div style={{ fontSize: 13, color: 'var(--ink-soft)' }}>Lokasyon: <b>{aktifLokasyon}</b></div> : <div className="feedback err">Önce giriş yapın.</div>}

      <input ref={dosyaInputRef} type="file" accept="image/*" capture="environment" style={{ display: 'none' }} onChange={fisSecildi} />
      <button type="button" className="action btn-ai" style={{ marginTop: 10 }} onClick={kameraAc} disabled={taraniyor || !aktifLokasyon}>
        {taraniyor ? '📷 Fiş okunuyor...' : '📷 Fiş Tara (Kamera)'}
      </button>

      <label style={{ marginTop: 16 }}>Kalem türü</label>
      <div className="chip-row">
        {kalemTurleri.map((k) => <span key={k.ad} className={'chip' + (kalemTuru === k.ad ? ' sel' : '')} onClick={() => setKalemTuru(k.ad)}>{k.ad}</span>)}
      </div>
      <input style={{ marginTop: 8 }} placeholder="veya yeni kalem türü" value={kalemTuru} onChange={(e) => setKalemTuru(e.target.value)} />
      
      <label>Miktar</label>
      <input type="number" step="0.01" value={miktar} onChange={(e) => setMiktar(e.target.value)} placeholder="0" />
      
      <label>Birim fiyat (PLN)</label>
      <input type="number" step="0.01" value={birimFiyat} onChange={(e) => setBirimFiyat(e.target.value)} placeholder="0" />
      
      <div className="total">Toplam: {formatPLN(toplam)}</div>
      
      <label>Açıklama (opsiyonel)</label>
      <input value={aciklama} onChange={(e) => setAciklama(e.target.value)} placeholder="kısa not" />
      
      <button className="action btn-secondary" onClick={() => kaydet()} disabled={!aktifLokasyon}>Kaydet</button>
      {mesaj && <div className={'feedback ' + mesaj.tip}>{mesaj.metin}</div>}
    </div>
  );
}

/* ---------------- ŞANTİYE DEFTERİ (sadece Formen) ---------------- */
function SantiyeDefteriTab({ oturum }) {
  const [lokasyonlar, setLokasyonlar] = useState([]);
  const [lokasyon, setLokasyon] = useState('');
  const [formenSayisi, setFormenSayisi] = useState('');
  const [ustaSayisi, setUstaSayisi] = useState('');
  const [isciSayisi, setIsciSayisi] = useState('');
  const [ofisSayisi, setOfisSayisi] = useState('');
  const [araclar, setAraclar] = useState([{ cins: '', adet: '' }]);
  const [bugunYapilan, setBugunYapilan] = useState('');
  const [yarinYapilacak, setYarinYapilacak] = useState('');
  const [notlar, setNotlar] = useState('');
  const [kaydediliyor, setKaydediliyor] = useState(false);
  const [mesaj, setMesaj] = useState(null);
  const [gecmisRaporlar, setGecmisRaporlar] = useState([]);

  useEffect(() => {
    supabase.from('lokasyonlar').select('*').then(({ data }) => setLokasyonlar(data || []));
    raporlariYukle();
  }, []); // eslint-disable-line

  function raporlariYukle() {
    supabase
      .from('santiye_defterleri')
      .select('*')
      .eq('formen_no', oturum.personel_no)
      .order('created_at', { ascending: false })
      .limit(10)
      .then(({ data }) => setGecmisRaporlar(data || []));
  }

  function aracSatiriDegistir(i, alan, deger) {
    setAraclar((onceki) => onceki.map((a, idx) => (idx === i ? { ...a, [alan]: deger } : a)));
  }
  function aracSatiriEkle() {
    setAraclar((onceki) => [...onceki, { cins: '', adet: '' }]);
  }
  function aracSatiriSil(i) {
    setAraclar((onceki) => onceki.filter((_, idx) => idx !== i));
  }

  function formuTemizle() {
    setLokasyon(''); setFormenSayisi(''); setUstaSayisi(''); setIsciSayisi(''); setOfisSayisi('');
    setAraclar([{ cins: '', adet: '' }]); setBugunYapilan(''); setYarinYapilacak(''); setNotlar('');
  }

  async function raporKaydet() {
    setMesaj(null);
    if (!lokasyon.trim()) { setMesaj({ tip: 'err', metin: 'Lokasyon/şantiye adı gerekli.' }); return; }
    if (!bugunYapilan.trim()) { setMesaj({ tip: 'err', metin: 'Bugün yapılan işleri girin.' }); return; }

    setKaydediliyor(true);
    const temizAraclar = araclar.filter((a) => a.cins.trim());

    const { error } = await supabase.from('santiye_defterleri').insert({
      lokasyon: lokasyon.trim(),
      formen_no: oturum.personel_no,
      formen_adi: oturum.ad,
      saha_formen_sayisi: Number(formenSayisi) || 0,
      saha_usta_sayisi: Number(ustaSayisi) || 0,
      saha_isci_sayisi: Number(isciSayisi) || 0,
      ofis_personel_sayisi: Number(ofisSayisi) || 0,
      arac_ekipman: temizAraclar,
      bugun_yapilan: bugunYapilan.trim(),
      yarin_yapilacak: yarinYapilacak.trim() || null,
      notlar: notlar.trim() || null,
      durum: 'Yeni',
    });
    setKaydediliyor(false);

    if (error) { setMesaj({ tip: 'err', metin: error.message }); return; }
    setMesaj({ tip: 'ok', metin: '✅ Rapor kaydedildi, patrona bildirim gönderildi.' });
    formuTemizle();
    raporlariYukle();
  }

  return (
    <div className="card">
      <h2 className="section">📋 Şantiye Defteri — Günlük Faaliyet Raporu</h2>
      <div style={{ fontSize: 12, color: 'var(--ink-soft)', marginBottom: 10 }}>
        Bugün gezdiğiniz her şantiye için ayrı bir rapor doldurabilirsiniz.
      </div>

      <label>Lokasyon / Şantiye</label>
      <div className="chip-row">
        {lokasyonlar.map((l) => (
          <span key={l.ad} className={'chip' + (lokasyon === l.ad ? ' sel' : '')} onClick={() => setLokasyon(l.ad)}>{l.ad}</span>
        ))}
      </div>
      <input style={{ marginTop: 8 }} placeholder="veya farklı bir şantiye adı yazın" value={lokasyon} onChange={(e) => setLokasyon(e.target.value)} />

      <label style={{ marginTop: 16 }}>Saha personel sayıları</label>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
        <div>
          <div style={{ fontSize: 11, color: 'var(--ink-soft)', marginBottom: 4 }}>Formen</div>
          <input type="number" value={formenSayisi} onChange={(e) => setFormenSayisi(e.target.value)} placeholder="0" />
        </div>
        <div>
          <div style={{ fontSize: 11, color: 'var(--ink-soft)', marginBottom: 4 }}>Usta</div>
          <input type="number" value={ustaSayisi} onChange={(e) => setUstaSayisi(e.target.value)} placeholder="0" />
        </div>
        <div>
          <div style={{ fontSize: 11, color: 'var(--ink-soft)', marginBottom: 4 }}>Düz İşçi</div>
          <input type="number" value={isciSayisi} onChange={(e) => setIsciSayisi(e.target.value)} placeholder="0" />
        </div>
      </div>

      <label>Ofis / idari personel sayısı</label>
      <input type="number" value={ofisSayisi} onChange={(e) => setOfisSayisi(e.target.value)} placeholder="0" />

      <label style={{ marginTop: 16 }}>Makina, Ekipman ve Araç Durumu</label>
      <div style={{ display: 'grid', gap: 6 }}>
        {araclar.map((a, i) => (
          <div key={i} style={{ display: 'flex', gap: 6 }}>
            <input placeholder="Cinsi (örn. Vinç)" value={a.cins} onChange={(e) => aracSatiriDegistir(i, 'cins', e.target.value)} style={{ flex: 2 }} />
            <input placeholder="Adet" type="number" value={a.adet} onChange={(e) => aracSatiriDegistir(i, 'adet', e.target.value)} style={{ flex: 1 }} />
            {araclar.length > 1 && (
              <button
                type="button"
                onClick={() => aracSatiriSil(i)}
                style={{ border: 'none', background: 'rgba(220, 38, 38, 0.14)', color: '#ef4444', borderRadius: 7, padding: '0 12px', fontWeight: 700, cursor: 'pointer' }}
              >
                ✕
              </button>
            )}
          </div>
        ))}
      </div>
      <button type="button" className="action btn-secondary" style={{ marginTop: 8 }} onClick={aracSatiriEkle}>+ Satır Ekle</button>

      <label style={{ marginTop: 16 }}>Bugün Yapılan İşler</label>
      <textarea rows={4} value={bugunYapilan} onChange={(e) => setBugunYapilan(e.target.value)} placeholder={'Her satıra bir madde yazın, örn:\n- Zemin betonu döküldü\n- Duvar örümüne başlandı'} style={{ width: '100%', padding: 10, borderRadius: 8, border: '1px solid var(--border)', background: 'var(--card)', color: 'var(--ink)', fontFamily: 'inherit', fontSize: 14 }} />

      <label style={{ marginTop: 12 }}>Yarın Yapılacak İşler</label>
      <textarea rows={3} value={yarinYapilacak} onChange={(e) => setYarinYapilacak(e.target.value)} placeholder="opsiyonel" style={{ width: '100%', padding: 10, borderRadius: 8, border: '1px solid var(--border)', background: 'var(--card)', color: 'var(--ink)', fontFamily: 'inherit', fontSize: 14 }} />

      <label style={{ marginTop: 12 }}>Notlar / Açıklamalar / Sıkıntılar</label>
      <textarea rows={3} value={notlar} onChange={(e) => setNotlar(e.target.value)} placeholder="opsiyonel" style={{ width: '100%', padding: 10, borderRadius: 8, border: '1px solid var(--border)', background: 'var(--card)', color: 'var(--ink)', fontFamily: 'inherit', fontSize: 14 }} />

      <button className="action btn-ai" style={{ marginTop: 16 }} onClick={raporKaydet} disabled={kaydediliyor}>
        {kaydediliyor ? 'Kaydediliyor...' : '📋 Raporu Kaydet ve Patrona Gönder'}
      </button>
      {mesaj && <div className={'feedback ' + mesaj.tip}>{mesaj.metin}</div>}

      {gecmisRaporlar.length > 0 && (
        <div style={{ marginTop: 24, borderTop: '1px solid var(--border)', paddingTop: 14 }}>
          <h3 style={{ fontSize: 14, margin: '0 0 10px' }}>Son gönderdiğim raporlar</h3>
          <div style={{ display: 'grid', gap: 8 }}>
            {gecmisRaporlar.map((r) => (
              <div key={r.id} style={{ border: '1px solid var(--border)', borderRadius: 9, padding: '8px 12px', fontSize: 13 }}>
                <b>{r.lokasyon}</b> · {new Date(r.created_at).toLocaleString('tr-TR')}{' '}
                <span className={'status-tag' + (r.durum === 'Görüldü' ? ' open' : '')}>{r.durum}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}