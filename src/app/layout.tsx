import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { ThemeProvider, themeInitScript } from '@/components/layout/theme-provider';
import '@/styles/globals.css';

export const metadata: Metadata = {
  title: 'Reportes App',
  description: 'Branded monthly client reports from social media and ads metrics.',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="es" suppressHydrationWarning>
      <head>
        {/* Runs before first paint: sets data-theme so colors never flash. */}
        {/* biome-ignore lint/security/noDangerouslySetInnerHtml: static, build-time constant */}
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
      </head>
      <body>
        <ThemeProvider>{children}</ThemeProvider>
      </body>
    </html>
  );
}
