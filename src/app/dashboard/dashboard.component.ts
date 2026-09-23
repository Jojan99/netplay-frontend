import { Component, OnInit, OnDestroy, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Router, RouterLink } from '@angular/router';
import { Chart, registerables, TooltipItem } from 'chart.js';
import ChartDataLabels from 'chartjs-plugin-datalabels';
import { Subscription } from 'rxjs';
import { UserService } from '../services/user.service';
import { AuthService } from '../services/auth.service';
import { FinanceService } from '../services/finance.service';
import { AlertasService } from '../services/alertas.service';
import { CobranzaService } from '../services/cobranza.service';
import { ToastService } from '../services/toast.service';
import { ThemeService } from '../common/services/theme/theme.service';
import { OnboardingGuideComponent } from '../components/onboarding-guide/onboarding-guide.component';
import { NpSelectComponent, PresentacionSelect } from '../common/np-select/np-select.component';
import { ReferidosCardComponent } from '../components/referidos-card/referidos-card.component';
import { environment } from '../../environments/environment';

Chart.register(...registerables, ChartDataLabels);

/** Un puerto PON con su señal, como lo guarda Salud de la red. */
interface Puerto {
  olt_id: number; olt: string; fsp: string; onts: number; offline: number; al_borde: number;
  rx_mediana: number | null; rx_min: number | null; cambio: number | null;
}

interface Indicador {
  clave: string; etiqueta: string; valor: string; pie: string;
  ruta: string; tono: 'accent' | 'ok' | 'warn' | 'danger' | 'info' | 'neutro';
}

interface Evento { origen: string; nivel: string; titulo: string; detalle: string; cuando: string; ruta: string; }

/** Un panel del tablero: lo que se puede poner, quitar y mover. */
interface Panel {
  id: string;
  titulo: string;
  seccion: 'La plata' | 'La red' | 'La gente';
  /** Cuántas de las 12 columnas ocupa. */
  ancho: number;
  /** Qué módulo hay que tener para verlo; vacío, lo ve cualquiera. */
  modulo?: string;
  /** Sólo para quien maneja plata (administrador o contador). */
  plata?: boolean;
  /** Una línea que explica para qué sirve, en el catálogo. */
  para: string;
}

/**
 * El tablero de inicio, armado por cada usuario.
 *
 * Los paneles se ponen, se quitan y se mueven, y lo que queda se guarda en el
 * servidor: el mismo tablero aparece en cualquier computador donde entre esa
 * persona. Cada panel pide sus propios datos y sólo si está puesto, así que un
 * tablero corto también es un tablero liviano.
 */
@Component({
  selector: 'app-dashboard',
  templateUrl: './dashboard.component.html',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink, OnboardingGuideComponent, NpSelectComponent, ReferidosCardComponent],
  styleUrls: ['./dashboard.component.scss'],
  host: { class: 'np-console' },
})
export class DashboardComponent implements OnInit, OnDestroy {
  private userService = inject(UserService);
  private authService = inject(AuthService);
  private financeService = inject(FinanceService);
  private alertas = inject(AlertasService);
  private cobranzaApi = inject(CobranzaService);
  private toast = inject(ToastService);
  private themeService = inject(ThemeService);
  private http = inject(HttpClient);
  private router = inject(Router);

  role = '';
  companyName = '';
  username = '';
  today = '';
  private modulos: string[] = [];

  get nombre(): string { return this.authService.getPrimerNombre(); }

  selectedYear = new Date().getFullYear();
  availableYears: number[] = [];
  readonly presAnios: PresentacionSelect<number> = {
    valor: y => y,
    etiqueta: y => String(y),
    insignia: y => (y === new Date().getFullYear() ? { texto: 'Año actual', tono: 'info' } : null),
  };

  // ── El catálogo de paneles ─────────────────────────────────────────────

