export async function POST(request) {
  const { lokasyon, toplamMaliyet, kalemler } = await request.json();

  if (!kalemler || !kalemler.length) {
    return Response.json({ basari: false, mesaj: 'Bu lokasyon için henüz saha verisi yok.' }, { status: 400 });
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return Response.json({ basari: false, mesaj: 'ANTHROPIC_API_KEY tanımlı değil (.env.local dosyasını kontrol edin).' }, { status: 500 });
  }

  const kalemMetni = kalemler
    .map((k) => `- ${k.kalem_turu}: ${k.miktar} birim x ${k.birim_fiyat} TL = ${k.toplam} TL`)
    .join('\n');

  const prompt = `Aşağıda bir saha projesi için girilmiş maliyet kalemleri var.
Lokasyon: ${lokasyon}
Toplam maliyet: ${toplamMaliyet} TL
Kalemler:
${kalemMetni}

Lütfen:
1. Kısa bir maliyet analizi yap.
2. Gerekçeli bir kâr marjı önererek satış fiyatı öner.
3. Müşteriye sunulacak kısa, profesyonel bir teklif metni taslağı yaz (2-3 paragraf).
Yanıtı Türkçe ver.`;

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: 1500,
        messages: [{ role: 'user', content: prompt }],
      }),
    });

    const data = await response.json();
    if (!data.content) {
      return Response.json({ basari: false, mesaj: 'AI yanıtı alınamadı: ' + JSON.stringify(data) }, { status: 500 });
    }

    const teklifMetni = data.content.map((c) => c.text || '').join('\n');
    return Response.json({ basari: true, teklifMetni });
  } catch (err) {
    return Response.json({ basari: false, mesaj: 'İstek başarısız: ' + err.message }, { status: 500 });
  }
}
