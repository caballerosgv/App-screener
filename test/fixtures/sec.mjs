/** Fixtures de SEC EDGAR para las pruebas de insiders, sin red. */

export const TICKERS = {
  '0': { cik_str: 320193, ticker: 'AAPL', title: 'Apple Inc.' },
  '1': { cik_str: 1067983, ticker: 'BRK-B', title: 'Berkshire Hathaway Inc.' }
};

const tx = (code, shares, price, date = '2026-11-18', title = 'Common Stock') => `
  <nonDerivativeTransaction>
    <securityTitle><value>${title}</value></securityTitle>
    <transactionDate><value>${date}</value></transactionDate>
    <transactionCoding><transactionCode>${code}</transactionCode></transactionCoding>
    <transactionAmounts>
      <transactionShares><value>${shares}</value></transactionShares>
      <transactionPricePerShare><value>${price}</value></transactionPricePerShare>
    </transactionAmounts>
  </nonDerivativeTransaction>`;

/** Form 4 con una tabla de derivados que debe ignorarse. */
export const form4 = (owner, plan, rows) => `<?xml version="1.0"?>
<ownershipDocument>
  ${plan === null ? '' : `<aff10b5One>${plan}</aff10b5One>`}
  <reportingOwner>
    <reportingOwnerId><rptOwnerName>${owner}</rptOwnerName></reportingOwnerId>
  </reportingOwner>
  <nonDerivativeTable>${rows}</nonDerivativeTable>
  <derivativeTable>
    <derivativeTransaction>
      <transactionCoding><transactionCode>P</transactionCode></transactionCoding>
      <transactionAmounts><transactionShares><value>9999</value></transactionShares></transactionAmounts>
    </derivativeTransaction>
  </derivativeTable>
</ownershipDocument>`;

export const txRow = tx;

export const ACCESSIONS = {
  original: '000032019326000001',
  amendment: '000032019326000002',
  old: '000032019326000003',
  noPlan: '000032019326000005',
  plannedSale: '000032019326000006'
};

export const SUBMISSIONS = {
  filings: {
    recent: {
      form: ['4', '10-K', '4/A', '4', 'SC 13G', '4', '4'],
      accessionNumber: [
        '0000320193-26-000001',
        '0000320193-26-000000',
        '0000320193-26-000002',
        '0000320193-26-000003',
        '0000320193-26-000004',
        '0000320193-26-000005',
        '0000320193-26-000006'
      ],
      filingDate: ['2026-11-18', '2026-10-30', '2026-11-20', '2020-01-10', '2026-11-01', '2026-11-21', '2026-11-22'],
      primaryDocument: ['doc1.htm', 'aapl-10k.htm', 'doc2.htm', 'old.htm', 'sc13g.htm', 'doc5.htm', 'doc6.htm']
    }
  }
};

export const DOCS = {
  [ACCESSIONS.original]: { 'form4.xml': form4('Jane Doe', '1', tx('P', 1000, 150.5) + tx('S', 200, 151) + tx('A', 50, 0, '2026-11-17')) },
  // La enmienda 4/A repite la compra y añade una venta distinta.
  [ACCESSIONS.amendment]: { 'form4.xml': form4('Jane Doe', '1', tx('P', 1000, 150.5) + tx('S', 250, 152, '2026-11-19')) },
  [ACCESSIONS.old]: { 'form4.xml': form4('Jane Doe', '1', tx('P', 50, 10, '2020-01-09')) },
  [ACCESSIONS.noPlan]: { 'form4.xml': form4('John Roe', null, tx('S', 10, 100, '2026-11-21')) },
  [ACCESSIONS.plannedSale]: { 'form4.xml': form4('John Roe', '0', tx('S', 5, 99, '2026-11-22')) }
};

const okText = (value, contentType = 'application/json') => ({
  ok: true,
  status: 200,
  headers: { get: () => contentType },
  text: async () => (typeof value === 'string' ? value : JSON.stringify(value))
});

/** Fetch simulado: enruta company_tickers, submissions, index.json y los XML. */
export function fakeSecFetch({ tickers = TICKERS, submissions = SUBMISSIONS, docs = DOCS, failWith = null } = {}) {
  const calls = [];
  const fetchImpl = async (url) => {
    const target = String(url);
    calls.push(target);
    if (failWith) return { ok: false, status: failWith, text: async () => '' };
    if (target.includes('company_tickers.json')) return okText(tickers);
    if (target.includes('/submissions/CIK')) return okText(submissions);
    if (/\/index\.json$/.test(target)) {
      return okText({ directory: { item: [{ name: 'form4.xml' }, { name: 'FilingSummary.xml' }, { name: 'index.json' }] } });
    }
    const match = target.match(/edgar\/data\/(\d+)\/(\d+)\/([^/]+)$/);
    if (match) {
      const content = docs[match[2]] && docs[match[2]][match[3]];
      if (content) return okText(content, 'application/xml');
      return { ok: false, status: 404, text: async () => '' };
    }
    return { ok: false, status: 404, text: async () => '' };
  };
  return { calls, fetchImpl };
}
