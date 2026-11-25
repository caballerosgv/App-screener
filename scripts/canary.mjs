#!/usr/bin/env node
/**
 * Canario diario: comprueba contra la red real que las tres fuentes gratuitas
 * de cotización siguen devolviendo el formato que espera la app.
 *
 *   npm run canary
 *
 * Sale con código 1 si alguna fuente cambia el formato, devuelve un error o
 * las fuentes no coinciden entre sí. Un 429 persistente solo avisa: no es un
 * cambio de formato.
 */

import { createMarketClient } from '../server/free-market.mjs';
import { createNasdaqClient } from '../server/nasdaq.mjs';
import { createYahooClient } from '../server/yahoo.mjs';
import { formatReport, runCanary } from '../server/canary.mjs';

const clients = {
  tradingview: { ...createMarketClient(), label: 'TradingView' },
  nasdaq: { ...createNasdaqClient(), label: 'Nasdaq' },
  yahoo: { ...createYahooClient(), label: 'Yahoo Finance' }
};

const report = await runCanary({
  clients,
  retry: { retries: 1, waitMs: 5000 },
  log: (line) => console.log(`  · ${line}`)
});

console.log(formatReport(report));
if (!report.ok) process.exitCode = 1;
