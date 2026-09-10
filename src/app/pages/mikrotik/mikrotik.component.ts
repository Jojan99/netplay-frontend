import { DialogService } from '../../services/dialog.service';
import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MikrotikService } from '../../services/mikrotik.service';
import { buscarModelo, ModeloMikrotik, Puerto } from './modelos-mikrotik';

type EstadoPuerto = 'up' | 'down' | 'off' | 'na';

/** Un puerto con todo lo que la plantilla necesita, ya resuelto. */
interface PuertoVivo extends Puerto {
  etiqueta: string;
  estado: EstadoPuerto;
  nota: string;
  sfp: boolean;
  titulo: string;
}

const ESTADOS: Record<EstadoPuerto, string> = {
  up: 'con enlace', down: 'sin enlace', off: 'deshabilitado', na: 'no presente',
};

@Component({
  selector: 'app-mikrotik',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './mikrotik.component.html',
  styleUrl: './mikrotik.component.scss',
  host: { class: 'np-console' },
})
export class MikrotikComponent implements OnInit {
  private dialog = inject(DialogService);
  activeTab: 'info' | 'clients' | 'queues' | 'conflicts' | 'config' = 'info';

  tabs: { key: 'info' | 'clients' | 'queues' | 'conflicts' | 'config'; label: string }[] = [
    { key: 'info', label: 'Info Router' },
    { key: 'clients', label: 'Clientes ARP' },
    { key: 'queues', label: 'Ancho de Banda' },
    { key: 'conflicts', label: 'Conflictos de IP' },
    { key: 'config', label: 'Configuración' },
  ];

  // ── Multi-router ──────────────────────────────────────────────────────────
  routers: any[] = [];
  selectedRouterId: number | null = null;
  loadingRouters = false;

  // ── Router info ───────────────────────────────────────────────────────────
  routerInfo: any = null;
  loadingInfo = false;

  // ── Clients ───────────────────────────────────────────────────────────────
  clients: any[] = [];
  filteredClients: any[] = [];
  clientSearch = '';
  loadingClients = false;
  selectedIds = new Set<number>();
  suspending = false;
  suspendResult: string | null = null;
  suspendError = false;

  // ── Queues ────────────────────────────────────────────────────────────────
  queues: any[] = [];
  loadingQueues = false;
  showQueueForm = false;
  editingQueue: any = null;
  queueForm = { name: '', target: '', max_limit: '', comment: '', burst_limit: '', burst_threshold: '', burst_time: '' };
  savingQueue = false;
  queueMsg = '';
  queueError = false;

  // ── Config: lista de routers ──────────────────────────────────────────────
  showRouterForm = false;
  editingRouter: any = null;
  routerForm = { name: '', host: '', user: '', pass: '', port: 8728 };
  savingRouter = false;
  routerFormMsg = '';
  routerFormError = false;
  showRouterPass = false;
  deletingRouterId: number | null = null;

  // ── Conflictos de IP ──────────────────────────────────────────────────────
  // Dos clientes con la misma IP se pelean el ARP del router: a los dos les
  // anda el internet a ratos. Acá se listan para irlos resolviendo de a uno.
  conflicts: any[] = [];
  loadingConflicts = false;
  conflictsError = '';
  conflictsSummary: any = null;
  soloUrgentes = false;

  loadConflicts() {
    this.loadingConflicts = true;
    this.conflictsError = '';
    this.svc.getIpConflicts().subscribe({
      next: r => {
        this.loadingConflicts = false;
        if (r?.error !== 0) { this.conflictsError = r?.message || 'No se pudo leer la lista.'; return; }
        this.conflictsSummary = r.data?.resumen ?? null;
        this.conflicts = [...(r.data?.compartidas ?? []), ...(r.data?.repetidas ?? [])];
      },
      error: () => {
        this.loadingConflicts = false;
        this.conflictsError = 'No se pudo leer la lista de conflictos.';
      },
    });
  }

  get conflictsVisibles(): any[] {
    return this.soloUrgentes ? this.conflicts.filter(c => c.urgente) : this.conflicts;
  }

  /** Por qué está repetida, en palabras del negocio. */
  explicacion(c: any): string {
    if (c.solo_dato) {
      return 'En el router esta IP la tiene un solo cliente: el otro la hereda del registro compartido. ' +
             'Se arregla separando los registros, sin tocar el MikroTik.';
    }

    return c.tipo === 'ficha'
      ? 'Comparten el mismo registro de asignación: cambiarle la IP a uno se la cambia a todos.'
      : 'Registros distintos con la misma IP, y los dos la tienen en el router: hay que cambiarle la IP a uno.';
  }

