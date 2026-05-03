import { Routes } from '@angular/router';
import { clientAuthGuard }       from './guards/client-auth.guard';
import { PortalLayoutComponent } from './layout/portal-layout.component';
import { ClientLoginComponent }  from './login/client-login.component';
import { PortalHomeComponent }   from './home/portal-home.component';
import { InvoiceListComponent }  from './invoices/invoice-list.component';
import { TicketListComponent }   from './tickets/ticket-list.component';
import { TicketFormComponent }   from './tickets/ticket-form.component';
import { ClientProfileComponent } from './profile/client-profile.component';

export const PORTAL_ROUTES: Routes = [
  {
    path: 'login',
    component: ClientLoginComponent,
  },
  {
    path: '',
    component: PortalLayoutComponent,
    canActivate: [clientAuthGuard],
    children: [
      { path: 'home',            component: PortalHomeComponent },
      { path: 'facturas',        component: InvoiceListComponent },
      { path: 'reportes',        component: TicketListComponent },
      { path: 'reportes/nuevo',  component: TicketFormComponent },
      { path: 'perfil',          component: ClientProfileComponent },
      { path: '',                redirectTo: 'home', pathMatch: 'full' },
      { path: '**',              redirectTo: 'home' },
    ],
  },
];
