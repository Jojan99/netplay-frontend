import { ActivatedRoute } from '@angular/router';
import { SeccionTabsComponent } from '../../components/seccion-tabs/seccion-tabs.component';
import { DialogService } from '../../services/dialog.service';
import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterModule } from '@angular/router';
import { InstallationService, InstallationOrder, InstallationLog } from '../../services/installation.service';
import { InsigniaSelect, NpSelectComponent } from '../../common/np-select/np-select.component';
import { ProvisionarInstalacionComponent } from './provisionar/provisionar-instalacion.component';
import { AprovisionamientoEnVivoComponent } from './provisionar/aprovisionamiento-en-vivo.component';
import { OpcionSimple, PRESENTACION_METODOS_PAGO, PRESENTACION_SIMPLE, conValor } from '../../common/np-select/presentaciones';
import { AuthService } from '../../services/auth.service';
import { LocationTrackerService } from '../../services/location-tracker.service';

@Component({
  selector: 'app-installations',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterModule, NpSelectComponent, ProvisionarInstalacionComponent, AprovisionamientoEnVivoComponent, SeccionTabsComponent],
  templateUrl: './installations.component.html',
  styleUrls: ['./installations.component.scss', './instalaciones-limpio.scss'],
  host: { class: 'np-console' },
})
export class InstallationsComponent implements OnInit {
  private dialog = inject(DialogService);
  private gps = inject(LocationTrackerService);
  completando = false;
  installations: InstallationOrder[] = [];
  allInstallations: InstallationOrder[] = [];
  isLoading = false;
  successMsg = '';
  errorMsg = '';

  totalPages = 0;
  currentPage = 1;

  statusFilter = '';
  paymentStatusFilter = '';
  dateFrom = '';
  dateTo = '';

  showDetail = false;
  selected: InstallationOrder | null = null;

  showPaymentModal = false;
  paymentForm = { payment_status: 'pending', payment_amount: '', payment_reference: '', payment_method_id: '' };

  showAssignModal = false;
  assignForm: any = { technician_ids: [] as number[], commission_amount: '' };

  showCompleteModal = false;
  completeNotes = '';

  actionLoading: { [id: number]: string } = {};

  showCancelModal = false;
  cancelReason = '';

  technicians: any[] = [];
  paymentMethods: any[] = [];

  logs: InstallationLog[] = [];
  loadingLogs = false;

  showTechModal = false;
  showTechSummary = false;
  inspectorWide = false;

  isSelected(i: InstallationOrder): boolean { return this.showDetail && !!this.selected && this.selected.id === i.id; }
  paymentLabel(s: string): string { return this.PAYMENT_STATUS_OPTIONS.find(o => o.value === s)?.label || s; }
  logKind(action: string): string {
    if (action === 'complete') return 'ok';
    if (action === 'cancel') return 'error';
    if (action?.startsWith('payment_')) return 'abono';
    return 'neutral';
  }
  selectedTech: any = null;
  techInstallations: any[] = [];

  openTechDetail(tech: any): void {
    this.selectedTech = tech;
    const all = this.reales;
    this.techInstallations = all.filter(i => {
      const isCompleted = i.status === 'completed' || i.payment_status === 'verified';
      const techIds: number[] = i.technician_ids || [];
      const hasTech = techIds.some((id: number) => id === parseInt(tech.id) || id === tech.id);
      return isCompleted && hasTech;
    }).map(i => ({
      ...i,
      techCommission: this.getNumValue(i.commission_amount) / (i.technician_ids?.length || 1)
    }));
    this.showTechModal = true;
  }

  closeTechModal(): void {
    this.showTechModal = false;
    this.selectedTech = null;
    this.techInstallations = [];
  }

  readonly STATUS_OPTIONS = [
    { value: '', label: 'Todos' },
    { value: 'pending', label: 'Pendiente' },
    { value: 'confirmed', label: 'Confirmada' },
    { value: 'in_progress', label: 'En proceso' },
    { value: 'completed', label: 'Completada' },
    { value: 'cancelled', label: 'Cancelada' },
  ];

  /** El técnico sólo tiene lo suyo por instalar: el servidor ya no le manda completadas ni
   * canceladas (ver InstallationOrderController::index), así que esos chips no pintan nada. */
  get opcionesDeEstado() {
    return this.esTecnico ? this.STATUS_OPTIONS.filter(o => o.value !== 'completed' && o.value !== 'cancelled') : this.STATUS_OPTIONS;
  }