  /** Qué dice el router de este cliente. */
  enRouter(cliente: any, grupo: any): string {
    if (cliente.ip_router === null || cliente.ip_router === undefined) return '—';
    if (!cliente.ip_router) return 'sin entrada';
    return cliente.ip_router === grupo.ip ? 'esta IP' : cliente.ip_router;
  }

  // ── Arreglo automático: separar los registros compartidos ─────────────────
  // La mayoría de los "conflictos" no son de red: son clientes pegados al
  // registro de otro. En el router uno solo tiene esa IP y el resto ni
  // aparece. Separar los registros los resuelve todos de una, sin tocar el
  // MikroTik y sin cortarle el servicio a nadie.
  separando = false;
  separarPreview: any = null;
  separarError = '';

  simularSeparar() {
    this.separando = true;
    this.separarError = '';
    this.separarPreview = null;

    this.svc.separarFichas(true).subscribe({
      next: r => {
        this.separando = false;
        if (r?.error !== 0) { this.separarError = r?.message || 'No se pudo leer el router.'; return; }
        const s = r.data?.separados ?? [];
        this.separarPreview = {
          separados: s,
          conIp: s.filter((x: any) => !!x.ahora),
          sinIp: s.filter((x: any) => !x.ahora),
          conflictos: r.data?.conflictos ?? [],
        };
      },
      error: () => {
        this.separando = false;
        this.separarError = 'No se pudo leer el router. No se cambió nada.';
      },
    });
  }

  async aplicarSeparar() {
    const p = this.separarPreview;
    if (!p) return;

    const ok = await this.dialog.confirm(
      `Se le va a dar registro propio a ${p.separados.length} cliente(s): ` +
      `${p.conIp.length} quedan con la IP que tienen en el router y ${p.sinIp.length} sin IP, ` +
      `porque hoy no tienen entrada en el MikroTik. No se toca el router ni se corta ningún servicio. ¿Confirmás?`,
      { okLabel: 'Separar registros' },
    );

    if (!ok) return;

    this.separando = true;
    this.separarError = '';

    this.svc.separarFichas(false).subscribe({
      next: r => {
        this.separando = false;
        if (r?.error !== 0) { this.separarError = r?.message || 'No se pudo aplicar.'; return; }
        this.separarPreview = null;
        this.loadConflicts();
      },
      error: () => {
        this.separando = false;
        this.separarPreview = null;
        this.separarError = 'Se cortó la respuesta del servidor. Puede que sí se haya aplicado: revisá la lista, que se está recargando.';
        this.loadConflicts();
      },
    });
  }

  cerrarSeparar() {
    this.separarPreview = null;
    this.separarError = '';
  }

  // ── Sincronizar con el router ─────────────────────────────────────────────
  // El MikroTik identifica al cliente por su documento, así que se puede leer
  // de ahí la IP con la que realmente navega y dejarla igual en el sistema.
  // Corre solo cada hora; el botón sirve para hacerlo ahora y para mirar antes
  // qué cambiaría.
  sincronizando = false;
  syncPreview: any = null;
  syncError = '';

  simularSync() {
    this.sincronizando = true;
    this.syncError = '';
    this.syncPreview = null;

    this.svc.syncIps(true).subscribe({
      next: r => {
        this.sincronizando = false;
        if (r?.error !== 0) { this.syncError = r?.message || 'No se pudo leer el router.'; return; }
        this.syncPreview = this.resumirSync(r.data);
      },
      error: () => {
        this.sincronizando = false;
        this.syncError = 'No se pudo leer el router. No se cambió nada.';
      },
    });
  }

  private resumirSync(d: any) {
    const cambios = d?.cambios ?? [];
    return {
      faltaban: cambios.filter((c: any) => c.tipo === 'faltaba'),
      cambios:  cambios.filter((c: any) => c.tipo === 'cambio'),
      sinCambio: d?.sin_cambio ?? 0,
      desconocidos: d?.desconocidos ?? [],
      ambiguos: d?.ambiguos ?? [],
      errores: d?.errores ?? [],
    };
  }

