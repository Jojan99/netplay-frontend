import { Injectable, PLATFORM_ID, computed, inject, signal } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { Observable, finalize, shareReplay, tap } from 'rxjs';
import { GestionRemotaService } from './gestion-remota.service';

export type EstadoTarea = 'en_curso' | 'listo' | 'error';

export interface TareaSeguida {
  id: string;
  tipo: string;
  titulo: string;
  estado: EstadoTarea;
  detalle: string;
  inicio: number;
  fin?: number;
  puedeParar: boolean;
}

const CLAVE = 'np_tareas_segundo_plano';

/** Las que se pueden detener a mitad de camino (terminan el equipo en curso). */
const SE_PUEDEN_PARAR = ['al_dia'];

/**
 * Las tareas que corren en el servidor (dar acceso, preparar perfiles, poner
 * al día, reiniciar equipos), seguidas desde un solo lugar.
 *
 * Antes cada pantalla seguía la suya y, si se cambiaba de pantalla, se perdía
 * de vista. Acá quedan guardadas en el navegador: la ventana flotante del panel
 * las muestra y, al recargar, retoma las que seguían en curso.
 */
@Injectable({ providedIn: 'root' })
export class TareasEnSegundoPlanoService {
  private gestion = inject(GestionRemotaService);
  private enNavegador = isPlatformBrowser(inject(PLATFORM_ID));

  readonly tareas = signal<TareaSeguida[]>([]);
  readonly minimizado = signal(false);
  readonly enCurso = computed(() => this.tareas().filter(t => t.estado === 'en_curso').length);

  private flujos = new Map<string, Observable<any>>();

  constructor() {
    if (!this.enNavegador) return;

    try {
      const guardado = JSON.parse(localStorage.getItem(CLAVE) || '{}');
      this.tareas.set(Array.isArray(guardado.tareas) ? guardado.tareas : []);
      this.minimizado.set(!!guardado.minimizado);
    } catch { /* sin datos guardados */ }

    // Las que seguían corriendo cuando se cerró o recargó la página.
    for (const t of this.tareas()) {
      if (t.estado === 'en_curso') this.seguir(t.id, t.titulo, t.tipo);
    }
  }

  /**
   * Sigue una tarea hasta que termina y la muestra en la ventana. Devuelve los
   * estados (el último es el final) para que la pantalla que la lanzó reaccione
   * igual que antes; el seguimiento sigue aunque esa pantalla se cierre.
   */
  seguir(id: string, titulo: string, tipo: string, cadaMs = 3000): Observable<any> {
    const existente = this.flujos.get(id);
    if (existente) return existente;

    if (!this.tareas().some(t => t.id === id)) {
      this.tareas.update(lista => [{
        id, tipo, titulo, estado: 'en_curso' as EstadoTarea, detalle: '', inicio: Date.now(),
        puedeParar: SE_PUEDEN_PARAR.includes(tipo),
      }, ...lista].slice(0, 20));
    }
    this.minimizado.set(false);
    this.guardar();

    const flujo = this.gestion.esperarTarea(id, cadaMs).pipe(
      tap({
        next: (t: any) => this.actualizar(id, {
          estado: (t?.estado === 'listo' || t?.estado === 'error') ? t.estado : 'en_curso',
          detalle: t?.detalle ?? '',
          ...(t?.estado && t.estado !== 'en_curso' ? { fin: Date.now() } : {}),
        }),
        error: () => this.actualizar(id, { estado: 'error', detalle: 'Se perdió el seguimiento; la tarea sigue en el servidor.', fin: Date.now() }),
      }),
      finalize(() => this.flujos.delete(id)),
      shareReplay({ bufferSize: 1, refCount: false }),
    );

    this.flujos.set(id, flujo);
    // El seguimiento no depende de que la pantalla siga abierta.
    flujo.subscribe({ error: () => {} });

    return flujo;
  }

