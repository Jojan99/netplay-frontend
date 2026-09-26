import { Component, OnInit, OnDestroy, ElementRef, NgZone, ViewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ContractService } from '../../services/contract.service';
import { UserService } from '../../services/user.service';
import { DomSanitizer, SafeResourceUrl, SafeHtml } from '@angular/platform-browser';
import { firstValueFrom } from 'rxjs';
import { environment } from '../../../environments/environment';
import { NpSelectComponent, PresentacionSelect } from '../../common/np-select/np-select.component';

const PESOS = new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 });

/* ── Conversiones del editor de posiciones ─────────────────────────────────
   El PDF se arma con FPDI sin argumentos, o sea en MILÍMETROS, pero el tamaño
   de fuente va en puntos. Las coordenadas guardadas son milímetros desde la
   esquina superior izquierda de la página, y el punto marcado es la esquina
   superior izquierda del texto. Estas constantes son las mismas que usa
   ContractPdfService para estampar: si se tocan, hay que tocar las dos.        */
const PT_A_MM = 25.4 / 72;
const ALTURA_MAYUSCULAS = 0.717;
const FUENTE_MINIMA = 0.6;

interface Contract {
  id: number;
  title: string;
  content: string;
  logo?: string;
  pdf_path?: string;
  installation_value?: string;
  plazo?: string;
  terminos?: string;
  active: boolean;
  created_at: string;
}

interface ClientContract {
  id: number;
  status: 'pending' | 'signed';
  token: string;
  signed_at: string | null;
  created_at?: string | null;
  sent_at?: string | null;
  sent_channel?: string | null;
  opened_at?: string | null;
  require_documents: boolean;
  document_front_path?: string;
  document_back_path?: string;
  document_number_front?: string;
  document_number_back?: string;
  contract?: { id: number; title: string };
  user?: { id: number; username: string; names?: string; lastname?: string; phone?: string; email?: string; dni?: string };
}

interface Client {
  id: number;
  names: string;
  lastname: string;
  dni: string;
  phone: string;
  email: string;
}

/** Una variable del catálogo, tal como la manda el backend. */
interface Variable {
  clave: string;
  etiqueta: string;
  grupo: string;
  ayuda: string;
  ejemplo: string;
  solo_pdf?: boolean;
}

interface GrupoVariables {
  nombre: string;
  items: Variable[];
}

interface CampoPdf {
  variable: string;
  page: number;
  x: number;
  y: number;
  font_size: number;
  color: string;
  max_width: number;
}

type Tab = 'templates' | 'assigned';
type Modo = 'html' | 'pdf';

@Component({
  selector: 'app-contracts',
  standalone: true,
  imports: [CommonModule, FormsModule, NpSelectComponent],
  templateUrl: './contracts.component.html',
  styleUrl: './contracts.component.scss',
  host: { class: 'np-console' },
})
export class ContractsComponent implements OnInit, OnDestroy {

  signedCount  = 0;
  pendingCount = 0;

  activeTab: Tab = 'templates';

  // ── Plantillas ────────────────────────────────────────────────────────────
  contracts: Contract[]      = [];
  isLoading                  = false;
  showTemplateModal          = false;
  isEditing                  = false;
  isSaving                   = false;
  templateForm               = { id: 0, title: '', content: '', active: true, installation_value: '', plazo: '12', terminos: '' };
  deleteConfirmId: number | null = null;
  isDeleting                 = false;

  /** Pestañas del editor de plantilla. */
  seccion: 'contenido' | 'previa' | 'pdf' = 'contenido';

  // ── PDF de guía (transcribir) ─────────────────────────────────────────────
  isUploadingPdf             = false;
  pdfGuideUrl: string | null = null;

  // ── PDF base (fondo exacto) ───────────────────────────────────────────────
  isUploadingPdfBase         = false;
  hasPdfBase                 = false;

  // ── Logo ──────────────────────────────────────────────────────────────────
  logoPreview: string | null = null;
  isUploadingLogo            = false;

  // ── Catálogo de variables ─────────────────────────────────────────────────
  variables: Variable[] = [];
  gruposVariables: GrupoVariables[] = [];
  private etiquetas = new Map<string, string>();
  private ejemplos: Record<string, string> = {};
  buscarVar = '';

  // ── Vista previa con datos reales ─────────────────────────────────────────
  previaBuscar = '';
  previaResultados: Client[] = [];
  previaCliente: Client | null = null;
  previaHtml: SafeHtml | null = null;
  previaVacias: string[] = [];
  previaDesconocidas: string[] = [];
  previaUsadas: string[] = [];
  cargandoPrevia = false;
  private temporizadorPrevia: any = null;

  // ── Editor de posiciones sobre el PDF ─────────────────────────────────────
  @ViewChild('pdfCanvas') pdfCanvasRef?: ElementRef<HTMLCanvasElement>;
  pdfCampos: CampoPdf[] = [];
  pdfPaginas: Array<{ page: number; width: number; height: number; orientation: string }> = [];
  pdfPagina = 1;
  varElegida = '';
  campoSel: number | null = null;
  isRenderingPdf = false;
  pdfListo = false;
  guardandoCampos = false;
  avisoRotacion = '';
  camposSucios = false;
  zoomPdf = 1;
  camposFuera: string[] = [];
  faltanDatos: string[] = [];
  generandoPrueba = false;
  avisoPdfCambiado = '';
  readonly TERMINOS_POR_DEFECTO = 'Declaro que leí el contrato completo, que los datos que aparecen en él son correctos y que acepto sus términos y condiciones. Entiendo que esta firma electrónica tiene la misma validez que una firma de puño y letra.';

  private lienzoPagina: HTMLCanvasElement | null = null;
  private urlHoja: string | null = null;
  private pxPorMm = 1;
  private arrastrando = false;
  private agarre = { dx: 0, dy: 0 };
  private repintado = 0;

  /** Variables del editor de PDF: etiqueta arriba, clave debajo y agrupadas. */
  readonly presVariablesPdf: PresentacionSelect<Variable> = {
    valor: v => v?.clave,
    etiqueta: v => v?.etiqueta ?? '',
    detalle: v => v?.clave,
    grupo: v => v?.grupo ?? 'Cliente',
  };

  /** Páginas del PDF: guarda el número y muestra orientación y tamaño en mm. */
  readonly presPaginasPdf: PresentacionSelect = {
    valor: p => p?.page,
    etiqueta: p => `Página ${p?.page}`,
    detalle: p => {
      const orientacion = ({ portrait: 'Vertical', landscape: 'Horizontal' } as Record<string, string>)[p?.orientation] ?? p?.orientation;
      const tamano = p?.width && p?.height ? `${Math.round(p.width)} × ${Math.round(p.height)} mm` : null;
      return [orientacion, tamano].filter(Boolean).join(' · ') || null;
    },
  };

  // ── Asignación ────────────────────────────────────────────────────────────
  assignedContracts: ClientContract[] = [];
  asignadosFiltrados: ClientContract[] = [];
  isLoadingAssigned                   = false;
  showAssignModal                     = false;
  isAssigning                         = false;
  clientSearch                        = '';
  clientResults: Client[]             = [];
  isSearching                         = false;
  selectedClient: Client | null       = null;
  selectedContractId                  = 0;
  requireDocuments                    = false;

