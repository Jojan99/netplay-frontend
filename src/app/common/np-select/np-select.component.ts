import {
  ChangeDetectionStrategy, ChangeDetectorRef, Component, ElementRef, EventEmitter, Input, NgZone,
  OnChanges, OnDestroy, Output, PLATFORM_ID, ViewChild, forwardRef, inject,
} from '@angular/core';
import { CommonModule, isPlatformBrowser } from '@angular/common';
import { ControlValueAccessor, NG_VALUE_ACCESSOR } from '@angular/forms';

export interface InsigniaSelect {
  texto: string;
  tono?: 'ok' | 'info' | 'warn' | 'neutral';
  /** De 0 a 1: dibuja una barra proporcional (por ejemplo, clientes de la VLAN frente a la que más tiene). */
  proporcion?: number | null;
}

/** Cómo se muestra cada opción. Todo es opcional: sin nada, se usa el texto de la opción. */
export interface PresentacionSelect<T = any> {
  etiqueta?: (opcion: T) => string;
  detalle?: (opcion: T) => string | null | undefined;
  /** Etiqueta corta a la izquierda: el número de VLAN, un código. */
  prefijo?: (opcion: T) => string | null | undefined;
  insignia?: (opcion: T, opciones: T[]) => InsigniaSelect | null | undefined;
  grupo?: (opcion: T) => string | null | undefined;
  atenuada?: (opcion: T) => boolean;
  buscarEn?: (opcion: T) => string;
  /**
   * Con qué se compara el valor con las opciones. Por defecto, la misma
   * referencia: una opción guardada en un borrador no se veía elegida aunque
   * tuviera los mismos datos.
   */
  clave?: (opcion: T) => unknown;
  /** Lo que se guarda en el ngModel (por defecto, la opción entera): la IP en texto, un id. */
  valor?: (opcion: T) => unknown;
  /** Se ve pero no se puede elegir: una IP ocupada. */
  deshabilitada?: (opcion: T) => boolean;
  /** Sólo aparece al buscar: las IP ocupadas se buscan para saber quién las tiene. */
  soloAlBuscar?: (opcion: T) => boolean;
  /** Orden al buscar, más alto más arriba: la IP exacta antes que las que la contienen. */
  relevancia?: (opcion: T, busqueda: string) => number;
}

interface Fila {
  grupo?: string;
  opcion?: any;
  indice: number;
}

/** La opción "ninguno" cuando se permite dejarlo vacío. */
const VACIO = Object.freeze({ __vacio: true });

let secuencia = 0;

/**
 * Selector propio del panel.
 *
 * El <select> nativo no deja mostrar más que texto plano, se dibuja con el
 * aspecto del sistema operativo y en modo oscuro las opciones se veían con los
 * colores del navegador. Este muestra por opción un prefijo, un detalle y una
 * insignia (con barra, para comparar cantidades), busca cuando hay muchas
 * opciones y funciona con [(ngModel)] como el nativo.
 */
@Component({
  selector: 'np-select',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './np-select.component.html',
  styleUrl: './np-select.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [{ provide: NG_VALUE_ACCESSOR, useExisting: forwardRef(() => NpSelectComponent), multi: true }],
  host: {
    '[class.is-open]': 'abierto',
    '[class.is-disabled]': 'inhabilitado',
    '[class.is-sm]': "tamano === 'sm'",
    '(keydown)': 'tecla($event)',
  },
})
export class NpSelectComponent implements ControlValueAccessor, OnChanges, OnDestroy {
  private host = inject<ElementRef<HTMLElement>>(ElementRef);
  private cdr = inject(ChangeDetectorRef);
  private zone = inject(NgZone);
  private enNavegador = isPlatformBrowser(inject(PLATFORM_ID));

  @Input() opciones: any[] | null = [];
  @Input() presentacion: PresentacionSelect | null = null;
  @Input() placeholder = 'Seleccionar…';
  @Input() cargando = false;
  @Input() textoCargando = 'Cargando…';
  @Input() textoSinOpciones = 'No hay opciones.';
  /** 'auto': aparece el buscador con más de 7 opciones. */
  @Input() buscable: boolean | 'auto' = 'auto';
  @Input() permitirVacio = false;
  @Input() textoVacio = 'Ninguno';
  @Input() deshabilitado = false;
  @Input() ariaLabel = '';
  @Input() textoBuscar = 'Buscar…';
  /**
   * Qué guarda la opción vacía (permitirVacio) y qué valor cuenta como "sin
   * elegir". Un <option value="">Todos</option> guardaba '': con '' acá, el
   * filtro recibe exactamente lo mismo que antes.
   */
  @Input() valorVacio: any = null;
  /** 'sm': más bajo, para barras de filtros y paginación. */
  @Input() tamano: 'md' | 'sm' = 'md';
  /** Máximo de opciones a dibujar (0 = todas). Con más de mil clientes, al escribir una letra salían cientos. */
  @Input() limite = 0;
  @Output() cambio = new EventEmitter<any>();

