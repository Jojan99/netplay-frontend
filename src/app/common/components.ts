
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
    icon: '<svg stroke="currentColor" fill="none" stroke-width="1.5" viewBox="0 0 24 24" class="h-5 w-5 transition-colors duration-200" xmlns="http://www.w3.org/2000/svg"><path stroke-linecap="round" stroke-linejoin="round" d="M15 19.128a9.38 9.38 0 002.625.372 9.337 9.337 0 004.121-.952 4.125 4.125 0 00-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 018.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0111.964-3.07M12 6.375a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zm8.25 2.25a2.625 2.625 0 11-5.25 0 2.625 2.625 0 015.25 0z"/></svg>',
    group: true,
    roles: [2],
    children: [
      {
        title: 'Gestionar Cliente',
        icon: `<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="w-6 h-6">
    <path stroke-linecap="round" stroke-linejoin="round" d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.325.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 0 1 1.37.49l1.296 2.247a1.125 1.125 0 0 1-.26 1.431l-1.003.827c-.293.241-.438.613-.43.992a7.723 7.723 0 0 1 0 .255c-.008.378.137.75.43.991l1.004.827c.424.35.534.955.26 1.43l-1.298 2.247a1.125 1.125 0 0 1-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.47 6.47 0 0 1-.22.128c-.331.183-.581.495-.644.869l-.213 1.281c-.09.543-.56.94-1.11.94h-2.594c-.55 0-1.019-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 0 1-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 0 1-1.369-.49l-1.297-2.247a1.125 1.125 0 0 1 .26-1.431l1.004-.827c.292-.24.437-.613.43-.991a6.932 6.932 0 0 1 0-.255c.007-.38-.138-.751-.43-.992l-1.004-.827a1.125 1.125 0 0 1-.26-1.43l1.297-2.247a1.125 1.125 0 0 1 1.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.086.22-.128.332-.183.582-.495.644-.869l.214-1.28Z" />
    <path stroke-linecap="round" stroke-linejoin="round" d="M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" />
    </svg>`,
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
    icon: '<svg stroke="currentColor" fill="none" stroke-width="1.5" viewBox="0 0 24 24" class="h-5 w-5 transition-colors duration-200" xmlns="http://www.w3.org/2000/svg"><path stroke-linecap="round" stroke-linejoin="round" d="M20.25 14.15v4.25c0 1.094-.787 2.036-1.872 2.18-2.087.2-4.218.34-6.378.34s-4.291-.14-6.378-.34c-1.085-.144-1.872-1.086-1.872-2.18v-4.25m16.5 0a2.18 2.18 0 00.75-1.661V8.706c0-1.081-.768-2.015-1.837-2.175a48.114 48.114 0 00-3.413-.387m4.5 4.617v-4.617c0-1.081-.768-2.015-1.837-2.175a48.111 48.111 0 00-3.413-.387m1.5 7.347v4.25m-1.5-4.25l-1.872 2.036a.75.75 0 01-1.106 0l-1.872-2.036m4.5-2.117V4.25A2.25 2.25 0 0015 2h-6a2.25 2.25 0 00-2.25 2.25v5.253m4.5-2.117v4.117m0 0l1.872 2.036a.75.75 0 001.106 0l1.872-2.036m-4.814 2.117v-4.25m0 0l-1.872 2.036a.75.75 0 00-1.106 0L6.75 8.883"/></svg>',
    group: true,
    roles: [2, 3],
    children: [
      {
        title: 'Crear Ticket',
        icon: `<svg class="w-6 h-6 text-gray-800 dark:text-white" aria-hidden="true" xmlns="http://www.w3.org/2000/svg" width="24" height="24" fill="none" viewBox="0 0 24 24">
  <path stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M18.5 12A2.5 2.5 0 0 1 21 9.5V7a1 1 0 0 0-1-1H4a1 1 0 0 0-1 1v2.5a2.5 2.5 0 0 1 0 5V17a1 1 0 0 0 1 1h16a1 1 0 0 0 1-1v-2.5a2.5 2.5 0 0 1-2.5-2.5Z"/>
</svg>
`,
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
        icon: `<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="w-6 h-6">
  <path stroke="currentColor" stroke-width="2" d="M21 12c0 1.2-4.03 6-9 6s-9-4.8-9-6c0-1.2 4.03-6 9-6s9 4.8 9 6Z"/>
  <path stroke="currentColor" stroke-width="2" d="M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z"/>
    </svg>`,
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
        icon: `<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="w-6 h-6">
  <path stroke-linecap="round" stroke-linejoin="round" d="M11.42 15.17 17.25 21A2.652 2.652 0 0 0 21 17.25l-5.877-5.877M11.42 15.17l2.496-3.03c.317-.384.74-.626 1.208-.766M11.42 15.17l-4.655 5.653a2.548 2.548 0 1 1-3.593-3.643 6.22 6.22 0 0 0 1.083-2.95c0-1.65-1.335-2.985-2.985-2.985m0 .342 2.834-2.835a2.25 2.25 0 0 1 3.176-3.264 5.25 5.25 0 0 0-5.536 1.336M8.25 10.875a1.125 1.125 0 1 0 2.25 0 1.125 1.125 0 0 0-2.25 0Z"/>
</svg>`,
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
    icon: '<svg stroke="currentColor" fill="none" stroke-width="1.5" viewBox="0 0 24 24" class="h-5 w-5 transition-colors duration-200" xmlns="http://www.w3.org/2000/svg"><path stroke-linecap="round" stroke-linejoin="round" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75ZM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625ZM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125Z"/></svg>',
    group: true,
    roles: [2, 4],
    children: [
      {
        title: 'Gestionar Ingresos',
        icon: '<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="w-6 h-6"> <path stroke-linecap="round" stroke-linejoin="round" d="M2.25 18 9 11.25l4.306 4.306a11.95 11.95 0 0 1 5.814-5.518l2.74-1.22m0 0-5.94-2.281m5.94 2.28-2.28 5.941" /> </svg>',
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
        icon: '<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="w-6 h-6"> <path stroke-linecap="round" stroke-linejoin="round" d="M2.25 6 9 12.75l4.286-4.286a11.948 11.948 0 0 1 4.306 6.43l.776 2.898m0 0 3.182-5.511m-3.182 5.51-5.511-3.181" /> </svg>',
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
        icon: '<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="w-6 h-6"> <path stroke-linecap="round" stroke-linejoin="round" d="M2.25 8.25h19.5M2.25 9h19.5m-16.5 5.25h6m-6 2.25h3m-3.75 3h15a2.25 2.25 0 0 0 2.25-2.25V6.75A2.25 2.25 0 0 0 19.5 4.5h-15a2.25 2.25 0 0 0-2.25 2.25v10.5A2.25 2.25 0 0 0 4.5 19.5Z" /></svg>',
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
        icon: '<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="w-6 h-6"> <path stroke-linecap="round" stroke-linejoin="round" d="M2.25 18.75a60.07 60.07 0 0 1 15.797 2.101c.727.198 1.453-.342 1.453-1.096V18.75M3.75 4.5v.75A.75.75 0 0 1 3 6h-.75m0 0v-.375c0-.621.504-1.125 1.125-1.125H20.25M2.25 6v9m18-10.5v.75c0 .414.336.75.75.75h.75m-1.5-1.5h.375c.621 0 1.125.504 1.125 1.125v9.75c0 .621-.504 1.125-1.125 1.125h-.375m1.5-1.5H21a.75.75 0 0 0-.75.75v.75m0 0H3.75m0 0h-.375a1.125 1.125 0 0 1-1.125-1.125V15m1.5 1.5v-.75A.75.75 0 0 0 3 15h-.75M15 10.5a3 3 0 1 1-6 0 3 3 0 0 1 6 0Zm3 0h.008v.008H18V10.5Zm-12 0h.008v.008H6V10.5Z" /> </svg>',
        href: 'report-paid',
        module: 'report-paid',
        group: false,
        roles: [2, 4],
        card: {
          className: 'w-56',
          images: { light: 'alerts-light.svg', dark: 'alerts-dark.svg' },
        },
      }

      , {
        title: 'Historial Facturas',
        icon: '<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="w-6 h-6"><path stroke-linecap="round" stroke-linejoin="round" d="m15.75 15.75-2.489-2.489m0 0a3.375 3.375 0 1 0-4.773-4.773 3.375 3.375 0 0 0 4.774 4.774ZM21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" /></svg>',
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
        icon: '<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="w-6 h-6"><path stroke-linecap="round" stroke-linejoin="round" d="M3.75 3v11.25A2.25 2.25 0 0 0 6 16.5h2.25M3.75 3h-1.5m1.5 0h16.5m0 0h1.5m-1.5 0v11.25A2.25 2.25 0 0 1 18 16.5h-2.25m-7.5 0h7.5m-7.5 0-1 3m8.5-3 1 3m0 0 .5 1.5m-.5-1.5h-9.5m0 0-.5 1.5m.75-9 3-3 2.148 2.148A12.061 12.061 0 0 1 16.5 7.605" /></svg>',
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
        icon: '<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="w-6 h-6"><path stroke-linecap="round" stroke-linejoin="round" d="M3.75 12h16.5m-16.5 3.75h16.5M3.75 19.5h16.5M5.625 4.5h12.75a1.875 1.875 0 0 1 0 3.75H5.625a1.875 1.875 0 0 1 0-3.75Z" /></svg>',
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
    icon: '<svg stroke="currentColor" fill="none" stroke-width="1.5" viewBox="0 0 24 24" class="h-5 w-5 transition-colors duration-200" xmlns="http://www.w3.org/2000/svg"><path stroke-linecap="round" stroke-linejoin="round" d="M20.25 7.5l-.625 10.632a2.25 2.25 0 01-2.247 2.118H6.622a2.25 2.25 0 01-2.247-2.118L3.75 7.5M10 11.25h4M3.375 7.5h17.25c.621 0 1.125-.504 1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125H3.375c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125z"/></svg>',
    group: true,
    roles: [2, 4],
    children: [
      {
        title: 'Ítems',
        icon: '<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="w-6 h-6"><path stroke-linecap="round" stroke-linejoin="round" d="M8.25 6.75h12M8.25 12h12m-12 5.25h12M3.75 6.75h.007v.008H3.75V6.75Zm.375 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0ZM3.75 12h.007v.008H3.75V12Zm.375 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Zm-.375 5.25h.007v.008H3.75v-.008Zm.375 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Z" /></svg>',
        href: 'inventory',
        group: false,
        roles: [2, 4],
        card: { className: 'w-56', images: { light: 'alerts-light.svg', dark: 'alerts-dark.svg' } },
      },
      {
        title: 'Categorías',
        icon: '<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="w-6 h-6"><path stroke-linecap="round" stroke-linejoin="round" d="M9.568 3H5.25A2.25 2.25 0 0 0 3 5.25v4.318c0 .597.237 1.17.659 1.591l9.581 9.581c.699.699 1.78.872 2.607.33a18.095 18.095 0 0 0 5.223-5.223c.542-.827.369-1.908-.33-2.607L11.16 3.66A2.25 2.25 0 0 0 9.568 3Z" /><path stroke-linecap="round" stroke-linejoin="round" d="M6 6h.008v.008H6V6Z" /></svg>',
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
    icon: '<svg stroke="currentColor" fill="none" stroke-width="1.5" viewBox="0 0 24 24" class="h-6 w-6 text-gray-500 transition duration-75 group-hover:text-gray-900 dark:text-gray-400 dark:group-hover:text-white" xmlns="http://www.w3.org/2000/svg"><path stroke-linecap="round" stroke-linejoin="round" d="M5.25 14.25h13.5m-13.5 0a3 3 0 0 1-3-3m3 3a3 3 0 1 0 6 0m-6 0h6m6.75 0a3 3 0 0 1-3-3m3 3a3 3 0 1 0-6 0m6 0h.008v.008H18.75V14.25Zm-12-7.5h13.5m-13.5 0a3 3 0 0 0-3 3m3-3a3 3 0 1 1 6 0m-6 0h6m6.75 0a3 3 0 0 0-3 3m3-3a3 3 0 1 1-6 0m6 0h.008v.008H18.75V6.75Z"/></svg>',
    group: true,
    roles: [2],
    children: [
      {
        title: 'Panel & Clientes',
        icon: '<svg stroke="currentColor" fill="none" stroke-width="1.5" viewBox="0 0 24 24" class="h-6 w-6 text-gray-500 transition duration-75 group-hover:text-gray-900 dark:text-gray-400 dark:group-hover:text-white" xmlns="http://www.w3.org/2000/svg"><path stroke-linecap="round" stroke-linejoin="round" d="M9 17.25v1.007a3 3 0 0 1-.879 2.122L7.5 21h9l-.621-.621A3 3 0 0 1 15 18.257V17.25m6-12V15a2.25 2.25 0 0 1-2.25 2.25H5.25A2.25 2.25 0 0 1 3 15V5.25m18 0A2.25 2.25 0 0 0 18.75 3H5.25A2.25 2.25 0 0 0 3 5.25m18 0H3"/></svg>',
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
    icon: '<svg stroke="currentColor" fill="none" stroke-width="1.5" viewBox="0 0 24 24" class="h-5 w-5 transition-colors duration-200" xmlns="http://www.w3.org/2000/svg"><path stroke-linecap="round" stroke-linejoin="round" d="M12 21a9.004 9.004 0 008.716-6.747M12 21a9.004 9.004 0 01-8.716-6.747M12 21c2.485 0 4.5-4.03 4.5-9S14.485 3 12 3m0 18c-2.485 0-4.5-4.03-4.5-9S9.515 3 12 3m0 0a8.997 8.997 0 017.843 4.582M12 3a8.997 8.997 0 00-7.843 4.582m15.686 0A11.953 11.953 0 0112 10.5c-2.998 0-5.74-1.1-7.843-2.918m15.686 0A8.959 8.959 0 0121 12c0 .778-.099 1.533-.284 2.253m0 0A17.919 17.919 0 0112 16.5c-3.162 0-6.133-.815-8.716-2.247m0 0A9.015 9.015 0 013 12c0-1.605.42-3.113 1.157-4.418"/></svg>',
    group: true,
    roles: [2],
    module: 'olt-admin',
    children: [
      { title: 'Mis OLTs',       href: 'olt',               group: false, module: 'olt-admin', icon: `<svg class="w-5 h-5 text-gray-500 group-hover:text-gray-900 dark:text-gray-400 dark:group-hover:text-white" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M5.25 14.25h13.5m-13.5 0a3 3 0 0 1-3-3m3 3a3 3 0 1 0 6 0m-6 0H2.25m11.25 0a3 3 0 0 0 3-3m-3 3a3 3 0 1 1 6 0m0 0h-2.25M8.25 6a2.25 2.25 0 1 0 4.5 0 2.25 2.25 0 0 0-4.5 0Zm6 0a2.25 2.25 0 1 0 4.5 0 2.25 2.25 0 0 0-4.5 0Zm-12 0a2.25 2.25 0 1 0 4.5 0 2.25 2.25 0 0 0-4.5 0Z"/></svg>`, card: { className: 'w-56', images: { light: 'alerts-light.svg', dark: 'alerts-dark.svg' } } },
      { title: 'Dashboard',      href: 'olt/dashboard',     group: false, module: 'olt-admin', icon: `<svg class="w-5 h-5 text-gray-500 group-hover:text-gray-900 dark:text-gray-400 dark:group-hover:text-white" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 0 1 3 19.875v-6.75ZM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 0 1-1.125-1.125V8.625ZM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 0 1-1.125-1.125V4.125Z"/></svg>`, card: { className: 'w-56', images: { light: 'alerts-light.svg', dark: 'alerts-dark.svg' } } },
      { title: 'Autorizadas',    href: 'olt/autorizadas',   group: false, module: 'olt-admin', icon: `<svg class="w-5 h-5 text-gray-500 group-hover:text-gray-900 dark:text-gray-400 dark:group-hover:text-white" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M9 12.75 11.25 15 15 9.75M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z"/></svg>`, card: { className: 'w-56', images: { light: 'alerts-light.svg', dark: 'alerts-dark.svg' } } },
      { title: 'Sin Autorizar',  href: 'olt/sin-autorizar', group: false, module: 'olt-admin', icon: `<svg class="w-5 h-5 text-gray-500 group-hover:text-gray-900 dark:text-gray-400 dark:group-hover:text-white" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z"/></svg>`, card: { className: 'w-56', images: { light: 'alerts-light.svg', dark: 'alerts-dark.svg' } } },
      { title: 'En Línea',       href: 'olt/online',        group: false, module: 'olt-admin', icon: `<svg class="w-5 h-5 text-gray-500 group-hover:text-gray-900 dark:text-gray-400 dark:group-hover:text-white" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M8.288 15.038a5.25 5.25 0 0 1 7.424 0M5.106 11.856c3.807-3.808 9.98-3.808 13.788 0M1.924 8.674c5.565-5.565 14.587-5.565 20.152 0M12.53 18.22l-.53.53-.53-.53a.75.75 0 0 1 1.06 0Z"/></svg>`, card: { className: 'w-56', images: { light: 'alerts-light.svg', dark: 'alerts-dark.svg' } } },
      { title: 'Service Ports',  href: 'olt/service-ports', group: false, module: 'olt-admin', icon: `<svg class="w-5 h-5 text-gray-500 group-hover:text-gray-900 dark:text-gray-400 dark:group-hover:text-white" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M7.5 21 3 16.5m0 0L7.5 12M3 16.5h13.5m0-13.5L21 7.5m0 0L16.5 12M21 7.5H7.5"/></svg>`, card: { className: 'w-56', images: { light: 'alerts-light.svg', dark: 'alerts-dark.svg' } } },
      { title: 'CLI Terminal',   href: 'olt/cli',           group: false, module: 'olt-admin', icon: `<svg class="w-5 h-5 text-gray-500 group-hover:text-gray-900 dark:text-gray-400 dark:group-hover:text-white" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="m6.75 7.5 3 2.25-3 2.25m4.5 0h3m-9 8.25h13.5A2.25 2.25 0 0 0 21 18V6a2.25 2.25 0 0 0-2.25-2.25H5.25A2.25 2.25 0 0 0 3 6v12a2.25 2.25 0 0 0 2.25 2.25Z"/></svg>`, card: { className: 'w-56', images: { light: 'alerts-light.svg', dark: 'alerts-dark.svg' } } },
      { title: 'Perfiles',       href: 'olt/perfiles',      group: false, module: 'olt-admin', icon: `<svg class="w-5 h-5 text-gray-500 group-hover:text-gray-900 dark:text-gray-400 dark:group-hover:text-white" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M3.75 9.776c.112-.017.227-.026.344-.026h15.812c.117 0 .232.009.344.026m-16.5 0a2.25 2.25 0 0 0-1.883 2.542l.857 6a2.25 2.25 0 0 0 2.227 1.932H19.05a2.25 2.25 0 0 0 2.227-1.932l.857-6a2.25 2.25 0 0 0-1.883-2.542m-16.5 0V6A2.25 2.25 0 0 1 6 3.75h3.879a1.5 1.5 0 0 1 1.06.44l2.122 2.12a1.5 1.5 0 0 0 1.06.44H18A2.25 2.25 0 0 1 20.25 9v.776"/></svg>`, card: { className: 'w-56', images: { light: 'alerts-light.svg', dark: 'alerts-dark.svg' } } },
      { title: 'Configuración',  href: 'olt/config',        group: false, module: 'olt-admin', icon: `<svg class="w-5 h-5 text-gray-500 group-hover:text-gray-900 dark:text-gray-400 dark:group-hover:text-white" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.325.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 0 1 1.37.49l1.296 2.247a1.125 1.125 0 0 1-.26 1.431l-1.003.827c-.293.241-.438.613-.43.992a7.723 7.723 0 0 1 0 .255c-.008.378.137.75.43.991l1.004.827c.424.35.534.955.26 1.43l-1.298 2.247a1.125 1.125 0 0 1-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.47 6.47 0 0 1-.22.128c-.331.183-.581.495-.644.869l-.213 1.281c-.09.543-.56.94-1.11.94h-2.594c-.55 0-1.019-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 0 1-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 0 1-1.369-.49l-1.297-2.247a1.125 1.125 0 0 1 .26-1.431l1.004-.827c.292-.24.437-.613.43-.991a6.932 6.932 0 0 1 0-.255c.007-.38-.138-.751-.43-.992l-1.004-.827a1.125 1.125 0 0 1-.26-1.43l1.297-2.247a1.125 1.125 0 0 1 1.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.086.22-.128.332-.183.582-.495.644-.869l.214-1.28Z"/><path stroke-linecap="round" stroke-linejoin="round" d="M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z"/></svg>`, card: { className: 'w-56', images: { light: 'alerts-light.svg', dark: 'alerts-dark.svg' } } },
    ],
    card: { className: 'w-56', images: { light: 'alerts-light.svg', dark: 'alerts-dark.svg' } },
  },
  {
    title: 'Configuración',
    icon: '<svg stroke="currentColor" fill="none" stroke-width="1.5" viewBox="0 0 24 24" class="h-5 w-5 transition-colors duration-200" xmlns="http://www.w3.org/2000/svg"><path stroke-linecap="round" stroke-linejoin="round" d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.325.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 011.37.49l1.296 2.247a1.125 1.125 0 01-.26 1.431l-1.003.827c-.293.241-.438.613-.43.992a7.723 7.723 0 010 .255c-.008.378.137.75.43.991l1.004.827c.424.35.534.955.26 1.43l-1.298 2.247a1.125 1.125 0 01-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.47 6.47 0 01-.22.128c-.331.183-.581.495-.644.869l-.213 1.281c-.09.543-.56.94-1.11.94h-2.594c-.55 0-1.019-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 01-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 01-1.369-.49l-1.297-2.247a1.125 1.125 0 01.26-1.431l1.004-.827c.292-.24.437-.613.43-.991a6.932 6.932 0 010-.255c.007-.38-.138-.751-.43-.992l-1.004-.827a1.125 1.125 0 01-.26-1.43l1.297-2.247a1.125 1.125 0 011.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.086.22-.128.332-.183.582-.495.644-.869l.214-1.28z"/><path stroke-linecap="round" stroke-linejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"/></svg>',
    group: true,
    roles: [2],
    children: [
      {
        title: 'Equipo de trabajo',
        icon: '<svg stroke="currentColor" fill="none" stroke-width="1.5" viewBox="0 0 24 24" class="h-6 w-6 text-gray-500 transition duration-75 group-hover:text-gray-900 dark:text-gray-400 dark:group-hover:text-white" xmlns="http://www.w3.org/2000/svg"><path stroke-linecap="round" stroke-linejoin="round" d="M15 19.128a9.38 9.38 0 0 0 2.625.372 9.337 9.337 0 0 0 4.121-.952 4.125 4.125 0 0 0-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 0 1 8.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0 1 11.964-3.07M12 6.375a3.375 3.375 0 1 1-6.75 0 3.375 3.375 0 0 1 6.75 0Zm8.25 2.25a2.625 2.625 0 1 1-5.25 0 2.625 2.625 0 0 1 5.25 0Z"/></svg>',
        href: 'staff',
        group: false,
        roles: [2],
        card: { className: 'w-56', images: { light: 'alerts-light.svg', dark: 'alerts-dark.svg' } },
      },
      {
        title: 'Facturación',
        icon: '<svg stroke="currentColor" fill="none" stroke-width="1.5" viewBox="0 0 24 24" class="h-6 w-6 text-gray-500 transition duration-75 group-hover:text-gray-900 dark:text-gray-400 dark:group-hover:text-white" xmlns="http://www.w3.org/2000/svg"><path stroke-linecap="round" stroke-linejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 0 1 2.25-2.25h13.5A2.25 2.25 0 0 1 21 7.5v11.25m-18 0A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75m-18 0v-7.5A2.25 2.25 0 0 1 5.25 9h13.5A2.25 2.25 0 0 1 21 11.25v7.5"/></svg>',
        href: 'billing-config',
        group: false,
        roles: [2],
        card: { className: 'w-56', images: { light: 'alerts-light.svg', dark: 'alerts-dark.svg' } },
      },
      {
        title: 'Pasarela de Pago',
        icon: '<svg stroke="currentColor" fill="none" stroke-width="1.5" viewBox="0 0 24 24" class="h-6 w-6 text-gray-500 transition duration-75 group-hover:text-gray-900 dark:text-gray-400 dark:group-hover:text-white" xmlns="http://www.w3.org/2000/svg"><path stroke-linecap="round" stroke-linejoin="round" d="M2.25 8.25h19.5M2.25 9h19.5m-16.5 5.25h6m-6 2.25h3m-3.75 3h15a2.25 2.25 0 0 0 2.25-2.25V6.75A2.25 2.25 0 0 0 19.5 4.5h-15a2.25 2.25 0 0 0-2.25 2.25v10.5A2.25 2.25 0 0 0 4.5 19.5Z"/></svg>',
        href: 'payment-gateway',
        group: false,
        module: 'payment-gateway',
        roles: [2],
        card: { className: 'w-56', images: { light: 'alerts-light.svg', dark: 'alerts-dark.svg' } },
      },
      {
        title: 'Contratos',
        icon: '<svg stroke="currentColor" fill="none" stroke-width="1.5" viewBox="0 0 24 24" class="h-6 w-6 text-gray-500 transition duration-75 group-hover:text-gray-900 dark:text-gray-400 dark:group-hover:text-white" xmlns="http://www.w3.org/2000/svg"><path stroke-linecap="round" stroke-linejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9Z"/></svg>',
        href: 'contratos',
        group: false,
        roles: [2],
        card: { className: 'w-56', images: { light: 'alerts-light.svg', dark: 'alerts-dark.svg' } },
      },
      {
        title: 'Empleados',
        icon: '<svg stroke="currentColor" fill="none" stroke-width="1.5" viewBox="0 0 24 24" class="h-6 w-6 text-gray-500 transition duration-75 group-hover:text-gray-900 dark:text-gray-400 dark:group-hover:text-white" xmlns="http://www.w3.org/2000/svg"><path stroke-linecap="round" stroke-linejoin="round" d="M18 18.72a9.094 9.094 0 0 0 3.741-.479 3 3 0 0 0-4.682-2.72m.94 3.198.001.031c0 .225-.012.447-.037.666A11.944 11.944 0 0 1 12 21c-2.17 0-4.207-.576-5.963-1.584A6.062 6.062 0 0 1 6 18.719m12 0a5.971 5.971 0 0 0-.941-3.197m0 0A5.995 5.995 0 0 0 12 12.75a5.995 5.995 0 0 0-5.058 2.772m0 0a3 3 0 0 0-4.681 2.72 8.986 8.986 0 0 0 3.74.477m.94-3.197a5.971 5.971 0 0 0-.94 3.197M15 6.75a3 3 0 1 1-6 0 3 3 0 0 1 6 0Zm6 3a2.25 2.25 0 1 1-4.5 0 2.25 2.25 0 0 1 4.5 0Zm-13.5 0a2.25 2.25 0 1 1-4.5 0 2.25 2.25 0 0 1 4.5 0Z"/></svg>',
        href: 'empleados',
        group: false,
        roles: [2],
        card: { className: 'w-56', images: { light: 'alerts-light.svg', dark: 'alerts-dark.svg' } },
      },
      {
        title: 'Planes de Internet',
        icon: '<svg stroke="currentColor" fill="none" stroke-width="1.5" viewBox="0 0 24 24" class="h-6 w-6 text-gray-500 transition duration-75 group-hover:text-gray-900 dark:text-gray-400 dark:group-hover:text-white" xmlns="http://www.w3.org/2000/svg"><path stroke-linecap="round" stroke-linejoin="round" d="M8.288 15.038a5.25 5.25 0 0 1 7.424 0M5.106 11.856c3.807-3.808 9.98-3.808 13.788 0M1.924 8.674c5.565-5.565 14.587-5.565 20.152 0M12.53 18.22l-.53.53-.53-.53a.75.75 0 0 1 1.06 0Z"/></svg>',
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
    icon: '<svg stroke="currentColor" fill="none" stroke-width="1.5" viewBox="0 0 24 24" class="h-5 w-5 transition-colors duration-200" xmlns="http://www.w3.org/2000/svg"><path stroke-linecap="round" stroke-linejoin="round" d="M20.25 8.511c.884.284 1.5 1.128 1.5 2.097v4.286c0 1.136-.847 2.1-1.98 2.193-.34.027-.68.052-1.02.072v3.091l-3-3c-1.354 0-2.694-.055-4.02-.163a2.115 2.115 0 01-.825-.242m9.345-8.334a53.897 53.897 0 00-1.1-.767c-.32.15-.657.278-1.007.39m-2.336 1.052a52.23 52.23 0 00-3.572.342c-.334.04-.67.081-1.006.122M6.75 8.511c-.971.284-1.5 1.128-1.5 2.097v4.286c0 1.136.847 2.1 1.98 2.193.34.027.68.052 1.02.072v3.091l3-3c1.354 0 2.694-.055 4.02-.163a2.115 2.115 0 00.825-.242m-9.345-8.334a53.897 53.897 0 011.1-.767c.32.15.657.278 1.007.39m2.336 1.052a52.23 52.23 0 013.572.342c.334.04.67.081 1.006.122"/></svg>',
    group: true,
    roles: [2, 3],
    children: [
      {
        title: 'Bandeja de entrada',
        icon: '<svg stroke="currentColor" fill="none" stroke-width="1.5" viewBox="0 0 24 24" class="h-6 w-6 text-gray-500 transition duration-75 group-hover:text-gray-900 dark:text-gray-400 dark:group-hover:text-white" xmlns="http://www.w3.org/2000/svg"><path stroke-linecap="round" stroke-linejoin="round" d="M2.25 13.5h3.86a2.25 2.25 0 0 1 2.012 1.244l.256.512a2.25 2.25 0 0 0 2.013 1.244h3.218a2.25 2.25 0 0 0 2.013-1.244l.256-.512a2.25 2.25 0 0 1 2.013-1.244h3.859m-19.5.338V18a2.25 2.25 0 0 0 2.25 2.25h15A2.25 2.25 0 0 0 21.75 18v-4.162c0-.224-.034-.447-.1-.661L19.24 5.338a2.25 2.25 0 0 0-2.15-1.588H6.911a2.25 2.25 0 0 0-2.15 1.588L2.35 13.177a2.25 2.25 0 0 0-.1.661Z"/></svg>',
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
    icon: '<svg stroke="currentColor" fill="none" stroke-width="1.5" viewBox="0 0 24 24" class="h-6 w-6 text-gray-500 transition duration-75 group-hover:text-gray-900 dark:text-gray-400 dark:group-hover:text-white" xmlns="http://www.w3.org/2000/svg"><path stroke-linecap="round" stroke-linejoin="round" d="M10.5 1.5H8.25A2.25 2.25 0 0 0 6 3.75v16.5a2.25 2.25 0 0 0 2.25 2.25h7.5A2.25 2.25 0 0 0 18 20.25V3.75a2.25 2.25 0 0 0-2.25-2.25H13.5m-3 0V3h3V1.5m-3 0h3m-3 18.75h3"/></svg>',
    group: true,
    roles: [2],
    children: [
      {
        title: 'Dashboard',
        icon: '<svg stroke="currentColor" fill="none" stroke-width="1.5" viewBox="0 0 24 24" class="h-6 w-6 text-gray-500 transition duration-75 group-hover:text-gray-900 dark:text-gray-400 dark:group-hover:text-white" xmlns="http://www.w3.org/2000/svg"><path stroke-linecap="round" stroke-linejoin="round" d="M3.75 6A2.25 2.25 0 0 1 6 3.75h2.25A2.25 2.25 0 0 1 10.5 6v2.25a2.25 2.25 0 0 1-2.25 2.25H6a2.25 2.25 0 0 1-2.25-2.25V6ZM3.75 15.75A2.25 2.25 0 0 1 6 13.5h2.25a2.25 2.25 0 0 1 2.25 2.25V18a2.25 2.25 0 0 1-2.25 2.25H6A2.25 2.25 0 0 1 3.75 18v-2.25ZM13.5 6a2.25 2.25 0 0 1 2.25-2.25H18A2.25 2.25 0 0 1 20.25 6v2.25A2.25 2.25 0 0 1 18 10.5h-2.25a2.25 2.25 0 0 1-2.25-2.25V6ZM13.5 15.75a2.25 2.25 0 0 1 2.25-2.25H18a2.25 2.25 0 0 1 2.25 2.25V18A2.25 2.25 0 0 1 18 20.25h-2.25A2.25 2.25 0 0 1 13.5 18v-2.25Z"/></svg>',
        href: 'whatsapp',
        group: false,
        roles: [2],
        card: { className: 'w-56', images: { light: 'alerts-light.svg', dark: 'alerts-dark.svg' } },
      },
      {
        title: 'WhatsApp Web (QR)',
        icon: '<svg stroke="currentColor" fill="none" stroke-width="1.5" viewBox="0 0 24 24" class="h-5 w-5 transition-colors duration-200" xmlns="http://www.w3.org/2000/svg"><path stroke-linecap="round" stroke-linejoin="round" d="M12 18v-5.25m0 0a6.01 6.01 0 001.5-.189m-1.5.189a6.01 6.01 0 01-1.5-.189m3.75 7.478a12.06 12.06 0 01-4.5 0m3.75 2.383a14.406 14.406 0 01-3 0M14.25 18v-.192c0-.983.658-1.823 1.508-2.316a7.5 7.5 0 10-7.517 0c.85.493 1.509 1.333 1.509 2.316V18" /></svg>',
        href: 'whatsapp/netplay',
        group: false,
        roles: [2],
        card: { className: 'w-56', images: { light: 'alerts-light.svg', dark: 'alerts-dark.svg' } },
      },
      {
        title: 'API Meta',
        icon: '<svg stroke="currentColor" fill="none" stroke-width="1.5" viewBox="0 0 24 24" class="h-5 w-5 transition-colors duration-200" xmlns="http://www.w3.org/2000/svg"><path stroke-linecap="round" stroke-linejoin="round" d="M13.5 10.5V6.75a4.5 4.5 0 119 0v3.75M3.75 21.75h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H3.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z" /></svg>',
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
    icon: '<svg stroke="currentColor" fill="none" stroke-width="1.5" viewBox="0 0 24 24" class="h-5 w-5 transition-colors duration-200" xmlns="http://www.w3.org/2000/svg"><path stroke-linecap="round" stroke-linejoin="round" d="M15 10.5a3 3 0 11-6 0 3 3 0 016 0z"/><path stroke-linecap="round" stroke-linejoin="round" d="M19.5 10.5c0 7.142-7.5 11.25-7.5 11.25S4.5 17.642 4.5 10.5a7.5 7.5 0 1115 0z"/></svg>',
    href: 'technician-map',
    module: 'technician-map',
    group: false,
    roles: [2],
    card: { className: 'w-56', images: { light: 'alerts-light.svg', dark: 'alerts-dark.svg' } },
  },
];

