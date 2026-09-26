import { DialogService } from '../../../../services/dialog.service';
import { ToastService } from '../../../../services/toast.service';
import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MetaWhatsappService } from '../../../services/meta-whatsapp.service';
import { NpSelectComponent, PresentacionSelect } from '../../../../common/np-select/np-select.component';
import { OpcionSimple, PRESENTACION_SIMPLE } from '../../../../common/np-select/presentaciones';

interface TemplateComponent {
  type: 'HEADER' | 'BODY' | 'FOOTER' | 'BUTTONS';
  format?: 'TEXT' | 'IMAGE' | 'VIDEO' | 'DOCUMENT';
  text?: string;
  example?: any;
  buttons?: { type: string; text: string; url?: string; phone_number?: string }[];
}

/** Qué variable del sistema va en cada espacio de la plantilla. */
interface Binding {
  event: string;
  label: string;
  description: string;
  suggested: string | null;
  /** Los avisos programados salen a una hora; los demás reaccionan a un hecho. */
  programado: boolean;
  template_name: string | null;
  language: string;
  enabled: boolean;
  params: string[];
  /** Cuándo sale, para los programados: referencia y días. */
  config: any;
  slots: number;
  dirty: boolean;
  saving: boolean;
  ok: boolean;
  message: string;
  /** A cuántos les saldría hoy, para no activarlo a ciegas. */
  previewTotal: number | null;
  previewing: boolean;
  testPhone: string;
  testing: boolean;
}

interface Variable { key: string; label: string; example: string; }

@Component({
  selector: 'app-wa-meta-templates',
  standalone: true,
  imports: [CommonModule, FormsModule, NpSelectComponent],
  templateUrl: './wa-meta-templates.component.html',
  styleUrl: './wa-meta-templates.component.scss',
  host: { class: 'np-console' },
})
export class WaMetaTemplatesComponent implements OnInit {
  private toast = inject(ToastService);
  private dialog = inject(DialogService);
  tab: 'templates' | 'automations' | 'sistema' = 'templates';

  loading = true;
  loadingBindings = true;
  templates: any[] = [];
  bindings: Binding[] = [];
  variables: Variable[] = [];
  /** Contra qué fecha se cuentan los días de los avisos programados. */
  referencias: { key: string; label: string; description: string }[] = [];

  showModal = false;
  isPreviewMode = false;
  submitting = false;
  submitResult: { ok: boolean; message: string } | null = null;

  newTemplate: any = { name: '', category: 'UTILITY', language: 'es_CO', components: [] };
  /** Valores de ejemplo indexados por número de espacio menos uno. */
  variableExamples: string[] = [];
  /** Espacios que el texto realmente usa hoy, ordenados. */
  usedSlots: number[] = [];
  previewComponents: TemplateComponent[] = [];

  /**
   * Qué aviso está desplegado en la lista.
   *
   * Antes cada evento mostraba su tarjeta completa —selector, mapeo de
   * variables, programación y vista previa— y con ocho eventos la pantalla se
   * volvía interminable. Ahora la lista es compacta y solo se abre el que se
   * está editando.
   */
  expandido: string | null = null;

  // ── Selectores ─────────────────────────────────────────────────────────────
  readonly presSimple = PRESENTACION_SIMPLE;

  /** Idioma a la izquierda; debajo, categoría, cuántos espacios pide y cómo empieza. En el modelo queda el nombre. */
  readonly presPlantillas: PresentacionSelect = {
    valor: t => t?.name,
    etiqueta: t => t?.name ?? '',
    prefijo: t => t?.language ?? null,
    detalle: t => {
      const n = this.slotsOf(t);
      const cuerpo = this.bodyOf(t).replace(/\s+/g, ' ').trim();
      return [
        this.categoryLabel(t?.category),
        n ? `${n} ${n === 1 ? 'variable' : 'variables'}` : null,
        cuerpo.length > 60 ? cuerpo.slice(0, 60).trimEnd() + '…' : cuerpo,
      ].filter(Boolean).join(' · ');
    },
    buscarEn: t => [t?.name, t?.language, this.bodyOf(t)].filter(Boolean).join(' '),
  };

