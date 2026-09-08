
export type ComponentCardItem = {
  className: string;
  images: { light: string; dark: string };
};

export type RouteProps = {
  title: string;
  icon?: string;
  href?: string;
  group: boolean;
  roles?: number[];
  card?: ComponentCardItem;
  children?: RouteProps[];
  module?: string;
};

export const components: RouteProps[] = [
  {
    title: 'Clientes',
    icon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="9" cy="8" r="3.5"/><path d="M3 20a6 6 0 0 1 12 0"/><circle cx="17" cy="9" r="2.5"/><path d="M15.5 14.5A5 5 0 0 1 22 19"/></svg>`,
    group: true,
    roles: [2],
    children: [
      {
        title: 'Gestionar Cliente',
        icon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="8" r="3.5"/><path d="M5 20a7 7 0 0 1 14 0"/></svg>`,
        href: 'usuario',
        group: false,
        roles: [2],
        card: {
          className: 'w-56',
          images: { light: 'alerts-light.svg', dark: 'alerts-dark.svg' },
        },
      },
    ],

    card: {
      className: 'w-56',
      images: { light: 'alerts-light.svg', dark: 'alerts-dark.svg' },
    },
  },
  {
    title: 'Atencion al cliente',
    icon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 12a8 8 0 0 1 16 0v4a2 2 0 0 1-2 2h-2v-6h4M4 12v4a2 2 0 0 0 2 2h2v-6H4M12 20v1"/></svg>`,
    group: true,
    roles: [2, 3],
    children: [
      {
        title: 'Crear Ticket',
        icon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 8V6a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v2a2 2 0 0 0 0 4v2a2 2 0 0 0 0 4v2a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2v-2a2 2 0 0 0 0-4v-2a2 2 0 0 0 0-4z"/><path d="M12 9v6M9 12h6"/></svg>`,
        href: 'created-ticket',
        group: false,
        roles: [2, 3],
        card: {
          className: 'w-56',
          images: { light: 'alerts-light.svg', dark: 'alerts-dark.svg' },
        },
      },
      {
        title: 'Ticket',
        icon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 8V6a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v2a2 2 0 0 0 0 4v2a2 2 0 0 0 0 4v2a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2v-2a2 2 0 0 0 0-4v-2a2 2 0 0 0 0-4z"/><path d="M9 12h6"/></svg>`,
        href: 'view-ticket',
        group: false,
        roles: [2, 3],
        card: {
          className: 'w-56',
          images: { light: 'alerts-light.svg', dark: 'alerts-dark.svg' },
        },
      },
      {
        title: 'Instalaciones',
        icon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M14.7 6.3a4 4 0 0 0 5 5L14 17a4 4 0 0 1-5.7 0L4 12.7 9 8a4 4 0 0 1 5.7-1.7z"/></svg>`,
        href: 'installations',
        group: false,
        roles: [2, 3],
        card: {
          className: 'w-56',
          images: { light: 'alerts-light.svg', dark: 'alerts-dark.svg' },
        },
      },
    ],

    card: {
      className: 'w-56',
      images: { light: 'alerts-light.svg', dark: 'alerts-dark.svg' },
    },
  },
  {
    title: 'Finanzas',
    icon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="6" width="18" height="12" rx="2"/><path d="M3 10h18M7 15h3"/></svg>`,
    group: true,
    roles: [2, 4],
    children: [
      {
        title: 'Gestionar Ingresos',
        icon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M12 7v10M9.5 9.5h3.75a1.75 1.75 0 0 1 0 3.5H10.75a1.75 1.75 0 0 0 0 3.5H14.5"/></svg>`,
        href: 'finanzas',
        module: 'finanzas',
        group: false,
        roles: [2, 4],
        card: {
          className: 'w-56',
          images: { light: 'alerts-light.svg', dark: 'alerts-dark.svg' },
        },
      },{
        title: 'Gestionar Egresos',
        icon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 17l6-6 4 4 6-8"/><path d="M14 7h6v6"/></svg>`,
        href: 'egresos',
        module: 'egresos',
        group: false,
        roles: [2, 4],
        card: {
          className: 'w-56',
          images: { light: 'alerts-light.svg', dark: 'alerts-dark.svg' },
        },
      },
      {
        title: 'Métodos de Pago',
        icon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 10h18M7 15h4"/></svg>`,
        href: 'finanzas/metodos-pago',
        module: 'finanzas',
        group: false,
        roles: [2, 4],
        card: {
          className: 'w-56',
          images: { light: 'alerts-light.svg', dark: 'alerts-dark.svg' },
        },
      },

      {
        title: 'Reportes de pagos',
        icon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/></svg>`,
        href: 'report-paid',
        module: 'report-paid',
        group: false,
        roles: [2, 4],
        card: {
          className: 'w-56',
          images: { light: 'alerts-light.svg', dark: 'alerts-dark.svg' },
        },
      },
      {
        title: 'Auditoría de pagos',
        icon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="6"/><path d="m20 20-4.5-4.5M9 11l1.5 1.5L13 9.5"/></svg>`,
        href: 'payment-proof-audit',
        module: 'finanzas',
        group: false,
        roles: [2, 4],
        card: {
          className: 'w-56',
          images: { light: 'alerts-light.svg', dark: 'alerts-dark.svg' },
        },
      },
      {
        title: 'Historial Facturas',
        icon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5M9 13h6M9 17h6"/></svg>`,
        href: 'history-Facture',
        module: 'history-facture',
        group: false,
        roles: [2, 4],
        card: {
          className: 'w-56',
          images: { light: 'alerts-light.svg', dark: 'alerts-dark.svg' },
        },
      },
      {
        title: 'Resumen Financiero',
        icon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 19h16M6 15V9M10 15V5M14 15v-4M18 15V7"/></svg>`,
        href: 'resumen',
        module: 'resumen',
        group: false,
        roles: [2, 4],
        card: {
          className: 'w-56',
          images: { light: 'alerts-light.svg', dark: 'alerts-dark.svg' },
        },
      },
      {
        title: 'Logs de Envío',
        icon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 20l1.3-3.8A8 8 0 1 1 8 19.2L4 20z"/><path d="M9 12h6"/></svg>`,
        href: 'send-logs',
        group: false,
        module: 'finanzas',
        roles: [2, 4],
        card: {
          className: 'w-56',
          images: { light: 'alerts-light.svg', dark: 'alerts-dark.svg' },
        },
      },
    ],
    card: {
      className: 'w-56',
      images: { light: 'alerts-light.svg', dark: 'alerts-dark.svg' },
    },
  },
  {
    title: 'Inventario',
    icon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 8l9-4 9 4-9 4-9-4z"/><path d="M3 8v8l9 4 9-4V8M12 12v8"/></svg>`,
    group: true,
    roles: [2, 4],
    children: [
      {
        title: 'Ítems',
        icon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="4" width="16" height="16" rx="2"/><path d="M4 10h16M10 4v16"/></svg>`,
        href: 'inventory',
        group: false,
        roles: [2, 4],
        card: { className: 'w-56', images: { light: 'alerts-light.svg', dark: 'alerts-dark.svg' } },
      },
      {
        title: 'Categorías',
        icon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 6h16M4 12h10M4 18h6"/></svg>`,
        href: 'inventory/categories',
        group: false,
        roles: [2, 4],
        card: { className: 'w-56', images: { light: 'alerts-light.svg', dark: 'alerts-dark.svg' } },
      },
    ],
    card: { className: 'w-56', images: { light: 'alerts-light.svg', dark: 'alerts-dark.svg' } },
  },
  {
    title: 'Mikrotik',
    icon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="9" width="18" height="8" rx="2"/><path d="M7 13h.01M11 13h.01M15 13h.01M12 9V5M6 5h12"/></svg>`,
    group: true,
    roles: [2],
    children: [
      {
        title: 'Panel & Clientes',
        icon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="9" width="18" height="8" rx="2"/><path d="M7 13h.01M11 13h.01M17 13h1"/></svg>`,
        href: 'mikrotik',
        group: false,
        roles: [2],
        card: { className: 'w-56', images: { light: 'alerts-light.svg', dark: 'alerts-dark.svg' } },
      },
    ],
    card: { className: 'w-56', images: { light: 'alerts-light.svg', dark: 'alerts-dark.svg' } },
  },
  {
    title: 'Admin OLT',
    icon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M5 8h14M5 12h14M5 16h14"/><circle cx="8" cy="8" r="1"/><circle cx="8" cy="12" r="1"/><circle cx="8" cy="16" r="1"/></svg>`,
    group: true,
    roles: [2],
    module: 'olt-admin',
    children: [
      { title: 'Mis OLTs',       href: 'olt',               group: false, module: 'olt-admin', icon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="16" rx="2"/><path d="M7 8h.01M7 12h.01M7 16h.01M11 8h6M11 12h6M11 16h6"/></svg>`, card: { className: 'w-56', images: { light: 'alerts-light.svg', dark: 'alerts-dark.svg' } } },
      { title: 'Dashboard',      href: 'olt/dashboard',     group: false, module: 'olt-admin', icon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="8" height="8" rx="1.5"/><rect x="13" y="3" width="8" height="5" rx="1.5"/><rect x="13" y="11" width="8" height="10" rx="1.5"/><rect x="3" y="14" width="8" height="7" rx="1.5"/></svg>`, card: { className: 'w-56', images: { light: 'alerts-light.svg', dark: 'alerts-dark.svg' } } },
      { title: 'Autorizadas',    href: 'olt/autorizadas',   group: false, module: 'olt-admin', icon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="m8.5 12.5 2.5 2.5 4.5-5"/></svg>`, card: { className: 'w-56', images: { light: 'alerts-light.svg', dark: 'alerts-dark.svg' } } },
      { title: 'Sin Autorizar',  href: 'olt/sin-autorizar', group: false, module: 'olt-admin', icon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M12 8v4M12 16h.01"/></svg>`, card: { className: 'w-56', images: { light: 'alerts-light.svg', dark: 'alerts-dark.svg' } } },
      { title: 'En Línea',       href: 'olt/online',        group: false, module: 'olt-admin', icon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M2 9a15 15 0 0 1 20 0M5.5 12.5a10 10 0 0 1 13 0M9 16a5 5 0 0 1 6 0M12 19h.01"/></svg>`, card: { className: 'w-56', images: { light: 'alerts-light.svg', dark: 'alerts-dark.svg' } } },
      { title: 'Service Ports',  href: 'olt/service-ports', group: false, module: 'olt-admin', icon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 8h16M4 16h16M8 4v8M16 12v8"/></svg>`, card: { className: 'w-56', images: { light: 'alerts-light.svg', dark: 'alerts-dark.svg' } } },
      { title: 'CLI Terminal',   href: 'olt/cli',           group: false, module: 'olt-admin', icon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="16" rx="2"/><path d="m7 9 3 3-3 3M12 15h5"/></svg>`, card: { className: 'w-56', images: { light: 'alerts-light.svg', dark: 'alerts-dark.svg' } } },
      { title: 'Perfiles',       href: 'olt/perfiles',      group: false, module: 'olt-admin', icon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 6a2 2 0 0 1 2-2h4l2 2h6a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2z"/></svg>`, card: { className: 'w-56', images: { light: 'alerts-light.svg', dark: 'alerts-dark.svg' } } },
      { title: 'Configuración',  href: 'olt/config',        group: false, module: 'olt-admin', icon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/></svg>`, card: { className: 'w-56', images: { light: 'alerts-light.svg', dark: 'alerts-dark.svg' } } },
    ],
    card: { className: 'w-56', images: { light: 'alerts-light.svg', dark: 'alerts-dark.svg' } },
  },
  {
    title: 'Configuración',
    icon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/></svg>`,
    group: true,
    roles: [2],
    children: [
      {
        title: 'Equipo de trabajo',
        icon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="9" cy="8" r="3.5"/><path d="M3 20a6 6 0 0 1 12 0M17 11h4M19 9v4"/></svg>`,
        href: 'staff',
        group: false,
        roles: [2],
        card: { className: 'w-56', images: { light: 'alerts-light.svg', dark: 'alerts-dark.svg' } },
      },
      {
        title: 'Facturación',
        icon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M6 3h12v18l-3-2-3 2-3-2-3 2z"/><path d="M9 8h6M9 12h6"/></svg>`,
        href: 'billing-config',
        group: false,
        roles: [2],
        card: { className: 'w-56', images: { light: 'alerts-light.svg', dark: 'alerts-dark.svg' } },
      },
      {
        title: 'Pasarela de Pago',
        icon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 10h18M15 15h2"/></svg>`,
        href: 'payment-gateway',
        group: false,
        module: 'payment-gateway',
        roles: [2],
        card: { className: 'w-56', images: { light: 'alerts-light.svg', dark: 'alerts-dark.svg' } },
      },
      {
        title: 'Contratos',
        icon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5M8 17c1.5-2 3-2 4.5 0S15 19 17 15"/></svg>`,
        href: 'contratos',
        group: false,
        roles: [2],
        card: { className: 'w-56', images: { light: 'alerts-light.svg', dark: 'alerts-dark.svg' } },
      },
      {
        title: 'Empleados',
        icon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="7" width="18" height="13" rx="2"/><path d="M8 7V5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M3 12h18"/></svg>`,
        href: 'empleados',
        group: false,
        roles: [2],
        card: { className: 'w-56', images: { light: 'alerts-light.svg', dark: 'alerts-dark.svg' } },
      },
      {
        title: 'Planes de Internet',
        icon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M2 9a15 15 0 0 1 20 0M5.5 12.5a10 10 0 0 1 13 0M9 16a5 5 0 0 1 6 0M12 19h.01"/></svg>`,
        href: 'planes-internet',
        group: false,
        roles: [2],
        card: { className: 'w-56', images: { light: 'alerts-light.svg', dark: 'alerts-dark.svg' } },
      },
    ],
    card: { className: 'w-56', images: { light: 'alerts-light.svg', dark: 'alerts-dark.svg' } },
  },
  {
    title: 'CRM WhatsApp',
    icon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 20l1.3-3.8A8 8 0 1 1 8 19.2L4 20z"/></svg>`,
    group: true,
    roles: [2, 3],
    children: [
      {
        title: 'Bandeja de entrada',
        icon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 13l2.5-7h13L21 13v5a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><path d="M3 13h5l1.5 2h5L16 13h5"/></svg>`,
        href: 'crm/inbox',
        group: false,
        roles: [2, 3],
        card: { className: 'w-56', images: { light: 'alerts-light.svg', dark: 'alerts-dark.svg' } },
      },
    ],
    card: { className: 'w-56', images: { light: 'alerts-light.svg', dark: 'alerts-dark.svg' } },
  },
  {
    title: 'Admin WhatsApp',
    icon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 20l1.3-3.8A8 8 0 1 1 8 19.2L4 20z"/><path d="M9.5 12h5"/></svg>`,
    group: true,
    roles: [2],
    children: [
      {
        title: 'Dashboard',
        icon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="8" height="8" rx="1.5"/><rect x="13" y="3" width="8" height="5" rx="1.5"/><rect x="13" y="11" width="8" height="10" rx="1.5"/><rect x="3" y="14" width="8" height="7" rx="1.5"/></svg>`,
        href: 'whatsapp',
        group: false,
        roles: [2],
        card: { className: 'w-56', images: { light: 'alerts-light.svg', dark: 'alerts-dark.svg' } },
      },
      {
        title: 'WhatsApp Web (QR)',
        icon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="4" width="6" height="6"/><rect x="14" y="4" width="6" height="6"/><rect x="4" y="14" width="6" height="6"/><path d="M14 14h2v2h-2zM18 14h2v2h-2zM14 18h2v2h-2zM18 18h2v2h-2z"/></svg>`,
        href: 'whatsapp/netplay',
        group: false,
        roles: [2],
        card: { className: 'w-56', images: { light: 'alerts-light.svg', dark: 'alerts-dark.svg' } },
      },
      {
        title: 'API Meta',
        icon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18"/></svg>`,
        href: 'whatsapp/meta',
        group: false,
        roles: [2],
        card: { className: 'w-56', images: { light: 'alerts-light.svg', dark: 'alerts-dark.svg' } },
      },
    ],
    card: { className: 'w-56', images: { light: 'alerts-light.svg', dark: 'alerts-dark.svg' } },
  },
  {
    title: 'Mapa de Técnicos',
    icon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 21s-6-5.5-6-10a6 6 0 0 1 12 0c0 4.5-6 10-6 10z"/><circle cx="12" cy="11" r="2"/></svg>`,
    href: 'technician-map',
    module: 'technician-map',
    group: false,
    roles: [2],
    card: { className: 'w-56', images: { light: 'alerts-light.svg', dark: 'alerts-dark.svg' } },
  },
];