  readonly presContratos: PresentacionSelect<Contract> = {
    valor: c => c.id,
    etiqueta: c => c.title ?? '',
    detalle: c => (c.installation_value ? `Instalación ${PESOS.format(Number(c.installation_value))}` : null),
    insignia: c => (c.pdf_path ? { texto: 'PDF', tono: 'info' } : null),
    atenuada: c => (c.active as unknown) === false || (c.active as unknown) === 0,
  };

  // ── Documentos ────────────────────────────────────────────────────────────
  showDocumentsModal: ClientContract | null = null;
  documentFrontFile: File | null = null;
  documentBackFile: File | null = null;
  documentFrontPreview: string | null = null;
  documentBackPreview: string | null = null;
  isUploadingDocuments = false;
  documentNumberFront = '';
  documentNumberBack = '';

  // ── Filtro y estado de asignados ─────────────────────────────────────────
  assignedSearch = '';
  filtroEstado: 'todos' | 'pending' | 'signed' = 'todos';

  deleteClientContractId: number | null = null;
  isDeletingAssigned                    = false;

  // ── Envío de link ─────────────────────────────────────────────────────────
  showSendModal: ClientContract | null = null;
  phoneInput                           = '';
  emailInput                           = '';
  isSendingWa                          = false;
  isSendingEmail                       = false;
  copiedId: number | null              = null;

  successMsg = '';
  errorMsg   = '';

  env = environment;

  constructor(
    private contractService: ContractService,
    private userService: UserService,
    private sanitizer: DomSanitizer,
    private zone: NgZone,
  ) {}

  ngOnInit(): void {
    this.loadContracts();
    this.loadAssigned();
    this.cargarVariables();
  }

  ngOnDestroy(): void {
    if (this.camposSucios && this.templateForm.id) this.savePdfFields(true);
    this.soltarPdf();
  }

  // ── Catálogo de variables ─────────────────────────────────────────────────

  /**
   * La lista la manda el backend: es la misma que reemplaza al firmar. Antes
   * estaba copiada aquí y ofrecía variables que el backend no conocía.
   */
  private cargarVariables(): void {
    this.contractService.getVariables().subscribe({
      next: r => {
        if (r.status !== 0) return;
        this.variables = r.data ?? [];
        this.ejemplos = {};
        this.etiquetas.clear();
        this.variables.forEach(v => {
          this.ejemplos[v.clave] = v.ejemplo;
          this.etiquetas.set(v.clave, v.etiqueta);
        });
        this.agruparVariables();
      },
    });
  }

  /** Se recalcula sólo al cargar o al filtrar: nunca desde la plantilla. */
  private agruparVariables(): void {
    const texto = this.buscarVar.trim().toLowerCase();
    const grupos = new Map<string, Variable[]>();

    this.variables.forEach(v => {
      if (texto && !(`${v.etiqueta} ${v.clave} ${v.ayuda}`.toLowerCase().includes(texto))) return;
      if (!grupos.has(v.grupo)) grupos.set(v.grupo, []);
      grupos.get(v.grupo)!.push(v);
    });

    this.gruposVariables = Array.from(grupos, ([nombre, items]) => ({ nombre, items }));
  }

  filtrarVariables(): void { this.agruparVariables(); }

  etiquetaVar(clave: string): string { return this.etiquetas.get(clave) ?? clave; }

  /** Modo de la plantilla: PDF con coordenadas o plantilla HTML. */
  get modo(): Modo { return this.hasPdfBase ? 'pdf' : 'html'; }

  // ── Plantillas ────────────────────────────────────────────────────────────

  loadContracts(): void {
    this.isLoading = true;
    this.contractService.getAll().subscribe({
      next:  r => { this.isLoading = false; this.contracts = r.data ?? []; },
      error: () => { this.isLoading = false; },
    });
  }

  openCreate(): void {
    this.soltarPreviaPdf();
    this.isEditing     = false;
    this.templateForm  = { id: 0, title: '', content: '', active: true, installation_value: '', plazo: '12', terminos: '' };
    this.logoPreview   = null;
    this.hasPdfBase    = false;
    this.pdfGuideUrl   = null;
    // El modo principal es el PDF propio: se empieza por subirlo.
    this.seccion       = 'pdf';
    this.pdfCampos     = [];
    this.pdfPaginas    = [];
    this.pdfListo      = false;
    this.avisoPdfCambiado = '';
    this.limpiarPrevia();
    this.errorMsg      = '';
    this.showTemplateModal = true;
  }

  openEdit(c: Contract): void {
    this.soltarPreviaPdf();
    this.isEditing    = true;
    this.templateForm = {
      id: c.id,
      title: c.title,
      content: c.content,
      active: c.active,
      installation_value: c.installation_value ?? '',
      plazo: c.plazo ?? '12',
      terminos: c.terminos ?? '',
    };
    this.logoPreview  = c.logo ?? null;
    this.hasPdfBase   = !!c.pdf_path;
    this.pdfGuideUrl  = null;
    this.errorMsg     = '';
    // El modo principal es el PDF propio: si la plantilla ya tiene uno, se abre ahí.
    this.seccion      = this.hasPdfBase ? 'pdf' : 'contenido';
    this.avisoPdfCambiado = '';
    this.camposFuera  = [];
    this.faltanDatos  = [];
    this.pdfCampos    = [];
    this.pdfPaginas   = [];
    this.campoSel     = null;
    this.camposSucios = false;
    this.pdfListo     = false;
    this.soltarPdf();
    this.limpiarPrevia();
    this.showTemplateModal = true;
    if (this.hasPdfBase) this.abrirEditorPdf();
  }

  cerrarPlantilla(): void {
    this.soltarPreviaPdf();
    // Lo que quedó sin guardar de las posiciones se guarda igual.
    if (this.camposSucios && this.templateForm.id) this.savePdfFields(true);
    this.showTemplateModal = false;
    this.soltarPdf();
  }

  async saveTemplate(): Promise<void> {
    this.isSaving = true;
    this.errorMsg = '';

    if (this.camposSucios && this.templateForm.id && !(await this.savePdfFields(true))) {
      this.isSaving = false;
      return;
    }

    const payload: any = { ...this.templateForm };
    if (this.logoPreview) payload.logo = this.logoPreview;

    const obs = this.isEditing
      ? this.contractService.update(this.templateForm.id, payload)
      : this.contractService.create(payload);

    obs.subscribe({
      next: r => {
        this.isSaving = false;
        if (r.status === 0) {
          this.cerrarPlantilla();
          this.toast(this.isEditing ? 'Plantilla actualizada.' : 'Plantilla creada.');
          this.loadContracts();
        } else {
          this.errorMsg = r.message;
        }
      },
      error: () => { this.isSaving = false; this.errorMsg = 'Error al guardar.'; },
    });
  }

  confirmDelete(id: number): void { this.deleteConfirmId = id; }
  cancelDelete(): void            { this.deleteConfirmId = null; }

