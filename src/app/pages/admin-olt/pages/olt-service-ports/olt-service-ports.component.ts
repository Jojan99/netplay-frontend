import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { OltNavComponent } from '../../shared/olt-nav.component';
import { FormsModule } from '@angular/forms';
import { OltService } from '../../../../services/olt.service';
import { ToastService } from '../../../../services/toast.service';

/**
 * Service ports de la OLT.
 *
 * Antes había que elegir una ONT a la vez, de modo que para saber cómo estaban
 * repartidas las VLAN o encontrar un service port duplicado había que ir
 * cliente por cliente. Ahora se listan todos los de la OLT, con búsqueda,
 * filtro por puerto y por VLAN, y un resumen de cuántos clientes hay en cada
 * VLAN.
 */
@Component({
  selector: 'app-olt-service-ports',
  standalone: true,
  imports: [CommonModule, FormsModule, OltNavComponent],
  templateUrl: './olt-service-ports.component.html',
  styleUrls: ['../../shared/olt.scss', '../../shared/olt-movil.scss'],
  host: { class: 'np-console' },
})
export class OltServicePortsComponent implements OnInit {

  olts: any[] = [];
  selectedOltId: number | null = null;
  loadingOlts = false;

  ports: any[] = [];
  loadingPorts = false;
  consultado: Date | null = null;

  busqueda   = '';
  filtroPon  = '';
  filtroVlan = '';

  page    = 1;
  perPage = 25;
  readonly perPageOptions = [25, 50, 100, 200];

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
          this.cargar();
        }
      },
      error: () => { this.loadingOlts = false; },
    });
  }

  onOltChange(): void {
    this.ports      = [];
    this.consultado = null;
    this.filtroPon  = '';
    this.filtroVlan = '';
    this.page       = 1;
    if (this.selectedOltId) this.cargar();
  }

  /** Sin ONT el backend devuelve los service ports de toda la OLT. */
  cargar(): void {
    if (!this.selectedOltId) return;

    this.loadingPorts = true;

    this.oltService.getServicePorts(this.selectedOltId).subscribe({
      next: (res) => {
        this.loadingPorts = false;
        this.ports        = res.data ?? [];
        this.consultado   = new Date();

        if (!this.ports.length) this.toast.error(res?.message || 'La OLT no devolvió service ports');
      },
      error: (err) => {
        this.loadingPorts = false;
        this.toast.error(err?.error?.message || 'Error al cargar service ports');
      },
    });
  }

  // ── Filtros ─────────────────────────────────────────────────────────────

  get puertosPon(): string[] {
    return [...new Set(this.ports.map(p => p.fsp).filter(Boolean))].sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
  }

  get vlans(): number[] {
    return [...new Set(this.ports.map(p => p.vlan).filter((v: any) => v != null))].sort((a: number, b: number) => a - b);
  }

  get filtrados(): any[] {
    let lista = this.ports;

    if (this.filtroPon)  lista = lista.filter(p => p.fsp === this.filtroPon);
    if (this.filtroVlan) lista = lista.filter(p => String(p.vlan) === this.filtroVlan);

    const t = this.busqueda.trim().toLowerCase();

    if (t) {
      lista = lista.filter(p =>
        String(p.index ?? '').includes(t) ||
        String(p.vlan ?? '').includes(t) ||
        String(p.ont_id ?? '').includes(t) ||
        (p.fsp ?? '').toLowerCase().includes(t) ||
        (p.port ?? '').toLowerCase().includes(t));
    }

    return lista;
  }

  get pagina(): any[] {
    const desde = (this.page - 1) * this.perPage;
    return this.filtrados.slice(desde, desde + this.perPage);
  }

  get totalPaginas(): number { return Math.max(1, Math.ceil(this.filtrados.length / this.perPage)); }

  get numerosDePagina(): number[] {
    const rango: number[] = [];
    for (let i = Math.max(1, this.page - 2); i <= Math.min(this.totalPaginas, this.page + 2); i++) rango.push(i);
    return rango;
  }

  reiniciarPagina(): void { this.page = 1; }
  paginaAnterior(): void  { if (this.page > 1) this.page--; }
  paginaSiguiente(): void { if (this.page < this.totalPaginas) this.page++; }
  irA(p: number): void    { this.page = p; }
  menor(a: number, b: number): number { return Math.min(a, b); }

  // ── Resumen ─────────────────────────────────────────────────────────────

  /** Cuántos service ports hay en cada VLAN: así se ve el reparto real. */
  get porVlan(): { vlan: number; total: number }[] {
    const conteo: Record<number, number> = {};

    for (const p of this.ports) {
      if (p.vlan == null) continue;
      conteo[p.vlan] = (conteo[p.vlan] ?? 0) + 1;
    }

    return Object.entries(conteo)
      .map(([vlan, total]) => ({ vlan: +vlan, total }))
      .sort((a, b) => b.total - a.total);
  }

  /**
   * Índices repetidos. Un service port usado dos veces es un conflicto real:
   * la OLT deja crear el segundo y el tráfico de un cliente se va por el otro.
   */
  get repetidos(): number[] {
    const vistos: Record<number, number> = {};

    for (const p of this.ports) {
      const i = p.index ?? p.sp_index;
      if (i == null) continue;
      vistos[i] = (vistos[i] ?? 0) + 1;
    }

    return Object.entries(vistos).filter(([, n]) => n > 1).map(([i]) => +i);
  }

  esRepetido(sp: any): boolean {
    const i = sp.index ?? sp.sp_index;
    return i != null && this.repetidos.includes(i);
  }

  filtrarVlan(vlan: number): void {
    this.filtroVlan = String(vlan);
    this.reiniciarPagina();
  }

  selectedOltName(): string {
    return this.olts.find(o => o.id === this.selectedOltId)?.name ?? '';
  }
}
