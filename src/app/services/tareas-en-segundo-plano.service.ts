import { Injectable, PLATFORM_ID, computed, inject, signal } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { Observable, Subject, Subscription, concat, finalize, map, merge, shareReplay, switchMap, take, takeUntil, takeWhile, tap, timer } from 'rxjs';
import { GestionRemotaService } from './gestion-remota.service';
import { AuthService } from './auth.service';
import { ImportadorService } from './importador.service';
import { OltService } from './olt.service';

/**
 * no_aplica: el equipo no se puede configurar solo (p. ej. un Huawei en una
 * OLT C-Data): final, con el motivo y qué hacer. detenida: la paró el usuario.
 */
export type EstadoTarea = 'en_curso' | 'listo' | 'error' | 'no_aplica' | 'detenida';

export interface TareaSeguida {
  id: string;
  tipo: string;
  titulo: string;
  estado: EstadoTarea;
  detalle: string;
  inicio: number;
  fin?: number;
  /** Ya no se usa (lo decide comoSePara); queda por las tareas guardadas. */
  puedeParar?: boolean;
  /** El usuario pidió detenerla y el servidor todavía está terminando. */
  pedidaParada?: boolean;
  /** Qué hacer en vez de esperar (estado no_aplica). */
  queHacer?: string;
  /** Dónde se ve el detalle completo. */
  enlace?: string;
}

/** Qué significa "detener" una tarea de ese tipo, dicho sin mentir. */
export interface ComoSePara {
  /** detener: se cancela de verdad. dejar: sigue en el servidor, sólo se deja de mirar. */
  modo: 'detener' | 'dejar';
  etiqueta: string;
  aviso: string;
}

const DEJAR_DE_SEGUIR = 'Dejar de seguirla';

/**
 * Por tipo de tarea. Las que ya le mandaron comandos a la OLT no se pueden
 * deshacer a mitad (ni se corta una sesión mientras escribe): se ofrece dejar
 * de seguirlas, y el servidor igual las frena si todavía no llegaron a la OLT.
 */
const PARADAS: Record<string, ComoSePara> = {
  al_dia: {
    modo: 'detener', etiqueta: 'Detener',
    aviso: 'Termina el equipo que está configurando y no sigue con los demás. Los que ya tienen acceso lo conservan.',
  },
  aprovisionamiento: {
    modo: 'detener', etiqueta: 'Detener',
    aviso: 'El aprovisionamiento queda cancelado y no se le aplica nada más al equipo. Lo que ya se le aplicó queda aplicado.',
  },
  importacion: {
    modo: 'detener', etiqueta: 'Detener',
    aviso: 'La importación se detiene. Los clientes que ya se importaron quedan importados.',
  },
  senal: {
    modo: 'detener', etiqueta: 'Detener',
    aviso: 'Se cancela la medición: la consulta que la OLT esté contestando termina sola en unos segundos, no se guarda nada y la OLT queda libre. Se sigue viendo la medición anterior.',
  },
  dar_acceso: {
    modo: 'dejar', etiqueta: DEJAR_DE_SEGUIR,
    aviso: 'Si todavía no le mandó nada a la OLT, no se le manda. Si ya empezó, termina sola en el servidor y lo que ya se hizo en la OLT queda hecho: no se corta una escritura a mitad.',
  },
  preparar_perfil: {
    modo: 'dejar', etiqueta: DEJAR_DE_SEGUIR,
    aviso: 'Si todavía no arrancó, no se hace. Si ya arrancó, termina sola en el servidor y lo que ya se hizo en la OLT queda hecho.',
  },
  reiniciar: {
    modo: 'dejar', etiqueta: DEJAR_DE_SEGUIR,
    aviso: 'Si la orden todavía no salió, no se reinicia. Si ya salió, el equipo se reinicia igual.',
  },
};

const PARADA_GENERICA: ComoSePara = {
  modo: 'dejar', etiqueta: DEJAR_DE_SEGUIR,
  aviso: 'Termina sola en el servidor; sólo deja de mostrarse aquí.',
};

/**
 * Las tareas se guardan por empresa y usuario. Con una sola clave, quien entraba
 * con otra empresa en el mismo navegador veía las tareas de la anterior.
 */
const CLAVE_BASE = 'np_tareas_segundo_plano';

