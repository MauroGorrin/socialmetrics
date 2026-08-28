import { type NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { getAccessibleReport, signedReportPdfUrl } from '@/server/queries/reports';

/**
 * Serve an already-generated report PDF — a redirect to a short-lived signed
 * Storage URL with a download filename. Never regenerates: a report with no
 * `pdf_url` is a 409, not a build trigger.
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: { id: string } },
): Promise<NextResponse> {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const accessible = await getAccessibleReport(params.id, user.id);
  if (!accessible) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const { report } = accessible;
  if (!report.pdfUrl) {
    return NextResponse.json({ error: 'Report not generated' }, { status: 409 });
  }

  const url = await signedReportPdfUrl(report.pdfUrl, `reporte-${report.periodMonth}.pdf`);
  if (!url) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  return NextResponse.redirect(url, 302);
}
