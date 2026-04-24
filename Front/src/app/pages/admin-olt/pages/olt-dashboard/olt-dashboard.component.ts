import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { OltService } from '../../../../services/olt.service';
import { ToastService } from '../../../../services/toast.service';

@Component({
  selector: 'app-olt-dashboard',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './olt-dashboard.component.html',
})
export class OltDashboardComponent implements OnInit {

  olts: any[]           = [];
  selectedOltId: number | null = null;
  loadingOlts           = false;

  onts: any[]           = [];
  loadingOnts           = false;
  lastFetched: Date | null = null;

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
    if (this.selectedOltId) this.loadOnts();
  }

  loadOnts(): void {
    if (!this.selectedOltId) return;
    this.loadingOnts = true;
    this.oltService.getAuthorizedONTs(this.selectedOltId).subscribe({
      next: (res) => {
        this.loadingOnts = false;
        this.onts        = res.data ?? [];
        this.lastFetched = new Date();
      },
      error: (err) => {
        this.loadingOnts = false;
        this.toast.error(err?.error?.message || 'Error al cargar ONTs');
      },
    });
  }

  get totalOnts(): number    { return this.onts.length; }
  get onlineCount(): number  { return this.onts.filter(o => o.status === 'online').length; }
  get offlineCount(): number { return this.onts.filter(o => o.status === 'offline' || o.status !== 'online').length; }
  get onlinePct(): number    { return this.totalOnts ? Math.round(this.onlineCount / this.totalOnts * 100) : 0; }

  get byPort(): { fsp: string; total: number; online: number }[] {
    const map: Record<string, { total: number; online: number }> = {};
    for (const o of this.onts) {
      const port = (o.fsp ?? '').split('/').slice(0, 3).join('/');
      if (!map[port]) map[port] = { total: 0, online: 0 };
      map[port].total++;
      if (o.status === 'online') map[port].online++;
    }
    return Object.entries(map)
      .map(([fsp, v]) => ({ fsp, ...v }))
      .sort((a, b) => a.fsp.localeCompare(b.fsp));
  }

  selectedOltName(): string {
    return this.olts.find(o => o.id === this.selectedOltId)?.name ?? '';
  }
}
