import { CommonModule } from '@angular/common';
import { Component, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { ClientApiService } from '../services/client-api.service';
import { NpSelectComponent } from '../../common/np-select/np-select.component';
import { OpcionSimple, PRESENTACION_SIMPLE } from '../../common/np-select/presentaciones';
import { limpiarTextoWifi, problemaDeLaClaveWifi } from '../../common/wifi';

/** En 2.4 GHz sólo estos tres canales no se superponen entre sí. */
const CANALES_SIN_SUPERPOSICION = [1, 6, 11];

/**
 * "Mi WiFi": el cliente ve y cambia lo suyo sin llamar al soporte.
 *
 * La pantalla sólo existe si su equipo reporta al sistema; si no, se explica
 * en una línea y no se ofrece nada que no se pueda hacer.
 */
@Component({
  selector: 'app-portal-network',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink, NpSelectComponent],
  templateUrl: './portal-network.component.html',
  styleUrl: './portal-network.component.scss',
})
export class PortalNetworkComponent implements OnInit {
  private api = inject(ClientApiService);

  panel   = signal<any>(null);
  loading = signal(true);
  error   = signal('');
  aviso   = signal<{ texto: string; tipo: 'ok' | 'warn' | 'danger' } | null>(null);
  trabajando = signal('');

  claveVisible: Record<number, boolean> = {};
  editando: { indice: number; nombre: string; clave: string; todas: boolean } | null = null;
  verInactivos = false;

  ngOnInit() { this.cargar(); this.cargarConsumo(); }

  // ── Consumo y velocidad ───────────────────────────────────────────────────
  // No dependen de que el equipo reporte al TR-069: la velocidad se mide en
  // la red de la empresa y el consumo aparece cuando hay lecturas.

  consumo = signal<any>(null);
  velocidad = signal<any>(null);
  midiendo = signal(false);
  errorVelocidad = signal('');

  cargarConsumo() {
    this.api.getConsumo().subscribe({
      next: (r: any) => { if (r?.error === 0) this.consumo.set(r.data); },
      error: () => this.consumo.set(null),
    });
  }

  medirVelocidad() {
    this.midiendo.set(true);
    this.errorVelocidad.set('');
    this.api.medirVelocidad().subscribe({
      next: (r: any) => {
        this.midiendo.set(false);
        if (r?.error !== 0) { this.errorVelocidad.set(r?.message || 'No pudimos medir su conexión ahora.'); return; }
        this.velocidad.set(r.data);
      },
      error: (e: any) => {
        this.midiendo.set(false);
        this.errorVelocidad.set(e?.error?.message || 'No pudimos medir su conexión ahora. Intenta en un momento.');
      },
    });
  }

  get diasConsumo(): any[] { return this.consumo()?.dias ?? []; }
  get hayConsumo(): boolean { return this.diasConsumo.some(d => d.bajada + d.subida > 0); }
  private get picoConsumo(): number { return Math.max(1, ...this.diasConsumo.map(d => d.bajada + d.subida)); }

  altoDia(d: any): number { return Math.round((d.bajada + d.subida) / this.picoConsumo * 100); }

  /** Qué parte de la velocidad del plan se está usando (para la barra). */
  pctDelPlan(mbps: number | null | undefined, plan: number | null | undefined): number {
    return mbps && plan ? Math.min(100, Math.round(mbps / plan * 100)) : 0;
  }

  /** "2026-09-14" → "14 sept" */
  fechaCorta(f: string): string {
    return new Date(f + 'T12:00:00').toLocaleDateString('es-CO', { day: 'numeric', month: 'short' });
  }

  tituloDia(d: any): string {
    return `${this.fechaCorta(d.fecha)}: ${this.datos(d.bajada)} descargado, ${this.datos(d.subida)} subido`;
  }

  cargar(silencioso = false) {
    if (!silencioso) this.loading.set(true);
    this.api.getRouter().subscribe({
      next: (r: any) => {
        this.loading.set(false);
        if (r?.error !== 0) { this.error.set(r?.message || 'No pudimos consultar su equipo.'); return; }
        this.error.set('');
        this.panel.set(r.data);
      },
      error: () => { this.loading.set(false); this.error.set('No pudimos consultar su equipo.'); },
    });
  }

  // ── Lectura ───────────────────────────────────────────────────────────────

  get redes(): any[] { return this.panel()?.redes ?? []; }
  get conectados(): any[] { return (this.panel()?.dispositivos ?? []).filter((d: any) => d.conectado && !d.bloqueado); }
  get inactivos(): any[] { return (this.panel()?.dispositivos ?? []).filter((d: any) => !d.conectado && !d.bloqueado); }
  get bloqueados(): any[] { return (this.panel()?.dispositivos ?? []).filter((d: any) => d.bloqueado); }