  @ViewChild('disparador') private disparador?: ElementRef<HTMLButtonElement>;
  @ViewChild('buscador') private buscador?: ElementRef<HTMLInputElement>;
  @ViewChild('lista') private lista?: ElementRef<HTMLElement>;

  readonly id = `np-select-${++secuencia}`;
  readonly vacio = VACIO;

  abierto = false;
  valor: any = null;
  busqueda = '';
  activa = -1;
  filas: Fila[] = [];
  /** Cuántas coincidencias quedaron afuera por el límite. */
  excedentes = 0;
  posicion = { top: 0, left: 0, width: 0, alto: 320, arriba: false };

  private visibles: any[] = [];
  private deshabilitadoPorFormulario = false;
  private alCambiar: (v: any) => void = () => {};
  private alTocar: () => void = () => {};
  private soltar: Array<() => void> = [];

  ngOnChanges(): void {
    this.recalcular();
  }

  ngOnDestroy(): void {
    this.soltarEscuchas();
  }

  // ── Formularios (ngModel) ─────────────────────────────────────────────
  writeValue(v: any): void {
    this.valor = v ?? null;
    this.cdr.markForCheck();
  }

  registerOnChange(fn: (v: any) => void): void { this.alCambiar = fn; }
  registerOnTouched(fn: () => void): void { this.alTocar = fn; }

  setDisabledState(deshabilitado: boolean): void {
    this.deshabilitadoPorFormulario = deshabilitado;
    this.cdr.markForCheck();
  }

  // ── Lo que se muestra ─────────────────────────────────────────────────
  get inhabilitado(): boolean { return this.deshabilitado || this.deshabilitadoPorFormulario; }
  get todas(): any[] { return this.opciones ?? []; }
  get conBuscador(): boolean { return this.buscable === 'auto' ? this.todas.length > 7 : !!this.buscable; }
  /**
   * La columna de prefijos sólo si alguna opción tiene uno: una presentación
   * que lo define pero lo deja vacío (estados de pago) mostraba "—" en todas.
   */
  get hayPrefijos(): boolean {
    const prefijo = this.presentacion?.prefijo;
    return !!prefijo && this.todas.some(o => !!prefijo(o));
  }
  get haySeleccion(): boolean { return !this.esVacio(this.valor); }
  /** Opciones que quedan con la búsqueda (sin contar los títulos de grupo). */
  get cantidadVisible(): number { return this.filas.filter(f => f.grupo === undefined).length; }

  /** La opción de la lista que corresponde al valor (o el valor mismo si la lista todavía no llegó). */
  get seleccionada(): any {
    if (this.esVacio(this.valor)) return null;
    const enLista = this.todas.find(o => this.coincide(o, this.valor));
    if (enLista !== undefined) return enLista;
    // Con valor() el ngModel guarda un dato suelto (la IP): si todavía no está
    // en la lista, se muestra tal cual.
    return this.presentacion?.valor ? { __suelto: this.valor } : this.valor;
  }

  etiquetaDe(o: any): string {
    if (o === VACIO) return this.textoVacio;
    if (o?.__suelto !== undefined) return String(o.__suelto);
    const f = this.presentacion?.etiqueta;
    return f ? f(o) : String(o?.label ?? o?.nombre ?? o?.name ?? o ?? '');
  }

  detalleDe(o: any): string | null { return this.especial(o) ? null : (this.presentacion?.detalle?.(o) || null); }
  prefijoDe(o: any): string | null { return this.especial(o) ? null : (this.presentacion?.prefijo?.(o) || null); }
  insigniaDe(o: any): InsigniaSelect | null { return this.especial(o) ? null : (this.presentacion?.insignia?.(o, this.todas) || null); }
  atenuadaDe(o: any): boolean { return !this.especial(o) && !!this.presentacion?.atenuada?.(o); }
  deshabilitadaDe(o: any): boolean { return !this.especial(o) && !!this.presentacion?.deshabilitada?.(o); }

  esSeleccionada(o: any): boolean {
    return o === VACIO ? this.esVacio(this.valor) : !this.esVacio(this.valor) && this.coincide(o, this.valor);
  }

  private esVacio(v: any): boolean {
    return v == null || v === this.valorVacio;
  }

  private especial(o: any): boolean {
    return o === VACIO || o?.__suelto !== undefined;
  }

