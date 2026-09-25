import { CommonModule } from '@angular/common';
import { Component, ElementRef, HostListener, OnInit, ViewChild, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MetaWhatsappService } from '../../../services/meta-whatsapp.service';
import { ToastService } from '../../../../services/toast.service';
import { DialogService } from '../../../../services/dialog.service';
import {
  Bloque, ConfigBot, FICHAS, FichaBloque, Flujo, META, PALETA, TipoBloque,
  nuevoBloque, nuevoFlujo, nuevoId,
} from './bot-modelo';
import { Aviso, bloqueDeArranque, revisar, variablesDisponibles } from './bot-revision';

/** Un mensaje de la prueba, como lo vería el cliente. */
interface MensajeProbado {
  tipo: string;
  texto?: string;
  encabezado?: string | null;
  botones?: { id: string; title: string }[];
  secciones?: { title: string; rows: { id: string; title: string; description?: string }[] }[];
  boton?: string;
  url?: string;
  nombre?: string;
  /** Lo que escribió el operador en la prueba. */
  mio?: boolean;
}

/**
 * El constructor de bots de WhatsApp.
 *
 * Lo que había antes dibujaba bien pero no servía: los bloques se guardaban en
 * la base y nadie los ejecutaba, así que un flujo dibujado no le pasaba nada al
 * cliente. Ahora los corre MotorDeFlujos en el backend, y esta pantalla se
 * apoya en dos cosas que faltaban:
 *
 *   - Las herramientas de Meta como bloques propios: botones de respuesta
 *     rápida, listas desplegables y el botón que abre una dirección, cada
 *     opción con su propio camino. Antes «botones» era sólo una preferencia del
 *     menú principal.
 *   - Un probador. Se conversa con el flujo acá mismo, sin escribirle a nadie,
 *     y se ve exactamente lo que el cliente recibiría.
 *
 * El diseño usa el tema de la plataforma (np-*) y no un CSS aparte: así respeta
 * el modo oscuro y no parece otra aplicación.
 */
@Component({
  selector: 'app-wa-meta-bot',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './wa-meta-bot.component.html',
  styleUrl: './wa-meta-bot.component.scss',
})
export class WaMetaBotComponent implements OnInit {
  private api = inject(MetaWhatsappService);
  private toast = inject(ToastService);
  private dialog = inject(DialogService);

  @ViewChild('lienzo') lienzo!: ElementRef<HTMLElement>;

  readonly FICHAS = FICHAS;
  readonly PALETA = PALETA;
  readonly META = META;

  cargando = true;
  guardando = false;
  /** Hay cambios sin guardar. */
  sucio = false;

  panel: 'bloque' | 'menu' | 'ajustes' | 'revision' = 'bloque';
  flujo!: Flujo;
  bloque: Bloque | null = null;
  zoom = 1;

  config: ConfigBot = {
    enabled: false,
    trigger_word: 'hola, buenas, menu',
    welcome_message: 'Hola 👋 Soy el asistente de {{empresa}}.\n\n¿En qué te puedo ayudar?',
    menu_type: 'buttons',
    menu_title: '¿En qué te puedo ayudar?',
    options: [],
    flows: [],
    variables: [],
    settings: { fallback_message: 'No entendí. Escribí *menu* para volver al inicio.', max_retries: 2, session_timeout_minutes: 5 },
  };

  // ── Carga y guardado ────────────────────────────────────────────────────

  ngOnInit(): void {
    this.api.getBotConfig().subscribe({
      next: (r: any) => {
        this.aplicar(r?.data ?? {});
        this.cargando = false;
      },
      error: () => {
        this.cargando = false;
        this.toast.error('No se pudo leer la configuración del bot.');
        this.aplicar({});
      },
    });
  }

