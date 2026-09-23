import { CommonModule } from '@angular/common';
import { Component, OnInit, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { AcsService } from '../../services/acs.service';
import { DialogService } from '../../services/dialog.service';
import { limpiarTextoWifi, problemaDeLaClaveWifi, problemaDelNombreWifi } from '../../common/wifi';

/**
 * Router del cliente: los equipos de la empresa que reportan al servidor
 * TR-069 (GenieACS), con su WiFi, lo conectado y las acciones remotas.
 *
 * Antes era una maqueta atada a un solo equipo que llamaba a GenieACS desde
 * el navegador; ahora todo pasa por el backend y se ve sólo lo de la empresa.
 */
@Component({
  selector: 'app-ont-device',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './ont-device.component.html',
  styleUrl: './ont-device.component.scss',
  host: { class: 'np-console' },
})
export class OntDeviceComponent implements OnInit {
  private acs = inject(AcsService);
  private dialog = inject(DialogService);
  private route = inject(ActivatedRoute);
  private router = inject(Router);

  estado: any = null;
  equipos: any[] = [];
  cargando = false;
  error = '';
  buscar = '';

  seleccionado: any = null;
  detalle: any = null;
  cargandoDetalle = false;
  errorDetalle = '';

  /** Resultado de la última acción, para decir si se hizo o quedó en cola. */
  aviso: { texto: string; tipo: 'ok' | 'warn' | 'danger' } | null = null;
  trabajando = '';

  claveVisible: Record<number, boolean> = {};

  /** Quita mientras escriben lo que el equipo no admite. */
  filtrarClave(valor: string) { if (this.editando) { this.editando.clave = limpiarTextoWifi(valor); } }

  filtrarSsid(valor: string) { if (this.editando) { this.editando.ssid = limpiarTextoWifi(valor, true).slice(0, 32); } }
  copiado = '';
  editando: { indice: number; ssid: string; clave: string } | null = null;
  verInactivos = false;

  ngOnInit() {
    this.cargar();
  }

  cargar() {
    this.cargando = true;
    this.error = '';
    this.acs.estado().subscribe({ next: r => this.estado = r?.error === 0 ? r.data : null });
    this.acs.equipos().subscribe({
      next: r => {
        this.cargando = false;
        if (r?.error !== 0) { this.error = r?.message || 'No se pudo leer el servidor TR-069.'; return; }
        this.equipos = r.data ?? [];
        this.abrirDesdeEnlace();
      },
      error: () => { this.cargando = false; this.error = 'No se pudo leer el servidor TR-069.'; },
    });
  }

  /** ?equipo=<id> o ?cliente=<userId> abren ese equipo. */
  private abrirDesdeEnlace() {
    const q = this.route.snapshot.queryParamMap;
    const id = q.get('equipo');
    const cliente = Number(q.get('cliente')) || 0;
    const e = this.equipos.find(x => (id && x.id === id) || (cliente && x.cliente?.user_id === cliente))
      ?? (this.seleccionado ? this.equipos.find(x => x.id === this.seleccionado.id) : null)
      ?? (window.innerWidth > 1100 ? this.equipos[0] : null);
    if (e) this.abrir(e);
  }

  get filtrados(): any[] {
    const t = this.buscar.trim().toLowerCase();
    if (!t) return this.equipos;
    return this.equipos.filter(e =>
      [e.cliente?.nombre, e.cliente?.documento, e.modelo, e.serial, e.ip_wan, e.fabricante, e.pppoe]
        .some(v => (v ?? '').toString().toLowerCase().includes(t)));
  }

  abrir(e: any) {
    this.seleccionado = e;
    this.detalle = null;
    this.errorDetalle = '';
    this.aviso = null;
    this.editando = null;
    this.claveVisible = {};
    this.cargandoDetalle = true;
    this.acs.detalle(e.id).subscribe({
      next: r => {
        if (this.seleccionado !== e) return;
        this.cargandoDetalle = false;
        if (r?.error !== 0) { this.errorDetalle = r?.message || 'No se pudo leer el equipo.'; return; }
        this.detalle = r.data;
      },
      error: () => { this.cargandoDetalle = false; this.errorDetalle = 'No se pudo leer el equipo.'; },
    });
  }

  cerrar() { this.seleccionado = null; this.detalle = null; }

  // ── Lectura ───────────────────────────────────────────────────────────────

  /** "hace 3 meses", "hace 5 min". */
  hace(fecha: string | null): string {
    if (!fecha) return 'nunca';
    const s = Math.max(0, (Date.now() - new Date(fecha).getTime()) / 1000);
    if (s < 90) return 'hace un momento';
    if (s < 3600) return `hace ${Math.round(s / 60)} min`;
    if (s < 86400) return `hace ${Math.round(s / 3600)} h`;
    if (s < 86400 * 45) return `hace ${Math.round(s / 86400)} días`;
    return `hace ${Math.round(s / (86400 * 30))} meses`;
  }

  duracion(seg: number | null): string {
    if (seg === null || seg === undefined) return '—';
    const d = Math.floor(seg / 86400), h = Math.floor((seg % 86400) / 3600), m = Math.floor((seg % 3600) / 60);
    return d ? `${d} d ${h} h` : h ? `${h} h ${m} min` : `${m} min`;
  }

  get redes(): any[] { return this.detalle?.wifi ?? []; }
  get conectados(): any[] { return (this.detalle?.equipos ?? []).filter((h: any) => h.activo); }
  get inactivos(): any[] { return (this.detalle?.equipos ?? []).filter((h: any) => !h.activo); }

  colorMarca(f: string): string {
    return ({ 'C-Data': '#0f7a4e', Huawei: '#c7000b', ZTE: '#0a4b9b', 'V-SOL': '#d2691e', FiberHome: '#e2231a', Nokia: '#124191' } as any)[f] ?? 'var(--accent)';
  }

  abrirFicha() {
    const c = this.detalle?.cliente ?? this.seleccionado?.cliente;
    if (!c) return;
    this.router.navigate(['/dashboard/usuario'], { queryParams: { q: c.documento, cliente: c.user_id, tab: 'servicios' } });
  }

  async copiar(texto: string, que: string) {
    try { await navigator.clipboard.writeText(texto); this.copiado = que; setTimeout(() => { if (this.copiado === que) this.copiado = ''; }, 1500); } catch { }
  }

  // ── Acciones ──────────────────────────────────────────────────────────────

  private resultado(r: any, hecho: string) {
    this.trabajando = '';
    if (r?.error !== 0) { this.aviso = { texto: r?.message || 'El servidor TR-069 no aceptó la orden.', tipo: 'danger' }; return; }
    this.aviso = r.data?.hecha
      ? { texto: `${hecho} ${r.data.mensaje}`, tipo: 'ok' }
      : { texto: `${hecho} ${r.data?.mensaje ?? ''}`, tipo: 'warn' };
  }

  pedirDatos() {
    const e = this.seleccionado;
    this.trabajando = 'datos';
    this.acs.refrescar(e.id).subscribe({
      next: r => { this.resultado(r, 'Pedido de datos enviado.'); if (r?.data?.hecha) this.abrir(e); },
      error: () => { this.trabajando = ''; this.aviso = { texto: 'No se pudo enviar el pedido.', tipo: 'danger' }; },
    });
  }

  async reiniciar() {
    const e = this.seleccionado;
    const ok = await this.dialog.confirm(
      `¿Reiniciar el equipo de ${e.cliente?.nombre || e.serial}? El cliente se queda sin internet un par de minutos.`,
      { okLabel: 'Reiniciar', danger: true },
    );
    if (!ok) return;
    this.trabajando = 'reinicio';
    this.acs.reiniciar(e.id).subscribe({
      next: r => this.resultado(r, 'Reinicio enviado.'),
      error: () => { this.trabajando = ''; this.aviso = { texto: 'No se pudo enviar el reinicio.', tipo: 'danger' }; },
    });
  }

  editar(r: any) {
    this.editando = { indice: r.indice, ssid: r.ssid ?? '', clave: '' };
  }

  async guardarWifi(r: any) {
    const ed = this.editando;
    if (!ed) return;
    const ssid = ed.ssid.trim() !== (r.ssid ?? '') ? ed.ssid.trim() : '';
    const clave = ed.clave;
    if (!ssid && !clave) { this.editando = null; return; }
    const problema = (clave ? problemaDeLaClaveWifi(clave) : null) ?? (ssid ? problemaDelNombreWifi(ssid) : null);

    if (problema) { this.aviso = { texto: problema, tipo: 'danger' }; return; }

    const ok = await this.dialog.confirm(
      `¿Cambiar ${[ssid && 'el nombre', clave && 'la contraseña'].filter(Boolean).join(' y ')} de la red «${r.ssid}»? `
      + 'Los equipos del cliente conectados a esa red se desconectan y hay que volver a conectarlos.',
      { okLabel: 'Cambiar WiFi' },
    );
    if (!ok) return;

    this.trabajando = 'wifi';
    this.acs.cambiarWifi(this.seleccionado.id, r.indice, ssid || null, clave || null).subscribe({
      next: res => { this.resultado(res, 'Cambio de WiFi enviado.'); if (res?.error === 0) this.editando = null; },
      error: () => { this.trabajando = ''; this.aviso = { texto: 'No se pudo enviar el cambio.', tipo: 'danger' }; },
    });
  }
}
