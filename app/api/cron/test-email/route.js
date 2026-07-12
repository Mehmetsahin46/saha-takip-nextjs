import { supabase } from '@/lib/supabase';

export async function POST(request) {
  try {
    const { eposta } = await request.json();

    if (!eposta || !eposta.trim()) {
      return Response.json({ basari: false, mesaj: 'E-posta adresi belirtilmedi.' }, { status: 400 });
    }

    const aliciEposta = eposta.trim();

    // Şık bir HTML Test E-postası içeriği
    const htmlContent = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <title>Saha Takip - Test E-postası</title>
      <style>
        body {
          font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
          line-height: 1.6;
          color: #2b302d;
          background-color: #f7f9f8;
          margin: 0;
          padding: 40px 20px;
        }
        .container {
          background-color: #ffffff;
          border: 1px solid #e1e5e2;
          border-radius: 12px;
          overflow: hidden;
          max-width: 500px;
          margin: 0 auto;
          box-shadow: 0 4px 6px rgba(0,0,0,0.02);
        }
        .header {
          background: linear-gradient(135deg, #2b4c5c 0%, #1b3846 100%);
          color: #ffffff;
          padding: 24px;
          text-align: center;
        }
        .header h1 {
          margin: 0;
          font-size: 20px;
          font-weight: 700;
        }
        .content {
          padding: 24px;
          text-align: center;
        }
        .success-icon {
          font-size: 48px;
          margin-bottom: 16px;
        }
        .button {
          display: inline-block;
          background-color: #2b4c5c;
          color: #ffffff !important;
          text-decoration: none;
          padding: 10px 20px;
          border-radius: 6px;
          font-weight: 600;
          margin-top: 16px;
          font-size: 14px;
        }
        .footer {
          background-color: #f7f9f8;
          border-top: 1px solid #e1e5e2;
          padding: 16px;
          font-size: 11px;
          color: #8c9691;
          text-align: center;
        }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <h1>Saha Takip Sistemi</h1>
        </div>
        <div class="content">
          <div class="success-icon">🎉</div>
          <h2 style="margin-top: 0; color: #2b4c5c;">Bağlantı Başarılı!</h2>
          <p>Bu e-posta, Saha Takip Sistemi e-posta raporlama entegrasyonunun başarıyla kurulduğunu doğrulamak amacıyla gönderilmiştir.</p>
          <p>Artık sistemden günlük ve aylık saha özetlerini belirlediğiniz e-posta adresine otomatik olarak alabilirsiniz.</p>
          <a href="#" class="button">Sisteme Git</a>
        </div>
        <div class="footer">
          Rapor ayarlarını istediğiniz zaman Patron Paneli > Ayarlar sekmesinden değiştirebilirsiniz.
        </div>
      </div>
    </body>
    </html>
    `;

    const resendApiKey = process.env.RESEND_API_KEY;
    if (resendApiKey) {
      const res = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${resendApiKey}`
        },
        body: JSON.stringify({
          from: 'Saha Takip <onboarding@resend.dev>',
          to: aliciEposta,
          subject: 'Saha Takip Sistemi — E-Posta Test Bağlantısı',
          html: htmlContent
        })
      });

      const resData = await res.json();
      if (res.ok) {
        return Response.json({
          basari: true,
          mesaj: 'Test e-postası başarıyla gönderildi! E-posta kutunuzu (ve spam klasörünü) kontrol edin.'
        });
      } else {
        return Response.json({
          basari: false,
          mesaj: 'Resend gönderim hatası: ' + (resData.message || JSON.stringify(resData))
        }, { status: 502 });
      }
    } else {
      return Response.json({
        basari: true,
        mesaj: 'Simülasyon Başarılı: RESEND_API_KEY tanımlı değil, ancak test e-postası oluşturma işlemi yerelde başarıyla doğrulandı.'
      });
    }
  } catch (err) {
    return Response.json({ basari: false, mesaj: 'Sunucu hatası: ' + err.message }, { status: 500 });
  }
}
