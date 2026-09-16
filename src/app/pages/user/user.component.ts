import { CommonModule } from '@angular/common';
import { HttpClientModule } from '@angular/common/http';
import { Component, HostListener, ChangeDetectorRef, OnInit, ViewChild, ElementRef, inject } from '@angular/core';
import { DialogService } from '../../services/dialog.service';
import { ActivatedRoute } from '@angular/router';
import { OntEquipoComponent } from '../../components/ont-equipo/ont-equipo.component';
import { FormsModule } from '@angular/forms';
import { NpSelectComponent, PresentacionSelect } from '../../common/np-select/np-select.component';
import {
  OpcionesDeIps, PRESENTACION_IPS, PRESENTACION_REDES, PRESENTACION_PLANES, PRESENTACION_ROUTERS,
  PRESENTACION_SEGMENTOS, PRESENTACION_PERSONAS, PRESENTACION_POR_PAGINA, conValor,
} from '../../common/np-select/presentaciones';
import { LayoutComponent } from '../../components/layout/layout.component';
import { UserService } from '../../services/user.service';
import { UserInterface } from '../../models/user-interface';
import { GenericInterface } from '../../models/generic-interface';
import { FooterComponent } from '../../components/footer/footer.component';
import { FinanceService } from '../../services/finance.service';
import { FactureInterface } from '../../models/facture-interface';
import { Subscription } from 'rxjs';
import { CompanyWhatsappService } from '../../services/company-whatsapp.service';
import { MikrotikService } from '../../services/mikrotik.service';
import { OltService } from '../../services/olt.service';
import { TareasEnSegundoPlanoService } from '../../services/tareas-en-segundo-plano.service';

interface Toast {
  id: number;
  msg: string;
  type: 'success' | 'error' | 'info';
}

export type ClientStatusFilter = 'all' | 'active' | 'suspended' | 'noip' | 'nowa';
export type ClientRowStatus = 'active' | 'suspended' | 'noip';
export type ClientTab = 'resumen' | 'servicios' | 'facturacion' | 'tickets' | 'historial';

@Component({
  selector: 'app-user',
  templateUrl: './user.component.html',
  standalone: true,
  imports: [CommonModule, FormsModule, NpSelectComponent, HttpClientModule, LayoutComponent, FooterComponent, OntEquipoComponent],
  styleUrls: ['./user.component.scss'],
  host: { class: 'np-console' }
})
export class UserComponent implements OnInit {
  /** Cómo se ven las redes en el selector de VLAN: número de VLAN, segmento y clientes. */
  readonly redes = PRESENTACION_REDES;
  /** Selector de IP: todas las libres y, al buscar, las ocupadas con quién las tiene. */
  readonly ipsPresentacion = PRESENTACION_IPS;
  readonly opcionesIp = new OpcionesDeIps();

  readonly porPagina = [12, 25, 50];
  readonly presPorPagina = PRESENTACION_POR_PAGINA;
  /** Planes con velocidad, tipo y precio. El select guardaba el id en texto ([value]): se sigue guardando así. */
  readonly presPlanes = conValor(PRESENTACION_PLANES, p => String(p.id));
  /** Routers con IP y puerto. Guarda el id numérico, como hacía [ngValue]. */
  readonly presRouters = conValor(PRESENTACION_ROUTERS, r => r.id);

  /** Grupos de corte: el backend manda "Grupo 2 – Día 5 a las 08:00"; arriba el grupo, abajo cuándo se factura. */
  readonly presCortes: PresentacionSelect = {
    valor: d => String(d?.id),
    etiqueta: d => String(d?.names ?? '').split(/\s[–-]\s/)[0],
    detalle: d => String(d?.names ?? '').split(/\s[–-]\s/).slice(1).join(' – ') || null,
    buscarEn: d => String(d?.names ?? ''),
  };

  /** Segmento de la VLAN: red, máscara y gateway, más la VLAN y cuántos clientes tiene. */
  readonly presSegmentos: PresentacionSelect = {
    ...PRESENTACION_SEGMENTOS,
    detalle: s => [s?.gateway ? `Puerta de enlace ${s.gateway}` : null, s?.vlan_id ? `VLAN ${s.vlan_id}` : null, s?.names]
      .filter(Boolean).join(' · ') || null,
    insignia: s => {
      if (s?.clientes == null) return null;
      const n = Number(s.clientes);
      return n ? { texto: `${n} ${n === 1 ? 'cliente' : 'clientes'}`, tono: 'ok' } : { texto: 'Sin clientes aún', tono: 'neutral' };
    },
  };

  /** Perfiles PPP del router: velocidad (rate-limit), de qué rango reparte y cuántas credenciales lo usan. */
  readonly presPerfiles: PresentacionSelect = {
    valor: p => p?.nombre,
    etiqueta: p => p?.nombre ?? '',
    detalle: p => [p?.velocidad ? `Velocidad ${p.velocidad}` : null, p?.pool ? `Reparte de ${p.pool}` : null].filter(Boolean).join(' · ') || null,
    insignia: (p, todos) => {
      if (p?.del_sistema) return { texto: 'Del sistema', tono: 'neutral' };
      if (p?.en_uso == null) return null;
      const n = Number(p.en_uso);
      const mayor = Math.max(1, ...todos.map(x => Number(x?.en_uso ?? 0)));
      return n ? { texto: `${n} en uso`, tono: 'ok', proporcion: n / mayor } : { texto: 'Sin usar', tono: 'neutral' };
    },
    atenuada: p => !!p?.del_sistema,
    buscarEn: p => [p?.nombre, p?.velocidad, p?.pool].filter(Boolean).join(' '),
  };

  readonly presTiposServicio: PresentacionSelect = { valor: s => String(s?.id), etiqueta: s => s?.name ?? '' };

