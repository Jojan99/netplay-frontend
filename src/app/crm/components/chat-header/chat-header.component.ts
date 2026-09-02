import { Component, Input, Output, EventEmitter } from '@angular/core';
import { CommonModule } from '@angular/common';

export interface ChatHeaderData {
  customerName:  string;
  customerPhone: string;
  status: 'open' | 'in_progress' | 'closed';
  priority?: 'low' | 'normal' | 'high';
  online?: boolean;
  agentName?: string | null;
}

@Component({
  selector: 'app-chat-header',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './chat-header.component.html'
})
export class ChatHeaderComponent {

  @Input() data!: ChatHeaderData;
  @Input() botPaused = false;

  @Output() openTransfer = new EventEmitter<void>();
  @Output() finish       = new EventEmitter<void>();
  @Output() back         = new EventEmitter<void>();
  @Output() toggleInfo   = new EventEmitter<void>();
  @Output() toggleBot = new EventEmitter<void>();

  get initials(): string {
    return (this.data.customerName ?? '')
      .split(' ')
      .map(n => n[0])
      .join('')
      .substring(0, 2)
      .toUpperCase() || '?';
  }

  get statusLabel(): string {
    return this.data.status === 'open' ? 'Abierto'
      : this.data.status === 'in_progress' ? 'En curso' : 'Cerrado';
  }

  get statusStyle(): string {
    return this.data.status === 'open'
      ? 'background:#1e3a5f; color:#60a5fa;'
      : this.data.status === 'in_progress'
        ? 'background:#1c2a1c; color:#10b981;'
        : 'background:#1e1e1e; color:#64748b;';
  }

  get priorityLabel(): string {
    return this.data.priority === 'high' ? '🔴 Alta'
      : this.data.priority === 'low' ? '🟢 Baja' : '🟡 Normal';
  }
}
