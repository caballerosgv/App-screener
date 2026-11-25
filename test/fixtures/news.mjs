/** Feeds RSS de noticias simulados (Yahoo Finance y Google News). */

export const YAHOO_RSS = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <title>Yahoo Finance</title>
    <item>
      <title>Apple (AAPL) Pushes Back As 24/7 Tokenized Shares Trading Opens</title>
      <link>https://example.test/aapl-1</link>
      <pubDate>Wed, 25 Nov 2026 21:11:47 +0000</pubDate>
      <description>Shares of &lt;b&gt;Apple&lt;/b&gt; rise after the announcement.</description>
    </item>
    <item>
      <title>Chips and iPhones Are Safe From New Tariffs</title>
      <link>https://example.test/aapl-2</link>
      <pubDate>Wed, 25 Nov 2026 20:47:00 +0000</pubDate>
      <description><![CDATA[<p>Details on the new tariff list.</p>]]></description>
    </item>
  </channel>
</rss>`;

export const GOOGLE_RSS = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <title>"ASML stock" - Google News</title>
    <item>
      <title>ASML wins a record order - Reuters</title>
      <link>https://news.google.com/rss/articles/abc</link>
      <pubDate>Tue, 24 Nov 2026 08:00:00 GMT</pubDate>
      <description>ASML sold a record number of machines.</description>
    </item>
  </channel>
</rss>`;

export const EMPTY_RSS = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0"><channel><title>Sin titulares</title></channel></rss>`;

/** Fetch simulado que sirve los RSS según el host; `fail` hace caer el host. */
export function fakeNewsFetch({ yahoo = YAHOO_RSS, google = GOOGLE_RSS, fail = null } = {}) {
  const calls = [];
  const fetchImpl = async (input) => {
    const url = new URL(String(input));
    calls.push(url);
    const host = url.host;
    if (fail && host.includes(fail)) throw new Error('sin conexión');
    const body = host.includes('finance.yahoo.com') ? yahoo : host.includes('news.google.com') ? google : null;
    if (body === null) return { ok: false, status: 404, text: async () => '' };
    return { ok: true, status: 200, text: async () => body };
  };
  return { calls, fetchImpl };
}
