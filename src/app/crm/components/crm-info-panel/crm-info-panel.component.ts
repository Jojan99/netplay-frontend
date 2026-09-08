import { DialogService } from '../../../services/dialog.service';
import { ToastService } from '../../../services/toast.service';
import {
  Component,
  Input,
  OnChanges,
  SimpleChanges,
  Output,
  EventEmitter, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterModule } from '@angular/router';
import { CrmService } from '../../../services/crm.service';

@Component({
  selector: 'app-crm-info-panel',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterModule],
  templateUrl: './crm-info-panel.component.html',
  styleUrl: './crm-info-panel.component.scss'
})
export class CrmInfoPanelComponent implements OnChanges {
  private toast = inject(ToastService);
  private dialog = inject(DialogService);

  @Input() conversationId!: number;
  @Input() customerPhone = '';
  @Input() customerName  = '';
  @Input() currentPriority: 'low' | 'normal' | 'high' = 'normal';
  @Input() status: 'open' | 'in_progress' | 'closed' = 'open';

  @Output() priorityChanged    = new EventEmitter<'low' | 'normal' | 'high'>();
  @Output() ticketCreated      = new EventEmitter<number>();
  @Output() closePanel         = new EventEmitter<void>();
  @Output() customerNameChanged = new EventEmitter<string>();
  @Output() openConversation   = new EventEmitter<number>();
  @Input() summary: any = null;            // ficha del cliente (la carga chat-window)
  @Input() summaryLoading = false;
  @Output() refreshSummary = new EventEmitter<void>();

  activeTab: 'info' | 'notes' | 'labels' | 'history' = 'info';

  /* ── Ficha: facturas, link de pago, nota técnica ─────────────── */
  sendingInvoiceId: number | null = null;
  creatingPayLink = false;
  savingTechNote  = false;
  showAllInvoices = false;
  showFullCard = false;
  actionMsg = '';
  private flash(msg: string): void { this.actionMsg = msg; setTimeout(() => { if (this.actionMsg === msg) this.actionMsg = ''; }, 3500); }
  money(v: number): string { return '$' + Math.round(v || 0).toLocaleString('es-CO'); }

  async sendInvoice(inv: any) {
    if (this.sendingInvoiceId) return;
    if (!await this.dialog.confirm(`¿Enviar la factura ${inv.number} por WhatsApp al cliente?`)) return;
    this.sendingInvoiceId = inv.id;
    this.crmService.sendInvoiceFromChat(this.conversationId, inv.id).subscribe({
      next: () => { this.sendingInvoiceId = null; this.flash(`Factura ${inv.number} enviada`); },
      error: err => { this.sendingInvoiceId = null; this.toast.error(err?.error?.error || 'No se pudo enviar la factura.'); }
    });
  }
  copyInvoiceLink(inv: any): void { navigator.clipboard?.writeText(inv.link).then(() => this.flash('Link de la factura copiado')).catch(() => {}); }
  async sendPayLink(inv?: any) {
    if (this.creatingPayLink) return;
    const what = inv ? `la factura ${inv.number}` : 'todo lo pendiente';
    if (!await this.dialog.confirm(`¿Generar y enviar un link de pago por ${what}?`)) return;
    this.creatingPayLink = true;
    this.crmService.createPayLink(this.conversationId, inv?.id ?? null, true).subscribe({
      next: () => { this.creatingPayLink = false; this.flash('Link de pago enviado al chat'); },
      error: err => { this.creatingPayLink = false; this.toast.error(err?.error?.error || 'No se pudo generar el link de pago.'); }
    });
  }
  saveTechNote(): void {
    if (this.savingTechNote) return;
    this.savingTechNote = true;
    this.crmService.saveTechNote(this.conversationId).subscribe({
      next: () => { this.savingTechNote = false; this.loadNotes(); this.flash('Estado técnico guardado como nota'); },
      error: err => { this.savingTechNote = false; this.toast.error(err?.error?.error || 'No se pudo guardar la nota.'); }
    });
  }

  /* ── Historial de conversaciones del mismo cliente ───────────── */
  history: any[] = [];
  historyLoaded = false;
  loadHistory(): void {
    if (this.historyLoaded) return;
    this.crmService.getConversationHistory(this.conversationId).subscribe({ next: res => { this.history = res.data ?? []; this.historyLoaded = true; } });
  }
  statusLabel(st: string): string { return st === 'closed' ? 'Cerrada' : st === 'in_progress' ? 'En curso' : 'Nueva'; }