  /**
   * Acomoda lo que viene de la base.
   *
   * Los flujos viejos podían no tener coordenadas ni ids: sin esto la pantalla
   * los dibujaba todos encima del origen.
   */
  private aplicar(d: any): void {
    this.config = {
      ...this.config,
      ...d,
      options: Array.isArray(d?.options) ? d.options : [],
      flows: Array.isArray(d?.flows) ? d.flows : [],
      variables: Array.isArray(d?.variables) ? d.variables : [],
      settings: { ...this.config.settings, ...(d?.settings || {}) },
    };

    this.config.flows = this.config.flows.filter(Boolean).map((f: any, i: number) => ({
      ...f,
      id: f.id || nuevoId(`flujo${i}`),
      name: f.name || `Flujo ${i + 1}`,
      is_active: f.is_active !== false,
      steps: (Array.isArray(f.steps) ? f.steps : []).map((b: any, j: number) => ({
        ...b,
        id: b.id || nuevoId('b'),
        type: (FICHAS[b.type as TipoBloque] ? b.type : 'message') as TipoBloque,
        x: Number.isFinite(b.x) ? b.x : 60 + (j % 3) * 260,
        y: Number.isFinite(b.y) ? b.y : 40 + Math.floor(j / 3) * 170,
        params: Array.isArray(b.params) ? b.params : [],
        headers: Array.isArray(b.headers) ? b.headers : [],
        buttons: Array.isArray(b.buttons) ? b.buttons : undefined,
        sections: Array.isArray(b.sections) ? b.sections : undefined,
      })),
    }));

    this.config.options = this.config.options.map((o: any, i: number) => ({ ...o, id: o.id || nuevoId('op'), key: o.key ?? String(i + 1) }));

    if (!this.config.flows.length) this.config.flows = [nuevoFlujo('Atención al cliente')];

    this.elegirFlujo(this.config.flows[0]);
    this.sucio = false;
  }

  guardar(): void {
    this.guardando = true;

    this.api.updateBotConfig(this.config).subscribe({
      next: () => {
        this.guardando = false;
        this.sucio = false;
        this.toast.success('Bot guardado.');
      },
      error: (e: any) => {
        this.guardando = false;
        this.toast.error(e?.error?.error || e?.error?.message || 'No se pudo guardar.');
      },
    });
  }

  /** Cualquier cambio del formulario pasa por acá para saber si falta guardar. */
  toco(): void { this.sucio = true; }

  async alternarBot(): Promise<void> {
    if (!this.config.enabled) {
      const problemas = this.avisos.filter(a => a.nivel === 'error');

      if (problemas.length && !await this.dialog.confirm(
        `Hay ${problemas.length} problema(s) que van a cortar la conversación. ¿Activar igual?`,
        { okLabel: 'Activar igual', cancelLabel: 'Revisar primero' },
      )) {
        this.panel = 'revision';
        return;
      }
    }

    this.config.enabled = !this.config.enabled;
    this.toco();
  }

  // ── Flujos ──────────────────────────────────────────────────────────────

  elegirFlujo(f: Flujo): void {
    this.flujo = f;
    this.bloque = f.steps[0] ?? null;
    this.panel = 'bloque';
    this.cerrarProbador();
  }

  agregarFlujo(): void {
    const f = nuevoFlujo('Flujo nuevo');
    this.config.flows.push(f);
    this.elegirFlujo(f);
    this.toco();
  }

  duplicarFlujo(): void {
    const copia: Flujo = JSON.parse(JSON.stringify(this.flujo));
    copia.id = nuevoId('flujo');
    copia.name = `${this.flujo.name} (copia)`;

    // Ids nuevos, respetando las rutas internas: si se copian los mismos, los
    // dos flujos se pisan al guardar.
    const mapa = new Map<string, string>();
    copia.steps.forEach(b => mapa.set(b.id, nuevoId('b')));
    copia.steps.forEach(b => {
      b.id = mapa.get(b.id)!;
      for (const c of ['next_step', 'true_step', 'false_step', 'error_step'] as const) {
        if (b[c]) b[c] = mapa.get(String(b[c])) ?? null;
      }
      b.buttons?.forEach(x => { if (x.next_step) x.next_step = mapa.get(String(x.next_step)) ?? null; });
      b.sections?.forEach(s => s.rows?.forEach(x => { if (x.next_step) x.next_step = mapa.get(String(x.next_step)) ?? null; }));
    });

    this.config.flows.push(copia);
    this.elegirFlujo(copia);
    this.toco();
  }

