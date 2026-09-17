import { Injectable, PLATFORM_ID, computed, inject, signal } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { Observable, finalize, map, shareReplay, switchMap, take, takeWhile, tap, timer } from 'rxjs';
import { GestionRemotaService } from './gestion-remota.service';
import { AuthService } from './auth.service';
import { ImportadorService } from './importador.service';

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
  /** Dónde se ve el detalle completo. */
  enlace?: string;
}

/**
 * Las tareas se guardan por empresa y usuario. Con una sola clave, quien entraba
 * con otra empresa en el mismo navegador veía las tareas de la anterior.
 */
const CLAVE_BASE = 'np_tareas_segundo_plano';

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
  private auth = inject(AuthService);
  private importador = inject(ImportadorService);
  private enNavegador = isPlatformBrowser(inject(PLATFORM_ID));

  readonly tareas = signal<TareaSeguida[]>([]);
  readonly minimizado = signal(false);
  readonly enCurso = computed(() => this.tareas().filter(t => t.estado === 'en_curso').length);

  private flujos = new Map<string, Observable<any>>();
  /** La clave de la sesión cuyas tareas están cargadas. */
  private claveCargada = '';

  constructor() {
    if (!this.enNavegador) return;

    // La clave vieja, compartida por todas las empresas del navegador.
    try { localStorage.removeItem(CLAVE_BASE); } catch { /* bloqueado */ }

    this.recargarSesion();
  }

  /**
   * Carga las tareas de la sesión actual (empresa + usuario). Se llama al
   * abrir el panel después de iniciar sesión: el servicio vive mientras la
   * pestaña esté abierta, así que sin esto seguía mostrando las de la sesión
   * anterior.
   */
  recargarSesion(): void {
    if (!this.enNavegador) return;

    const clave = this.clave();
    if (clave === this.claveCargada) return;
    this.claveCargada = clave;

    // Los seguimientos de la sesión anterior dejan de actualizar la lista.
    this.flujos.clear();
    this.medicionesActivas.clear();
    this.tareas.set([]);
    this.minimizado.set(false);

    if (!clave) return;

    try {
      const guardado = JSON.parse(localStorage.getItem(clave) || '{}');
      this.tareas.set(Array.isArray(guardado.tareas) ? guardado.tareas : []);
      this.minimizado.set(!!guardado.minimizado);
    } catch { /* sin datos guardados */ }

    // Las que seguían corriendo cuando se cerró o recargó la página.
    for (const t of this.tareas()) {
      if (t.estado !== 'en_curso') continue;
      if (t.tipo === 'aprovisionamiento') this.seguirAprovisionamiento(Number(t.id.replace('aprov-', '')), t.titulo);
      else if (t.tipo === 'importacion') this.seguirImportacion(Number(t.id.replace('importacion-', '')), t.titulo);
      else if (t.tipo !== 'senal' && t.tipo !== 'diagnostico') this.seguir(t.id, t.titulo, t.tipo);
    }
  }

  /** Sin sesión no se guarda nada: vacía para que no se mezcle. */
  private clave(): string {
    const u = this.auth.getUser();
    return u?.company_id ? `${CLAVE_BASE}:${u.company_id}:${u.username ?? ''}` : '';
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

  /**
   * El aprovisionamiento de una ONT: lo trabaja la tarea de cada minuto del
   * servidor, así que se pregunta cada 5 s cómo va. Se ve el paso en curso y se
   * puede abrir el detalle en Acceso remoto → Aprovisionamiento.
   */
  seguirAprovisionamiento(id: number, titulo: string): void {
    if (!id) return;
    const clave = `aprov-${id}`;
    if (this.flujos.has(clave)) return;

    const enlace = `/dashboard/olt/acceso-remoto?tab=aprov&aprov=${id}`;

    if (!this.tareas().some(t => t.id === clave)) {
      this.tareas.update(lista => [{
        id: clave, tipo: 'aprovisionamiento', titulo, estado: 'en_curso' as EstadoTarea,
        detalle: 'Esperando que el equipo aparezca en el TR-069…', inicio: Date.now(), puedeParar: false, enlace,
      }, ...lista].slice(0, 20));
    } else {
      this.actualizar(clave, { enlace });
    }
    this.minimizado.set(false);
    this.guardar();

    const enCurso = (e: string) => e === 'esperando' || e === 'aplicando';

    const flujo = timer(0, 5000).pipe(
      // Quince minutos alcanzan: el servidor deja de esperar al equipo antes.
      take(180),
      switchMap(() => this.gestion.verAprovisionamiento(id)),
      map((r: any) => r?.data ?? null),
      tap((a: any) => {
        if (!a) return;
        const pasos: any[] = a.pasos ?? [];
        const ultimo = pasos.length ? pasos[pasos.length - 1] : null;
        const detalle = enCurso(a.estado)
          ? (ultimo && !ultimo.ok && !ultimo.omitido ? `${ultimo.paso}: ${ultimo.detalle}` : a.detalle)
          : a.detalle;
        this.actualizar(clave, {
          estado: enCurso(a.estado) ? 'en_curso' : (a.estado === 'listo' || a.estado === 'reemplazado' ? 'listo' : 'error'),
          detalle: detalle ?? '',
          ...(!enCurso(a.estado) ? { fin: Date.now() } : {}),
        });
      }),
      takeWhile((a: any) => !a || enCurso(a.estado), true),
      finalize(() => this.flujos.delete(clave)),
      shareReplay({ bufferSize: 1, refCount: false }),
    );

    this.flujos.set(clave, flujo);
    flujo.subscribe({ error: () => this.actualizar(clave, { estado: 'error', detalle: 'Se perdió el seguimiento; mirá el detalle en Acceso remoto.', fin: Date.now() }) });
  }

  /**
   * Una importación de clientes (WispHub, Mikrowisp): la trabaja un proceso
   * del servidor y se pregunta cada 4 s cómo va, aunque se cambie de pantalla.
   */
  seguirImportacion(id: number, titulo: string): void {
    if (!id) return;
    const clave = `importacion-${id}`;
    if (this.flujos.has(clave)) return;

    const enlace = `/dashboard/usuario/importar?id=${id}`;
    const enCurso = (e: string) => ['leyendo', 'en_cola', 'importando', 'cancelando'].includes(e);

    if (!this.tareas().some(t => t.id === clave)) {
      this.tareas.update(lista => [{
        id: clave, tipo: 'importacion', titulo, estado: 'en_curso' as EstadoTarea,
        detalle: 'Arrancando…', inicio: Date.now(), puedeParar: false, enlace,
      }, ...lista].slice(0, 20));
    }
    this.minimizado.set(false);
    this.guardar();

    const flujo = timer(0, 4000).pipe(
      // Hasta dos horas: una importación grande por API puede tardar.
      take(1800),
      switchMap(() => this.importador.ver(id)),
      map((r: any) => (r?.error === 0 ? r.data : null)),
      tap((imp: any) => {
        if (!imp) return;
        const sigue = enCurso(imp.estado);
        this.actualizar(clave, {
          estado: sigue ? 'en_curso' : (imp.estado === 'error' ? 'error' : 'listo'),
          detalle: imp.detalle ?? '',
          ...(!sigue ? { fin: Date.now() } : {}),
        });
      }),
      takeWhile((imp: any) => !imp || enCurso(imp.estado), true),
      finalize(() => this.flujos.delete(clave)),
      shareReplay({ bufferSize: 1, refCount: false }),
    );

    this.flujos.set(clave, flujo);
    flujo.subscribe({ error: () => this.actualizar(clave, { estado: 'error', detalle: 'Se perdió el seguimiento; la importación sigue en el servidor.', fin: Date.now() }) });
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
    if (!this.enNavegador || !this.claveCargada) return;
    // Si la sesión cambió sin pasar por recargarSesion, no se escribe en la
    // clave de otra empresa.
    if (this.clave() !== this.claveCargada) return;
    try {
      localStorage.setItem(this.claveCargada, JSON.stringify({ tareas: this.tareas(), minimizado: this.minimizado() }));
    } catch { /* almacenamiento lleno o bloqueado */ }
  }
}
