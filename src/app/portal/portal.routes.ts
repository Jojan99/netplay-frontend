import { Routes } from '@angular/router';
import { clientAuthGuard }       from './guards/client-auth.guard';
import { portalYaConectadoGuard } from '../guards/ya-conectado.guard';
import { PortalLayoutComponent } from './layout/portal-layout.component';
import { ClientLoginComponent }  from './login/client-login.component';
import { PortalHomeComponent }   from './home/portal-home.component';
import { InvoiceListComponent }  from './invoices/invoice-list.component';
import { TicketListComponent }   from './tickets/ticket-list.component';
import { TicketFormComponent }   from './tickets/ticket-form.component';
import { TicketDetailComponent } from './tickets/ticket-detail.component';
import { ClientProfileComponent } from './profile/client-profile.component';
import { PaymentHistoryComponent } from './payments/payment-history.component';
import { PortalNetworkComponent } from './network/portal-network.component';
import { PortalEntrarComponent } from './entrar/portal-entrar.component';

export const PORTAL_ROUTES: Routes = [
  {
    path: 'login',
    component: ClientLoginComponent,
    // Con sesión de cliente vigente, directo al portal.
    canActivate: [portalYaConectadoGuard],
  },
  // Desde el enlace de pago de WhatsApp: entra con los últimos 4 dígitos de la cédula.
  { path: 'entrar', component: PortalEntrarComponent },
  {
    path: '',
    component: PortalLayoutComponent,
    canActivate: [clientAuthGuard],
    children: [
      { path: 'home',            component: PortalHomeComponent },
      { path: 'facturas',        component: InvoiceListComponent },
      { path: 'pagos',           component: PaymentHistoryComponent },
      { path: 'reportes',        component: TicketListComponent },
      { path: 'reportes/nuevo',  component: TicketFormComponent },
      { path: 'reportes/:id',    component: TicketDetailComponent },
      { path: 'mi-wifi',         component: PortalNetworkComponent },
      { path: 'perfil',          component: ClientProfileComponent },
      { path: '',                redirectTo: 'home', pathMatch: 'full' },
      { path: '**',              redirectTo: 'home' },
    ],
  },
];