  async borrarFlujo(): Promise<void> {
    if (this.config.flows.length === 1) {
      this.toast.info('Tiene que quedar al menos un flujo.');
      return;
    }

    if (!await this.dialog.confirm(`¿Eliminar el flujo «${this.flujo.name}»?`)) return;

    const i = this.config.flows.indexOf(this.flujo);
    this.config.flows.splice(i, 1);
    this.elegirFlujo(this.config.flows[Math.max(0, i - 1)]);
    this.toco();
  }

  /** ¿Algún botón del menú principal lleva a este flujo? */
  enElMenu(f: Flujo): boolean {
    return this.config.options.some(o => o.flow_id === f.id);
  }

  // ── Bloques ─────────────────────────────────────────────────────────────

  elegirBloque(b: Bloque): void {
    this.bloque = b;
    this.panel = 'bloque';
  }

  agregar(type: TipoBloque): void {
    const n = this.flujo.steps.length;
    const b = nuevoBloque(type, 60 + (n % 3) * 260, 40 + Math.floor(n / 3) * 180);

    // Se engancha al último bloque suelto: dibujar es poner cosas en orden, no
    // conectar a mano cada vez.
    const suelto = [...this.flujo.steps].reverse().find(x =>
      !x.next_step && x.type !== 'end' && x.type !== 'transfer_agent' && x.type !== 'condition' && !FICHAS[x.type].espera);

    if (suelto) suelto.next_step = b.id;

    this.flujo.steps.push(b);
    this.elegirBloque(b);
    this.toco();
  }

  async borrarBloque(b: Bloque): Promise<void> {
    const i = this.flujo.steps.indexOf(b);
    if (i < 0) return;

    this.flujo.steps.splice(i, 1);

    // Nadie puede quedar apuntando a un bloque borrado: eso deja al cliente
    // esperando una respuesta que no llega.
    for (const x of this.flujo.steps) {
      for (const c of ['next_step', 'true_step', 'false_step', 'error_step'] as const) {
        if (x[c] === b.id) x[c] = null;
      }
      x.buttons?.forEach(y => { if (y.next_step === b.id) y.next_step = null; });
      x.sections?.forEach(s => s.rows?.forEach(y => { if (y.next_step === b.id) y.next_step = null; }));
    }

    if (this.bloque?.id === b.id) this.bloque = this.flujo.steps[Math.max(0, i - 1)] ?? null;
    this.toco();
  }

  marcarInicio(b: Bloque): void {
    this.flujo.steps.forEach(x => x.is_start = x.id === b.id);
    this.toco();
  }

  esInicio(b: Bloque): boolean {
    return bloqueDeArranque(this.flujo)?.id === b.id;
  }

  ficha(b: Bloque): FichaBloque { return FICHAS[b.type]; }

