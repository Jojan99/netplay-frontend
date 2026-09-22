import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Chart, registerables, TooltipItem, Scale } from 'chart.js';
import ChartDataLabels from 'chartjs-plugin-datalabels';
import { UserService } from '../services/user.service';
import { AuthService } from '../services/auth.service';
import { FinanceService } from '../services/finance.service';
import { forkJoin, Subscription } from 'rxjs';
import { ThemeService } from '../common/services/theme/theme.service';
import { OnboardingGuideComponent } from '../components/onboarding-guide/onboarding-guide.component';
import { NpSelectComponent, PresentacionSelect } from '../common/np-select/np-select.component';
import { ReferidosCardComponent } from '../components/referidos-card/referidos-card.component';
import { Router } from '@angular/router';
import { TableroService } from '../services/tablero.service';
import { AlertasService } from '../services/alertas.service';
import { CobranzaService } from '../services/cobranza.service';
import { NovedadesService } from '../services/novedades.service';
import { OltService } from '../services/olt.service';
import { AcsService } from '../services/acs.service';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { environment } from '../../environments/environment';

Chart.register(...registerables, ChartDataLabels);

@Component({
  selector: 'app-dashboard',
  templateUrl: './dashboard.component.html',
  standalone: true,
  imports: [CommonModule, FormsModule, OnboardingGuideComponent, NpSelectComponent, ReferidosCardComponent],
  styleUrls: ['./dashboard.component.scss'],
  host: { class: 'np-console' },
})
export class DashboardComponent implements OnInit, OnDestroy {

  role        = '';
  companyName = '';
  username    = '';

  /**
   * Primer nombre para el saludo; la cédula si no hay. Se lee de la sesión en
   * cada vuelta: en sesiones viejas el nombre llega un momento después, cuando
   * la barra superior lo pide, y así el saludo se actualiza solo.
   */
  get nombre(): string { return this.authService.getPrimerNombre(); }
  today       = '';

  selectedYear  = new Date().getFullYear();
  availableYears: number[] = [];
  readonly presAnios: PresentacionSelect<number> = {
    valor: y => y,
    etiqueta: y => String(y),
    insignia: y => (y === new Date().getFullYear() ? { texto: 'Año actual', tono: 'info' } : null),
  };

  isLoading        = false;
  isLoadingTickets = false;

  // Finance KPIs
  valorCaja     = 0;
  valorIngreso  = 0;
  valorPendiente= 0;
  valorEgresos  = 0;
  countPaid     = 0;
  active        = 0;
  inactive      = 0;
  totalUsers    = 0;

  // Ticket KPIs
  ticketTotal       = 0;
  ticketPending     = 0;
  ticketInProgress  = 0;
  ticketClosed      = 0;
  ticketClosedToday = 0;
  ticketReopenPct   = 0;
  topTechnicians: { names: string; lastname: string; count: number }[] = [];
  topClients:     { names: string; lastname: string; count: number }[] = [];

  private charts: Record<string, Chart> = {};

  // Payment method summary
  pmSummary: { name: string; total: number; count: number }[] = [];
  pmPeriod   = new Date().toISOString().slice(0, 7); // YYYY-MM

  private themeSub?: Subscription;

  constructor(
    private userService: UserService,
    private authService: AuthService,
    private financeService: FinanceService,
    private themeService: ThemeService,
    private router: Router,
    private tableroSvc: TableroService,
    private alertasSvc: AlertasService,
    private cobranzaSvc: CobranzaService,
    private novedadesSvc: NovedadesService,
    private oltSvc: OltService,
    private acsSvc: AcsService,
    private http: HttpClient,
  ) {}

  /* ── Armar el tablero ───────────────────────────────────────────────── */

  private cargarTablero(): void {
    this.tableroSvc.ver().subscribe({
      next: (r: any) => {
        this.paneles = r?.data?.paneles ?? [];
        this.tableroArmado = !!r?.data?.armado;
        this.pedirDatosDeLosPaneles();
      },
      // Sin tablero guardado no se deja la pantalla en blanco: se muestra
      // lo de siempre.
      error: () => {
        this.paneles = ['resolver', 'plata', 'salud', 'vivo', 'deudores', 'tickets', 'novedades'];
        this.pedirDatosDeLosPaneles();
      },
    });
  }

