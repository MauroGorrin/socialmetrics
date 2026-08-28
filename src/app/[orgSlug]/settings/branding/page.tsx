import { notFound, redirect } from 'next/navigation';
import { updateBrandingAction } from '@/app/[orgSlug]/settings/branding/actions';
import { getCurrentUser } from '@/lib/auth';
import { getAccessibleOrg } from '@/server/queries/orgs';

const FIELD =
  'rounded border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-sm text-[var(--fg)] outline-none focus:border-[var(--fg-muted)]';

const NOTICES: Record<string, string> = {
  saved: 'Branding actualizado. Los reportes pendientes se regeneraron.',
  'error:save': 'No se pudo guardar el branding.',
  'error:type': 'Formato no soportado. Usa PNG, JPG, SVG o WebP.',
  'error:forbidden': 'Necesitas rol de administrador.',
};

export default async function BrandingPage({
  params,
  searchParams,
}: {
  params: { orgSlug: string };
  searchParams: { saved?: string; error?: string };
}) {
  const user = await getCurrentUser();
  if (!user) redirect(`/auth/signin?redirect=/${params.orgSlug}/settings/branding`);

  const access = await getAccessibleOrg(params.orgSlug, user.id);
  if (!access) notFound();

  const canEdit = access.role === 'owner' || access.role === 'admin';
  const noticeKey = searchParams.saved
    ? 'saved'
    : searchParams.error
      ? `error:${searchParams.error}`
      : null;
  const notice = noticeKey ? NOTICES[noticeKey] : null;

  return (
    <section className="max-w-xl space-y-6">
      <h1 className="text-2xl font-bold text-[var(--fg)]">Branding</h1>

      {notice ? (
        <p className="rounded border border-[var(--border)] bg-[var(--surface)] p-3 text-sm text-[var(--fg)]">
          {notice}
        </p>
      ) : null}

      <div className="space-y-2">
        <p className="text-sm text-[var(--fg-muted)]">Logo actual</p>
        {access.org.logoUrl ? (
          // biome-ignore lint/performance/noImgElement: external Storage URL, not a bundled/optimizable asset
          <img
            src={access.org.logoUrl}
            alt={access.org.name}
            className="max-h-16 rounded border border-[var(--border)] bg-white p-2"
          />
        ) : (
          <p className="text-sm text-[var(--fg)]">Sin logo</p>
        )}
      </div>

      {canEdit ? (
        <form action={updateBrandingAction} className="flex flex-col gap-4">
          <input type="hidden" name="orgSlug" value={params.orgSlug} />

          <label className="flex flex-col gap-1 text-sm text-[var(--fg)]">
            Nuevo logo (PNG, JPG, SVG o WebP · máx 2 MB)
            <input
              type="file"
              name="logo"
              accept="image/png,image/jpeg,image/svg+xml,image/webp"
              className={FIELD}
            />
          </label>

          <label className="flex flex-col gap-1 text-sm text-[var(--fg)]">
            Texto del pie de página
            <input
              name="footerText"
              type="text"
              maxLength={200}
              defaultValue={access.org.footerText ?? ''}
              placeholder={access.org.name}
              className={FIELD}
            />
          </label>

          <label className="flex items-center gap-2 text-sm text-[var(--fg)]">
            <input type="checkbox" name="removeLogo" />
            Quitar el logo actual
          </label>

          <button
            type="submit"
            className="self-start rounded bg-[var(--primary)] px-4 py-2 text-sm font-medium text-[var(--primary-fg)] transition-opacity duration-150 hover:opacity-90"
          >
            Guardar
          </button>
        </form>
      ) : (
        <p className="text-sm text-[var(--fg-muted)]">
          Solo los administradores pueden editar el branding.
        </p>
      )}
    </section>
  );
}
