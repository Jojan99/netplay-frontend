import { Component, Output, EventEmitter, Input, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { CrmService } from '../../../services/crm.service';

@Component({
  selector: 'app-crm-new-conversation-modal',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './crm-new-conversation-modal.component.html'
})
export class CrmNewConversationModalComponent implements OnInit {

  @Output() closed  = new EventEmitter<void>();
  @Output() created = new EventEmitter<number>();

  /** Líneas de WhatsApp Web de la empresa (viene de la bandeja, ya cargada). */
  @Input() lineas: any[] = [];
  @Input() provider: 'meta' | 'netplay' = 'netplay';

  phone   = '';
  name    = '';
  saving  = false;
  error   = '';

  /** Línea elegida. Arranca en la principal. */
  linea: number | null = null;

  /**
   * El selector solo aparece si hay más de una línea de WhatsApp Web. Con una
   * sola no hay nada que elegir; con Meta tampoco, es un número único.
   */
  mostrarLineas = false;

  constructor(private crmService: CrmService) {}

  ngOnInit(): void {
    this.mostrarLineas = this.provider === 'netplay' && (this.lineas?.length ?? 0) > 1;
    this.linea = this.lineas?.find(l => l.principal)?.id ?? this.lineas?.[0]?.id ?? null;
  }

  submit(): void {
    this.error = '';
    const phone = this.phone.trim();
    if (!phone) { this.error = 'El teléfono es obligatorio'; return; }
    if (this.saving) return;

    this.saving = true;
    this.crmService.createConversation(
      phone,
      this.name.trim(),
      this.provider,
      this.mostrarLineas ? this.linea : null,
    ).subscribe({
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