  tiene(id: string): boolean { return this.paneles.includes(id); }

  /** Los paneles que este usuario puede poner, según su rol. */
  get catalogoVisible() {
    return this.catalogo.filter(p => !p.roles || p.roles.includes(this.role));
  }

  alternar(id: string): void {
    this.paneles = this.tiene(id) ? this.paneles.filter(p => p !== id) : [...this.paneles, id];
    if (this.tiene(id)) this.pedirDatosDeLosPaneles();
  }

  mover(i: number, paso: number): void {
    const j = i + paso;
    if (j < 0 || j >= this.paneles.length) return;
    const copia = [...this.paneles];
    [copia[i], copia[j]] = [copia[j], copia[i]];
    this.paneles = copia;
  }

  guardarTablero(): void {
    this.guardandoTablero = true;
    this.tableroSvc.guardar(this.paneles).subscribe({
      next: () => { this.guardandoTablero = false; this.armando = false; this.tableroArmado = true; setTimeout(() => this.redrawCharts(), 60); },
      error: () => { this.guardandoTablero = false; },
    });
  }

  volverAlDeFabrica(): void {
    this.tableroSvc.olvidar().subscribe({
      next: (r: any) => {
        this.paneles = r?.data?.paneles ?? [];
        this.tableroArmado = false;
        this.armando = false;
        this.pedirDatosDeLosPaneles();
        setTimeout(() => this.redrawCharts(), 60);
      },
    });
  }

  /** Un panel lleva a la pantalla donde está el detalle. */
  irA(id: string): void {
    const ruta = this.catalogo.find(p => p.id === id)?.ruta;
    if (ruta) this.router.navigate([ruta]);
  }

  tituloDe(id: string): string { return this.catalogo.find(p => p.id === id)?.titulo ?? id; }

  /* ── Datos de cada panel ────────────────────────────────────────────────
     Sólo se pide lo que está puesto: un tablero de tres paneles no tiene por
     qué golpear trece endpoints. */

  private pedirDatosDeLosPaneles(): void {
    const h = { headers: new HttpHeaders({ Authorization: `Bearer ${localStorage.getItem('token')}` }) };

    if (this.tiene('resolver') && !this.resolver) {
      this.alertasSvc.lista().subscribe({
        next: (r: any) => {
          const abiertas = (r?.data ?? []).filter((a: any) => !a.resuelta_en);
          this.resolver = { total: abiertas.length, ultimas: abiertas.slice(0, 4) };
        },
        error: () => { this.resolver = { total: 0, ultimas: [] }; },
      });
    }

    if (this.tiene('vivo') && !this.vivo) {
      this.oltSvc.getOntStatusAll().subscribe({
        next: (r: any) => {
          const filas = r?.data ?? r ?? [];
          const online = filas.filter((o: any) => (o.status || o.estado || '').toString().toLowerCase().includes('online')).length;
          this.vivo = { online, offline: filas.length - online, total: filas.length };
        },
        error: () => {},
      });
    }

    if (this.tiene('mora') && !this.moraData) {
      this.http.get(`${environment.rootUrl}api/cartera/mora`, h).subscribe({
        next: (r: any) => this.moraData = r?.data ?? null, error: () => {},
      });
    }

    if (this.tiene('deudores') && !this.deudoresData.length) {
      this.http.get(`${environment.rootUrl}api/cartera/deudores?limite=5`, h).subscribe({
        next: (r: any) => this.deudoresData = r?.data ?? [], error: () => {},
      });
    }

    if (this.tiene('cobranza') && !this.cobranzaData) {
      this.cobranzaSvc.resumen().subscribe({ next: (r: any) => this.cobranzaData = r?.data ?? null, error: () => {} });
    }

    if ((this.tiene('salud') || this.tiene('borde')) && !this.saludData) {
      this.http.get(`${environment.rootUrl}api/management/red/salud`, h).subscribe({
        next: (r: any) => this.saludData = r?.data ?? null, error: () => {},
      });
    }

    if (this.tiene('equipos') && !this.equiposData) {
      this.http.get(`${environment.rootUrl}api/management/equipos`, h).subscribe({
        next: (r: any) => {
          const filas = r?.data ?? [];
          const corte = Date.now() - 30 * 60 * 1000;
          this.equiposData = {
            total: filas.length,
            hablando: filas.filter((e: any) => e.ultimo_informe && new Date(e.ultimo_informe).getTime() > corte).length,
          };
        },
        error: () => {},
      });
    }

    if (this.tiene('novedades') && !this.novedadesData.length) {
      this.novedadesSvc.lista().subscribe({ next: (r: any) => this.novedadesData = (r?.data?.novedades ?? []).slice(0, 4), error: () => {} });
    }
  }

