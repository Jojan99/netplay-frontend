import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Chart, registerables, TooltipItem, Scale } from 'chart.js';
import ChartDataLabels from 'chartjs-plugin-datalabels';
import { UserService } from '../services/user.service';
import { AuthService } from '../services/auth.service';
import { forkJoin } from 'rxjs';

Chart.register(...registerables, ChartDataLabels);

@Component({
  selector: 'app-dashboard',
  templateUrl: './dashboard.component.html',
  standalone: true,
  imports: [CommonModule, FormsModule],
  styleUrls: ['./dashboard.component.scss'],
})
export class DashboardComponent implements OnInit, OnDestroy {

  role        = '';
  companyName = '';
  username    = '';
  today       = '';

  selectedYear  = new Date().getFullYear();
  availableYears: number[] = [];

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

  constructor(
    private userService: UserService,
    private authService: AuthService,
  ) {}

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

    this.loadData();
  }

  ngOnDestroy(): void {
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

        this.mkChart('incomeChart', {
          type: 'line',
          data: {
            labels,
            datasets: [
              {
                label: 'Ingresos',
                data: ingresos,
                borderColor: '#10B981',
                backgroundColor: 'rgba(16,185,129,0.12)',
                fill: true,
                tension: 0.4,
                pointBackgroundColor: '#10B981',
                pointRadius: 4,
              },
              {
                label: 'Egresos',
                data: egresos,
                borderColor: '#F43F5E',
                backgroundColor: 'rgba(244,63,94,0.10)',
                fill: true,
                tension: 0.4,
                pointBackgroundColor: '#F43F5E',
                pointRadius: 4,
              },
            ],
          },
          options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
              legend: { position: 'bottom', labels: { boxWidth: 12, padding: 16 } },
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
                grid: { color: 'rgba(156,163,175,0.15)' },
                ticks: { callback: (v: string | number) => `$${(v as number).toLocaleString('es-CO')}` },
              },
              x: { grid: { display: false } },
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

        this.mkChart('clientsChart', {
          type: 'bar',
          data: {
            labels,
            datasets: [
              {
                label: 'Registrados',
                data: activos,
                backgroundColor: 'rgba(59,130,246,0.8)',
                borderRadius: 4,
              },
              {
                label: 'Eliminados',
                data: inactivos,
                backgroundColor: 'rgba(244,63,94,0.75)',
                borderRadius: 4,
              },
            ],
          },
          options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
              legend: { position: 'bottom', labels: { boxWidth: 12, padding: 16 } },
              datalabels: { display: false },
            },
            scales: {
              y: { beginAtZero: true, grid: { color: 'rgba(156,163,175,0.15)' }, ticks: { precision: 0 } },
              x: { grid: { display: false } },
            },
          },
        });
      },
    });
  }

  private loadContractsDonut(): void {
    this.mkChart('contractsChart', {
      type: 'doughnut',
      data: {
        labels: ['Activos', 'Inactivos'],
        datasets: [{
          data: [this.active, this.inactive],
          backgroundColor: ['#3B82F6', '#F43F5E'],
          borderWidth: 0,
          hoverOffset: 6,
        }],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        cutout: '70%',
        plugins: {
          legend: { position: 'bottom', labels: { boxWidth: 12, padding: 16 } },
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
    this.mkChart('ticketDonutChart', {
      type: 'doughnut',
      data: {
        labels: ['Pendientes', 'En progreso', 'Cerrados'],
        datasets: [{
          data: [this.ticketPending, this.ticketInProgress, this.ticketClosed],
          backgroundColor: ['#6366F1', '#F59E0B', '#10B981'],
          borderWidth: 0,
          hoverOffset: 6,
        }],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        cutout: '68%',
        plugins: {
          legend: { position: 'bottom', labels: { boxWidth: 12, padding: 14 } },
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
    this.mkChart('ticketBarChart', {
      type: 'bar',
      data: {
        labels: ['Pendientes', 'En progreso', 'Cerrados'],
        datasets: [{
          label: 'Tickets',
          data: [this.ticketPending, this.ticketInProgress, this.ticketClosed],
          backgroundColor: ['#6366F1', '#F59E0B', '#10B981'],
          borderRadius: 6,
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
          y: { beginAtZero: true, grid: { color: 'rgba(156,163,175,0.15)' }, ticks: { precision: 0 } },
          x: { grid: { display: false } },
        },
      },
      plugins: [ChartDataLabels],
    });
  }

  private monthName(n: number): string {
    return ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'][n - 1] ?? '';
  }
}
