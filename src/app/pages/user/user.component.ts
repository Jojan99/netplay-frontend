import { CommonModule } from '@angular/common';
import { HttpClientModule } from '@angular/common/http';
import { Component, HostListener, ChangeDetectorRef, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { LayoutComponent } from '../../components/layout/layout.component';
import { UserService } from '../../services/user.service';
import { UserInterface } from '../../models/user-interface';
import { GenericInterface } from '../../models/generic-interface';
import { FooterComponent } from '../../components/footer/footer.component';
import { FinanceService } from '../../services/finance.service';
import { FactureInterface } from '../../models/facture-interface';
import { Subscription } from 'rxjs';
import { CompanyWhatsappService } from '../../services/company-whatsapp.service';
import { OltService } from '../../services/olt.service';

interface Toast {
  id: number;
  msg: string;
  type: 'success' | 'error' | 'info';
}

@Component({
  selector: 'app-user',
  templateUrl: './user.component.html',
  standalone: true,
  imports: [CommonModule, FormsModule, HttpClientModule, LayoutComponent, FooterComponent],
  styleUrls: ['./user.component.scss']
})
export class UserComponent implements OnInit {

  constructor(
    private userSvc: UserService,
    private financeSvc: FinanceService,
    private cdr: ChangeDetectorRef,
    private companyWaSvc: CompanyWhatsappService,
    private oltService: OltService,
  ) {}

  // ── Toast ─────────────────────────────────────────────────────────────────
  toasts: Toast[] = [];
  private toastId = 0;

  toast(msg: string, type: 'success' | 'error' | 'info' = 'info') {
    const id = ++this.toastId;
    this.toasts.push({ id, msg, type });
    setTimeout(() => this.toasts = this.toasts.filter(t => t.id !== id), 4000);
  }

  // ── User list ─────────────────────────────────────────────────────────────
  UserInterfaces: UserInterface[] = [];
  skeletor = true;
  search = '';
  timer: any;
  isDesktop = true;

  // Pagination
  currentPage = 1;
  entriesPerPage = 12;
  totalEntries = 0;

  get totalPages() { return Math.max(1, Math.ceil(this.totalEntries / this.entriesPerPage)); }
  get startIndex() { return (this.currentPage - 1) * this.entriesPerPage; }
  get endIndex()   { return Math.min(this.currentPage * this.entriesPerPage, this.totalEntries); }
  get isLastPage() { return this.currentPage >= this.totalPages; }
  get pageNumbers(): number[] {
    const pages: number[] = [];
    const start = Math.max(1, this.currentPage - 2);
    const end   = Math.min(this.totalPages, this.currentPage + 2);
    for (let i = start; i <= end; i++) pages.push(i);
    return pages;
  }

  @HostListener('window:resize', ['$event'])
  onResize(_: any) {
    if (typeof window !== 'undefined') this.isDesktop = window.innerWidth > 768;
  }

  // ── WhatsApp company status ───────────────────────────────────────────────
  companyHasWA = false;

  ngOnInit() {
    this.onResize(null);
    this.loadCatalogs();
    this.getAllUser();
    this.companyWaSvc.getConfig().subscribe({
      next: (res) => {
        const d = res?.data ?? res;
        this.companyHasWA = !!(d?.whatsapp_enabled && d?.wa_instance_id);
      },
      error: () => { this.companyHasWA = false; }
    });
  }

  // ── Catalog loads ─────────────────────────────────────────────────────────
  Neighborhood: GenericInterface[] = [];
  DataCortes: GenericInterface[] = [];
  PlanInternet: GenericInterface[] = [];
  Ipzone: GenericInterface[] = [];
  interfaces: any[] = [];
  segments: any[] = [];
  selectedInterface: any = null;
  selectedSegment: any = null;
  serviceTypes: any[] = [];
  priorities: any[] = [];
  technicians: any[] = [];

  // ── Multi-router ──────────────────────────────────────────────────────────
  routers: any[] = [];
  selectedRouterId: number | null = null;
  loadingRouters = false;

  loadCatalogs() {
    this.userSvc.getDataCorteAll().subscribe(r =>
      this.DataCortes = r.data.map((e: any) => ({ id: e.id, names: e.data_cortes })));
    this.userSvc.getInternetPlanAll().subscribe(r =>
      this.PlanInternet = r.data.map((e: any) => ({ id: e.id, names: e.plan_name })));
    this.userSvc.getServiceTicket().subscribe(r => this.serviceTypes = r.data ?? []);
    this.userSvc.getPriorityTicket().subscribe(r => this.priorities = r.data ?? []);
    this.userSvc.getTechnicaAll().subscribe(r => {
      this.technicians = (r.data || []).map((e: any) => ({
        id_user:  e.user_id,
        names:    e.names,
        lastname: e.lastname,
      }));
    });
  }

  loadRouters() {
    this.loadingRouters = true;
    this.userSvc.getRouters().subscribe({
      next: r => {
        this.routers = r.data ?? [];
        this.loadingRouters = false;
        if (!this.selectedRouterId && this.routers.length) {
          this.selectedRouterId = this.routers[0].id;
        }
      },
      error: () => { this.loadingRouters = false; }
    });
  }

  // ── User list ─────────────────────────────────────────────────────────────
  getAllUser() {
    this.skeletor = true;
    this.userSvc.getAllUser().subscribe({
      next: r => {
        this.UserInterfaces = r.data.map((e: any) => ({
          id_user: e.id,
          names: e.names,
          lastname: e.lastname,
          address: e.address,
          dni: e.dni,
          phone: e.phone,
          email: e.email,
          internet_status: e.internet_status,
          plan_name: e.plan_name,
          ip: e.ip,
          id_cab: e.id_cab,
          date_create: e.date_create,
          alias: e.alias,
          whatsapp_enabled: e.whatsapp_enabled ?? false,
          router_id: e.router_id ?? null,
        }));
        this.totalEntries = this.UserInterfaces.length;
        this.skeletor = false;
      },
      error: () => { this.skeletor = false; }
    });
  }

  getSearchUser() {
    if (!this.search.trim()) { this.getAllUser(); return; }
    clearTimeout(this.timer);
    this.timer = setTimeout(() => {
      this.skeletor = true;
      this.userSvc.getSearchUser(this.search).subscribe({
        next: r => {
          this.UserInterfaces = r.data.map((e: any) => ({
            id_user: e.id, names: e.names, lastname: e.lastname, address: e.address,
            dni: e.dni, phone: e.phone, email: e.email, internet_status: e.internet_status,
            plan_name: e.plan_name, ip: e.ip, id_cab: e.id_cab, date_create: e.date_create, alias: e.alias,
            router_id: e.router_id ?? null,
          }));
          this.totalEntries = this.UserInterfaces.length;
          this.currentPage = 1;
          this.skeletor = false;
        },
        error: () => { this.skeletor = false; }
      });
    }, 400);
  }

  onEntriesPerPageChange(event: Event) {
    this.entriesPerPage = Number((event.target as HTMLSelectElement).value);
    this.currentPage = 1;
  }

  prevPage() { if (this.currentPage > 1) { this.currentPage--; } }
  nextPage() { if (!this.isLastPage) { this.currentPage++; } }
  goToPage(p: number) { this.currentPage = p; }

  toggleDetails(user: UserInterface) { user.expanded = !user.expanded; }

  toggleWhatsapp(user: UserInterface) {
    const val = !user.whatsapp_enabled;
    user.whatsapp_enabled = val;
    this.companyWaSvc.toggleUserWhatsapp(user.id_user!, val).subscribe({
      error: () => { user.whatsapp_enabled = !val; this.toast('Error al actualizar WhatsApp', 'error'); }
    });
  }

  // ── CSV Export ────────────────────────────────────────────────────────────
  exportingCsv = false;

  downloadCsvAll() {
    this.exportingCsv = true;
    this.userSvc.exportUsers().subscribe({
      next: (r: any) => {
        const rows = (r.data ?? []).map((u: any) => ({
          'ID': u.id ?? '',
          'Nombres': u.names ?? '',
          'Apellidos': u.lastname ?? '',
          'Documento': u.dni ?? '',
          'Telefono': u.phone ?? '',
          'Email': u.email ?? '',
          'Direccion': u.address ?? '',
          'Estado': u.status ?? '',
          'Plan': u.plan_name ?? '',
          'IP': u.ip ?? '',
          'Grupo Facturacion': u.billing_group ?? '',
          'Fecha Registro': u.created_at ?? '',
        }));
        this.exportToCsv('clientes_trazabilidad.csv', rows);
        this.exportingCsv = false;
      },
      error: () => { this.toast('Error al exportar CSV', 'error'); this.exportingCsv = false; }
    });
  }

  downloadCsvUser() {
    if (!this.selectedUserId) return;
    const invoices = this.factureInfo;
    const rows = invoices.map((f: any) => ({
      'N° Factura': f.number_facture ?? '',
      'Fecha': f.date_facturation ?? '',
      'Total': f.price_total ?? 0,
      'Descuento': f.price_discount ?? 0,
      'Restante': f.restante ?? 0,
      'Estado': f.paid === 1 ? 'PAGADO' : 'PENDIENTE',
      'Fecha Pago': f.updated_at ?? '',
    }));
    this.exportToCsv(`traza_usuario_${this.selectedUserId}.csv`, rows);
  }

  private exportToCsv(filename: string, rows: any[]) {
    if (!rows.length) { this.toast('Sin datos para exportar', 'info'); return; }
    const headers = Object.keys(rows[0]);
    const csv = [headers.join(','), ...rows.map(r => headers.map(h => `"${r[h] ?? ''}"`).join(','))].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  // ── Audit log ─────────────────────────────────────────────────────────────
  auditLogs: any[] = [];
  loadingAudit = false;

  loadAuditLog(userId: number) {
    this.loadingAudit = true;
    this.userSvc.getAuditLog(userId).subscribe({
      next: r => { this.auditLogs = r.data ?? []; this.loadingAudit = false; },
      error: () => { this.loadingAudit = false; }
    });
  }

  auditFieldLabel(field: string): string {
    const labels: Record<string, string> = {
      'plan': 'Plan de internet',
      'grupo_facturacion': 'Grupo de facturación',
      'datos_generales': 'Datos personales',
      'estado_internet': 'Estado de internet',
    };
    return labels[field] ?? field;
  }

  // ── Modals state ──────────────────────────────────────────────────────────
  showClienteModal   = false;
  showPingModal      = false;
  showDeleteModal    = false;
  showSuspendModal   = false;
  showCreateUser     = false;
  showCreateFacture  = false;

  selectedUserId = 0;
  selectedUserDni = '';
  selectedUserCab = 0;
  selectedUserStatus = '';
  pendingDeleteId = 0;
  pendingDeleteDni = '';
  pendingDeleteRouterId: number | null = null;
  pendingSuspendId = 0;
  pendingSuspendDni = '';
  pendingSuspendStatus = '';
  pendingSuspendRouterId: number | null = null;

  // ── Cliente modal (Soporte) ───────────────────────────────────────────────
  modalTab: 'resumen' | 'servicios' | 'facturacion' | 'tickets' | 'historial' = 'resumen';
  loadingModal = false;

  selectedUserData: any = null;
  isEditing = false;
  internet_plan = 0;
  data_cortes = 0;

  openClienteModal(alias: any, userId: any, cabId: any) {
    this.selectedUserId  = userId;
    this.selectedUserCab = cabId;
    this.modalTab        = 'resumen';
    this.isEditing       = false;
    this.showClienteModal = true;
    this.loadModalUser(userId);
    this.loadFacturas(cabId);
    this.loadTickets(userId);
    this.loadAuditLog(userId);
    this.loadCatalogs();
  }

  closeClienteModal() {
    this.showClienteModal = false;
    this.factureInfo = [];
    this.userTickets = [];
    this.selectedUserData = null;
  }

  loadModalUser(id: number) {
    this.loadingModal = true;
    this.userSvc.getUserById(id).subscribe({
      next: r => {
        const e = r.data;
        this.selectedUserData = e;
        this.internet_plan = e.internet_plans_id ?? 0;
        this.data_cortes   = e.data_cortes_id ?? 0;
        this.loadingModal  = false;
      },
      error: () => { this.loadingModal = false; }
    });
  }

  // ── Resumen tab ───────────────────────────────────────────────────────────
  enableEdit()  { this.isEditing = true; }
  cancelEdit()  { this.isEditing = false; this.loadModalUser(this.selectedUserId); }

  saveUser() {
    this.userSvc.updateUser(this.selectedUserData, this.selectedUserId, this.internet_plan, this.data_cortes)
      .subscribe({
        next: r => {
          this.isEditing = false;
          this.toast(r.message ?? 'Guardado', r.error ? 'error' : 'success');
          if (!r.error) {
            this.getAllUser();
            this.loadModalUser(this.selectedUserId);
            this.loadAuditLog(this.selectedUserId);
          }
        },
        error: () => this.toast('Error al guardar', 'error')
      });
  }

  // ── Servicios tab ─────────────────────────────────────────────────────────
  mac = '';
  serial = '';
  submittingService = false;

  // ── Migración IP ──────────────────────────────────────────────────────────
  migrVlan: any = null;
  migrSeg: any = null;
  migrIp = '';
  migrSegments: any[] = [];
  migrIpzone: any[] = [];
  submittingMigr = false;

  onMigrVlanChange(iface: any) {
    this.migrVlan = iface;
    this.migrSegments = iface ? [iface] : [];
    this.migrSeg = null;
    this.migrIpzone = [];
    this.migrIp = '';
  }

  onMigrSegChange(seg: any) {
    if (!seg || !this.migrVlan) { this.migrIpzone = []; return; }
    this.userSvc.getIpzonebyZone(seg.names, seg.network, this.selectedRouterId).subscribe({
      next: r => {
        this.migrIpzone = r.error === 0 && r.data?.ips ? r.data.ips.map((e: any) => ({ id: e.ip, names: e.ip })) : [];
      }
    });
  }

  migrarIp() {
    if (!this.migrIp || !this.migrVlan) return;
    this.submittingMigr = true;
    this.userSvc.migrarIp({ service_id: this.selectedUserId, new_ip: this.migrIp, vlan: this.migrVlan.names, router_id: this.selectedRouterId })
      .subscribe({
        next: r => {
          this.toast(r.message ?? (r.error ? 'Error' : 'IP migrada'), r.error ? 'error' : 'success');
          if (!r.error) { this.migrVlan = null; this.migrSeg = null; this.migrIp = ''; this.migrIpzone = []; this.migrSegments = []; this.loadModalUser(this.selectedUserId); }
          this.submittingMigr = false;
        },
        error: () => { this.toast('Error al migrar IP', 'error'); this.submittingMigr = false; }
      });
  }

  // ── Equipo ONT asignado ────────────────────────────────────────────────────
  assignedOnt: any   = null;
  loadingOnt         = false;

  loadAssignedOnt(userId: number): void {
    this.loadingOnt  = true;
    this.assignedOnt = null;
    this.oltService.getOntByUserId(userId).subscribe({
      next: (res) => { this.loadingOnt = false; this.assignedOnt = res.data ?? null; },
      error: () => { this.loadingOnt = false; },
    });
  }

  openServiciosTab() {
    this.modalTab = 'servicios';
    const userRouterId = this.selectedUserData?.router_id ? Number(this.selectedUserData.router_id) : null;
    this.selectedRouterId = userRouterId;
    if (!this.routers.length) this.loadRouters();
    this.onServiceRouterChange();
    this.loadAssignedOnt(this.selectedUserId);
  }

  onServiceRouterChange() {
    this.migrVlan = null;
    this.migrSegments = [];
    this.migrSeg = null;
    this.migrIpzone = [];
    this.migrIp = '';
    this.userSvc.getneighborhoodAll(this.selectedRouterId).subscribe({
      next: r => { this.interfaces = r.error === 0 && r.data ? Object.values(r.data) : []; }
    });
  }

  autorizarServicio() {
    this.submittingService = true;
    this.userSvc.autorizarServicio({ service_id: this.selectedUserId, mac: this.mac, serial: this.serial, router_id: this.selectedRouterId })
      .subscribe({
        next: r => {
          this.toast(r.message ?? 'Autorizado', 'success');
          this.mac = ''; this.serial = '';
          this.submittingService = false;
        },
        error: () => { this.toast('Error al autorizar', 'error'); this.submittingService = false; }
      });
  }

  // ── Facturación tab ───────────────────────────────────────────────────────
  factureInfo: FactureInterface[] = [];
  factureFilter: 'all' | 'paid' | 'pending' = 'all';
  factureSearch = '';
  loadingFacture = false;
  submittingFacture = false;
  showCreateFactureForm = false;
  newFacture: FactureInterface = { price_total: 0, idUser: 0 };

  get filteredFactures() {
    let list = [...this.factureInfo];
    if (this.factureFilter === 'paid')    list = list.filter(f => f.paid === 1);
    if (this.factureFilter === 'pending') list = list.filter(f => f.paid !== 1);
    if (this.factureSearch.trim())
      list = list.filter(f => (f.number_facture ?? '').includes(this.factureSearch));
    return list;
  }

  get pendingFacturesCount() {
    return this.filteredFactures.filter(f => f.paid !== 1).length;
  }

  get pendingFacturesTotal() {
    return this.filteredFactures.filter(f => f.paid !== 1).reduce((a, b) => a + (b.restante ?? 0), 0);
  }

  loadFacturas(cabId: number, filterPaid = 0) {
    this.loadingFacture = true;
    this.userSvc.getDatePayFacture(cabId, filterPaid).subscribe({
      next: r => {
        this.factureInfo = (r.data ?? []).map((e: any) => ({
          id: e.id,
          number_facture: e.number_facture,
          date_facturation: e.date_facturation,
          price_discount: e.price_discount,
          price_total: e.price_total,
          updated_at: e.updated_at,
          restante: e.paid === 1 ? 0 : (e.price_total - e.price_abone),
          paid: e.paid,
          prueba: e.paid === 0 ? e.price_abone : (e.balance - e.price_discount),
        }));
        this.loadingFacture = false;
      },
      error: () => { this.loadingFacture = false; }
    });
  }

  createFacture() {
    this.submittingFacture = true;
    this.userSvc.createFacture({ price_total: this.newFacture.price_total, date_facturation: this.newFacture.date_facturation } as FactureInterface, this.selectedUserId)
      .subscribe({
        next: r => {
          this.toast(r.message ?? 'Factura creada', 'success');
          this.showCreateFactureForm = false;
          this.newFacture = { price_total: 0 };
          this.submittingFacture = false;
          this.loadFacturas(this.selectedUserCab);
        },
        error: () => { this.toast('Error al crear factura', 'error'); this.submittingFacture = false; }
      });
  }

  payingFactureId: number | null = null;

  payFacture(item: FactureInterface) {
    if (!item.id || item.paid === 1) return;
    this.payingFactureId = item.id;
    this.financeSvc.createpaidFacturation(item.id, this.selectedUserId, item.price_total, item.number_facture)
      .subscribe({
        next: (r: any) => {
          this.toast('Factura pagada exitosamente', 'success');
          this.payingFactureId = null;
          this.loadFacturas(this.selectedUserCab);
        },
        error: () => { this.toast('Error al registrar pago', 'error'); this.payingFactureId = null; }
      });
  }

  downloadPdf(id: any) {
    this.userSvc.downloadPdfById(id).subscribe({
      next: (blob: Blob) => {
        if (!blob) return;
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url; a.download = `factura_${id}.pdf`; a.click();
        URL.revokeObjectURL(url);
      },
      error: () => this.toast('Error al descargar PDF', 'error')
    });
  }

  downloadPayPdf(id: any, extra: any) {
    this.userSvc.downloadPayById(id, extra).subscribe({
      next: (blob: Blob) => {
        if (!blob) return;
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url; a.download = `comprobante_${id}.pdf`; a.click();
        URL.revokeObjectURL(url);
      },
      error: () => this.toast('Error al descargar comprobante', 'error')
    });
  }

  sendInvoiceWA(invoiceId: string, item: any) {
    item._waSending = true;
    this.userSvc.sendInvoiceByWhatsApp(invoiceId).subscribe({
      next: (res: any) => {
        item._waSending = false;
        this.toast(res.message || 'Factura enviada por WhatsApp', 'success');
      },
      error: (err: any) => {
        item._waSending = false;
        this.toast(err?.error?.message || 'Error al enviar por WhatsApp', 'error');
      }
    });
  }

  // ── Tickets tab ───────────────────────────────────────────────────────────
  userTickets: any[] = [];
  loadingTickets = false;
  showNewTicketForm = false;
  submittingTicket = false;
  ticketPage = 1;
  ticketPerPage = 5;

  get ticketPageCount(): number { return Math.max(1, Math.ceil(this.userTickets.length / this.ticketPerPage)); }
  get ticketPageNumbers(): number[] {
    const pages: number[] = [];
    const s = Math.max(1, this.ticketPage - 2);
    const e = Math.min(this.ticketPageCount, this.ticketPage + 2);
    for (let i = s; i <= e; i++) pages.push(i);
    return pages;
  }
  get pagedTickets(): any[] {
    const s = (this.ticketPage - 1) * this.ticketPerPage;
    return this.userTickets.slice(s, s + this.ticketPerPage);
  }

  ticketForm = {
    address: '', date: new Date().toISOString().substring(0, 10), type_service: 0, priority: 0, status: 1,
    tecnichal: 0, observation: '', cedula: '', phone: ''
  };

  loadTickets(userId: number) {
    this.loadingTickets = true;
    this.ticketPage = 1;
    this.userSvc.getTicketsByUser(userId).subscribe({
      next: r => { this.userTickets = r.data ?? []; this.loadingTickets = false; },
      error: () => { this.loadingTickets = false; }
    });
  }

  getTechnicianName(): string {
    const techId = this.ticketForm.tecnichal;
    const tech   = this.technicians.find((t: any) => t.id_user == techId);
    return tech ? `${tech.names} ${tech.lastname}` : '';
  }

  createTicket() {
    if (!this.ticketForm.type_service || !this.ticketForm.priority || !this.ticketForm.tecnichal || !this.ticketForm.observation?.trim()) {
      this.toast('Complete los campos requeridos', 'error'); return;
    }
    this.submittingTicket = true;
    const d = this.selectedUserData;
    this.userSvc.createdTicket({
      ...this.ticketForm,
      user_id: this.selectedUserId,
      cedula: d?.dni ?? '',
      phone:  d?.phone ?? '',
      address: d?.address || '',
      client_name: `${d?.names ?? ''} ${d?.lastname ?? ''}`,
      technician_name: this.getTechnicianName(),
      search: '',
    }).subscribe({
      next: r => {
        this.toast(r.message ?? 'Ticket creado', r.error ? 'error' : 'success');
        this.showNewTicketForm = false;
        this.ticketForm = { address: '', date: new Date().toISOString().substring(0, 10), type_service: 0, priority: 0, status: 1, tecnichal: 0, observation: '', cedula: '', phone: '' };
        this.submittingTicket = false;
        this.loadTickets(this.selectedUserId);
      },
      error: () => { this.toast('Error al crear ticket', 'error'); this.submittingTicket = false; }
    });
  }

  downloadTicketPdf(id: any) {
    this.userSvc.downloadPdfTicketById(id).subscribe({
      next: (blob: Blob) => {
        if (!blob) return;
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url; a.download = `ticket_${id}.pdf`; a.click();
        URL.revokeObjectURL(url);
      },
      error: () => this.toast('Error al descargar ticket', 'error')
    });
  }

  // ── Suspend / Delete ──────────────────────────────────────────────────────
  openSuspendModal(dni: any, id: any, status: any, routerId?: number | null) {
    this.pendingSuspendDni       = dni;
    this.pendingSuspendId        = id;
    this.pendingSuspendStatus    = status;
    this.pendingSuspendRouterId  = routerId ?? null;
    this.showSuspendModal        = true;
  }

  confirmSuspend() {
    const newStatus = this.pendingSuspendStatus === 'ACTIVE' ? 2 : 1;
    this.userSvc.disableUser(this.pendingSuspendDni, this.pendingSuspendId, newStatus, this.pendingSuspendRouterId).subscribe({
      next: r => {
        this.toast(r.message ?? 'Estado actualizado', r.error ? 'error' : 'success');
        this.showSuspendModal = false;
        this.getAllUser();
      },
      error: () => { this.toast('Error al actualizar estado', 'error'); this.showSuspendModal = false; }
    });
  }

  openDeleteModal(id: any, dni: any, routerId?: number | null) {
    this.pendingDeleteId       = id;
    this.pendingDeleteDni      = dni;
    this.pendingDeleteRouterId = routerId ?? null;
    this.showDeleteModal       = true;
  }

  confirmDelete() {
    this.userSvc.deleteUserData(this.pendingDeleteId).subscribe({
      next: r => {
        if (!r.error) {
          this.userSvc.disableUser(this.pendingDeleteDni, this.pendingDeleteId, 2, this.pendingDeleteRouterId).subscribe();
        }
        this.toast(r.message ?? 'Eliminado', r.error ? 'error' : 'success');
        this.showDeleteModal = false;
        this.getAllUser();
      },
      error: () => { this.toast('Error al eliminar', 'error'); this.showDeleteModal = false; }
    });
  }

  // ── Ping ──────────────────────────────────────────────────────────────────
  pingName = '';
  pingDni: any = '';
  pingCount = 5;
  pingResults: Array<{ host: string; time: string; received: string; status: string }> = [];
  showPingForm = false;
  isPinging = false;
  private pingSubscription: Subscription | null = null;

  openPingModal(ip: any, name: string, lastname: string, dni: any, userId: any) {
    this.pingName     = `${name} ${lastname}`;
    this.pingDni      = dni;
    this.pingResults  = [];
    this.showPingForm = false;
    this.showPingModal = true;
    if (this.pingSubscription) { this.pingSubscription.unsubscribe(); this.pingSubscription = null; }
  }

  closePingModal() {
    this.showPingModal = false;
    if (this.pingSubscription) { this.pingSubscription.unsubscribe(); this.pingSubscription = null; }
    this.pingResults  = [];
    this.isPinging    = false;
  }

  startPing() {
    this.pingResults = [];
    this.cdr.detectChanges();
    if (this.pingSubscription) { this.pingSubscription.unsubscribe(); }
    this.isPinging = true;
    this.pingSubscription = this.userSvc.getPingResults(this.pingCount, this.pingDni).subscribe({
      next: data => {
        if (data.message === 'done') { this.isPinging = false; return; }
        const p = typeof data === 'string' ? JSON.parse(data) : data;
        const status = p['packet-loss'] === '100' ? '❌ Timeout' : p['packet-loss'] === '0' ? '✅ Activo' : '⚠️ Intermitente';
        this.pingResults.push({ ...p, status });
        this.cdr.detectChanges();
      },
      error: () => { this.isPinging = false; },
      complete: () => { this.isPinging = false; }
    });
  }

  convertToSeconds(time: string | undefined): string {
    if (!time) return '❌ Timeout';
    if (time.includes('us')) return (parseFloat(time) / 1_000_000).toFixed(2) + ' s';
    if (time.includes('ms')) return (parseFloat(time) / 1_000).toFixed(2) + ' s';
    return parseFloat(time).toFixed(2) + ' s';
  }

  // ── Create user form ──────────────────────────────────────────────────────
  newUser: any = { names: '', lastname: '', dni: '', phone: '', email: '', address: '', plan_id: 0, ip: 0, periode_facturation: 0, countries: 1 };
  submittingNewUser = false;
  showUserFormProfile = true;
  selectedVlan: any = null;
  selectedSeg: any = null;

  onCreateRouterChange() {
    this.selectedVlan = null;
    this.segments = [];
    this.selectedSeg = null;
    this.Ipzone = [];
    this.userSvc.getneighborhoodAll(this.selectedRouterId).subscribe({
      next: r => { this.interfaces = r.error === 0 && r.data ? Object.values(r.data) : []; }
    });
  }

  onInterfaceChange(iface: any) {
    this.selectedVlan = iface;
    this.segments = iface ? [iface] : [];
    this.selectedSeg = null;
    this.Ipzone = [];
  }

  onSegmentChange(seg: any) {
    if (!seg || !this.selectedVlan) { this.Ipzone = []; return; }
    this.userSvc.getIpzonebyZone(seg.names, seg.network, this.selectedRouterId).subscribe({
      next: r => {
        this.Ipzone = r.error === 0 && r.data?.ips ? r.data.ips.map((e: any) => ({ id: e.ip, names: e.ip })) : [];
      },
      error: () => { this.Ipzone = []; }
    });
  }

  openCreateUserModal() {
    this.newUser = { names: '', lastname: '', dni: '', phone: '', email: '', address: '', plan_id: 0, ip: 0, periode_facturation: 0, countries: 1 };
    this.showUserFormProfile = true;
    this.selectedVlan = null; this.selectedSeg = null; this.Ipzone = [];
    this.selectedRouterId = null;
    if (!this.routers.length) this.loadRouters();
    if (!this.interfaces.length) this.userSvc.getneighborhoodAll(this.selectedRouterId).subscribe({
      next: r => { this.interfaces = r.error === 0 && r.data ? Object.values(r.data) : []; }
    });
    this.showCreateUser = true;
  }

  createUser() {
    this.submittingNewUser = true;
    this.newUser.vlan = this.selectedVlan?.names ?? '';
    this.newUser.router_id = this.selectedRouterId;
    this.userSvc.create(this.newUser).subscribe({
      next: r => {
        this.toast(r.message ?? (r.error ? 'Error' : 'Cliente creado'), r.error ? 'error' : 'success');
        if (!r.error) { this.showCreateUser = false; this.getAllUser(); }
        this.submittingNewUser = false;
      },
      error: () => { this.toast('Error al crear cliente', 'error'); this.submittingNewUser = false; }
    });
  }

  get dataCorteLabel(): string {
    const id = this.selectedUserData?.data_cortes_id ?? this.data_cortes;
    const found = this.DataCortes.find(d => d.id == id);
    return found ? found.names : '—';
  }

  // ── Internet status toggle (inline) ──────────────────────────────────────
  togglingStatus = false;

  toggleInternetStatus() {
    const d = this.selectedUserData;
    if (!d || this.togglingStatus) return;
    this.togglingStatus = true;
    const newStatus = d.status_internet === 'ACTIVE' ? 2 : 1;
    this.userSvc.disableUser(d.dni, this.selectedUserId, newStatus, d.router_id ? Number(d.router_id) : null).subscribe({
      next: r => {
        this.toast(r.message ?? 'Estado actualizado', r.error ? 'error' : 'success');
        this.togglingStatus = false;
        this.loadModalUser(this.selectedUserId);
        this.loadAuditLog(this.selectedUserId);
        this.getAllUser();
      },
      error: () => { this.toast('Error al cambiar estado', 'error'); this.togglingStatus = false; }
    });
  }
}
