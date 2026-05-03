import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MikrotikService } from '../../services/mikrotik.service';

@Component({
  selector: 'app-mikrotik',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './mikrotik.component.html',
})
export class MikrotikComponent implements OnInit {
  activeTab: 'info' | 'clients' | 'queues' | 'config' = 'info';

  tabs: { key: 'info' | 'clients' | 'queues' | 'config'; label: string }[] = [
    { key: 'info', label: 'Info Router' },
    { key: 'clients', label: 'Clientes ARP' },
    { key: 'queues', label: 'Ancho de Banda' },
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

  setTab(tab: 'info' | 'clients' | 'queues' | 'config') {
    this.activeTab = tab;
    if (tab === 'info')    { this.loadInfo(); }
    if (tab === 'clients') { if (!this.clients.length) this.loadClients(); }
    if (tab === 'queues')  { if (!this.queues.length) this.loadQueues(); }
    if (tab === 'config')  { this.loadRouters(); }
  }

  refresh() {
    if (this.activeTab === 'info')    this.loadInfo();
    else if (this.activeTab === 'clients') this.loadClients();
    else if (this.activeTab === 'queues')  this.loadQueues();
  }

  // ── Info ──────────────────────────────────────────────────────────────────

  loadInfo() {
    this.loadingInfo = true;
    this.routerInfo = null;
    this.svc.getRouterInfo(this.selectedRouterId).subscribe({
      next: r => { this.routerInfo = r.data; this.loadingInfo = false; },
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

  deleteQueue(id: string) {
    if (!confirm('¿Eliminar esta cola de ancho de banda?')) return;
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

  confirmDeleteRouter(id: number) {
    if (!confirm('¿Eliminar este Mikrotik? Esta acción no se puede deshacer.')) return;
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