/**
 * Las tareas que corren en el servidor (dar acceso, preparar perfiles, poner
 * al día, reiniciar equipos), seguidas desde un solo lugar.
 *
 * Antes cada pantalla seguía la suya y, si se cambiaba de pantalla, se perdía
 * de vista. Aquí quedan guardadas en el navegador: la ventana flotante del panel
 * las muestra y, al recargar, retoma las que seguían en curso.
 */
@Injectable({ providedIn: 'root' })
export class TareasEnSegundoPlanoService {
  private gestion = inject(GestionRemotaService);
  private auth = inject(AuthService);
  private importador = inject(ImportadorService);
  private olt = inject(OltService);
  private enNavegador = isPlatformBrowser(inject(PLATFORM_ID));

  readonly tareas = signal<TareaSeguida[]>([]);
  readonly minimizado = signal(false);
  readonly enCurso = computed(() => this.tareas().filter(t => t.estado === 'en_curso').length);

  private flujos = new Map<string, Observable<any>>();
  /** Para cortar el seguimiento de cada tarea cuando el usuario la detiene. */
  private paradas = new Map<string, Subject<void>>();
  private suscripciones = new Map<string, Subscription>();
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
    this.suscripciones.forEach(s => s.unsubscribe());
    this.suscripciones.clear();
    this.paradas.clear();
    this.medicionesActivas.clear();
    this.relojesDeMedicion.forEach(r => clearTimeout(r));
    this.relojesDeMedicion.clear();
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
      }, ...lista].slice(0, 20));
    }
    this.minimizado.set(false);
    this.guardar();

    // Dejar de seguirla: la pantalla que la lanzó recibe un final "detenida"
    // en vez de quedarse esperando.
    const dejada$ = this.paradaDe(id).pipe(map(() => ({
      estado: 'detenida',
      detalle: `Dejaste de seguirla a las ${this.hora(new Date().toISOString())}. ${this.comoSePara({ tipo } as TareaSeguida).aviso}`,
    })));

    const flujo = merge(this.gestion.esperarTarea(id, cadaMs), dejada$).pipe(
      takeWhile((t: any) => t?.estado === 'en_curso', true),
      tap({
        next: (t: any) => {
          const final = TareasEnSegundoPlanoService.esFinal(t?.estado);
          const texto = String(t?.detalle ?? '');
          this.actualizar(id, {
            estado: final ? t.estado : 'en_curso',
            // El servidor ya lo dice ("Detenida por el usuario…"); si no, se agrega la hora.
            detalle: t?.estado === 'detenida' && !/^(Detenida|Dejaste)/.test(texto)
              ? `Detenida por el usuario a las ${this.hora(new Date().toISOString())}. ${texto}`
              // No se puede: el motivo arriba y qué hacer en su recuadro, sin repetirlo.
              : (t?.estado === 'no_aplica' && t?.motivo ? t.motivo : texto),
            queHacer: t?.que_hacer ?? undefined,
            ...(final ? { fin: Date.now(), pedidaParada: false } : {}),
          });
        },
        error: () => this.actualizar(id, { estado: 'error', detalle: 'Se perdió el seguimiento; la tarea sigue en el servidor.', fin: Date.now() }),
      }),
      finalize(() => { this.flujos.delete(id); this.paradas.delete(id); }),
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
        detalle: 'Revisando el equipo…', inicio: Date.now(), enlace,
      }, ...lista].slice(0, 20));
    } else {
      this.actualizar(clave, { enlace });
    }
    this.minimizado.set(false);
    this.guardar();

    const enCurso = (e: string) => e === 'esperando' || e === 'aplicando';

    // Cada 5 s los primeros 3 minutos y después cada 20 s: el servidor espera
    // hasta 90 minutos a un equipo que sí se configura solo, y antes el
    // seguimiento se cortaba a los 15 dejando la ruedita girando.
    const flujo = concat(timer(0, 5000).pipe(take(36)), timer(20000, 20000).pipe(take(300))).pipe(
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
          estado: enCurso(a.estado) ? 'en_curso' : TareasEnSegundoPlanoService.estadoDeAprovisionamiento(a.estado),
          // No se puede configurar solo: el motivo y qué hacer, sin ruedita.
          detalle: (a.estado === 'no_aplica' ? (a.motivo || a.detalle) : detalle) ?? '',
          queHacer: a.estado === 'no_aplica' ? (a.que_hacer ?? undefined) : undefined,
          ...(!enCurso(a.estado) ? { fin: Date.now(), pedidaParada: false } : {}),
        });
      }),
      takeWhile((a: any) => !a || enCurso(a.estado), true),
      takeUntil(this.paradaDe(clave)),
      finalize(() => { this.flujos.delete(clave); this.paradas.delete(clave); this.suscripciones.delete(clave); }),
      shareReplay({ bufferSize: 1, refCount: false }),
    );

    this.flujos.set(clave, flujo);
    this.suscripciones.set(clave, flujo.subscribe({ error: () => this.actualizar(clave, { estado: 'error', detalle: 'Se perdió el seguimiento; consulte el detalle en Acceso remoto.', fin: Date.now() }) }));
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
        detalle: 'Arrancando…', inicio: Date.now(), enlace,
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
        const detenida = imp.estado === 'cancelada';
        this.actualizar(clave, {
          estado: sigue ? 'en_curso' : (detenida ? 'detenida' : (imp.estado === 'error' ? 'error' : 'listo')),
          detalle: detenida ? `Detenida por el usuario a las ${this.hora(new Date().toISOString())}. ${imp.detalle ?? ''}` : (imp.detalle ?? ''),
          ...(!sigue ? { fin: Date.now(), pedidaParada: false } : {}),
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
      this.actualizar(id, { titulo, estado: 'en_curso', detalle, inicio: Date.now(), fin: undefined, pedidaParada: false, queHacer: undefined }, true);
    } else {
      this.tareas.update(lista => [{
        id, tipo, titulo, estado: 'en_curso' as EstadoTarea, detalle, inicio: Date.now(),
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

  /** ¿La siguen? Las pantallas que manejan su propia tarea (diagnóstico) lo miran. */
  sigueEnCurso(id: string): boolean {
    return this.tareas().find(t => t.id === id)?.estado === 'en_curso';
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
      this.relojesDeMedicion.delete(id);
      consultar().subscribe({
        next: (r: any) => {
          // Detenida mientras esperaba la respuesta: no se pisa.
          if (!this.medicionesActivas.has(id)) return;
          const d = r?.data ?? {};
          if (d.midiendo && ++intentos < 20) {
            this.avanzar(id, d.onts?.length ? `Mientras tanto se ve la medición de las ${this.hora(d.medido_en)}.` : 'La OLT le pregunta a cada ONT: tarda cerca de un minuto.');
            this.relojesDeMedicion.set(id, setTimeout(revisar, 15000));
            return;
          }
          this.medicionesActivas.delete(id);
          d.onts?.length
            ? this.terminar(id, true, `${d.onts.length} ONT medidas a las ${this.hora(d.medido_en)}.`)
            : this.terminar(id, false, r?.message || 'La OLT no devolvió mediciones ópticas.');
        },
        error: () => {
          if (!this.medicionesActivas.has(id)) return;
          this.medicionesActivas.delete(id);
          this.terminar(id, false, 'No se pudo consultar la medición.');
        },
      });
    };

    this.relojesDeMedicion.set(id, setTimeout(revisar, 15000));
  }

  private medicionesActivas = new Set<string>();
  private relojesDeMedicion = new Map<string, ReturnType<typeof setTimeout>>();

  private hora(iso: string | null | undefined): string {
    if (!iso) return '—';
    const d = new Date(iso);
    return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  }

  // ── Detener ────────────────────────────────────────────────────────────

  /** Qué hace "detener" con esta tarea (la ventana lo muestra y lo confirma). */
  comoSePara(t: TareaSeguida): ComoSePara {
    return PARADAS[t.tipo] ?? PARADA_GENERICA;
  }

  /**
   * La detiene de verdad cuando se puede (medición, aprovisionamiento,
   * importación, puesta al día) o deja de seguirla (las que ya le hablan a la
   * OLT). Siempre queda en la ventana como detenida, con la hora.
   */
  detener(id: string): void {
    const t = this.tareas().find(x => x.id === id);
    if (!t || t.estado !== 'en_curso' || t.pedidaParada) return;

    const ahora = this.hora(new Date().toISOString());
    const detenida = (detalle: string) => this.actualizar(id, { estado: 'detenida', detalle, fin: Date.now(), pedidaParada: false });

    switch (t.tipo) {
      case 'al_dia':
        // Termina el equipo en curso: el final llega por el seguimiento.
        this.actualizar(id, { pedidaParada: true, detalle: 'Deteniendo después del equipo en curso…' });
        this.gestion.pararTarea(id).subscribe({ error: () => {} });
        return;

      case 'aprovisionamiento': {
        const numero = Number(id.replace('aprov-', ''));
        this.actualizar(id, { pedidaParada: true, detalle: 'Cancelando…' });
        this.paradaDe(id).next();
        this.gestion.cancelarAprovisionamiento(numero).subscribe({
          next: (r: any) => r?.error === 0
            ? detenida(r?.data?.detalle || `Detenida por el usuario a las ${ahora}.`)
            // Ya había terminado: se muestra cómo terminó.
            : this.seguirAprovisionamientoUnaVez(numero, id, r?.message),
          // No se pudo: se lo vuelve a seguir como antes.
          error: () => {
            this.actualizar(id, { pedidaParada: false, detalle: 'No se pudo cancelar; pruebe de nuevo.' });
            this.seguirAprovisionamiento(numero, t.titulo);
          },
        });
        return;
      }

      case 'importacion':
        this.actualizar(id, { pedidaParada: true, detalle: 'Deteniendo…' });
        this.importador.cancelar(Number(id.replace('importacion-', ''))).subscribe({
          error: () => this.actualizar(id, { pedidaParada: false, detalle: 'No se pudo detener; pruebe de nuevo.' }),
        });
        return;

      case 'senal': {
        const oltId = Number(id.replace('senal-', ''));
        this.medicionesActivas.delete(id);
        const reloj = this.relojesDeMedicion.get(id);
        if (reloj) clearTimeout(reloj);
        this.relojesDeMedicion.delete(id);
        detenida(`Detenida por el usuario a las ${ahora}. No se guardó la medición; sigue valiendo la anterior.`);
        this.olt.cancelarSenal(oltId).subscribe({ error: () => {} });
        return;
      }

      default:
        // Dar acceso, preparar perfiles, reiniciar: el servidor la frena si
        // todavía no le mandó nada a la OLT; si ya empezó, termina sola.
        if (['dar_acceso', 'preparar_perfil', 'reiniciar'].includes(t.tipo)) {
          this.gestion.pararTarea(id).subscribe({ error: () => {} });
        }
        if (this.paradas.has(id)) {
          this.paradaDe(id).next();
        } else {
          detenida(`Dejaste de seguirla a las ${ahora}. ${this.comoSePara(t).aviso}`);
        }
    }
  }

  /** Un aprovisionamiento que ya había terminado cuando se lo quiso cancelar. */
  private seguirAprovisionamientoUnaVez(numero: number, clave: string, mensaje?: string): void {
    this.gestion.verAprovisionamiento(numero).subscribe({
      next: (r: any) => {
        const a = r?.data;
        if (!a) return;
        this.actualizar(clave, {
          estado: TareasEnSegundoPlanoService.estadoDeAprovisionamiento(a.estado),
          detalle: (a.estado === 'no_aplica' ? (a.motivo || a.detalle) : a.detalle) || mensaje || '',
          queHacer: a.estado === 'no_aplica' ? (a.que_hacer ?? undefined) : undefined,
          fin: Date.now(), pedidaParada: false,
        });
      },
    });
  }

  private paradaDe(id: string): Subject<void> {
    let s = this.paradas.get(id);
    if (!s) { s = new Subject<void>(); this.paradas.set(id, s); }
    return s;
  }

  private static esFinal(estado: string | undefined): estado is EstadoTarea {
    return ['listo', 'error', 'no_aplica', 'detenida'].includes(estado ?? '');
  }

  private static estadoDeAprovisionamiento(estado: string): EstadoTarea {
    if (estado === 'listo' || estado === 'reemplazado') return 'listo';
    if (estado === 'no_aplica') return 'no_aplica';
    if (estado === 'cancelado') return 'detenida';
    // Cambio de conexión que no se confirmó y se deshizo: no se hizo lo pedido.
    if (estado === 'revertido') return 'error';
    return 'error';
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

  /**
   * Una detenida no cambia más (salvo que se la vuelva a iniciar): la pantalla
   * que la lanzó puede seguir contando su avance o su final sin pisarla.
   */
  private actualizar(id: string, cambios: Partial<TareaSeguida>, reiniciar = false): void {
    this.tareas.update(lista => lista.map(t => t.id === id && (reiniciar || t.estado !== 'detenida') ? { ...t, ...cambios } : t));
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
