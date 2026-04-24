import { Component, EventEmitter, Input, Output, OnChanges, SimpleChanges } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

@Component({
  selector: 'app-conversation-list',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './conversation-list.component.html',
})
export class ConversationListComponent implements OnChanges {

  @Input() conversations: any[] = [];
  @Input() activeConversationId: number | null = null;
  @Input() activeStatus: 'all' | 'new' | 'in_progress' | 'closed' = 'all';

  @Output() statusChange = new EventEmitter<'all' | 'new' | 'in_progress' | 'closed'>();
  @Output() openChat     = new EventEmitter<number>();

  searchQuery = '';
  filtered:   any[] = [];

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['conversations']) {
      this.applySearch();
    }
  }

  applySearch(): void {
    const q = this.searchQuery.toLowerCase().trim();
    this.filtered = !q
      ? this.conversations
      : this.conversations.filter(c =>
          c.customer?.name?.toLowerCase().includes(q) ||
          c.customer?.phone?.includes(q)
        );
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
      case 'image':    return '📷 Imagen';
      case 'audio':    return '🎤 Audio';
      case 'video':    return '🎥 Video';
      case 'document': return '📄 Documento';
      case 'sticker':  return '😊 Sticker';
      case 'location': return '📍 Ubicación';
      case 'contact':  return '👤 Contacto';
      default:         return lm.content || 'Mensaje';
    }
  }
}