  async aplicarSync() {
    const p = this.syncPreview;
    if (!p) return;

    const total = p.faltaban.length + p.cambios.length;

    const ok = await this.dialog.confirm(
      `Se va a guardar la IP del router en ${total} cliente(s): ` +
      `${p.faltaban.length} que no tenían IP registrada y ${p.cambios.length} que la tenían distinta. ` +
      `No se toca el router, sólo la plataforma. ¿Confirmás?`,
      { okLabel: 'Sincronizar' },
    );

    if (!ok) return;

    this.sincronizando = true;
    this.syncError = '';

    this.svc.syncIps(false).subscribe({
      next: r => {
        this.sincronizando = false;
        if (r?.error !== 0) { this.syncError = r?.message || 'No se pudo sincronizar.'; return; }
        this.syncPreview = null;
        this.loadConflicts();
      },
      // Que se corte la respuesta no significa que no se haya aplicado: el
      // proceso sigue del lado del servidor. Antes esto decía "no se pudo" y
      // el cambio en realidad ya estaba hecho, así que se vuelve a leer el
      // estado real y se cuenta lo que se ve.
      error: () => {
        this.sincronizando = false;
        this.syncPreview = null;
        this.syncError = 'Se cortó la respuesta del servidor. Puede que la sincronización sí se haya aplicado: revisá la lista, que se está recargando.';
        this.loadConflicts();
      },
    });
  }

  cerrarSync() {
    this.syncPreview = null;
    this.syncError = '';
  }

  // ── Resolver un conflicto: darle otra IP a un cliente ──────────────────────
  fixCliente: any = null;
  fixGrupo: any = null;
  fixVlans: any[] = [];
  fixVlan: any = null;
  fixIps: any[] = [];
  fixIp = '';
  loadingFixIps = false;
  fixError = '';
  guardandoFix = false;

  abrirCambioDeIp(grupo: any, cliente: any) {
    this.fixGrupo = grupo;
    this.fixCliente = cliente;
    this.fixVlan = null;
    this.fixIps = [];
    this.fixIp = '';
    this.fixError = '';
    this.fixVlans = [];

    // Las VLAN se piden por el router del cliente, no por el que esté
    // seleccionado arriba: pueden no ser el mismo.
    this.svc.getLanSegments(cliente.router_id ?? this.selectedRouterId).subscribe({
      next: r => {
        this.fixVlans = r?.error === 0 && r.data ? Object.values(r.data) : [];
        if (!this.fixVlans.length) this.fixError = 'El router no devolvió VLAN.';
      },
      error: () => { this.fixError = 'No se pudo conectar con el router del cliente.'; },
    });
  }

  cerrarCambioDeIp() {
    this.fixCliente = null;
    this.fixGrupo = null;
  }

  onFixVlanChange(vlan: any) {
    this.fixVlan = vlan;
    this.fixIp = '';
    this.fixIps = [];
    if (vlan) this.cargarFixIps();
  }

  cargarFixIps(intento = 1) {
    if (!this.fixVlan) return;
    this.loadingFixIps = true;
    this.fixError = '';

    const routerId = this.fixCliente?.router_id ?? this.selectedRouterId;

    this.svc.getIpAvalibles(this.fixVlan.names, routerId, this.fixVlan.network).subscribe({
      next: r => {
        if (r?.error !== 0) {
          if (intento < 3) { setTimeout(() => this.cargarFixIps(intento + 1), 900 * intento); return; }
          this.loadingFixIps = false;
          this.fixIps = [];
          this.fixError = r?.message || 'El router no respondió.';
          return;
        }
        this.loadingFixIps = false;
        this.fixIps = (r.data?.ips ?? []).map((e: any) => e.ip);
        if (!this.fixIps.length) this.fixError = 'No quedan IPs libres en esta VLAN.';
      },
      error: () => {
        if (intento < 3) { setTimeout(() => this.cargarFixIps(intento + 1), 900 * intento); return; }
        this.loadingFixIps = false;
        this.fixIps = [];
        this.fixError = 'No se pudo conectar con el router.';
      },
    });
  }

