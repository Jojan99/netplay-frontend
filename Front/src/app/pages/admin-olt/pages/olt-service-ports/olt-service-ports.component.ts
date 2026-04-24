import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { OltService } from '../../../../services/olt.service';
import { ToastService } from '../../../../services/toast.service';

@Component({
  selector: 'app-olt-service-ports',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './olt-service-ports.component.html',
})
export class OltServicePortsComponent implements OnInit {

  olts: any[]           = [];
  selectedOltId: number | null = null;
  loadingOlts           = false;

  onts: any[]           = [];
  loadingOnts           = false;
  selectedOnt: any      = null;

  ports: any[]          = [];
  loadingPorts          = false;

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
    this.selectedOnt = null;
    this.ports = [];
    if (this.selectedOltId) this.loadOnts();
  }

  loadOnts(): void {
    if (!this.selectedOltId) return;
    this.loadingOnts = true;
    this.oltService.getAuthorizedONTs(this.selectedOltId).subscribe({
      next: (res) => {
        this.loadingOnts = false;
        this.onts = res.data ?? [];
      },
      error: () => { this.loadingOnts = false; },
    });
  }

  onOntChange(): void {
    this.ports = [];
    if (this.selectedOnt) this.loadPorts();
  }

  loadPorts(): void {
    if (!this.selectedOltId || !this.selectedOnt) return;
    this.loadingPorts = true;
    this.oltService.getServicePorts(this.selectedOltId, this.selectedOnt.fsp, this.selectedOnt.ont_id).subscribe({
      next: (res) => {
        this.loadingPorts = false;
        this.ports = res.data ?? [];
      },
      error: (err) => {
        this.loadingPorts = false;
        this.toast.error(err?.error?.message || 'Error al cargar service-ports');
      },
    });
  }

  get ontLabel(): string {
    if (!this.selectedOnt) return '';
    return `${this.selectedOnt.fsp} · ${this.selectedOnt.description || this.selectedOnt.serial || 'ONT ' + this.selectedOnt.ont_id}`;
  }

  selectedOltName(): string {
    return this.olts.find(o => o.id === this.selectedOltId)?.name ?? '';
  }
}