  /** Si la opción corresponde al valor del ngModel. */
  private coincide(opcion: any, valor: any): boolean {
    const p = this.presentacion;
    if (p?.valor) return this.mismo(p.valor(opcion), valor);
    return p?.clave ? this.mismo(p.clave(opcion), p.clave(valor)) : opcion === valor;
  }

  /**
   * 3 y "3" son el mismo id: el <select> nativo con [value] pasaba los números
   * a texto al elegir, y el valor inicial del formulario suele venir como número.
   */
  private mismo(a: any, b: any): boolean {
    return a === b || (a != null && b != null && typeof a !== 'object' && typeof b !== 'object' && String(a) === String(b));
  }

  // ── Lista filtrada y agrupada ─────────────────────────────────────────
  recalcular(): void {
    const q = this.normalizar(this.busqueda);
    const texto = (o: any) => this.presentacion?.buscarEn?.(o) ?? `${this.etiquetaDe(o)} ${this.detalleDe(o) ?? ''}`;
    let coinciden = this.todas.filter(o => q
      ? this.normalizar(texto(o)).includes(q)
      : !this.presentacion?.soloAlBuscar?.(o));

    const relevancia = this.presentacion?.relevancia;
    if (q && relevancia) coinciden.sort((a, b) => relevancia(b, q) - relevancia(a, q));

    this.excedentes = this.limite > 0 ? Math.max(0, coinciden.length - this.limite) : 0;
    if (this.excedentes) coinciden = coinciden.slice(0, this.limite);

    const grupoDe = this.presentacion?.grupo;
    const grupos = grupoDe ? [...new Set(coinciden.map(o => grupoDe(o) ?? ''))] : [];
    const agrupar = grupos.length > 1;

    const filas: Fila[] = [];
    const visibles: any[] = [];

    if (this.permitirVacio && !q) {
      filas.push({ opcion: VACIO, indice: 0 });
      visibles.push(VACIO);
    }

    const ordenadas = agrupar ? grupos.flatMap(g => coinciden.filter(o => (grupoDe!(o) ?? '') === g)) : coinciden;
    let grupoActual: string | null = null;

    for (const o of ordenadas) {
      if (agrupar) {
        const g = grupoDe!(o) ?? '';
        if (g !== grupoActual) {
          grupoActual = g;
          filas.push({ grupo: g || 'Otras', indice: -1 });
        }
      }
      filas.push({ opcion: o, indice: visibles.length });
      visibles.push(o);
    }

    this.filas = filas;
    this.visibles = visibles;
    if (this.activa >= visibles.length) this.activa = visibles.length - 1;
  }

  buscar(texto: string): void {
    this.busqueda = texto;
    this.recalcular();
    this.activa = this.visibles.length ? 0 : -1;
    this.cdr.markForCheck();
  }

  readonly trackFila = (_: number, f: Fila) => (f.grupo !== undefined ? `g:${f.grupo}` : `o:${f.indice}`);

  // ── Abrir, elegir, cerrar ─────────────────────────────────────────────
  alternar(evento?: Event): void {
    evento?.preventDefault();
    this.abierto ? this.cerrar() : this.abrir();
  }

  abrir(): void {
    if (this.inhabilitado || this.abierto || !this.enNavegador) return;

    this.busqueda = '';
    this.recalcular();
    const actual = this.visibles.findIndex(o => this.esSeleccionada(o));
    this.activa = actual >= 0 ? actual : (this.visibles.length ? 0 : -1);

    this.posicionar();
    this.abierto = true;
    this.escuchar();
    this.cdr.markForCheck();

    setTimeout(() => {
      if (this.conBuscador) this.buscador?.nativeElement.focus();
      this.verActiva();
    });
  }

  cerrar(devolverFoco = false): void {
    if (!this.abierto) return;
    this.abierto = false;
    this.busqueda = '';
    this.soltarEscuchas();
    this.alTocar();
    if (devolverFoco) this.disparador?.nativeElement.focus();
    this.cdr.markForCheck();
  }

  elegir(o: any, evento?: Event): void {
    // Dentro de un <label>, el clic también "activa" el botón y lo volvía a abrir.
    evento?.preventDefault();

    if (this.deshabilitadaDe(o)) return;

    const p = this.presentacion;
    const nuevo = o === VACIO ? this.valorVacio : (p?.valor ? p.valor(o) : o);
    const igualQueAntes = o === VACIO ? this.esVacio(this.valor) : !this.esVacio(this.valor) && this.coincide(o, this.valor);

    this.valor = nuevo;
    if (!igualQueAntes) {
      this.alCambiar(nuevo);
      this.cambio.emit(nuevo);
    }
    this.cerrar(true);
  }

