import 'server-only';

import puppeteer from 'puppeteer';

/**
 * Render a self-contained HTML string to a PDF Buffer with headless Chrome.
 *
 * The HTML must carry everything it needs inline — no external CSS, fonts, or
 * images, no network calls — so `setContent` settles immediately and the PDF
 * never renders a half-loaded frame (blueprint non-goal §7).
 */

const PDF_MARGINS = { top: '16mm', bottom: '16mm', left: '14mm', right: '14mm' };

export async function htmlToPdf(html: string): Promise<Buffer> {
  const browser = await puppeteer.launch({
    headless: true,
    executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || undefined,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });

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
