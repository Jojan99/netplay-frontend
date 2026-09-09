import { DialogService } from '../../services/dialog.service';
import { Component, EventEmitter, OnInit, Output, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import { InvoiceTemplate, InvoiceTemplateConfig, InvoiceTemplateService } from '../../services/invoice-template.service';
import { environment } from '../../../environments/environment';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';

@Component({
  selector: 'app-invoice-template-editor',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './invoice-template-editor.component.html',
})
export class InvoiceTemplateEditorComponent implements OnInit {
  private dialog = inject(DialogService);
  @Output() templateChanged = new EventEmitter<InvoiceTemplate | null>();

  templates: InvoiceTemplate[] = [];
  loading = false;
  saving = false;
  previewLoading = false;
  error = '';
  success = '';

  // Form
  editing: InvoiceTemplate | null = null;
  form: Partial<InvoiceTemplate> | null = null;
  autoPreview = true;
  private previewTimer: any = null;

  // Preview
  previewHtml = '';
  showPreview = false;

  readonly types: { id: InvoiceTemplate['type']; label: string; hint: string }[] = [
    { id: 'classic', label: 'Clásica',     hint: 'Carta formal con membrete y tabla de detalle.' },
    { id: 'modern',  label: 'Moderna',     hint: 'Banda de color y total destacado.' },
    { id: 'minimal', label: 'Minimalista', hint: 'Mucho aire y líneas finas.' },
    { id: 'receipt', label: 'Tirilla',     hint: 'Angosta, para impresora térmica.' },
  ];

  /** Casillas de "qué se muestra", con su explicación. */
  readonly visibleOptions: { key: keyof InvoiceTemplateConfig; label: string; hint: string }[] = [
    { key: 'show_logo',          label: 'Logo de la empresa',   hint: 'Se toma el que subiste en los datos de facturación.' },
    { key: 'show_activity',      label: 'Actividad económica',  hint: 'Código CIIU en el membrete.' },
    { key: 'show_iva_condition', label: 'Régimen de IVA',       hint: 'Condición tributaria de la empresa.' },
    { key: 'show_payment_info',  label: 'Medios de pago',       hint: 'Cuentas y billeteras donde te pueden pagar.' },
    { key: 'show_balance',       label: 'Saldo anterior',       hint: 'Suma las facturas pendientes de meses previos.' },
    { key: 'show_footer',        label: 'Mensaje final',        hint: 'La frase de cierre al pie de la factura.' },
  ];

  readonly colorPresets  = ['#1e3a5f', '#0f172a', '#1d4ed8', '#0f766e', '#7c2d12', '#4c1d95', '#111827', '#b91c1c'];
  readonly accentPresets = ['#0d9488', '#10b981', '#2563eb', '#f59e0b', '#e11d48', '#8b5cf6'];

  constructor(
    private templateService: InvoiceTemplateService,
    private http: HttpClient,
    private sanitizer: DomSanitizer,
  ) {}

  ngOnInit(): void {
    this.loadTemplates();
  }

  private defaultForm(): Partial<InvoiceTemplate> {
    return {
      name: '',
      type: 'classic',
      is_default: false,
      config: {
        primary_color: '#2563eb',
        accent_color: '#10b981',
        show_logo: true,
        show_activity: true,
        show_iva_condition: true,
        show_payment_info: true,
        show_footer: true,
        show_balance: true,
        font_family: 'Arial',
        layout: 'default',
      }
    };
  }

  loadTemplates(): void {
    this.loading = true;
    this.templateService.getAll().subscribe({
      next: (res) => {
        this.templates = res.data ?? [];
        this.loading = false;
      },
      error: () => {
        this.loading = false;
        this.error = 'Error al cargar plantillas';
      }
    });
  }

  startCreate(): void {
    this.editing = null;
    this.form = this.defaultForm();
    this.previewHtml = '';
    this.schedulePreview();
  }

  startEdit(t: InvoiceTemplate): void {
    this.editing = t;
    this.form = {
      id: t.id,
      name: t.name,
      type: t.type,
      is_default: t.is_default,
      config: { ...this.defaultForm().config, ...(t.config ?? {}) }
    };
    this.previewHtml = '';
    this.schedulePreview();
  }

  cancelEdit(): void {
    this.editing = null;
    this.form = null;
    this.previewHtml = '';
    clearTimeout(this.previewTimer);
  }

  save(): void {
    if (!this.form?.name?.trim()) {
      this.error = 'El nombre es obligatorio';
      return;
    }
    this.saving = true;
    this.error = '';
    this.success = '';

    const payload = {
      name: this.form.name.trim(),
      type: this.form.type,
      is_default: this.form.is_default,
      config: this.form.config,
    };

    const req = this.editing
      ? this.templateService.update(this.editing.id!, payload)
      : this.templateService.create(payload);

    req.subscribe({
      next: (res) => {
        this.saving = false;
        this.success = this.editing ? 'Plantilla actualizada' : 'Plantilla creada';
        this.loadTemplates();
        if (!this.editing && res.data) {
          this.startEdit(res.data);
        }
        this.templateChanged.emit(res.data);
        setTimeout(() => this.success = '', 3000);
      },
      error: (err) => {
        this.saving = false;
        this.error = err?.error?.message || 'Error al guardar';
      }
    });
  }

  async deleteTemplate(t: InvoiceTemplate, event: Event) {
    event.stopPropagation();
    if (!await this.dialog.confirm(`¿Eliminar "${t.name}"?`)) return;
    this.templateService.delete(t.id!).subscribe({
      next: () => {
        this.templates = this.templates.filter(x => x.id !== t.id);
        if (this.editing?.id === t.id) {
          this.cancelEdit();
        }
        this.templateChanged.emit(null);
      },
      error: () => {
        this.error = 'Error al eliminar';
      }
    });
  }

  setDefault(t: InvoiceTemplate, event: Event): void {
    event.stopPropagation();
    this.templateService.setDefault(t.id!).subscribe({
      next: () => {
        this.templates.forEach(x => x.is_default = (x.id === t.id));
        this.success = 'Plantilla por defecto actualizada';
        this.templateChanged.emit(t);
        setTimeout(() => this.success = '', 3000);
      },
      error: () => {
        this.error = 'Error al actualizar';
      }
    });
  }

  /** Redibuja la vista previa poco después del último cambio, sin pedir un clic. */
  schedulePreview(): void {
    if (!this.autoPreview || !this.form) return;
    clearTimeout(this.previewTimer);
    this.previewTimer = setTimeout(() => this.loadPreview(), 400);
  }

  pickType(type: InvoiceTemplate['type']): void {
    if (!this.form) return;
    this.form.type = type;
    this.schedulePreview();
  }

  loadPreview(): void {
    if (!this.form) return;
    this.previewLoading = true;
    this.showPreview = true;
    this.templateService.preview(this.form.type!, this.form.config as InvoiceTemplateConfig).subscribe({
      next: (res) => {
        this.previewHtml = res.data?.html ?? '';
        this.previewLoading = false;
      },
      error: () => {
        this.previewLoading = false;
        this.previewHtml = '<p style="color:red">Error generando preview</p>';
      }
    });
  }

  updateConfig(key: keyof InvoiceTemplateConfig, value: any): void {
    if (!this.form) return;
    this.form.config = { ...this.form.config, [key]: value };
    this.schedulePreview();
  }

  get cfg(): InvoiceTemplateConfig {
    return this.form?.config || {};
  }

  /** El HTML lo genera nuestro propio backend; se marca seguro para el iframe. */
  get safePreview(): SafeHtml {
    return this.sanitizer.bypassSecurityTrustHtml(this.previewHtml);
  }

  getTypeLabel(type: string): string {
    return this.types.find(t => t.id === type)?.label || type;
  }
}
