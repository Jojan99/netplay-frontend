import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { UserService } from '../../services/user.service';
import { NpSelectComponent, PresentacionSelect } from '../../common/np-select/np-select.component';
import {
  OpcionesDeIps, PRESENTACION_IPS_ASIGNABLES, PRESENTACION_REDES, PRESENTACION_SEGMENTOS, agruparRedesPorInterfaz,
} from '../../common/np-select/presentaciones';

/** Lo que dijo el servidor de la IP que tenía antes de eliminarlo. */
interface RevisionIp {
  tipo: 'static' | 'pppoe';
  ip: string | null;
  router_id: number | null;
  libre: boolean;
  motivo: string | null;
  interfaz: string | null;
  router_revisado: boolean;
}

interface ClienteEliminado {
  id: number;
  alias: string;
  names: string;
  lastname: string;
  dni: string;
  phone: string;
  email: string;
  address: string;
  connection_type: 'static' | 'pppoe' | null;
  pppoe_user: string | null;
  router_id: number | null;
  plan_name: string | null;
  router_name: string | null;
  ip: string;
  eliminado_en: string | null;
  eliminado_registrado_en: string | null;
  eliminado_por: string | null;
  ip_ocupada: number;
}

/**
 * Clientes eliminados de la empresa y su reinstalación.
 *
 * Eliminar un cliente no borra su ficha: la deja inactiva y le quita el
 * servicio. Cuando el cliente vuelve a pedir el servicio, desde aquí se lo
 * devuelve al registro sin volver a cargar todos sus datos.
 */
@Component({
  selector: 'app-clientes-eliminados',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink, NpSelectComponent],
  templateUrl: './clientes-eliminados.component.html',
  styleUrl: './clientes-eliminados.component.scss',
  host: { class: 'np-console' },
})
export class ClientesEliminadosComponent implements OnInit {
  private userSvc = inject(UserService);

  clientes: ClienteEliminado[] = [];
  cargando = false;
  search   = '';

  page      = 1;
  perPage   = 12;
  total     = 0;
  lastPage  = 1;
  /** Precalculado: un getter que arma el arreglo en cada ciclo no deja respirar a la vista. */
  pageNumbers: number[] = [];

  // Reinstalación
  showModal = false;
  elegido: ClienteEliminado | null = null;
  reinstalando = false;
  /** Lo que el servidor avisó de la última reinstalación. */
  avisos: string[] = [];
  mensaje = '';
  mensajeTipo: 'ok' | 'error' = 'ok';

  // IP al reinstalar: mantener la de antes (si sigue libre) o darle otra.
  revisandoIp = false;
  revision: RevisionIp | null = null;
  ipAccion: 'mantener' | 'cambiar' | 'ninguna' = 'mantener';
  vlanes: any[] = [];
  cargandoVlanes = false;
  vlan: any = null;
  redesVlan: any[] = [];
  segmento: any = null;
  ipsLibres: any[] = [];
  cargandoIps = false;
  ipNueva = '';
  /** Lo que el servidor rechazó, dentro de la ventana (la de la página queda tapada). */
  errorModal = '';

  readonly presRedes = PRESENTACION_REDES;
  readonly presIps = PRESENTACION_IPS_ASIGNABLES;
  readonly opcionesIp = new OpcionesDeIps();
  readonly presSegmentos: PresentacionSelect = {
    ...PRESENTACION_SEGMENTOS,
    detalle: s => [s?.gateway ? `Puerta de enlace ${s.gateway}` : null, s?.sin_cliente ? `${s.sin_cliente} en el router sin cliente` : null]
      .filter(Boolean).join(' · ') || null,
  };

  private buscarTimer: any = null;

  trackCliente = (_: number, c: ClienteEliminado) => c.id;

  ngOnInit(): void { this.cargar(); }

  cargar(): void {
    this.cargando = true;

    this.userSvc.clientesEliminados({ page: this.page, per_page: this.perPage, q: this.search.trim() }).subscribe({
      next: (res) => {
        this.cargando  = false;
        const d        = res?.data ?? {};
        this.clientes  = d.items ?? [];
        this.total     = d.total ?? 0;
        this.page      = d.page ?? 1;
        this.lastPage  = d.last_page ?? 1;
        this.pageNumbers = Array.from({ length: this.lastPage }, (_, i) => i + 1)
          .filter(p => p === 1 || p === this.lastPage || Math.abs(p - this.page) <= 2);
      },
      error: () => {
        this.cargando = false;
        this.clientes = [];
        this.aviso('No se pudo cargar la lista de clientes eliminados.', 'error');
      },
    });
  }

  onBuscar(): void {
    clearTimeout(this.buscarTimer);
    this.buscarTimer = setTimeout(() => { this.page = 1; this.cargar(); }, 350);
  }

  irA(p: number): void { if (p !== this.page) { this.page = p; this.cargar(); } }
  anterior(): void { if (this.page > 1) this.irA(this.page - 1); }
  siguiente(): void { if (this.page < this.lastPage) this.irA(this.page + 1); }

  // ── Reinstalar ─────────────────────────────────────────────────────────────

