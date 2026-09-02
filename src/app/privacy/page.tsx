import Link from 'next/link';
import type { ReactNode } from 'react';

/**
 * Public privacy policy. Reachable without auth (see `isPublicPath` in
 * `src/middleware.ts`) because it is linked from the Meta / Google OAuth
 * consent screens and from the App Review submission. Fully static server
 * component, themed off the CSS custom properties in `globals.css`.
 */

export const metadata = {
  title: 'Política de privacidad — Reportes App',
  description:
    'Cómo Reportes App recopila, usa, almacena y protege los datos de las agencias y de sus clientes, incluidas las métricas obtenidas de Meta Ads y Google Ads.',
};

const UPDATED = '2 de septiembre de 2026';
const CONTACT_EMAIL = 'maurogorrin55@gmail.com';

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="mt-10">
      <h2 className="text-xl font-bold tracking-tight text-[var(--fg)]">{title}</h2>
      <div className="mt-3 space-y-3 text-sm leading-relaxed text-[var(--fg-muted)]">{children}</div>
    </section>
  );
}

export default function PrivacyPage() {
  return (
    <div className="min-h-[100dvh] bg-[var(--background)]">
      <header className="border-b border-[var(--border)] bg-[var(--background)]">
        <div className="mx-auto flex h-14 w-full max-w-3xl items-center justify-between px-4">
          <Link href="/" className="text-base font-bold tracking-tight text-[var(--fg)]">
            Reportes<span className="text-[var(--fg-muted)]"> App</span>
          </Link>
          <Link
            href="/"
            className="text-sm text-[var(--fg-muted)] transition-opacity duration-150 hover:opacity-70"
          >
            Inicio
          </Link>
        </div>
      </header>

      <main className="mx-auto w-full max-w-3xl px-4 py-16">
        <h1 className="text-3xl font-bold tracking-tight text-[var(--fg)]">Política de privacidad</h1>
        <p className="mt-3 text-sm text-[var(--fg-muted)]">Última actualización: {UPDATED}</p>

        <p className="mt-6 text-sm leading-relaxed text-[var(--fg-muted)]">
          Reportes App (&ldquo;el Servicio&rdquo;) es una plataforma que usan agencias y consultores
          de marketing para generar reportes mensuales con su marca a partir de las métricas de redes
          sociales y de campañas publicitarias de sus clientes. Esta política explica qué datos
          tratamos, con qué fin, durante cuánto tiempo y qué derechos tienes sobre ellos.
        </p>

        <Section title="1. Quién es responsable de los datos">
          <p>
            El responsable del tratamiento es el operador de Reportes App. Para cualquier consulta
            sobre privacidad puedes escribir a{' '}
            <a href={`mailto:${CONTACT_EMAIL}`} className="text-[var(--fg)] underline">
              {CONTACT_EMAIL}
            </a>
            .
          </p>
          <p>
            Cuando una agencia carga datos de sus propios clientes, la agencia actúa como responsable
            de esos datos y Reportes App los trata por su cuenta como encargado del tratamiento.
          </p>
        </Section>

        <Section title="2. Datos que recopilamos">
          <p>
            <strong className="text-[var(--fg)]">Datos de cuenta.</strong> Nombre, dirección de
            correo electrónico y contraseña cifrada de las personas que crean una cuenta, más el
            nombre de la organización y los roles de cada miembro del equipo.
          </p>
          <p>
            <strong className="text-[var(--fg)]">Datos de clientes cargados por la agencia.</strong>{' '}
            Nombre del cliente, sector, logo y datos de contacto que la agencia decide introducir para
            armar sus reportes.
          </p>
          <p>
            <strong className="text-[var(--fg)]">Métricas de marketing.</strong> Valores mensuales o
            diarios de indicadores como impresiones, clics, inversión, conversiones y valor de
            conversión, ya sea introducidos manualmente, importados desde una planilla, o
            sincronizados desde las APIs de las plataformas publicitarias (ver sección 4).
          </p>
          <p>
            <strong className="text-[var(--fg)]">Datos técnicos.</strong> Registros de acceso,
            dirección IP y tipo de navegador, usados para seguridad y para diagnosticar errores.
          </p>
          <p>No recopilamos categorías especiales de datos personales ni datos de menores.</p>
        </Section>

        <Section title="3. Para qué usamos los datos">
          <ul className="list-disc space-y-1.5 pl-5">
            <li>Prestar el Servicio: autenticar usuarios, mostrar paneles y generar los reportes.</li>
            <li>Sincronizar automáticamente las métricas publicitarias que la agencia autoriza.</li>
            <li>Enviar correos transaccionales (invitaciones de equipo, recuperación de contraseña).</li>
            <li>Mantener la seguridad, prevenir abusos y cumplir obligaciones legales.</li>
          </ul>
          <p>
            No vendemos datos personales ni los usamos para publicidad de terceros ni para
            entrenar modelos de inteligencia artificial.
          </p>
        </Section>

        <Section title="4. Integraciones con Meta Ads y Google Ads">
          <p>
            Una agencia puede conectar su propia cuenta de Meta (Facebook) o de Google para que el
            Servicio importe las métricas de las cuentas publicitarias a las que esa agencia tiene
            acceso. La conexión se hace mediante OAuth y el Servicio solicita únicamente permisos de{' '}
            <strong className="text-[var(--fg)]">lectura</strong>:
          </p>
          <ul className="list-disc space-y-1.5 pl-5">
            <li>
              <strong className="text-[var(--fg)]">Meta:</strong> permiso <code>ads_read</code>. Se
              leen el listado de cuentas publicitarias y las estadísticas agregadas por día
              (impresiones, clics, inversión, conversiones y valor de conversión).
            </li>
            <li>
              <strong className="text-[var(--fg)]">Google Ads:</strong> alcance{' '}
              <code>https://www.googleapis.com/auth/adwords</code>. Se leen el listado de cuentas
              accesibles y las mismas métricas agregadas por día.
            </li>
          </ul>
          <p>
            El Servicio <strong className="text-[var(--fg)]">no</strong> crea, modifica ni pausa
            campañas, no accede a datos personales de los usuarios finales de esos anuncios y no lee
            mensajes, contactos ni contenido orgánico del perfil.
          </p>
          <p>
            Los tokens de acceso y de actualización se guardan cifrados (AES-256-GCM) y se usan solo
            para las sincronizaciones. La agencia puede desconectar una integración en cualquier
            momento desde la ficha del cliente; al hacerlo se eliminan los tokens almacenados. El uso
            de la información obtenida de las APIs de Meta y de Google se ajusta a las políticas para
            desarrolladores de cada plataforma.
          </p>
        </Section>

        <Section title="5. Con quién compartimos datos">
          <p>
            Compartimos datos únicamente con los proveedores de infraestructura que hacen funcionar
            el Servicio, cada uno como encargado del tratamiento y bajo contrato:
          </p>
          <ul className="list-disc space-y-1.5 pl-5">
            <li>
              <strong className="text-[var(--fg)]">Supabase</strong> — base de datos y autenticación.
            </li>
            <li>
              <strong className="text-[var(--fg)]">Vercel</strong> — alojamiento de la aplicación.
            </li>
            <li>
              <strong className="text-[var(--fg)]">Resend</strong> — envío de correos transaccionales.
            </li>
          </ul>
          <p>
            También podemos divulgar datos si la ley lo exige o para proteger nuestros derechos. Si
            el Servicio cambiara de titularidad, los datos se transferirían con las mismas
            obligaciones de esta política.
          </p>
        </Section>

        <Section title="6. Dónde se almacenan y por cuánto tiempo">
          <p>
            Los datos se alojan en servidores de la Unión Europea. Conservamos los datos de cuenta y
            los datos de clientes mientras la cuenta esté activa. Las métricas sincronizadas se
            conservan mientras la integración siga conectada y el cliente exista.
          </p>
          <p>
            Cuando se elimina una cuenta u organización, sus datos se borran de forma permanente en
            un plazo de 30 días, salvo los registros que debamos conservar por obligación legal.
          </p>
        </Section>

        <Section title="7. Seguridad">
          <p>
            Usamos cifrado en tránsito (HTTPS) y en reposo para los datos sensibles, control de
            acceso por organización y rol, y aislamiento estricto entre los datos de cada agencia.
            Ningún sistema es infalible, pero trabajamos para proteger la información con medidas
            técnicas y organizativas razonables.
          </p>
        </Section>

        <Section title="8. Tus derechos">
          <p>
            Según tu jurisdicción, puedes tener derecho a acceder, rectificar, exportar o eliminar tus
            datos personales, así como a oponerte o limitar su tratamiento. Para ejercerlos escribe a{' '}
            <a href={`mailto:${CONTACT_EMAIL}`} className="text-[var(--fg)] underline">
              {CONTACT_EMAIL}
            </a>
            . Si eres cliente de una agencia y quieres ejercer tus derechos sobre los datos que ella
            cargó, contáctala directamente; te ayudaremos a canalizar la solicitud.
          </p>
        </Section>

        <Section title="9. Cambios en esta política">
          <p>
            Podemos actualizar esta política para reflejar cambios en el Servicio o en la normativa.
            Publicaremos la versión vigente en esta página con su fecha de actualización y, si el
            cambio es sustancial, lo avisaremos por correo.
          </p>
        </Section>

        <Section title="10. Contacto">
          <p>
            Para cualquier pregunta sobre esta política o sobre el tratamiento de tus datos, escribe a{' '}
            <a href={`mailto:${CONTACT_EMAIL}`} className="text-[var(--fg)] underline">
              {CONTACT_EMAIL}
            </a>
            .
          </p>
        </Section>
      </main>

      <footer className="border-t border-[var(--border)]">
        <div className="mx-auto w-full max-w-3xl px-4 py-8 text-sm text-[var(--fg-muted)]">
          © {new Date().getFullYear()} Reportes App
        </div>
      </footer>
    </div>
  );
}
