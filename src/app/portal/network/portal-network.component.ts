import { CommonModule } from '@angular/common';
import { Component, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { ClientApiService } from '../services/client-api.service';

/**
 * "Mi WiFi": el cliente ve y cambia lo suyo sin llamar al soporte.
 *
 * La pantalla sólo existe si su equipo reporta al sistema; si no, se explica
 * en una línea y no se ofrece nada que no se pueda hacer.
 */
@Component({
  selector: 'app-portal-network',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
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

  ngOnInit() { this.cargar(); }

  cargar(silencioso = false) {
    if (!silencioso) this.loading.set(true);
    this.api.getRouter().subscribe({
      next: (r: any) => {
        this.loading.set(false);
        if (r?.error !== 0) { this.error.set(r?.message || 'No pudimos consultar tu equipo.'); return; }
        this.error.set('');
        this.panel.set(r.data);
      },
      error: () => { this.loading.set(false); this.error.set('No pudimos consultar tu equipo.'); },
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

  editar(r: any) { this.editando = { indice: r.indice, nombre: r.nombre ?? '', clave: '', todas: true }; this.aviso.set(null); }

  guardar(r: any) {
    const ed = this.editando;
    if (!ed) return;
    const nombre = ed.nombre.trim() !== (r.nombre ?? '') ? ed.nombre.trim() : '';
    const clave  = ed.clave.trim();

    if (!nombre && !clave) { this.editando = null; return; }
    if (nombre && (nombre.length < 1 || nombre.length > 32)) { this.aviso.set({ texto: 'El nombre admite hasta 32 caracteres.', tipo: 'danger' }); return; }
    if (clave && (clave.length < 8 || clave.length > 63)) { this.aviso.set({ texto: 'La contraseña debe tener entre 8 y 63 caracteres.', tipo: 'danger' }); return; }

    this.trabajando.set('wifi');
    this.api.cambiarWifiCliente(r.indice, nombre || null, clave || null, !!clave && ed.todas && this.redesConClave > 1).subscribe({
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

  actualizar() {
    this.trabajando.set('refrescar');
    this.api.refrescarRouter().subscribe({
      next: (r: any) => {
        this.trabajando.set('');
        this.aviso.set({
          texto: r?.data?.hecha ? 'Datos actualizados.' : 'Le pedimos los datos a tu equipo; aparecen en unos segundos.',
          tipo: r?.data?.hecha ? 'ok' : 'warn',
        });
        setTimeout(() => this.cargar(true), 5000);
      },
      error: () => { this.trabajando.set(''); },
    });
  }
}