  readonly PAYMENT_STATUS_OPTIONS = [
    { value: '', label: 'Todos' },
    { value: 'pending', label: 'Pendiente' },
    { value: 'paid', label: 'Pagado' },
    { value: 'verified', label: 'Verificado' },
    { value: 'rejected', label: 'Rechazado' },
  ];

  // En los selectores, cada estado lleva su tono: lo que falta cobrar o verificar resalta.
  private readonly INSIGNIA_PAGO: Record<string, InsigniaSelect> = {
    pending:  { texto: 'Por cobrar', tono: 'warn' },
    paid:     { texto: 'Por verificar', tono: 'info' },
    verified: { texto: 'Confirmado', tono: 'ok' },
    rejected: { texto: 'No válido', tono: 'neutral' },
  };
  /** Los mismos estados de PAYMENT_STATUS_OPTIONS, sin "Todos" (el filtro lo agrega como opción vacía). */
  readonly opcionesEstadoPago: OpcionSimple[] = this.PAYMENT_STATUS_OPTIONS
    .filter(o => o.value)
    .map(o => ({ valor: o.value, etiqueta: o.label, insignia: this.INSIGNIA_PAGO[o.value] }));
  readonly presSimple = PRESENTACION_SIMPLE;
  // [value]="pm.id" guardaba el id en texto: savePayment lo pasa por parseInt.
  readonly presMetodosPago = conValor(PRESENTACION_METODOS_PAGO, m => String(m.id));

  constructor(private svc: InstallationService, private auth: AuthService) {}

  /** «?orden=12»: se abre esa orden al cargar (desde «Mi día»). */
  private ruta = inject(ActivatedRoute);
  private abrirOrden = Number(this.ruta.snapshot.queryParamMap.get('orden')) || 0;
  /** «&instalar=1»: además abre «Instalar el equipo» (el botón de «Mi día»). */
  private abrirInstalar = this.ruta.snapshot.queryParamMap.get('instalar') === '1';

  /**
   * Un técnico ve sólo sus propias órdenes (el servidor ya se las filtra, ver
   * InstallationOrderController::index) y avanza su estado, pero no da de alta una instalación
   * nueva, ni ve lo que cobra la empresa, ni la comisión de sus compañeros, ni cancela, reasigna o
   * borra una orden ajena: eso sigue siendo de oficina.
   */
  get esTecnico(): boolean { return this.auth.isTecnico(); }

  /** Mi comisión en esta orden, si estoy entre los técnicos asignados; si no, no es asunto mío. */
  miComision(i: any): number | null {
    const ids: number[] = i?.technician_ids || [];
    const yo = this.auth.getEmployeeId();
    if (!yo || !ids.includes(yo)) return null;
    return this.getNumValue(i.commission_amount) / (ids.length || 1);
  }

  // ── Lo que muestra el diseño nuevo (21-10-2026) ─────────────────────────
  private fechaLocal(d: Date): string {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }

  /** Lunes a sábado de esta semana, con cuántas órdenes tiene cada día. */
  get semana(): Array<{ fecha: string; nombre: string; numero: number; total: number; texto: string }> {
    const hoy = new Date();
    const lunes = new Date(hoy);
    lunes.setDate(hoy.getDate() - ((hoy.getDay() + 6) % 7));
    const hoyTxt = this.fechaLocal(hoy);
    const NOMBRES = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
    return NOMBRES.map((nombre, i) => {
      const d = new Date(lunes);
      d.setDate(lunes.getDate() + i);
      const fecha = this.fechaLocal(d);
      const del = (this.allInstallations ?? []).filter((x: any) => String(x.scheduled_date ?? '').slice(0, 10) === fecha && x.status !== 'cancelled');
      const hechas = del.filter((x: any) => x.status === 'completed').length;
      const porHacer = del.length - hechas;
      const texto = !del.length ? 'libre' : [porHacer ? `${porHacer} por hacer` : '', hechas ? `${hechas} ${hechas === 1 ? 'hecha' : 'hechas'}` : ''].filter(Boolean).join(' · ');
      return { fecha, nombre: fecha === hoyTxt ? 'Hoy' : nombre, numero: d.getDate(), total: del.length, texto };
    });
  }