  async confirmarCambioDeIp() {
    if (!this.fixCliente || !this.fixIp || !this.fixVlan) return;

    const ok = await this.dialog.confirm(
      `Se le va a asignar la IP ${this.fixIp} a ${this.fixCliente.nombre}. ` +
      `El cambio se aplica en el router y le corta la conexión un momento. ¿Confirmás?`,
      { okLabel: 'Cambiar la IP' },
    );

    if (!ok) return;

    this.guardandoFix = true;

    this.svc.migrarIp({
      service_id: this.fixCliente.user_id,
      new_ip: this.fixIp,
      vlan: this.fixVlan.names,
      router_id: this.fixCliente.router_id ?? this.selectedRouterId,
    }).subscribe({
      next: r => {
        this.guardandoFix = false;
        if (r?.error !== 0) { this.fixError = r?.message || 'No se pudo cambiar la IP.'; return; }
        this.cerrarCambioDeIp();
        this.loadConflicts();
      },
      error: () => { this.guardandoFix = false; this.fixError = 'No se pudo cambiar la IP.'; },
    });
  }

  constructor(private svc: MikrotikService) {}

  ngOnInit() {
    this.loadRouters();
  }

  // ── Routers list ──────────────────────────────────────────────────────────

  loadRouters() {
    this.loadingRouters = true;
    this.svc.getRouters().subscribe({
      next: r => {
        this.routers = r.data ?? [];
        this.loadingRouters = false;
        if (!this.selectedRouterId && this.routers.length) {
          this.selectedRouterId = this.routers[0].id;
        }
        this.loadInfo();
      },
      error: () => { this.loadingRouters = false; this.loadInfo(); },
    });
  }

  get selectedRouterLabel(): string {
    const r = this.routers.find(x => x.id === this.selectedRouterId);
    return r ? (r.name || r.host) : 'Router';
  }

  onRouterChange() {
    if (this.activeTab === 'info') this.loadInfo();
    else if (this.activeTab === 'clients') this.loadClients();
    else if (this.activeTab === 'queues') this.loadQueues();
  }

  // ── Tabs ──────────────────────────────────────────────────────────────────

  setTab(tab: 'info' | 'clients' | 'queues' | 'conflicts' | 'config') {
    this.activeTab = tab;
    if (tab === 'info')      { this.loadInfo(); }
    if (tab === 'clients')   { if (!this.clients.length) this.loadClients(); }
    if (tab === 'queues')    { if (!this.queues.length) this.loadQueues(); }
    if (tab === 'conflicts') { if (!this.conflicts.length) this.loadConflicts(); }
    if (tab === 'config')    { this.loadRouters(); }
  }

  refresh() {
    if (this.activeTab === 'info')    this.loadInfo();
    else if (this.activeTab === 'clients') this.loadClients();
    else if (this.activeTab === 'queues')  this.loadQueues();
    else if (this.activeTab === 'conflicts') this.loadConflicts();
  }

  // ── Ficha del equipo ──────────────────────────────────────────────────────
  // La foto del modelo se pide aparte para no demorar la pantalla, y el panel
  // de puertos se dibuja con el estado que reporta el router: así se ve de un
  // vistazo cuáles están conectados, cosa que una foto no puede mostrar.
  fotoRouter: string | null = null;
  modelo: ModeloMikrotik | null = null;

  private cargarFicha() {
    const board = this.routerInfo?.resource?.board_name ?? '';
    this.modelo = buscarModelo(board);
    this.fotoRouter = null;
    this.armarPuertos();

    if (!board) return;

    this.svc.getRouterPhoto(board).subscribe({
      next: r => { this.fotoRouter = r?.data?.url ?? null; },
      error: () => { this.fotoRouter = null; },
    });
  }

  /**
   * Los puertos ya resueltos, con su estado y su nota.
   *
   * Se calcula una vez por lectura del router y no en un getter: un getter
   * devuelve un array nuevo en cada ciclo de detección de cambios, Angular lo
   * ve como una lista distinta y recrea los botones sin parar — con eso el
   * clic nunca llegaba a completarse sobre el mismo elemento.
   */
  puertos: Puerto[] = [];
  bloquesDePuertos: { titulo: string; puertos: PuertoVivo[] }[] = [];
  puertosArriba = 0;
  notasDePuertos: { etiqueta: string; nota: string; apagado: boolean }[] = [];