  /** Cada variable con su valor de ejemplo, el mismo que usa la vista previa. */
  readonly presVariables: PresentacionSelect<Variable> = {
    valor: v => v?.key,
    etiqueta: v => v?.label ?? v?.key ?? '',
    detalle: v => (v?.example ? `ej: ${v.example}` : null),
  };

  readonly presReferencias: PresentacionSelect<{ key: string; label: string; description: string }> = {
    valor: r => r?.key,
    etiqueta: r => r?.label ?? r?.key ?? '',
    detalle: r => r?.description,
  };

  readonly opcionesCategoria: OpcionSimple[] = [
    { valor: 'UTILITY',        etiqueta: 'Utilidad',      detalle: 'Avisos de facturas, pagos y del servicio' },
    { valor: 'MARKETING',      etiqueta: 'Marketing',     detalle: 'Promociones y novedades' },
    { valor: 'AUTHENTICATION', etiqueta: 'Autenticación', detalle: 'Códigos de verificación' },
  ];

  readonly opcionesIdioma: OpcionSimple[] = [
    { valor: 'es_CO', etiqueta: 'Español (Colombia)', prefijo: 'es_CO' },
    { valor: 'es',    etiqueta: 'Español',            prefijo: 'es' },
    { valor: 'en',    etiqueta: 'Inglés',             prefijo: 'en' },
    { valor: 'pt_BR', etiqueta: 'Portugués (Brasil)', prefijo: 'pt_BR' },
  ];

  readonly opcionesFormato: OpcionSimple[] = [
    { valor: 'TEXT',     etiqueta: 'Texto',     detalle: 'Título en negrita arriba del mensaje' },
    { valor: 'IMAGE',    etiqueta: 'Imagen',    detalle: 'Una imagen desde una URL' },
    { valor: 'VIDEO',    etiqueta: 'Video',     detalle: 'Un video desde una URL' },
    { valor: 'DOCUMENT', etiqueta: 'Documento', detalle: 'Un archivo desde una URL' },
  ];

  readonly opcionesBoton: OpcionSimple[] = [
    { valor: 'QUICK_REPLY',  etiqueta: 'Respuesta rápida', detalle: 'El cliente responde con un toque' },
    { valor: 'URL',          etiqueta: 'Enlace',           detalle: 'Abre una página web' },
    { valor: 'PHONE_NUMBER', etiqueta: 'Teléfono',         detalle: 'Llama a un número' },
  ];

  alternar(evento: string): void {
    this.expandido = this.expandido === evento ? null : evento;
  }

  /* ── Plantillas que el sistema necesita para operar ──────────────────
   *
   * Una plantilla aprobada solo sirve en la cuenta de Meta donde fue
   * aprobada, así que no se pueden compartir entre empresas. El sistema trae
   * su catálogo y lo crea en la cuenta de cada una.
   */
  sistema: any[] = [];
  cargandoSistema = false;
  creandoSistema = false;

  get faltantes(): any[] { return this.sistema.filter(p => p.estado === 'NO_CREADA'); }
  get enRevision(): any[] { return this.sistema.filter(p => p.estado === 'PENDING'); }
  get rechazadas(): any[] { return this.sistema.filter(p => p.estado === 'REJECTED'); }
  get listas(): any[] { return this.sistema.filter(p => p.estado === 'APPROVED'); }

  /**
   * @param refrescar true = vuelve a preguntarle a Meta. Sin esto se usa lo
   *        último que se guardó, que es instantáneo y evita que la pantalla
   *        dependa de que la API de Meta responda.
   */
  cargarSistema(refrescar = false): void {
    this.cargandoSistema = true;
    this.meta.estadoPlantillasSistema(refrescar).subscribe({
      next: (r: any) => { this.sistema = r?.data ?? []; this.cargandoSistema = false; },
      error: () => { this.sistema = []; this.cargandoSistema = false; },
    });
  }