  /** Tocar un día filtra por esa fecha; tocarlo otra vez quita el filtro. */
  elegirDia(fecha: string): void {
    const igual = this.dateFrom === fecha && this.dateTo === fecha;
    this.dateFrom = igual ? '' : fecha;
    this.dateTo = igual ? '' : fecha;
    this.filter();
  }

  conteoEstado(estado: string): number {
    return (this.allInstallations ?? []).filter((x: any) => x.status === estado).length;
  }

  /** Los pasos de una orden, de los datos al equipo instalado, con dónde va. */
  avanceDe(o: any): Array<{ titulo: string; detalle?: string; estado: 'ok' | 'curso' | 'falta' | 'mal' }> {
    if (!o) return [];
    if (o.status === 'cancelled') return [{ titulo: 'Orden cancelada', detalle: o.observations || undefined, estado: 'mal' }];
    const pagado = ['paid', 'verified'].includes(o.payment_status);
    const tecnicos = (o.technician_ids ?? []).length;
    const instalada = !!o.provision_detalle?.pasos?.length;
    const fallo = instalada && o.provision_detalle.pasos.some((p: any) => !p.ok);
    const hecha = o.status === 'completed';
    return [
      { titulo: 'Datos y plan', detalle: (o.plan as any)?.plan_name || o.plan?.name || undefined, estado: 'ok' },
      { titulo: 'Pago de la instalación', detalle: pagado ? (o.payment_status === 'verified' ? 'verificado' : 'por verificar') : (o.payment_status === 'rejected' ? 'comprobante no válido' : 'por cobrar'),
        estado: pagado ? 'ok' : (o.payment_status === 'rejected' ? 'mal' : 'falta') },
      { titulo: 'Técnicos', detalle: tecnicos ? `${tecnicos} asignado${tecnicos > 1 ? 's' : ''}` : 'sin asignar', estado: tecnicos ? 'ok' : 'falta' },
      { titulo: 'Equipo instalado y aprovisionado', detalle: instalada ? (fallo ? 'algún paso falló: ver el detalle abajo' : 'ONT autorizada y configurada') : (o.status === 'in_progress' ? 'en la casa del cliente' : undefined),
        estado: instalada ? (fallo ? 'mal' : 'ok') : (o.status === 'in_progress' ? 'curso' : 'falta') },
      { titulo: 'Orden completada', estado: hecha ? 'ok' : 'falta' },
    ];
  }

  ngOnInit(): void {
    this.loadAllForSummary();
    this.load();
    this.loadOptions();
  }

  loadAllForSummary(): void {
    this.svc.getAll({ per_page: 500 }).subscribe({
      next: (r: any) => {
        this.allInstallations = r.data || r || [];
      }
    });
  }

  loadOptions(): void {
    this.svc.getTechnicians().subscribe(r => this.technicians = r?.data || r || []);
    this.svc.getPaymentMethods().subscribe(r => this.paymentMethods = r?.data || r || []);
  }

  toggleAssignTechnician(id: number): void {
    if (!this.assignForm.technician_ids) {
      this.assignForm.technician_ids = [];
    }
    const idx = this.assignForm.technician_ids.indexOf(id);
    if (idx > -1) {
      this.assignForm.technician_ids.splice(idx, 1);
    } else {
      this.assignForm.technician_ids.push(id);
    }
  }

  load(): void {
    this.isLoading = true;
    const filter: any = { page: this.currentPage, per_page: 20 };
    if (this.statusFilter) filter.status = this.statusFilter;
    if (this.paymentStatusFilter) filter.payment_status = this.paymentStatusFilter;
    if (this.dateFrom) filter.date_from = this.dateFrom;
    if (this.dateTo) filter.date_to = this.dateTo;

    this.svc.getAll(filter).subscribe({
      next: (r: any) => {
        this.isLoading = false;
        if (Array.isArray(r)) {
          this.installations = r;
        } else if (Array.isArray(r.data)) {
          this.installations = r.data;
        } else {
          this.installations = [];
        }
        this.totalPages = r.last_page || r.lastPage || 1;
        this.currentPage = r.current_page || r.currentPage || 1;
        if (this.abrirOrden) {
          const o = this.installations.find((x: any) => Number(x.id) === this.abrirOrden)
            ?? (this.allInstallations ?? []).find((x: any) => Number(x.id) === this.abrirOrden);
          if (o) {
            this.abrirOrden = 0;
            this.openDetail(o);
            if (this.abrirInstalar && ['confirmed', 'in_progress'].includes(o.status)) this.abrirProvisionar(o);
            this.abrirInstalar = false;
          }
        }
        
        if (!this.statusFilter && !this.paymentStatusFilter && !this.dateFrom && !this.dateTo) {
          this.allInstallations = this.installations;
        }
      },
      error: () => { this.isLoading = false; },
    });
  }

