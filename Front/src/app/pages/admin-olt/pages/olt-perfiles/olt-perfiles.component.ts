import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { OltService } from '../../../../services/olt.service';
import { ToastService } from '../../../../services/toast.service';

@Component({
  selector: 'app-olt-perfiles',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './olt-perfiles.component.html',
})
export class OltPerfilesComponent implements OnInit {

  olts: any[]           = [];
  selectedOltId: number | null = null;
  loadingOlts           = false;

  lineProfiles: any[]   = [];
  srvProfiles: any[]    = [];
  loadingProfiles       = false;
  syncing               = false;
  lastSynced: string | null = null;

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
          this.loadProfiles();
        }
      },
      error: () => { this.loadingOlts = false; },
    });
  }

  onOltChange(): void {
    this.lineProfiles = [];
    this.srvProfiles  = [];
    if (this.selectedOltId) this.loadProfiles();
  }

  loadProfiles(): void {
    if (!this.selectedOltId) return;
    this.loadingProfiles = true;
    this.oltService.getProfiles(this.selectedOltId).subscribe({
      next: (res) => {
        this.loadingProfiles = false;
        this.lineProfiles = res.data?.line ?? [];
        this.srvProfiles  = res.data?.srv  ?? [];
        if (this.lineProfiles.length) {
          this.lastSynced = this.lineProfiles[0].synced_at ?? null;
        }
      },
      error: () => { this.loadingProfiles = false; },
    });
  }

  syncProfiles(): void {
    if (!this.selectedOltId) return;
    this.syncing = true;
    this.oltService.syncProfiles(this.selectedOltId).subscribe({
      next: (res) => {
        this.syncing = false;
        this.toast.success(res.message || 'Perfiles sincronizados');
        this.loadProfiles();
      },
      error: (err) => {
        this.syncing = false;
        this.toast.error(err?.error?.message || 'Error al sincronizar perfiles');
      },
    });
  }

  selectedOltName(): string {
    return this.olts.find(o => o.id === this.selectedOltId)?.name ?? '';
  }
}
