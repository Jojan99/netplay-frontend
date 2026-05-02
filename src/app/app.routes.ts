import { Routes } from '@angular/router';
import { authGuard } from './guards/auth.guard';
import { roleGuard } from './guards/role.guard';

import { SignInComponent }            from './pages/sign-in/sign-in/sign-in.component';
import { RegisterCompanyComponent }   from './pages/register-company/register-company.component';
import { ConfirmEmailComponent }      from './pages/confirm-email/confirm-email.component';
import { UserComponent }              from './pages/user/user.component';
import { DashboardComponent }         from './dashboard/dashboard.component';
import { FinanceComponent }           from './pages/finance/finance.component';
import { LayoutComponent }            from './components/layout/layout.component';
import { HistoryFactureComponent }    from './pages/history-facture/history-facture.component';
import { EgresosComponent }           from './pages/egresos/egresos.component';
import { ReportPaidComponent }        from './pages/report-paid/report-paid.component';
import { MaintenanceTicketComponent } from './pages/soport-client/maintenance-ticket/maintenance-ticket.component';
import { TaskTicketComponent }        from './pages/soport-client/task-ticket/task-ticket.component';
import { OntDeviceComponent }         from './gestionClient/ont-device/ont-device.component';
import { StaffComponent }             from './pages/staff/staff.component';
import { BillingConfigComponent }     from './pages/billing-config/billing-config.component';
import { ResumenComponent }           from './pages/resumen/resumen.component';
import { MikrotikComponent }         from './pages/mikrotik/mikrotik.component';
import { ProfileComponent }          from './pages/profile/profile.component';
import { ContractsComponent }        from './pages/contracts/contracts.component';
import { EmployeesComponent }        from './pages/employees/employees.component';
import { InternetPlansComponent }    from './pages/internet-plans/internet-plans.component';
import { PaymentMethodsComponent } from './pages/payment-methods/payment-methods.component';
import { InstallationsComponent } from './pages/installations/installations.component';
import { InstallationFormComponent } from './pages/installations/installation-form.component';
import { TransfersComponent } from './pages/transfers/transfers.component';
import { TransferFormComponent } from './pages/transfers/transfer-form.component';
import { TechnicianMapComponent } from './pages/technician-map/technician-map.component';

export const routes: Routes = [
  {
    path: 'dashboard',
    component: LayoutComponent,
    canActivate: [authGuard],
    children: [
      { path: 'home', component: DashboardComponent },
      { path: 'usuario',        component: UserComponent,              canActivate: [roleGuard], data: { module: 'usuario' } },
      { path: 'finanzas',       component: FinanceComponent,           canActivate: [roleGuard], data: { module: 'finanzas' } },
      { path: 'finanzas/metodos-pago', component: PaymentMethodsComponent, canActivate: [roleGuard], data: { module: 'finanzas' } },
      { path: 'egresos',        component: EgresosComponent,           canActivate: [roleGuard], data: { module: 'egresos' } },
      { path: 'report-paid',    component: ReportPaidComponent,        canActivate: [roleGuard], data: { module: 'report-paid' } },
      { path: 'history-Facture',component: HistoryFactureComponent,    canActivate: [roleGuard], data: { module: 'history-facture' } },
      { path: 'created-ticket', component: MaintenanceTicketComponent, canActivate: [roleGuard], data: { module: 'created-ticket' } },
      { path: 'view-ticket',    component: TaskTicketComponent,        canActivate: [roleGuard], data: { module: 'view-ticket' } },
      { path: 'router',         component: OntDeviceComponent,         canActivate: [roleGuard], data: { module: 'router' } },
      {
        path: 'olt',
        loadChildren: () => import('./pages/admin-olt/olt.routes').then(m => m.OLT_ROUTES),
        canActivate: [roleGuard],
        data: { module: 'olt-admin' },
      },
      { path: 'staff',          component: StaffComponent,             canActivate: [roleGuard], data: { module: 'staff' } },
      { path: 'billing-config', component: BillingConfigComponent,     canActivate: [roleGuard], data: { module: 'billing-config' } },
      { path: 'mikrotik',       component: MikrotikComponent,          canActivate: [roleGuard], data: { module: 'mikrotik' } },
      { path: 'resumen',        component: ResumenComponent,           canActivate: [roleGuard], data: { module: 'resumen' } },
      {
        path: 'inventory',
        loadChildren: () => import('./pages/inventory/inventory.routes').then(m => m.INVENTORY_ROUTES),
        canActivate: [roleGuard],
        data: { module: 'inventory' },
      },
      {
        path: 'crm',
        loadChildren: () => import('./crm/crm.routes').then(m => m.CRM_ROUTES),
        canActivate: [roleGuard],
        data: { module: 'crm' },
      },
      {
        path: 'whatsapp',
        loadChildren: () => import('./whatsapp/whatsapp.routes').then(m => m.WHATSAPP_ROUTES),
        canActivate: [roleGuard],
        data: { module: 'whatsapp' },
      },
      { path: 'perfil', component: ProfileComponent },
      { path: 'contratos', component: ContractsComponent },
      { path: 'empleados', component: EmployeesComponent },
      { path: 'planes-internet', component: InternetPlansComponent },
      { path: 'installations', component: InstallationsComponent },
      { path: 'installations/new', component: InstallationFormComponent },
      { path: 'transfers', component: TransfersComponent },
      { path: 'transfers/new', component: TransferFormComponent },
      { path: 'technician-map', component: TechnicianMapComponent, canActivate: [roleGuard], data: { module: 'technician-map' } },
      {
        path: 'landing',
        loadComponent: () => import('./pages/landing-editor/landing-editor.component').then(m => m.LandingEditorComponent),
      },
      { path: '', redirectTo: 'home', pathMatch: 'full' },
      { path: '**', component: DashboardComponent },
    ],
  },
  {
    path: 'portal',
    loadChildren: () => import('./portal/portal.routes').then(m => m.PORTAL_ROUTES),
  },
  {
    path: 'p',
    loadChildren: () => import('./landing/landing.routes').then(m => m.LANDING_ROUTES),
  },
  { path: 'login',         component: SignInComponent },
  { path: 'inicio',        component: SignInComponent },
  { path: 'register',      component: RegisterCompanyComponent },
  { path: 'confirm-email', component: ConfirmEmailComponent },
  { path: '',              redirectTo: 'inicio', pathMatch: 'full' },
];