  filter(): void {
    this.currentPage = 1;
    this.load();
  }

  clearFilters(): void {
    this.statusFilter = '';
    this.paymentStatusFilter = '';
    this.dateFrom = '';
    this.dateTo = '';
    this.currentPage = 1;
    this.load();
  }

  prevPage(): void {
    if (this.currentPage > 1) { this.currentPage--; this.load(); }
  }

  nextPage(): void {
    if (this.currentPage < this.totalPages) { this.currentPage++; this.load(); }
  }

  openDetail(i: InstallationOrder): void {
    this.selected = i;
    this.showDetail = true;
    this.loadLogs(i.id!);
    this.cargarTv(i.id!);
  }

  /** La TV de la orden: si el plan la incluye y, ya instalada, la línea con su URL M3U. */
  tvOrden: { incluida: boolean; linea: { usuario: string; clave: string; estado: string; servidor: string; m3u: string } | null; cuando: string | null } | null = null;
  copiadoTv = false;

  private cargarTv(id: number): void {
    this.tvOrden = null;
    this.svc.getById(id).subscribe({
      next: (r: any) => { if (this.selected?.id === id) this.tvOrden = (r?.data ?? r)?.tv ?? null; },
      error: () => { /* sin TV en el detalle: lo demás sigue */ },
    });
  }

  copiarM3u(url: string): void {
    navigator.clipboard?.writeText(url).then(() => { this.copiadoTv = true; setTimeout(() => this.copiadoTv = false, 2000); }).catch(() => {});
  }

  loadLogs(id: number): void {
    this.loadingLogs = true;
    this.logs = [];
    this.svc.getLogs(id).subscribe({
      next: (r: any) => {
        this.logs = r.data || r || [];
      },
      complete: () => { this.loadingLogs = false; }
    });
  }

  closeDetail(): void {
    this.showDetail = false;
    this.selected = null;
    this.logs = [];
  }

  confirm(id: number): void {
    this.actionLoading[id] = 'confirm';
    this.svc.confirm(id).subscribe({
      next: r => {
        this.svc.createLog(id, { action: 'confirm', description: 'Instalación confirmada' }).subscribe();
        this.toast(r.message);
        this.load();
      },
      complete: () => { delete this.actionLoading[id]; }
    });
  }

  /**
   * La instalación que el técnico está terminando.
   *
   * Va en su propia pantalla porque es lo que se hace en la calle, con el
   * equipo en la mano: esta lista es para la oficina.
   */
  provisionando: any = null;

  // ── Modo práctica ─────────────────────────────────────────────────────────

  creandoPractica = false;

  /**
   * Crea una orden de práctica: se recorre exactamente el flujo de instalar —iniciar, elegir el equipo,
   * corregir por dónde entra, terminar— con un equipo simulado. No toca la OLT, no crea ningún cliente
   * y no descuenta inventario. Sirve para enseñar el módulo antes de tener una ONT en la mano.
   */
  crearPractica(): void {
    if (this.creandoPractica) return;
    this.creandoPractica = true;

    this.svc.crearPractica().subscribe({
      next: (r: any) => { this.creandoPractica = false; this.toast(r?.message || 'Orden de práctica creada.'); this.statusFilter = ''; this.load(); },
      error: (e: any) => { this.creandoPractica = false; this.toast(e?.error?.message || 'No se pudo crear la orden de práctica.'); },
    });
  }

  async borrarPractica(inst: any): Promise<void> {
    if (!inst?.modo_practica) return;
    if (!await this.dialog.confirm('¿Borrar esta orden de práctica? No afecta a ningún cliente real.', { okLabel: 'Borrar' })) return;

    this.svc.delete(inst.id).subscribe({ next: () => { this.toast('Orden de práctica borrada.'); this.load(); }, error: () => this.toast('No se pudo borrar.') });
  }

