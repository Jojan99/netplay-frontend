import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MetaWhatsappService } from '../../../services/meta-whatsapp.service';

interface TemplateComponent {
  type: 'HEADER' | 'BODY' | 'FOOTER' | 'BUTTONS';
  format?: 'TEXT' | 'IMAGE' | 'VIDEO' | 'DOCUMENT';
  text?: string;
  example?: any;
  buttons?: { type: string; text: string; url?: string; phone_number?: string }[];
}

@Component({
  selector: 'app-wa-meta-templates',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="max-w-7xl mx-auto mt-8 p-6">
      <div class="flex items-center justify-between mb-6">
        <h1 class="text-2xl font-bold text-gray-900 dark:text-white">Plantillas (Templates)</h1>
        <button (click)="openModal()" class="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition">
          + Crear Plantilla
        </button>
      </div>

      <div *ngIf="invoiceTemplate" class="mb-5 p-4 rounded-lg border border-teal-200 bg-teal-50 dark:bg-teal-950/30 dark:border-teal-800 flex flex-col sm:flex-row gap-3 sm:items-center sm:justify-between">
        <div><p class="font-bold text-slate-800 dark:text-white">Plantilla base de facturación: envio_factura</p><p class="text-sm text-slate-600 dark:text-slate-300">Usa nombre, factura, valor, emisión, vencimiento y empresa. Estado local: {{ invoiceTemplate.status }}.</p></div>
        <button *ngIf="invoiceTemplate.status === 'LOCAL'" (click)="publishInvoiceTemplate()" [disabled]="publishingInvoiceTemplate" class="px-4 py-2 bg-teal-700 text-white rounded-lg disabled:opacity-50">{{ publishingInvoiceTemplate ? 'Publicando...' : 'Publicar en Meta' }}</button>
        <span *ngIf="invoiceTemplate.status === 'PENDING'" class="px-3 py-2 text-sm font-bold rounded-lg bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300">En revisión de Meta</span>
        <span *ngIf="invoiceTemplate.status === 'APPROVED'" class="px-3 py-2 text-sm font-bold rounded-lg bg-emerald-600 text-white">Lista para facturación masiva</span>
      </div>

      <!-- Loading -->
      <div *ngIf="loading" class="animate-pulse space-y-4">
        <div *ngFor="let i of [1,2,3]" class="h-16 bg-gray-200 dark:bg-gray-700 rounded-lg"></div>
      </div>

      <!-- List -->
      <div *ngIf="!loading" class="space-y-3">
        <div *ngFor="let t of templates" class="bg-white dark:bg-gray-800 rounded-lg shadow p-4 border border-gray-200 dark:border-gray-700 flex items-center justify-between">
          <div class="flex-1">
            <div class="flex items-center gap-3">
              <p class="font-medium text-gray-900 dark:text-white">{{ t.name }}</p>
              <span class="px-2 py-0.5 text-xs rounded-full" [ngClass]="getStatusClass(t.status)">{{ t.status }}</span>
              <span class="px-2 py-0.5 text-xs rounded-full bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-400">{{ t.category }}</span>
            </div>
            <p class="text-sm text-gray-500 mt-1">{{ t.language }} &mdash; {{ t.components?.length || 0 }} componentes</p>
            <p *ngIf="t.rejection_reason" class="text-sm text-red-500 mt-1">Raz&oacute;n rechazo: {{ t.rejection_reason }}</p>
          </div>
          <button (click)="previewTemplate(t)" class="px-3 py-1.5 text-sm text-blue-600 hover:bg-blue-50 rounded-lg mr-2">Ver preview</button>
          <button (click)="deleteTemplate(t.name)" class="px-3 py-1.5 text-sm text-red-600 hover:bg-red-50 rounded-lg">Eliminar</button>
        </div>
        <div *ngIf="templates.length === 0" class="text-center text-gray-500 py-8">No hay plantillas creadas.</div>
      </div>
    </div>

    <!-- Modal Crear/Preview -->
    <div *ngIf="showModal" class="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div class="bg-white dark:bg-gray-800 rounded-xl shadow-xl w-full max-w-5xl max-h-[90vh] overflow-y-auto">
        <div class="sticky top-0 bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 p-4 flex items-center justify-between">
          <h2 class="text-xl font-bold text-gray-900 dark:text-white">{{ isPreviewMode ? 'Vista previa' : 'Crear Plantilla' }}</h2>
          <button (click)="closeModal()" class="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 text-2xl">&times;</button>
        </div>

        <div class="p-6 grid grid-cols-1 lg:grid-cols-2 gap-6">
          <!-- Editor -->
          <div *ngIf="!isPreviewMode" class="space-y-4">
            <div>
              <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Nombre</label>
              <input type="text" [(ngModel)]="newTemplate.name" placeholder="bienvenida_cliente" class="w-full p-2.5 border rounded-lg dark:bg-gray-700 dark:border-gray-600 text-sm" />
              <p class="text-xs text-gray-500 mt-1">Solo letras min&uacute;sculas, n&uacute;meros y guiones bajos.</p>
            </div>

            <div class="grid grid-cols-2 gap-4">
              <div>
                <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Categor&iacute;a</label>
                <select [(ngModel)]="newTemplate.category" class="w-full p-2.5 border rounded-lg dark:bg-gray-700 dark:border-gray-600 text-sm">
                  <option value="UTILITY">UTILIDAD</option>
                  <option value="MARKETING">MARKETING</option>
                  <option value="AUTHENTICATION">AUTENTICACI&Oacute;N</option>
                </select>
              </div>
              <div>
                <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Idioma</label>
                <select [(ngModel)]="newTemplate.language" class="w-full p-2.5 border rounded-lg dark:bg-gray-700 dark:border-gray-600 text-sm">
                  <option value="es">es_ES</option>
                  <option value="es_CO">es_CO</option>
                  <option value="en">en_US</option>
                  <option value="pt_BR">pt_BR</option>
                </select>
              </div>
            </div>

            <div>
              <div class="flex items-center justify-between mb-2">
                <label class="block text-sm font-medium text-gray-700 dark:text-gray-300">Componentes</label>
                <div class="flex gap-2">
                  <button (click)="addComponent('HEADER')" class="px-2 py-1 text-xs bg-gray-100 dark:bg-gray-700 rounded hover:bg-gray-200">+ Header</button>
                  <button (click)="addComponent('BODY')" class="px-2 py-1 text-xs bg-gray-100 dark:bg-gray-700 rounded hover:bg-gray-200">+ Body</button>
                  <button (click)="addComponent('FOOTER')" class="px-2 py-1 text-xs bg-gray-100 dark:bg-gray-700 rounded hover:bg-gray-200">+ Footer</button>
                  <button (click)="addComponent('BUTTONS')" class="px-2 py-1 text-xs bg-gray-100 dark:bg-gray-700 rounded hover:bg-gray-200">+ Botones</button>
                </div>
              </div>

              <div *ngFor="let comp of newTemplate.components; let i = index" class="border border-gray-200 dark:border-gray-600 rounded-lg p-3 mb-3">
                <div class="flex items-center justify-between mb-2">
                  <span class="text-xs font-bold uppercase text-gray-500">{{ comp.type }}</span>
                  <button (click)="removeComponent(i)" class="text-red-500 text-xs hover:underline">Eliminar</button>
                </div>

                <div *ngIf="comp.type === 'HEADER'" class="space-y-2">
                  <select [(ngModel)]="comp.format" class="w-full p-2 text-sm border rounded dark:bg-gray-700 dark:border-gray-600">
                    <option value="TEXT">Texto</option>
                    <option value="IMAGE">Imagen</option>
                    <option value="VIDEO">Video</option>
                    <option value="DOCUMENT">Documento</option>
                  </select>
                  <div *ngIf="comp.format === 'TEXT'">
                    <textarea [(ngModel)]="comp.text" rows="2" placeholder="Texto del header..." class="w-full p-2 text-sm border rounded dark:bg-gray-700 dark:border-gray-600"></textarea>
                    <p class="text-xs text-gray-500 mt-1">Variables: &lbrace;&lbrace;1&rbrace;&rbrace;, &lbrace;&lbrace;2&rbrace;&rbrace;...</p>
                  </div>
                  <div *ngIf="comp.format !== 'TEXT'">
                    <input type="text" [ngModel]="comp.example?.header_handle?.[0]" (ngModelChange)="setHeaderHandle(comp, $event)" placeholder="URL o handle del media..." class="w-full p-2 text-sm border rounded dark:bg-gray-700 dark:border-gray-600" />
                  </div>
                </div>

                <div *ngIf="comp.type === 'BODY'" class="space-y-2">
                  <textarea [(ngModel)]="comp.text" rows="4" placeholder="Escribe el cuerpo del mensaje..." class="w-full p-2 text-sm border rounded dark:bg-gray-700 dark:border-gray-600"></textarea>
                  <p class="text-xs text-gray-500">Variables: &lbrace;&lbrace;1&rbrace;&rbrace;, &lbrace;&lbrace;2&rbrace;&rbrace;... Usa el bot&oacute;n para insertar variables.</p>
                  <div class="flex gap-2">
                    <button (click)="addVariable()" class="px-2 py-1 text-xs bg-blue-50 text-blue-600 rounded hover:bg-blue-100">+ Insertar variable {{ nextVarIndex }}</button>
                  </div>
                  <div *ngIf="variableExamples.length > 0" class="mt-2 p-2 bg-gray-50 dark:bg-gray-700 rounded">
                    <p class="text-xs font-medium text-gray-600 dark:text-gray-300 mb-1">Valores de prueba:</p>
                    <div *ngFor="let v of variableExamples; let vi = index" class="flex items-center gap-2 mb-1">
                      <span class="text-xs text-gray-500">Var {{ vi + 1 }}:</span>
                      <input type="text" [(ngModel)]="variableExamples[vi]" class="flex-1 p-1 text-sm border rounded dark:bg-gray-600 dark:border-gray-500" />
                    </div>
                  </div>
                </div>

                <div *ngIf="comp.type === 'FOOTER'" class="space-y-2">
                  <textarea [(ngModel)]="comp.text" rows="2" placeholder="Texto del footer..." class="w-full p-2 text-sm border rounded dark:bg-gray-700 dark:border-gray-600"></textarea>
                  <p class="text-xs text-gray-500">M&aacute;ximo 60 caracteres recomendado.</p>
                </div>

                <div *ngIf="comp.type === 'BUTTONS'" class="space-y-2">
                  <div *ngFor="let btn of comp.buttons; let bi = index" class="flex items-center gap-2">
                    <select [(ngModel)]="btn.type" class="p-1 text-sm border rounded dark:bg-gray-700 dark:border-gray-600">
                      <option value="QUICK_REPLY">Respuesta r&aacute;pida</option>
                      <option value="URL">URL</option>
                      <option value="PHONE_NUMBER">Tel&eacute;fono</option>
                    </select>
                    <input type="text" [(ngModel)]="btn.text" placeholder="Texto del bot&oacute;n" class="flex-1 p-1 text-sm border rounded dark:bg-gray-700 dark:border-gray-600" />
                    <input *ngIf="btn.type === 'URL'" type="text" [(ngModel)]="btn.url" placeholder="https://..." class="flex-1 p-1 text-sm border rounded dark:bg-gray-700 dark:border-gray-600" />
                    <input *ngIf="btn.type === 'PHONE_NUMBER'" type="text" [(ngModel)]="btn.phone_number" placeholder="+57300..." class="flex-1 p-1 text-sm border rounded dark:bg-gray-700 dark:border-gray-600" />
                    <button (click)="removeButton(comp, bi)" class="text-red-500 text-xs">&times;</button>
                  </div>
                  <button (click)="addButton(comp)" class="px-2 py-1 text-xs bg-gray-100 dark:bg-gray-700 rounded hover:bg-gray-200">+ Agregar bot&oacute;n</button>
                </div>
              </div>
            </div>

            <div class="flex items-center gap-3 pt-4 border-t border-gray-200 dark:border-gray-700">
              <button (click)="submitTemplate()" [disabled]="submitting" class="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50">
                {{ submitting ? 'Enviando a Meta...' : 'Crear y enviar a Meta' }}
              </button>
              <button (click)="updatePreview()" class="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 dark:bg-gray-700 dark:text-gray-300">
                Actualizar preview
              </button>
            </div>

            <div *ngIf="submitResult" class="p-3 rounded-lg" [ngClass]="submitResult.ok ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'">
              {{ submitResult.message }}
            </div>
          </div>

          <!-- Preview -->
          <div class="bg-[#e5ddd5] dark:bg-[#0b141a] rounded-xl p-4 flex flex-col items-center">
            <p class="text-xs text-gray-500 dark:text-gray-400 mb-3 uppercase tracking-wide font-semibold">Vista previa WhatsApp</p>

            <div class="w-full max-w-sm bg-white dark:bg-[#202c33] rounded-lg shadow-sm p-3 space-y-2">
              <!-- Header -->
              <div *ngFor="let comp of previewComponents">
                <div *ngIf="comp.type === 'HEADER' && comp.format === 'TEXT'" class="text-sm font-semibold text-gray-900 dark:text-gray-100 border-b border-gray-100 dark:border-gray-700 pb-2">
                  {{ replaceVars(comp.text) }}
                </div>
                <div *ngIf="comp.type === 'HEADER' && comp.format === 'IMAGE'" class="rounded-lg overflow-hidden bg-gray-100 dark:bg-gray-700">
                  <div class="h-32 flex items-center justify-center text-gray-400 text-sm">[Imagen]</div>
                </div>
                <div *ngIf="comp.type === 'HEADER' && comp.format === 'VIDEO'" class="rounded-lg overflow-hidden bg-gray-100 dark:bg-gray-700">
                  <div class="h-32 flex items-center justify-center text-gray-400 text-sm">[Video]</div>
                </div>

                <!-- Body -->
                <div *ngIf="comp.type === 'BODY'" class="text-sm text-gray-800 dark:text-gray-200 whitespace-pre-line leading-relaxed">
                  {{ replaceVars(comp.text) }}
                </div>

                <!-- Footer -->
                <div *ngIf="comp.type === 'FOOTER'" class="text-xs text-gray-500 dark:text-gray-400 pt-1 border-t border-gray-100 dark:border-gray-700">
                  {{ comp.text }}
                </div>

                <!-- Buttons -->
                <div *ngIf="comp.type === 'BUTTONS'" class="space-y-1 pt-2">
                  <div *ngFor="let btn of comp.buttons" class="text-center text-sm text-blue-600 dark:text-blue-400 border-t border-gray-100 dark:border-gray-700 pt-2 font-medium">
                    <span *ngIf="btn.type === 'QUICK_REPLY'">{{ btn.text }}</span>
                    <span *ngIf="btn.type === 'URL'">{{ btn.text }} &#8599;</span>
                    <span *ngIf="btn.type === 'PHONE_NUMBER'">{{ btn.text }} &#9742;</span>
                  </div>
                </div>
              </div>
            </div>

            <p class="text-xs text-gray-400 mt-4 text-center">Este es un aproximado visual.<br>Meta puede ajustar el dise&ntilde;o final.</p>
          </div>
        </div>
      </div>
    </div>
  `
})
export class WaMetaTemplatesComponent implements OnInit {
  loading = true;
  templates: any[] = [];
  showModal = false;
  isPreviewMode = false;
  submitting = false;
  submitResult: any = null;
  publishingInvoiceTemplate = false;
  invoiceTemplate: any = null;

  newTemplate: any = {
    name: '',
    category: 'UTILITY',
    language: 'es',
    components: []
  };

  variableExamples: string[] = [];
  previewComponents: TemplateComponent[] = [];

  constructor(private meta: MetaWhatsappService) {}

  ngOnInit(): void {
    this.loadTemplates();
  }

  loadTemplates(): void {
    this.loading = true;
    this.meta.getTemplates().subscribe({
      next: (r: any) => {
        this.templates = r.data || [];
        this.invoiceTemplate = this.templates.find((template: any) => template.name === 'envio_factura' && template.language === 'es_CO')
          ?? { ...this.defaultInvoiceTemplate(), status: 'LOCAL' };
        this.loading = false;
      },
      error: () => { this.loading = false; }
    });
  }

  publishInvoiceTemplate(): void {
    this.publishingInvoiceTemplate = true;
    this.meta.createTemplate(this.defaultInvoiceTemplate()).subscribe({
      next: () => { this.publishingInvoiceTemplate = false; this.loadTemplates(); },
      error: () => { this.publishingInvoiceTemplate = false; }
    });
  }

  private defaultInvoiceTemplate(): any {
    return {
      name: 'envio_factura', parameter_format: 'POSITIONAL', category: 'UTILITY', language: 'es_CO',
      components: [
        { type: 'BODY', text: '¡Hola, {{1}}!\nUn gusto saludarte de parte de *{{6}}*.\n\nTu factura ya está disponible:\n\nFactura: {{2}}\nValor: ${{3}}\nFecha de emisión: {{4}}\nFecha de vencimiento: {{5}}\n\nConsulta tu factura o reporta tu pago usando los botones a continuación.', example: { body_text: [['PEDRO PEREZ', 'NT19991', '55.000', '2026-10-20', '2026-10-25', 'Netplay']] } },
        { type: 'BUTTONS', buttons: [{ type: 'QUICK_REPLY', text: 'Consultar factura' }, { type: 'QUICK_REPLY', text: 'Reportar pago' }] }
      ]
    };
  }

  getStatusClass(status: string): string {
    switch (status) {
      case 'APPROVED': return 'bg-green-100 text-green-700';
      case 'PENDING': return 'bg-yellow-100 text-yellow-700';
      case 'REJECTED': return 'bg-red-100 text-red-700';
      default: return 'bg-gray-100 text-gray-700';
    }
  }

  openModal(): void {
    this.showModal = true;
    this.isPreviewMode = false;
    this.submitResult = null;
    this.newTemplate = {
      name: '',
      category: 'UTILITY',
      language: 'es',
      components: [
        { type: 'BODY', text: '' }
      ]
    };
    this.variableExamples = [];
    this.previewComponents = [...this.newTemplate.components];
  }

  closeModal(): void {
    this.showModal = false;
    this.isPreviewMode = false;
  }

  previewTemplate(t: any): void {
    this.showModal = true;
    this.isPreviewMode = true;
    this.previewComponents = t.components || [];
  }

  addComponent(type: 'HEADER' | 'BODY' | 'FOOTER' | 'BUTTONS'): void {
    const comp: any = { type };
    if (type === 'HEADER') comp.format = 'TEXT';
    if (type === 'BODY') comp.text = '';
    if (type === 'FOOTER') comp.text = '';
    if (type === 'BUTTONS') comp.buttons = [];
    this.newTemplate.components.push(comp);
    this.updatePreview();
  }

  removeComponent(index: number): void {
    this.newTemplate.components.splice(index, 1);
    this.updatePreview();
  }

  addButton(comp: any): void {
    if (!comp.buttons) comp.buttons = [];
    comp.buttons.push({ type: 'QUICK_REPLY', text: '' });
    this.updatePreview();
  }

  removeButton(comp: any, index: number): void {
    comp.buttons.splice(index, 1);
    this.updatePreview();
  }

  setHeaderHandle(comp: any, value: string): void {
    if (!comp.example) comp.example = {};
    comp.example.header_handle = [value];
  }

  get nextVarIndex(): number {
    return this.variableExamples.length + 1;
  }

  addVariable(): void {
    this.variableExamples.push('');
    // Also append to the body text
    const bodyComp = this.newTemplate.components.find((c: any) => c.type === 'BODY');
    if (bodyComp) {
      const idx = this.variableExamples.length;
      bodyComp.text = (bodyComp.text || '') + '{{' + idx + '}}';
    }
  }

  replaceVars(text: string = ''): string {
    if (!text) return '';
    let result = text;
    this.variableExamples.forEach((val, idx) => {
      result = result.replace(new RegExp('\\{\\{' + (idx + 1) + '\\}\\}', 'g'), val || ('{{' + (idx + 1) + '}}'));
    });
    return result;
  }

  updatePreview(): void {
    this.previewComponents = JSON.parse(JSON.stringify(this.newTemplate.components));
  }

  buildPayload(): any {
    const components = this.newTemplate.components.map((comp: any) => {
      const c: any = { type: comp.type };

      if (comp.type === 'HEADER') {
        c.format = comp.format;
        if (comp.format === 'TEXT') {
          c.text = comp.text;
          const varMatches = (comp.text || '').match(/\{\{(\d+)\}\}/g);
          if (varMatches) {
            c.example = { header_text: [this.variableExamples[0] || 'Ejemplo'] };
          }
        } else {
          c.example = { header_handle: [comp.example?.header_handle?.[0] || ''] };
        }
      }

      if (comp.type === 'BODY') {
        c.text = comp.text;
        const varMatches = (comp.text || '').match(/\{\{(\d+)\}\}/g);
        if (varMatches) {
          const nums: number[] = varMatches.map((m: string) => parseInt(m.replace(/[{}]/g, '')));
          const unique: number[] = Array.from(new Set(nums)).sort((a, b) => a - b);
          c.example = {
            body_text: [unique.map((idx: number) => this.variableExamples[idx - 1] || ('Valor ' + idx))]
          };
        }
      }

      if (comp.type === 'FOOTER') {
        c.text = comp.text;
      }

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
      name: this.newTemplate.name.toLowerCase().replace(/\s+/g, '_'),
      category: this.newTemplate.category,
      language: this.newTemplate.language,
      components
    };
  }

  submitTemplate(): void {
    this.submitting = true;
    this.submitResult = null;
    const payload = this.buildPayload();

    this.meta.createTemplate(payload).subscribe({
      next: (r: any) => {
        this.submitting = false;
        this.submitResult = { ok: true, message: 'Plantilla enviada a Meta correctamente. Estado: ' + (r.data?.status || 'PENDING') };
        this.loadTemplates();
        setTimeout(() => this.closeModal(), 2000);
      },
      error: (e: any) => {
        this.submitting = false;
        this.submitResult = { ok: false, message: e.error?.error || e.error?.message || 'Error al crear plantilla' };
      }
    });
  }

  deleteTemplate(name: string): void {
    if (!confirm('¿Eliminar plantilla "' + name + '"?')) return;
    this.meta.deleteTemplate(name).subscribe({
      next: () => this.loadTemplates(),
      error: () => alert('Error al eliminar plantilla')
    });
  }
}