  /** Lee un token de color del tema activo para usarlo en Chart.js. */
  private tok(name: string, fallback = '#0f766e'): string {
    if (typeof getComputedStyle === 'undefined') return fallback;
    const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
    return v || fallback;
  }
  private alpha(hex: string, a: number): string {
    const m = hex.replace('#', '');
    if (m.length !== 6) return hex;
    const r = parseInt(m.slice(0, 2), 16), g = parseInt(m.slice(2, 4), 16), b = parseInt(m.slice(4, 6), 16);
    return `rgba(${r},${g},${b},${a})`;
  }
  private chartBase() {
    const text3 = this.tok('--text-3', '#7f92a2');
    const line  = this.tok('--line', '#d5e0e4');
    return { text3, line, font: { family: "'IBM Plex Mono', monospace", size: 11 } };
  }

  /* ── El tablero que arma cada uno ────────────────────────────────────────
     El inicio dejó de ser una pantalla fija: cada usuario elige qué paneles
     ve y en qué orden. Los nombres los valida el servidor contra su propia
     lista, así que acá sólo hay presentación. */

  /** Los paneles elegidos, en orden. */
  paneles: string[] = [];
  /** Modo de armado: se muestran las casillas para sumar, quitar y mover. */
  armando = false;
  guardandoTablero = false;
  tableroArmado = false;

  /**
   * Qué es cada panel y a dónde lleva.
   *
   * El texto corto es el que se ve al armar el tablero: tiene que alcanzar
   * para decidir sin tener que probarlo.
   */
  readonly catalogo: { id: string; titulo: string; resumen: string; ruta?: string; roles?: string[] }[] = [
    { id: 'resolver',  titulo: 'Para resolver',      resumen: 'Lo que está fallando en la red y espera una mano', ruta: '/dashboard/olt/alertas' },
    { id: 'vivo',      titulo: 'La red en vivo',     resumen: 'Cuántos equipos están conectados ahora mismo',     ruta: '/dashboard/olt/online' },
    { id: 'plata',     titulo: 'La plata',           resumen: 'Caja, ingresos, egresos y lo que falta cobrar',    ruta: '/dashboard/finance',        roles: ['ADMIN', 'CONTADOR'] },
    { id: 'mora',      titulo: 'Mora por antigüedad', resumen: 'Cuánto se debe en cada tramo y qué se recuperó',  ruta: '/dashboard/cartera',        roles: ['ADMIN', 'CONTADOR'] },
    { id: 'metodos',   titulo: 'Medios de pago',     resumen: 'Por dónde entra la plata cada mes',                ruta: '/dashboard/finance',        roles: ['ADMIN', 'CONTADOR'] },
    { id: 'deudores',  titulo: 'Quién debe más',     resumen: 'Los clientes con más deuda vencida',               ruta: '/dashboard/cartera',        roles: ['ADMIN', 'CONTADOR'] },
    { id: 'cobranza',  titulo: 'Cobranza',           resumen: 'Los casos que la IA está atendiendo',              ruta: '/dashboard/cobranza',       roles: ['ADMIN', 'CONTADOR'] },
    { id: 'salud',     titulo: 'Salud de la red',    resumen: 'Cómo viene cada puerto PON',                       ruta: '/dashboard/olt/salud' },
    { id: 'borde',     titulo: 'Al borde',           resumen: 'Clientes a punto de quedarse sin servicio',        ruta: '/dashboard/olt/salud' },
    { id: 'equipos',   titulo: 'Equipos',            resumen: 'Las ONT que responden por TR-069',                 ruta: '/dashboard/router' },
    { id: 'tickets',   titulo: 'Tickets',            resumen: 'Cómo vienen los tickets y quién los atiende',      ruta: '/dashboard/ticket' },
    { id: 'clientes',  titulo: 'Clientes',           resumen: 'Altas y bajas mes a mes',                          ruta: '/dashboard/client' },
    { id: 'novedades', titulo: 'Novedades',          resumen: 'Lo último que agregamos a la plataforma' },
  ];