  abrirReinstalar(c: ClienteEliminado): void {
    this.elegido   = c;
    this.showModal = true;
    this.revision  = null;
    this.ipAccion  = 'mantener';
    this.vlan = null; this.redesVlan = []; this.segmento = null; this.ipsLibres = []; this.ipNueva = '';
    this.errorModal = '';

    // Con PPPoE la IP la da el pool: no hay nada que elegir.
    if (c.connection_type === 'pppoe') return;

    this.revisandoIp = true;
    this.userSvc.revisarIpReinstalar(c.id).subscribe({
      next: (res) => {
        this.revisandoIp = false;
        if (this.elegido?.id !== c.id) return;
        this.revision = res?.data ?? null;
        // Si la de antes no se puede, lo único que queda es darle otra.
        if (!this.revision?.ip || !this.revision.libre) this.elegirAccion('cambiar');
      },
      error: () => {
        this.revisandoIp = false;
        this.revision = null;
        this.elegirAccion('cambiar');
      },
    });
  }

  cerrar(): void { this.showModal = false; this.elegido = null; }

  elegirAccion(a: 'mantener' | 'cambiar' | 'ninguna'): void {
    this.ipAccion = a;
    if (a === 'cambiar' && !this.vlanes.length && !this.cargandoVlanes) this.cargarVlanes();
  }

  private cargarVlanes(): void {
    const router = this.revision?.router_id ?? this.elegido?.router_id ?? null;
    this.cargandoVlanes = true;
    this.userSvc.getneighborhoodAll(router).subscribe({
      next: (r) => {
        this.cargandoVlanes = false;
        this.vlanes = r?.error === 0 && r.data ? agruparRedesPorInterfaz(Object.values(r.data)) : [];
      },
      error: () => { this.cargandoVlanes = false; this.vlanes = []; },
    });
  }

  onVlan(v: any): void {
    this.vlan = v; this.redesVlan = []; this.segmento = null; this.ipsLibres = []; this.ipNueva = '';
    if (v) this.cargarIps(null);
  }

  onSegmento(seg: any): void {
    this.segmento = seg; this.ipsLibres = []; this.ipNueva = '';
    if (seg && this.vlan) this.cargarIps(seg.network);
  }

  private cargarIps(segmento: string | null): void {
    const vlan = this.vlan;
    const router = this.revision?.router_id ?? this.elegido?.router_id ?? null;
    this.cargandoIps = true;

    this.userSvc.getIpzonebyZone(vlan.names, segmento, router, null).subscribe({
      next: (r) => {
        this.cargandoIps = false;
        if (this.vlan !== vlan) return;   // se eligió otra VLAN mientras tanto
        this.ipsLibres = r?.error === 0 && r.data?.ips
          ? this.opcionesIp.recordar(r.data.ips.map((e: any) => ({ id: e.ip, names: e.ip })), r.data.ocupadas) : [];
        const redes: any[] = r?.data?.redes ?? [];
        this.redesVlan = redes.length > 1 ? redes.map(x => ({ ...x, names: vlan.names, vlan_id: vlan.vlan_id })) : [];
        this.segmento = this.redesVlan.find(x => x.elegida) ?? this.segmento;
      },
      error: () => { this.cargandoIps = false; this.ipsLibres = []; },
    });
  }

  /** Sin IP elegida no se deja reinstalar con "darle otra". */
  get faltaIp(): boolean {
    return !!this.elegido && this.elegido.connection_type !== 'pppoe' && this.ipAccion === 'cambiar' && (!this.ipNueva || !this.vlan);
  }

  confirmarReinstalar(): void {
    if (!this.elegido || this.reinstalando || this.revisandoIp || this.faltaIp) return;
    this.reinstalando = true;
    this.errorModal = '';

    const ip = this.elegido.connection_type === 'pppoe' ? undefined
      : this.ipAccion === 'cambiar' ? { ip_accion: 'cambiar' as const, ip: this.ipNueva, interfaz: this.vlan?.names }
      : { ip_accion: this.ipAccion };

    this.userSvc.reinstalarCliente(this.elegido.id, ip).subscribe({
      next: (res) => {
        this.reinstalando = false;

        // La IP elegida ya no se puede (otro la tomó mientras tanto): se queda
        // en la ventana para elegir otra.
        if (res?.error === 1) {
          this.errorModal = res?.message ?? 'No se pudo reinstalar al cliente.';
          return;
        }

        this.showModal    = false;
        this.elegido      = null;
        this.avisos       = res?.data?.avisos ?? [];
        this.aviso(res?.message ?? 'Cliente reinstalado.', res?.error ? 'error' : 'ok');
        this.cargar();
      },
      error: (err) => {
        this.reinstalando = false;
        this.showModal    = false;
        this.aviso(err?.error?.message ?? 'No se pudo reinstalar al cliente.', 'error');
      },
    });
  }

  private aviso(texto: string, tipo: 'ok' | 'error'): void {
    this.mensaje     = texto;
    this.mensajeTipo = tipo;
  }

  cerrarAviso(): void { this.mensaje = ''; this.avisos = []; }
}
