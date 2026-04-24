import { Component, HostListener, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { OltService } from '../../../../services/olt.service';
import { MikrotikService } from '../../../../services/mikrotik.service';
import { ToastService } from '../../../../services/toast.service';

@Component({
  selector: 'app-olt-sin-autorizar',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './olt-sin-autorizar.component.html',
})
export class OltSinAutorizarComponent implements OnInit {

  // OLT selector
  olts: any[]          = [];
  selectedOltId: number | null = null;
  loadingOlts          = false;

  // ONT list
  onts: any[]          = [];
  loadingOnts          = false;
  lastFetched: Date | null = null;
  page                 = 1;
  perPage              = 15;
  perPageOptions       = [15, 25, 50];

  // Profiles (OLT)
  lineProfiles: any[]  = [];
  srvProfiles: any[]   = [];
  loadingProfiles      = false;
  defaultVlan: number | null = null;

  // MikroTik LAN segments (VLANs)
  lanSegments: any[]   = [];
  loadingSegments      = false;
  selectedSegment: any = null;   // el segmento seleccionado
  availableIps: any[]  = [];
  loadingIps           = false;

  // Register modal
  modal                = false;
  registering          = false;
  selectedOnt: any     = null;
  form = {
    fsp: '',
    serial: '',
    description: '',
    line_profile_id: null as number | null,
    srv_profile_id:  null as number | null,
    vlan: null as number | null,
  };

  constructor(
    private oltService: OltService,
    private mikrotikService: MikrotikService,
    private toast: ToastService,
  ) {}

  ngOnInit(): void {
    this.loadOlts();
    this.loadLanSegments();
  }

  @HostListener('document:keydown.escape')
  onEsc(): void { this.modal = false; }

  // ── OLT + Profiles ─────────────────────────────────────────────────────

  loadOlts(): void {
    this.loadingOlts = true;
    this.oltService.listOlts().subscribe({
      next: (res) => {
        this.loadingOlts = false;
        this.olts = res.data ?? [];
        if (this.olts.length === 1) {
          this.selectedOltId = this.olts[0].id;
          this.defaultVlan   = this.olts[0].default_vlan ?? null;
          this.loadUnauth();
          this.loadProfiles();
        }
      },
      error: () => { this.loadingOlts = false; },
    });
  }

  onOltChange(): void {
    this.onts = [];
    this.page = 1;
    this.lineProfiles = [];
    this.srvProfiles  = [];
    const olt = this.olts.find(o => o.id === this.selectedOltId);
    this.defaultVlan = olt?.default_vlan ?? null;
    if (this.selectedOltId) {
      this.loadUnauth();
      this.loadProfiles();
    }
  }

  loadUnauth(): void {
    if (!this.selectedOltId) return;
    this.loadingOnts = true;
    this.oltService.getUnauthONTs(this.selectedOltId).subscribe({
      next: (res) => {
        this.loadingOnts = false;
        this.onts        = res.data ?? [];
        this.lastFetched = new Date();
      },
      error: (err) => {
        this.loadingOnts = false;
        this.toast.error(err?.error?.message || 'Error al obtener ONTs sin autorizar');
      },
    });
  }

  loadProfiles(): void {
    if (!this.selectedOltId) return;
    this.loadingProfiles = true;
    this.oltService.getProfiles(this.selectedOltId).subscribe({
      next: (res) => {
        this.loadingProfiles = false;
        this.lineProfiles = res.data?.line ?? [];
        this.srvProfiles  = res.data?.srv  ?? [];
      },
      error: () => { this.loadingProfiles = false; },
    });
  }

  // ── MikroTik VLANs ─────────────────────────────────────────────────────

  loadLanSegments(): void {
    this.loadingSegments = true;
    this.mikrotikService.getLanSegments().subscribe({
      next: (res) => {
        this.loadingSegments = false;
        this.lanSegments = res.data ?? [];
      },
      error: () => {
        this.loadingSegments = false;
        // No es un error crítico, puede que no haya MikroTik configurado
      },
    });
  }

  onSegmentChange(): void {
    this.availableIps = [];
    this.form.vlan    = null;

    if (!this.selectedSegment) return;

    // Extraer número de VLAN del nombre de interfaz: "vlan100" → 100
    const match = String(this.selectedSegment.names).match(/\d+/);
    this.form.vlan = match ? parseInt(match[0], 10) : null;

    // Cargar IPs disponibles en esa VLAN
    this.loadingIps = true;
    this.mikrotikService.getIpAvalibles(this.selectedSegment.names).subscribe({
      next: (res) => {
        this.loadingIps = false;
        this.availableIps = res.data?.ips ?? [];
      },
      error: () => { this.loadingIps = false; },
    });
  }

  segmentLabel(seg: any): string {
    return `${seg.names}  —  ${seg.network}  (gw: ${seg.gateway})`;
  }

  // ── Pagination ─────────────────────────────────────────────────────────

  get pagedOnts(): any[] {
    const start = (this.page - 1) * this.perPage;
    return this.onts.slice(start, start + this.perPage);
  }

  get totalPages(): number { return Math.max(1, Math.ceil(this.onts.length / this.perPage)); }

  get pageNumbers(): number[] {
    const delta = 2;
    const range: number[] = [];
    for (let i = Math.max(1, this.page - delta); i <= Math.min(this.totalPages, this.page + delta); i++) range.push(i);
    return range;
  }

  prevPage(): void { if (this.page > 1) this.page--; }
  nextPage(): void { if (this.page < this.totalPages) this.page++; }
  goPage(p: number): void { this.page = p; }
  changePerPage(): void { this.page = 1; }
  minVal(a: number, b: number): number { return Math.min(a, b); }

  // ── Register ───────────────────────────────────────────────────────────

  openRegister(ont: any): void {
    this.selectedOnt     = ont;
    this.selectedSegment = null;
    this.availableIps    = [];
    const olt = this.olts.find(o => o.id === this.selectedOltId);
    this.form = {
      fsp:             ont.fsp    ?? '',
      serial:          ont.serial ?? '',
      description:     '',
      line_profile_id: olt?.ont_lineprofile_id ?? (this.lineProfiles[0]?.profile_id ?? null),
      srv_profile_id:  olt?.ont_srvprofile_id  ?? (this.srvProfiles[0]?.profile_id  ?? null),
      vlan:            this.defaultVlan,
    };
    this.modal = true;
  }

  confirmRegister(): void {
    if (!this.selectedOltId || !this.form.fsp) return;
    this.registering = true;
    this.oltService.registerONT(this.selectedOltId, {
      fsp:             this.form.fsp,
      serial:          this.form.serial      || undefined,
      description:     this.form.description || undefined,
      line_profile_id: this.form.line_profile_id,
      srv_profile_id:  this.form.srv_profile_id,
      vlan:            this.form.vlan,
    }).subscribe({
      next: (res) => {
        this.registering = false;
        this.modal       = false;
        this.toast.success(res.message || 'ONT autorizada correctamente');
        this.loadUnauth();
      },
      error: (err) => {
        this.registering = false;
        this.toast.error(err?.error?.message || 'Error al autorizar la ONT');
      },
    });
  }

  selectedOltName(): string {
    return this.olts.find(o => o.id === this.selectedOltId)?.name ?? '';
  }
}