  async crearFaltantes(): Promise<void> {
    const cuantas = this.faltantes.length;
    if (!cuantas || this.creandoSistema) return;

    if (!await this.dialog.confirm(
      `Se crearán ${cuantas} plantilla${cuantas === 1 ? '' : 's'} en su cuenta de WhatsApp Business y quedarán en revisión de Meta. ` +
      `La aprobación puede tardar desde unos minutos hasta un día.`,
      { title: 'Crear las plantillas del sistema', okLabel: 'Crear' }
    )) return;

    this.creandoSistema = true;
    this.meta.crearPlantillasSistema(this.faltantes.map(p => p.evento)).subscribe({
      next: (r: any) => {
        this.creandoSistema = false;
        const d = r?.data ?? {};
        const n = (d.creadas || []).length;
        if (n) this.toast.success(`${n} plantilla${n === 1 ? '' : 's'} enviada${n === 1 ? '' : 's'} a revisión de Meta.`);
        if ((d.errores || []).length) this.toast.error(d.errores[0]);
        this.cargarSistema(true);
        this.loadBindings();
      },
      error: (e: any) => {
        this.creandoSistema = false;
        this.toast.error(e?.error?.data?.errores?.[0] || e?.error?.error || 'No se pudieron crear las plantillas.');
      },
    });
  }

  etiquetaEstado(estado: string): string {
    return ({
      APPROVED:   'Aprobada',
      PENDING:    'En revisión',
      REJECTED:   'Rechazada',
      NO_CREADA:  'Sin crear',
    } as Record<string, string>)[estado] ?? estado;
  }

  claseEstado(estado: string): string {
    return ({
      APPROVED:  'np-pill--active',
      PENDING:   'np-pill--warn',
      REJECTED:  'np-pill--danger',
      NO_CREADA: 'np-pill--neutral',
    } as Record<string, string>)[estado] ?? 'np-pill--neutral';
  }

  constructor(private meta: MetaWhatsappService) {}

  ngOnInit(): void {
    this.loadTemplates();
    this.loadBindings();
    this.cargarSistema();
  }

  // ── Carga ──────────────────────────────────────────────────────────────────

  loadTemplates(): void {
    this.loading = true;
    this.meta.getTemplates().subscribe({
      next: (r: any) => { this.templates = r.data || []; this.loading = false; this.syncSlots(); },
      error: () => { this.loading = false; },
    });
  }

  loadBindings(): void {
    this.loadingBindings = true;
    this.meta.getTemplateBindings().subscribe({
      next: (r: any) => {
        this.variables = r.variables || [];
        this.referencias = r.referencias || [];
        this.bindings = (r.bindings || []).map((b: any) => ({
          ...b,
          params: b.params || [],
          config: b.config || {},
          slots: 0,
          dirty: false,
          saving: false,
          ok: true,
          message: '',
          previewTotal: null,
          previewing: false,
          testPhone: '',
          testing: false,
        }));
        this.loadingBindings = false;
        this.syncSlots();
      },
      error: () => { this.loadingBindings = false; },
    });
  }

  /** Cuántos espacios pide cada plantilla elegida. */
  private syncSlots(): void {
    if (!this.templates.length || !this.bindings.length) return;
    this.bindings.forEach(b => this.recalcSlots(b));
  }

  // ── Plantillas de Meta ─────────────────────────────────────────────────────

  private aprobadasDe: any[] | null = null;
  private aprobadas: any[] = [];

  /** Se recuerda mientras no cambie la lista: el np-select recibe siempre el mismo arreglo. */
  get approvedTemplates(): any[] {
    if (this.aprobadasDe !== this.templates) {
      this.aprobadasDe = this.templates;
      this.aprobadas = this.templates.filter(t => t.status === 'APPROVED');
    }
    return this.aprobadas;
  }

  hasTemplate(name: string): boolean {
    return this.approvedTemplates.some(t => t.name === name);
  }

  private findTemplate(name: string | null): any | null {
    return name ? this.templates.find(t => t.name === name) ?? null : null;
  }

  bodyOf(t: any): string {
    return (t?.components || []).find((c: any) => c.type === 'BODY')?.text || '(sin cuerpo)';
  }

  /** Número de espacios distintos, no de apariciones: {{1}} dos veces es uno solo. */
  slotsOf(t: any): number {
    const matches = this.bodyOf(t).match(/\{\{\s*(\d+)\s*\}\}/g);
    if (!matches) return 0;
    const nums = matches.map(m => parseInt(m.replace(/[^\d]/g, ''), 10));
    return Math.max(...nums);
  }

  /** Nombre del aviso que ya usa esta plantilla, si alguno. */
  usedBy(name: string): string | null {
    return this.bindings.find(b => b.enabled && b.template_name === name)?.label ?? null;
  }

