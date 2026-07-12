// Karanlık mod için basit yardımcı fonksiyonlar. Tercih tarayıcıda saklanır.

export function getInitialTheme() {
  if (typeof window === 'undefined') return 'light';
  return localStorage.getItem('tema') || 'light';
}

export function temaUygula(tema) {
  if (typeof document === 'undefined') return;
  document.documentElement.setAttribute('data-theme', tema);
}

export function temaDegistir(mevcutTema) {
  const yeni = mevcutTema === 'dark' ? 'light' : 'dark';
  localStorage.setItem('tema', yeni);
  temaUygula(yeni);
  return yeni;
}