  /* Datos de los paneles nuevos. Cada uno se pide sólo si el panel está puesto. */
  resolver: { total: number; ultimas: any[] } | null = null;
  vivo: { online: number; offline: number; total: number } | null = null;
  moraData: any = null;
  deudoresData: any[] = [];
  cobranzaData: any = null;
  saludData: any = null;
  equiposData: { total: number; hablando: number } | null = null;
  novedadesData: any[] = [];

  ngOnInit(): void {
    const user = this.authService.getUser();
    if (user) {
      this.companyName = user.company_name || '';
      this.username    = user.username    || '';
    }
    this.role = this.authService.getProfileName(); // 'ADMIN' | 'TECNICO' | 'CONTADOR'

    const now  = new Date();
    const opts: Intl.DateTimeFormatOptions = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' };
    this.today = now.toLocaleDateString('es-CO', opts);

    const currentYear = now.getFullYear();
    this.selectedYear = currentYear;
    this.availableYears = Array.from({ length: 5 }, (_, i) => currentYear - i);

    this.cargarTablero();

    this.loadData();
    if (this.isAdmin || this.isContador) {
      this.loadPmSummary();
    }
    // Los gráficos leen los tokens al dibujarse: al cambiar el tema se redibujan.
    this.themeSub = this.themeService.$theme.subscribe(() => setTimeout(() => this.redrawCharts(), 30));
  }

  private redrawCharts(): void {
    if (!Object.keys(this.charts).length) return;
    if (this.isAdmin || this.isContador) { this.loadIncomeChart(); this.loadClientsChart(); }
    if (this.isAdmin) { this.loadContractsDonut(); this.loadTicketBarChart(); }
    if (this.isTecnico) { this.loadTicketDonut(); }
  }

  ngOnDestroy(): void {
    this.themeSub?.unsubscribe();
    Object.values(this.charts).forEach(c => c.destroy());
  }

  loadData(): void {
    if (this.isAdmin || this.isContador) {
      this.loadFinanceKpis();
      this.loadClientKpisAndDonut();
      setTimeout(() => {
        this.loadIncomeChart();
        this.loadClientsChart();
        if (this.isAdmin) {
          this.loadTicketStats();
        }
      }, 50);
    } else if (this.isTecnico) {
      this.loadTicketStats();
    }
  }

  onYearChange(): void {
    this.loadIncomeChart();
    this.loadClientsChart();
  }

  loadPmSummary(): void {
    this.financeService.getPaymentMethodSummary(this.pmPeriod).subscribe({
      next: (res) => {
        this.pmSummary = (res.data ?? []).map((item: any) => ({
          name: item.method_name,
          total: parseFloat(item.total_amount) || 0,
          count: parseInt(item.total_payments) || 0,
        }));
      },
    });
  }

  onPmPeriodChange(): void {
    this.loadPmSummary();
  }

  get isAdmin():    boolean { return this.role === 'ADMIN'; }
  get isContador(): boolean { return this.role === 'CONTADOR'; }
  get isTecnico():  boolean { return this.role === 'TECNICO'; }

  // ── Finance ──────────────────────────────────────────────────────────────

  private loadFinanceKpis(): void {
    forkJoin({
      traza:    this.userService.getTrazaFacture(),
      egresses: this.userService.getPriceEgresseAll(),
    }).subscribe({
      next: ({ traza, egresses }) => {
        const d = traza.data;
        this.countPaid      = parseInt(d.count_paid) || 0;
        this.valorPendiente = (parseInt(d.valor_pending) || 0) - (parseInt(d.valor_abone) || 0);
        this.valorIngreso   = (parseInt(d.valor_ingreso) || 0) + (parseInt(d.valor_abone) || 0);

        const e = egresses.data;
        this.valorEgresos = parseFloat(e?.total_gastos) || 0;
        this.valorCaja    = parseFloat(e?.net_value)    || 0;
      },
    });
  }

