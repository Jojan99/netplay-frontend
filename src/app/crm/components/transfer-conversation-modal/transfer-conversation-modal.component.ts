import { Component, EventEmitter, Input, OnInit, Output, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { CrmService } from '../../../services/crm.service';
import { ToastService } from '../../../services/toast.service';

@Component({
  selector: 'app-transfer-conversation-modal',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './transfer-conversation-modal.component.html',
  styleUrls: ['./transfer-conversation-modal.component.scss']
})
export class TransferConversationModalComponent implements OnInit {

  @Input() conversationId!: number;
  @Output() closed = new EventEmitter<boolean>();

  agents: any[] = [];
  selectedAgent: any = null;
  reason = '';
  loading = false;

  private toast = inject(ToastService);

  constructor(private crmService: CrmService) {}

  ngOnInit(): void {
    this.crmService.getAgents().subscribe({
      next: (r) => this.agents = r.data ?? [],
      error: () => { this.agents = []; this.toast.error('No se pudo cargar la lista de asesores.'); }
    });
  }

  select(agent: any) {
    this.selectedAgent = agent;
  }

  expandedAgentId: number | null = null;

toggleExpand(agent: any, event: MouseEvent) {
  event.stopPropagation();
  this.expandedAgentId =
    this.expandedAgentId === agent.user_id
      ? null
      : agent.user_id;
}

  confirm() {
    if (!this.selectedAgent || this.loading) return;

    this.loading = true;

    this.crmService.transferConversation(
      this.conversationId,
      this.selectedAgent.user_id,
      this.reason
    ).subscribe({
      next: () => this.closed.emit(true),
      // Antes fallaba en silencio: el agente creía que había transferido el chat.
      error: e => { this.loading = false; this.toast.error(e?.error?.message || 'No se pudo transferir la conversación.'); }
    });
  }

  cancel() {
    this.closed.emit(false);
  }
}
