import {
  Component,
  Input,
  OnChanges,
  SimpleChanges,
  Output,
  EventEmitter
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { CrmService } from '../../../services/crm.service';

@Component({
  selector: 'app-crm-info-panel',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './crm-info-panel.component.html'
})
export class CrmInfoPanelComponent implements OnChanges {

  @Input() conversationId!: number;
  @Input() customerPhone = '';
  @Input() customerName  = '';
  @Input() currentPriority: 'low' | 'normal' | 'high' = 'normal';
  @Input() status: 'open' | 'in_progress' | 'closed' = 'open';

  @Output() priorityChanged    = new EventEmitter<'low' | 'normal' | 'high'>();
  @Output() ticketCreated      = new EventEmitter<number>();
  @Output() closePanel         = new EventEmitter<void>();
  @Output() customerNameChanged = new EventEmitter<string>();

  activeTab: 'info' | 'notes' | 'labels' = 'info';

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
        alert(`✅ Ticket #${res.ticket_id} creado`);
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
