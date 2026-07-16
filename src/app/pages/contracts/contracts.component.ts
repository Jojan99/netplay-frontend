import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ContractService } from '../../services/contract.service';
import { UserService } from '../../services/user.service';
import { DomSanitizer, SafeResourceUrl, SafeHtml } from '@angular/platform-browser';

interface Contract {
  id: number;
  title: string;
  content: string;
  logo?: string;
  pdf_path?: string;
  pdf_url?: string;
  active: boolean;
  created_at: string;
}

interface ClientContract {
  id: number;
  status: 'pending' | 'signed';
  token: string;
  signed_at: string | null;
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
  templateForm               = { id: 0, title: '', content: '', active: true };
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

  // ── Logo Upload ───────────────────────────────────────────────────────────
  logoFile: File | null      = null;
  logoPreview: string | null = null;
  isUploadingLogo            = false;

  // ── Preview HTML ──────────────────────────────────────────────────────────
  showPreview                = false;

  // ── Variables rápidas ─────────────────────────────────────────────────────
  quickVars = [
    { label: 'Nombre',         code: '{{nombre}}' },
    { label: 'Apellido',       code: '{{apellido}}' },
    { label: 'Nombre completo',code: '{{nombre_completo}}' },
    { label: 'DNI',            code: '{{dni}}' },
    { label: 'Teléfono',       code: '{{telefono}}' },
    { label: 'Email',          code: '{{email}}' },
    { label: 'Dirección',      code: '{{direccion}}' },
    { label: 'Fecha',          code: '{{fecha}}' },
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

  constructor(
    private contractService: ContractService,
    private userService: UserService,
    private sanitizer: DomSanitizer,
  ) {}

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
    this.templateForm  = { id: 0, title: '', content: '', active: true };
    this.logoFile      = null;
    this.logoPreview   = null;
    this.pdfFile       = null;
    this.pdfGuideUrl   = null;
    this.showPreview   = false;
    this.errorMsg      = '';
    this.showTemplateModal = true;
  }

  openEdit(c: Contract): void {
    this.isEditing    = true;
    this.templateForm = { id: c.id, title: c.title, content: c.content, active: c.active };
    this.logoPreview  = c.logo ?? null;
    this.hasPdfBase   = !!c.pdf_path;
    this.pdfGuideUrl  = null;
    this.pdfFile      = null;
    this.pdfBaseFile  = null;
    this.errorMsg     = '';
    this.showTemplateModal = true;
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
    this.contractService.assign(this.selectedContractId, this.selectedClient.id).subscribe({
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
    this.phoneInput    = cc.user.phone  ?? '';
    this.emailInput    = cc.user.email  ?? '';
  }

  closeSend(): void { this.showSendModal = null; }

  sendWhatsApp(): void {
    if (!this.showSendModal || !this.phoneInput) return;
    this.isSendingWa = true;
    this.contractService.sendByWhatsApp(this.showSendModal.id, this.phoneInput).subscribe({
      next: () => {
        this.isSendingWa   = false;
        this.showSendModal = null;
        this.toast('Mensaje enviado por WhatsApp.');
      },
      error: () => { this.isSendingWa = false; },
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
          this.toast('PDF base guardado. El PDF descargado será una copia exacta del original con la firma agregada.');
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

  statusBadge(status: string): string {
    return status === 'signed'
      ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300'
      : 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-300';
  }
}
