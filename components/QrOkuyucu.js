'use client';

import { useEffect, useRef } from 'react';
import { Html5Qrcode } from 'html5-qrcode';

// Kamera açıp QR kod okur. Bir kod okununca onOkundu(decodedText) çağrılır.
export default function QrOkuyucu({ onOkundu, onIptal }) {
  const kutuId = 'qr-okuyucu-kutu';
  const durdurulduRef = useRef(false);

  useEffect(() => {
    const scanner = new Html5Qrcode(kutuId);
    durdurulduRef.current = false;

    scanner
      .start(
        { facingMode: 'environment' },
        { fps: 10, qrbox: { width: 220, height: 220 } },
        (decodedText) => {
          if (durdurulduRef.current) return;
          durdurulduRef.current = true;
          scanner.stop().then(() => scanner.clear()).catch(() => {});
          onOkundu(decodedText);
        },
        () => {} // kare okunamadıysa sessiz geç, hata sayılmaz
      )
      .catch((err) => {
        onIptal && onIptal('Kamera başlatılamadı: ' + err);
      });

    return () => {
      if (!durdurulduRef.current) {
        scanner.stop().then(() => scanner.clear()).catch(() => {});
      }
    };
  }, []); // eslint-disable-line

  return (
    <div>
      <div id={kutuId} style={{ width: '100%', borderRadius: 10, overflow: 'hidden' }} />
      <button className="action btn-secondary" onClick={() => onIptal && onIptal()} style={{ marginTop: 10 }}>
        İptal
      </button>
    </div>
  );
}