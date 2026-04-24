import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { OltService } from '../../../../services/olt.service';
import { ToastService } from '../../../../services/toast.service';

@Component({
  selector: 'app-olt-online',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './olt-online.component.html',
})
export class OltOnlineComponent implements OnInit {

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

  // Detail modal
  detailModal           = false;
  detailOnt: any        = null;
  detailPorts: any[]    = [];
  detailInfo: any       = null;
  loadingDetail         = false;

  constructor(
    private oltService: OltService,
    private toast: ToastService,
  ) {}

  ngOnInit(): void { this.loadOlts(); }

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

  loadOnts(): void {
    if (!this.selectedOltId) return;
    this.loadingOnts = true;
    this.oltService.getAuthorizedONTs(this.selectedOltId).subscribe({
      next: (res) => {
        this.loadingOnts = false;
        this.onts        = (res.data ?? []).filter((o: any) => o.status === 'online');
        this.lastFetched = new Date();
      },
      error: (err) => {
        this.loadingOnts = false;
        this.toast.error(err?.error?.message || 'Error al cargar ONTs');
      },
    });
  }

  // ── Detail: service-ports + señal óptica ─────────────────────────────────
  openDetail(ont: any): void {
    this.detailOnt   = ont;
    this.detailPorts = [];
    this.detailInfo  = null;
    this.detailModal = true;
    this.loadingDetail = true;

    let pending = 2;
    const done = () => { pending--; if (pending === 0) this.loadingDetail = false; };

    this.oltService.getServicePorts(this.selectedOltId!, ont.fsp, ont.ont_id).subscribe({
      next: (res) => { this.detailPorts = res.data ?? []; done(); },
      error: () => done(),
    });

    this.oltService.getOntInfo(this.selectedOltId!, ont.fsp, ont.ont_id).subscribe({
      next: (res) => { this.detailInfo = res.data ?? null; done(); },
      error: () => done(),
    });
  }

  get uniquePorts(): string[] {
    return [...new Set(this.onts.map((o: any) => o.fsp).filter(Boolean))].sort();
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

  rxClass(v: number | null | undefined): string {
    if (v == null) return 'text-gray-400';
    if (v >= -20) return 'text-green-600 dark:text-green-400 font-semibold';
    if (v >= -27) return 'text-yellow-600 dark:text-yellow-400 font-semibold';
    return 'text-red-600 dark:text-red-400 font-semibold';
  }

  selectedOltName(): string {
    return this.olts.find(o => o.id === this.selectedOltId)?.name ?? '';
  }
}