  private armarPuertos() {
    const delModelo = this.modelo?.puertos;

    // Modelo desconocido: se arma con las interfaces físicas que haya.
    this.puertos = delModelo ?? (this.routerInfo?.interfaces ?? [])
      .filter((i: any) => i.type === 'ether')
      .map((i: any, n: number) => ({ nombre: i.name, tipo: 'eth' as const, label: String(n + 1) }));

    const vivos: PuertoVivo[] = this.puertos.map(p => {
      const estado = this.estadoPuerto(p);
      const nota = this.comentarioPuerto(p);

      return {
        ...p,
        etiqueta: p.label || p.nombre,
        estado,
        nota,
        sfp: this.esSfp(p),
        titulo: `${p.nombre} · ${ESTADOS[estado]}${nota ? ' · ' + nota : ''} — clic para ver el detalle`,
      };
    });

    this.puertosArriba = vivos.filter(p => p.estado === 'up').length;

    this.notasDePuertos = vivos
      .filter(p => !!p.nota)
      .map(p => ({ etiqueta: p.etiqueta, nota: p.nota, apagado: p.estado !== 'up' }));

    const cobre = vivos.filter(p => !p.sfp);
    const optico = vivos.filter(p => p.sfp);

    this.bloquesDePuertos = [];
    if (cobre.length) this.bloquesDePuertos.push({ titulo: 'Ethernet', puertos: cobre });
    if (optico.length) this.bloquesDePuertos.push({ titulo: 'SFP', puertos: optico });
  }

  /** Para que *ngFor no recree los botones en cada ciclo. */
  porNombre = (_: number, p: { nombre: string }) => p.nombre;
  porTitulo = (_: number, b: { titulo: string }) => b.titulo;
  porEtiqueta = (_: number, n: { etiqueta: string }) => n.etiqueta;

  /** Estado real de un puerto, para pintarlo. */
  estadoPuerto(p: Puerto): EstadoPuerto {
    const i = (this.routerInfo?.interfaces ?? []).find((x: any) => x.name === p.nombre);
    if (!i) return 'na';
    if (String(i.disabled) === 'true') return 'off';
    return String(i.running) === 'true' ? 'up' : 'down';
  }

  /** Lo que el operador anotó en el puerto: "WAN", "TRONCAL 1 UTP". */
  comentarioPuerto(p: Puerto): string {
    const i = (this.routerInfo?.interfaces ?? []).find((x: any) => x.name === p.nombre);
    return (i?.comment ?? '').trim();
  }

  /** Los ópticos se dibujan distinto: más anchos y sin la muesca del RJ45. */
  esSfp(p: Puerto): boolean {
    return p.tipo !== 'eth' && p.tipo !== 'poe';
  }

  /** Bytes a un texto corto. */
  tamano(bytes: any): string {
    const b = Number(bytes ?? 0);
    if (!b) return '—';
    const u = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.min(Math.floor(Math.log(b) / Math.log(1024)), u.length - 1);
    return `${(b / Math.pow(1024, i)).toFixed(i ? 1 : 0)} ${u[i]}`;
  }

  // ── Detalle de un puerto ──────────────────────────────────────────────────
  // Junta en una pantalla lo que en Winbox está repartido en varias: cómo
  // negoció el enlace, el módulo óptico, el tráfico de este momento, las VLAN
  // que salen por ahí y los clientes que cuelgan.
  puertoAbierto: PuertoVivo | null = null;
  detalle: any = null;
  cargandoDetalle = false;
  detalleError = '';
  private refrescoDetalle: any = null;

  abrirPuerto(p: PuertoVivo) {
    if (p.estado === 'na') return;

    this.puertoAbierto = p;
    this.detalle = null;
    this.detalleError = '';
    this.pedirDetalle();

    // El tráfico en vivo pierde sentido si queda congelado.
    clearInterval(this.refrescoDetalle);
    this.refrescoDetalle = setInterval(() => this.pedirDetalle(true), 5000);
  }

  private pedirDetalle(silencioso = false) {
    const p = this.puertoAbierto;
    if (!p) return;

    if (!silencioso) this.cargandoDetalle = true;

    this.svc.getPortDetail(p.nombre, this.selectedRouterId).subscribe({
      next: r => {
        this.cargandoDetalle = false;
        if (r?.error !== 0) { this.detalleError = r?.message || 'No se pudo consultar el puerto.'; return; }
        this.detalle = r.data;
        this.detalleError = '';
      },
      error: () => {
        this.cargandoDetalle = false;
        if (!silencioso) this.detalleError = 'No se pudo consultar el puerto.';
      },
    });
  }