  statusLabel(status: string): string {
    switch (status) {
      case 'APPROVED': return 'Aprobada';
      case 'PENDING':  return 'En revisión';
      case 'REJECTED': return 'Rechazada';
      case 'PAUSED':   return 'Pausada';
      default:         return status;
    }
  }

  statusChip(status: string): string {
    switch (status) {
      case 'APPROVED': return 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300';
      case 'PENDING':  return 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300';
      case 'REJECTED': return 'bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-300';
      default:         return 'bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-300';
    }
  }

  categoryLabel(category: string): string {
    switch (category) {
      case 'UTILITY':        return 'Utilidad';
      case 'MARKETING':      return 'Marketing';
      case 'AUTHENTICATION': return 'Autenticación';
      default:               return category;
    }
  }

  componentLabel(type: string): string {
    switch (type) {
      case 'HEADER':  return 'Encabezado';
      case 'BODY':    return 'Cuerpo';
      case 'FOOTER':  return 'Pie';
      case 'BUTTONS': return 'Botones';
      default:        return type;
    }
  }

  // ── Avisos automáticos ─────────────────────────────────────────────────────

  get activeBindings(): number {
    return this.bindings.filter(b => b.enabled && b.template_name).length;
  }

  slotRange(n: number): number[] {
    return Array.from({ length: n }, (_, i) => i);
  }

  /** Etiqueta del espacio sin escribir llaves, que Angular interpretaría. */
  slotLabel(index: number): string {
    return `{{${index + 1}}}`;
  }

  onToggle(b: Binding): void {
    this.markDirty(b);
  }

  useSuggested(b: Binding): void {
    b.template_name = b.suggested;
    this.onTemplateChange(b);
  }

  onTemplateChange(b: Binding): void {
    this.recalcSlots(b);
    this.markDirty(b);
  }

  /**
   * Ajusta el número de espacios al de la plantilla elegida y propone un
   * relleno razonable para los que queden vacíos.
   */
  private recalcSlots(b: Binding): void {
    const template = this.findTemplate(b.template_name);
    b.slots = template ? this.slotsOf(template) : 0;

    const guess = ['cliente', 'valor', 'plan', 'factura', 'referencia', 'medio_pago', 'empresa', 'soporte'];
    const params = (b.params || []).slice(0, b.slots);

    while (params.length < b.slots) {
      const fallback = guess[params.length] ?? this.variables[0]?.key ?? 'cliente';
      params.push(fallback);
    }

    b.params = params;
  }

  markDirty(b: Binding): void {
    b.dirty = true;
    b.message = '';
  }

  /** El mensaje tal como le llegaría al cliente, con valores de ejemplo. */
  previewOf(b: Binding): string {
    const template = this.findTemplate(b.template_name);
    if (!template) return '';

    return this.bodyOf(template).replace(/\{\{\s*(\d+)\s*\}\}/g, (_m: string, digits: string) => {
      const key = b.params[parseInt(digits, 10) - 1];
      return this.variables.find(v => v.key === key)?.example ?? `{{${digits}}}`;
    });
  }

  saveBinding(b: Binding): void {
    b.saving = true;
    b.message = '';

    this.meta.saveTemplateBinding({
      event: b.event,
      template_name: b.template_name,
      language: this.findTemplate(b.template_name)?.language || b.language || 'es_CO',
      enabled: b.enabled,
      params: b.params.slice(0, b.slots),
      config: b.programado ? b.config : null,
    }).subscribe({
      next: () => {
        b.saving = false;
        b.dirty = false;
        b.ok = true;
        b.message = 'Guardado';
        setTimeout(() => (b.message = ''), 3000);
        if (b.programado) this.previewBinding(b);
      },
      error: (e: any) => {
        b.saving = false;
        b.ok = false;
        b.message = e.error?.error || 'No se pudo guardar';
      },
    });
  }

  // ── Avisos programados ─────────────────────────────────────────────────────

  /** A cuántos clientes les saldría hoy este aviso con los días configurados. */
  previewBinding(b: Binding): void {
    b.previewing = true;

    this.meta.previewBinding(b.event).subscribe({
      next: (r: any) => { b.previewTotal = r?.total ?? 0; b.previewing = false; },
      error: () => { b.previewTotal = null; b.previewing = false; },
    });
  }

