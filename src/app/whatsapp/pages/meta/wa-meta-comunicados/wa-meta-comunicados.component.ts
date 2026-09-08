import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MetaWhatsappService } from '../../../services/meta-whatsapp.service';

/** Un espacio {{n}} de la plantilla: o lo llena el sistema, o lo escribe el operador. */
interface Slot {
  tipo: 'variable' | 'fijo';
  variable: string;
  valor: string;
}

interface Variable { key: string; label: string; example: string; }

interface Cliente {
  user_id: number;
  nombre: string;
  dni: string;
  phone: string;
  plan: string | null;
}

interface Campaign {
  id: number;
  name: string | null;
  template_name: string;
  language: string;
  status: string;
  recipients_count: number;
  sent_count: number;
  failed_count: number;
  test_phone: string | null;
  test_sent_at: string | null;
  created_at: string;
}

/**
 * Comunicados: mandar una plantilla aprobada a muchos clientes.
 *
 * La pantalla está ordenada como los pasos que hay que dar, y no deja saltarse
 * ninguno: cada mensaje se le cobra a la empresa, así que el botón de enviar
 * solo aparece cuando ya se mandó una prueba y se pudo ver.
 */
@Component({
  selector: 'app-wa-meta-comunicados',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './wa-meta-comunicados.component.html',
  styleUrl: './wa-meta-comunicados.component.scss',
  host: { class: 'np-console' },
})
export class WaMetaComunicadosComponent implements OnInit {
  vista: 'nuevo' | 'historial' = 'nuevo';

  cargando = true;
  templates: any[] = [];
  variables: Variable[] = [];
  campaigns: Campaign[] = [];

  // ── Paso 1: la plantilla ────────────────────────────────────────────────────
  plantilla = '';
  idioma = 'es_CO';
  nombre = '';
  slots: Slot[] = [];

  // ── Paso 2: a quién ─────────────────────────────────────────────────────────
  filtros = { solo_vigentes: true, servicio: 'todos', deuda: 'todos' };
  excluidos: number[] = [];
  totalDestinatarios = 0;
  contando = false;

  buscador = '';
  clientes: Cliente[] = [];
  cargandoClientes = false;
  mostrarClientes = false;

  // ── Paso 3: probar y enviar ─────────────────────────────────────────────────
  telefonoPrueba = '';
  probando = false;
  enviando = false;
  campaignId: number | null = null;
  probada = false;
  confirmando = false;

  aviso: { ok: boolean; texto: string } | null = null;

  /** Detalle de un envío ya hecho. */
  detalle: any = null;

  constructor(private meta: MetaWhatsappService) {}

  ngOnInit(): void {
    this.cargar();
  }

  // ── Carga ───────────────────────────────────────────────────────────────────

  private cargar(): void {
    this.cargando = true;

    this.meta.getTemplates().subscribe({
      next: (r: any) => {
        // Solo las aprobadas: mandar una en revisión falla en Meta sin decir por qué.
        this.templates = (r?.data ?? r ?? []).filter((t: any) => t.status === 'APPROVED');
        this.cargando = false;
      },
      error: () => { this.cargando = false; },
    });

    this.meta.campaignOptions().subscribe({
      next: (r: any) => { this.variables = r?.variables ?? []; },
    });

    this.recargarHistorial();
    this.contar();
  }

  recargarHistorial(): void {
    this.meta.campaigns().subscribe({
      next: (r: any) => { this.campaigns = r?.campaigns ?? []; },
    });
  }

  // ── Paso 1: plantilla y variables ───────────────────────────────────────────

  /**
   * Al elegir plantilla se leen sus {{n}} y se propone una variable para cada
   * uno, adivinando por el ejemplo que la propia plantilla trae en Meta.
   */
  elegirPlantilla(nombre: string): void {
    this.plantilla = nombre;
    this.probada = false;
    this.campaignId = null;

    const t = this.templates.find((x: any) => x.name === nombre);
    if (!t) { this.slots = []; return; }

    this.idioma = t.language ?? 'es_CO';

    const body = (t.components ?? []).find((c: any) => c.type === 'BODY');
    const texto = body?.text ?? '';
    const cuantos = this.contarSlots(texto);
    const ejemplos: string[] = body?.example?.body_text?.[0] ?? [];

    this.slots = Array.from({ length: cuantos }, (_, i) => this.proponer(ejemplos[i] ?? ''));
  }

