/**
 * Fixtures de XBRL de la SEC: un `companyfacts` mínimo pero realista, con dos
 * ejercicios, un trimestre suelto y un duplicado presentado más tarde.
 */

export const CIK = '0000320193';

const entry = (start, end, val, filed = '2026-02-01') => ({ start, end, val, form: '10-K', fp: 'FY', filed });

export function companyFacts() {
  return {
    cik: 320193,
    entityName: 'Apple Inc.',
    facts: {
      'us-gaap': {
        RevenueFromContractWithCustomerExcludingAssessedTax: {
          units: {
            USD: [
              entry('2023-10-01', '2024-09-28', 391_035_000_000, '2026-02-01'),
              entry('2024-09-29', '2025-09-27', 416_161_000_000, '2026-02-01'),
              // Trimestre: se ignora por no cubrir un ejercicio completo.
              { start: '2025-06-29', end: '2025-09-27', val: 102_466_000_000, form: '10-K', fp: 'FY', filed: '2026-02-01' },
              // Duplicado del mismo ejercicio presentado después: gana el último.
              entry('2024-09-29', '2025-09-27', 416_000_000_000, '2026-03-01')
            ]
          }
        },
        NetIncomeLoss: {
          units: {
            USD: [
              entry('2023-10-01', '2024-09-28', 93_736_000_000),
              entry('2024-09-29', '2025-09-27', 112_010_000_000)
            ]
          }
        },
        StockholdersEquity: {
          units: {
            USD: [
              { end: '2024-09-28', val: 56_950_000_000, form: '10-K', fp: 'FY', filed: '2026-02-01' },
              { end: '2025-09-27', val: 73_733_000_000, form: '10-K', fp: 'FY', filed: '2026-02-01' }
            ]
          }
        },
        Assets: {
          units: {
            USD: [
              { end: '2024-09-28', val: 364_980_000_000, form: '10-K', fp: 'FY', filed: '2026-02-01' },
              { end: '2025-09-27', val: 359_241_000_000, form: '10-K', fp: 'FY', filed: '2026-02-01' }
            ]
          }
        },
        Liabilities: {
          units: {
            USD: [
              { end: '2024-09-28', val: 308_030_000_000, form: '10-K', fp: 'FY', filed: '2026-02-01' },
              { end: '2025-09-27', val: 285_508_000_000, form: '10-K', fp: 'FY', filed: '2026-02-01' }
            ]
          }
        },
        NetCashProvidedByUsedInOperatingActivities: {
          units: {
            USD: [
              entry('2023-10-01', '2024-09-28', 118_254_000_000),
              entry('2024-09-29', '2025-09-27', 111_482_000_000)
            ]
          }
        },
        PaymentsToAcquirePropertyPlantAndEquipment: {
          units: {
            USD: [
              entry('2023-10-01', '2024-09-28', 9_447_000_000),
              entry('2024-09-29', '2025-09-27', 12_715_000_000)
            ]
          }
        }
      },
      dei: {
        EntityCommonStockSharesOutstanding: {
          units: {
            shares: [
              { end: '2024-10-18', val: 15_204_137_000, form: '10-K', fp: 'FY', filed: '2026-02-01' },
              { end: '2025-10-17', val: 14_840_000_000, form: '10-K', fp: 'FY', filed: '2026-02-01' }
            ]
          }
        }
      }
    }
  };
}

/** Respuestas de la SEC para `createSecXbrlClient` sin red. */
export function fakeSecXbrlFetch({ facts = companyFacts(), status = 200 } = {}) {
  const calls = [];
  const fetchImpl = async (input) => {
    const url = new URL(String(input));
    calls.push(url);
    if (status !== 200) return { ok: false, status, json: async () => ({}) };
    if (url.pathname.endsWith('/company_tickers.json')) {
      return {
        ok: true,
        status: 200,
        json: async () => ({
          0: { cik_str: 320193, ticker: 'AAPL', title: 'Apple Inc.' },
          1: { cik_str: 789019, ticker: 'MSFT', title: 'Microsoft Corp' }
        })
      };
    }
    if (url.pathname.includes('/companyfacts/CIK')) return { ok: true, status: 200, json: async () => facts };
    return { ok: false, status: 404, json: async () => ({}) };
  };
  return { calls, fetchImpl };
}