  /** Manda la plantilla del aviso a un número, con datos de ejemplo. */
  testBinding(b: Binding): void {
    if (!b.template_name || b.testPhone.replace(/\D/g, '').length < 10) return;

    b.testing = true;
    b.message = '';

    this.meta.testBinding({
      phone: b.testPhone,
      template_name: b.template_name,
      language: this.findTemplate(b.template_name)?.language || b.language || 'es_CO',
      params: b.params.slice(0, b.slots),
    }).subscribe({
      next: () => {
        b.testing = false;
        b.ok = true;
        b.message = 'Prueba enviada al ' + b.testPhone;
      },
      error: (e: any) => {
        b.testing = false;
        b.ok = false;
        b.message = e.error?.error || 'No se pudo enviar la prueba';
      },
    });
  }

  // ── Variables del editor ───────────────────────────────────────────────────

  /**
   * Lee el texto y deja abajo exactamente los espacios que el texto usa.
   *
   * Pegar una plantilla con {{1}} y {{2}} crea sus dos campos solo; borrar un
   * {{2}} del texto le quita su campo. El valor que ya se había escrito se
   * conserva por si vuelve a aparecer.
   */
  private syncVariables(): void {
    const text: string = this.newTemplate.components
      .filter((c: any) => c.type === 'BODY' || (c.type === 'HEADER' && c.format === 'TEXT'))
      .map((c: any) => c.text || '')
      .join('\n');

    const found = Array.from(text.matchAll(/\{\{\s*(\d+)\s*\}\}/g))
      .map(m => parseInt(m[1], 10))
      .filter(n => n > 0);

    this.usedSlots = Array.from(new Set(found)).sort((a, b) => a - b);

    const max = this.usedSlots.length ? Math.max(...this.usedSlots) : 0;
    while (this.variableExamples.length < max) this.variableExamples.push('');
  }

  /** Meta exige que las variables vayan seguidas desde 1, sin huecos. */
  get slotsAreSequential(): boolean {
    return this.usedSlots.every((n, i) => n === i + 1);
  }

  /** Renumera los espacios del texto para que queden 1, 2, 3… sin huecos. */
  renumberVariables(): void {
    const orden = new Map<number, number>();
    this.usedSlots.forEach((slot, i) => orden.set(slot, i + 1));

    const valores = this.usedSlots.map(slot => this.variableExamples[slot - 1] ?? '');

    this.newTemplate.components.forEach((c: any) => {
      if (typeof c.text !== 'string') return;
      c.text = c.text.replace(/\{\{\s*(\d+)\s*\}\}/g, (m: string, d: string) => {
        const nuevo = orden.get(parseInt(d, 10));
        return nuevo ? `{{${nuevo}}}` : m;
      });
    });

    this.variableExamples = valores;
    this.onBodyChange();
  }

  /** Cualquier cambio de texto vuelve a sincronizar los campos de ejemplo. */
  onBodyChange(): void {
    this.syncVariables();
    this.updatePreview();
  }

  /** Falta algún valor de ejemplo: Meta los pide todos para revisar. */
  get missingExamples(): number[] {
    return this.usedSlots.filter(n => !(this.variableExamples[n - 1] || '').trim());
  }

  // ── Modal ──────────────────────────────────────────────────────────────────

  openModal(): void {
    this.showModal = true;
    this.isPreviewMode = false;
    this.submitResult = null;
    this.newTemplate = { name: '', category: 'UTILITY', language: 'es_CO', components: [{ type: 'BODY', text: '' }] };
    this.variableExamples = [];
    this.usedSlots = [];
    this.onBodyChange();
  }

  closeModal(): void {
    this.showModal = false;
    this.isPreviewMode = false;
  }

  previewTemplate(t: any): void {
    this.showModal = true;
    this.isPreviewMode = true;
    this.previewComponents = t.components || [];
    this.variableExamples = (t.components || [])
      .find((c: any) => c.type === 'BODY')?.example?.body_text?.[0] || [];
    this.usedSlots = Array.from(
      new Set(Array.from(this.bodyOf(t).matchAll(/\{\{\s*(\d+)\s*\}\}/g)).map(m => parseInt(m[1], 10)))
    ).sort((a, b) => a - b);
  }

