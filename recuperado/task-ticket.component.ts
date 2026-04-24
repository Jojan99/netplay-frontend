import { Component, HostListener, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { UserService } from '../../../services/user.service';
import { AuthService } from '../../../services/auth.service';
import { TicketInterface, TicketNote, TicketStats } from '../../../models/ticket-interface';

@Component({
  selector: 'app-task-ticket',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './task-ticket.component.html',
  styleUrls: ['./task-ticket.component.scss'],
})
export class TaskTicketComponent implements OnInit, OnDestroy {

  // ── Role ─────────────────────────────────────────────────────────────────
  isAdmin   = false;
  isTecnico = false;

  // ── State ─────────────────────────────────────────────────────────────────
  tickets: TicketInterface[]  = [];
  stats: TicketStats | null   = null;
  notes: TicketNote[]         = [];
  selectedTicket: TicketInterface | null = null;
  technicians: any[] = [];

  loading        = true;
  notesLoading   = false;
  actionLoading  = false;
  showStats      = false;
  showDetail     = false;

  // ── Filters ───────────────────────────────────────────────────────────────
  filterStatus:  number | null = null;
  filterTechId:  number | null = null;
  filterSearch   = '';

  // ── Close-ticket modal ────────────────────────────────────────────────────
  showCloseModal   = false;
  closeDescription = '';
  closeSubmitting  = false;

  // ── Reopen modal ──────────────────────────────────────────────────────────
  showReopenModal   = false;
  reopenReason      = '';
  reopenSubmitting  = false;

  // ── Delete modal ──────────────────────────────────────────────────────────
  showDeleteModal  = false;
  deleteSubmitting = false;

  // ── Reassign panel ────────────────────────────────────────────────────────
  showReassignPanel = false;
  reassignTechId: number | null = null;

  // ── Polling ───────────────────────────────────────────────────────────────
  private pollInterval: any = null;
  private lastPollTime      = '';

  // ── Note form ─────────────────────────────────────────────────────────────
  noteText       = '';
  notePhotos:    File[] = [];
  noteSubmitting = false;

  // ── Audio recording ───────────────────────────────────────────────────────
  isRecording       = false;
  audioBlob: Blob | null = null;
  audioBlobUrl: string | null = null;
  private mediaRecorder: MediaRecorder | null  = null;
  private audioChunks: BlobEvent['data'][]     = [];
  private audioStream:  MediaStream | null     = null;
  recordingSeconds  = 0;
  private recordTimer: any = null;

  // ── Live timers ───────────────────────────────────────────────────────────
  private timers: any[] = [];

  constructor(
    private userService: UserService,
    private authService: AuthService,
  ) {}

  ngOnInit() {
    this.isAdmin   = this.authService.isAdmin();
    this.isTecnico = this.authService.isTecnico();

    if (this.isAdmin) this.loadTechnicians();
    this.loadTickets();
    if (this.isAdmin) this.loadStats();

    this.lastPollTime = new Date().toISOString();
    this.pollInterval = setInterval(() => this.pollUpdates(), 20000);
  }

  @HostListener('window:resize') onResize() {}

  ngOnDestroy() {
    this.timers.forEach(t => clearInterval(t));
    if (this.pollInterval) clearInterval(this.pollInterval);
    this.stopRecording();
    if (this.audioBlobUrl) URL.revokeObjectURL(this.audioBlobUrl);
  }

  // ── Data loading ──────────────────────────────────────────────────────────

  loadTechnicians() {
    this.userService.getTechnicaAll().subscribe({
      next: (res) => {
        this.technicians = (res.data || []).map((e: any) => ({
          id: e.user_id,
          name: `${e.names} ${e.lastname}`,
        }));
      }
    });
  }

  loadTickets() {
    this.loading = true;
    this.timers.forEach(t => clearInterval(t));
    this.timers = [];

    const filters: any = {};
    if (this.filterStatus)  filters.status_id    = this.filterStatus;
    if (this.filterTechId)  filters.technical_id  = this.filterTechId;
    if (this.filterSearch)  filters.search        = this.filterSearch;

    this.userService.getAllTickets(filters).subscribe({
      next: (res) => {
        this.tickets = (res.data || []).map((e: any) => {
          const t: TicketInterface = {
            id:             e.id,
            name:           e.user_names,
            last_name:      e.user_lastname,
            user_id:        e.user_id,
            technical_id:   e.technical_id,
            tech_names:     e.tech_names,
            tech_lastname:  e.tech_lastname,
            name_priority:  e.prioritys,
            priority_id:    e.priority_id,
            name_service:   e.service,
            service_id:     e.service_id,
            address:        e.address,
            date:           e.date,
            phone:          e.phone,
            cedula:         e.cedula,
            created_at:     e.created_at,
            started_at:     e.started_at,
            finished_at:    e.finished_at,
            closed_at:      e.closed_at,
            reopened_count: e.reopened_count || 0,
            observation:    e.observation,
            name_status:    e.status,
            status_id:      e.status_id,
            elapsedSeconds: 0,
          };
          if (t.status_id === 2 && t.started_at) this.startTimer(t);
          return t;
        });
        // Sincronizar el ticket abierto en el modal con los datos frescos
        if (this.selectedTicket) {
          const fresh = this.tickets.find(t => t.id === this.selectedTicket!.id);
          if (fresh) this.selectedTicket = fresh;
        }
        this.loading = false;
      },
      error: () => { this.loading = false; }
    });
  }

  loadStats() {
    this.userService.getTicketStats().subscribe({
      next: (res) => { this.stats = res.data; }
    });
  }

  loadNotes(ticketId: number) {
    this.notesLoading = true;
    this.userService.getTicketNotes(ticketId).subscribe({
      next: (res) => { this.notes = res.data || []; this.notesLoading = false; },
      error: () => { this.notesLoading = false; }
    });
  }

  // ── Selection ─────────────────────────────────────────────────────────────

  selectTicket(ticket: TicketInterface) {
    this.selectedTicket    = ticket;
    this.showDetail        = true;
    this.showReassignPanel = false;
    this.showCloseModal    = false;
    this.noteText          = '';
    this.notePhotos        = [];
    this.clearAudio();
    this.loadNotes(ticket.id!);
  }

  closeDetail() {
    this.showDetail        = false;
    this.selectedTicket    = null;
    this.notes             = [];
    this.showCloseModal    = false;
    this.showReassignPanel = false;
    this.clearAudio();
  }

  // ── Timers ────────────────────────────────────────────────────────────────

  startTimer(ticket: TicketInterface) {
    const ref = setInterval(() => {
      const start = new Date(ticket.started_at!).getTime();
      ticket.elapsedSeconds = Math.floor((Date.now() - start) / 1000);
    }, 1000);
    this.timers.push(ref);
  }

  formatDuration(ticket: TicketInterface): string {
    if (!ticket.started_at) return '—';
    const end   = ticket.finished_at ? new Date(ticket.finished_at).getTime() : Date.now();
    const secs  = Math.floor((end - new Date(ticket.started_at).getTime()) / 1000);
    return this.formatSecs(secs);
  }

  formatSecs(s: number): string {
    return `${this.pad(Math.floor(s/3600))}:${this.pad(Math.floor((s%3600)/60))}:${this.pad(s%60)}`;
  }

  pad(n: number) { return n < 10 ? '0'+n : ''+n; }

  formatRecording(): string { return this.formatSecs(this.recordingSeconds); }

  // ── Ticket actions ────────────────────────────────────────────────────────

  /** Admin & técnico: iniciar (1→2). Only admin can use old advance for status 2→3. */
  startTicket(ticket: TicketInterface) {
    this.actionLoading = true;
    this.userService.updateTicket(
      { id: ticket.id, name: ticket.name, last_name: ticket.last_name, tech_names: ticket.tech_names, startedAt: ticket.started_at },
      1
    ).subscribe({
      next: () => { this.actionLoading = false; this.reload(); },
      error: () => { this.actionLoading = false; }
    });
  }

  /** Opens close modal (both admin and técnico must give description). */
  openCloseModal() {
    this.closeDescription = '';
    this.showCloseModal   = true;
  }

  submitClose() {
    if (!this.closeDescription.trim() || !this.selectedTicket) return;
    this.closeSubmitting = true;
    this.userService.closeTicket(this.selectedTicket.id!, this.closeDescription).subscribe({
      next: () => {
        this.closeSubmitting  = false;
        this.showCloseModal   = false;
        this.closeDescription = '';
        this.reload();
        this.closeDetail();
      },
      error: () => { this.closeSubmitting = false; }
    });
  }

  openReopenModal() {
    this.reopenReason = '';
    this.showReopenModal = true;
  }

  submitReopen() {
    if (!this.reopenReason.trim() || !this.selectedTicket) return;
    this.reopenSubmitting = true;
    this.userService.reopenTicket(this.selectedTicket.id!, this.reopenReason).subscribe({
      next: () => {
        this.reopenSubmitting = false;
        this.showReopenModal  = false;
        this.reopenReason     = '';
        this.reload();
        this.closeDetail();
      },
      error: () => { this.reopenSubmitting = false; }
    });
  }

  openDeleteModal() {
    this.showDeleteModal = true;
  }

  confirmDelete() {
    if (!this.selectedTicket) return;
    this.deleteSubmitting = true;
    this.userService.deleteTicket(this.selectedTicket.id!).subscribe({
      next: () => {
        this.deleteSubmitting = false;
        this.showDeleteModal  = false;
        this.closeDetail();
        this.reload();
      },
      error: () => { this.deleteSubmitting = false; }
    });
  }

  private pollUpdates() {
    this.userService.getTicketsSince(this.lastPollTime).subscribe({
      next: (res) => {
        const updated: any[] = res.data || [];
        if (updated.length === 0) return;

        this.lastPollTime = new Date().toISOString();

        updated.forEach((e: any) => {
          const idx = this.tickets.findIndex(t => t.id === e.id);
          const mapped: TicketInterface = {
            id:             e.id,
            name:           e.user_names,
            last_name:      e.user_lastname,
            user_id:        e.user_id,
            technical_id:   e.technical_id,
            tech_names:     e.tech_names,
            tech_lastname:  e.tech_lastname,
            name_priority:  e.prioritys,
            priority_id:    e.priority_id,
            name_service:   e.service,
            service_id:     e.service_id,
            address:        e.address,
            date:           e.date,
            phone:          e.phone,
            cedula:         e.cedula,
            created_at:     e.created_at,
            started_at:     e.started_at,
            finished_at:    e.finished_at,
            closed_at:      e.closed_at,
            reopened_count: e.reopened_count || 0,
            observation:    e.observation,
            name_status:    e.status,
            status_id:      e.status_id,
            elapsedSeconds: 0,
          };
          if (idx >= 0) {
            Object.assign(this.tickets[idx], mapped);
          } else {
            this.tickets.unshift(mapped);
          }
          if (mapped.status_id === 2 && mapped.started_at) this.startTimer(mapped);
          // Refresh notes if this is the open ticket
          if (this.selectedTicket?.id === e.id) {
            this.selectedTicket = { ...this.selectedTicket!, ...mapped };
            this.loadNotes(e.id);
          }
        });

        if (this.isAdmin) this.loadStats();
      }
    });
  }

  confirmReassign() {
    if (!this.reassignTechId || !this.selectedTicket) return;
    this.actionLoading = true;
    this.userService.reassignTicket(this.selectedTicket.id!, this.reassignTechId).subscribe({
      next: () => {
        this.actionLoading     = false;
        this.showReassignPanel = false;
        this.reload(); this.closeDetail();
      },
      error: () => { this.actionLoading = false; }
    });
  }

  generatePdf(ticket: TicketInterface) {
    this.userService.downloadPdfTicketById(String(ticket.id)).subscribe({
      next: (blob: Blob) => {
        if (!blob) return;
        const url = URL.createObjectURL(blob);
        const a   = document.createElement('a');
        a.href = url; a.download = `Orden_${ticket.id}_${ticket.name}.pdf`;
        a.click(); URL.revokeObjectURL(url);
      }
    });
  }

  private reload() {
    this.loadTickets();
    if (this.isAdmin) this.loadStats();
  }

  // ── Notes ─────────────────────────────────────────────────────────────────

  onPhotosSelected(event: Event) {
    const input = event.target as HTMLInputElement;
    if (input.files) this.notePhotos = Array.from(input.files);
  }

  submitNote() {
    if (!this.noteText.trim() || !this.selectedTicket) return;
    this.noteSubmitting = true;

    const fd = new FormData();
    fd.append('note', this.noteText);
    this.notePhotos.forEach(f => fd.append('photos[]', f));
    if (this.audioBlob) fd.append('audio', this.audioBlob, 'recording.webm');

    this.userService.addTicketNote(this.selectedTicket.id!, fd).subscribe({
      next: () => {
        this.noteText       = '';
        this.notePhotos     = [];
        this.clearAudio();
        this.noteSubmitting = false;
        this.loadNotes(this.selectedTicket!.id!);
      },
      error: () => { this.noteSubmitting = false; }
    });
  }

  // ── Audio recording ───────────────────────────────────────────────────────

  async startRecording() {
    if (this.isRecording) return;
    try {
      this.audioStream    = await navigator.mediaDevices.getUserMedia({ audio: true });
      this.audioChunks    = [];
      this.mediaRecorder  = new MediaRecorder(this.audioStream);

      this.mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) this.audioChunks.push(e.data);
      };

      this.mediaRecorder.onstop = () => {
        this.audioBlob    = new Blob(this.audioChunks, { type: 'audio/webm' });
        if (this.audioBlobUrl) URL.revokeObjectURL(this.audioBlobUrl);
        this.audioBlobUrl = URL.createObjectURL(this.audioBlob);
        this.stopAudioStream();
      };

      this.mediaRecorder.start();
      this.isRecording     = true;
      this.recordingSeconds = 0;
      this.recordTimer     = setInterval(() => this.recordingSeconds++, 1000);

    } catch {
      alert('No se pudo acceder al micrófono. Verifica los permisos.');
    }
  }

  stopRecording() {
    if (!this.isRecording || !this.mediaRecorder) return;
    this.mediaRecorder.stop();
    this.isRecording = false;
    clearInterval(this.recordTimer);
  }

  clearAudio() {
    if (this.audioBlobUrl) URL.revokeObjectURL(this.audioBlobUrl);
    this.audioBlob    = null;
    this.audioBlobUrl = null;
    this.isRecording  = false;
    clearInterval(this.recordTimer);
    this.recordingSeconds = 0;
    this.stopAudioStream();
  }

  private stopAudioStream() {
    this.audioStream?.getTracks().forEach(t => t.stop());
    this.audioStream = null;
  }

  // ── Filters ───────────────────────────────────────────────────────────────

  applyFilter()  { this.loadTickets(); }
  clearFilters() {
    this.filterStatus = null; this.filterTechId = null; this.filterSearch = '';
    this.loadTickets();
  }

  // ── Helpers ───────────────────────────────────────────────────────────────

  statusLabel(id: number | undefined): string {
    return id === 1 ? 'Pendiente' : id === 2 ? 'En Proceso' : id === 3 ? 'Cerrado' : '—';
  }

  statusClass(id: number | undefined): string {
    if (id === 1) return 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-300';
    if (id === 2) return 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-300';
    if (id === 3) return 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300';
    return 'bg-gray-100 text-gray-800';
  }

  priorityClass(name: string | undefined): string {
    const n = (name || '').toLowerCase();
    if (n.includes('alta') || n.includes('urgente'))
      return 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-300';
    if (n.includes('media'))
      return 'bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-300';
    return 'bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300';
  }

  get pendingCount()    { return this.tickets.filter(t => t.status_id === 1).length; }
  get inProgressCount() { return this.tickets.filter(t => t.status_id === 2).length; }
  get closedCount()     { return this.tickets.filter(t => t.status_id === 3).length; }
}
