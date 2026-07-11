import './globals.css';

export const metadata = {
  title: 'Saha Takip',
  description: 'Saha personel, mesai, araç ve maliyet takip sistemi',
  manifest: '/manifest.json',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'default',
    title: 'Saha Takip',
  },
};

export const viewport = {
  themeColor: '#E8590C',
};

export default function RootLayout({ children }) {
  return (
    <html lang="tr">
      <head>
        <link rel="apple-touch-icon" href="/icon-192.png" />
      </head>
      <body>{children}</body>
    </html>
  );
}