  addComponent(type: string): void {
    const comp: any = { type };
    if (type === 'HEADER') comp.format = 'TEXT';
    if (type === 'BODY' || type === 'FOOTER') comp.text = '';
    if (type === 'BUTTONS') comp.buttons = [];
    this.newTemplate.components.push(comp);
    this.updatePreview();
  }

  removeComponent(index: number): void {
    this.newTemplate.components.splice(index, 1);
    this.updatePreview();
  }

  addButton(comp: any): void {
    (comp.buttons ||= []).push({ type: 'QUICK_REPLY', text: '' });
    this.updatePreview();
  }

  removeButton(comp: any, index: number): void {
    comp.buttons.splice(index, 1);
    this.updatePreview();
  }

  setHeaderHandle(comp: any, value: string): void {
    comp.example = { ...(comp.example || {}), header_handle: [value] };
  }

  get nextVarIndex(): number {
    return this.usedSlots.length ? Math.max(...this.usedSlots) + 1 : 1;
  }

  addVariable(): void {
    const body = this.newTemplate.components.find((c: any) => c.type === 'BODY');
    if (body) body.text = (body.text || '') + `{{${this.nextVarIndex}}}`;
    this.onBodyChange();
  }

  replaceVars(text: string = ''): string {
    return (text || '').replace(/\{\{\s*(\d+)\s*\}\}/g, (m: string, digits: string) => {
      return this.variableExamples[parseInt(digits, 10) - 1] || m;
    });
  }

  updatePreview(): void {
    this.previewComponents = JSON.parse(JSON.stringify(this.newTemplate.components));
  }

  private buildPayload(): any {
    const components = this.newTemplate.components.map((comp: any) => {
      const c: any = { type: comp.type };

      if (comp.type === 'HEADER') {
        c.format = comp.format;
        if (comp.format === 'TEXT') {
          c.text = comp.text;
          if (/\{\{\d+\}\}/.test(comp.text || '')) {
            c.example = { header_text: [this.variableExamples[0] || 'Ejemplo'] };
          }
        } else {
          c.example = { header_handle: [comp.example?.header_handle?.[0] || ''] };
        }
      }

      if (comp.type === 'BODY') {
        c.text = comp.text;
        if (this.usedSlots.length) {
          c.example = { body_text: [this.usedSlots.map(n => this.variableExamples[n - 1] || `Valor ${n}`)] };
        }
      }

      if (comp.type === 'FOOTER') c.text = comp.text;

      if (comp.type === 'BUTTONS') {
        c.buttons = (comp.buttons || []).map((b: any) => {
          const btn: any = { type: b.type, text: b.text };
          if (b.type === 'URL') btn.url = b.url;
          if (b.type === 'PHONE_NUMBER') btn.phone_number = b.phone_number;
          return btn;
        });
      }

      return c;
    });

    return {
      name: (this.newTemplate.name || '').toLowerCase().replace(/\s+/g, '_'),
      category: this.newTemplate.category,
      language: this.newTemplate.language,
      components,
    };
  }

  submitTemplate(): void {
    this.submitting = true;
    this.submitResult = null;

    this.meta.createTemplate(this.buildPayload()).subscribe({
      next: (r: any) => {
        this.submitting = false;
        this.submitResult = { ok: true, message: `Enviada a Meta. Estado: ${r.data?.status || 'PENDING'}.` };
        this.loadTemplates();
        setTimeout(() => this.closeModal(), 2000);
      },
      error: (e: any) => {
        this.submitting = false;
        this.submitResult = { ok: false, message: e.error?.error || e.error?.message || 'No se pudo crear la plantilla.' };
      },
    });
  }

  async deleteTemplate(name: string) {
    if (this.bindings.some(b => b.enabled && b.template_name === name)) {
      this.toast.error(`No puedes eliminar "${name}": la está usando un aviso automático activo.`);
      return;
    }
    if (!await this.dialog.confirm(`¿Eliminar la plantilla "${name}"?`)) return;

    this.meta.deleteTemplate(name).subscribe({
      next: () => this.loadTemplates(),
      error: () => this.toast.error('No se pudo eliminar la plantilla.'),
    });
  }
}