  /** Lo que se lee dentro del bloque en el lienzo. */
  resumen(b: Bloque): string {
    switch (b.type) {
      case 'buttons': return (b.buttons ?? []).map(x => x.title).join(' · ') || 'Sin botones';
      case 'list': return (b.sections ?? []).flatMap(s => s.rows ?? []).map(f => f.title).join(' · ') || 'Sin opciones';
      case 'input': return `${b.message || 'Pregunta'} → {{${b.variable_name || '?'}}}`;
      case 'cliente': return `Busca por ${b.lookup_by === 'dni' ? 'cédula' : 'teléfono'} (${b.lookup_value || '—'})`;
      case 'api_call': return `${b.method} ${b.endpoint || '—'} → {{${b.save_response_to || '?'}}}`;
      case 'condition': return `${b.condition_variable || '?'} ${this.textoOperador(b.condition_operator)} ${b.condition_value ?? ''}`.trim();
      case 'delay': return `Pausa de ${b.delay_seconds ?? 0} s`;
      case 'image': case 'document': return b.media_caption || b.media_url || '—';
      case 'link': return `${b.button_text || 'Abrir'} → ${b.url || '—'}`;
      case 'transfer_agent': return `Área: ${b.agent_department || 'soporte'}`;
      default: return b.message || FICHAS[b.type].para;
    }
  }

  textoOperador(op?: string): string {
    return ({ eq: 'es igual a', neq: 'no es', contains: 'contiene', empty: 'está vacío', not_empty: 'tiene algo', gt: 'es mayor que', lt: 'es menor que' } as any)[op ?? 'eq'] ?? 'es igual a';
  }

  // ── Botones y filas del bloque ──────────────────────────────────────────

  agregarBoton(b: Bloque): void {
    b.buttons ??= [];

    if (b.buttons.length >= META.MAX_BOTONES) {
      this.toast.info(`WhatsApp admite ${META.MAX_BOTONES} botones. Para más opciones usá el bloque de lista.`);
      return;
    }

    b.buttons.push({ id: nuevoId('op'), title: `Opción ${b.buttons.length + 1}`, next_step: null });
    this.toco();
  }

  agregarFila(b: Bloque): void {
    b.sections ??= [{ title: 'Opciones', rows: [] }];
    const total = b.sections.flatMap(s => s.rows ?? []).length;

    if (total >= META.MAX_FILAS) {
      this.toast.info(`WhatsApp admite ${META.MAX_FILAS} opciones por lista.`);
      return;
    }

    b.sections[0].rows.push({ id: nuevoId('f'), title: `Opción ${total + 1}`, description: '', next_step: null });
    this.toco();
  }

  quitarDe(lista: any[] | undefined, i: number): void {
    lista?.splice(i, 1);
    this.toco();
  }

  agregarPar(lista: 'params' | 'headers', b: Bloque): void {
    (b[lista] ??= []).push({ key: '', value: '' });
    this.toco();
  }

  /** Los bloques a los que se puede ir, para los desplegables de rutas. */
  get destinos(): Bloque[] {
    return this.flujo?.steps ?? [];
  }

  get variables(): string[] {
    return variablesDisponibles(this.config.flows);
  }

  /** Pega {{variable}} donde estaba el cursor del último campo tocado. */
  ponerVariable(v: string): void {
    const el = document.activeElement as HTMLInputElement | HTMLTextAreaElement | null;

    if (!el || !('value' in el) || !(el.tagName === 'INPUT' || el.tagName === 'TEXTAREA')) {
      navigator.clipboard?.writeText(`{{${v}}}`);
      this.toast.info(`{{${v}}} copiado: pegalo donde lo necesites.`);
      return;
    }

    const i = el.selectionStart ?? el.value.length;
    el.value = el.value.slice(0, i) + `{{${v}}}` + el.value.slice(el.selectionEnd ?? i);
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.focus();
    el.selectionStart = el.selectionEnd = i + v.length + 4;
    this.toco();
  }

  // ── Menú principal ──────────────────────────────────────────────────────

  agregarOpcion(): void {
    this.config.options.push({ id: nuevoId('op'), key: String(this.config.options.length + 1), label: '', flow_id: this.config.flows[0]?.id ?? '' });
    this.toco();
  }

  get demasiadosBotonesEnMenu(): boolean {
    return this.config.menu_type === 'buttons' && this.config.options.length > META.MAX_BOTONES;
  }

  // ── Revisión ────────────────────────────────────────────────────────────

