/**
 * Constructor de estados financieros de prueba.
 *
 * Devuelve la forma que espera `buildAnalysis` (General, Highlights y las tres
 * cuentas anuales de EODHD) con valores deterministas, para poder fijar el
 * contrato de cada factor sin red ni fixtures gigantes.
 */
export function buildFundamentals({
  years = 6,
  revenue = (i) => 100 * 1.1 ** i,
  grossMargin = () => 0.6,
  ebitMargin = () => 0.2,
  netMargin = () => 0.15,
  ebitdaMargin = () => 0.25,
  interestMargin = () => 0.01,
  debt = () => 40,
  equity = () => 200,
  cash = () => 100,
  shares = () => 100,
  fcfMargin = () => 0.18,
  dividendPayout = () => 0.2,
  sector = 'Technology',
  marketCap = 2000,
  per = 20,
  dividendYield = 0.01
} = {}) {
  const dates = Array.from({ length: years }, (_, i) => `${2019 + i}-12-31`);
  const income = {};
  const balance = {};
  const cashflow = {};

  dates.forEach((date, i) => {
    const rev = revenue(i);
    const fcf = rev * fcfMargin(i);
    income[date] = {
      totalRevenue: rev,
      grossProfit: rev * grossMargin(i),
      ebit: rev * ebitMargin(i),
      netIncome: rev * netMargin(i),
      incomeBeforeTax: rev * 0.25,
      incomeTaxExpense: rev * 0.05,
      ebitda: rev * ebitdaMargin(i),
      interestExpense: -rev * interestMargin(i)
    };
    balance[date] = {
      shortLongTermDebtTotal: debt(i),
      totalStockholderEquity: equity(i),
      cashAndShortTermInvestments: cash(i),
      commonStockSharesOutstanding: shares(i)
    };
    cashflow[date] = { freeCashFlow: fcf, dividendsPaid: -fcf * dividendPayout(i) };
  });

  return {
    General: { Name: 'Contrato S.A.', Sector: sector, Industry: 'Software', CurrencyCode: 'USD', Exchange: 'US' },
    Highlights: {
      MarketCapitalization: marketCap,
      PERatio: per,
      DividendYield: dividendYield,
      ReturnOnEquityTTM: 0.3,
      OperatingMarginTTM: 0.2,
      EBITDA: 40
    },
    Financials: {
      Income_Statement: { yearly: income },
      Balance_Sheet: { yearly: balance },
      Cash_Flow: { yearly: cashflow }
    }
  };
}
