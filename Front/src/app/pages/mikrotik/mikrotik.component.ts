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

  // Router info
  routerInfo: any = null;
  loadingInfo = false;

  // Clients
  clients: any[] = [];
  filteredClients: any[] = [];
  clientSearch = '';
  loadingClients = false;
  selectedIds = new Set<number>();
  suspending = false;
  suspendResult: string | null = null;
  suspendError = false;

  // Queues
  queues: any[] = [];
  loadingQueues = false;
  showQueueForm = false;
  editingQueue: any = null;
  queueForm = { name: '', target: '', max_limit: '', comment: '', burst_limit: '', burst_threshold: '', burst_time: '' };
  savingQueue = false;
  queueMsg = '';
  queueError = false;

  // Config
  configForm = { host: '', user: '', pass: '', port: 8728 };
  loadingConfig = false;
  savingConfig = false;
  configMsg = '';
  configError = false;
  showPass = false;

  constructor(private svc: MikrotikService) {}

  ngOnInit() {
    this.loadInfo();
  }

  setTab(tab: 'info' | 'clients' | 'queues' | 'config') {
    this.activeTab = tab;
    if (tab === 'info' && !this.routerInfo) this.loadInfo();
    if (tab === 'clients' && !this.clients.length) this.loadClients();
    if (tab === 'queues' && !this.queues.length) this.loadQueues();
    if (tab === 'config') this.loadConfig();
  }

  refresh() {
    if (this.activeTab === 'info') this.loadInfo();
    else if (this.activeTab === 'clients') this.loadClients();
    else if (this.activeTab === 'queues') this.loadQueues();
  }

  // ── Info ──────────────────────────────────────────────────────────────────
  loadInfo() {
    this.loadingInfo = true;
    this.routerInfo = null;
    this.svc.getRouterInfo().subscribe({
      next: r => { this.routerInfo = r.data; this.loadingInfo = false; },
      error: () => { this.loadingInfo = false; },
    });
  }

  // ── Clients ───────────────────────────────────────────────────────────────
  loadClients() {
    this.loadingClients = true;
    this.selectedIds.clear();
    this.suspendResult = null;
    this.svc.getConnectedClients().subscribe({
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
    this.svc.suspendBulk(Array.from(this.selectedIds)).subscribe({
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
    this.svc.getQueues().subscribe({
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
      ? this.svc.updateQueue(this.editingQueue['.id'], this.queueForm)
      : this.svc.createQueue(this.queueForm);

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
    this.svc.deleteQueue(id).subscribe({ next: () => this.loadQueues() });
  }

  // ── Config ────────────────────────────────────────────────────────────────
  loadConfig() {
    this.loadingConfig = true;
    this.configMsg = '';
    this.svc.getRouterConfig().subscribe({
      next: r => {
        this.loadingConfig = false;
        if (r.data) {
          this.configForm.host = r.data.host ?? '';
          this.configForm.user = r.data.user ?? '';
          this.configForm.port = r.data.port ?? 8728;
          this.configForm.pass = '';
        }
      },
      error: () => { this.loadingConfig = false; },
    });
  }

  saveConfig() {
    if (!this.configForm.host || !this.configForm.user || !this.configForm.pass) return;
    this.savingConfig = true;
    this.configMsg = '';
    this.svc.saveRouterConfig(this.configForm).subscribe({
      next: r => {
        this.savingConfig = false;
        this.configMsg = r.message;
        this.configError = r.status !== 0;
        if (r.status === 0) this.configForm.pass = '';
      },
      error: e => {
        this.savingConfig = false;
        this.configMsg = e.error?.message ?? 'Error al guardar';
        this.configError = true;
      },
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
    return Number(this.routerInfo?.resource?.cpu_load ?? 0);
  }

  memPercent(): number {
    const r = this.routerInfo?.resource;
    if (!r?.total_memory) return 0;
    return Math.round(((r.total_memory - r.free_memory) / r.total_memory) * 100);
  }
}
