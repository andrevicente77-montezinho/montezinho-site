// ============================================================================
// MonteZinho — Sincronizador de calendário do Airbnb (MÉTODO AVANÇADO)
// ============================================================================
// NOTA: o site já vem configurado com um método mais simples (um proxy
// público gratuito), que não exige nada disto — não precisa de fazer nada
// para a sincronização funcionar. Só precisa deste ficheiro se, mais tarde,
// quiser esconder o link do calendário do Airbnb do código-fonte da página
// (o método simples deixa esse link visível a quem inspecionar a página).
// ============================================================================
//
// O QUE É ISTO:
// Um pequeno "worker" que corre no Cloudflare (gratuito) e que vai buscar,
// de forma automática, as datas já reservadas no seu anúncio do Airbnb.
// O site (index.html, en.html, fr.html, es.html) consulta este worker para
// saber quais as datas ocupadas, além da lista manual BOOKED_RANGES.
//
// PORQUE É QUE ISTO NÃO PODE ESTAR DIRETAMENTE NO index.html:
// 1. Os browsers bloqueiam pedidos diretos ao Airbnb feitos a partir de um
//    site diferente (proteção chamada CORS) — por isso é preciso este passo
//    intermédio, que corre no servidor da Cloudflare, não no browser do hóspede.
// 2. O link de exportação do calendário do Airbnb é privado. Se o colocasse
//    diretamente no HTML do site, qualquer pessoa que veja o código-fonte da
//    página conseguiria vê-lo. Aqui fica escondido, só visível a si.
//
// ============================================================================
// COMO CONFIGURAR (passo a passo):
// ============================================================================
// 1. Obtenha o link de exportação do calendário no Airbnb:
//    - Entre em airbnb.com, vá a "Anúncios" → escolha o MonteZinho
//    - Vá a "Calendário" → "Disponibilidade" → "Sincronizar calendários"
//    - Em "Exportar calendário", copie o link (começa por https://www.airbnb.pt/calendar/ical/...)
//
// 2. Cole esse link na linha AIRBNB_ICAL_URL, aqui em baixo.
//
// 3. Crie uma conta gratuita em https://workers.cloudflare.com
//
// 4. No painel da Cloudflare: "Workers e Pages" → "Criar" → "Criar Worker"
//    - Dê um nome (ex: montezinho-sync) e clique em "Implementar"
//    - Depois clique em "Editar código" e substitua TODO o conteúdo por este
//      ficheiro inteiro (depois de ter colado o seu link no passo 2)
//    - Clique em "Implementar" outra vez
//
// 5. A Cloudflare vai dar-lhe um endereço parecido com:
//    https://montezinho-sync.SEU-NOME.workers.dev
//    Copie esse endereço.
//
// 6. Cole esse endereço na constante AVAILABILITY_SYNC_URL, no início do
//    <script> de cada um dos 4 ficheiros do site (index.html, en.html,
//    fr.html, es.html).
//
// Pronto — o site passa a verificar automaticamente o calendário do Airbnb,
// de hora a hora, sem si precisar de fazer mais nada.
//
// NOTA IMPORTANTE: isto sincroniza apenas as DATAS OCUPADAS. O Airbnb não
// disponibiliza o preço por noite de forma automática — os preços em
// RATE_PERIODS, no site, continuam a ser definidos por si.
// ============================================================================

const AIRBNB_ICAL_URL = 'COLOQUE_AQUI_O_SEU_LINK_ICAL_DO_AIRBNB';

export default {
  async fetch(request, ctx) {
    // Responde aos pedidos de verificação do browser (CORS)
    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders() });
    }

    if (AIRBNB_ICAL_URL.indexOf('COLOQUE_AQUI') !== -1) {
      return jsonResponse({ error: 'AIRBNB_ICAL_URL ainda não foi configurado neste worker.', ranges: [] }, 500);
    }

    try {
      const icalResponse = await fetch(AIRBNB_ICAL_URL, {
        headers: { 'User-Agent': 'MonteZinho-Sync/1.0' }
      });
      if (!icalResponse.ok) {
        return jsonResponse({ error: 'Não foi possível ler o calendário do Airbnb.', ranges: [] }, 502);
      }
      const icalText = await icalResponse.text();
      const ranges = parseICalBusyRanges(icalText);
      return jsonResponse({ ranges: ranges, updated: new Date().toISOString() }, 200, true);
    } catch (err) {
      return jsonResponse({ error: 'Erro ao sincronizar: ' + err.message, ranges: [] }, 500);
    }
  }
};

function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type'
  };
}

function jsonResponse(data, status, cache) {
  const headers = Object.assign(
    { 'Content-Type': 'application/json' },
    corsHeaders()
  );
  if (cache) {
    // Guarda a resposta em cache durante 1 hora, para não sobrecarregar o Airbnb
    headers['Cache-Control'] = 'public, max-age=3600';
  }
  return new Response(JSON.stringify(data), { status: status || 200, headers: headers });
}

// Lê o texto do ficheiro iCal (.ics) e extrai as datas de início/fim de cada reserva.
function parseICalBusyRanges(icalText) {
  const ranges = [];
  const events = icalText.split('BEGIN:VEVENT');
  for (let i = 1; i < events.length; i++) {
    const block = events[i];
    const startMatch = block.match(/DTSTART[^:\r\n]*:(\d{8})/);
    const endMatch = block.match(/DTEND[^:\r\n]*:(\d{8})/);
    if (startMatch && endMatch) {
      ranges.push({
        start: toISODate(startMatch[1]),
        end: toISODate(endMatch[1])
      });
    }
  }
  return ranges;
}

function toISODate(yyyymmdd) {
  return yyyymmdd.slice(0, 4) + '-' + yyyymmdd.slice(4, 6) + '-' + yyyymmdd.slice(6, 8);
}