  deleteContract(): void {
    if (!this.deleteConfirmId) return;
    this.isDeleting = true;
    this.contractService.delete(this.deleteConfirmId).subscribe({
      next: () => {
        this.isDeleting      = false;
        this.deleteConfirmId = null;
        this.toast('Plantilla eliminada.');
        this.loadContracts();
      },
      error: () => { this.isDeleting = false; },
    });
  }

  // ── Insertar variables en el contenido ────────────────────────────────────

  insertVar(clave: string): void {
    const ta = document.getElementById('contractContent') as HTMLTextAreaElement | null;
    if (!ta) {
      this.templateForm.content += ' ' + clave;
      this.previaPendiente();
      return;
    }
    const start = ta.selectionStart;
    const end   = ta.selectionEnd;
    const text  = this.templateForm.content;
    this.templateForm.content = text.substring(0, start) + clave + text.substring(end);
    setTimeout(() => {
      ta.selectionStart = ta.selectionEnd = start + clave.length;
      ta.focus();
    }, 0);
    this.previaPendiente();
  }

  /**
   * Quita los style= del HTML pegado para que la página de firma aplique su
   * propio diseño (los editores de texto los meten en cada etiqueta).
   */
  cleanStyles(): void {
    if (!this.templateForm.content) return;
    this.templateForm.content = this.templateForm.content
      .replace(/\s*style\s*=\s*["'][^"']*["']/gi, '')
      .replace(/\s*class\s*=\s*["'](contract-body|contract-guide)["']/gi, '')
      .replace(/<p\s*><strong>Guía:<\/strong>[^<]*<\/p>/i, '')
      .replace(/>\s+</g, '><')
      .trim();
    this.toast('Estilos quitados. El contrato usará el diseño de la página de firma.');
    this.previaPendiente();
  }

  // ── Vista previa con un cliente real ──────────────────────────────────────

  private limpiarPrevia(): void {
    this.previaBuscar = '';
    this.previaResultados = [];
    this.previaCliente = null;
    this.previaHtml = null;
    this.previaVacias = [];
    this.previaDesconocidas = [];
    this.previaUsadas = [];
  }

  buscarClientePrevia(): void {
    if (this.previaBuscar.trim().length < 2) { this.previaResultados = []; return; }
    this.userService.searchClients(this.previaBuscar).subscribe({
      next:  r => { this.previaResultados = r.data ?? []; },
      error: () => { this.previaResultados = []; },
    });
  }

  elegirClientePrevia(c: Client): void {
    this.previaCliente = c;
    this.previaResultados = [];
    this.previaBuscar = `${c.names} ${c.lastname}`;
    if (this.seccion === 'pdf') this.revisarDatos();
    else if (this.hasPdfBase) this.pedirPreviaPdf();
    else this.pedirPrevia();
  }

  /** El PDF tal como le llega al cliente: el suyo con los datos impresos encima. */
  previaPdfUrl: SafeResourceUrl | null = null;
  private previaPdfCrudo: string | null = null;
  cargandoPreviaPdf = false;

  pedirPreviaPdf(): void {
    if (!this.templateForm.id) return;
    this.cargandoPreviaPdf = true;
    this.errorMsg = '';

    // Las posiciones de la pantalla si ya se abrió el editor (aunque falte
    // guardarlas); si no, el servidor usa las guardadas.
    const fields = this.pdfListo || this.pdfCampos.length ? this.pdfCampos : undefined;

    this.contractService.pdfPrueba(this.templateForm.id, { user_id: this.previaCliente?.id, fields }).subscribe({
      next: blob => {
        this.cargandoPreviaPdf = false;
        if (blob.type && !blob.type.includes('pdf')) { this.errorMsg = 'No se pudo armar el PDF del cliente.'; return; }
        this.soltarPreviaPdf();
        this.previaPdfCrudo = URL.createObjectURL(blob);
        this.previaPdfUrl = this.sanitizer.bypassSecurityTrustResourceUrl(this.previaPdfCrudo + '#view=FitH');
      },
      error: () => { this.cargandoPreviaPdf = false; this.errorMsg = 'No se pudo armar el PDF del cliente.'; },
    });
  }

  private soltarPreviaPdf(): void {
    if (this.previaPdfCrudo) URL.revokeObjectURL(this.previaPdfCrudo);
    this.previaPdfCrudo = null;
    this.previaPdfUrl = null;
  }

  /** Mientras se escribe el contrato, la previa se refresca con calma. */
  previaPendiente(): void {
    if (this.seccion !== 'previa') return;
    clearTimeout(this.temporizadorPrevia);
    this.temporizadorPrevia = setTimeout(() => this.pedirPrevia(), 700);
  }

  pedirPrevia(): void {
    this.cargandoPrevia = true;
    this.contractService.vistaPrevia({
      content: this.templateForm.content || '',
      user_id: this.previaCliente?.id,
      contract_id: this.templateForm.id || undefined,
      installation_value: this.templateForm.installation_value,
      plazo: this.templateForm.plazo,
    }).subscribe({
      next: r => {
        this.cargandoPrevia = false;
        if (r.status !== 0) { this.errorMsg = r.message || 'No se pudo generar la vista previa.'; return; }
        this.previaHtml = this.sanitizer.bypassSecurityTrustHtml(r.data.html || '');
        this.previaUsadas = r.data.usadas ?? [];
        this.previaVacias = r.data.vacias ?? [];
        this.previaDesconocidas = r.data.desconocidas ?? [];
      },
      error: () => { this.cargandoPrevia = false; this.errorMsg = 'Error de red en la vista previa.'; },
    });
  }

  abrirSeccion(s: 'contenido' | 'previa' | 'pdf'): void {
    this.seccion = s;
    // Con PDF propio el cliente ve ese PDF con sus datos, no el texto.
    if (s === 'previa' && this.hasPdfBase) { this.pedirPreviaPdf(); return; }
    if (s === 'previa' && !this.previaHtml) this.pedirPrevia();
    if (s === 'pdf' && this.hasPdfBase && !this.pdfListo) this.abrirEditorPdf();
    if (s === 'pdf' && this.pdfListo) setTimeout(() => this.pintar(), 0);
  }

  // ── Subidas ───────────────────────────────────────────────────────────────

  /**
   * El PDF del contrato se pide UNA vez y sirve para las dos cosas: queda como
   * base (las variables se colocan encima) y se transcribe al texto de la
   * plantilla. Antes eran dos botones y en una plantilla nueva había que
   * guardarla primero: el mismo archivo se terminaba subiendo dos veces.
   */
  onPdfSelected(event: Event): void {
    this.tomarPdf(event, false);
  }

  onPdfBaseSelected(event: Event): void {
    this.tomarPdf(event, true);
  }

  /**
   * @param comoBase true si lo eligió como PDF base (reemplaza el que haya);
   *   false si fue "Transcribir": si la plantilla no tiene base, queda también
   *   como base; si ya tiene, sólo se transcribe.
   */
  private async tomarPdf(event: Event, comoBase: boolean): Promise<void> {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;

    const base = comoBase || !this.hasPdfBase;

    // Cambiar el PDF de una plantilla que ya tiene campos deja las posiciones
    // apuntando a un documento distinto: se avisa antes y después.
    const teniaCampos = base && this.hasPdfBase && this.pdfCampos.length > 0;
    if (teniaCampos && !confirm(
      `Esta plantilla ya tiene ${this.pdfCampos.length} variables colocadas sobre el PDF actual. ` +
      'Si sube otro archivo, las posiciones se conservan pero puede que no coincidan con el documento nuevo. ¿Continuar?')) {
      return;
    }

    this.errorMsg = '';

    // Una plantilla nueva se guarda sola (con el nombre del archivo si no
    // tiene título) para poder guardarle el PDF.
    if (base && !this.isEditing && !(await this.guardarNueva(file))) return;

    // El texto se transcribe si está vacío o si lo pidió ("Transcribir").
    const transcribir = !comoBase || !(this.templateForm.content ?? '').trim();

    if (base) await this.subirBase(file, teniaCampos);
    if (transcribir) await this.transcribir(file, !base);
  }

  /** Crea la plantilla nueva con lo que tenga el formulario. */
  private async guardarNueva(file: File): Promise<boolean> {
    if (!(this.templateForm.title ?? '').trim()) {
      this.templateForm.title = file.name.replace(/\.pdf$/i, '').replace(/[_-]+/g, ' ').trim() || 'Contrato';
    }

    const payload: any = { ...this.templateForm };
    delete payload.id;
    if (this.logoPreview) payload.logo = this.logoPreview;

    this.isUploadingPdfBase = true;
    try {
      const r = await firstValueFrom(this.contractService.create(payload));
      if (r?.status !== 0 || !r?.data?.id) {
        this.errorMsg = r?.message || 'No se pudo crear la plantilla.';
        return false;
      }
      this.templateForm.id = r.data.id;
      this.isEditing = true;
      this.loadContracts();
      return true;
    } catch {
      this.errorMsg = 'No se pudo crear la plantilla.';
      return false;
    } finally {
      this.isUploadingPdfBase = false;
    }
  }

  private async subirBase(file: File, teniaCampos: boolean): Promise<void> {
    this.isUploadingPdfBase = true;
    try {
      const r = await firstValueFrom(this.contractService.uploadPdfBase(this.templateForm.id, file));
      if (r?.status !== 0) {
        this.errorMsg = r?.message || 'Error al guardar el PDF.';
        return;
      }
      this.hasPdfBase = true;
      this.pdfListo = false;
      this.avisoPdfCambiado = teniaCampos
        ? 'Cambió el PDF base: revise una por una que las variables sigan cayendo donde deben y use “Probar con un cliente” antes de dejar la plantilla activa.'
        : '';
      this.soltarPdf();
      this.seccion = 'pdf';
      this.abrirEditorPdf();
      this.toast('PDF guardado. Ahora coloque cada variable sobre el documento.');
    } catch {
      this.errorMsg = 'Error al subir el PDF.';
    } finally {
      this.isUploadingPdfBase = false;
    }
  }

  /** @param avisar sólo cuando fue lo único que se hizo (si no, el aviso es el de la base). */
  private async transcribir(file: File, avisar: boolean): Promise<void> {
    this.isUploadingPdf = true;
    try {
      const r = await firstValueFrom(this.contractService.uploadPdf(file));
      if (r?.status !== 0) {
        if (avisar) this.errorMsg = r?.message || 'Error al convertir el PDF.';
        return;
      }
      if (r.data?.html) this.templateForm.content = r.data.html;
      if (r.data?.guia) this.pdfGuideUrl = `${environment.rootUrl}api/contracts/guia/${r.data.guia}`;
      if (avisar) this.toast('PDF transcrito. Revise el texto y coloque las variables donde corresponda.');
    } catch {
      if (avisar) this.errorMsg = 'Error al subir el PDF.';
    } finally {
      this.isUploadingPdf = false;
    }
  }

  onLogoSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => { this.logoPreview = reader.result as string; };
    reader.readAsDataURL(file);
    if (!this.isEditing) { input.value = ''; return; }

    this.isUploadingLogo = true;
    this.contractService.uploadLogo(this.templateForm.id, file).subscribe({
      next: r => {
        this.isUploadingLogo = false;
        if (r.status === 0) this.toast('Logo guardado.');
        else this.errorMsg = r.message || 'Error al subir logo.';
      },
      error: () => { this.isUploadingLogo = false; this.errorMsg = 'Error al subir logo.'; },
    });
    input.value = '';
  }

  safePdfUrl(): SafeResourceUrl | null {
    return this.pdfGuideUrl ? this.sanitizer.bypassSecurityTrustResourceUrl(this.pdfGuideUrl) : null;
  }

  // ══ Editor de posiciones sobre el PDF ═════════════════════════════════════
  //
  // El PDF se dibuja UNA vez en un lienzo aparte y se reutiliza: encima se
  // pintan los valores de ejemplo con el mismo tamaño y la misma línea base que
  // usará ContractPdfService, así que lo que se ve es lo que se estampa.

  abrirEditorPdf(): void {
    if (!this.templateForm.id || !this.hasPdfBase) return;
    this.isRenderingPdf = true;
    this.errorMsg = '';

    this.contractService.getPdfFields(this.templateForm.id).subscribe({
      next: r => {
        this.pdfCampos = (r.status === 0 && r.data ? r.data : []).map((f: any) => ({
          variable: f.variable,
          page: Number(f.page) || 1,
          x: Number(f.x), y: Number(f.y),
          font_size: Number(f.font_size) || 10,
          color: f.color || '000000',
          max_width: Number(f.max_width) || 0,
        }));
        this.camposSucios = false;
        this.revisarBordes();
        this.revisarDatos();
      },
    });

    this.contractService.getPdfDimensions(this.templateForm.id).subscribe({
      next: r => {
        if (r.status !== 0) { this.isRenderingPdf = false; this.errorMsg = r.message || 'No se pudo leer el PDF base.'; return; }
        this.pdfPaginas = r.data.pages ?? [];
        this.pdfPagina = 1;
        this.pdfListo = true;
        // Los campos pueden haber llegado antes que las páginas: sin esto los
        // daba a todos por "página que no existe".
        this.revisarBordes();
        this.renderPagina();
      },
      error: () => { this.isRenderingPdf = false; this.errorMsg = 'No se pudo leer el PDF base.'; },
    });
  }

  private soltarPdf(): void {
    if (this.urlHoja) { URL.revokeObjectURL(this.urlHoja); this.urlHoja = null; }
    this.lienzoPagina = null;
    this.pdfListo = false;
    clearTimeout(this.temporizadorPrevia);
  }

  /**
   * Trae la hoja ya dibujada por el servidor y la deja en un lienzo de respaldo.
   * Se dibuja una sola vez por página: después, arrastrar un campo sólo vuelve a
   * copiar esa imagen y a pintar los textos encima.
   */
  async renderPagina(): Promise<void> {
    const hoja = this.hojaActual();
    if (!hoja || !this.templateForm.id) return;

    this.isRenderingPdf = true;
    this.campoSel = null;
    this.errorMsg = '';

    try {
      const blob = await firstValueFrom(this.contractService.getHojaPlantilla(this.templateForm.id, this.paginaNum()));
      const imagen = await this.imagenDesde(blob);

      const respaldo = document.createElement('canvas');
      respaldo.width = imagen.naturalWidth;
      respaldo.height = imagen.naturalHeight;
      respaldo.getContext('2d')!.drawImage(imagen, 0, 0);
      this.lienzoPagina = respaldo;

      // La imagen y las medidas en mm tienen que describir la misma hoja. Si no
      // coinciden, la página viene girada y el mapeo saldría cruzado: se avisa.
      const propImagen = imagen.naturalWidth / imagen.naturalHeight;
      const propFpdi = hoja.width / hoja.height;
      this.avisoRotacion = Math.abs(propImagen - propFpdi) / propFpdi > 0.02
        ? 'Esta página del PDF viene girada y puede que las variables no caigan donde las coloque. Conviene subir el PDF ya enderezado.'
        : '';

      this.pintar();
    } catch {
      this.errorMsg = 'No se pudo dibujar la página del PDF. Vuelva a abrir el editor.';
    } finally {
      this.isRenderingPdf = false;
    }
  }

  /** Blob de la hoja → <img> cargada, lista para copiar al lienzo. */
  private imagenDesde(blob: Blob): Promise<HTMLImageElement> {
    return new Promise((resolver, rechazar) => {
      if (this.urlHoja) URL.revokeObjectURL(this.urlHoja);
      this.urlHoja = URL.createObjectURL(blob);
      const imagen = new Image();
      imagen.onload = () => resolver(imagen);
      imagen.onerror = () => rechazar(new Error('hoja ilegible'));
      imagen.src = this.urlHoja;
    });
  }

  cambiarPagina(): void { this.renderPagina(); }

  paginaAnterior(): void {
    if (this.paginaNum() <= 1) return;
    this.pdfPagina = this.paginaNum() - 1;
    this.renderPagina();
  }

  paginaSiguiente(): void {
    if (this.paginaNum() >= this.pdfPaginas.length) return;
    this.pdfPagina = this.paginaNum() + 1;
    this.renderPagina();
  }

  cambiarZoom(paso: number): void {
    this.zoomPdf = Math.min(2.5, Math.max(0.5, Math.round((this.zoomPdf + paso) * 100) / 100));
  }

  /**
   * Campos que se salen del borde de la hoja: ahí el texto se imprime cortado o
   * directamente no se ve, y hasta ahora no avisaba nada.
   */
  private revisarBordes(): void {
    const fuera: string[] = [];
    this.pdfCampos.forEach(c => {
      const hoja = this.pdfPaginas[c.page - 1];
      if (!hoja) { fuera.push(`${this.etiquetaVar(c.variable)} (página ${c.page}, que no existe)`); return; }
      const ancho = c.variable === '{{firma}}' ? (c.max_width > 0 && c.max_width <= 120 ? c.max_width : 80) : (c.max_width || 40);
      const alto = c.variable === '{{firma}}' ? ancho * 0.32 : c.font_size * ALTURA_MAYUSCULAS * PT_A_MM;
      if (c.x < 0 || c.y < 0 || c.x + ancho > hoja.width + 1 || c.y + alto > hoja.height + 1) {
        fuera.push(`${this.etiquetaVar(c.variable)} (página ${c.page})`);
      }
    });
    this.camposFuera = fuera;
  }

  /** Pregunta al backend qué variables de las colocadas saldrían en blanco. */
  revisarDatos(): void {
    const variables = Array.from(new Set(this.pdfCampos.map(c => c.variable).filter(v => v !== '{{firma}}')));
    if (!variables.length) { this.faltanDatos = []; return; }

    this.contractService.revisarVariables({
      variables,
      user_id: this.previaCliente?.id,
      contract_id: this.templateForm.id || undefined,
    }).subscribe({
      next: r => { if (r.status === 0) this.faltanDatos = [...(r.data.vacias ?? []), ...(r.data.desconocidas ?? [])]; },
    });
  }

  /** El PDF estampado de verdad, con los datos del cliente elegido. */
  probarConCliente(): void {
    if (!this.templateForm.id) return;
    this.generandoPrueba = true;
    this.errorMsg = '';
    this.contractService.pdfPrueba(this.templateForm.id, {
      user_id: this.previaCliente?.id,
      fields: this.pdfCampos,
    }).subscribe({
      next: blob => {
        this.generandoPrueba = false;
        window.open(URL.createObjectURL(blob), '_blank');
      },
      error: () => { this.generandoPrueba = false; this.errorMsg = 'No se pudo generar la prueba en PDF.'; },
    });
  }

  /** Copia el campo seleccionado en todas las demás páginas (firma, cédula…). */
  duplicarEnTodas(): void {
    if (this.campoSel === null) return;
    const base = this.pdfCampos[this.campoSel];
    this.pdfPaginas.forEach(hoja => {
      if (hoja.page === base.page) return;
      if (this.pdfCampos.some(c => c.page === hoja.page && c.variable === base.variable && Math.abs(c.x - base.x) < 0.5 && Math.abs(c.y - base.y) < 0.5)) return;
      this.pdfCampos.push({ ...base, page: hoja.page });
    });
    this.campoCambiado();
    this.toast('Variable copiada en todas las páginas, en la misma posición.');
  }

  /** Copia el campo seleccionado un poco más abajo, en la misma página. */
  duplicarCampo(): void {
    if (this.campoSel === null) return;
    const base = this.pdfCampos[this.campoSel];
    this.pdfCampos.push({ ...base, y: this.redondear(base.y + 6) });
    this.campoSel = this.pdfCampos.length - 1;
    this.campoCambiado();
  }

  private paginaNum(): number { return parseInt(String(this.pdfPagina), 10) || 1; }

  private hojaActual(): { width: number; height: number } | null {
    return this.pdfPaginas[this.paginaNum() - 1] ?? null;
  }

  /** Repinta el PDF y encima los campos, tal cual saldrán estampados. */
  pintar(): void {
    const lienzo = this.pdfCanvasRef?.nativeElement;
    const hoja = this.hojaActual();
    if (!lienzo || !this.lienzoPagina || !hoja) return;

    lienzo.width = this.lienzoPagina.width;
    lienzo.height = this.lienzoPagina.height;
    this.pxPorMm = lienzo.width / hoja.width;

    this.engancharLienzo(lienzo);

    const ctx = lienzo.getContext('2d')!;
    ctx.drawImage(this.lienzoPagina, 0, 0);

    const pagina = this.paginaNum();
    this.pdfCampos.forEach((c, i) => {
      if (c.page !== pagina) return;
      const caja = this.cajaDe(ctx, c);
      const sel = this.campoSel === i;

      if (c.variable === '{{firma}}') {
        ctx.fillStyle = 'rgba(16,185,129,.16)';
        ctx.fillRect(caja.x, caja.y, caja.w, caja.h);
        ctx.strokeStyle = sel ? '#4f46e5' : '#059669';
        ctx.lineWidth = sel ? 2.5 : 1.5;
        ctx.strokeRect(caja.x, caja.y, caja.w, caja.h);
        ctx.fillStyle = '#047857';
        ctx.font = `600 ${Math.round(caja.h * 0.3)}px system-ui, sans-serif`;
        ctx.textBaseline = 'middle';
        ctx.fillText('FIRMA', caja.x + 6, caja.y + caja.h / 2);
        return;
      }

      // Fondo tenue sólo para ubicar el campo; el texto va en su sitio exacto.
      ctx.fillStyle = sel ? 'rgba(79,70,229,.16)' : 'rgba(79,70,229,.07)';
      ctx.fillRect(caja.x, caja.y, caja.w, caja.h);
      if (sel) {
        ctx.strokeStyle = '#4f46e5';
        ctx.lineWidth = 2;
        ctx.strokeRect(caja.x, caja.y, caja.w, caja.h);
      }

      ctx.fillStyle = '#' + (c.color || '000000');
      ctx.font = `${caja.fuentePx}px Helvetica, Arial, sans-serif`;
      ctx.textBaseline = 'alphabetic';
      ctx.fillText(caja.texto, caja.x, caja.baseline);
    });
  }

  /**
   * Caja del campo en píxeles del lienzo. El texto se achica igual que en el
   * backend cuando no entra en su ancho, para que la previa no mienta.
   */
  private cajaDe(ctx: CanvasRenderingContext2D, c: CampoPdf) {
    const px = c.x * this.pxPorMm;
    const py = c.y * this.pxPorMm;

    if (c.variable === '{{firma}}') {
      const ancho = (c.max_width > 0 && c.max_width <= 120 ? c.max_width : 80) * this.pxPorMm;
      return { x: px, y: py, w: ancho, h: ancho * 0.32, fuentePx: 0, baseline: 0, texto: '' };
    }

    let texto = this.ejemplos[c.variable] ?? this.etiquetaVar(c.variable);
    if (!texto) texto = '·';
    let tamano = c.font_size;
    const topeMm = c.max_width > 0 ? c.max_width : 0;
    const mide = (t: string, pt: number) => {
      ctx.font = `${pt * PT_A_MM * this.pxPorMm}px Helvetica, Arial, sans-serif`;
      return ctx.measureText(t).width / this.pxPorMm;
    };

    if (topeMm > 0 && mide(texto, tamano) > topeMm) {
      const minimo = Math.max(5, Math.round(c.font_size * FUENTE_MINIMA));
      while (tamano > minimo && mide(texto, tamano) > topeMm) tamano--;
      if (mide(texto, tamano) > topeMm) {
        while (texto.length > 1 && mide(texto + '.', tamano) > topeMm) texto = texto.slice(0, -1);
        texto += '.';
      }
    }

    const fuentePx = tamano * PT_A_MM * this.pxPorMm;
    const alto = tamano * ALTURA_MAYUSCULAS * PT_A_MM * this.pxPorMm;
    ctx.font = `${fuentePx}px Helvetica, Arial, sans-serif`;

    return { x: px, y: py, w: Math.max(ctx.measureText(texto).width, 6), h: alto, fuentePx, baseline: py + alto, texto };
  }

  /** Milímetros desde la esquina superior izquierda de la hoja. */
  private aMm(e: PointerEvent | MouseEvent): { x: number; y: number } | null {
    const lienzo = this.pdfCanvasRef?.nativeElement;
    const hoja = this.hojaActual();
    if (!lienzo || !hoja) return null;
    // Se mide contra el rectángulo real del lienzo y con clientX/clientY: con
    // offsetX el navegador devuelve coordenadas del hijo que esté encima y el
    // campo caía corrido.
    const r = lienzo.getBoundingClientRect();
    if (!r.width || !r.height) return null;

    // Los dos ejes se miden con la MISMA escala, la del ancho, que es la que usa
    // pintar() para colocar los textos. Poppler redondea el alto de la imagen al
    // píxel entero (2636 en vez de 2635,3) y usar la escala del alto metía ~0,1 mm
    // de diferencia entre lo que se ve y lo que se estampa.
    const mmPorPx = hoja.width / r.width;
    return {
      x: (e.clientX - r.left) * mmPorPx,
      y: (e.clientY - r.top) * mmPorPx,
    };
  }

  private campoEn(mm: { x: number; y: number }): number | null {
    const lienzo = this.pdfCanvasRef?.nativeElement;
    if (!lienzo) return null;
    const ctx = lienzo.getContext('2d')!;
    const pagina = this.paginaNum();
    // De arriba hacia abajo de la pila: gana el último dibujado.
    for (let i = this.pdfCampos.length - 1; i >= 0; i--) {
      const c = this.pdfCampos[i];
      if (c.page !== pagina) continue;
      const caja = this.cajaDe(ctx, c);
      const x = caja.x / this.pxPorMm, y = caja.y / this.pxPorMm;
      const w = caja.w / this.pxPorMm, h = caja.h / this.pxPorMm;
      if (mm.x >= x - 1 && mm.x <= x + w + 1 && mm.y >= y - 1 && mm.y <= y + h + 1) return i;
    }
    return null;
  }

  alPresionar(e: PointerEvent): void {
    const mm = this.aMm(e);
    if (!mm) return;
    const i = this.campoEn(mm);

    if (i !== null) {
      this.campoSel = i;
      this.arrastrando = true;
      this.agarre = { dx: mm.x - this.pdfCampos[i].x, dy: mm.y - this.pdfCampos[i].y };
      (e.target as HTMLElement).setPointerCapture(e.pointerId);
      this.pintar();
      return;
    }

    if (!this.varElegida) { this.campoSel = null; this.pintar(); return; }

    this.pdfCampos.push({
      variable: this.varElegida,
      page: this.paginaNum(),
      x: this.redondear(mm.x),
      y: this.redondear(mm.y),
      font_size: this.varElegida === '{{firma}}' ? 12 : 10,
      color: '000000',
      max_width: this.varElegida === '{{firma}}' ? 60 : 50,
    });
    this.campoSel = this.pdfCampos.length - 1;
    this.campoCambiado();
  }

  /**
   * El arrastre se escucha FUERA de la zona de Angular: un pointermove atado en
   * la plantilla dispara un ciclo de detección de cambios por cada píxel, y con
   * el modal abierto eso se nota. Al soltar se vuelve a entrar para que la tabla
   * de campos muestre las coordenadas nuevas.
   */
  private engancharLienzo(lienzo: HTMLCanvasElement): void {
    if ((lienzo as any).__enganchado) return;
    (lienzo as any).__enganchado = true;
    this.zone.runOutsideAngular(() => {
      lienzo.addEventListener('pointermove', this.alArrastrar);
      lienzo.addEventListener('pointerup', this.alSoltar);
      lienzo.addEventListener('pointercancel', this.alSoltar);
    });
  }

  private alArrastrar = (e: PointerEvent): void => {
    if (!this.arrastrando || this.campoSel === null) return;
    const mm = this.aMm(e);
    if (!mm) return;

    const c = this.pdfCampos[this.campoSel];
    const hoja = this.hojaActual()!;
    c.x = this.redondear(Math.min(Math.max(0, mm.x - this.agarre.dx), hoja.width));
    c.y = this.redondear(Math.min(Math.max(0, mm.y - this.agarre.dy), hoja.height));
    this.marcarSucio();

    // Un repintado por cuadro: arrastrar no debe recalcular el PDF entero.
    cancelAnimationFrame(this.repintado);
    this.repintado = requestAnimationFrame(() => this.pintar());
  };

  private alSoltar = (): void => {
    if (!this.arrastrando) return;
    this.arrastrando = false;
    this.zone.run(() => {});
  };

  /** Flechas: 1 mm, y 0,1 mm con Shift. Supr borra el campo seleccionado. */
  alTeclear(e: KeyboardEvent): void {
    if (this.campoSel === null) return;
    const paso = e.shiftKey ? 0.1 : 1;
    const c = this.pdfCampos[this.campoSel];
    let usada = true;

    switch (e.key) {
      case 'ArrowLeft':  c.x = this.redondear(Math.max(0, c.x - paso)); break;
      case 'ArrowRight': c.x = this.redondear(c.x + paso); break;
      case 'ArrowUp':    c.y = this.redondear(Math.max(0, c.y - paso)); break;
      case 'ArrowDown':  c.y = this.redondear(c.y + paso); break;
      case 'Delete':
      case 'Backspace':  this.quitarCampo(this.campoSel); return;
      default: usada = false;
    }

    if (!usada) return;
    e.preventDefault();
    this.marcarSucio();
    this.pintar();
  }

  private redondear(v: number): number { return Math.round(v * 10) / 10; }

  seleccionarCampo(i: number): void {
    this.campoSel = i;
    if (this.pdfCampos[i].page !== this.paginaNum()) {
      this.pdfPagina = this.pdfCampos[i].page;
      this.renderPagina();
      return;
    }
    this.pintar();
  }

  quitarCampo(i: number): void {
    this.pdfCampos.splice(i, 1);
    this.campoSel = null;
    this.marcarSucio();
    this.pintar();
  }

  campoCambiado(): void {
    this.marcarSucio();
    this.revisarBordes();
    this.revisarDatos();
    this.pintar();
  }

  /**
   * Las posiciones se guardan solas un momento después de cada cambio. Antes
   * dependían de «Guardar posiciones»: el «Guardar» de la plantilla no las
   * llevaba y al cerrar se perdían sin aviso (la plantilla 28 quedó con 0
   * variables y el cliente veía el PDF en blanco).
   */
  private marcarSucio(): void {
    this.camposSucios = true;
    this.versionCampos++;
    clearTimeout(this.guardarCamposTimer);
    this.guardarCamposTimer = setTimeout(() => this.savePdfFields(true), 1500);
  }

  private guardarCamposTimer: any = null;

  /** @param solo guardado automático: sin aviso de "guardadas" (el botón ya lo muestra). */
  savePdfFields(solo = false): Promise<boolean> {
    clearTimeout(this.guardarCamposTimer);
    if (!this.templateForm.id) return Promise.resolve(false);

    // Si ya hay uno en curso, al terminar se vuelve a guardar lo último.
    if (this.guardandoCampos) {
      this.guardarCamposTimer = setTimeout(() => this.savePdfFields(solo), 800);
      return Promise.resolve(false);
    }

    const id = this.templateForm.id;
    const campos = this.pdfCampos.map(c => ({ ...c }));
    const version = ++this.versionCampos;
    this.guardandoCampos = true;

    return new Promise(resolve => {
      this.contractService.savePdfFields(id, campos).subscribe({
        next: r => {
          this.guardandoCampos = false;
          if (r.status === 0) {
            // Si se movió algo mientras se guardaba, queda pendiente lo nuevo.
            if (version === this.versionCampos) this.camposSucios = false;
            if (!solo) this.toast('Posiciones guardadas.');
            resolve(true);
          } else {
            this.errorMsg = r.message || 'Error al guardar las posiciones.';
            resolve(false);
          }
        },
        error: () => { this.guardandoCampos = false; this.errorMsg = 'Error de red al guardar las posiciones.'; resolve(false); },
      });
    });
  }

  private versionCampos = 0;

  openPdfPreview(): void {
    if (!this.templateForm.id) return;
    this.contractService.getPdfPreviewBlob(this.templateForm.id).subscribe({
      next: blob => window.open(URL.createObjectURL(blob), '_blank'),
      error: () => { this.errorMsg = 'Error al generar la prueba en PDF.'; },
    });
  }

  // ── Asignados ─────────────────────────────────────────────────────────────

  loadAssigned(): void {
    this.isLoadingAssigned = true;
    this.contractService.getByUser(0).subscribe({
      next: r => {
        this.isLoadingAssigned = false;
        this.assignedContracts = r.data ?? [];
        this.recalcularAsignados();
      },
      error: () => { this.isLoadingAssigned = false; },
    });
  }

  /**
   * La lista filtrada es un campo, no un getter: un getter que devuelve un array
   * nuevo obliga a Angular a redibujar el *ngFor en cada ciclo de detección.
   */
  recalcularAsignados(): void {
    const q = this.assignedSearch.trim().toLowerCase();
    this.asignadosFiltrados = this.assignedContracts.filter(cc => {
      if (this.filtroEstado !== 'todos' && cc.status !== this.filtroEstado) return false;
      if (!q) return true;
      return [cc.user?.names, cc.user?.lastname, cc.user?.dni, cc.user?.username, cc.contract?.title]
        .some(v => (v ?? '').toLowerCase().includes(q));
    });

    this.signedCount  = this.assignedContracts.filter(c => c.status === 'signed').length;
    this.pendingCount = this.assignedContracts.length - this.signedCount;
  }

  filtrarEstado(estado: 'todos' | 'pending' | 'signed'): void {
    this.filtroEstado = estado;
    this.recalcularAsignados();
  }

  /** Etiqueta de la etapa en la que está el contrato del cliente. */
  etapa(cc: ClientContract): string {
    if (cc.status === 'signed') return 'Firmado';
    if (cc.opened_at) return 'Abierto sin firmar';
    if (cc.sent_at) return 'Enviado';
    return 'Sin enviar';
  }

  etapaTono(cc: ClientContract): string {
    if (cc.status === 'signed') return 'np-pill--active';
    if (cc.opened_at) return 'np-pill--info';
    if (cc.sent_at) return 'np-pill--noip';
    return 'np-pill--neutral';
  }

  canal(cc: ClientContract): string {
    return cc.sent_channel === 'whatsapp' ? 'WhatsApp' : (cc.sent_channel === 'email' ? 'correo' : '');
  }

  openAssign(): void {
    this.clientSearch      = '';
    this.clientResults     = [];
    this.selectedClient    = null;
    this.selectedContractId = this.contracts[0]?.id ?? 0;
    this.requireDocuments   = false;
    this.errorMsg          = '';
    this.showAssignModal   = true;
  }

  searchClients(): void {
    if (this.clientSearch.length < 2) return;
    this.isSearching = true;
    this.userService.searchClients(this.clientSearch).subscribe({
      next:  r => { this.isSearching = false; this.clientResults = r.data ?? []; },
      error: () => { this.isSearching = false; },
    });
  }

  selectClient(c: Client): void {
    this.selectedClient  = c;
    this.clientResults   = [];
    this.clientSearch    = `${c.names} ${c.lastname}`;
  }

  assign(): void {
    if (!this.selectedClient || !this.selectedContractId) return;
    this.isAssigning = true;
    this.contractService.assign(this.selectedContractId, this.selectedClient.id, this.requireDocuments).subscribe({
      next: () => {
        this.isAssigning     = false;
        this.showAssignModal = false;
        this.toast('Contrato asignado. Ya puede enviarle el link al cliente.');
        this.loadAssigned();
      },
      error: () => { this.isAssigning = false; this.errorMsg = 'Error al asignar.'; },
    });
  }

  // ── Link de firma ─────────────────────────────────────────────────────────

  getSignUrl(token: string): string { return this.contractService.getSignUrl(token); }

  copyLink(cc: ClientContract): void {
    navigator.clipboard.writeText(this.getSignUrl(cc.token));
    this.copiedId = cc.id;
    setTimeout(() => { this.copiedId = null; }, 2000);
  }

  openSend(cc: ClientContract): void {
    this.showSendModal = cc;
    this.errorMsg = '';
    const digitos = (cc.user?.phone ?? '').replace(/\D/g, '');
    if (/^3\d{9}$/.test(digitos))        this.phoneInput = '+57' + digitos;
    else if (/^57\d{10}$/.test(digitos)) this.phoneInput = '+' + digitos;
    else                                 this.phoneInput = (cc.user?.phone ?? '').trim();
    this.emailInput = cc.user?.email ?? '';
  }

  closeSend(): void { this.showSendModal = null; }

  sendWhatsApp(): void {
    if (!this.showSendModal || !this.phoneInput) return;
    const phone = this.phoneInput.replace(/\D/g, '');
    if (!/^(57\d{10}|3\d{9})$/.test(phone)) {
      this.errorMsg = 'Número inválido. Use 10 dígitos (3XX…) o 12 con el 57 adelante.';
      return;
    }

    const cc = this.showSendModal;
    this.isSendingWa = true;
    this.errorMsg = '';
    this.contractService.sendByWhatsApp(cc.id, phone).subscribe({
      next: r => {
        this.isSendingWa = false;
        if (r.status === 0) {
          this.aplicarSeguimiento(cc, r.data);
          this.showSendModal = null;
          this.toast('Link enviado por WhatsApp.');
        } else {
          this.errorMsg = r.message || 'Error al enviar por WhatsApp.';
        }
      },
      error: err => { this.isSendingWa = false; this.errorMsg = err.error?.message || 'Error de conexión al enviar.'; },
    });
  }

  sendMail(): void {
    if (!this.showSendModal || !this.emailInput) return;
    const cc = this.showSendModal;
    this.isSendingEmail = true;
    this.errorMsg = '';
    this.contractService.sendByEmail(cc.id, this.emailInput).subscribe({
      next: r => {
        this.isSendingEmail = false;
        if (r.status === 0) {
          this.aplicarSeguimiento(cc, r.data);
          this.showSendModal = null;
          this.toast('Link enviado por correo.');
        } else {
          this.errorMsg = r.message || 'Error al enviar el correo.';
        }
      },
      error: () => { this.isSendingEmail = false; this.errorMsg = 'Error de red al enviar el correo.'; },
    });
  }

  /** Refresca la fila sin recargar toda la lista. */
  private aplicarSeguimiento(cc: ClientContract, data: any): void {
    if (!data) return;
    cc.sent_at = data.sent_at ?? cc.sent_at;
    cc.sent_channel = data.sent_channel ?? cc.sent_channel;
    cc.opened_at = data.opened_at ?? cc.opened_at;
  }

  confirmDeleteAssigned(id: number): void  { this.deleteClientContractId = id; }
  cancelDeleteAssigned(): void             { this.deleteClientContractId = null; }

  deleteAssignedContract(): void {
    if (!this.deleteClientContractId) return;
    this.isDeletingAssigned = true;
    this.contractService.deleteClientContract(this.deleteClientContractId).subscribe({
      next: () => {
        this.isDeletingAssigned     = false;
        this.deleteClientContractId = null;
        this.toast('Contrato quitado del cliente.');
        this.loadAssigned();
      },
      error: () => { this.isDeletingAssigned = false; },
    });
  }

  downloadPdf(cc: ClientContract): void {
    this.contractService.downloadPdf(cc.id).subscribe(blob => {
      const url = URL.createObjectURL(blob);
      const a   = document.createElement('a');
      a.href     = url;
      a.download = `contrato-${cc.id}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
    });
  }

  // ── Documentos de identidad ───────────────────────────────────────────────

  openDocuments(cc: ClientContract): void {
    this.showDocumentsModal   = cc;
    this.documentFrontFile    = null;
    this.documentBackFile     = null;
    this.documentFrontPreview = null;
    this.documentBackPreview  = null;
    this.documentNumberFront  = cc.document_number_front || cc.user?.dni || '';
    this.documentNumberBack   = cc.document_number_back  || cc.user?.dni || '';
    this.isUploadingDocuments = false;
    this.errorMsg = '';
  }

  closeDocuments(): void { this.showDocumentsModal = null; }

  onDocumentFrontSelected(event: Event): void {
    const file = (event.target as HTMLInputElement).files?.[0];
    if (!file) return;
    this.documentFrontFile = file;
    const reader = new FileReader();
    reader.onload = () => { this.documentFrontPreview = reader.result as string; };
    reader.readAsDataURL(file);
  }

  onDocumentBackSelected(event: Event): void {
    const file = (event.target as HTMLInputElement).files?.[0];
    if (!file) return;
    this.documentBackFile = file;
    const reader = new FileReader();
    reader.onload = () => { this.documentBackPreview = reader.result as string; };
    reader.readAsDataURL(file);
  }

  uploadDocuments(): void {
    if (!this.showDocumentsModal) return;
    const cc = this.showDocumentsModal;
    const dni = cc.user?.dni || '';

    if (dni) {
      if (this.documentNumberFront && this.documentNumberFront !== dni) {
        this.errorMsg = `El número frontal (${this.documentNumberFront}) no coincide con la cédula del contrato (${dni}).`;
        return;
      }
      if (this.documentNumberBack && this.documentNumberBack !== dni) {
        this.errorMsg = `El número trasero (${this.documentNumberBack}) no coincide con la cédula del contrato (${dni}).`;
        return;
      }
    }

    this.isUploadingDocuments = true;
    this.errorMsg = '';
    this.contractService.uploadDocument(
      cc.id,
      this.documentFrontFile || undefined,
      this.documentBackFile || undefined,
      this.documentNumberFront || undefined,
      this.documentNumberBack || undefined,
    ).subscribe({
      next: r => {
        this.isUploadingDocuments = false;
        if (r.status === 0) {
          this.closeDocuments();
          this.toast('Documentos guardados.');
          this.loadAssigned();
        } else {
          this.errorMsg = r.message || 'Error al guardar documentos.';
        }
      },
      error: () => { this.isUploadingDocuments = false; this.errorMsg = 'Error de red al subir documentos.'; },
    });
  }

  // ── Helpers ───────────────────────────────────────────────────────────────

  toast(msg: string): void {
    this.successMsg = msg;
    setTimeout(() => { this.successMsg = ''; }, 3500);
  }
}