  /** Abrir «Instalar el equipo» ya es empezar: la orden pasa a «en proceso» sola. */
  abrirProvisionar(inst: any): void {
    this.provisionando = inst;
    if (inst?.status === 'confirmed') {
      this.svc.start(inst.id).subscribe({ next: () => { inst.status = 'in_progress'; this.loadAllForSummary(); }, error: () => {} });
    }
  }

  terminoLaInstalacion(): void {
    this.provisionando = null;
    this.load();
  }

  start(id: number): void {
    this.actionLoading[id] = 'start';
    this.svc.start(id).subscribe({
      next: r => {
        this.svc.createLog(id, { action: 'start', description: 'Técnicos iniciaron la instalación' }).subscribe();
        this.toast(r.message);
        this.load();
        this.loadAllForSummary();
      },
      complete: () => { delete this.actionLoading[id]; }
    });
  }

  openComplete(id: number): void {
    const inst = this.installations.find(i => i.id === id);
    if (!inst) return;
    this.selected = inst;
    this.completeNotes = inst.technical_notes || '';
    this.showCompleteModal = true;
  }

  /**
   * El técnico cierra estando en la casa del cliente: se toma el GPS en ese momento para
   * ubicarlo en el mapa de la red. Sin permiso o sin señal se cierra igual.
   */
  async saveComplete(): Promise<void> {
    if (!this.selected?.id || this.completando) return;
    const instId = this.selected.id;
    const notes = this.completeNotes;
    this.completando = true;
    const ubicacion = await this.gps.posicionActual();
    this.svc.complete(instId, notes || undefined, ubicacion).subscribe({
      next: (r: any) => {
        this.completando = false;
        this.svc.createLog(instId, { action: 'complete', description: 'Instalación completada', notes }).subscribe();
        this.toast(r?.ubicacion?.ubicado ? `${r.message}. ${r.ubicacion.detalle}` : r.message);
        this.showCompleteModal = false;
        this.load();
        this.loadAllForSummary();
      },
      error: (e: any) => { this.completando = false; this.toast(e?.error?.message || 'No se pudo completar la instalación.'); },
    });
  }

  closeCompleteModal(): void {
    this.showCompleteModal = false;
    this.completeNotes = '';
    if (!this.showDetail) this.selected = null;
  }

  openCancel(id: number): void {
    const inst = this.installations.find(i => i.id === id);
    if (!inst) return;
    this.selected = inst;
    this.cancelReason = '';
    this.showCancelModal = true;
  }

  saveCancel(): void {
    if (!this.selected?.id) return;
    const instId = this.selected.id;
    const reason = this.cancelReason;
    this.svc.cancel(instId, reason || undefined).subscribe({
      next: r => {
        this.svc.createLog(instId, { action: 'cancel', description: 'Instalación cancelada', notes: reason }).subscribe();
        this.toast(r.message);
        this.showCancelModal = false;
        this.load();
        this.loadAllForSummary();
      },
    });
  }

  async closeCancelModal() {
    this.showCancelModal = false;
    this.cancelReason = '';
    if (!this.showDetail) this.selected = null;
  }

  /* cancel(id: number): void {
    if (await this.dialog.confirm('¿Cancelar esta instalación?')) {
      this.svc.cancel(id).subscribe({ next: r => { this.toast(r.message); this.load(); } });
    }
  } */

  openPayment(id: number): void {
    const inst = this.installations.find(i => i.id === id);
    if (!inst) return;
    this.selected = inst;
    const cost = inst.installation_cost ? inst.installation_cost.toString() : '';
    this.paymentForm = {
      payment_status: inst.payment_status || 'pending',
      payment_amount: inst.payment_amount ? inst.payment_amount.toString() : cost,
      payment_reference: inst.payment_reference || '',
      payment_method_id: inst.payment_method_id?.toString() || '',
    };
    this.showPaymentModal = true;
  }

  savePayment(): void {
    if (!this.selected?.id) return;
    this.actionLoading[this.selected.id] = 'payment';
    const instId = this.selected.id;
    const paymentData = this.paymentForm;
    this.svc.updatePayment(this.selected.id, {
      payment_status: this.paymentForm.payment_status,
      payment_amount: this.paymentForm.payment_amount ? parseFloat(this.paymentForm.payment_amount) : undefined,
      payment_reference: this.paymentForm.payment_reference || undefined,
      payment_method_id: this.paymentForm.payment_method_id ? parseInt(this.paymentForm.payment_method_id) : undefined,
    }).subscribe({
      next: r => {
        this.svc.createLog(instId, { 
          action: 'payment_' + paymentData.payment_status, 
          description: `Pago actualizado a ${paymentData.payment_status}`,
          notes: paymentData.payment_reference ? `Ref: ${paymentData.payment_reference}` : undefined 
        }).subscribe();
        this.toast(r.message);
        this.showPaymentModal = false;
        this.load();
        this.loadAllForSummary();
      },
      complete: () => { delete this.actionLoading[instId]; }
    });
  }

