import { Component, HostListener, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { OltService } from '../../../../services/olt.service';
import { UserService } from '../../../../services/user.service';
import { ToastService } from '../../../../services/toast.service';
import { Subject } from 'rxjs';
import { debounceTime, distinctUntilChanged, switchMap } from 'rxjs/operators';

@Component({
  selector: 'app-olt-autorizadas',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './olt-autorizadas.component.html',
})
export class OltAutorizadasComponent implements OnInit {

  olts: any[]           = [];
  selectedOltId: number | null = null;
  loadingOlts           = false;

  onts: any[]           = [];
  loadingOnts           = false;
  lastFetched: Date | null = null;
  searchTerm            = '';
  filterPort            = '';
  page                  = 1;
  perPage               = 15;
  perPageOptions        = [15, 25, 50, 100];

  // Delete modal
  deleteModal           = false;
  selectedOnt: any      = null;
  processing            = false;

  // Detail modal
  detailModal           = false;
  detailOnt: any        = null;
  detailPorts: any[]    = [];
  detailInfo: any       = null;
  loadingDetail         = false;

  // Assign client modal
  assignModal           = false;
  assignOnt: any        = null;
  clientSearch          = '';
  clientResults: any[]  = [];
  searchingClients      = false;
  selectedClient: any   = null;
  assigning             = false;
  private search$       = new Subject<string>();

  constructor(
    private oltService: OltService,
    private userService: UserService,
    private toast: ToastService,
  ) {}

  ngOnInit(): void {
    this.loadOlts();
    this.search$.pipe(
      debounceTime(300),
      distinctUntilChanged(),
      switchMap(q => {
        this.searchingClients = true;
        return this.userService.searchClients(q);
      }),
    ).subscribe({
      next: (res) => { this.searchingClients = false; this.clientResults = res.data ?? []; },
      error: () => { this.searchingClients = false; },
    });
  }

  @HostListener('document:keydown.escape')
  onEsc(): void { this.deleteModal = false; this.detailModal = false; this.assignModal = false; }

  loadOlts(): void {
    this.loadingOlts = true;
    this.oltService.listOlts().subscribe({
      next: (res) => {
        this.loadingOlts = false;
        this.olts = res.data ?? [];
        if (this.olts.length === 1) {
          this.selectedOltId = this.olts[0].id;
          this.loadOnts();
        }
      },
      error: () => { this.loadingOlts = false; },
    });
  }

  onOltChange(): void {
    this.onts = [];
    this.lastFetched = null;
    this.filterPort  = '';
    this.page        = 1;
    if (this.selectedOltId) this.loadOnts();
  }

  loadOnts(force = false): void {
    if (!this.selectedOltId) return;
    this.loadingOnts = true;
    this.oltService.getAuthorizedONTs(this.selectedOltId, force).subscribe({
      next: (res) => {
        this.loadingOnts = false;
        this.onts        = res.data ?? [];
        this.lastFetched = new Date();
      },
      error: (err) => {
        this.loadingOnts = false;
        this.toast.error(err?.error?.message || 'Error al obtener ONTs');
      },
    });
  }

  // ── Unique ports for filter dropdown ─────────────────────────────────────
  get uniquePorts(): string[] {
    const set = new Set<string>();
    for (const o of this.onts) {
      if (o.fsp) set.add(o.fsp);
    }
    return Array.from(set).sort();
  }

  get filteredOnts(): any[] {
    let list = this.onts;
    if (this.filterPort) list = list.filter(o => o.fsp === this.filterPort);
    const t = this.searchTerm.toLowerCase();
    if (t) list = list.filter(o =>
      (o.fsp ?? '').toLowerCase().includes(t) ||
      (o.serial ?? '').toLowerCase().includes(t) ||
      (o.description ?? '').toLowerCase().includes(t)
    );
    return list;
  }

  get pagedOnts(): any[] {
    const start = (this.page - 1) * this.perPage;
    return this.filteredOnts.slice(start, start + this.perPage);
  }

  get totalPages(): number { return Math.max(1, Math.ceil(this.filteredOnts.length / this.perPage)); }

  get pageNumbers(): number[] {
    const delta = 2;
    const range: number[] = [];
    for (let i = Math.max(1, this.page - delta); i <= Math.min(this.totalPages, this.page + delta); i++) range.push(i);
    return range;
  }

  resetPage(): void { this.page = 1; }
  prevPage(): void  { if (this.page > 1) this.page--; }
  nextPage(): void  { if (this.page < this.totalPages) this.page++; }
  goPage(p: number): void { this.page = p; }
  changePerPage(): void { this.page = 1; }
  minVal(a: number, b: number): number { return Math.min(a, b); }

  get onlineCount(): number  { return this.onts.filter(o => o.status === 'online').length; }
  get offlineCount(): number { return this.onts.filter(o => o.status !== 'online').length; }

  // ── Delete ────────────────────────────────────────────────────────────────
  openDelete(ont: any): void {
    this.selectedOnt = ont;
    this.deleteModal = true;
  }

  confirmDelete(): void {
    if (!this.selectedOltId || !this.selectedOnt) return;
    this.processing = true;
    const d = { fsp: this.selectedOnt.fsp, ont_id: this.selectedOnt.ont_id };
    this.oltService.deleteONT(this.selectedOltId, d).subscribe({
      next: (res: any) => {
        this.processing  = false;
        this.deleteModal = false;
        this.toast.success(res.message || 'ONT eliminada');
        this.loadOnts(true);
      },
      error: (err: any) => {
        this.processing = false;
        this.toast.error(err?.error?.message || 'Error al eliminar la ONT');
      },
    });
  }

  // ── Detail (SP + señal) ───────────────────────────────────────────────────
  openDetail(ont: any): void {
    this.detailOnt   = ont;
    this.detailPorts = [];
    this.detailInfo  = null;
    this.detailModal = true;
    this.loadingDetail = true;

    let pending = 2;
    const done = () => { pending--; if (pending === 0) this.loadingDetail = false; };

    // Service ports frescos desde la OLT
    this.oltService.getServicePorts(this.selectedOltId!, ont.fsp, ont.ont_id).subscribe({
      next: (res) => { this.detailPorts = res.data ?? []; done(); },
      error: () => done(),
    });

    // Señal óptica
    this.oltService.getOntInfo(this.selectedOltId!, ont.fsp, ont.ont_id).subscribe({
      next: (res) => { this.detailInfo = res.data ?? null; done(); },
      error: () => done(),
    });
  }

  // ── Assign client ─────────────────────────────────────────────────────────
  openAssign(ont: any): void {
    this.assignOnt       = ont;
    this.clientSearch    = '';
    this.clientResults   = [];
    this.selectedClient  = ont.assigned_client ?? null;
    this.assignModal     = true;
  }

  onClientSearch(): void {
    if (this.clientSearch.trim().length >= 2) {
      this.search$.next(this.clientSearch.trim());
    } else {
      this.clientResults = [];
    }
  }

  selectClient(client: any): void {
    this.selectedClient  = client;
    this.clientSearch    = `${client.names} ${client.lastname}`;
    this.clientResults   = [];
  }

  confirmAssign(): void {
    if (!this.assignOnt || !this.selectedOltId) return;
    this.assigning = true;
    this.oltService.assignClientToOnt(
      this.selectedOltId, this.assignOnt.fsp, this.assignOnt.ont_id,
      this.selectedClient?.id ?? null,
    ).subscribe({
      next: (res) => {
        this.assigning    = false;
        this.assignModal  = false;
        this.toast.success(res.message || 'Cliente asignado');
        // Actualizar la ONT local con el cliente asignado
        const idx = this.onts.findIndex(o => o.fsp === this.assignOnt.fsp && o.ont_id === this.assignOnt.ont_id);
        if (idx >= 0) {
          this.onts[idx] = { ...this.onts[idx], assigned_client: this.selectedClient, user_data_id: this.selectedClient?.id ?? null };
        }
      },
      error: (err) => {
        this.assigning = false;
        this.toast.error(err?.error?.message || 'Error al asignar cliente');
      },
    });
  }

  removeAssign(): void {
    if (!this.assignOnt || !this.selectedOltId) return;
    this.assigning = true;
    this.oltService.assignClientToOnt(this.selectedOltId, this.assignOnt.fsp, this.assignOnt.ont_id, null).subscribe({
      next: (res) => {
        this.assigning   = false;
        this.assignModal = false;
        this.toast.success(res.message || 'Cliente desasignado');
        const idx = this.onts.findIndex(o => o.fsp === this.assignOnt.fsp && o.ont_id === this.assignOnt.ont_id);
        if (idx >= 0) {
          this.onts[idx] = { ...this.onts[idx], assigned_client: null, user_data_id: null };
        }
      },
      error: (err) => {
        this.assigning = false;
        this.toast.error(err?.error?.message || 'Error');
      },
    });
  }

  selectedOltName(): string {
    return this.olts.find(o => o.id === this.selectedOltId)?.name ?? '';
  }

  statusClass(status: string): string {
    return status === 'online'
      ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
      : 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400';
  }

  rxClass(v: number | null | undefined): string {
    if (v == null) return 'text-gray-400';
    if (v >= -20) return 'text-green-600 dark:text-green-400 font-semibold';
    if (v >= -27) return 'text-yellow-600 dark:text-yellow-400 font-semibold';
    return 'text-red-600 dark:text-red-400 font-semibold';
  }
}