  /** Cuántos {{n}} distintos usa el texto. */
  private contarSlots(texto: string): number {
    const vistos = new Set<number>();
    const re = /\{\{(\d+)\}\}/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(texto)) !== null) vistos.add(Number(m[1]));
    return vistos.size;
  }

  /**
   * Propone qué va en un espacio mirando el ejemplo de la plantilla.
   *
   * No acierta siempre, y por eso se puede cambiar: es una ayuda para no
   * armar seis desplegables a mano, no una decisión cerrada.
   */
  private proponer(ejemplo: string): Slot {
    const e = (ejemplo ?? '').toLowerCase();

    const pistas: [RegExp, string][] = [
      [/^\d{1,3}([.,]\d{3})+$|^\$/, 'valor'],
      [/^nt\d+/i, 'factura'],
      [/\d{1,4}\s*(mb|mg|gb)/i, 'plan'],
      [/^\d{2}\/\d{2}\/\d{4}$|^\d{4}-\d{2}-\d{2}$/, 'fecha_vencimiento'],
      [/^\d{7,15}$/, 'soporte'],
      [/^[a-záéíóúñ ]{3,40}$/i, 'cliente'],
    ];

    for (const [re, clave] of pistas) {
      if (re.test(e)) return { tipo: 'variable', variable: clave, valor: '' };
    }

    // Un ejemplo largo casi siempre es el cuerpo del comunicado.
    return e.length > 60
      ? { tipo: 'fijo', variable: 'texto_libre', valor: '' }
      : { tipo: 'variable', variable: 'cliente', valor: '' };
  }

  cambioContenido(): void {
    // Cambiar el contenido invalida la prueba: lo que se vio ya no es lo que saldría.
    this.probada = false;
    this.confirmando = false;
  }

  /**
   * La etiqueta del espacio, tal como se ve en la plantilla de Meta.
   *
   * Se arma aquí y no en el HTML porque Angular decodifica las entidades antes
   * de interpretar, y unas llaves escritas en la plantilla se leerían como una
   * interpolación anidada.
   */
  etiquetaSlot(i: number): string {
    return '{{' + (i + 1) + '}}';
  }

  ejemploDe(clave: string): string {
    return this.variables.find(v => v.key === clave)?.example ?? '';
  }

  /** El texto de la plantilla con los espacios ya reemplazados. */
  get vistaPrevia(): string {
    const t = this.templates.find((x: any) => x.name === this.plantilla);
    const body = (t?.components ?? []).find((c: any) => c.type === 'BODY');
    let texto: string = body?.text ?? '';

    this.slots.forEach((s, i) => {
      const valor = s.tipo === 'fijo'
        ? (s.valor || '(tu texto)')
        : (this.ejemploDe(s.variable) || s.variable);
      texto = texto.split(`{{${i + 1}}}`).join(valor);
    });

    return texto;
  }

  // ── Paso 2: destinatarios ───────────────────────────────────────────────────

  private queryFiltros(): string {
    const p = new URLSearchParams();
    p.set('solo_vigentes', String(this.filtros.solo_vigentes));
    p.set('servicio', this.filtros.servicio);
    p.set('deuda', this.filtros.deuda);
    if (this.excluidos.length) p.set('excluded', this.excluidos.join(','));
    return p.toString();
  }

  contar(): void {
    this.contando = true;
    this.cambioContenido();

    this.meta.campaignAudience(this.queryFiltros()).subscribe({
      next: (r: any) => { this.totalDestinatarios = r?.total ?? 0; this.contando = false; },
      error: () => { this.contando = false; },
    });
  }

  abrirClientes(): void {
    this.mostrarClientes = true;
    this.buscarClientes();
  }

  buscarClientes(): void {
    this.cargandoClientes = true;
    const p = this.queryFiltros() + '&q=' + encodeURIComponent(this.buscador);

    this.meta.campaignClients(p).subscribe({
      next: (r: any) => { this.clientes = r?.clients ?? []; this.cargandoClientes = false; },
      error: () => { this.cargandoClientes = false; },
    });
  }

  excluir(c: Cliente): void {
    if (!this.excluidos.includes(c.user_id)) this.excluidos.push(c.user_id);
    this.contar();
  }

  incluir(userId: number): void {
    this.excluidos = this.excluidos.filter(id => id !== userId);
    this.contar();
  }

  nombreExcluido(userId: number): string {
    return this.clientes.find(c => c.user_id === userId)?.nombre ?? `Cliente #${userId}`;
  }

  // ── Paso 3: probar y enviar ─────────────────────────────────────────────────

  private get payload(): any {
    return {
      id: this.campaignId,
      name: this.nombre || null,
      template_name: this.plantilla,
      language: this.idioma,
      params: this.slots.map(s => ({
        tipo: s.tipo,
        variable: s.tipo === 'fijo' ? 'texto_libre' : s.variable,
        valor: s.tipo === 'fijo' ? s.valor : null,
      })),
      audience: this.filtros,
      excluded_user_ids: this.excluidos,
    };
  }

  get puedeProbar(): boolean {
    return !!this.plantilla
      && this.telefonoPrueba.replace(/\D/g, '').length >= 10
      && this.slots.every(s => s.tipo !== 'fijo' || s.valor.trim().length > 0);
  }

  /** Guarda el borrador y manda la prueba a un solo número. */
  probar(): void {
    if (!this.puedeProbar) return;

    this.probando = true;
    this.aviso = null;

    this.meta.saveCampaign(this.payload).subscribe({
      next: (r: any) => {
        this.campaignId = r?.campaign?.id ?? null;

        if (!this.campaignId) {
          this.probando = false;
          this.aviso = { ok: false, texto: 'No se pudo guardar el comunicado.' };
          return;
        }

        this.meta.testCampaign(this.campaignId, this.telefonoPrueba).subscribe({
          next: () => {
            this.probando = false;
            this.probada = true;
            this.aviso = { ok: true, texto: `Prueba enviada al ${this.telefonoPrueba}. Revísala antes de continuar.` };
          },
          error: (e: any) => {
            this.probando = false;
            this.aviso = { ok: false, texto: e?.error?.error ?? 'No se pudo enviar la prueba.' };
          },
        });
      },
      error: (e: any) => {
        this.probando = false;
        this.aviso = { ok: false, texto: e?.error?.error ?? 'No se pudo guardar el comunicado.' };
      },
    });
  }

  enviar(): void {
    if (!this.campaignId || !this.probada) return;

    this.enviando = true;
    this.aviso = null;

    this.meta.sendCampaign(this.campaignId).subscribe({
      next: (r: any) => {
        this.enviando = false;
        this.confirmando = false;
        this.aviso = { ok: true, texto: r?.mensaje ?? 'Envío en marcha.' };
        this.recargarHistorial();
        this.vista = 'historial';
        this.verDetalle(this.campaignId!);
      },
      error: (e: any) => {
        this.enviando = false;
        this.confirmando = false;
        this.aviso = { ok: false, texto: e?.error?.error ?? 'No se pudo iniciar el envío.' };
      },
    });
  }

  // ── Historial ───────────────────────────────────────────────────────────────

  verDetalle(id: number): void {
    this.meta.campaign(id).subscribe({
      next: (r: any) => { this.detalle = r; },
    });
  }

  cancelar(id: number): void {
    this.meta.cancelCampaign(id).subscribe({
      next: (r: any) => {
        this.aviso = { ok: true, texto: r?.mensaje ?? 'Envío detenido.' };
        this.recargarHistorial();
        this.verDetalle(id);
      },
      error: (e: any) => {
        this.aviso = { ok: false, texto: e?.error?.error ?? 'No se pudo detener.' };
      },
    });
  }

  etiquetaEstado(estado: string): string {
    return ({
      draft: 'Borrador',
      tested: 'Probado',
      sending: 'Enviando',
      done: 'Terminado',
      cancelled: 'Detenido',
      failed: 'Falló',
    } as Record<string, string>)[estado] ?? estado;
  }

  colorEstado(estado: string): string {
    return ({
      draft: 'bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300',
      tested: 'bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200',
      sending: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200',
      done: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200',
      cancelled: 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-400',
      failed: 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200',
    } as Record<string, string>)[estado] ?? 'bg-gray-100 text-gray-700';
  }

  progreso(d: any): number {
    const total = d?.progreso?.total ?? 0;
    if (!total) return 0;
    return Math.round(((d.progreso.enviados + d.progreso.fallidos) / total) * 100);
  }
}
