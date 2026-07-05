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
    setHata('');
    setYukleniyor(true);

    const { data, error } = await supabase
      .from('personel')
      .select('*')
      .eq('personel_no', personelNo.trim())
      .eq('sifre', sifre)
      .maybeSingle();

    setYukleniyor(false);

    if (error) {
      setHata('Bağlantı hatası: ' + error.message);
      return;
    }
    if (!data) {
      setHata('Personel numarası veya şifre hatalı.');
      return;
    }

    localStorage.setItem('aktifOturum', JSON.stringify(data));
    router.push(data.rol === 'patron' ? '/patron' : '/personel');
  }

  return (
    <div className="login-wrap">
      <form className="login-card" onSubmit={girisYap}>
        <h1>Saha Takip</h1>
        <p>Personel numaranız ve şifrenizle giriş yapın.</p>
        <input
          placeholder="Personel numarası"
          value={personelNo}
          onChange={(e) => setPersonelNo(e.target.value)}
          inputMode="numeric"
        />
        <input
          placeholder="Şifre"
          type="password"
          value={sifre}
          onChange={(e) => setSifre(e.target.value)}
        />
        <button type="submit" disabled={yukleniyor}>
          {yukleniyor ? 'Kontrol ediliyor...' : 'Giriş Yap'}
        </button>
        {hata && <div className="login-err">{hata}</div>}
      </form>
    </div>
  );
}