  // ── Teclado ───────────────────────────────────────────────────────────
  tecla(e: KeyboardEvent): void {
    if (this.inhabilitado) return;

    if (!this.abierto) {
      // Enter y espacio los resuelve el clic nativo del botón.
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); this.abrir(); }
      return;
    }

    switch (e.key) {
      case 'ArrowDown': e.preventDefault(); this.mover(1); break;
      case 'ArrowUp':   e.preventDefault(); this.mover(-1); break;
      case 'Home':
      case 'End':
        if (!this.conBuscador && this.visibles.length) {
          e.preventDefault();
          this.activa = e.key === 'Home' ? 0 : this.visibles.length - 1;
          this.verActiva();
        }
        break;
      case 'Enter':
        e.preventDefault();
        if (this.activa >= 0) this.elegir(this.visibles[this.activa]);
        break;
      case 'Escape':
        // Que no cierre también el modal donde está el selector.
        e.preventDefault();
        e.stopPropagation();
        this.cerrar(true);
        break;
      case 'Tab':
        this.cerrar();
        break;
      default:
        // Sin buscador, una letra salta a la primera opción que empieza así.
        if (!this.conBuscador && e.key.length === 1) {
          const k = this.normalizar(e.key);
          const i = this.visibles.findIndex(o => this.normalizar(this.etiquetaDe(o)).startsWith(k));
          if (i >= 0) { this.activa = i; this.verActiva(); }
        }
    }
    this.cdr.markForCheck();
  }

  private mover(paso: number): void {
    const n = this.visibles.length;
    if (!n) return;
    this.activa = this.activa < 0 ? 0 : (this.activa + paso + n) % n;
    this.verActiva();
  }

  private verActiva(): void {
    setTimeout(() => {
      this.lista?.nativeElement.querySelector(`#${this.id}-op-${this.activa}`)?.scrollIntoView({ block: 'nearest' });
    });
  }

  // ── Posición del panel ────────────────────────────────────────────────
  /**
   * El panel va con position: fixed para salir de los contenedores con scroll
   * y de los modales. Si un ancestro tiene transform (la animación de un
   * modal), fixed pasa a medirse desde ese ancestro: se descuenta su posición.
   */
  private posicionar(): void {
    const b = this.disparador?.nativeElement.getBoundingClientRect();
    if (!b) return;

    const margen = 8;
    const abajo = window.innerHeight - b.bottom - margen;
    const arriba = b.top - margen;
    const haciaArriba = abajo < 220 && arriba > abajo;
    const width = Math.min(Math.max(b.width, 280), window.innerWidth - margen * 2);
    const left = Math.max(margen, Math.min(b.left, window.innerWidth - width - margen));
    const buscador = this.conBuscador ? 42 : 0;
    const origen = this.origenDelFixed();

    this.posicion = {
      top: (haciaArriba ? b.top - 4 : b.bottom + 4) - origen.top,
      left: left - origen.left,
      width,
      alto: Math.max(120, Math.min(340, (haciaArriba ? arriba : abajo) - buscador - 8)),
      arriba: haciaArriba,
    };
  }

  private origenDelFixed(): { top: number; left: number } {
    let el = this.host.nativeElement.parentElement;
    while (el && el !== document.body) {
      const s = getComputedStyle(el);
      if (s.transform !== 'none' || s.filter !== 'none' || s.perspective !== 'none' || /paint|layout|strict|content/.test(s.contain)) {
        const r = el.getBoundingClientRect();
        return { top: r.top, left: r.left };
      }
      el = el.parentElement;
    }
    return { top: 0, left: 0 };
  }

  private escuchar(): void {
    this.zone.runOutsideAngular(() => {
      const fuera = (e: Event) => {
        if (!this.host.nativeElement.contains(e.target as Node)) this.zone.run(() => this.cerrar());
      };
      let pendiente = false;
      const reubicar = (e: Event) => {
        // En «resize» el target es la ventana, que no es un nodo: contains() lanzaba.
        if (pendiente || (e.target instanceof Node && this.lista?.nativeElement.contains(e.target))) return;
        pendiente = true;
        requestAnimationFrame(() => {
          pendiente = false;
          this.zone.run(() => { this.posicionar(); this.cdr.markForCheck(); });
        });
      };

      document.addEventListener('pointerdown', fuera, true);
      window.addEventListener('resize', reubicar);
      window.addEventListener('scroll', reubicar, true);

      this.soltar = [
        () => document.removeEventListener('pointerdown', fuera, true),
        () => window.removeEventListener('resize', reubicar),
        () => window.removeEventListener('scroll', reubicar, true),
      ];
    });
  }

  private soltarEscuchas(): void {
    this.soltar.forEach(f => f());
    this.soltar = [];
  }

  private normalizar(t: string): string {
    return String(t ?? '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  }
}
