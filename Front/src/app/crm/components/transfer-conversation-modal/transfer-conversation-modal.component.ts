import { Component, EventEmitter, Input, OnInit, Output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { CrmService } from '../../../services/crm.service';

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

  constructor(private crmService: CrmService) {}

  ngOnInit(): void {
    this.crmService.getAgents().subscribe({
      next: (r) => this.agents = r.data ?? [],
      error: () => this.agents = []
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
      error: () => this.loading = false
    });
  }

  cancel() {
    this.closed.emit(false);
  }
}