  cerrarPuerto() {
    clearInterval(this.refrescoDetalle);
    this.refrescoDetalle = null;
    this.puertoAbierto = null;
    this.detalle = null;
  }

  etiquetaEstado(e: EstadoPuerto): string {
    return { up: 'Con enlace', down: 'Sin enlace', off: 'Deshabilitado', na: '—' }[e];
  }

  /** Bits por segundo a un texto corto. */
  velocidad(bps: any): string {
    const b = Number(bps ?? 0);
    if (!b) return '0 bps';
    const u = ['bps', 'Kbps', 'Mbps', 'Gbps'];
    const i = Math.min(Math.floor(Math.log(b) / Math.log(1000)), u.length - 1);
    return `${(b / Math.pow(1000, i)).toFixed(i >= 2 ? 1 : 0)} ${u[i]}`;
  }

  /** Cuánto del enlace se está usando, para la barra. */
  usoDelEnlace(bps: any): number {
    const capacidad = this.capacidadBps();
    if (!capacidad) return 0;
    return Math.min(100, Math.round((Number(bps ?? 0) / capacidad) * 100));
  }

  private capacidadBps(): number {
    const rate = String(this.detalle?.enlace?.velocidad ?? '');
    const m = rate.match(/^([\d.]+)\s*([GMK])/i);
    if (!m) return 0;
    const mult: any = { G: 1e9, M: 1e6, K: 1e3 };
    return parseFloat(m[1]) * (mult[m[2].toUpperCase()] ?? 1);
  }

  // ── Info ──────────────────────────────────────────────────────────────────

  loadInfo() {
    this.loadingInfo = true;
    this.routerInfo = null;
    this.svc.getRouterInfo(this.selectedRouterId).subscribe({
      next: r => { this.routerInfo = r.data; this.loadingInfo = false; this.cargarFicha(); },
      error: () => { this.loadingInfo = false; },
    });
  }

  // ── Clients ───────────────────────────────────────────────────────────────

  loadClients() {
    this.loadingClients = true;
    this.selectedIds.clear();
    this.suspendResult = null;
    this.svc.getConnectedClients(this.selectedRouterId).subscribe({
      next: r => {
        this.clients = r.data ?? [];
        this.filterClients();
        this.loadingClients = false;
      },
      error: () => { this.loadingClients = false; },
    });
  }

  filterClients() {
    const q = this.clientSearch.toLowerCase();
    this.filteredClients = !q
      ? [...this.clients]
      : this.clients.filter(c =>
          (c.ip ?? '').includes(q) ||
          (c.comment ?? '').toLowerCase().includes(q) ||
          (c.user_name ?? '').toLowerCase().includes(q) ||
          (c.mac ?? '').toLowerCase().includes(q)
        );
  }

  toggleSelect(client: any) {
    if (!client.user_id) return;
    this.selectedIds.has(client.user_id)
      ? this.selectedIds.delete(client.user_id)
      : this.selectedIds.add(client.user_id);
  }

  allSelected(): boolean {
    const withUser = this.filteredClients.filter(c => c.user_id);
    return withUser.length > 0 && withUser.every(c => this.selectedIds.has(c.user_id));
  }

  toggleSelectAll() {
    const withUser = this.filteredClients.filter(c => c.user_id);
    if (this.allSelected()) {
      withUser.forEach(c => this.selectedIds.delete(c.user_id));
    } else {
      withUser.forEach(c => this.selectedIds.add(c.user_id));
    }
  }

  suspendSelected() {
    if (!this.selectedIds.size) return;
    this.suspending = true;
    this.suspendResult = null;
    this.svc.suspendBulk(Array.from(this.selectedIds), this.selectedRouterId).subscribe({
      next: r => {
        this.suspendResult = r.message;
        this.suspendError = false;
        this.suspending = false;
        this.loadClients();
      },
      error: e => {
        this.suspendResult = 'Error: ' + (e.error?.message ?? 'desconocido');
        this.suspendError = true;
        this.suspending = false;
      },
    });
  }

  // ── Queues ────────────────────────────────────────────────────────────────

  loadQueues() {
    this.loadingQueues = true;
    this.svc.getQueues(this.selectedRouterId).subscribe({
      next: r => { this.queues = r.data ?? []; this.loadingQueues = false; },
      error: () => { this.loadingQueues = false; },
    });
  }

