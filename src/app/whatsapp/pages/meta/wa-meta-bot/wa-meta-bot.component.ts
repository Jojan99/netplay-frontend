import { Component, HostListener, OnInit, ElementRef, ViewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import {
  CdkDrag,
  CdkDragDrop,
  CdkDropList,
  DragDropModule,
} from '@angular/cdk/drag-drop';
import { MetaWhatsappService } from '../../../services/meta-whatsapp.service';

type StepType =
  | 'message' | 'input' | 'api_call' | 'condition' | 'delay'
  | 'image' | 'document' | 'webhook' | 'ai' | 'transfer_agent' | 'end';

interface Param { key: string; value: string; }

interface BotStep {
  id: string;
  type: StepType;
  x: number;
  y: number;
  message?: string;
  variable_name?: string;
  input_type?: string;
  validation_message?: string;
  endpoint?: string;
  method?: 'GET' | 'POST' | 'PUT';
  params?: Param[];
  save_response_to?: string;
  error_message?: string;
  condition_variable?: string;
  condition_operator?: string;
  condition_value?: string;
  delay_seconds?: number;
  media_url?: string;
  media_caption?: string;
  ai_prompt?: string;
  agent_department?: string;
  next_step?: string;
  true_step?: string;
  false_step?: string;
  error_step?: string;
}

interface BotFlow {
  id: string;
  name: string;
  description?: string;
  is_active?: boolean;
  steps: BotStep[];
}

interface BotOption { id: string; label: string; description?: string; flow_id: string; }

interface BotConfig {
  enabled: boolean;
  trigger_word: string;
  welcome_message: string;
  menu_type: 'text' | 'buttons' | 'list';
  menu_title: string;
  options: BotOption[];
  flows: BotFlow[];
  variables: { name: string; type: string; default_value?: string }[];
  settings: {
    fallback_message: string;
    max_retries: number;
    session_timeout_minutes: number;
  };
}

interface NodeMeta {
  type: StepType;
  label: string;
  icon: string;
  color: string;
  description: string;
}

const NODE_META: Record<StepType, NodeMeta> = {
  message: { type: 'message', label: 'Mensaje', icon: '💬', color: '#10b981', description: 'Envía texto al cliente' },
  input: { type: 'input', label: 'Pedir dato', icon: '📝', color: '#3b82f6', description: 'Guarda una respuesta' },
  api_call: { type: 'api_call', label: 'Llamar API', icon: '⚡', color: '#8b5cf6', description: 'Consulta tu backend' },
  condition: { type: 'condition', label: 'Condición', icon: '🔀', color: '#f59e0b', description: 'Divide el flujo' },
  delay: { type: 'delay', label: 'Esperar', icon: '⏱', color: '#64748b', description: 'Pausa la conversación' },
  image: { type: 'image', label: 'Imagen', icon: '🖼', color: '#ec4899', description: 'Envía una imagen' },
  document: { type: 'document', label: 'Documento', icon: '📄', color: '#6366f1', description: 'Envía un archivo' },
  webhook: { type: 'webhook', label: 'Webhook', icon: '🔗', color: '#f97316', description: 'Notifica otra aplicación' },
  ai: { type: 'ai', label: 'IA / GPT', icon: '✦', color: '#a855f7', description: 'Responde con inteligencia artificial' },
  transfer_agent: { type: 'transfer_agent', label: 'Agente', icon: '👤', color: '#14b8a6', description: 'Transfiere a una persona' },
  end: { type: 'end', label: 'Finalizar', icon: '✓', color: '#334155', description: 'Termina el flujo' },
};

const PALETTE_TYPES: StepType[] = [
  'message', 'input', 'api_call', 'condition', 'delay', 'image',
  'document', 'webhook', 'ai', 'transfer_agent', 'end',
];

function id(prefix: string): string {
  return `${prefix}_${Math.random().toString(36).slice(2, 9)}`;
}

function newStep(type: StepType, x = 80, y = 80): BotStep {
  const step: BotStep = { id: id('step'), type, x, y };
  if (type === 'message') step.message = 'Escribe tu mensaje aquí';
  if (type === 'input') { step.message = '¿Cuál es tu cédula?'; step.variable_name = 'cedula'; step.input_type = 'number'; }
  if (type === 'api_call' || type === 'webhook') { step.method = 'GET'; step.endpoint = '/api/endpoint'; step.params = []; }
  if (type === 'condition') { step.condition_variable = ''; step.condition_operator = 'eq'; step.condition_value = ''; }
  if (type === 'delay') step.delay_seconds = 2;
  if (type === 'image' || type === 'document') step.media_url = '';
  if (type === 'ai') step.ai_prompt = 'Responde de forma amable y útil.';
  if (type === 'transfer_agent') step.agent_department = 'soporte';
  return step;
}

@Component({
  selector: 'app-wa-meta-bot',
  standalone: true,
  imports: [CommonModule, FormsModule, DragDropModule, CdkDrag, CdkDropList],
  template: `
    <div class="bot-builder">
      <header class="builder-header">
        <div>
          <div class="eyebrow">AUTOMATIZACIÓN · WHATSAPP</div>
          <h1>Constructor de bots</h1>
          <p>Diseña conversaciones visuales y conecta tus servicios sin código.</p>
        </div>
        <div class="header-actions">
          <span class="status" [class.active]="config.enabled"><i></i>{{ config.enabled ? 'Publicado' : 'Borrador' }}</span>
          <button class="button ghost" (click)="config.enabled = !config.enabled">{{ config.enabled ? 'Pausar bot' : 'Activar bot' }}</button>
          <button class="button primary" (click)="save()" [disabled]="saving">{{ saving ? 'Guardando...' : 'Guardar cambios' }}</button>
        </div>
      </header>

      <div *ngIf="result" class="notice" [class.error]="!result.ok">{{ result.message }}</div>

      <div *ngIf="loading" class="loading">Cargando constructor...</div>

      <main *ngIf="!loading" class="workspace">
        <aside class="flows-sidebar">
          <div class="side-heading"><span>Mis flujos</span><button (click)="addFlow()" title="Nuevo flujo">＋</button></div>
          <div class="flow-search">⌕ <input placeholder="Buscar flujo..." /></div>
          <div class="flow-list">
            <button *ngFor="let flow of config.flows" class="flow-item" [class.selected]="flow.id === selectedFlow.id" (click)="selectFlow(flow)">
              <span class="flow-icon">⌁</span><span class="flow-copy"><strong>{{ flow.name }}</strong><small>{{ flow.steps.length }} bloques</small></span><span class="flow-dot" [class.off]="flow.is_active === false"></span>
            </button>
          </div>
          <div class="side-bottom">
            <button class="side-link" (click)="openSettings()">⚙ Configuración general</button>
            <button class="side-link" (click)="exportConfig()">↥ Exportar configuración</button>
          </div>
        </aside>

        <section class="canvas-area">
          <div class="canvas-toolbar">
            <div class="flow-title"><input [(ngModel)]="selectedFlow.name" /><span>{{ selectedFlow.steps.length }} bloques</span></div>
            <div class="toolbar-actions"><button (click)="zoom = math.max(.7, zoom - .1)">−</button><span>{{ (zoom * 100) | number:'1.0-0' }}%</span><button (click)="zoom = math.min(1.3, zoom + .1)">＋</button><button (click)="centerCanvas()">◎ Centrar</button></div>
          </div>

          <div id="botCanvas" class="canvas" #canvas cdkDropList [cdkDropListData]="selectedFlow.steps" [cdkDropListConnectedTo]="['botPalette']" [cdkDropListSortingDisabled]="true" (cdkDropListDropped)="dropNode($event)" [style.--zoom]="zoom">
            <div class="canvas-grid"></div>
            <svg class="connections" [attr.viewBox]="'0 0 1400 820'" preserveAspectRatio="none">
              <ng-container *ngFor="let step of selectedFlow.steps">
                <ng-container *ngIf="nextNode(step) as target">
                  <path [attr.d]="connectionPath(step, target)" fill="none" stroke="#a9b4c5" stroke-width="2" stroke-dasharray="5 4"></path>
                  <circle [attr.cx]="target.x + 116" [attr.cy]="target.y" r="4" fill="#94a3b8"></circle>
                </ng-container>
              </ng-container>
            </svg>

            <div *ngIf="selectedFlow.steps.length === 0" class="empty-canvas"><div class="empty-icon">✦</div><h2>Empieza tu flujo</h2><p>Arrastra un bloque desde la izquierda hacia este lienzo.</p></div>

            <div *ngFor="let step of selectedFlow.steps; trackBy: trackStep" class="node" [class.selected]="step.id === selectedStep?.id" (click)="selectStep(step)">
              <div class="node-card" [style.--node-color]="NODE_META[step.type].color">
                <div class="node-head" (pointerdown)="startNodeDrag($event, step)"><span class="node-icon">{{ NODE_META[step.type].icon }}</span><strong>{{ NODE_META[step.type].label }}</strong><button (click)="$event.stopPropagation(); removeStep(step)">×</button></div>
                <div class="node-body"><span class="node-preview">{{ stepPreview(step) }}</span></div>
                <div class="node-port input-port"></div><div class="node-port output-port"></div>
                <div *ngIf="step.type === 'condition'" class="condition-ports"><span>sí</span><span>no</span></div>
              </div>
            </div>

            <div class="drop-hint">Arrastra bloques aquí para construir tu flujo</div>
          </div>
        </section>

        <aside class="inspector">
          <div class="inspector-tabs"><button [class.active]="inspectorTab === 'node'" (click)="inspectorTab = 'node'">Bloque</button><button [class.active]="inspectorTab === 'flow'" (click)="inspectorTab = 'flow'">Flujo</button><button [class.active]="inspectorTab === 'menu'" (click)="inspectorTab = 'menu'">Menú</button></div>

          <div *ngIf="inspectorTab === 'node' && selectedStep" class="inspector-content">
            <div class="selected-label" [style.color]="NODE_META[selectedStep.type].color"><span>{{ NODE_META[selectedStep.type].icon }}</span>{{ NODE_META[selectedStep.type].label }}<button (click)="removeStep(selectedStep)">Eliminar</button></div>
            <p class="field-help">{{ NODE_META[selectedStep.type].description }}</p>

            <ng-container [ngSwitch]="selectedStep.type">
              <div *ngSwitchCase="'message'" class="field"><label>Mensaje</label><textarea [(ngModel)]="selectedStep.message" rows="5" placeholder="Escribe el mensaje..."></textarea><small>Usa variables como {{ '{{cedula}}' }} o {{ '{{nombre}}' }}</small></div>
              <div *ngSwitchCase="'input'" class="field"><label>Pregunta</label><textarea [(ngModel)]="selectedStep.message" rows="3"></textarea><label>Guardar respuesta en</label><input [(ngModel)]="selectedStep.variable_name" placeholder="ej: cedula" /><label>Tipo de respuesta</label><select [(ngModel)]="selectedStep.input_type"><option value="text">Texto</option><option value="number">Número</option><option value="email">Email</option><option value="phone">Teléfono</option><option value="date">Fecha</option></select></div>
              <div *ngSwitchCase="'api_call'" class="field"><label>Endpoint</label><div class="endpoint"><select [(ngModel)]="selectedStep.method"><option>GET</option><option>POST</option><option>PUT</option></select><input [(ngModel)]="selectedStep.endpoint" placeholder="/api/client/invoices" /></div><label>Guardar respuesta en</label><input [(ngModel)]="selectedStep.save_response_to" placeholder="facturas" /><label>Parámetros</label><div *ngFor="let p of selectedStep.params; let i = index" class="param"><input [(ngModel)]="p.key" placeholder="clave" /><input [(ngModel)]="p.value" placeholder="{{ '{{variable}}' }}" /><button (click)="selectedStep.params?.splice(i, 1)">×</button></div><button class="add-link" (click)="addParam(selectedStep)">＋ Agregar parámetro</button></div>
              <div *ngSwitchCase="'webhook'" class="field"><label>URL del webhook</label><input [(ngModel)]="selectedStep.endpoint" placeholder="https://..." /><label>Método</label><select [(ngModel)]="selectedStep.method"><option>POST</option><option>GET</option></select><label>Guardar respuesta en</label><input [(ngModel)]="selectedStep.save_response_to" /></div>
              <div *ngSwitchCase="'condition'" class="field"><label>Variable</label><select [(ngModel)]="selectedStep.condition_variable"><option *ngFor="let v of allVariables" [value]="v">{{ v }}</option></select><label>Operador</label><select [(ngModel)]="selectedStep.condition_operator"><option value="eq">es igual a</option><option value="neq">es diferente de</option><option value="contains">contiene</option><option value="empty">está vacío</option></select><label>Valor</label><input [(ngModel)]="selectedStep.condition_value" placeholder="pendiente" /></div>
              <div *ngSwitchCase="'delay'" class="field"><label>Tiempo de espera</label><div class="inline-field"><input type="number" [(ngModel)]="selectedStep.delay_seconds" min="1" /><span>segundos</span></div></div>
              <div *ngSwitchCase="'image'" class="field"><label>URL de imagen</label><input [(ngModel)]="selectedStep.media_url" placeholder="https://..." /><label>Texto</label><input [(ngModel)]="selectedStep.media_caption" /></div>
              <div *ngSwitchCase="'document'" class="field"><label>URL del documento</label><input [(ngModel)]="selectedStep.media_url" placeholder="https://...pdf" /><label>Descripción</label><input [(ngModel)]="selectedStep.media_caption" /></div>
              <div *ngSwitchCase="'ai'" class="field"><label>Instrucción para la IA</label><textarea [(ngModel)]="selectedStep.ai_prompt" rows="5"></textarea><div class="ai-note">✦ Requiere una clave de OpenAI configurada en el backend.</div></div>
              <div *ngSwitchCase="'transfer_agent'" class="field"><label>Departamento</label><input [(ngModel)]="selectedStep.agent_department" placeholder="soporte" /><label>Mensaje interno</label><textarea [(ngModel)]="selectedStep.message" rows="3"></textarea></div>
              <div *ngSwitchCase="'end'" class="end-info">✓ Este bloque termina la conversación.</div>
            </ng-container>

            <div *ngIf="selectedStep.type !== 'end' && selectedStep.type !== 'condition'" class="field next-field"><label>Conectar con</label><select [(ngModel)]="selectedStep.next_step"><option [ngValue]="undefined">Fin del flujo</option><option *ngFor="let step of selectedFlow.steps" [ngValue]="step.id" [disabled]="step.id === selectedStep.id">{{ NODE_META[step.type].icon }} {{ NODE_META[step.type].label }}</option></select></div>
            <div *ngIf="selectedStep.type === 'condition'" class="field next-field"><label>Rutas</label><span class="route-label yes">✓ Si se cumple</span><select [(ngModel)]="selectedStep.true_step"><option [ngValue]="undefined">Fin</option><option *ngFor="let step of selectedFlow.steps" [ngValue]="step.id">{{ NODE_META[step.type].label }}</option></select><span class="route-label no">× Si no se cumple</span><select [(ngModel)]="selectedStep.false_step"><option [ngValue]="undefined">Fin</option><option *ngFor="let step of selectedFlow.steps" [ngValue]="step.id">{{ NODE_META[step.type].label }}</option></select></div>
          </div>

          <div *ngIf="inspectorTab === 'node' && !selectedStep" class="inspector-empty"><div>←</div><h3>Selecciona un bloque</h3><p>Haz clic en cualquier bloque del lienzo para editar su contenido.</p></div>

          <div *ngIf="inspectorTab === 'flow'" class="inspector-content"><div class="section-title">Detalles del flujo</div><div class="field"><label>Nombre</label><input [(ngModel)]="selectedFlow.name" /><label>Descripción</label><textarea [(ngModel)]="selectedFlow.description" rows="3"></textarea><label class="check-row"><input type="checkbox" [(ngModel)]="selectedFlow.is_active" /> Flujo activo</label></div><button class="danger-button" (click)="deleteCurrentFlow()">Eliminar este flujo</button></div>

          <div *ngIf="inspectorTab === 'menu'" class="inspector-content"><div class="section-title">Menú principal</div><p class="field-help">Estas opciones aparecen cuando el cliente escribe la palabra de inicio.</p><div class="field"><label>Palabras de activación</label><input [(ngModel)]="config.trigger_word" /><label>Tipo de menú</label><select [(ngModel)]="config.menu_type"><option value="text">Texto numerado</option><option value="buttons">Botones WhatsApp</option><option value="list">Lista WhatsApp</option></select><label>Mensaje</label><textarea [(ngModel)]="config.welcome_message" rows="4"></textarea></div><div *ngFor="let option of config.options; let i = index" class="menu-option"><b>{{ i + 1 }}</b><input [(ngModel)]="option.label" placeholder="Opción" /><select [(ngModel)]="option.flow_id"><option value="">Flujo...</option><option *ngFor="let flow of config.flows" [value]="flow.id">{{ flow.name }}</option></select><button (click)="config.options.splice(i, 1)">×</button></div><button class="add-link" (click)="config.options.push({id: createId('option'), label: '', flow_id: ''})">＋ Agregar opción</button></div>

          <div class="palette"><div class="palette-title">Bloques</div><p>Arrastra al lienzo o haz clic para agregar</p><div id="botPalette" class="palette-grid" cdkDropList [cdkDropListData]="paletteTypes" [cdkDropListConnectedTo]="['botCanvas']"><div *ngFor="let type of paletteTypes" class="palette-item" cdkDrag [cdkDragData]="type" [cdkDragPreviewClass]="'drag-preview'" (click)="addStepFromPalette(type)"><span [style.background]="NODE_META[type].color">{{ NODE_META[type].icon }}</span><small>{{ NODE_META[type].label }}</small></div></div></div>
        </aside>
      </main>
    </div>
  `,
  styles: [`
    :host { display:block; background:#f5f7fb; min-height:calc(100vh - 64px); color:#172033; font-family:Inter,ui-sans-serif,system-ui,-apple-system,sans-serif; }
    * { box-sizing:border-box; } button,input,textarea,select { font:inherit; } button { cursor:pointer; }
    .bot-builder { min-height:calc(100vh - 64px); padding:28px 30px; } .builder-header { display:flex; justify-content:space-between; align-items:flex-end; max-width:1700px; margin:0 auto 22px; gap:20px; } .eyebrow { color:#64748b; font-size:10px; letter-spacing:.16em; font-weight:800; margin-bottom:7px; } h1 { margin:0; font-size:28px; letter-spacing:-.04em; font-weight:800; } .builder-header p { margin:5px 0 0; color:#718096; font-size:13px; } .header-actions { display:flex; align-items:center; gap:10px; } .status { display:flex; align-items:center; gap:7px; color:#64748b; font-size:12px; font-weight:700; margin-right:8px; } .status i,.flow-dot { width:7px; height:7px; border-radius:50%; background:#cbd5e1; display:inline-block; } .status.active i,.flow-dot { background:#20b486; box-shadow:0 0 0 3px #d9f7eb; } .flow-dot.off { background:#cbd5e1; box-shadow:none; } .button { border:0; border-radius:8px; padding:10px 15px; font-size:12px; font-weight:700; } .button.ghost { color:#475569; background:white; border:1px solid #e4e9f0; } .button.primary { color:white; background:#2563eb; box-shadow:0 5px 12px #2563eb2b; } .button:disabled { opacity:.55; cursor:wait; } .notice { max-width:1700px; margin:0 auto 12px; padding:10px 14px; border-radius:8px; background:#e8f8f1; border:1px solid #bcebd6; color:#087b51; font-size:13px; } .notice.error { background:#fff1f2; border-color:#fecdd3; color:#be123c; } .loading { max-width:1700px; margin:auto; background:white; border-radius:12px; padding:80px; text-align:center; color:#64748b; }
    .workspace { max-width:1700px; margin:auto; height:calc(100vh - 190px); min-height:650px; display:grid; grid-template-columns:220px minmax(600px,1fr) 310px; border:1px solid #e1e7ef; border-radius:13px; overflow:hidden; background:white; box-shadow:0 12px 40px #23304c0a; }
    .flows-sidebar { background:#fbfcfe; border-right:1px solid #e8edf3; display:flex; flex-direction:column; min-width:0; } .side-heading { display:flex; align-items:center; justify-content:space-between; padding:19px 17px 13px; font-size:13px; font-weight:800; color:#263248; } .side-heading button { border:0; background:#e9efff; color:#2563eb; width:25px; height:25px; border-radius:7px; font-size:18px; line-height:18px; } .flow-search { margin:0 12px 14px; border:1px solid #e5eaf1; border-radius:7px; background:white; color:#9aa7b8; padding:6px 9px; font-size:17px; display:flex; gap:5px; align-items:center; } .flow-search input { width:100%; border:0; outline:0; font-size:11px; color:#334155; } .flow-list { padding:0 9px; overflow:auto; } .flow-item { display:flex; width:100%; align-items:center; gap:9px; padding:10px 8px; border:0; background:transparent; border-radius:8px; text-align:left; margin-bottom:3px; } .flow-item:hover,.flow-item.selected { background:#eef4ff; } .flow-icon { width:27px; height:27px; display:grid; place-items:center; background:#e8eefb; color:#6681b5; border-radius:7px; font-size:18px; } .flow-item.selected .flow-icon { background:#dbe7ff; color:#2563eb; } .flow-copy { min-width:0; flex:1; } .flow-copy strong { display:block; font-size:11px; color:#334155; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; } .flow-copy small { display:block; color:#9aa7b8; font-size:10px; margin-top:3px; } .side-bottom { margin-top:auto; border-top:1px solid #e8edf3; padding:10px; } .side-link { width:100%; text-align:left; border:0; background:transparent; padding:8px; color:#718096; font-size:11px; border-radius:6px; } .side-link:hover { color:#2563eb; background:#eef4ff; }
    .canvas-area { display:flex; flex-direction:column; min-width:0; background:#f9fbfd; } .canvas-toolbar { height:61px; border-bottom:1px solid #e8edf3; display:flex; justify-content:space-between; align-items:center; padding:0 18px; background:white; } .flow-title { display:flex; align-items:center; gap:10px; } .flow-title input { border:0; outline:0; font-weight:800; color:#263248; font-size:14px; background:transparent; } .flow-title span { padding:4px 8px; border-radius:12px; background:#f0f3f8; color:#8793a5; font-size:10px; } .toolbar-actions { display:flex; align-items:center; gap:5px; color:#8793a5; font-size:11px; } .toolbar-actions button { border:1px solid #e4e9f0; background:white; color:#64748b; border-radius:6px; min-width:27px; padding:6px 8px; font-size:11px; } .toolbar-actions button:hover { background:#f3f6fb; } .canvas { position:relative; flex:1; overflow:auto; background:#f8fafc; } .canvas-grid { position:absolute; inset:0; opacity:.58; background-image:radial-gradient(#cad3e0 1px,transparent 1px); background-size:20px 20px; transform:scale(var(--zoom)); transform-origin:0 0; width:100%; height:100%; } .connections { position:absolute; inset:0; width:1400px; height:820px; pointer-events:none; z-index:1; } .node { position:absolute; width:235px; z-index:3; transform:scale(var(--zoom)); transform-origin:top left; } .node-card { position:relative; overflow:visible; border:1px solid #dde4ee; border-top:3px solid var(--node-color); border-radius:9px; background:white; box-shadow:0 5px 13px #20345612; transition:box-shadow .15s,border-color .15s; } .node.selected .node-card { border-color:var(--node-color); box-shadow:0 0 0 3px color-mix(in srgb,var(--node-color) 16%,transparent),0 8px 18px #20345618; } .node-head { display:flex; align-items:center; gap:7px; padding:8px 10px 7px; border-bottom:1px solid #edf1f5; cursor:grab; } .node-head:active { cursor:grabbing; } .node-head strong { font-size:11px; color:#334155; flex:1; } .node-head button { border:0; background:transparent; color:#a1adbc; font-size:17px; line-height:15px; opacity:0; } .node:hover .node-head button { opacity:1; } .node-icon { font-size:13px; } .node-body { padding:10px; min-height:42px; } .node-preview { display:block; color:#8390a3; font-size:10px; line-height:1.45; max-height:31px; overflow:hidden; white-space:pre-line; } .node-port { position:absolute; width:9px; height:9px; border:2px solid white; background:#94a3b8; border-radius:50%; z-index:4; } .input-port { top:-7px; left:calc(50% - 4px); } .output-port { bottom:-7px; left:calc(50% - 4px); } .condition-ports { position:absolute; bottom:-21px; left:0; right:0; display:flex; justify-content:space-around; color:#94a3b8; font-size:9px; } .drop-hint { position:absolute; bottom:13px; left:50%; transform:translateX(-50%); color:#a7b2c1; font-size:10px; pointer-events:none; } .empty-canvas { position:absolute; top:42%; left:50%; transform:translate(-50%,-50%); text-align:center; color:#94a3b8; pointer-events:none; } .empty-icon { margin:auto auto 10px; width:42px; height:42px; display:grid; place-items:center; border-radius:13px; background:#eaf0ff; color:#4f75d6; font-size:20px; } .empty-canvas h2 { margin:0 0 5px; color:#516075; font-size:15px; } .empty-canvas p { margin:0; font-size:11px; }
    .inspector { border-left:1px solid #e8edf3; background:white; display:flex; flex-direction:column; min-width:0; overflow:auto; } .inspector-tabs { display:flex; height:61px; border-bottom:1px solid #e8edf3; padding:0 12px; gap:13px; } .inspector-tabs button { border:0; border-bottom:2px solid transparent; background:transparent; padding:0 3px; color:#94a0b1; font-size:11px; font-weight:700; } .inspector-tabs button.active { color:#2563eb; border-bottom-color:#2563eb; } .inspector-content { padding:19px 17px; } .selected-label { display:flex; align-items:center; gap:8px; font-size:14px; font-weight:800; } .selected-label button { margin-left:auto; border:0; background:transparent; color:#ef4444; font-size:10px; } .field-help { color:#94a0b1; font-size:10px; line-height:1.5; margin:5px 0 20px 24px; } .field { display:flex; flex-direction:column; gap:6px; } .field label { color:#64748b; font-size:10px; font-weight:800; margin-top:12px; } .field input,.field textarea,.field select,.menu-option input,.menu-option select { width:100%; border:1px solid #e1e7ef; border-radius:6px; outline:0; padding:8px 9px; color:#334155; background:white; font-size:11px; } .field input:focus,.field textarea:focus,.field select:focus { border-color:#8db0fa; box-shadow:0 0 0 2px #2563eb12; } .field textarea { resize:vertical; line-height:1.45; } .field small { color:#9aa7b8; font-size:9px; } .endpoint { display:flex; gap:5px; } .endpoint select { width:65px; } .param { display:flex; gap:4px; } .param input:first-child { width:37%; } .param button,.menu-option button { border:0; background:transparent; color:#ef4444; font-size:16px; } .add-link { border:0; background:transparent; color:#2563eb; padding:5px 0; text-align:left; font-size:10px; font-weight:700; } .inline-field { display:flex; align-items:center; gap:8px; color:#718096; font-size:11px; } .inline-field input { width:75px; } .ai-note { margin-top:9px; padding:9px; border-radius:6px; background:#f5f0ff; color:#7e4bc0; font-size:10px; line-height:1.4; } .next-field { margin-top:23px; padding-top:15px; border-top:1px solid #edf1f5; } .route-label { font-size:10px; font-weight:800; margin-top:8px; } .route-label.yes { color:#059669; } .route-label.no { color:#ef4444; } .end-info { margin-top:18px; padding:12px; background:#f1f5f9; color:#64748b; font-size:11px; border-radius:7px; } .inspector-empty { padding:70px 28px; text-align:center; color:#94a0b1; } .inspector-empty div { font-size:30px; color:#b8c3d2; margin-bottom:12px; } .inspector-empty h3 { font-size:13px; color:#64748b; margin:0 0 7px; } .inspector-empty p { font-size:10px; line-height:1.5; } .section-title { font-weight:800; font-size:14px; color:#334155; margin-bottom:18px; } .check-row { display:flex!important; flex-direction:row!important; align-items:center; gap:8px; margin-top:18px!important; } .check-row input { width:auto; } .danger-button { width:100%; margin-top:25px; border:1px solid #fecaca; color:#dc2626; background:#fff7f7; border-radius:7px; padding:9px; font-size:10px; font-weight:700; } .menu-option { display:grid; grid-template-columns:21px 1fr 1fr 15px; align-items:center; gap:4px; margin-top:7px; } .menu-option b { font-size:10px; color:#94a3b8; text-align:center; } .menu-option input,.menu-option select { min-width:0; padding:7px 5px; font-size:10px; }
    .palette { margin:20px 15px 17px; padding-top:15px; border-top:1px solid #e8edf3; } .palette-title { font-size:11px; font-weight:800; color:#334155; } .palette p { margin:3px 0 10px; color:#9aa7b8; font-size:10px; } .palette-grid { display:grid; grid-template-columns:repeat(4,1fr); gap:7px; } .palette-item { min-width:0; text-align:center; cursor:grab; } .palette-item:active { cursor:grabbing; } .palette-item span { display:grid; place-items:center; width:31px; height:29px; margin:auto; border-radius:7px; color:white; font-size:14px; box-shadow:0 3px 7px #26375218; } .palette-item small { display:block; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; margin-top:4px; color:#718096; font-size:8px; } .drag-preview { opacity:.85; transform:rotate(2deg); }
    .node { left:0; top:0; transform:none; transform-origin:top left; }
    .node-card { transform:scale(var(--zoom)); transform-origin:top left; }
    @media (max-width:1100px) { .workspace { grid-template-columns:190px minmax(500px,1fr); } .inspector { display:none; } } @media (max-width:760px) { .bot-builder { padding:16px 10px; } .builder-header { align-items:flex-start; flex-direction:column; } .header-actions { width:100%; } .header-actions .button.primary { margin-left:auto; } .workspace { height:calc(100vh - 230px); grid-template-columns:175px minmax(480px,1fr); } }
  `],
})
export class WaMetaBotComponent implements OnInit {
  loading = true;
  saving = false;
  result: { ok: boolean; message: string } | null = null;
  zoom = 1;
  math = Math;
  inspectorTab: 'node' | 'flow' | 'menu' = 'node';
  selectedStep: BotStep | null = null;
  selectedFlow!: BotFlow;
  NODE_META = NODE_META;
  paletteTypes = PALETTE_TYPES;
  @ViewChild('canvas') canvas!: ElementRef<HTMLElement>;
  private draggingStep: BotStep | null = null;
  private dragOffset = { x: 0, y: 0 };

  config: BotConfig = {
    enabled: false,
    trigger_word: 'hola',
    welcome_message: 'Hola, bienvenido a Netplay SAS.\n\n¿En qué puedo ayudarte?',
    menu_type: 'buttons',
    menu_title: '¿En qué puedo ayudarte?',
    options: [],
    flows: [
      {
        id: 'consultar_factura',
        name: 'Consultar factura',
        description: 'Permite al cliente descargar facturas específicas (nuevo: selección individual)',
        is_active: true,
        steps: [
          { ...newStep('message', 100, 90), message: '¿Cuál es tu número de cédula o DNI?' },
          { ...newStep('input', 100, 230), message: 'Cédula/DNI', variable_name: 'cedula', input_type: 'number' },
          { ...newStep('message', 100, 390), message: 'Buscando tus facturas...' },
          { ...newStep('input', 100, 550), message: 'Selecciona el número de factura', variable_name: 'factura_seleccionada', input_type: 'number' },
          { ...newStep('message', 100, 710), message: 'Enviando tu factura...' },
          { ...newStep('end', 100, 870) },
        ]
      },
      { id: 'reportar_pago', name: 'Reportar pago', description: 'Registra un pago realizado', is_active: true, steps: [newStep('input', 100, 90), newStep('api_call', 100, 250), newStep('message', 100, 410), newStep('end', 100, 550)] },
    ],
    variables: [],
    settings: { fallback_message: 'No entendí tu mensaje. Escribe hola para ver el menú.', max_retries: 3, session_timeout_minutes: 30 },
  };

  constructor(private meta: MetaWhatsappService) {}

  createId(prefix: string): string { return id(prefix); }

  ngOnInit(): void {
    this.selectFlow(this.config.flows[0]);
    this.meta.getBotConfig().subscribe({
      next: (response: any) => {
        try {
          if (response?.data) this.patchConfig(response.data);
        } catch (error) {
          console.error('[Bot Builder] No se pudo cargar la configuración', error);
          this.result = { ok: false, message: 'No se pudo leer la configuración guardada. Se cargó un flujo nuevo.' };
        } finally {
          this.loading = false;
          this.selectFlow(this.config.flows[0]);
        }
      },
      error: () => { this.loading = false; this.selectFlow(this.config.flows[0]); },
    });
  }

  patchConfig(data: any): void {
    const defaultFlows = this.config.flows;
    const defaultOptions = this.config.options;
    const incomingFlows = Array.isArray(data?.flows) && data.flows.length > 0 ? data.flows : defaultFlows;
    const incomingOptions = Array.isArray(data?.options) ? data.options : defaultOptions;

    this.config = {
      ...this.config,
      ...data,
      flows: incomingFlows,
      options: incomingOptions,
      variables: Array.isArray(data?.variables) ? data.variables : this.config.variables,
      settings: { ...this.config.settings, ...(data?.settings || {}) },
    };

    this.config.flows = this.config.flows.filter(Boolean).map((flow: any, flowIndex: number) => ({
      ...flow,
      id: flow.id || id(`flow${flowIndex}`),
      name: flow.name || `Flujo ${flowIndex + 1}`,
      steps: Array.isArray(flow.steps) ? flow.steps : [],
    }));
    this.config.flows.forEach(flow => {
      flow.is_active = flow.is_active !== false;
      flow.steps.forEach((step: BotStep, index: number) => {
        step.id ||= id('step');
        step.type ||= 'message';
        step.x = Number.isFinite(step.x) ? step.x : 100;
        step.y = Number.isFinite(step.y) ? step.y : 80 + index * 145;
        step.params ||= [];
      });
    });
  }

  selectFlow(flow: BotFlow): void { this.selectedFlow = flow; this.selectedStep = flow.steps[0] || null; }
  selectStep(step: BotStep): void { this.selectedStep = step; this.inspectorTab = 'node'; }
  trackStep(_: number, step: BotStep): string { return step.id; }
  nextNode(step: BotStep): BotStep | undefined { return this.selectedFlow.steps.find(s => s.id === (step.next_step || this.selectedFlow.steps[this.selectedFlow.steps.indexOf(step) + 1]?.id)); }
  connectionPath(from: BotStep, to: BotStep): string { const x1 = from.x + 116, y1 = from.y + 89, x2 = to.x + 116, y2 = to.y; const bend = Math.max(25, (y2 - y1) / 2); return `M ${x1} ${y1} C ${x1} ${y1 + bend}, ${x2} ${y2 - bend}, ${x2} ${y2}`; }
  startNodeDrag(event: PointerEvent, step: BotStep): void {
    if ((event.target as HTMLElement).closest('button')) return;
    event.preventDefault();
    const rect = this.canvas.nativeElement.getBoundingClientRect();
    const x = event.clientX - rect.left + this.canvas.nativeElement.scrollLeft;
    const y = event.clientY - rect.top + this.canvas.nativeElement.scrollTop;
    this.draggingStep = step;
    this.dragOffset = { x: x - step.x, y: y - step.y };
    this.selectedStep = step;
  }

  @HostListener('document:pointermove', ['$event'])
  moveNode(event: PointerEvent): void {
    if (!this.draggingStep) return;
    const rect = this.canvas.nativeElement.getBoundingClientRect();
    const x = event.clientX - rect.left + this.canvas.nativeElement.scrollLeft;
    const y = event.clientY - rect.top + this.canvas.nativeElement.scrollTop;
    this.draggingStep.x = Math.max(15, x - this.dragOffset.x);
    this.draggingStep.y = Math.max(15, y - this.dragOffset.y);
  }

  @HostListener('document:pointerup')
  endNodeDrag(): void { this.draggingStep = null; }

  dropNode(event: CdkDragDrop<BotStep[]>): void {
    const type = event.item.data as StepType;
    if (!this.selectedFlow || !NODE_META[type]) return;
    const point = event.dropPoint || { x: 120, y: 120 };
    const element = (event.container.element.nativeElement as HTMLElement).getBoundingClientRect();
    const step = newStep(type, Math.max(20, point.x - element.left + event.container.element.nativeElement.scrollLeft - 115), Math.max(20, point.y - element.top + event.container.element.nativeElement.scrollTop - 30));
    const previous = this.selectedFlow.steps[this.selectedFlow.steps.length - 1];
    if (previous && !previous.next_step) previous.next_step = step.id;
    this.selectedFlow.steps.push(step);
    this.selectedStep = step;
  }

  addStepFromPalette(type: StepType): void {
    if (!this.selectedFlow || !NODE_META[type]) return;
    const last = this.selectedFlow.steps[this.selectedFlow.steps.length - 1];
    const step = newStep(type, 90 + (this.selectedFlow.steps.length % 3) * 270, 90 + Math.floor(this.selectedFlow.steps.length / 3) * 150);
    if (last && !last.next_step) last.next_step = step.id;
    this.selectedFlow.steps.push(step);
    this.selectedStep = step;
  }

  addFlow(): void { const flow: BotFlow = { id: id('flow'), name: 'Nuevo flujo', description: 'Configura este flujo', is_active: true, steps: [newStep('message', 100, 90), newStep('end', 100, 250)] }; this.config.flows.push(flow); this.selectFlow(flow); }
  deleteCurrentFlow(): void { if (this.config.flows.length === 1) return; const index = this.config.flows.indexOf(this.selectedFlow); this.config.flows.splice(index, 1); this.selectFlow(this.config.flows[Math.max(0, index - 1)]); }
  removeStep(step: BotStep): void { const index = this.selectedFlow.steps.indexOf(step); if (index < 0) return; this.selectedFlow.steps.splice(index, 1); if (this.selectedStep?.id === step.id) this.selectedStep = this.selectedFlow.steps[index - 1] || this.selectedFlow.steps[0] || null; }
  addParam(step: BotStep): void { (step.params ||= []).push({ key: '', value: '' }); }
  get allVariables(): string[] { const values = new Set(['phone', 'name', 'company', 'date']); this.config.variables.forEach(v => values.add(v.name)); this.config.flows.forEach(f => f.steps.forEach(s => { if (s.variable_name) values.add(s.variable_name); if (s.save_response_to) values.add(s.save_response_to); })); return Array.from(values); }
  stepPreview(step: BotStep): string { if (step.type === 'input') return `${step.message || 'Pregunta'} → {{${step.variable_name || 'variable'}}}`; if (step.type === 'api_call' || step.type === 'webhook') return `${step.method || 'GET'} ${step.endpoint || '/api/...'}`; if (step.type === 'delay') return `Pausa de ${step.delay_seconds || 1} segundos`; if (step.type === 'condition') return `${step.condition_variable || 'variable'} ${step.condition_operator || 'es igual a'}...`; if (step.type === 'end') return 'Fin de la conversación'; if (step.type === 'ai') return step.ai_prompt || 'Respuesta inteligente'; return step.message || NODE_META[step.type].description; }
  centerCanvas(): void { this.zoom = 1; }
  openSettings(): void { this.inspectorTab = 'flow'; }
  save(): void { this.saving = true; this.result = null; this.meta.updateBotConfig(this.config).subscribe({ next: () => { this.saving = false; this.result = { ok: true, message: 'Cambios guardados correctamente.' }; }, error: (e: any) => { this.saving = false; this.result = { ok: false, message: e.error?.error || 'No se pudo guardar la configuración.' }; } }); }
  exportConfig(): void { const blob = new Blob([JSON.stringify(this.config, null, 2)], { type: 'application/json' }); const url = URL.createObjectURL(blob); const anchor = document.createElement('a'); anchor.href = url; anchor.download = 'bot-config.json'; anchor.click(); URL.revokeObjectURL(url); }
}