  // ── Comprobante de pago ─────────────────────────────────────────────────────
  // El técnico lo adjunta de una vez, parado en la casa del cliente: no tiene que esperar a que
  // la oficina registre el pago para dejar la prueba de la transferencia guardada en la orden.

  subiendoComprobante = false;

  subirComprobante(event: Event): void {
    const input = event.target as HTMLInputElement;
    const archivo = input.files?.[0];
    input.value = '';   // para poder elegir el mismo archivo dos veces seguidas si hizo falta
    if (!archivo || !this.selected?.id) return;

    this.subiendoComprobante = true;
    const instId = this.selected.id;
    this.svc.uploadPaymentProof(instId, archivo).subscribe({
      next: r => {
        this.subiendoComprobante = false;
        this.toast(r.message);
        if (this.selected?.id === instId) this.selected.payment_image_url = r?.data?.payment_image_url;
        this.load();
      },
      error: e => { this.subiendoComprobante = false; this.toast(e?.error?.message || 'No se pudo subir el comprobante.'); },
    });
  }

  async quitarComprobante(): Promise<void> {
    if (!this.selected?.id) return;
    if (!await this.dialog.confirm('¿Quitar el comprobante de esta instalación?', { okLabel: 'Quitar' })) return;

    const instId = this.selected.id;
    this.svc.removePaymentProof(instId).subscribe({
      next: () => {
        if (this.selected?.id === instId) this.selected.payment_image_url = undefined;
        this.load();
      },
      error: () => this.toast('No se pudo quitar el comprobante.'),
    });
  }

  openAssign(id: number): void {
    const inst = this.installations.find(i => i.id === id);
    if (!inst) return;
    this.selected = inst;
    this.assignForm = {
      technician_ids: inst.technician_ids || [],
      commission_amount: inst.commission_amount?.toString() || inst.installation_cost?.toString() || '',
    };
    this.showAssignModal = true;
  }

  saveAssign(): void {
    if (!this.selected?.id) return;
    this.actionLoading[this.selected.id] = 'assign';
    const instId = this.selected.id;
    const assignData = this.assignForm;
    this.svc.assignTechnicians(this.selected.id, {
      technician_ids: this.assignForm.technician_ids.length ? this.assignForm.technician_ids : undefined,
      commission_amount: this.assignForm.commission_amount ? parseFloat(this.assignForm.commission_amount) : undefined,
    }).subscribe({
      next: r => {
        this.svc.createLog(instId, { 
          action: 'assign', 
          description: 'Técnicos asignados',
          notes: assignData.commission_amount ? `Comisión: ${assignData.commission_amount}` : undefined 
        }).subscribe();
        this.toast(r.message);
        this.showAssignModal = false;
        this.load();
        this.loadAllForSummary();
      },
      complete: () => { delete this.actionLoading[instId]; }
    });
  }

  toast(msg: string): void {
    this.successMsg = msg;
    setTimeout(() => { this.successMsg = ''; }, 3500);
  }

  statusLabel(s: string): string {
    return this.STATUS_OPTIONS.find(o => o.value === s)?.label || s;
  }

  statusClass(s: string): string {
    const m: any = {
      pending: 'bg-yellow-100 text-yellow-700',
      confirmed: 'bg-blue-100 text-blue-700',
      in_progress: 'bg-purple-100 text-purple-700',
      completed: 'bg-green-100 text-green-700',
      cancelled: 'bg-red-100 text-red-700',
    };
    return m[s] || 'bg-gray-100 text-gray-700';
  }

  paymentClass(s: string): string {
    const m: any = {
      pending: 'bg-yellow-100 text-yellow-700',
      paid: 'bg-blue-100 text-blue-700',
      verified: 'bg-green-100 text-green-700',
      rejected: 'bg-red-100 text-red-700',
    };
    return m[s] || 'bg-gray-100 text-gray-700';
  }

