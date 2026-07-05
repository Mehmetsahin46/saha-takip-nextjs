import './globals.css';

export const metadata = {
  title: 'Saha Takip',
  description: 'Saha personel, mesai, araç ve maliyet takip sistemi',
};

export default function RootLayout({ children }) {
  return (
    <html lang="tr">
      <body>{children}</body>
    </html>
  );
}