  readonly CATALOGO: Panel[] = [
    { id: 'resolver',  titulo: 'Lo que hay que resolver', seccion: 'La gente', ancho: 5, modulo: 'usuario', para: 'Lo urgente de hoy, ordenado por lo que le duele al cliente.' },
    { id: 'vivo',      titulo: 'Lo que está pasando',     seccion: 'La gente', ancho: 3, modulo: 'usuario', para: 'Los últimos movimientos de la empresa, minuto a minuto.' },
    { id: 'plata',     titulo: 'Ingresos y egresos',      seccion: 'La plata', ancho: 4, plata: true, modulo: 'finanzas', para: 'El año mes a mes, con el resumen de caja.' },
    { id: 'mora',      titulo: 'La mora por antigüedad',  seccion: 'La plata', ancho: 4, plata: true, modulo: 'finanzas', para: 'Cuánto se debe de 30, 60, 90 días y de más atrás.' },
    { id: 'metodos',   titulo: 'Por dónde entra la plata', seccion: 'La plata', ancho: 3, plata: true, modulo: 'finanzas', para: 'Qué método de pago usa la gente este mes.' },
    { id: 'deudores',  titulo: 'Los que más deben',       seccion: 'La plata', ancho: 5, plata: true, modulo: 'finanzas', para: 'Los cinco con más deuda vieja, con su mora.' },
    { id: 'cobranza',  titulo: 'IA Cobranza',             seccion: 'La plata', ancho: 3, modulo: 'finanzas', para: 'Qué está haciendo el bot y qué espera tu autorización.' },
    { id: 'salud',     titulo: 'Salud de la red',         seccion: 'La red',   ancho: 4, modulo: 'olt-admin', para: 'Cada puerto PON con su señal, coloreado.' },
    { id: 'borde',     titulo: 'Clientes al borde',       seccion: 'La red',   ancho: 3, modulo: 'olt-admin', para: 'Los que reciben menos luz de la que deberían.' },
    { id: 'equipos',   titulo: 'Los equipos',             seccion: 'La red',   ancho: 3, modulo: 'olt-admin', para: 'Cuántas ONT hay en línea, apagadas y sin medir.' },
    { id: 'tickets',   titulo: 'Técnicos y tickets',      seccion: 'La gente', ancho: 4, modulo: 'view-ticket', para: 'Quién está en calle y cómo van los tickets.' },
    { id: 'clientes',  titulo: 'Altas y bajas',           seccion: 'La gente', ancho: 4, modulo: 'usuario', para: 'Cuántos clientes entraron y se fueron cada mes.' },
    { id: 'novedades', titulo: 'Novedades de Netvula',    seccion: 'La gente', ancho: 3, para: 'Lo que se fue agregando a la plataforma.' },
  ];

  /** Los paneles puestos, en orden. Se arma una sola vez, no en un getter. */
  paneles: Panel[] = [];
  /** El catálogo que este usuario puede usar, agrupado para el cajón. */
  catalogo: { seccion: string; paneles: Panel[] }[] = [];
  puestos: Record<string, boolean> = {};

  armando = false;
  guardando = false;
  private arrastrado = -1;

  // ── Los datos ──────────────────────────────────────────────────────────
  indicadores: Indicador[] = [];

  valorCaja = 0; valorIngreso = 0; valorPendiente = 0; valorEgresos = 0; countPaid = 0;
  active = 0; inactive = 0; totalUsers = 0;
  porMes: { mes: string; altas: number; bajas: number; alto: number; altoBajas: number }[] = [];

  ticketPending = 0; ticketInProgress = 0; ticketClosedToday = 0;
  topTechnicians: { names: string; lastname: string; count: number }[] = [];

  pmSummary: { name: string; total: number; count: number; texto: string }[] = [];
  pmPeriod = new Date().toISOString().slice(0, 7);

  puertos: Puerto[] = [];
  alBorde: any[] = [];
  ontsTotal = 0; ontsApagadas = 0; puertosSinMedir = 0;
  avisosCriticos = 0; avisosTotal = 0; clientesAfectados = 0; equiposAMedias = 0;

  mora: any = null;
  cobranza: any = null;
  deudores: any[] = [];
  eventos: Evento[] = [];
  novedades: any[] = [];
  acciones: { texto: string; detalle: string; tono: string; ruta: string; cuantos: number }[] = [];

  cargandoTickets = false;
  private pedidos = new Set<string>();
  private charts: Record<string, Chart> = {};
  private themeSub?: Subscription;

  // ── Permisos ───────────────────────────────────────────────────────────

  get isAdmin(): boolean { return this.role === 'ADMIN'; }
  get isContador(): boolean { return this.role === 'CONTADOR'; }
  get isTecnico(): boolean { return this.role === 'TECNICO'; }