  porWifi(lista: any[]) { return lista.filter(d => d.conexion === 'wifi').length; }
  porCable(lista: any[]) { return lista.filter(d => d.conexion === 'cable').length; }

  /** 671303620 → "640 MB" */
  datos(bytes: number | null): string {
    if (bytes === null || bytes === undefined) return '—';
    const u = ['B', 'KB', 'MB', 'GB', 'TB'];
    let v = bytes, i = 0;
    while (v >= 1024 && i < u.length - 1) { v /= 1024; i++; }
    return `${v.toFixed(v >= 100 || i < 2 ? 0 : 1)} ${u[i]}`;
  }

  duracion(seg: number | null): string {
    if (!seg) return '—';
    const d = Math.floor(seg / 86400), h = Math.floor((seg % 86400) / 3600), m = Math.floor((seg % 3600) / 60);
    return d ? `${d} día${d > 1 ? 's' : ''}` : h ? `${h} h ${m} min` : `${m} min`;
  }

  hace(fecha: string | null): string {
    if (!fecha) return 'nunca';
    const s = Math.max(0, (Date.now() - new Date(fecha).getTime()) / 1000);
    if (s < 120) return 'hace un momento';
    if (s < 3600) return `hace ${Math.round(s / 60)} min`;
    if (s < 86400) return `hace ${Math.round(s / 3600)} h`;
    return `hace ${Math.round(s / 86400)} días`;
  }

  // ── Acciones ──────────────────────────────────────────────────────────────

  /**
   * Redes encendidas cuya contraseña se puede cambiar: con más de una, se
   * ofrece usar la misma en todas. Sólo cuentan las que el equipo confirmó
   * encendidas; las secundarias de estado desconocido no reciben la clave.
   */
  get redesConClave(): number { return (this.redes ?? []).filter((r: any) => r.puede_cambiar_clave && r.confirmada).length; }

  /** Quita mientras escriben lo que el equipo no admite. */
  filtrarClave(valor: string) { if (this.editando) { this.editando.clave = limpiarTextoWifi(valor); } }

  editar(r: any) { this.editando = { indice: r.indice, nombre: r.nombre ?? '', clave: '', todas: true }; this.aviso.set(null); }

  /** Sólo la contraseña: el nombre de la red lo define la empresa. */
  guardar(r: any) {
    const ed = this.editando;
    if (!ed) return;
    const clave = ed.clave.trim();

    const problema = problemaDeLaClaveWifi(clave);

    if (problema) { this.aviso.set({ texto: problema, tipo: 'danger' }); return; }

    this.trabajando.set('wifi');
    this.api.cambiarWifiCliente(r.indice, null, clave, ed.todas && this.redesConClave > 1).subscribe({
      next: (res: any) => {
        this.trabajando.set('');
        if (res?.error !== 0) { this.aviso.set({ texto: res?.message || 'No se pudo guardar.', tipo: 'danger' }); return; }
        this.aviso.set({ texto: res.data?.mensaje ?? 'Guardado.', tipo: res.data?.hecha ? 'ok' : 'warn' });
        this.editando = null;
        setTimeout(() => this.cargar(true), 4000);
      },
      error: () => { this.trabajando.set(''); this.aviso.set({ texto: 'No se pudo guardar.', tipo: 'danger' }); },
    });
  }

  bloquear(d: any) {
    this.trabajando.set(d.mac);
    this.api.bloquearEquipo(d.mac).subscribe({
      next: (r: any) => this.terminar(r, d),
      error: () => { this.trabajando.set(''); this.aviso.set({ texto: 'No se pudo bloquear.', tipo: 'danger' }); },
    });
  }

  desbloquear(d: any) {
    this.trabajando.set(d.mac);
    this.api.desbloquearEquipo(d.mac).subscribe({
      next: (r: any) => this.terminar(r, d),
      error: () => { this.trabajando.set(''); this.aviso.set({ texto: 'No se pudo desbloquear.', tipo: 'danger' }); },
    });
  }

  private terminar(r: any, d: any) {
    this.trabajando.set('');
    if (r?.error !== 0) { this.aviso.set({ texto: r?.message || 'No se pudo hacer el cambio.', tipo: 'danger' }); return; }
    this.aviso.set({ texto: `${d.nombre}: ${r.data?.mensaje ?? 'listo'}`, tipo: r.data?.ok === false ? 'warn' : 'ok' });
    setTimeout(() => this.cargar(true), 4000);
  }

