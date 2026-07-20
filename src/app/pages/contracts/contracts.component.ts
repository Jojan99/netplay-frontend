import { Component, OnInit, ElementRef, ViewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ContractService } from '../../services/contract.service';
import { UserService } from '../../services/user.service';
import { DomSanitizer, SafeResourceUrl, SafeHtml } from '@angular/platform-browser';
import { environment } from '../../../environments/environment';
import * as pdfjsLib from 'pdfjs-dist';

// Configurar worker de pdfjs (requerido en producción)
const PDFJS_VERSION = (pdfjsLib as any).version || '4.5.136';
pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${PDFJS_VERSION}/pdf.worker.min.mjs`;

interface Contract {
  id: number;
  title: string;
  content: string;
  logo?: string;
  pdf_path?: string;
  pdf_url?: string;
  installation_value?: string;
  plazo?: string;
  active: boolean;
  created_at: string;
}

interface ClientContract {
  id: number;
  status: 'pending' | 'signed';
  token: string;
  signed_at: string | null;
  require_documents: boolean;
  document_front_path?: string;
  document_back_path?: string;
  document_number_front?: string;
  document_number_back?: string;
  contract: { id: number; title: string };
  user: { id: number; username: string; names?: string; lastname?: string; phone?: string; email?: string; dni?: string };
}

interface Client {
  id: number;
  names: string;
  lastname: string;
  dni: string;
  phone: string;
  email: string;
}

type Tab = 'templates' | 'assigned';

@Component({
  selector: 'app-contracts',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './contracts.component.html',
})
export class ContractsComponent implements OnInit {

  activeTab: Tab = 'templates';

  // ── Plantillas ────────────────────────────────────────────────────────────
  contracts: Contract[]      = [];
  isLoading                  = false;
  showTemplateModal          = false;
  isEditing                  = false;
  isSaving                   = false;
  templateForm               = { id: 0, title: '', content: '', active: true, installation_value: '', plazo: '12' };
  deleteConfirmId: number | null = null;
  isDeleting                 = false;

  // ── PDF Upload / Guía ────────────────────────────────────────────────────
  pdfFile: File | null       = null;
  isUploadingPdf             = false;
  pdfGuideUrl: string | null = null;   // URL del PDF original para mostrar como guía

  // ── PDF Base (fondo exacto del contrato) ───────────────────────────────────
  pdfBaseFile: File | null   = null;
  isUploadingPdfBase         = false;
  hasPdfBase                 = false;  // Indica si el contrato ya tiene PDF base
  pdfBaseUrl: string | null  = null;   // URL pública del PDF base

  // ── Logo Upload ───────────────────────────────────────────────────────────
  logoFile: File | null      = null;
  logoPreview: string | null = null;
  isUploadingLogo            = false;

  // ── Preview HTML ──────────────────────────────────────────────────────────
  showPreview                = false;

  // ── PDF Coordinate Picker ─────────────────────────────────────────────────
  pdfPickerActive            = false;
  pdfPickerVariable          = '';
  pdfFields: Array<{id?:number, variable:string, page:number, x:number, y:number, font_size:number, color:string, max_width:number}> = [];
  pdfDimensions: {pageCount:number, pages:Array<{page:number, width:number, height:number, orientation:string}>} | null = null;
  pdfPickerPage              = 1;

  // Canvas rendering del PDF (pixel-perfect)
  @ViewChild('pdfCanvas') pdfCanvasRef!: ElementRef<HTMLCanvasElement>;
  @ViewChild('pdfImage') pdfImageRef!: ElementRef<HTMLImageElement>;
  pdfCanvasUrl: string | null = null;
  isRenderingPdf = false;
  pdfRenderScale = 1.5;
  pdfImageUrl: string | null = null;
  cursorCoords: {x:number, y:number, pdfX:number, pdfY:number} | null = null;
  pdfPreviewMode = false;  // true = muestra datos dummy sobre el PDF

  // Valores dummy para preview visual (se actualizan dinámicamente)
  get pdfPreviewValues(): Record<string, string> {
    const instVal = this.templateForm.installation_value;
    const instValP = this.templateForm.plazo;
    const formattedInst = instVal && parseFloat(instVal) > 0
      ? '$' + new Intl.NumberFormat('es-CO', { minimumFractionDigits: 0, maximumFractionDigits: 2 }).format(parseFloat(instVal))
      : '$60.000';
    const plazo = instValP ? parseInt(instValP) : 12; // meses

    return {
      '{{nombre}}': 'JUAN',
      '{{apellido}}': 'PEREZ',
      '{{nombre_completo}}': 'JUAN PEREZ',
      '{{dni}}': '12345678',
      '{{telefono}}': '3001234567',
      '{{email}}': 'juan@ejemplo.com',
      '{{direccion}}': 'Calle 123 # 45-67',
      '{{fecha}}': '16/07/2026',
      '{{contrato_id}}': '999',
      '{{dia}}': '16',
      '{{mes}}': '07',
      '{{anio}}': '2026',
      '{{plan_nombre}}': 'INTERNET 200MB',
      '{{plan_velocidad}}': '200 Mb',
      '{{plan_precio}}': '$50.000',
      '{{plan_instalacion}}': formattedInst,
      '{{promocion_nombre}}': 'PROMO VERANO',
      '{{check_200mb}}': 'X',
      '{{check_300mb}}': '',
      '{{check_400mb}}': '',
      '{{check_otra}}': '',
      '{{check_os_nuevo}}': 'X',
      '{{check_os_mod}}': '',
      '{{check}}': 'X',
      '{{tipo_documento}}': 'CC',
      '{{valor_instalacion}}': formattedInst,
      '{{plazo}}': plazo.toString(),
      '{{firma}}': 'FIRMA',
    };
  }

  // ── Variables rápidas ─────────────────────────────────────────────────────
  quickVars = [
    { label: 'Nombre',            code: '{{nombre}}' },
    { label: 'Apellido',          code: '{{apellido}}' },
    { label: 'Nombre completo',   code: '{{nombre_completo}}' },
    { label: 'DNI',               code: '{{dni}}' },
    { label: 'Teléfono',          code: '{{telefono}}' },
    { label: 'Email',             code: '{{email}}' },
    { label: 'Dirección',         code: '{{direccion}}' },
    { label: 'Fecha',             code: '{{fecha}}' },
    // Fecha separada
    { label: 'Día',               code: '{{dia}}' },
    { label: 'Mes',               code: '{{mes}}' },
    { label: 'Año',               code: '{{anio}}' },
    // Documento
    { label: 'Tipo documento',    code: '{{tipo_documento}}' },
    // Plan de internet
    { label: 'Plan nombre',       code: '{{plan_nombre}}' },
    { label: 'Plan velocidad',    code: '{{plan_velocidad}}' },
    { label: 'Plan precio',       code: '{{plan_precio}}' },
    { label: 'Plan instalación',  code: '{{plan_instalacion}}' },
    { label: 'Promoción',         code: '{{promocion_nombre}}' },
    { label: 'Valor instalación', code: '{{valor_instalacion}}' },
    { label: 'Plazo',             code: '{{plazo}}' },
    // Checks velocidad
    { label: 'Check 200 Mb',      code: '{{check_200mb}}' },
    { label: 'Check 300 Mb',      code: '{{check_300mb}}' },
    { label: 'Check 400 Mb',      code: '{{check_400mb}}' },
    { label: 'Check Otra vel.',   code: '{{check_otra}}' },
    // Checks OS
    { label: 'Check OS Nuevo',    code: '{{check_os_nuevo}}' },
    { label: 'Check OS Modif.',   code: '{{check_os_mod}}' },
    // Check simple
    { label: 'Check (siempre X)', code: '{{check}}' },
    // Firma posicionada
    { label: 'Firma (imagen)',    code: '{{firma}}' },
    { label: 'ID Contrato',       code: '{{contrato_id}}' },
  ];

  // ── Asignación ────────────────────────────────────────────────────────────
  assignedContracts: ClientContract[] = [];
  isLoadingAssigned                   = false;
  showAssignModal                     = false;
  isAssigning                         = false;
  clientSearch                        = '';
  clientResults: Client[]             = [];
  isSearching                         = false;
  selectedClient: Client | null       = null;
  selectedContractId                  = 0;
  requireDocuments                    = false;

  // ── Documentos ────────────────────────────────────────────────────────────
  showDocumentsModal: ClientContract | null = null;
  documentFrontFile: File | null = null;
  documentBackFile: File | null = null;
  documentFrontPreview: string | null = null;
  documentBackPreview: string | null = null;
  isUploadingDocuments = false;
  documentNumberFront = '';
  documentNumberBack = '';

  // ── Filtro asignados ─────────────────────────────────────────────────────
  assignedSearch = '';

  get filteredAssigned(): ClientContract[] {
    const q = this.assignedSearch.trim().toLowerCase();
    if (!q) return this.assignedContracts;
    return this.assignedContracts.filter(cc =>
      cc.user.names?.toLowerCase().includes(q)      ||
      cc.user.lastname?.toLowerCase().includes(q)   ||
      cc.user.dni?.toLowerCase().includes(q)        ||
      cc.user.username?.toLowerCase().includes(q)   ||
      cc.contract.title.toLowerCase().includes(q)
    );
  }

  // ── Eliminar contrato asignado ────────────────────────────────────────────
  deleteClientContractId: number | null = null;
  isDeletingAssigned                    = false;

  // ── Envío de link ─────────────────────────────────────────────────────────
  showSendModal: ClientContract | null = null;
  phoneInput                           = '';
  emailInput                           = '';
  isSendingWa                          = false;
  isSendingEmail                       = false;
  copiedId: number | null              = null;

  // ── Feedback ──────────────────────────────────────────────────────────────
  successMsg = '';
  errorMsg   = '';

  env = environment;

  constructor(
    private contractService: ContractService,
    private userService: UserService,
    private sanitizer: DomSanitizer,
  ) {}

  get safePdfBaseUrl(): SafeResourceUrl | null {
    if (!this.pdfBaseUrl) return null;
    const url = this.pdfBaseUrl + '#page=' + this.pdfPickerPage + '&toolbar=0&navpanes=0&scrollbar=0&zoom=page-width';
    return this.sanitizer.bypassSecurityTrustResourceUrl(url);
  }

  ngOnInit(): void {
    this.loadContracts();
    this.loadAssigned();
  }

  // ── Plantillas ────────────────────────────────────────────────────────────

  loadContracts(): void {
    this.isLoading = true;
    this.contractService.getAll().subscribe({
      next:  r => { this.isLoading = false; this.contracts = r.data ?? []; },
      error: () => { this.isLoading = false; },
    });
  }

  openCreate(): void {
    this.isEditing     = false;
    this.templateForm  = { id: 0, title: '', content: '', active: true, installation_value: '', plazo: '12' };
    this.logoFile      = null;
    this.logoPreview   = null;
    this.pdfFile       = null;
    this.pdfBaseFile   = null;
    this.hasPdfBase    = false;
    this.pdfBaseUrl    = null;
    this.pdfGuideUrl   = null;
    this.showPreview   = false;
    this.errorMsg      = '';
    this.showTemplateModal = true;
  }

  openEdit(c: Contract): void {
    this.isEditing    = true;
    this.templateForm = {
      id: c.id,
      title: c.title,
      content: c.content,
      active: c.active,
      installation_value: c.installation_value ?? '',
      plazo: c.plazo ?? '12',
    };
    this.logoPreview  = c.logo ?? null;
    this.hasPdfBase   = !!c.pdf_path;
    this.pdfBaseUrl   = c.pdf_path ? environment.rootUrl + 'storage/' + c.pdf_path : null;
    this.pdfGuideUrl  = null;
    this.pdfFile      = null;
    this.pdfBaseFile  = null;
    this.errorMsg     = '';
    this.pdfPickerActive = false;
    this.pdfFields    = [];
    this.showTemplateModal = true;
    if (this.hasPdfBase) {
      this.loadPdfDimensionsAndFields();
    }
  }

  saveTemplate(): void {
    this.isSaving = true;
    this.errorMsg = '';

    const payload: any = { ...this.templateForm };
    if (this.logoPreview) {
      payload.logo = this.logoPreview;
    }

    const obs = this.isEditing
      ? this.contractService.update(this.templateForm.id, payload)
      : this.contractService.create(payload);

    obs.subscribe({
      next: r => {
        this.isSaving = false;
        if (r.status === 0) {
          this.showTemplateModal = false;
          this.toast(this.isEditing ? 'Contrato actualizado.' : 'Contrato creado.');
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
        this.toast('Contrato eliminado.');
        this.loadContracts();
      },
      error: () => { this.isDeleting = false; },
    });
  }

  // ── Asignados ─────────────────────────────────────────────────────────────

  loadAssigned(): void {
    this.isLoadingAssigned = true;
    // Carga los contratos asignados de todos los clientes activos
    // El backend filtra por company_id del JWT
    this.contractService.getByUser(0).subscribe({
      next:  r => { this.isLoadingAssigned = false; this.assignedContracts = r.data ?? []; },
      error: () => { this.isLoadingAssigned = false; },
    });
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
      next: r => {
        this.isAssigning     = false;
        this.showAssignModal = false;
        this.toast('Contrato asignado. Ya puede enviarle el link al cliente.');
        this.loadAssigned();
      },
      error: () => { this.isAssigning = false; this.errorMsg = 'Error al asignar.'; },
    });
  }

  // ── Link de firma ─────────────────────────────────────────────────────────

  getSignUrl(token: string): string {
    return this.contractService.getSignUrl(token);
  }

  copyLink(cc: ClientContract): void {
    navigator.clipboard.writeText(this.getSignUrl(cc.token));
    this.copiedId = cc.id;
    setTimeout(() => { this.copiedId = null; }, 2000);
  }

  openSend(cc: ClientContract): void {
    this.showSendModal = cc;
    // Normalizar teléfono para mostrar con prefijo +57 si es colombiano
    const rawPhone = (cc.user.phone ?? '').trim();
    const digitsOnly = rawPhone.replace(/\D/g, '');
    if (/^3\d{9}$/.test(digitsOnly)) {
      this.phoneInput = '+57' + digitsOnly;
    } else if (/^57\d{10}$/.test(digitsOnly)) {
      this.phoneInput = '+' + digitsOnly;
    } else {
      this.phoneInput = rawPhone;
    }
    this.emailInput = cc.user.email ?? '';
  }

  closeSend(): void { this.showSendModal = null; }

  sendWhatsApp(): void {
    if (!this.showSendModal || !this.phoneInput) return;

    // Normalizar número: quitar todo excepto dígitos
    let phone = this.phoneInput.replace(/\D/g, '');

    // Validar formato colombiano: 10 dígitos (3xxxxxxxxxx) o 12 dígitos (57xxxxxxxxxx)
    const isValidColombian = /^(57\d{10}|3\d{9})$/.test(phone);
    if (!isValidColombian) {
      this.errorMsg = 'Número inválido. Ingrese 10 dígitos (3XX...) o 12 dígitos (57...). Ej: 3245127868 o 573245127868';
      return;
    }

    this.isSendingWa = true;
    this.errorMsg = '';
    this.contractService.sendByWhatsApp(this.showSendModal.id, phone).subscribe({
      next: (r) => {
        this.isSendingWa = false;
        if (r.status === 0) {
          this.showSendModal = null;
          this.toast('Mensaje enviado por WhatsApp.');
        } else {
          this.errorMsg = r.message || 'Error al enviar WhatsApp.';
        }
      },
      error: (err) => {
        this.isSendingWa = false;
        this.errorMsg = err.error?.message || 'Error de conexión al enviar WhatsApp.';
      },
    });
  }

  sendMail(): void {
    if (!this.showSendModal || !this.emailInput) return;
    this.isSendingEmail = true;
    this.contractService.sendByEmail(this.showSendModal.id, this.emailInput).subscribe({
      next: () => {
        this.isSendingEmail = false;
        this.showSendModal  = null;
        this.toast('Correo enviado exitosamente.');
      },
      error: () => { this.isSendingEmail = false; },
    });
  }

  confirmDeleteAssigned(id: number): void  { this.deleteClientContractId = id; }
  cancelDeleteAssigned(): void             { this.deleteClientContractId = null; }

  deleteAssignedContract(): void {
    if (!this.deleteClientContractId) return;
    this.isDeletingAssigned = true;
    this.contractService.deleteClientContract(this.deleteClientContractId).subscribe({
      next: () => {
        this.isDeletingAssigned       = false;
        this.deleteClientContractId   = null;
        this.toast('Contrato eliminado del cliente.');
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

  // ── PDF Upload ────────────────────────────────────────────────────────────

  onPdfSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    if (input.files && input.files[0]) {
      this.pdfFile = input.files[0];
      this.uploadPdf();
    }
  }

  uploadPdf(): void {
    if (!this.pdfFile) return;
    this.isUploadingPdf = true;
    this.contractService.uploadPdf(this.pdfFile).subscribe({
      next: (r) => {
        this.isUploadingPdf = false;
        if (r.status === 0) {
          if (r.data?.html) {
            this.templateForm.content = r.data.html;
          }
          if (r.data?.pdfUrl) {
            this.pdfGuideUrl = r.data.pdfUrl;
            this.showPreview = true;
          }
          this.toast('PDF cargado. Puede editar el contenido y usar el PDF original como guía.');
        } else {
          this.errorMsg = r.message || 'Error al convertir PDF.';
        }
      },
      error: () => {
        this.isUploadingPdf = false;
        this.errorMsg = 'Error al subir PDF.';
      },
    });
  }

  // ── PDF Base Upload (fondo exacto del contrato) ───────────────────────────

  onPdfBaseSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    if (input.files && input.files[0]) {
      this.pdfBaseFile = input.files[0];
      this.uploadPdfBase();
    }
  }

  uploadPdfBase(): void {
    if (!this.pdfBaseFile || !this.isEditing) return;
    this.isUploadingPdfBase = true;
    this.contractService.uploadPdfBase(this.templateForm.id, this.pdfBaseFile).subscribe({
      next: (r) => {
        this.isUploadingPdfBase = false;
        if (r.status === 0) {
          this.hasPdfBase = true;
          this.pdfBaseUrl = r.data?.pdf_url ?? null;
          this.loadPdfDimensionsAndFields();
          this.toast('PDF base guardado. Ahora configurá las coordenadas de cada variable.');
        } else {
          this.errorMsg = r.message || 'Error al guardar PDF base.';
        }
      },
      error: () => {
        this.isUploadingPdfBase = false;
        this.errorMsg = 'Error al subir PDF base.';
      },
    });
  }

  // ── PDF Coordinate Picker ────────────────────────────────────────────────

  loadPdfDimensionsAndFields(): void {
    if (!this.templateForm.id || !this.hasPdfBase) return;
    this.contractService.getPdfDimensions(this.templateForm.id).subscribe({
      next: (r) => {
        if (r.status === 0) {
          this.pdfDimensions = r.data;
          this.pdfPickerPage = 1;
          // Re-renderizar una vez que las dimensiones estén listas y el DOM se haya actualizado
          if (this.pdfPickerActive) {
            setTimeout(() => this.renderPdfPage(), 0);
          }
        }
      },
    });
    this.contractService.getPdfFields(this.templateForm.id).subscribe({
      next: (r) => {
        if (r.status === 0 && r.data) {
          this.pdfFields = r.data.map((f: any) => ({
            id: f.id,
            variable: f.variable,
            page: f.page,
            x: f.x,
            y: f.y,
            font_size: f.font_size,
            color: f.color,
            max_width: f.max_width,
          }));
        } else {
          this.pdfFields = [];
        }
        // Re-renderizar cuando carguen los campos (para mostrar puntos al abrir)
        if (this.pdfPickerActive) {
          setTimeout(() => this.renderPdfPage(), 0);
        }
      },
    });
  }

  openPdfPicker(): void {
    this.pdfPickerActive = true;
    this.pdfCanvasUrl = this.pdfBaseUrl;
    this.loadPdfDimensionsAndFields();
  }

  closePdfPicker(): void {
    this.pdfPickerActive = false;
    this.pdfPickerVariable = '';
  }

  /**
   * Renderiza la página actual del PDF base en el canvas usando pdfjs-dist.
   * Esto da una imagen pixel-perfect del PDF sin márgenes del visor de iframe.
   */
  async renderPdfPage(): Promise<void> {
    if (!this.pdfCanvasUrl || !this.pdfDimensions) {
      console.warn('[PDF Picker] Falta pdfCanvasUrl o pdfDimensions');
      return;
    }
    const canvas = this.pdfCanvasRef?.nativeElement;
    if (!canvas) {
      console.warn('[PDF Picker] Canvas no disponible en DOM');
      this.errorMsg = 'Canvas no disponible. Cerrá y volvé a abrir el editor.';
      return;
    }

    this.isRenderingPdf = true;
    this.errorMsg = '';
    // Asegurar que pdfPickerPage sea un número entero (el <select> lo convierte a string)
    const pageNum = parseInt(String(this.pdfPickerPage), 10);
    try {
      console.log('[PDF Picker] Cargando PDF:', this.pdfCanvasUrl);
      const loadingTask = pdfjsLib.getDocument(this.pdfCanvasUrl);
      const pdf = await loadingTask.promise;
      console.log('[PDF Picker] PDF cargado. Páginas:', pdf.numPages);

      if (pageNum < 1 || pageNum > pdf.numPages) {
        throw new Error(`Página ${pageNum} fuera de rango (1-${pdf.numPages})`);
      }

      const page = await pdf.getPage(pageNum);
      console.log('[PDF Picker] Página', pageNum, 'cargada');

      // Escala: dibujamos a 1.5x para buena calidad visual
      const viewport = page.getViewport({ scale: this.pdfRenderScale });
      canvas.width = viewport.width;
      canvas.height = viewport.height;
      console.log('[PDF Picker] Canvas size:', canvas.width, 'x', canvas.height);

      const ctx = canvas.getContext('2d')!;
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      await page.render({ canvasContext: ctx, viewport }).promise;

      // Dibujar marcadores de campos ya colocados (directo sobre el canvas = pixel-perfect)
      const currentPageData = this.pdfDimensions!.pages[this.pdfPickerPage - 1];
      this.drawMarkersOnCanvas(ctx, canvas.width, canvas.height, { width: currentPageData.width, height: currentPageData.height });

      // Convertir canvas a imagen base64 para mostrar como <img>
      this.pdfImageUrl = canvas.toDataURL('image/png');
      console.log('[PDF Picker] Imagen generada con marcadores. Size:', this.pdfImageUrl.length);
    } catch (e: any) {
      console.error('[PDF Picker] Error renderizando PDF:', e);
      this.errorMsg = 'No se pudo renderizar el PDF. Probá recargar la página o usar el botón de abajo.';
    } finally {
      this.isRenderingPdf = false;
    }
  }

  /**
   * Dibuja marcadores + labels sobre el canvas.
   * En modo preview también dibuja el valor dummy como se vería en el PDF final.
   */
  private drawMarkersOnCanvas(
    ctx: CanvasRenderingContext2D,
    canvasW: number,
    _canvasH: number,
    pageData: { width: number; height: number }
  ): void {
    const scaleX = canvasW / pageData.width;
    const currentPageNum = parseInt(String(this.pdfPickerPage), 10);

    this.pdfFields.forEach((f) => {
      if (f.page !== currentPageNum) return;

      const px = f.x * scaleX;
      const py = f.y * scaleX;
      const isFirma = f.variable === '{{firma}}';
      const varName = f.variable.replace('{{', '').replace('}}', '');

      // Tamaño de fuente base: pt * 1.5 (escala canvas) -> luego CSS escala proporcionalmente
      const fontSizePx = Math.round(f.font_size * 1.5);

      if (this.pdfPreviewMode && !isFirma) {
        // ── MODO PREVIEW: dibujar valor dummy como texto real ──
        const previewVal = this.pdfPreviewValues[f.variable] || 'VALOR';
        console.log({
    variable: f.variable,
    valor: this.pdfPreviewValues[f.variable],
    todos: this.pdfPreviewValues
});

        // Fondo blanco semitransparente para legibilidad
        ctx.font = `bold ${fontSizePx}px Arial, sans-serif`;
        const textMetrics = ctx.measureText(previewVal);
        const textW = textMetrics.width + 8;
        const textH = fontSizePx + 6;
        ctx.fillStyle = 'rgba(255,255,255,0.92)';
        ctx.fillRect(px - 2, py - 2, textW, textH);

        // Texto dummy (color del campo)
        const colorHex = f.color || '000000';
        const r = parseInt(colorHex.substring(0, 2), 16);
        const g = parseInt(colorHex.substring(2, 4), 16);
        const b = parseInt(colorHex.substring(4, 6), 16);
        ctx.fillStyle = `rgb(${r},${g},${b})`;
        ctx.textAlign = 'left';
        ctx.textBaseline = 'top';
        ctx.fillText(previewVal, px, py);

        // Label pequeño arriba indicando la variable
        const labelFont = Math.max(8, Math.round(fontSizePx * 0.7));
        ctx.font = `bold ${labelFont}px Arial, sans-serif`;
        ctx.fillStyle = '#ef4444';
        ctx.fillText(varName, px, py - labelFont - 2);

        // Punto indicador pequeño al inicio
        ctx.beginPath();
        ctx.arc(px - 6, py + fontSizePx / 2, 3, 0, Math.PI * 2);
        ctx.fillStyle = '#ef4444';
        ctx.fill();

      } else if (this.pdfPreviewMode && isFirma) {
        // ── MODO PREVIEW: firma como rectángulo gris ──
        ctx.fillStyle = 'rgba(200,200,200,0.4)';
        ctx.fillRect(px, py, 80 * scaleX, 25 * scaleX);
        ctx.strokeStyle = '#6b7280';
        ctx.lineWidth = 1;
        ctx.strokeRect(px, py, 80 * scaleX, 25 * scaleX);
        ctx.font = `bold ${fontSizePx}px Arial, sans-serif`;
        ctx.fillStyle = '#6b7280';
        ctx.textAlign = 'left';
        ctx.textBaseline = 'top';
        ctx.fillText('( FIRMA )', px + 4, py + 4);

      } else {
        // ── MODO NORMAL: punto + label de variable ──
        // Punto visible
        ctx.beginPath();
        ctx.arc(px, py, 5, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(255,255,255,0.95)';
        ctx.fill();
        ctx.beginPath();
        ctx.arc(px, py, 4, 0, Math.PI * 2);
        ctx.fillStyle = isFirma ? '#10b981' : '#ef4444';
        ctx.fill();
        ctx.beginPath();
        ctx.arc(px, py, 4, 0, Math.PI * 2);
        ctx.strokeStyle = 'rgba(0,0,0,0.4)';
        ctx.lineWidth = 0.8;
        ctx.stroke();

        // Label de variable arriba del punto
        ctx.font = `bold ${Math.max(9, fontSizePx)}px Arial, sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'bottom';
        const labelY = py - 7;
        // Fondo blanco para el label
        const labelMetrics = ctx.measureText(varName);
        const labelW = labelMetrics.width + 6;
        ctx.fillStyle = 'rgba(255,255,255,0.9)';
        ctx.fillRect(px - labelW / 2, labelY - 11, labelW, 13);
        ctx.fillStyle = isFirma ? '#047857' : '#b91c1c';
        ctx.fillText(varName, px, labelY);
      }
    });
  }

  onPdfPreviewClick(event: MouseEvent): void {
    if (!this.pdfPickerActive || !this.pdfPickerVariable || !this.pdfDimensions) return;

    const img = event.target as HTMLImageElement;
    if (!img || !img.clientWidth) return;

    const currentPageNum = parseInt(String(this.pdfPickerPage), 10);
    const pageData = this.pdfDimensions.pages[currentPageNum - 1];
    if (!pageData) return;

    // offsetX/Y son la posición exacta dentro de la imagen renderizada (px del DOM)
    const clickX = event.offsetX;
    const clickY = event.offsetY;

    // Escala: puntos PDF = click_px * (pdf_pts / img_px)
    const scaleX = pageData.width / img.clientWidth;
    const scaleY = pageData.height / img.clientHeight;

    const pdfX = clickX * scaleX;
    const pdfY = clickY * scaleY;

    // Debug en consola para verificar precisión
    console.log('[PDF Click]', { clickX, clickY, imgW: img.clientWidth, imgH: img.clientHeight, pdfX, pdfY, pageW: pageData.width, pageH: pageData.height });

    // Siempre agregar una nueva instancia
    this.pdfFields.push({
      variable: this.pdfPickerVariable,
      page: this.pdfPickerPage,
      x: parseFloat(pdfX.toFixed(2)),
      y: parseFloat(pdfY.toFixed(2)),
      font_size: this.pdfPickerVariable === '{{firma}}' ? 12 : 10,
      color: '000000',
      max_width: 200,
    });

    const existingCount = this.pdfFields.filter(
      f => f.variable === this.pdfPickerVariable && f.page === this.pdfPickerPage
    ).length;
    const msg = existingCount > 1
      ? `Nueva posición #${existingCount} agregada: ${this.pdfPickerVariable}`
      : `Posición guardada: ${this.pdfPickerVariable}`;
    this.toast(`${msg} (página ${this.pdfPickerPage})`);

    // Re-renderizar para mostrar el nuevo marcador dibujado sobre el PDF
    this.renderPdfPage();
  }

  onPdfMouseMove(event: MouseEvent): void {
    if (!this.pdfDimensions) return;
    const img = event.target as HTMLImageElement;
    if (!img || !img.clientWidth) return;

    const pageData = this.pdfDimensions.pages[this.pdfPickerPage - 1];
    if (!pageData) return;

    const scaleX = pageData.width / img.clientWidth;
    const scaleY = pageData.height / img.clientHeight;

    this.cursorCoords = {
      x: Math.round(event.offsetX),
      y: Math.round(event.offsetY),
      pdfX: Math.round(event.offsetX * scaleX),
      pdfY: Math.round(event.offsetY * scaleY),
    };
  }

  removePdfField(idx: number): void {
    this.pdfFields.splice(idx, 1);
    // Re-renderizar para quitar el punto del canvas
    this.renderPdfPage();
  }

  savePdfFields(): void {
    if (!this.templateForm.id) return;
    const payload = this.pdfFields.map(f => ({
      variable: f.variable,
      page: f.page,
      x: f.x,
      y: f.y,
      font_size: f.font_size,
      color: f.color,
      max_width: f.max_width,
    }));
    this.contractService.savePdfFields(this.templateForm.id, payload).subscribe({
      next: (r) => {
        if (r.status === 0) {
          this.toast('Coordenadas guardadas exitosamente.');
        } else {
          this.errorMsg = r.message || 'Error al guardar coordenadas.';
        }
      },
      error: () => this.errorMsg = 'Error de red al guardar coordenadas.',
    });
  }

  openPdfPreview(): void {
    if (!this.templateForm.id) return;
    this.contractService.getPdfPreviewBlob(this.templateForm.id).subscribe({
      next: (blob) => {
        const url = URL.createObjectURL(blob);
        window.open(url, '_blank');
      },
      error: () => {
        this.errorMsg = 'Error al generar la vista previa del PDF.';
      },
    });
  }

  // ── Logo Upload ───────────────────────────────────────────────────────────

  onLogoSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    if (input.files && input.files[0]) {
      this.logoFile = input.files[0];
      const reader = new FileReader();
      reader.onload = () => {
        this.logoPreview = reader.result as string;
      };
      reader.readAsDataURL(this.logoFile);
      this.uploadLogo();
    }
  }

  uploadLogo(): void {
    if (!this.logoFile || !this.isEditing) return;
    this.isUploadingLogo = true;
    this.contractService.uploadLogo(this.templateForm.id, this.logoFile).subscribe({
      next: (r) => {
        this.isUploadingLogo = false;
        if (r.status === 0) {
          this.toast('Logo guardado.');
        } else {
          this.errorMsg = r.message || 'Error al subir logo.';
        }
      },
      error: () => {
        this.isUploadingLogo = false;
        this.errorMsg = 'Error al subir logo.';
      },
    });
  }

  // ── Variables rápidas ─────────────────────────────────────────────────────

  insertVar(code: string): void {
    const ta = document.getElementById('contractContent') as HTMLTextAreaElement | null;
    if (!ta) {
      this.templateForm.content += ' ' + code;
      return;
    }
    const start = ta.selectionStart;
    const end   = ta.selectionEnd;
    const text  = this.templateForm.content;
    this.templateForm.content = text.substring(0, start) + code + text.substring(end);
    setTimeout(() => {
      ta.selectionStart = ta.selectionEnd = start + code.length;
      ta.focus();
    }, 0);
  }

  togglePreview(): void {
    this.showPreview = !this.showPreview;
  }

  safePdfUrl(): SafeResourceUrl | null {
    return this.pdfGuideUrl ? this.sanitizer.bypassSecurityTrustResourceUrl(this.pdfGuideUrl) : null;
  }

  /**
   * Limpia todos los inline styles del HTML, dejando solo etiquetas semánticas limpias.
   * Esto permite que el CSS de la página de firma aplique el diseño formal.
   */
  cleanStyles(): void {
    if (!this.templateForm.content) return;
    let html = this.templateForm.content;
    // Quitar atributos style="..." de todas las etiquetas
    html = html.replace(/\s*style\s*=\s*["'][^"']*["']/gi, '');
    // Quitar atributos class que sean del wrapper viejo
    html = html.replace(/\s*class\s*=\s*["']contract-body["']/gi, '');
    html = html.replace(/\s*class\s*=\s*["']contract-guide["']/gi, '');
    // Quitar el wrapper viejo con inline style
    html = html.replace(/<div\s*>\s*<p\s*><strong>Guía:<\/strong>[^<]*<\/p>/i, '');
    html = html.replace(/<\/div>\s*$/i, '');
    // Limpiar espacios extra
    html = html.replace(/>\s+</g, '><');
    html = html.replace(/\n\s*\n/g, '\n');
    this.templateForm.content = html.trim();
    this.toast('Estilos limpiados. El contrato ahora usará el diseño formal.');
  }

  /**
   * Renderiza el HTML de preview aplicando estilos formales de contrato
   * y reemplazando las variables {{xxx}} con badges de colores.
   */
  renderPreviewHtml(): SafeHtml {
    let html = this.templateForm.content || '';

    // Aplicar estilos formales de contrato a headings (simulando la página de firma)
    html = html.replace(/<h2>/gi, '<h2 style="font-family:Georgia,serif; font-size:16px; font-weight:bold; text-align:center; color:#1a1a2e; margin:20px 0 10px; text-transform:uppercase; letter-spacing:0.5px; border-bottom:1px solid #ccc; padding-bottom:4px;">');
    html = html.replace(/<h3>/gi, '<h3 style="font-family:Georgia,serif; font-size:14px; font-weight:bold; text-align:left; color:#333; margin:16px 0 8px; background:#f5f5f5; padding:4px 8px; border-left:3px solid #6c63ff;">');
    html = html.replace(/<p>/gi, '<p style="font-size:14px; line-height:1.85; color:#222; margin-bottom:10px; text-indent:30px; text-align:justify;">');
    html = html.replace(/<table>/gi, '<table style="width:100%; border-collapse:collapse; margin:12px 0; font-size:13px;">');
    html = html.replace(/<td>/gi, '<td style="border:1px solid #bbb; padding:8px 10px; text-align:left; background:#fafafa;">');
    html = html.replace(/<th>/gi, '<th style="border:1px solid #bbb; padding:8px 10px; text-align:left; background:#f0f0f0; font-weight:bold;">');

    // Badges de variables con colores distintivos
    const varBadges: Record<string, { label: string; bg: string; color: string }> = {
      '{{nombre}}':          { label: 'NOMBRE',          bg: '#dbeafe', color: '#1e40af' },
      '{{apellido}}':        { label: 'APELLIDO',        bg: '#dcfce7', color: '#166534' },
      '{{nombre_completo}}': { label: 'NOMBRE COMPLETO', bg: '#e0e7ff', color: '#3730a3' },
      '{{dni}}':             { label: 'DNI',             bg: '#fef3c7', color: '#92400e' },
      '{{telefono}}':        { label: 'TELÉFONO',        bg: '#fce7f3', color: '#9d174d' },
      '{{email}}':           { label: 'EMAIL',           bg: '#ccfbf1', color: '#115e59' },
      '{{direccion}}':       { label: 'DIRECCIÓN',       bg: '#f3e8ff', color: '#6b21a8' },
      '{{fecha}}':           { label: 'FECHA',           bg: '#ffedd5', color: '#9a3412' },
      '{{fecha_hora}}':      { label: 'FECHA Y HORA',    bg: '#ecfccb', color: '#3f6212' },
      '{{contrato_id}}':     { label: 'N° CONTRATO',     bg: '#f1f5f9', color: '#475569' },
    };

    Object.entries(varBadges).forEach(([code, badge]) => {
      const escaped = code.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const regex = new RegExp(escaped, 'g');
      html = html.replace(
        regex,
        `<span style="display:inline-block; padding:2px 8px; border-radius:4px; font-size:12px; font-weight:700; background:${badge.bg}; color:${badge.color}; border:1px solid ${badge.color}; font-family:Arial,sans-serif; white-space:nowrap;">${badge.label}</span>`
      );
    });

    return this.sanitizer.bypassSecurityTrustHtml(html);
  }

  // ── Helpers ───────────────────────────────────────────────────────────────

  toast(msg: string): void {
    this.successMsg = msg;
    setTimeout(() => { this.successMsg = ''; }, 3500);
  }

  // ── Documentos de identidad ─────────────────────────────────────────────

  openDocuments(cc: ClientContract): void {
    this.showDocumentsModal = cc;
    this.documentFrontFile = null;
    this.documentBackFile = null;
    this.documentFrontPreview = null;
    this.documentBackPreview = null;
    this.documentNumberFront = cc.document_number_front || cc.user?.dni || '';
    this.documentNumberBack = cc.document_number_back || cc.user?.dni || '';
    this.isUploadingDocuments = false;
  }

  closeDocuments(): void {
    this.showDocumentsModal = null;
  }

  onDocumentFrontSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    if (input.files && input.files[0]) {
      this.documentFrontFile = input.files[0];
      const reader = new FileReader();
      reader.onload = () => { this.documentFrontPreview = reader.result as string; };
      reader.readAsDataURL(this.documentFrontFile);
    }
  }

  onDocumentBackSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    if (input.files && input.files[0]) {
      this.documentBackFile = input.files[0];
      const reader = new FileReader();
      reader.onload = () => { this.documentBackPreview = reader.result as string; };
      reader.readAsDataURL(this.documentBackFile);
    }
  }

  uploadDocuments(): void {
    if (!this.showDocumentsModal) return;
    const cc = this.showDocumentsModal;

    // Validar número de documento contra el DNI del contrato
    const clientDni = cc.user?.dni || '';
    if (clientDni) {
      if (this.documentNumberFront && this.documentNumberFront !== clientDni) {
        this.errorMsg = `El número frontal (${this.documentNumberFront}) no coincide con el DNI del contrato (${clientDni}).`;
        return;
      }
      if (this.documentNumberBack && this.documentNumberBack !== clientDni) {
        this.errorMsg = `El número trasero (${this.documentNumberBack}) no coincide con el DNI del contrato (${clientDni}).`;
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
      this.documentNumberBack || undefined
    ).subscribe({
      next: (r) => {
        this.isUploadingDocuments = false;
        if (r.status === 0) {
          this.closeDocuments();
          this.toast('Documentos guardados exitosamente.');
          this.loadAssigned();
        } else {
          this.errorMsg = r.message || 'Error al guardar documentos.';
        }
      },
      error: () => {
        this.isUploadingDocuments = false;
        this.errorMsg = 'Error de red al subir documentos.';
      },
    });
  }

  statusBadge(status: string): string {
    return status === 'signed'
      ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300'
      : 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-300';
  }
}
