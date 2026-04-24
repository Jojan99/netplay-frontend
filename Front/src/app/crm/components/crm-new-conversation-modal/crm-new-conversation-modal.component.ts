import { Component, Output, EventEmitter } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { CrmService } from '../../../services/crm.service';

@Component({
  selector: 'app-crm-new-conversation-modal',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './crm-new-conversation-modal.component.html'
})
export class CrmNewConversationModalComponent {

  @Output() closed  = new EventEmitter<void>();
  @Output() created = new EventEmitter<number>();

  phone   = '';
  name    = '';
  saving  = false;
  error   = '';

  constructor(private crmService: CrmService) {}

  submit(): void {
    this.error = '';
    const phone = this.phone.trim();
    if (!phone) { this.error = 'El teléfono es obligatorio'; return; }
    if (this.saving) return;

    this.saving = true;
    this.crmService.createConversation(phone, this.name.trim()).subscribe({
      next: res => {
        this.saving = false;
        this.created.emit(res.conversation_id);
        this.closed.emit();
      },
      error: err => {
        this.saving = false;
        this.error  = err?.error?.message || 'Error al crear la conversación';
      }
    });
  }
}
