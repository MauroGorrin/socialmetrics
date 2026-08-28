import 'server-only';

import type { Browser } from 'puppeteer-core';

/**
 * Render a self-contained HTML string to a PDF Buffer with headless Chrome.
 *
 * The HTML must carry everything it needs inline — no external CSS, fonts, or
 * images, no network calls — so `setContent` settles immediately and the PDF
 * never renders a half-loaded frame (blueprint non-goal §7).
 *
 * Serverless (Vercel/Lambda) uses `@sparticuz/chromium`'s packaged binary via
 * `puppeteer-core`; local dev uses the full `puppeteer` and its bundled Chrome
 * (or `PUPPETEER_EXECUTABLE_PATH`).
 */

const PDF_MARGINS = { top: '16mm', bottom: '16mm', left: '14mm', right: '14mm' };

const isServerless = Boolean(
  process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME || process.env.AWS_EXECUTION_ENV,
);

async function launchBrowser(): Promise<Browser> {
  if (isServerless) {
    const chromium = (await import('@sparticuz/chromium')).default;
    const puppeteer = await import('puppeteer-core');
    // No GPU work for a PDF — keeps cold starts and memory down.
    chromium.setGraphicsMode = false;
    return puppeteer.launch({
      args: chromium.args,
      executablePath: await chromium.executablePath(),
      headless: true,
    });
  }

  const puppeteer = await import('puppeteer');
  const browser = await puppeteer.launch({
    headless: true,
    executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || undefined,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });
  return browser as unknown as Browser;
}

export async function htmlToPdf(html: string): Promise<Buffer> {
  const browser = await launchBrowser();

  try {
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: 'load', timeout: 20_000 });
    const pdf = await page.pdf({
      format: 'A4',
      printBackground: true,
      margin: PDF_MARGINS,
    });
    return Buffer.from(pdf);
  } finally {
    await browser.close();
  }
}
