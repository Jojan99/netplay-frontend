import { Component, EventEmitter, Input, Output, OnChanges, SimpleChanges, HostListener } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

@Component({
  selector: 'app-conversation-list',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './conversation-list.component.html',
  styleUrl: './conversation-list.component.scss'
})
export class ConversationListComponent implements OnChanges {

  @Input() conversations: any[] = [];
  @Input() activeConversationId: number | null = null;
  @Input() activeStatus: 'all' | 'new' | 'in_progress' | 'closed' = 'all';

  @Output() statusChange = new EventEmitter<'all' | 'new' | 'in_progress' | 'closed'>();
  @Output() openChat     = new EventEmitter<number>();
  @Output() refresh      = new EventEmitter<void>();
  @Output() markUnread   = new EventEmitter<number>();

  /* ── Fijados (por agente, en este navegador) ─────────────────── */
  private pins = new Set<number>();
  rowMenuId: number | null = null;
  /** Minutos sin respuesta del agente a partir de los cuales el chat se marca en la lista. */
  @Input() waitAlertMinutes = 15;
  @Input() labels: any[] = [];
  activeLabelId: number | null = null;
  setLabel(id: number | null): void { this.activeLabelId = this.activeLabelId === id ? null : id; this.applySearch(); }

  constructor() {
    try { this.pins = new Set(JSON.parse(localStorage.getItem('crm_pins') || '[]')); } catch {}
  }
  isPinned(id: number): boolean { return this.pins.has(id); }
  togglePin(id: number): void {
    this.pins.has(id) ? this.pins.delete(id) : this.pins.add(id);
    try { localStorage.setItem('crm_pins', JSON.stringify([...this.pins])); } catch {}
    this.rowMenuId = null;
    this.applySearch();
  }
  toggleRowMenu(id: number, ev: Event): void { ev.stopPropagation(); this.rowMenuId = this.rowMenuId === id ? null : id; }
  @HostListener('document:click') closeRowMenu(): void { this.rowMenuId = null; }
  markUnreadRow(c: any): void { this.rowMenuId = null; this.markUnread.emit(c.id); }

  /** Minutos que lleva el cliente esperando (último mensaje suyo sin respuesta). */
  waitingMinutes(c: any): number {
    const lm = c?.last_message;
    if (!lm || lm.from !== 'customer' || c.status === 'closed' || !lm.at) return 0;
    const ms = Date.now() - new Date(lm.at).getTime();
    return ms > 0 ? Math.floor(ms / 60000) : 0;
  }
  waitLabel(min: number): string { return min < 60 ? `${min} min` : min < 1440 ? `${Math.floor(min / 60)} h` : `${Math.floor(min / 1440)} d`; }
  readonly tabs: { id: 'all' | 'new' | 'in_progress' | 'closed'; label: string }[] = [
    { id: 'all', label: 'Todos' }, { id: 'new', label: 'Nuevos' }, { id: 'in_progress', label: 'En curso' }, { id: 'closed', label: 'Cerrados' },
  ];

  /** Hora si es de hoy, "Ayer", o fecha corta: como WhatsApp. */
  timeLabel(iso: string): string {
    const d = new Date(iso); if (isNaN(d.getTime())) return '';
    const now = new Date(); const sameDay = d.toDateString() === now.toDateString();
    const y = new Date(now); y.setDate(now.getDate() - 1);
    if (sameDay) return d.toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit', hour12: false });
    if (d.toDateString() === y.toDateString()) return 'Ayer';
    return d.toLocaleDateString('es-CO', { day: '2-digit', month: '2-digit', year: '2-digit' });
  }

  searchQuery = '';
  filtered:   any[] = [];

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['conversations']) {
      this.applySearch();
    }
  }

  applySearch(): void {
    const q = this.searchQuery.toLowerCase().trim();
    const pool = this.activeLabelId ? this.conversations.filter(c => (c.labels || []).some((l: any) => l.id === this.activeLabelId)) : this.conversations;
    const base = !q
      ? pool
      : pool.filter(c =>
          c.customer?.name?.toLowerCase().includes(q) ||
          c.customer?.phone?.includes(q) ||
          (c.last_message?.content || '').toLowerCase().includes(q) ||
          (c.labels || []).some((l: any) => (l.name || '').toLowerCase().includes(q))
        );
    // Fijados arriba, conservando el orden del servidor dentro de cada grupo
    this.filtered = [...base.filter(c => this.pins.has(c.id)), ...base.filter(c => !this.pins.has(c.id))];
  }

  selectConversation(c: any): void {
    c.unread_count = 0;
    this.openChat.emit(c.id);
  }

  changeStatus(status: 'all' | 'new' | 'in_progress' | 'closed'): void {
    this.statusChange.emit(status);
  }

  trackByConversationId(index: number, c: any): number { return c?.id ?? index; }

  getInitials(name: string): string {
    return (name || '')
      .split(' ')
      .map(n => n.charAt(0))
      .join('')
      .substring(0, 2)
      .toUpperCase() || '?';
  }

  getStatusDot(status: string): string {
    return status === 'new'         ? 'bg-yellow-500'
      : status === 'in_progress'   ? 'bg-green-500'
      : status === 'closed'        ? 'bg-red-500'
      : 'bg-gray-300';
  }

  getStatusLabel(status: string): string {
    return status === 'new'       ? 'Nuevo'
      : status === 'in_progress' ? 'En progreso'
      : status === 'closed'      ? 'Cerrado' : '';
  }

  priorityColor(p: string): string {
    return p === 'high' ? '#ef4444' : p === 'low' ? '#10b981' : '#f59e0b';
  }

  priorityDot(p: string): string {
    return p === 'high' ? '🔴' : p === 'low' ? '🟢' : '🟡';
  }

  lastMessagePreview(lm: any): string {
    if (!lm) return '';
    switch (lm.type) {
      case 'image':    return 'Foto';
      case 'audio':    return 'Mensaje de voz';
      case 'video':    return 'Video';
      case 'document': return 'Documento';
      case 'sticker':  return 'Sticker';
      case 'location': return 'Ubicación';
      case 'contact':  return 'Contacto';
      default:         return lm.content || 'Mensaje';
    }
  }
}