  private loadClientKpisAndDonut(): void {
    this.userService.getCountUser().subscribe({
      next: (res) => {
        this.active     = parseInt(res.data.actives)  || 0;
        this.inactive   = parseInt(res.data.inactive) || 0;
        this.totalUsers = this.active + this.inactive;
        if (this.isAdmin) {
          setTimeout(() => this.loadContractsDonut(), 50);
        }
      },
    });
  }

  // ── Tickets ──────────────────────────────────────────────────────────────

  private loadTicketStats(): void {
    this.isLoadingTickets = true;
    this.userService.getTicketStats().subscribe({
      next: (res) => {
        const d = res.data;
        this.ticketTotal       = d.total       ?? 0;
        this.ticketPending     = d.pending     ?? 0;
        this.ticketInProgress  = d.in_progress ?? 0;
        this.ticketClosed      = d.closed      ?? 0;
        this.ticketClosedToday = d.closed_today?? 0;
        this.ticketReopenPct   = d.reopen_pct  ?? 0;
        this.topTechnicians    = d.top_technicians ?? [];
        this.topClients        = d.top_clients     ?? [];
        this.isLoadingTickets  = false;
        if (this.isTecnico) {
          setTimeout(() => this.loadTicketDonut(), 50);
        } else if (this.isAdmin) {
          setTimeout(() => this.loadTicketBarChart(), 50);
        }
      },
      error: () => { this.isLoadingTickets = false; },
    });
  }

  // ── Charts ────────────────────────────────────────────────────────────────

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private mkChart(id: string, config: any): void {
    if (this.charts[id]) this.charts[id].destroy();
    const el = document.getElementById(id) as HTMLCanvasElement | null;
    if (!el) return;
    this.charts[id] = new Chart(el, config);
  }

