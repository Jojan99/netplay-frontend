import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { WhatsappService } from '../../services/whatsapp.service';

type MsgType = 'text' | 'image' | 'document' | 'audio' | 'video';

interface HistoryItem {
  ok: boolean;
  number: string;
  preview: string;
  time: Date;
}

@Component({
  selector: 'app-wa-enviar',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './wa-enviar.component.html'
})
export class WaEnviarComponent implements OnInit {

  instances: any[]  = [];
  selectedInstance  = '';
  number    = '';
  message   = '';
  mediaUrl  = '';
  caption   = '';
  filename  = '';
  ptt       = false;
  msgType: MsgType  = 'text';
  sending   = false;
  result: { ok: boolean; message: string; queued?: boolean } | null = null;
  history: HistoryItem[] = [];

  readonly msgTypes: { value: MsgType; label: string; icon: string }[] = [
    { value: 'text',     label: 'Texto',     icon: '💬' },
    { value: 'image',    label: 'Imagen',    icon: '🖼️'  },
    { value: 'document', label: 'Documento', icon: '📄' },
    { value: 'audio',    label: 'Audio',     icon: '🎵' },
    { value: 'video',    label: 'Video',     icon: '🎬' }
  ];

  // ✅ Filtra por status === 'connected'
  get connectedInstances(): any[] {
    return this.instances.filter(i => i.status === 'connected');
  }

  get canSend(): boolean {
    if (!this.selectedInstance || !this.number.trim()) return false;
    if (this.msgType === 'text') return !!this.message.trim();
    return !!this.mediaUrl.trim();
  }

  constructor(private wa: WhatsappService) {}

  ngOnInit(): void {
    this.wa.ensureApiKey().subscribe({
      next: () => {
        this.wa.getInstances().subscribe({
          next: (r: any) => { this.instances = r.instances || []; }
        });
      }
    });
  }

  changeType(type: MsgType): void {
    this.msgType  = type;
    this.result   = null;
    this.mediaUrl = '';
    this.caption  = '';
    this.filename = '';
    this.ptt      = false;
  }

  send(): void {
    if (!this.canSend) return;
    this.sending = true;
    this.result  = null;

    // ✅ instanceId no id
    const inst = this.selectedInstance;
    const num  = this.number.trim();

    // ✅ Switch en vez de object para no disparar todos los requests
    let obs$: any;
    switch (this.msgType) {
      case 'image':    obs$ = this.wa.sendImage(inst, num, this.mediaUrl, this.caption); break;
      case 'document': obs$ = this.wa.sendDocument(inst, num, this.mediaUrl, this.filename, this.caption); break;
      case 'audio':    obs$ = this.wa.sendAudio(inst, num, this.mediaUrl, this.ptt); break;
      case 'video':    obs$ = this.wa.sendVideo(inst, num, this.mediaUrl, this.caption); break;
      default:         obs$ = this.wa.sendText(inst, num, this.message);
    }

    obs$.subscribe({
      next: (r: any) => {
        this.sending = false;
        const queued = r.status === 'queued';
        this.result  = { ok: true, message: r.message || 'Enviado correctamente', queued };
        this.addHistory(true, num, this.msgType === 'text' ? this.message : `[${this.msgType}]`);
        if (this.msgType === 'text') this.message = '';
      },
      error: (e: any) => {
        this.sending = false;
        this.result  = { ok: false, message: e.error?.message || 'Error al enviar' };
        this.addHistory(false, num, e.error?.message || 'Error');
      }
    });
  }

  private addHistory(ok: boolean, number: string, preview: string): void {
    this.history.unshift({ ok, number, preview, time: new Date() });
    if (this.history.length > 20) this.history.pop();
  }
}