  // ── Tareas que no son de acceso remoto ─────────────────────────────────

  /** Una tarea que sigue la propia pantalla: ella cuenta el avance y el final. */
  iniciar(id: string, titulo: string, tipo: string, detalle = ''): void {
    const existe = this.tareas().some(t => t.id === id);

    if (existe) {
      this.actualizar(id, { titulo, estado: 'en_curso', detalle, inicio: Date.now(), fin: undefined });
    } else {
      this.tareas.update(lista => [{
        id, tipo, titulo, estado: 'en_curso' as EstadoTarea, detalle, inicio: Date.now(), puedeParar: false,
      }, ...lista].slice(0, 20));
      this.guardar();
    }
    this.minimizado.set(false);
  }

  avanzar(id: string, detalle: string): void {
    this.actualizar(id, { detalle });
  }

  terminar(id: string, ok: boolean, detalle: string): void {
    this.actualizar(id, { estado: ok ? 'listo' : 'error', detalle, fin: Date.now() });
  }

  /**
   * La medición de señal de una OLT, que el servidor hace en otro proceso
   * (tarda más de un minuto). Se pregunta cada 15 s hasta que termina, aunque
   * se cambie de pantalla, y avisa cuando está la medición nueva.
   */
  seguirMedicion(oltId: number, nombre: string, consultar: () => Observable<any>): void {
    const id = `senal-${oltId}`;
    const actual = this.tareas().find(t => t.id === id);
    if (actual?.estado === 'en_curso' && this.medicionesActivas.has(id)) return;

    this.iniciar(id, `Midiendo la señal · ${nombre}`, 'senal', 'La OLT le pregunta a cada ONT: tarda cerca de un minuto.');
    this.medicionesActivas.add(id);

    let intentos = 0;
    const revisar = () => {
      consultar().subscribe({
        next: (r: any) => {
          const d = r?.data ?? {};
          if (d.midiendo && ++intentos < 20) {
            this.avanzar(id, d.onts?.length ? `Mientras tanto se ve la medición de las ${this.hora(d.medido_en)}.` : 'La OLT le pregunta a cada ONT: tarda cerca de un minuto.');
            setTimeout(revisar, 15000);
            return;
          }
          this.medicionesActivas.delete(id);
          d.onts?.length
            ? this.terminar(id, true, `${d.onts.length} ONT medidas a las ${this.hora(d.medido_en)}.`)
            : this.terminar(id, false, r?.message || 'La OLT no devolvió mediciones ópticas.');
        },
        error: () => { this.medicionesActivas.delete(id); this.terminar(id, false, 'No se pudo consultar la medición.'); },
      });
    };

    setTimeout(revisar, 15000);
  }

  private medicionesActivas = new Set<string>();

  private hora(iso: string | null | undefined): string {
    if (!iso) return '—';
    const d = new Date(iso);
    return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  }

  parar(id: string): void {
    this.actualizar(id, { detalle: 'Deteniendo después del equipo en curso…' });
    this.gestion.pararTarea(id).subscribe({ error: () => {} });
  }

  quitar(id: string): void {
    this.tareas.update(lista => lista.filter(t => t.id !== id));
    this.guardar();
  }

  limpiarTerminadas(): void {
    this.tareas.update(lista => lista.filter(t => t.estado === 'en_curso'));
    this.guardar();
  }

  alternarMinimizado(): void {
    this.minimizado.update(v => !v);
    this.guardar();
  }

  private actualizar(id: string, cambios: Partial<TareaSeguida>): void {
    this.tareas.update(lista => lista.map(t => t.id === id ? { ...t, ...cambios } : t));
    this.guardar();
  }

  private guardar(): void {
    if (!this.enNavegador) return;
    try {
      localStorage.setItem(CLAVE, JSON.stringify({ tareas: this.tareas(), minimizado: this.minimizado() }));
    } catch { /* almacenamiento lleno o bloqueado */ }
  }
}
