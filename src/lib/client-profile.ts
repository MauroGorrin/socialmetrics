import type { ReportProfile } from '@/lib/metrics';

/**
 * The client's management profile and the platform vocabulary that goes with
 * it. Shared by the create dialog, the client detail form, the server actions
 * and onboarding so the options never drift apart.
 */

export const REPORT_PROFILES = ['organic', 'ads', 'mixed'] as const satisfies ReportProfile[];

export const PROFILE_LABELS: Record<ReportProfile, string> = {
  organic: 'Orgánico',
  ads: 'Ads',
  mixed: 'Ambos',
};

export const PROFILE_DESCRIPTIONS: Record<ReportProfile, string> = {
  organic: 'Gestión de redes: seguidores, alcance, interacciones, contenido.',
  ads: 'Gestión de pauta: inversión, clics, conversiones, ROAS.',
  mixed: 'Ambos servicios, en un mismo reporte.',
};

export const PLATFORM_OPTIONS = [
  { value: 'meta', label: 'Meta' },
  { value: 'google_ads', label: 'Google Ads' },
  { value: 'tiktok', label: 'TikTok' },
  { value: 'instagram', label: 'Instagram' },
  { value: 'facebook', label: 'Facebook' },
  { value: 'youtube', label: 'YouTube' },
  { value: 'linkedin', label: 'LinkedIn' },
] as const;

export type Platform = (typeof PLATFORM_OPTIONS)[number]['value'];

export const PLATFORMS = PLATFORM_OPTIONS.map((option) => option.value) as [Platform, ...Platform[]];

export const PLATFORM_LABELS: Record<string, string> = Object.fromEntries(
  PLATFORM_OPTIONS.map((option) => [option.value, option.label]),
);

/** Platforms that make sense for a given profile — narrows the select. */
export const PLATFORMS_BY_PROFILE: Record<ReportProfile, Platform[]> = {
  organic: ['instagram', 'tiktok', 'facebook', 'youtube', 'linkedin'],
  ads: ['meta', 'google_ads', 'tiktok', 'linkedin'],
  mixed: ['meta', 'google_ads', 'instagram', 'tiktok', 'facebook', 'youtube', 'linkedin'],
};

export function platformOptionsFor(profile: ReportProfile): ReadonlyArray<{
  value: Platform;
  label: string;
}> {
  const allowed = new Set(PLATFORMS_BY_PROFILE[profile]);
  return PLATFORM_OPTIONS.filter((option) => allowed.has(option.value));
}