  openCreateQueue() {
    this.editingQueue = null;
    this.queueForm = { name: '', target: '', max_limit: '', comment: '', burst_limit: '', burst_threshold: '', burst_time: '' };
    this.queueMsg = '';
    this.showQueueForm = true;
  }

  openEditQueue(q: any) {
    this.editingQueue = q;
    this.queueForm = {
      name: q.name ?? '',
      target: q.target ?? '',
      max_limit: q['max-limit'] ?? '',
      comment: q.comment ?? '',
      burst_limit: q['burst-limit'] ?? '',
      burst_threshold: q['burst-threshold'] ?? '',
      burst_time: q['burst-time'] ?? '',
    };
    this.queueMsg = '';
    this.showQueueForm = true;
  }

  saveQueue() {
    if (!this.queueForm.name || !this.queueForm.target || !this.queueForm.max_limit) return;
    this.savingQueue = true;
    const obs = this.editingQueue
      ? this.svc.updateQueue(this.editingQueue['.id'], this.queueForm, this.selectedRouterId)
      : this.svc.createQueue(this.queueForm, this.selectedRouterId);

    obs.subscribe({
      next: r => {
        this.savingQueue = false;
        if (!r.error && r.status === 0) {
          this.showQueueForm = false;
          this.loadQueues();
        } else {
          this.queueMsg = r.message;
          this.queueError = true;
        }
      },
      error: e => {
        this.savingQueue = false;
        this.queueMsg = e.error?.message ?? 'Error al guardar';
        this.queueError = true;
      },
    });
  }

  async deleteQueue(id: string) {
    if (!await this.dialog.confirm('¿Eliminar esta cola de ancho de banda?')) return;
    this.svc.deleteQueue(id, this.selectedRouterId).subscribe({ next: () => this.loadQueues() });
  }

  // ── Config: CRUD de routers ───────────────────────────────────────────────

  openAddRouter() {
    this.editingRouter = null;
    this.routerForm = { name: '', host: '', user: '', pass: '', port: 8728 };
    this.routerFormMsg = '';
    this.showRouterForm = true;
  }

  openEditRouter(r: any) {
    this.editingRouter = r;
    this.routerForm = { name: r.name ?? '', host: r.host ?? '', user: r.user ?? '', pass: '', port: r.port ?? 8728 };
    this.routerFormMsg = '';
    this.showRouterForm = true;
  }

  saveRouter() {
    if (!this.routerForm.host || !this.routerForm.user) return;
    if (!this.editingRouter && !this.routerForm.pass) return;
    this.savingRouter = true;
    this.routerFormMsg = '';

    const obs = this.editingRouter
      ? this.svc.editRouter(this.editingRouter.id, this.routerForm)
      : this.svc.addRouter(this.routerForm);

    obs.subscribe({
      next: r => {
        this.savingRouter = false;
        if (r.status === 0) {
          this.showRouterForm = false;
          this.loadRouters();
        } else {
          this.routerFormMsg = r.message;
          this.routerFormError = true;
        }
      },
      error: e => {
        this.savingRouter = false;
        this.routerFormMsg = e.error?.message ?? 'Error al guardar';
        this.routerFormError = true;
      },
    });
  }

  async confirmDeleteRouter(id: number) {
    if (!await this.dialog.confirm('¿Eliminar este Mikrotik? Esta acción no se puede deshacer.')) return;
    this.deletingRouterId = id;
    this.svc.removeRouter(id).subscribe({
      next: () => { this.deletingRouterId = null; this.loadRouters(); },
      error: () => { this.deletingRouterId = null; },
    });
  }

  // ── Helpers ───────────────────────────────────────────────────────────────

  formatBytes(bytes: number): string {
    if (!bytes || bytes === 0) return '0 B';
    const units = ['B', 'KB', 'MB', 'GB', 'TB'];
    let i = 0;
    while (bytes >= 1024 && i < units.length - 1) { bytes /= 1024; i++; }
    return `${bytes.toFixed(1)} ${units[i]}`;
  }

  cpuPercent(): number {
    return parseInt(this.routerInfo?.resource?.cpu_load ?? '0', 10);
  }

  memPercent(): number {
    const total = this.routerInfo?.resource?.total_memory ?? 0;
    const free  = this.routerInfo?.resource?.free_memory ?? 0;
    if (!total) return 0;
    return Math.round(((total - free) / total) * 100);
  }
}