  /** Prioridad con el mismo tono que la píldora de la tabla de tickets. */
  readonly presPrioridades: PresentacionSelect = {
    valor: p => String(p?.id),
    etiqueta: p => p?.name ?? '',
    insignia: p => {
      switch (String(p?.name ?? '').toUpperCase()) {
        case 'ALTA':  return { texto: 'Urgente', tono: 'warn', proporcion: 1 };
        case 'MEDIA': return { texto: 'Normal', tono: 'info', proporcion: 0.6 };
        case 'BAJA':  return { texto: 'Puede esperar', tono: 'neutral', proporcion: 0.3 };
        default:      return null;
      }
    },
  };

  /** Técnicos con iniciales y teléfono. Guarda el id en texto, como el [value] anterior. */
  readonly presTecnicos: PresentacionSelect = {
    ...PRESENTACION_PERSONAS,
    valor: t => String(t?.id_user),
    detalle: t => t?.phone || t?.email || null,
  };

  /**
   * Los <select> con [value] guardaban el id en texto, pero el modelo arranca
   * con el número que manda el backend (o 0). np-select compara estricto:
   * se le pasa en texto para que se vea elegido, y al cambiar recibe texto
   * como antes.
   */
  comoTexto(v: unknown): string | null {
    return v == null ? null : String(v);
  }


  private dialog = inject(DialogService);
  private tareas = inject(TareasEnSegundoPlanoService);

  /** Si el cambio disparó la reconfiguración de la ONT, se sigue en la ventana de tareas. */
  private seguirReconfiguracion(r: any, que: string) {
    const id = Number(r?.data?.aprovisionamiento);
    if (id) this.tareas.seguirAprovisionamiento(id, `${que} · cliente #${this.selectedUserId}`);
  }