  get avisos(): Aviso[] { return this.flujo ? revisar(this.flujo) : []; }
  get errores(): number { return this.avisos.filter(a => a.nivel === 'error').length; }

  irAlBloque(id?: string): void {
    const b = this.flujo.steps.find(x => x.id === id);
    if (b) this.elegirBloque(b);
  }

  // ── El lienzo ───────────────────────────────────────────────────────────

  private arrastrando: Bloque | null = null;
  private desfase = { x: 0, y: 0 };

  empezarArrastre(e: PointerEvent, b: Bloque): void {
    if ((e.target as HTMLElement).closest('button')) return;

    e.preventDefault();
    const p = this.puntoEnLienzo(e);
    this.arrastrando = b;
    this.desfase = { x: p.x - b.x, y: p.y - b.y };
    this.elegirBloque(b);
  }

  @HostListener('document:pointermove', ['$event'])
  moverBloque(e: PointerEvent): void {
    if (!this.arrastrando) return;

    const p = this.puntoEnLienzo(e);
    this.arrastrando.x = Math.max(8, Math.round(p.x - this.desfase.x));
    this.arrastrando.y = Math.max(8, Math.round(p.y - this.desfase.y));
  }

  @HostListener('document:pointerup')
  terminarArrastre(): void {
    if (this.arrastrando) this.toco();
    this.arrastrando = null;
  }

  private puntoEnLienzo(e: PointerEvent): { x: number; y: number } {
    const el = this.lienzo?.nativeElement;
    if (!el) return { x: 0, y: 0 };

    const caja = el.getBoundingClientRect();
    return {
      x: (e.clientX - caja.left + el.scrollLeft) / this.zoom,
      y: (e.clientY - caja.top + el.scrollTop) / this.zoom,
    };
  }

  /**
   * Acomoda los bloques en columna siguiendo las rutas.
   *
   * Un flujo importado o dibujado a mano queda desordenado y no se entiende de
   * un vistazo, que es para lo único que sirve un lienzo.
   */
  ordenar(): void {
    const porId = new Map(this.flujo.steps.map(b => [b.id, b]));
    const puestos = new Set<string>();
    let fila = 0;

    const colocar = (id: string | null | undefined, columna: number): void => {
      if (!id || puestos.has(id)) return;
      const b = porId.get(id);
      if (!b) return;

      puestos.add(id);
      b.x = 40 + columna * 290;
      b.y = 30 + fila * 165;
      fila++;

      for (const x of b.buttons ?? []) colocar(x.next_step, columna + 1);
      for (const s of b.sections ?? []) for (const f of s.rows ?? []) colocar(f.next_step, columna + 1);
      colocar(b.true_step, columna + 1);
      colocar(b.false_step, columna + 1);
      colocar(b.error_step, columna + 1);
      colocar(b.next_step, columna);
    };

    colocar(bloqueDeArranque(this.flujo)?.id, 0);

    // Los que quedaron sueltos, al costado, a la vista.
    for (const b of this.flujo.steps) {
      if (!puestos.has(b.id)) {
        b.x = 40 + 3 * 290;
        b.y = 30 + fila * 165;
        fila++;
      }
    }

    this.toco();
  }

