import { Component, EventEmitter, OnInit, Output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import { InvoiceTemplate, InvoiceTemplateConfig, InvoiceTemplateService } from '../../services/invoice-template.service';
import { environment } from '../../../environments/environment';

@Component({
  selector: 'app-invoice-template-editor',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './invoice-template-editor.component.html',
})
export class InvoiceTemplateEditorComponent implements OnInit {
  @Output() templateChanged = new EventEmitter<InvoiceTemplate | null>();

  templates: InvoiceTemplate[] = [];
  loading = false;
  saving = false;
  previewLoading = false;
  error = '';
  success = '';

  // Form
  editing: InvoiceTemplate | null = null;
  form: Partial<InvoiceTemplate> = this.defaultForm();

  // Preview
  previewHtml = '';
  showPreview = false;

  readonly types: { id: InvoiceTemplate['type']; label: string; icon: string }[] = [
    { id: 'classic', label: 'Clásica', icon: 'M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z' },
    { id: 'modern', label: 'Moderna', icon: 'M4 5a1 1 0 011-1h14a1 1 0 011 1v2a1 1 0 01-1 1H5a1 1 0 01-1-1V5zM4 13a1 1 0 011-1h6a1 1 0 011 1v6a1 1 0 01-1 1H5a1 1 0 01-1-1v-6zM16 13a1 1 0 011-1h2a1 1 0 011 1v6a1 1 0 01-1 1h-2a1 1 0 01-1-1v-6z' },
    { id: 'minimal', label: 'Minimalista', icon: 'M4 6h16M4 12h16M4 18h16' },
    { id: 'receipt', label: 'Ticket / POS', icon: 'M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z' },
  ];

  readonly colorPresets = ['#2563eb', '#0f172a', '#10b981', '#ef4444', '#f59e0b', '#8b5cf6', '#ec4899', '#000000'];

  constructor(
    private templateService: InvoiceTemplateService,
    private http: HttpClient
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
    this.showPreview = false;
    this.previewHtml = '';
  }

  startEdit(t: InvoiceTemplate): void {
    this.editing = t;
    this.form = {
      name: t.name,
      type: t.type,
      is_default: t.is_default,
      config: { ...this.defaultForm().config, ...(t.config ?? {}) }
    };
    this.showPreview = false;
    this.previewHtml = '';
  }

  cancelEdit(): void {
    this.editing = null;
    this.form = this.defaultForm();
    this.showPreview = false;
  }

  save(): void {
    if (!this.form.name?.trim()) {
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

  deleteTemplate(t: InvoiceTemplate, event: Event): void {
    event.stopPropagation();
    if (!confirm(`¿Eliminar "${t.name}"?`)) return;
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

  loadPreview(): void {
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
    this.form.config = { ...this.form.config, [key]: value };
  }

  get cfg(): InvoiceTemplateConfig {
    return this.form.config || {};
  }

  getTypeLabel(type: string): string {
    return this.types.find(t => t.id === type)?.label || type;
  }
}