  constructor(
    private userSvc: UserService,
    private financeSvc: FinanceService,
    private cdr: ChangeDetectorRef,
    private companyWaSvc: CompanyWhatsappService,
    private oltService: OltService,
    private mikrotikSvc: MikrotikService,
    private route: ActivatedRoute,
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

  // ── Status filter / counts (client-side over the loaded list) ─────────────
  statusFilter: ClientStatusFilter = 'all';
  @ViewChild('searchInput') searchInput?: ElementRef<HTMLInputElement>;

  /** Un cliente PPPoE no tiene IP fija: la recibe al conectarse, no le falta. */
  filaEsPppoe(u: UserInterface): boolean { return u.connection_type === 'pppoe'; }

  /** ¿Le falta IP de verdad? Sólo a los de IP fija sin asignar. */
  sinIp(u: UserInterface): boolean { return !u.ip && !this.filaEsPppoe(u); }

  rowStatus(u: UserInterface): ClientRowStatus {
    if (u.internet_status !== 'ACTIVE') return 'suspended';
    if (this.sinIp(u)) return 'noip';
    return 'active';
  }

  rowStatusLabel(u: UserInterface): string {
    const s = this.rowStatus(u);
    return s === 'active' ? 'Activo' : s === 'suspended' ? 'Suspendido' : 'Sin IP';
  }

  /**
   * Conteos del servidor con la búsqueda aplicada y sin el filtro de estado.
   * Antes se contaba sobre la lista cargada, y "Sin WhatsApp" daba todos: la
   * lista no traía ese dato.
   */
  conteos = { todos: 0, activos: 0, suspendidos: 0, sin_ip: 0, sin_wa: 0 };
  get countActive()    { return this.conteos.activos; }
  get countSuspended() { return this.conteos.suspendidos; }
  get countNoIp()      { return this.conteos.sin_ip; }
  get countNoWa()      { return this.conteos.sin_wa; }

  setStatusFilter(f: ClientStatusFilter) {
    if (f === this.statusFilter) return;
    this.statusFilter = f;
    this.currentPage = 1;
    this.cargarClientes();
  }

  /** La página la arma el servidor: UserInterfaces ya es la página actual. */
  get pagedUsers(): UserInterface[] { return this.UserInterfaces; }

  // Pagination (en la base)
  currentPage = 1;
  entriesPerPage = 12;
  totalEntries = 0;
  totalPages = 1;
  /** Si se escribe o cambia de filtro rápido, sólo cuenta la última respuesta. */
  private cargaActual = 0;

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

  @HostListener('document:keydown', ['$event'])
  onKeydown(ev: KeyboardEvent) {
    const target = ev.target as HTMLElement | null;
    const typing = !!target && ['INPUT', 'SELECT', 'TEXTAREA'].includes(target.tagName);
    if (ev.key === 'Escape') {
      if (this.showPingModal)        { this.closePingModal(); return; }
      if (this.showDeleteModal)      { this.showDeleteModal = false; return; }
      if (this.showSuspendModal)     { this.showSuspendModal = false; return; }
      if (this.showCreateUser)       { this.showCreateUser = false; return; }
      if (this.showClienteModal)     { this.closeClienteModal(); return; }
    }
    if (ev.key === '/' && !typing) {
      ev.preventDefault();
      this.searchInput?.nativeElement.focus();
    }
  }

  // ── Ficha lateral (inspector) ─────────────────────────────────────────────
  inspectorWide = false;
  private readonly wideTabs: ClientTab[] = ['facturacion', 'tickets', 'historial'];

  get inspectorAutoWide() { return this.wideTabs.includes(this.modalTab); }
  get inspectorIsWide()   { return this.inspectorWide || this.inspectorAutoWide; }
  toggleInspectorWide()   { this.inspectorWide = !this.inspectorWide; }

  isSelected(u: UserInterface) { return this.showClienteModal && String(this.selectedUserId) === String(u.id_user); }

  setTab(tab: ClientTab) {
    if (tab === 'servicios') { this.openServiciosTab(); return; }
    this.modalTab = tab;
  }

  private abrirAlCargar = 0;
  /** Pestaña de la ficha abierta por enlace; se aplica cuando llegan sus datos. */
  private tabAlCargar: ClientTab | null = null;

  private abrirPendiente() {
    if (!this.abrirAlCargar) return;
    const id = this.abrirAlCargar;
    this.abrirAlCargar = 0;
    const u = this.UserInterfaces.find(x => Number(x.id_user) === id);
    if (u) { this.openRow(u); return; }
    // Con paginación puede no estar en la primera página: se pide ese cliente solo.
    this.userSvc.getClientesPagina({ page: 1, per_page: 5, cliente_id: id }).subscribe({
      next: r => {
        const fila = r?.data?.items?.[0];
        if (fila) this.openRow(this.aCliente(fila));
      },
    });
  }

  openRow(u: UserInterface) {
    if (this.isSelected(u)) return;
    this.openClienteModal(u.alias, u.id_user, u.id_cab);
  }

  initialOf(name: string | undefined | null): string {
    return (name ?? 'C').trim().charAt(0).toUpperCase() || 'C';
  }

  // ── WhatsApp company status ───────────────────────────────────────────────
  companyHasWA = false;

  ngOnInit() {
    this.onResize(null);
    this.loadCatalogs();
    // ?q=… abre el módulo ya filtrado (lo usa la ficha del cliente del CRM)
    const q = (this.route.snapshot.queryParamMap.get('q') || '').trim();
    // ?cliente=<id> abre su ficha en cuanto llega la lista (lo usa PPPoE).
    this.abrirAlCargar = Number(this.route.snapshot.queryParamMap.get('cliente')) || 0;
    const tab = this.route.snapshot.queryParamMap.get('tab') as ClientTab | null;
    this.tabAlCargar = this.abrirAlCargar && tab ? tab : null;
    if (q) this.search = q;
    this.cargarClientes();
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
      // Se conserva el plan entero: el selector muestra velocidad, tipo y precio.
      this.PlanInternet = r.data.map((e: any) => ({ ...e, id: e.id, names: e.plan_name })));
    this.userSvc.getServiceTicket().subscribe(r => this.serviceTypes = r.data ?? []);
    this.userSvc.getPriorityTicket().subscribe(r => this.priorities = r.data ?? []);
    this.userSvc.getTechnicaAll().subscribe(r => {
      this.technicians = (r.data || []).map((e: any) => ({
        id_user:  e.user_id,
        names:    e.names,
        lastname: e.lastname,
        // Para distinguir técnicos en el selector.
        phone:    e.phone,
        email:    e.email,
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
  /** Recarga la página actual sin esqueleto (la llaman las acciones tras guardar). */
  getAllUser() { this.cargarClientes(true); }

  /** Una página de clientes con el estado y la búsqueda elegidos. */
  cargarClientes(silencioso = false) {
    const carga = ++this.cargaActual;
    if (!silencioso) this.skeletor = true;
    this.userSvc.getClientesPagina({
      page: this.currentPage,
      per_page: this.entriesPerPage,
      estado: this.statusFilter,
      q: this.search.trim(),
    }).subscribe({
      next: r => {
        if (carga !== this.cargaActual) return;
        const d = r?.data ?? {};
        this.UserInterfaces = (d.items ?? []).map((e: any) => this.aCliente(e));
        this.totalEntries = d.total ?? 0;
        this.totalPages   = d.last_page ?? 1;
        this.currentPage  = d.page ?? 1;
        if (d.conteos) this.conteos = d.conteos;
        this.skeletor = false;
        this.abrirPendiente();
      },
      error: () => { if (carga === this.cargaActual) this.skeletor = false; }
    });
  }

  private aCliente(e: any): UserInterface {
    return {
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
      whatsapp_enabled: !!Number(e.whatsapp_enabled ?? 1),
      router_id: e.router_id ?? null,
      connection_type: e.connection_type ?? 'static',
    };
  }

  /** La búsqueda va a la base (nombre, documento, teléfono, correo, IP o usuario). */
  getSearchUser() {
    clearTimeout(this.timer);
    this.timer = setTimeout(() => {
      this.currentPage = 1;
      this.cargarClientes();
    }, 400);
  }

  /** Recibe la cantidad elegida en el np-select (antes leía el evento del <select>). */
  onEntriesPerPageChange(cantidad: number | string) {
    this.entriesPerPage = Number(cantidad);
    this.currentPage = 1;
    this.cargarClientes();
  }

  prevPage() { if (this.currentPage > 1) { this.currentPage--; this.cargarClientes(); } }
  nextPage() { if (!this.isLastPage) { this.currentPage++; this.cargarClientes(); } }
  goToPage(p: number) {
    if (p === this.currentPage) return;
    this.currentPage = p;
    this.cargarClientes();
  }

  toggleDetails(user: UserInterface) { user.expanded = !user.expanded; }

  toggleWhatsapp(user: UserInterface) {
    const val = !user.whatsapp_enabled;
    user.whatsapp_enabled = val;
    this.conteos.sin_wa += val ? -1 : 1;
    this.companyWaSvc.toggleUserWhatsapp(user.id_user!, val).subscribe({
      error: () => {
        user.whatsapp_enabled = !val;
        this.conteos.sin_wa += val ? 1 : -1;
        this.toast('Error al actualizar WhatsApp', 'error');
      }
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
      next: r => {
        if (this.selectedUserId !== userId) return;   // se abrió otro cliente
        this.auditLogs = r.data ?? []; this.loadingAudit = false;
      },
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
    this.inspectorWide   = false;
    this.showCreateFactureForm = false;
    this.showNewTicketForm = false;
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

  /**
   * Todas las cargas del modal comprueban que el cliente siga siendo el mismo
   * antes de aplicar la respuesta. Sin eso, abrir un cliente y enseguida otro
   * podía dejar datos mezclados de los dos.
   */
  loadModalUser(id: number) {
    this.loadingModal = true;
    this.userSvc.getUserById(id).subscribe({
      next: r => {
        if (this.selectedUserId !== id) return;   // se abrió otro cliente

        const e = r.data;
        this.selectedUserData = e;
        this.sesionPppoe = null;
        if (e?.connection_type === 'pppoe') this.cargarPppoeCliente(e?.router_id ? Number(e.router_id) : null);
        this.controlVelocidad = e?.control_velocidad === 'sin_limite' ? 'sin_limite' : 'plan';
        this.internet_plan = e.internet_plans_id ?? 0;
        this.data_cortes   = e.data_cortes_id ?? 0;
        this.loadingModal  = false;
        // Servicios necesita el router del cliente: se abre con los datos ya cargados.
        if (this.tabAlCargar) { const t = this.tabAlCargar; this.tabAlCargar = null; this.setTab(t); }
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

  // ── Tipo de conexión del cliente ──────────────────────────────────────────
  // Se puede pasar de IP fija a PPPoE y al revés sin borrar el cliente: son
  // dos formas de estar en el router, no dos clientes distintos.
  cambioTipo: 'static' | 'pppoe' = 'pppoe';
  cambioUsuario = '';
  cambioClave = '';
  cambioPerfil = '';
  cambioIp = '';
  cambioVlan: any = null;
  cambiandoConexion = false;
  cambioAviso = '';

  get clienteEsPppoe(): boolean {
    return this.selectedUserData?.connection_type === 'pppoe';
  }

  prepararCambioConexion() {
    // Se marca el tipo que el cliente tiene hoy. Antes se preseleccionaba el
    // contrario —el cambio "que tenía sentido"— y eso hacía parecer que el
    // sistema lo daba por PPPoE cuando en realidad era de IP fija.
    this.cambioTipo = this.clienteEsPppoe ? 'pppoe' : 'static';
    this.cambioUsuario = this.selectedUserData?.pppoe_user || String(this.selectedUserData?.dni ?? '');
    this.cambioClave = '';
    this.cambioPerfil = this.selectedUserData?.pppoe_profile || '';
    this.cambioIp = '';
    this.cambioVlan = null;
    this.cambioAviso = '';

    if (this.cambioTipo === 'pppoe' || this.clienteEsPppoe) this.cargarPppoeCliente();
  }

  /** Sin cambio no hay nada que aplicar. */
  get hayCambioDeConexion(): boolean {
    return this.cambioTipo !== (this.clienteEsPppoe ? 'pppoe' : 'static');
  }

  async aplicarCambioConexion() {
    const aPppoe = this.cambioTipo === 'pppoe';

    // Editar las credenciales de un cliente que ya es PPPoE sí es un cambio
    // válido; pasarlo al mismo tipo sin tocar nada, no.
    if (!this.hayCambioDeConexion && !this.clienteEsPppoe) {
      this.toast('El cliente ya se conecta con IP fija', 'info');
      return;
    }

    if (aPppoe && !this.cambioUsuario.trim()) {
      this.toast('Falta el usuario PPPoE', 'error');
      return;
    }

    if (aPppoe && !this.cambioClave.trim() && !this.clienteEsPppoe) {
      this.toast('Falta la contraseña PPPoE', 'error');
      return;
    }

    if (!aPppoe && (!this.cambioIp || !this.cambioVlan)) {
      this.toast('Elegí la VLAN y la IP', 'error');
      return;
    }

    const ok = await this.dialog.confirm(
      aPppoe
        ? `El cliente pasa a conectarse por PPPoE con el usuario «${this.cambioUsuario}» y se le quita la IP fija. ` +
          `Si su ONT está en el TR-069, se reconfigura sola; si no, hay que cargarle las credenciales en el equipo. ¿Confirmás?`
        : `El cliente pasa a IP fija con ${this.cambioIp} y se le borra la credencial PPPoE. ` +
          `Si su ONT está en el TR-069, se reconfigura sola y se carga su MAC en el MikroTik; si no, hay que configurarla en el equipo. ¿Confirmás?`,
      { okLabel: 'Cambiar la conexión' },
    );

    if (!ok) return;

    this.cambiandoConexion = true;
    this.cambioAviso = '';

    this.userSvc.cambiarConexion({
      user_id: this.selectedUserId,
      connection_type: this.cambioTipo,
      pppoe_user: aPppoe ? this.cambioUsuario.trim() : undefined,
      pppoe_password: aPppoe ? this.cambioClave.trim() : undefined,
      pppoe_profile: aPppoe ? this.cambioPerfil : undefined,
      ip: !aPppoe ? this.cambioIp : undefined,
      vlan: !aPppoe ? this.cambioVlan?.names : undefined,
    }).subscribe({
      next: r => {
        this.cambiandoConexion = false;
        this.toast(r.message ?? 'Listo', r.error ? 'error' : 'success');

        if (!r.error) {
          this.seguirReconfiguracion(r, 'Reconfigurando la ONT (cambio de conexión)');
          this.loadModalUser(this.selectedUserId);
          this.getAllUser();
        } else {
          this.cambioAviso = r.message ?? '';
        }
      },
      error: () => {
        this.cambiandoConexion = false;
        this.cambioAviso = 'No se pudo cambiar la conexión.';
      },
    });
  }

  /** Las IP libres para pasarlo a IP fija, por la VLAN elegida. */
  /**
   * Una sola acción para la sección de conexión. Antes había dos formularios
   * —"Tipo de conexión" y "Migración de IP"— que para un cliente de IP fija
   * pedían lo mismo (VLAN e IP), y el primero dejaba el botón deshabilitado.
   * Ahora: IP fija → IP fija es cambiar de IP; cualquier otro caso es cambiar
   * el tipo de conexión.
   */
  aplicarConexion(): void {
    if (this.cambioTipo === 'static' && !this.clienteEsPppoe) {
      void this.cambiarIpFija();
      return;
    }

    void this.aplicarCambioConexion();
  }

  get etiquetaConexion(): string {
    if (this.cambiandoConexion) return 'Aplicando…';

    if (this.cambioTipo === 'static') {
      return this.clienteEsPppoe ? 'Pasar a IP fija' : 'Cambiar a esta IP';
    }

    return this.clienteEsPppoe ? 'Guardar las credenciales' : 'Pasar a PPPoE';
  }

  /** ¿Está todo lo que hace falta para aplicar? */
  get puedeAplicarConexion(): boolean {
    if (this.cambiandoConexion) return false;

    if (this.cambioTipo === 'static') {
      // Ya en IP fija, elegir la misma IP que tiene no es un cambio.
      return !!this.cambioVlan && !!this.cambioIp && this.cambioIp !== this.selectedUserData?.ip;
    }

    return !!this.cambioUsuario.trim();
  }

  /** Cliente de IP fija que cambia de IP (lo que hacía "Migración de IP"). */
  private async cambiarIpFija(): Promise<void> {
    if (!this.cambioIp || !this.cambioVlan) {
      this.toast('Elegí la VLAN y la IP', 'error');
      return;
    }

    const ok = await this.dialog.confirm(
      `El cliente pasa de ${this.selectedUserData?.ip || 'sin IP'} a ${this.cambioIp} (${this.cambioVlan.names}). ` +
      `Hay que reconfigurar su equipo con la IP nueva. ¿Confirmás?`,
      { okLabel: 'Cambiar la IP' },
    );

    if (!ok) return;

    this.cambiandoConexion = true;
    this.cambioAviso = '';

    this.userSvc.migrarIp({
      service_id: this.selectedUserId,
      new_ip: this.cambioIp,
      vlan: this.cambioVlan.names,
      router_id: this.selectedRouterId,
    }).subscribe({
      next: r => {
        this.cambiandoConexion = false;
        this.toast(r.message ?? (r.error ? 'Error' : 'IP cambiada'), r.error ? 'error' : 'success');

        if (!r.error) {
          this.seguirReconfiguracion(r, 'Reconfigurando la ONT (IP nueva)');
          this.cambioVlan = null;
          this.cambioIp = '';
          this.migrIpzone = [];
          this.loadModalUser(this.selectedUserId);
          this.getAllUser();
        } else {
          this.cambioAviso = r.message ?? '';
        }
      },
      error: () => {
        this.cambiandoConexion = false;
        this.toast('Error al cambiar la IP', 'error');
      },
    });
  }

  onCambioVlanChange(iface: any) {
    this.cambioVlan = iface;
    this.cambioIp = '';
    this.migrIpzone = [];

    if (!iface) return;

    this.userSvc.getIpzonebyZone(iface.names, iface.network, this.selectedRouterId).subscribe({
      next: r => { this.migrIpzone = r?.error === 0 && r.data?.ips ? this.opcionesIp.recordar(r.data.ips.map((e: any) => ({ id: e.ip, names: e.ip })), r.data.ocupadas) : []; },
      error: () => { this.migrIpzone = []; },
    });
  }

  // ── PPPoE del cliente ─────────────────────────────────────────────────────
  pppoePerfilesCliente: any[] = [];

  /**
   * La sesión PPPoE activa del cliente: su IP de gestión, el equipo y hace
   * cuánto está conectado. Un cliente PPPoE no aparece en el ARP, así que
   * sin esto la ficha decía "IP sin asignar" y no había a qué hacerle ping.
   */
  sesionPppoe: { ip: string | null; desde: string | null; mac: string | null } | null = null;
  cargandoSesionPppoe = false;

  private cargarPppoeCliente(routerId?: number | null) {
    const router = routerId ?? this.selectedRouterId ?? (this.selectedUserData?.router_id ? Number(this.selectedUserData.router_id) : null);
    this.cargandoSesionPppoe = true;

    this.userSvc.getPppoe(router).subscribe({
      next: r => {
        this.cargandoSesionPppoe  = false;
        this.pppoePerfilesCliente = r?.data?.estado?.perfiles ?? [];

        const usuario = this.selectedUserData?.pppoe_user;
        const cred = (r?.data?.usuarios ?? []).find((u: any) =>
          (usuario && u.usuario === usuario) || String(u.user_id) === String(this.selectedUserId));

        this.sesionPppoe = cred?.sesion ?? null;
      },
      error: () => { this.cargandoSesionPppoe = false; this.pppoePerfilesCliente = []; },
    });
  }

  /** La IP para ver y para hacerle ping: la fija, o la de la sesión PPPoE. */
  get ipDeGestion(): string {
    if (this.clienteEsPppoe) return this.sesionPppoe?.ip ?? '';
    return this.selectedUserData?.ip ?? '';
  }

  /** Lo que se muestra al lado del documento en el encabezado de la ficha. */
  get ipCabecera(): string {
    if (!this.clienteEsPppoe) return this.selectedUserData?.ip || 'sin asignar';
    if (this.cargandoSesionPppoe && !this.sesionPppoe) return 'PPPoE · consultando…';
    return this.sesionPppoe?.ip ? `PPPoE · ${this.sesionPppoe.ip}` : 'PPPoE · desconectado';
  }

  // ── Migración IP ──────────────────────────────────────────────────────────
  migrVlan: any = null;
  migrSeg: any = null;
  migrIp = '';
  migrSegments: any[] = [];
  migrIpzone: any[] = [];
  submittingMigr = false;

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
    this.prepararCambioConexion();
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
        // Si mientras respondía se abrió otro cliente, esta respuesta ya no
        // corresponde: aplicarla mostraba la cabecera de un cliente con las
        // facturas de otro, que es un error grave en una pantalla de plata.
        if (this.selectedUserCab !== cabId) return;

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

  async payFacture(item: FactureInterface) {
    if (!item.id || item.paid === 1) return;

    // Registrar un pago mueve la cartera del cliente y no se deshace solo:
    // se confirma antes, como el resto de acciones con consecuencia.
    if (!await this.dialog.confirm(
      `¿Registrar el pago de la factura ${item.number_facture} por $${Number(item.price_total || 0).toLocaleString('es-CO')}?`
    )) return;

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

  async downloadPdf(id: any) {
    if (!await this.dialog.confirm('¿Descargar la factura en PDF?')) return;
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

  async downloadPayPdf(id: any, extra: any) {
    if (!await this.dialog.confirm('¿Descargar el comprobante de pago?')) return;
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

  async sendInvoiceWA(invoiceId: string, item: any) {
    // Por cuál canal. No es lo mismo: la API de Meta solo acepta mensajes
    // libres si el cliente escribió en las últimas 24 h, y forzarlo fuera de
    // esa ventana es lo que termina costando el bloqueo de la línea. Si está
    // cerrada, el backend manda la plantilla aprobada en vez del PDF.
    const canal = await this.dialog.choose(
      `¿Por dónde enviamos la factura ${item.number_facture}?`,
      [
        { id: 'netplay', label: 'WhatsApp Web', hint: 'Manda el PDF directo. Sin límite de horario.' },
        { id: 'meta',    label: 'API de Meta',  hint: 'Si el cliente no escribió en 24 h se envía la plantilla aprobada, no el PDF.' },
      ],
      'Enviar factura'
    );

    if (!canal) return;

    item._waSending = true;
    this.userSvc.sendInvoiceByWhatsApp(invoiceId, canal).subscribe({
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
      next: r => {
        if (this.selectedUserId !== userId) return;   // se abrió otro cliente
        this.userTickets = r.data ?? []; this.loadingTickets = false;
      },
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
        if (this.showClienteModal && this.selectedUserId === this.pendingSuspendId) {
          this.loadModalUser(this.selectedUserId);
          this.loadAuditLog(this.selectedUserId);
        }
      },
      error: () => { this.toast('Error al actualizar estado', 'error'); this.showSuspendModal = false; }
    });
  }

  // ── Eliminar ──────────────────────────────────────────────────────────────
  /** Lo que el cliente tiene en su MikroTik, leído al abrir la confirmación. */
  enRouter: any = null;
  cargandoEnRouter = false;
  /** Si al eliminar se borran también sus credenciales del MikroTik. */
  quitarDelRouter = false;
  eliminando = false;

  openDeleteModal(id: any, dni: any, routerId?: number | null) {
    this.pendingDeleteId       = id;
    this.pendingDeleteDni      = dni;
    this.pendingDeleteRouterId = routerId ?? null;
    this.quitarDelRouter       = false;
    this.enRouter              = null;
    this.showDeleteModal       = true;
    this.cargandoEnRouter      = true;
    this.userSvc.clienteEnRouter(id).subscribe({
      next: r => { this.cargandoEnRouter = false; this.enRouter = r?.data ?? { ok: false, error: r?.message }; },
      error: () => { this.cargandoEnRouter = false; this.enRouter = { ok: false, error: 'No se pudo leer el MikroTik.' }; },
    });
  }

  confirmDelete() {
    if (this.eliminando) return;
    this.eliminando = true;
    // Si no se borra, se deshabilita: el cliente eliminado no puede seguir
    // navegando, pero su credencial queda para reactivarlo si fue un error.
    this.userSvc.deleteUserData(this.pendingDeleteId, this.quitarDelRouter ? 'quitar' : 'suspender').subscribe({
      next: r => {
        this.eliminando = false;
        this.toast(r.message ?? 'Eliminado', r.error ? 'error' : 'success');
        this.showDeleteModal = false;
        if (!r.error && this.showClienteModal && this.selectedUserId === this.pendingDeleteId) this.closeClienteModal();
        this.getAllUser();
      },
      error: () => { this.eliminando = false; this.toast('Error al eliminar', 'error'); this.showDeleteModal = false; }
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
  /** Dónde queda el alta a medio llenar. */
  private readonly BORRADOR_ALTA = 'np:alta-cliente';

  newUser: any = this.usuarioEnBlanco();
  submittingNewUser = false;
  showUserFormProfile = true;
  selectedVlan: any = null;
  selectedSeg: any = null;

  // El backend responde HTTP 200 aunque el MikroTik no contestó (error: 1).
  // Sin este estado el select de IP quedaba vacío y deshabilitado sin decir
  // por qué, y no había forma de reintentar sin cerrar y reabrir el modal.
  loadingIps = false;
  ipsError: string | null = null;
  loadingIfaces = false;
  ifacesError: string | null = null;
  borradorRestaurado = false;

  private usuarioEnBlanco() {
    return {
      names: '', lastname: '', dni: '', phone: '', email: '', address: '',
      plan_id: 0, ip: 0, periode_facturation: 0, countries: 1,
      // Con IP fija el cliente vive en el ARP del router; con PPPoE entra con
      // usuario y contraseña y la IP se la da el pool.
      connection_type: 'static',
      pppoe_user: '', pppoe_password: '', pppoe_profile: '',
    };
  }

  // ── PPPoE ─────────────────────────────────────────────────────────────────
  pppoeDisponible = false;
  pppoePerfiles: any[] = [];
  pppoeAviso = '';

  get esPppoe(): boolean {
    return this.newUser?.connection_type === 'pppoe';
  }

  cambiarTipoConexion(tipo: 'static' | 'pppoe') {
    this.newUser.connection_type = tipo;
    this.guardarBorrador();

    if (tipo === 'pppoe') {
      this.cargarPppoe();
      // El usuario por defecto es el documento: es lo que se usa para
      // encontrarlo después, igual que el comment del ARP.
      if (!this.newUser.pppoe_user && this.newUser.dni) {
        this.newUser.pppoe_user = String(this.newUser.dni).trim();
      }
    }
  }

  cargarPppoe() {
    this.pppoeAviso = '';

    this.userSvc.getPppoe(this.selectedRouterId).subscribe({
      next: r => {
        if (r?.error !== 0) { this.pppoeAviso = r?.message || 'No se pudo leer el router.'; return; }

        this.pppoeDisponible = !!r.data?.estado?.disponible;
        this.pppoePerfiles = r.data?.estado?.perfiles ?? [];

        if (!this.pppoePerfiles.length) {
          this.pppoeAviso = 'El router no tiene perfiles PPP configurados.';
          return;
        }

        if (!this.newUser.pppoe_profile) {
          this.newUser.pppoe_profile = this.pppoePerfiles[0].nombre;
        }

        // Se puede crear igual, pero conviene avisar: sin servidor PPPoE
        // levantado el cliente no va a poder autenticarse.
        if (!this.pppoeDisponible) {
          this.pppoeAviso = 'El router no tiene un servidor PPPoE levantado. Se puede crear el usuario, pero no podrá conectarse hasta que lo configures.';
        }
      },
      error: () => { this.pppoeAviso = 'No se pudo leer la configuración PPPoE del router.'; },
    });
  }

  /**
   * Una contraseña que el cliente no tenga que inventar.
   *
   * Sin las letras y números que se confunden al dictarla por teléfono: ni
   * ele minúscula, ni o, ni cero, ni uno.
   */
  private claveNueva(): string {
    const abc = 'abcdefghijkmnpqrstuvwxyz23456789';
    let clave = '';
    for (let i = 0; i < 10; i++) clave += abc[Math.floor(Math.random() * abc.length)];
    return clave;
  }

  generarClavePppoe() {
    this.newUser.pppoe_password = this.claveNueva();
    this.guardarBorrador();
  }

  /** 'plan' sigue la velocidad de su plan; 'sin_limite' queda fuera. */
  controlVelocidad: 'plan' | 'sin_limite' = 'plan';

  guardarControlVelocidad(): void {
    this.mikrotikSvc.controlDelCliente(this.selectedUserId, this.controlVelocidad).subscribe({
      next: (r: any) => {
        if (r?.error !== 0) { this.toast(r?.message || 'No se pudo guardar', 'error'); return; }
        this.toast(r.message, 'success');
      },
      error: () => this.toast('No se pudo guardar', 'error'),
    });
  }

  /** La misma ayuda en la ficha: al cambiar la conexión de un cliente. */
  generarClaveCambio() {
    this.cambioClave = this.claveNueva();
  }

  onCreateRouterChange() {
    this.selectedVlan = null;
    this.segments = [];
    this.selectedSeg = null;
    this.Ipzone = [];
    this.ipsError = null;
    this.cargarInterfaces();
    this.guardarBorrador();
  }

  /** El selector muestra sólo las redes que dan internet; con esto, todas las del router. */
  todasLasRedes = false;

  alternarTodasLasRedes() {
    this.todasLasRedes = !this.todasLasRedes;
    this.cargarInterfaces();
  }

  /** VLAN del router elegido, con aviso si el router no responde. */
  cargarInterfaces() {
    this.loadingIfaces = true;
    this.ifacesError = null;

    this.userSvc.getneighborhoodAll(this.selectedRouterId, this.todasLasRedes).subscribe({
      next: r => {
        this.loadingIfaces = false;
        this.interfaces = r?.error === 0 && r.data ? Object.values(r.data) : [];

        if (!this.interfaces.length) {
          this.ifacesError = r?.message || 'El router no devolvió VLAN.';
          return;
        }

        this.reemparejarVlan();
      },
      error: () => {
        this.loadingIfaces = false;
        this.interfaces = [];
        this.ifacesError = 'No se pudo conectar con el router.';
      },
    });
  }

  /**
   * Vuelve a apuntar la VLAN del borrador al objeto real de la lista: el
   * select compara por referencia, así que el objeto guardado no se veía
   * seleccionado aunque tuviera los mismos datos.
   */
  private reemparejarVlan() {
    if (!this.selectedVlan) return;

    const igual = this.interfaces.find((i: any) => i.names === this.selectedVlan.names);
    this.selectedVlan = igual ?? null;
    this.segments     = igual ? [igual] : [];
    this.selectedSeg  = this.segments[0] ?? null;

    if (this.selectedSeg) this.cargarIps();
    else this.Ipzone = [];
  }

  onInterfaceChange(iface: any) {
    this.selectedVlan = iface;
    this.segments = iface ? [iface] : [];
    this.Ipzone = [];
    this.ipsError = null;

    // La VLAN trae un único segmento: se elige solo, para no obligar a
    // seleccionar lo único que hay.
    this.selectedSeg = this.segments[0] ?? null;
    if (this.selectedSeg) this.cargarIps();

    this.guardarBorrador();
  }

  onSegmentChange(seg: any) {
    this.selectedSeg = seg;

    if (!seg || !this.selectedVlan) {
      this.Ipzone = [];
      this.ipsError = null;
      return;
    }

    this.cargarIps();
    this.guardarBorrador();
  }

  /**
   * Pide al router las IPs libres del segmento.
   *
   * Reintenta solo hasta tres veces: el MikroTik a veces no contesta a la
   * primera y antes eso dejaba el alta trabada, sin más salida que cerrar el
   * modal y volver a abrirlo perdiendo todo lo escrito.
   */
  cargarIps(intento = 1) {
    const seg = this.selectedSeg;

    if (!seg || !this.selectedVlan) { this.Ipzone = []; return; }

    this.loadingIps = true;
    this.ipsError   = null;

    this.userSvc.getIpzonebyZone(seg.names, seg.network, this.selectedRouterId).subscribe({
      next: r => {
        // error !== 0 es el router que no respondió, no un segmento lleno.
        if (r?.error !== 0) {
          if (intento < 3) { setTimeout(() => this.cargarIps(intento + 1), 900 * intento); return; }
          this.loadingIps = false;
          this.Ipzone = [];
          this.ipsError = r?.message || 'El router no respondió. Reintentá en un momento.';
          return;
        }

        this.loadingIps = false;
        this.Ipzone = this.opcionesIp.recordar((r?.data?.ips ?? []).map((e: any) => ({ id: e.ip, names: e.ip })), r?.data?.ocupadas);
        this.ipsError = this.Ipzone.length ? null : 'No quedan IPs libres en este segmento.';

        // Si la IP que traía el borrador ya se la dieron a otro, se descarta.
        if (this.newUser.ip && !this.Ipzone.some((i: any) => i.id === this.newUser.ip)) {
          this.newUser.ip = 0;
        }
      },
      error: () => {
        if (intento < 3) { setTimeout(() => this.cargarIps(intento + 1), 900 * intento); return; }
        this.loadingIps = false;
        this.Ipzone = [];
        this.ipsError = 'No se pudo conectar con el router. Verificá que esté en línea y reintentá.';
      },
    });
  }

  /* ── Borrador del alta ────────────────────────────────────────────────────
   * El formulario se guarda mientras se llena. Si el router falla, si se
   * cierra el modal sin querer o si se recarga la página, lo escrito sigue
   * ahí y solo hace falta reintentar la consulta de IPs.
   */

  private guardaPendiente: any = null;

  guardarBorrador() {
    clearTimeout(this.guardaPendiente);
    this.guardaPendiente = setTimeout(() => this.escribirBorrador(), 400);
  }

  private escribirBorrador() {
    if (!this.hayAlgoEscrito()) { this.limpiarBorrador(); return; }

    try {
      localStorage.setItem(this.BORRADOR_ALTA, JSON.stringify({
        newUser:  this.newUser,
        routerId: this.selectedRouterId,
        vlan:     this.selectedVlan,
        pestania: this.showUserFormProfile,
        guardado: Date.now(),
      }));
    } catch {
      // Modo privado o cuota llena: el formulario sigue funcionando igual.
    }
  }

  private hayAlgoEscrito(): boolean {
    const u = this.newUser ?? {};
    return ['names', 'lastname', 'dni', 'phone', 'email', 'address'].some(k => !!String(u[k] ?? '').trim())
        || Number(u.plan_id) > 0
        || Number(u.periode_facturation) > 0
        || !!this.selectedVlan;
  }

  private leerBorrador(): any | null {
    try {
      const crudo = localStorage.getItem(this.BORRADOR_ALTA);
      if (!crudo) return null;

      const b = JSON.parse(crudo);

      // Un borrador de más de un día ya no le sirve a nadie.
      if (!b?.guardado || Date.now() - b.guardado > 86_400_000) { this.limpiarBorrador(); return null; }

      return b;
    } catch {
      return null;
    }
  }

  private limpiarBorrador() {
    try { localStorage.removeItem(this.BORRADOR_ALTA); } catch { /* nada que borrar */ }
  }

  /** Tirar el borrador y arrancar el alta de cero. */
  descartarBorrador() {
    clearTimeout(this.guardaPendiente);
    this.limpiarBorrador();
    this.borradorRestaurado = false;

    this.newUser          = this.usuarioEnBlanco();
    this.selectedRouterId = null;
    this.selectedVlan     = null;
    this.selectedSeg      = null;
    this.segments         = [];
    this.Ipzone           = [];
    this.ipsError         = null;
    this.showUserFormProfile = true;
  }

  openCreateUserModal() {
    const b = this.leerBorrador();

    this.newUser          = b?.newUser ?? this.usuarioEnBlanco();
    this.selectedRouterId = b?.routerId ?? null;
    this.selectedVlan     = b?.vlan ?? null;
    this.selectedSeg      = null;
    this.segments         = this.selectedVlan ? [this.selectedVlan] : [];
    this.Ipzone           = [];
    this.ipsError         = null;
    this.ifacesError      = null;
    this.showUserFormProfile = b ? (b.pestania ?? true) : true;
    this.borradorRestaurado  = !!b;

    if (!this.routers.length) this.loadRouters();

    // Las VLAN se piden siempre: de ahí sale el objeto real con el que se
    // reempareja la del borrador y se vuelven a pedir las IPs libres, que
    // cambian todo el tiempo.
    this.cargarInterfaces();

    this.showCreateUser = true;
  }

  createUser() {
    if (this.esPppoe && (!this.newUser.pppoe_user?.trim() || !this.newUser.pppoe_password?.trim())) {
      this.toast('Para una conexión PPPoE hacen falta el usuario y la contraseña', 'error');
      return;
    }

    this.submittingNewUser = true;
    this.newUser.vlan = this.selectedVlan?.names ?? '';
    this.newUser.router_id = this.selectedRouterId;

    // Con PPPoE no se manda IP: la asigna el pool del router.
    if (this.esPppoe) {
      this.newUser.ip = null;
    }
    this.userSvc.create(this.newUser).subscribe({
      next: r => {
        this.toast(r.message ?? (r.error ? 'Error' : 'Cliente creado'), r.error ? 'error' : 'success');
        if (!r.error) {
          // Recién acá se tira el borrador: si el alta falló, lo escrito queda.
          this.limpiarBorrador();
          this.borradorRestaurado = false;
          this.newUser = this.usuarioEnBlanco();
          this.selectedVlan = null; this.selectedSeg = null;
          this.segments = []; this.Ipzone = [];
          this.showCreateUser = false;
          this.getAllUser();
        }
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