  /* ── Menciones @agente en notas ──────────────────────────────── */
  agents: any[] = [];
  private agentsLoaded = false;
  mentionQuery: string | null = null;
  mentionIndex = 0;
  get mentionMatches(): any[] {
    if (this.mentionQuery === null) return [];
    const q = this.mentionQuery.toLowerCase();
    return this.agents.filter(a => this.agentName(a).toLowerCase().includes(q)).slice(0, 6);
  }
  agentName(a: any): string { return (a?.name || `${a?.names || ''} ${a?.lastname || ''}`).trim() || a?.email || 'Agente'; }
  onNoteInput(ev: Event): void {
    const ta = ev.target as HTMLTextAreaElement;
    const upto = ta.value.slice(0, ta.selectionStart ?? ta.value.length);
    const m = upto.match(/(?:^|\s)@([\wáéíóúñÁÉÍÓÚÑ.]*)$/);
    this.mentionQuery = m ? m[1] : null;
    this.mentionIndex = 0;
    if (m && !this.agentsLoaded) { this.agentsLoaded = true; this.crmService.getAgents().subscribe({ next: r => this.agents = r.data ?? r ?? [] }); }
  }
  onNoteKeydown(ev: KeyboardEvent, ta: HTMLTextAreaElement): void {
    if (this.mentionQuery === null || !this.mentionMatches.length) return;
    if (ev.key === 'ArrowDown') { ev.preventDefault(); this.mentionIndex = (this.mentionIndex + 1) % this.mentionMatches.length; }
    else if (ev.key === 'ArrowUp') { ev.preventDefault(); this.mentionIndex = (this.mentionIndex - 1 + this.mentionMatches.length) % this.mentionMatches.length; }
    else if (ev.key === 'Enter' || ev.key === 'Tab') { ev.preventDefault(); this.applyMention(this.mentionMatches[this.mentionIndex], ta); }
    else if (ev.key === 'Escape') { this.mentionQuery = null; }
  }
  applyMention(a: any, ta: HTMLTextAreaElement): void {
    const pos = ta.selectionStart ?? ta.value.length;
    const before = ta.value.slice(0, pos).replace(/@[\wáéíóúñÁÉÍÓÚÑ.]*$/, '@' + this.agentName(a).replace(/\s+/g, '.') + ' ');
    this.newNoteText = before + ta.value.slice(pos);
    this.mentionQuery = null;
    setTimeout(() => { ta.focus(); ta.setSelectionRange(before.length, before.length); }, 0);
  }
  /** Divide el texto de la nota en segmentos para resaltar @menciones sin innerHTML. */
  noteParts(content: string): { text: string; mention: boolean }[] {
    return (content || '').split(/(@[\wáéíóúñÁÉÍÓÚÑ.]+)/g).filter(Boolean).map(t => ({ text: t, mention: t.startsWith('@') }));
  }

  /* ── Crear etiqueta desde el panel ───────────────────────────── */
  newLabelName = ''; newLabelColor = '#10b981'; savingLabel = false;
  createLabel(): void {
    const name = this.newLabelName.trim(); if (!name || this.savingLabel) return;
    this.savingLabel = true;
    this.crmService.createLabel(name, this.newLabelColor).subscribe({
      next: res => { this.allLabels = [...this.allLabels, res.data ?? res]; this.newLabelName = ''; this.savingLabel = false; },
      error: () => { this.savingLabel = false; this.toast.error('No se pudo crear la etiqueta.'); }
    });
  }

  // Nombre editable
  editingName   = false;
  editNameValue = '';
  savingName    = false;

  // Notas
  notes: any[]    = [];
  newNoteText     = '';
  savingNote      = false;

  // Etiquetas
  allLabels: any[]          = [];
  conversationLabels: any[] = [];

  // Servicio
  serviceStatus: any  = null;
  loadingService      = false;
  serviceLoaded       = false;

  // Ticket meta
  ticketServices:   any[] = [];
  ticketPriorities: any[] = [];
  ticketTechs:      any[] = [];
  ticketMetaLoaded  = false;

  // Ticket form
  showTicketForm   = false;
  ticketObs        = '';
  ticketServiceId  = 0;
  ticketPriorityId = 0;
  ticketTechId     = 0;
  ticketAddress    = '';
  ticketCedula     = '';
  ticketPhone      = '';
  savingTicket     = false;