  /** Las líneas entre bloques: de dónde a dónde, y con qué etiqueta. */
  get lineas(): { d: string; etiqueta: string; tono: string; x: number; y: number }[] {
    const porId = new Map(this.flujo.steps.map(b => [b.id, b]));
    const salida: { d: string; etiqueta: string; tono: string; x: number; y: number }[] = [];

    const unir = (a: Bloque, bId: string | null | undefined, etiqueta: string, tono: string) => {
      if (!bId) return;
      const b = porId.get(bId);
      if (!b) return;

      const x1 = a.x + 115, y1 = a.y + 92;
      const x2 = b.x + 115, y2 = b.y - 4;
      const curva = Math.max(30, Math.abs(y2 - y1) / 2);

      salida.push({
        d: `M ${x1} ${y1} C ${x1} ${y1 + curva}, ${x2} ${y2 - curva}, ${x2} ${y2}`,
        etiqueta, tono,
        x: (x1 + x2) / 2, y: (y1 + y2) / 2,
      });
    };

    for (const b of this.flujo.steps) {
      unir(b, b.next_step, '', 'normal');
      unir(b, b.true_step, 'sí', 'si');
      unir(b, b.false_step, 'no', 'no');
      unir(b, b.error_step, 'error', 'error');
      b.buttons?.forEach(x => unir(b, x.next_step, x.title, 'opcion'));
      b.sections?.forEach(s => s.rows?.forEach(x => unir(b, x.next_step, x.title, 'opcion')));
    }

    return salida;
  }

  get anchoLienzo(): number {
    return Math.max(1200, ...this.flujo.steps.map(b => b.x + 320));
  }

  get altoLienzo(): number {
    return Math.max(720, ...this.flujo.steps.map(b => b.y + 220));
  }

  trackBloque = (_: number, b: Bloque) => b.id;

  // ── El probador ─────────────────────────────────────────────────────────

  probadorAbierto = false;
  probando = false;
  charla: MensajeProbado[] = [];
  private pasoProbado: string | null = null;
  private datosProbados: any = {};
  terminoLaPrueba = false;
  escribiendo = '';

  abrirProbador(): void {
    this.probadorAbierto = true;
    this.reiniciarPrueba();
  }

  cerrarProbador(): void {
    this.probadorAbierto = false;
    this.charla = [];
  }

  reiniciarPrueba(): void {
    this.charla = [];
    this.pasoProbado = null;
    this.datosProbados = {};
    this.terminoLaPrueba = false;
    this.correrPrueba();
  }

  /** Manda lo que el operador escribió en el probador. */
  enviarEnPrueba(texto?: string): void {
    const t = (texto ?? this.escribiendo).trim();
    if (!t || this.probando || this.terminoLaPrueba) return;

    this.charla.push({ tipo: 'texto', texto: t, mio: true });
    this.escribiendo = '';
    this.correrPrueba(t);
  }

  private correrPrueba(mensaje?: string): void {
    this.probando = true;

    this.api.probarBot({
      flow_id: this.flujo.id,
      flows: this.config.flows,
      paso: this.pasoProbado,
      datos: this.datosProbados,
      mensaje,
    }).subscribe({
      next: (r: any) => {
        this.probando = false;
        const d = r?.data ?? {};
        this.charla.push(...(d.mensajes ?? []));
        this.pasoProbado = d.paso ?? null;
        this.datosProbados = d.datos ?? {};
        this.terminoLaPrueba = !!d.terminado;

        if (d.transferir) {
          this.charla.push({ tipo: 'aviso', texto: `— La conversación pasa al área «${d.transferir}» y el bot se calla. —` });
        } else if (d.terminado) {
          this.charla.push({ tipo: 'aviso', texto: '— Fin del flujo. —' });
        }
      },
      error: (e: any) => {
        this.probando = false;
        this.toast.error(e?.error?.error || 'No se pudo probar el flujo.');
      },
    });
  }

  /** Las variables que quedaron cargadas durante la prueba, para ver qué pasó. */
  get variablesDeLaPrueba(): { nombre: string; valor: string }[] {
    return Object.entries(this.datosProbados ?? {})
      .filter(([k]) => k !== 'telefono' && k !== 'empresa')
      .map(([k, v]) => ({ nombre: k, valor: typeof v === 'object' ? JSON.stringify(v) : String(v) }));
  }

  exportar(): void {
    const b = new Blob([JSON.stringify(this.config, null, 2)], { type: 'application/json' });
    const u = URL.createObjectURL(b);
    const a = document.createElement('a');
    a.href = u;
    a.download = `bot-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(u);
  }
}