  private loadIncomeChart(): void {
    this.userService.getTotalPriceMonth(this.selectedYear).subscribe({
      next: (res) => {
        const data = res.data ?? [];
        const labels    = data.map((d: any) => this.monthName(d.month));
        const ingresos  = data.map((d: any) => parseFloat(d.total_sum)      || 0);
        const egresos   = data.map((d: any) => parseFloat(d.total_egresses) || 0);

        const ok = this.tok('--ok', '#1f8a4c'), danger = this.tok('--danger', '#c0392b'), base = this.chartBase();
        this.mkChart('incomeChart', {
          type: 'line',
          data: {
            labels,
            datasets: [
              {
                label: 'Ingresos',
                data: ingresos,
                borderColor: ok,
                backgroundColor: this.alpha(ok, 0.12),
                fill: true,
                tension: 0.35,
                pointBackgroundColor: ok,
                pointRadius: 3,
              },
              {
                label: 'Egresos',
                data: egresos,
                borderColor: danger,
                backgroundColor: this.alpha(danger, 0.10),
                fill: true,
                tension: 0.35,
                pointBackgroundColor: danger,
                pointRadius: 3,
              },
            ],
          },
          options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
              legend: { display: false },
              datalabels: { display: false },
              tooltip: {
                callbacks: {
                  label: (ctx: TooltipItem<'line'>) => ` $${(ctx.parsed.y as number).toLocaleString('es-CO')}`,
                },
              },
            },
            scales: {
              y: {
                beginAtZero: true,
                grid: { color: this.alpha(base.line, 0.7) },
                ticks: { color: base.text3, font: base.font, callback: (v: string | number) => `$${(v as number).toLocaleString('es-CO')}` },
              },
              x: { grid: { display: false }, ticks: { color: base.text3, font: base.font } },
            },
          },
        });
      },
    });
  }

  private loadClientsChart(): void {
    this.userService.getTotalClientRegisterMonth(this.selectedYear).subscribe({
      next: (res) => {
        const data = res.data ?? [];
        const labels   = data.map((d: any) => this.monthName(d.month));
        const activos  = data.map((d: any) => parseInt(d.activeClient)   || 0);
        const inactivos= data.map((d: any) => parseInt(d.inactiveClient) || 0);

        const accent = this.tok('--accent'), danger = this.tok('--danger', '#c0392b'), base = this.chartBase();
        this.mkChart('clientsChart', {
          type: 'bar',
          data: {
            labels,
            datasets: [
              {
                label: 'Registrados',
                data: activos,
                backgroundColor: this.alpha(accent, 0.85),
                borderRadius: 3,
              },
              {
                label: 'Eliminados',
                data: inactivos,
                backgroundColor: this.alpha(danger, 0.75),
                borderRadius: 3,
              },
            ],
          },
          options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
              legend: { display: false },
              datalabels: { display: false },
            },
            scales: {
              y: { beginAtZero: true, grid: { color: this.alpha(base.line, 0.7) }, ticks: { precision: 0, color: base.text3, font: base.font } },
              x: { grid: { display: false }, ticks: { color: base.text3, font: base.font } },
            },
          },
        });
      },
    });
  }

  private loadContractsDonut(): void {
    const base = this.chartBase();
    this.mkChart('contractsChart', {
      type: 'doughnut',
      data: {
        labels: ['Activos', 'Inactivos'],
        datasets: [{
          data: [this.active, this.inactive],
          backgroundColor: [this.tok('--ok', '#1f8a4c'), this.tok('--danger', '#c0392b')],
          borderWidth: 0,
          hoverOffset: 6,
        }],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        cutout: '70%',
        plugins: {
          legend: { position: 'bottom', labels: { boxWidth: 10, padding: 14, color: base.text3, font: base.font } },
          datalabels: {
            display: true,
            color: '#fff',
            font: { weight: 'bold', size: 13 },
            formatter: (value: number) => {
              const total = this.active + this.inactive;
              return total > 0 ? `${((value / total) * 100).toFixed(0)}%` : '0%';
            },
          },
        },
      },
      plugins: [ChartDataLabels],
    });
  }

  private loadTicketDonut(): void {
    const base = this.chartBase();
    this.mkChart('ticketDonutChart', {
      type: 'doughnut',
      data: {
        labels: ['Pendientes', 'En progreso', 'Cerrados'],
        datasets: [{
          data: [this.ticketPending, this.ticketInProgress, this.ticketClosed],
          backgroundColor: [this.tok('--warn', '#b7791f'), this.tok('--info', '#2563eb'), this.tok('--ok', '#1f8a4c')],
          borderWidth: 0,
          hoverOffset: 6,
        }],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        cutout: '68%',
        plugins: {
          legend: { position: 'bottom', labels: { boxWidth: 10, padding: 14, color: base.text3, font: base.font } },
          datalabels: {
            display: true,
            color: '#fff',
            font: { weight: 'bold', size: 12 },
            formatter: (value: number) => value > 0 ? value : '',
          },
        },
      },
      plugins: [ChartDataLabels],
    });
  }

  private loadTicketBarChart(): void {
    const base = this.chartBase();
    this.mkChart('ticketBarChart', {
      type: 'bar',
      data: {
        labels: ['Pendientes', 'En progreso', 'Cerrados'],
        datasets: [{
          label: 'Tickets',
          data: [this.ticketPending, this.ticketInProgress, this.ticketClosed],
          backgroundColor: [this.tok('--warn', '#b7791f'), this.tok('--info', '#2563eb'), this.tok('--ok', '#1f8a4c')],
          borderRadius: 3,
        }],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          datalabels: {
            display: true,
            color: '#fff',
            font: { weight: 'bold', size: 12 },
            anchor: 'end',
            align: 'start',
          },
        },
        scales: {
          y: { beginAtZero: true, grid: { color: this.alpha(base.line, 0.7) }, ticks: { precision: 0, color: base.text3, font: base.font } },
          x: { grid: { display: false }, ticks: { color: base.text3, font: base.font } },
        },
      },
      plugins: [ChartDataLabels],
    });
  }

  private monthName(n: number): string {
    return ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'][n - 1] ?? '';
  }
}