  constructor(private crmService: CrmService) {}

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['conversationId'] && this.conversationId) {
      this.reset();
      this.loadNotes();
      this.loadLabels();
    }
    if (changes['customerPhone'] && this.customerPhone) {
      this.ticketPhone = this.customerPhone;
    }
  }

  private reset(): void {
    this.notes              = [];
    this.conversationLabels = [];
    this.serviceStatus      = null;
    this.serviceLoaded      = false;
    this.newNoteText        = '';
    this.history            = [];
    this.historyLoaded      = false;
    this.mentionQuery       = null;
    this.actionMsg          = '';
    this.showAllInvoices    = false;
    this.showFullCard       = false;
    this.showTicketForm     = false;
    this.ticketObs          = '';
    this.editingName        = false;
  }

  /* ── NOMBRE ─────────────────────────────────────────────────── */
  startEditName(): void {
    this.editNameValue = this.customerName;
    this.editingName   = true;
  }

  cancelEditName(): void { this.editingName = false; }

  saveName(): void {
    const name = this.editNameValue.trim();
    if (!name || this.savingName) return;
    this.savingName = true;
    this.crmService.updateCustomerName(this.conversationId, name).subscribe({
      next: () => {
        this.customerNameChanged.emit(name);
        this.editingName = false;
        this.savingName  = false;
      },
      error: () => this.savingName = false
    });
  }

  /* ── NOTAS ──────────────────────────────────────────────────── */
  loadNotes(): void {
    this.crmService.getNotes(this.conversationId).subscribe({
      next: res => this.notes = res.data ?? []
    });
  }

  addNote(): void {
    const content = this.newNoteText.trim();
    if (!content || this.savingNote) return;
    this.savingNote = true;
    this.crmService.addNote(this.conversationId, content).subscribe({
      next: res => {
        this.notes.push(res.data);
        this.newNoteText = '';
        this.savingNote  = false;
      },
      error: () => this.savingNote = false
    });
  }

  deleteNote(noteId: number): void {
    this.crmService.deleteNote(noteId).subscribe(() => {
      this.notes = this.notes.filter(n => n.id !== noteId);
    });
  }

  /* ── ETIQUETAS ──────────────────────────────────────────────── */
  loadLabels(): void {
    this.crmService.getLabels().subscribe({ next: res => this.allLabels = res.data ?? [] });
    this.crmService.getConversationLabels(this.conversationId).subscribe({
      next: res => this.conversationLabels = res.data ?? []
    });
  }

  hasLabel(labelId: number): boolean {
    return this.conversationLabels.some(l => l.id === labelId);
  }

  toggleLabel(labelId: number): void {
    if (this.hasLabel(labelId)) {
      this.crmService.removeConversationLabel(this.conversationId, labelId).subscribe(() => {
        this.conversationLabels = this.conversationLabels.filter(l => l.id !== labelId);
      });
    } else {
      this.crmService.addConversationLabel(this.conversationId, labelId).subscribe(() => {
        const label = this.allLabels.find(l => l.id === labelId);
        if (label) this.conversationLabels.push(label);
      });
    }
  }

  /* ── PRIORIDAD ───────────────────────────────────────────────── */
  setPriority(p: 'low' | 'normal' | 'high'): void {
    if (this.currentPriority === p) return;
    this.crmService.updatePriority(this.conversationId, p).subscribe(() => {
      this.currentPriority = p;
      this.priorityChanged.emit(p);
    });
  }

  /* ── ESTADO SERVICIO ─────────────────────────────────────────── */
  loadServiceStatus(): void {
    if (this.serviceLoaded || this.loadingService) return;
    this.loadingService = true;
    this.crmService.getServiceStatus(this.conversationId).subscribe({
      next: res => {
        this.serviceStatus = res.data;
        this.serviceLoaded = true;
        this.loadingService = false;
      },
      error: () => this.loadingService = false
    });
  }

  /* ── TICKET ──────────────────────────────────────────────────── */
  openTicketForm(): void {
    if (!this.ticketMetaLoaded) {
      this.crmService.getTicketMeta().subscribe({
        next: res => {
          this.ticketServices   = res.data?.services   ?? [];
          this.ticketPriorities = res.data?.priorities ?? [];
          this.ticketTechs      = res.data?.technicians ?? [];
          this.ticketMetaLoaded = true;
          if (this.ticketServices.length)   this.ticketServiceId  = this.ticketServices[0].id;
          if (this.ticketPriorities.length) this.ticketPriorityId = this.ticketPriorities[0].id;
          if (this.ticketTechs.length)      this.ticketTechId     = this.ticketTechs[0].id;
        }
      });
    }
    this.ticketPhone   = this.customerPhone;
    this.showTicketForm = true;
  }

  get ticketFormValid(): boolean {
    return !!this.ticketObs.trim()
      && this.ticketServiceId > 0
      && this.ticketPriorityId > 0
      && this.ticketTechId > 0;
  }

  submitTicket(): void {
    if (!this.ticketFormValid || this.savingTicket) return;
    this.savingTicket = true;
    this.crmService.createTicketFromConversation(this.conversationId, {
      observation:  this.ticketObs.trim(),
      type_service: this.ticketServiceId,
      priority:     this.ticketPriorityId,
      tecnichal:    this.ticketTechId,
      address:      this.ticketAddress.trim() || undefined,
      cedula:       this.ticketCedula.trim()  || undefined,
      phone:        this.ticketPhone.trim()   || undefined,
    }).subscribe({
      next: res => {
        this.ticketCreated.emit(res.ticket_id);
        this.showTicketForm = false;
        this.ticketObs      = '';
        this.ticketAddress  = '';
        this.ticketCedula   = '';
        this.savingTicket   = false;
        this.toast.success(`Ticket #${res.ticket_id} creado`);
      },
      error: () => this.savingTicket = false
    });
  }

  /* ── HELPERS ────────────────────────────────────────────────── */
  priorityColor(p: string): string {
    return p === 'high' ? '#ef4444' : p === 'low' ? '#10b981' : '#f59e0b';
  }

  priorityLabel(p: string): string {
    return p === 'high' ? 'Alta' : p === 'low' ? 'Baja' : 'Normal';
  }
}
