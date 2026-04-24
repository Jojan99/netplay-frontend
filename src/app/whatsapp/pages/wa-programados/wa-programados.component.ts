import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { WhatsappService } from '../../services/whatsapp.service';

type MsgType     = 'text' | 'image' | 'document' | 'audio' | 'video';
type ScheduleType = 'once' | 'daily' | 'weekly';

@Component({
  selector: 'app-wa-programados',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './wa-programados.component.html'
})
export class WaProgramadosComponent implements OnInit {

  // Instancias
  instances: any[]   = [];

  // Lista programados
  scheduled: any[]   = [];
  loading            = false;
  statusFilter       = '';

  // Formulario nuevo
  showForm           = false;
  creating           = false;
  formError          = '';

  form = this.emptyForm();

  readonly statusFilters = [
    { label: 'Todos',       value: ''           },
    { label: '🟢 Activos',  value: 'active'     },
    { label: '✓ Enviados',  value: 'sent'       },
    { label: '✗ Cancelados',value: 'cancelled'  }
  ];

  readonly weekDays = [
    { label: 'Lun', value: '1' },
    { label: 'Mar', value: '2' },
    { label: 'Mié', value: '3' },
    { label: 'Jue', value: '4' },
    { label: 'Vie', value: '5' },
    { label: 'Sáb', value: '6' },
    { label: 'Dom', value: '0' }
  ];

  readonly msgTypes: { value: MsgType; label: string; icon: string }[] = [
    { value: 'text',     label: 'Texto',     icon: '💬' },
    { value: 'image',    label: 'Imagen',    icon: '🖼️'  },
    { value: 'document', label: 'Documento', icon: '📄' },
    { value: 'audio',    label: 'Audio',     icon: '🎵' },
    { value: 'video',    label: 'Video',     icon: '🎬' }
  ];

  constructor(private wa: WhatsappService) {}

  ngOnInit(): void {
    this.wa.ensureApiKey().subscribe({
      next: () => {
        this.wa.getInstances().subscribe({
          next: (r: any) => { this.instances = r.instances || []; }
        });
        this.loadScheduled();
      }
    });
  }

  emptyForm() {
    return {
      instanceId:   '',
      name:         '',
      number:       '',
      messageType:  'text' as MsgType,
      content:      '',
      mediaUrl:     '',
      caption:      '',
      scheduleType: 'once' as ScheduleType,
      scheduledAt:  '',
      repeatTime:   '',
      repeatDays:   [] as string[]
    };
  }

  resetForm(): void {
    this.form      = this.emptyForm();
    this.formError = '';
  }

  loadScheduled(): void {
    this.loading = true;
    this.wa.getScheduled(this.statusFilter || undefined).subscribe({
      next: (r: any) => { this.scheduled = r.scheduled || []; this.loading = false; },
      error: ()      => { this.loading = false; }
    });
  }

  toggleDay(val: string): void {
    const idx = this.form.repeatDays.indexOf(val);
    if (idx > -1) this.form.repeatDays.splice(idx, 1);
    else          this.form.repeatDays.push(val);
  }

  isDaySelected(val: string): boolean {
    return this.form.repeatDays.includes(val);
  }

  create(): void {
    if (!this.form.instanceId || !this.form.number || !this.form.scheduledAt) {
      this.formError = 'Instancia, número y fecha son obligatorios';
      return;
    }
    if (this.form.scheduleType !== 'once' && !this.form.repeatTime) {
      this.formError = 'La hora de repetición es obligatoria';
      return;
    }
    if (this.form.scheduleType === 'weekly' && !this.form.repeatDays.length) {
      this.formError = 'Selecciona al menos un día de la semana';
      return;
    }

    this.creating  = true;
    this.formError = '';

    const payload = {
      ...this.form,
      repeatDays: this.form.repeatDays.join(',')
    };

    this.wa.createScheduled(this.form.instanceId, payload).subscribe({
      next: () => {
        this.creating  = false;
        this.showForm  = false;
        this.resetForm();
        this.loadScheduled();
      },
      error: (e: any) => {
        this.creating  = false;
        this.formError = e.error?.message || 'Error al programar';
      }
    });
  }

  cancel(id: number): void {
    this.wa.cancelScheduled(id).subscribe({
      next: () => this.loadScheduled()
    });
  }

  delete(id: number): void {
    if (!confirm('¿Eliminar este mensaje programado?')) return;
    this.wa.deleteScheduled(id).subscribe({
      next: () => this.loadScheduled()
    });
  }

  typeIcon(type: string): string {
    const map: Record<string, string> = {
      text: '💬', image: '🖼️', document: '📄', audio: '🎵', video: '🎬'
    };
    return map[type] || '📨';
  }
}