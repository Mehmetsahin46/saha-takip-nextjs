'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';

export default function LoginPage() {
  const router = useRouter();
  const [personelNo, setPersonelNo] = useState('');
  const [sifre, setSifre] = useState('');
  const [hata, setHata] = useState('');
  const [yukleniyor, setYukleniyor] = useState(false);

  async function girisYap(e) {
    e.preventDefault();
    if (yukleniyor) return; // Çift tıklamaları önleyelim
    
    setHata('');
    setYukleniyor(true);

    const { data, error } = await supabase
      .from('personel')
      .select('*')
      .eq('personel_no', personelNo.trim())
      .eq('sifre', sifre)
      .maybeSingle();

    if (error) {
      setHata('Bağlantı hatası: ' + error.message);
      setYukleniyor(false);
      return;
    }
    
    if (!data) {
      setHata('Personel numarası veya şifre hatalı.');
      setYukleniyor(false);
      return;
    }

    // 1. Olası büyük/küçük harf veya boşluk sorunlarını temizleyelim
    const temizRol = data.rol ? String(data.rol).toLowerCase().trim() : '';

    // 2. LocalStorage verisini güncellenmiş temiz rol ile kaydedelim
    const oturumVerisi = {
      ...data,
      rol: temizRol // 'patron', 'personel' veya 'formen' olarak standartlaştırdık
    };
    localStorage.setItem('aktifOturum', JSON.stringify(oturumVerisi));

    // 3. Güvenli Yönlendirme Kontrolü
    if (temizRol === 'patron') {
      router.push('/patron');
    } else if (temizRol === 'personel' || temizRol === 'formen' || temizRol === 'ustabasi') {
      router.push('/personel');
    } else {
      setHata('Bu kullanıcıya tanımlı geçerli bir rol (patron/personel) bulunamadı.');
      setYukleniyor(false);
    }
  }

  return (
    <div className="login-wrap">
      <form className="login-card" onSubmit={girisYap}>
        <h1>Saha Takip</h1>
        <p>Personel numaranız ve şifrenizle giriş yapın.</p>
        <input
          placeholder="Kullanıcı adı"
          value={personelNo}
          onChange={(e) => setPersonelNo(e.target.value)}
          required
        />
        <input
          placeholder="Şifre"
          type="password"
          value={sifre}
          onChange={(e) => setSifre(e.target.value)}
          required
        />
        <button type="submit" disabled={yukleniyor}>
          {yukleniyor ? 'Kontrol ediliyor...' : 'Giriş Yap'}
        </button>
        {hata && <div className="login-err">{hata}</div>}
      </form>
    </div>
  );
}