  formatPrice(p: number | null | undefined): string {
    if (!p && p !== 0) return '-';
    return new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 }).format(p);
  }

  formatDate(d: string): string {
    if (!d) return '-';
    return new Date(d).toLocaleDateString('es-CO');
  }

  formatDateTime(d: string): string {
    if (!d) return '-';
    return new Date(d).toLocaleString('es-CO', { dateStyle: 'short', timeStyle: 'short' });
  }

  getTechniciansList(i: any): string {
    const names: string[] = [];
    if (i.technicians_list && i.technicians_list.length) {
      i.technicians_list.forEach((t: any) => names.push(`${t.first_name} ${t.last_name}`));
    }
    if (i.technician1) names.push(`${i.technician1.first_name} ${i.technician1.last_name}`);
    if (i.technician2) names.push(`${i.technician2.first_name} ${i.technician2.last_name}`);
    return names.length ? names.join(', ') : 'Sin asignar';
  }

  getPaymentMethodName(i: any): string {
    return i.paymentMethod?.name || '-';
  }

  /**
   * Las órdenes que cuentan. Las de práctica —las que el técnico usa para aprender el flujo con un equipo
   * simulado— se ven en la lista, pero no suman en pendientes, valores ni comisiones.
   */
  private get reales(): any[] {
    return (this.allInstallations.length > 0 ? this.allInstallations : this.installations).filter((i: any) => !i.modo_practica);
  }

  get totalPending(): number { 
    const all = this.reales;
    return all.filter(i => i.status === 'pending').length; 
  }
  get totalInProgress(): number { 
    const all = this.reales;
    return all.filter(i => i.status === 'in_progress').length; 
  }
get totalCompleted(): number { 
    const all = this.reales;
    return all.filter(i => i.status === 'completed' || i.payment_status === 'verified').length; 
  }

  get totalValue(): number { 
    const all = this.reales;
    return all.reduce((sum, i) => sum + this.getNumValue(i.installation_cost), 0);
  }
  get totalCommission(): number { 
    const all = this.reales;
    return all.reduce((sum, i) => sum + this.getNumValue(i.commission_amount), 0);
  }
  get completedValue(): number { 
    const all = this.reales;
    return all.filter(i => this.isCompletedStatus(i)).reduce((sum, i) => sum + this.getNumValue(i.installation_cost), 0);
  }
  get completedCommission(): number { 
    const all = this.reales;
    return all.filter(i => this.isCompletedStatus(i)).reduce((sum, i) => sum + this.getNumValue(i.commission_amount), 0);
  }

  get pendingValue(): number { 
    const all = this.reales;
    return all.filter(i => i.status === 'pending').reduce((sum, i) => sum + this.getNumValue(i.installation_cost), 0);
  }
  get inProgressValue(): number { 
    const all = this.reales;
    return all.filter(i => i.status === 'in_progress').reduce((sum, i) => sum + this.getNumValue(i.installation_cost), 0);
  }

  isCompletedStatus(i: any): boolean {
    return i.status === 'completed' || i.payment_status === 'verified';
  }

  getNumValue(val: number | string | null | undefined): number {
    if (!val && val !== 0) return 0;
    return typeof val === 'number' ? val : parseFloat(String(val)) || 0;
  }

  get techniciansSummary(): any[] {
    const all = this.reales;
    const summary: { [id: number]: { id: string; name: string; count: number; commission: number } } = {};
    all.filter(i => this.isCompletedStatus(i)).forEach(i => {
      const techIds: number[] = i.technician_ids || [];
      if (techIds.length > 0) {
        const commissionPerTech = this.getNumValue(i.commission_amount) / techIds.length;
        techIds.forEach((techId: number) => {
          const tech = this.technicians.find(t => t.id === techId);
          if (!summary[techId]) {
            summary[techId] = { 
              id: techId.toString(), 
              name: tech ? `${tech.first_name} ${tech.last_name}` : `Técnico ${techId}`, 
              count: 0, 
              commission: 0 
            };
          }
          summary[techId].count++;
          summary[techId].commission += commissionPerTech;
        });
      }
    });
    return Object.values(summary).sort((a, b) => b.commission - a.commission);
  }

  getTechnicianName(techId: number): string {
    const tech = this.technicians.find(t => t.id === techId);
    if (!tech) return 'Técnico ' + techId;
    return ((tech.first_name || '') + ' ' + (tech.last_name || '')).trim();
  }
}