  // ── Canal ─────────────────────────────────────────────────────────────────

  /** 'auto' o el número de canal elegido, mientras se edita una red. */
  canalEditando: { indice: number; valor: string } | null = null;

  readonly presCanal = PRESENTACION_SIMPLE;
  private canalesPorRed = new WeakMap<object, OpcionSimple[]>();

  /**
   * Opciones del canal de una red. Se guardan por red (cada lectura del equipo
   * trae objetos nuevos): la plantilla las pide en cada ciclo y el selector
   * tiene que recibir el mismo arreglo. Los valores siguen siendo texto.
   */
  opcionesCanal(r: any): OpcionSimple[] {
    let opciones = this.canalesPorRed.get(r);
    if (!opciones) {
      const en24 = /2[.,]4/.test(String(r.banda ?? ''));
      opciones = [
        { valor: 'auto', etiqueta: 'Automático (recomendado)', detalle: r.canal_auto && r.canal ? `Ahora está en el canal ${r.canal}` : null },
        ...(r.canales_posibles ?? []).map((c: any): OpcionSimple => {
          const otros = CANALES_SIN_SUPERPOSICION.filter(x => x !== +c);
          return {
            valor: '' + c,
            etiqueta: `Canal ${c}`,
            detalle: en24 && otros.length === 2 ? `No se pisa con los canales ${otros[0]} y ${otros[1]}` : null,
            insignia: !r.canal_auto && +r.canal === +c ? { texto: 'Actual', tono: 'ok' } : null,
          };
        }),
      ];
      this.canalesPorRed.set(r, opciones);
    }
    return opciones;
  }

  /** "Canal 11 · automático", "Canal 6", "Canal automático". */
  textoCanal(r: any): string {
    if (r.canal_auto && r.canal) return `Canal ${r.canal} (automático)`;
    if (r.canal_auto) return 'Canal automático';
    return r.canal ? `Canal ${r.canal}` : '';
  }

  editarCanal(r: any) {
    this.editando = null;
    this.aviso.set(null);
    this.canalEditando = { indice: r.indice, valor: r.canal_auto || !r.canal ? 'auto' : String(r.canal) };
  }

  guardarCanal(r: any) {
    const ed = this.canalEditando;
    if (!ed) return;
    const canal = ed.valor === 'auto' ? null : Number(ed.valor);

    this.trabajando.set('canal');
    this.api.cambiarCanalCliente(r.indice, canal).subscribe({
      next: (res: any) => {
        this.trabajando.set('');
        if (res?.error !== 0) { this.aviso.set({ texto: res?.message || 'No se pudo cambiar el canal.', tipo: 'danger' }); return; }
        this.aviso.set({ texto: res.data?.mensaje ?? 'Guardado.', tipo: res.data?.hecha ? 'ok' : 'warn' });
        this.canalEditando = null;
        setTimeout(() => this.cargar(true), 5000);
      },
      error: () => { this.trabajando.set(''); this.aviso.set({ texto: 'No se pudo cambiar el canal.', tipo: 'danger' }); },
    });
  }

  // ── Reinicio ──────────────────────────────────────────────────────────────

  /** Reiniciar corta internet unos minutos: se pide confirmar antes. */
  confirmarReinicio = false;

  reiniciar() {
    this.trabajando.set('reiniciar');
    this.api.reiniciarRouter().subscribe({
      next: (res: any) => {
        this.trabajando.set('');
        this.confirmarReinicio = false;
        if (res?.error !== 0) { this.aviso.set({ texto: res?.message || 'No se pudo reiniciar el equipo.', tipo: 'danger' }); return; }
        this.aviso.set({ texto: res.data?.mensaje ?? 'Su equipo se está reiniciando.', tipo: res.data?.hecha ? 'ok' : 'warn' });
      },
      error: () => { this.trabajando.set(''); this.aviso.set({ texto: 'No se pudo reiniciar el equipo.', tipo: 'danger' }); },
    });
  }

  actualizar() {
    this.trabajando.set('refrescar');
    this.api.refrescarRouter().subscribe({
      next: (r: any) => {
        this.trabajando.set('');
        this.aviso.set({
          texto: r?.data?.hecha ? 'Datos actualizados.' : 'Le pedimos los datos a su equipo; aparecen en unos segundos.',
          tipo: r?.data?.hecha ? 'ok' : 'warn',
        });
        setTimeout(() => this.cargar(true), 5000);
      },
      error: () => { this.trabajando.set(''); },
    });
  }
}