  puede(modulo: string): boolean { return this.modulos.includes(modulo); }
  get veLaPlata(): boolean { return (this.isAdmin || this.isContador) && this.puede('finanzas'); }
  get veLaRed(): boolean { return this.puede('olt-admin'); }
  get veTickets(): boolean { return this.puede('view-ticket'); }

  /** Un panel se puede poner si el perfil lo alcanza. */
  private alcanza(p: Panel): boolean {
    if (p.plata && !this.veLaPlata) return false;
    return !p.modulo || this.puede(p.modulo);
  }

  ngOnInit(): void {
    const user = this.authService.getUser();
    if (user) {
      this.companyName = user.company_name || '';
      this.username = user.username || '';
    }
    this.role = this.authService.getProfileName();
    this.modulos = this.authService.getAllowedModules() ?? [];

    const now = new Date();
    this.today = now.toLocaleDateString('es-CO', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
    this.selectedYear = now.getFullYear();
    this.availableYears = Array.from({ length: 5 }, (_, i) => now.getFullYear() - i);

    this.armarCatalogo();
    this.cargarTablero();

    this.themeSub = this.themeService.$theme.subscribe(() => setTimeout(() => this.redibujar(), 30));
  }

  ngOnDestroy(): void {
    this.themeSub?.unsubscribe();
    Object.values(this.charts).forEach(c => c.destroy());
  }

  // ── Armar el tablero ───────────────────────────────────────────────────

  private armarCatalogo(): void {
    const mios = this.CATALOGO.filter(p => this.alcanza(p));
    const secciones = ['La gente', 'La plata', 'La red'];
    this.catalogo = secciones
      .map(s => ({ seccion: s, paneles: mios.filter(p => p.seccion === s) }))
      .filter(g => g.paneles.length);
  }

  private cargarTablero(): void {
    this.http.get<any>(`${environment.rootUrl}api/company/tablero`, { headers: this.cabeceras() }).subscribe({
      next: r => this.ponerPaneles(r?.data?.paneles ?? []),
      // Sin respuesta (sin permiso, sin migración): el de fábrica igual sirve.
      error: () => this.ponerPaneles([]),
    });
  }

  private ponerPaneles(ids: string[]): void {
    const deFabrica = this.isTecnico
      ? ['tickets', 'novedades']
      : ['resolver', 'plata', 'salud', 'vivo', 'deudores', 'tickets', 'novedades'];
    const elegidos = (ids?.length ? ids : deFabrica)
      .map(id => this.CATALOGO.find(p => p.id === id))
      .filter((p): p is Panel => !!p && this.alcanza(p));

    this.paneles = elegidos;
    this.puestos = {};
    for (const p of elegidos) this.puestos[p.id] = true;

    this.pedirDatos();
  }

  alternar(p: Panel): void {
    if (this.puestos[p.id]) {
      this.paneles = this.paneles.filter(x => x.id !== p.id);
      this.puestos[p.id] = false;
    } else {
      this.paneles = [...this.paneles, p];
      this.puestos[p.id] = true;
      this.pedirDatos();
    }
  }

  empezarAArmar(): void { this.armando = true; }

  guardar(): void {
    this.guardando = true;
    this.http.put<any>(`${environment.rootUrl}api/company/tablero`,
      { paneles: this.paneles.map(p => p.id) }, { headers: this.cabeceras() }).subscribe({
      next: r => {
        this.guardando = false;
        this.armando = false;
        this.toast.success(r?.message ?? 'Tu tablero quedó guardado.');
        setTimeout(() => this.redibujar(), 60);
      },
      error: e => {
        this.guardando = false;
        this.toast.error(e?.error?.message ?? 'No se pudo guardar el tablero.');
      },
    });
  }

  deFabrica(): void {
    this.http.delete<any>(`${environment.rootUrl}api/company/tablero`, { headers: this.cabeceras() }).subscribe({
      next: r => { this.ponerPaneles(r?.data?.paneles ?? []); this.toast.success(r?.message ?? 'Listo.'); setTimeout(() => this.redibujar(), 60); },
      error: () => this.ponerPaneles([]),
    });
  }

  // ── Mover paneles ──────────────────────────────────────────────────────

  alTomar(i: number): void { this.arrastrado = i; }

  alPasarPor(e: DragEvent, i: number): void {
    e.preventDefault();
    if (this.arrastrado < 0 || this.arrastrado === i) return;

    const lista = [...this.paneles];
    const [movido] = lista.splice(this.arrastrado, 1);
    lista.splice(i, 0, movido);
    this.paneles = lista;
    this.arrastrado = i;
  }

  alSoltar(): void { this.arrastrado = -1; }

  /** Con el teclado también: las flechas mueven el panel elegido. */
  mover(i: number, hacia: number): void {
    const j = i + hacia;
    if (j < 0 || j >= this.paneles.length) return;
    const lista = [...this.paneles];
    [lista[i], lista[j]] = [lista[j], lista[i]];
    this.paneles = lista;
  }

  porPanel(_: number, p: Panel): string { return p.id; }
  porClave(_: number, i: Indicador): string { return i.clave; }
  porPuerto(_: number, p: Puerto): string { return `${p.olt_id}-${p.fsp}`; }
  porFila(_: number, f: any): any { return f.user_id ?? f.id ?? f; }

  hay(id: string): boolean { return !!this.puestos[id]; }

  // ── Los datos: sólo lo que está puesto ─────────────────────────────────

  private cabeceras(): HttpHeaders {
    return new HttpHeaders({ Authorization: `Bearer ${localStorage.getItem('token') ?? ''}` });
  }

  /** Pide una sola vez lo que cada panel necesita. */
  private pedirDatos(): void {
    this.pedir('clientes-conteo', () => this.cargarClientes());
    if (this.hay('vivo') || this.hay('resolver')) this.pedir('eventos', () => this.cargarEventos());
    if (this.hay('novedades')) this.pedir('novedades', () => this.cargarNovedades());
    if (this.hay('plata')) this.pedir('plata', () => { this.cargarPlata(); setTimeout(() => this.graficoDePlata(), 60); });
    if (this.hay('mora')) this.pedir('mora', () => this.cargarMora());
    if (this.hay('metodos')) this.pedir('metodos', () => this.cargarMetodos());
    if (this.hay('deudores')) this.pedir('deudores', () => this.cargarDeudores());
    if (this.hay('cobranza')) this.pedir('cobranza', () => this.cargarCobranza());
    if (this.hay('salud') || this.hay('borde') || this.hay('equipos')) this.pedir('salud', () => this.cargarSalud());
    if (this.hay('tickets') || this.hay('resolver')) this.pedir('tickets', () => this.cargarTickets());
    if (this.hay('clientes')) this.pedir('clientes-meses', () => this.cargarClientesPorMes());
    if (this.veLaRed) this.pedir('avisos', () => this.cargarAvisos());
  }

  private pedir(clave: string, fn: () => void): void {
    if (this.pedidos.has(clave)) return;
    this.pedidos.add(clave);
    fn();
  }

  private cargarPlata(): void {
    this.userService.getTrazaFacture().subscribe({
      next: r => {
        const d = r.data ?? {};
        this.countPaid = parseInt(d.count_paid) || 0;
        this.valorPendiente = (parseInt(d.valor_pending) || 0) - (parseInt(d.valor_abone) || 0);
        this.valorIngreso = (parseInt(d.valor_ingreso) || 0) + (parseInt(d.valor_abone) || 0);
        this.armarIndicadores();
      },
      error: () => {},
    });
    this.userService.getPriceEgresseAll().subscribe({
      next: r => {
        const e = r.data ?? {};
        this.valorEgresos = parseFloat(e?.total_gastos) || 0;
        this.valorCaja = parseFloat(e?.net_value) || 0;
        this.armarIndicadores();
      },
      error: () => {},
    });
  }

  private cargarClientes(): void {
    this.userService.getCountUser().subscribe({
      next: r => {
        this.active = parseInt(r.data?.actives) || 0;
        this.inactive = parseInt(r.data?.inactive) || 0;
        this.totalUsers = this.active + this.inactive;
        this.armarIndicadores();
      },
      error: () => {},
    });
  }

  private cargarClientesPorMes(): void {
    this.userService.getTotalClientRegisterMonth(this.selectedYear).subscribe({
      next: r => {
        const meses = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
        const filas = (r.data ?? []).map((d: any) => ({
          mes: meses[d.month - 1] ?? '',
          altas: parseInt(d.activeClient) || 0,
          bajas: parseInt(d.inactiveClient) || 0,
        }));
        const techo = Math.max(1, ...filas.map((f: any) => f.altas + f.bajas));
        this.porMes = filas.map((f: any) => ({
          ...f,
          alto: Math.round((f.altas / techo) * 100),
          altoBajas: Math.round((f.bajas / techo) * 100),
        }));
      },
      error: () => {},
    });
  }

  private cargarTickets(): void {
    this.cargandoTickets = true;
    this.userService.getTicketStats().subscribe({
      next: r => {
        const d = r.data ?? {};
        this.ticketPending = d.pending ?? 0;
        this.ticketInProgress = d.in_progress ?? 0;
        this.ticketClosedToday = d.closed_today ?? 0;
        this.topTechnicians = (d.top_technicians ?? []).slice(0, 4);
        this.cargandoTickets = false;
        this.armarIndicadores();
        this.armarAcciones();
      },
      error: () => { this.cargandoTickets = false; },
    });
  }

  private cargarAvisos(): void {
    this.alertas.lista().subscribe({
      next: r => {
        const d = r?.data ?? {};
        this.avisosCriticos = d.resumen?.criticos ?? 0;
        this.avisosTotal = d.resumen?.avisos ?? 0;
        this.clientesAfectados = new Set(
          (d.alertas ?? []).filter((a: any) => a.user_id && !a.cerrada_en).map((a: any) => a.user_id),
        ).size;
        this.armarIndicadores();
        this.armarAcciones();
      },
      error: () => {},
    });
  }

  private cargarSalud(): void {
    this.http.get<any>(`${environment.rootUrl}api/management/red/salud`, { headers: this.cabeceras() }).subscribe({
      next: r => {
        const d = r?.data ?? {};
        const puertos: Puerto[] = d.puertos ?? [];
        this.puertos = puertos.slice(0, 20);
        this.alBorde = (d.al_borde ?? []).slice(0, 5);
        this.ontsTotal = puertos.reduce((n, p) => n + (p.onts || 0), 0);
        this.ontsApagadas = puertos.reduce((n, p) => n + (p.offline || 0), 0);
        this.puertosSinMedir = puertos.filter(p => p.rx_mediana === null).length;
      },
      error: () => {},
    });
  }

  private cargarMora(): void {
    this.http.get<any>(`${environment.rootUrl}api/cartera/mora`, { headers: this.cabeceras() }).subscribe({
      next: r => {
        const d = r?.data ?? null;
        if (!d) return;
        const techo = Math.max(1, ...(d.antiguedad ?? []).map((t: any) => t.deuda));
        this.mora = {
          ...d,
          totalTexto: this.plata(d.total),
          recuperadoTexto: this.plata(d.recuperado),
          antiguedad: (d.antiguedad ?? []).map((t: any) => ({
            ...t, texto: this.plata(t.deuda), ancho: Math.round((t.deuda / techo) * 100),
          })),
        };
      },
      error: () => {},
    });
  }

  private cargarDeudores(): void {
    this.http.get<any>(`${environment.rootUrl}api/cartera/deudores?limite=5`, { headers: this.cabeceras() }).subscribe({
      next: r => { this.deudores = (r?.data ?? []).map((d: any) => ({ ...d, deuda_texto: this.plata(d.deuda) })); },
      error: () => {},
    });
  }

  private cargarCobranza(): void {
    this.cobranzaApi.resumen().subscribe({
      next: (r: any) => {
        const d = r?.data ?? null;
        if (d) this.cobranza = { ...d, esperan: (d.detectados ?? 0) + (d.escalados ?? 0) };
        this.armarAcciones();
      },
      error: () => {},
    });
  }

  private cargarMetodos(): void {
    this.financeService.getPaymentMethodSummary(this.pmPeriod).subscribe({
      next: r => {
        this.pmSummary = (r.data ?? []).map((i: any) => {
          const total = parseFloat(i.total_amount) || 0;
          return { name: i.method_name, total, count: parseInt(i.total_payments) || 0, texto: this.plata(total) };
        }).sort((a: any, b: any) => b.total - a.total).slice(0, 5);
      },
      error: () => {},
    });
  }

  private cargarEventos(): void {
    this.http.get<any>(`${environment.rootUrl}api/company/notificaciones`, { headers: this.cabeceras() }).subscribe({
      next: r => {
        const items = r?.data?.items ?? [];
        this.eventos = items.slice(0, 8);
        this.equiposAMedias = items.filter((e: Evento) => e.origen === 'equipo').length;
        this.armarAcciones();
      },
      error: () => {},
    });
  }

  private cargarNovedades(): void {
    this.http.get<any>(`${environment.rootUrl}api/company/novedades`, { headers: this.cabeceras() }).subscribe({
      next: r => { this.novedades = (r?.data?.novedades ?? []).slice(0, 4); },
      error: () => {},
    });
  }

  // ── Lo que hay que resolver ────────────────────────────────────────────

  /** Las cosas de hoy, ordenadas por lo que le duele al cliente. */
  private armarAcciones(): void {
    const lista: { texto: string; detalle: string; tono: string; ruta: string; cuantos: number }[] = [];

    if (this.avisosCriticos) {
      lista.push({
        cuantos: this.avisosCriticos, texto: 'avisos críticos en la red',
        detalle: this.clientesAfectados ? `${this.clientesAfectados} clientes sin buena señal` : 'hay que ir a mirarlos',
        tono: 'critico', ruta: '/dashboard/olt/alertas',
      });
    }

    const esperan = this.cobranza?.esperan ?? 0;
    if (esperan) {
      lista.push({
        cuantos: esperan, texto: 'casos de cobranza esperando',
        detalle: 'la IA ya redactó el mensaje de cada uno', tono: 'aviso', ruta: '/dashboard/cobranza',
      });
    }

    if (this.ticketPending) {
      lista.push({
        cuantos: this.ticketPending, texto: 'tickets sin atender',
        detalle: `${this.ticketInProgress} más están en atención`, tono: 'info', ruta: '/dashboard/view-ticket',
      });
    }

    if (this.equiposAMedias) {
      lista.push({
        cuantos: this.equiposAMedias, texto: 'equipos a medio configurar',
        detalle: 'se autorizaron pero el cliente no navega', tono: 'neutro', ruta: '/dashboard/olt/autorizadas',
      });
    }

    this.acciones = lista;
  }

  private armarIndicadores(): void {
    const plata = (n: number) => '$ ' + this.plata(n);
    const lista: Indicador[] = [];

    if (this.veLaPlata) {
      lista.push(
        { clave: 'caja', etiqueta: 'Caja del mes', valor: plata(this.valorCaja), pie: 'ingresos menos egresos', ruta: '/dashboard/finanzas', tono: 'accent' },
        { clave: 'ingreso', etiqueta: 'Recaudado', valor: plata(this.valorIngreso), pie: `${this.countPaid.toLocaleString('es-CO')} facturas pagadas`, ruta: '/dashboard/finanzas', tono: 'ok' },
        { clave: 'pendiente', etiqueta: 'Por cobrar', valor: plata(this.valorPendiente), pie: 'cartera pendiente', ruta: '/dashboard/cartera', tono: 'warn' },
      );
    }

    // El total de clientes de la empresa es un dato de gestión: el técnico
    // entra a ver sus tickets, no el tamaño del negocio.
    if (this.puede('usuario')) {
      lista.push({
        clave: 'clientes', etiqueta: 'Clientes', valor: this.totalUsers.toLocaleString('es-CO'),
        pie: `${this.active} en línea · ${this.inactive} cortados`, ruta: '/dashboard/usuario', tono: 'neutro',
      });
    }

    if (this.veLaRed) {
      lista.push({
        clave: 'avisos', etiqueta: 'Avisos críticos', valor: String(this.avisosCriticos),
        pie: this.clientesAfectados ? `${this.clientesAfectados} clientes afectados` : 'la red está tranquila',
        ruta: '/dashboard/olt/alertas', tono: this.avisosCriticos ? 'danger' : 'ok',
      });
    }

    if (this.veTickets) {
      lista.push({
        clave: 'tickets', etiqueta: 'Tickets abiertos', valor: String(this.ticketPending + this.ticketInProgress),
        pie: `${this.ticketClosedToday} cerrados hoy`, ruta: '/dashboard/view-ticket', tono: 'info',
      });
    }

    this.indicadores = lista;
  }

  // ── Presentación ───────────────────────────────────────────────────────

  plata(n: number): string { return Math.round(Number(n) || 0).toLocaleString('es-CO'); }

  tonoPuerto(p: Puerto): 'ok' | 'aviso' | 'malo' | 'nada' {
    if (p.rx_mediana === null) return 'nada';
    const parte = p.onts ? p.al_borde / p.onts : 0;
    if (p.rx_mediana <= -26 || parte >= 0.25) return 'malo';
    if (p.rx_mediana <= -24 || p.al_borde > 0) return 'aviso';
    return 'ok';
  }

  dbm(v: number | null | undefined): string { return v === null || v === undefined ? '—' : Number(v).toFixed(1); }

  desde(fecha: string): string {
    const s = Math.max(0, (Date.now() - new Date(fecha).getTime()) / 1000);
    if (s < 120) return 'recién';
    if (s < 3600) return `hace ${Math.round(s / 60)} min`;
    if (s < 86400) return `hace ${Math.round(s / 3600)} h`;
    return `hace ${Math.round(s / 86400)} días`;
  }

  ir(ruta: string): void {
    if (this.armando || !ruta) return;
    this.router.navigateByUrl(ruta.startsWith('/') ? ruta : `/dashboard/${ruta}`);
  }

  verCliente(userId: number | null | undefined): void {
    if (this.armando || !userId) return;
    this.router.navigate(['/dashboard/usuario'], { queryParams: { cliente: userId } });
  }

  onYearChange(): void {
    this.graficoDePlata();
    if (this.hay('clientes')) this.cargarClientesPorMes();
  }

  // ── El gráfico ─────────────────────────────────────────────────────────

  private redibujar(): void { if (this.hay('plata')) this.graficoDePlata(); }

  private tok(name: string, fallback = '#0f766e'): string {
    if (typeof getComputedStyle === 'undefined') return fallback;
    return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || fallback;
  }

  private alpha(hex: string, a: number): string {
    const m = hex.replace('#', '');
    if (m.length !== 6) return hex;
    return `rgba(${parseInt(m.slice(0, 2), 16)},${parseInt(m.slice(2, 4), 16)},${parseInt(m.slice(4, 6), 16)},${a})`;
  }

  private graficoDePlata(): void {
    this.userService.getTotalPriceMonth(this.selectedYear).subscribe({
      next: res => {
        const data = res.data ?? [];
        const meses = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
        const ok = this.tok('--ok', '#1f8a4c');
        const danger = this.tok('--danger', '#c0392b');
        const line = this.tok('--line', '#d5e0e4');
        const text3 = this.tok('--text-3', '#7f92a2');
        const font = { family: "'IBM Plex Mono', monospace", size: 10 };

        const el = document.getElementById('incomeChart') as HTMLCanvasElement | null;
        if (!el) return;
        this.charts['incomeChart']?.destroy();

        this.charts['incomeChart'] = new Chart(el, {
          type: 'line',
          data: {
            labels: data.map((d: any) => meses[d.month - 1] ?? ''),
            datasets: [
              {
                label: 'Ingresos', data: data.map((d: any) => parseFloat(d.total_sum) || 0),
                borderColor: ok, backgroundColor: this.alpha(ok, 0.12), fill: true, tension: 0.35,
                pointBackgroundColor: ok, pointRadius: 2.5,
              },
              {
                label: 'Egresos', data: data.map((d: any) => parseFloat(d.total_egresses) || 0),
                borderColor: danger, backgroundColor: this.alpha(danger, 0.10), fill: true, tension: 0.35,
                pointBackgroundColor: danger, pointRadius: 2.5,
              },
            ],
          },
          options: {
            responsive: true, maintainAspectRatio: false,
            plugins: {
              legend: { display: false }, datalabels: { display: false },
              tooltip: { callbacks: { label: (c: TooltipItem<'line'>) => ` $${(c.parsed.y as number).toLocaleString('es-CO')}` } },
            },
            scales: {
              y: {
                beginAtZero: true, grid: { color: this.alpha(line, 0.7) },
                ticks: { color: text3, font, maxTicksLimit: 5, callback: (v: string | number) => `$${((v as number) / 1000000).toFixed(0)}M` },
              },
              x: { grid: { display: false }, ticks: { color: text3, font } },
            },
          },
        });
      },
      error: () => {},
    });
  }
}
