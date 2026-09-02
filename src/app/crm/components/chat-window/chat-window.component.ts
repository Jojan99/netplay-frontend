import {
  Component,
  EventEmitter,
  Output,
  Input,
  OnChanges,
  OnDestroy,
  NgZone,
  ViewChild,
  ElementRef
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

import { ChatHeaderComponent } from '../chat-header/chat-header.component';
import { MessageBubbleComponent } from '../message-bubble/message-bubble.component';
import { PreviewModalComponent } from '../preview-modal/preview-modal.component';
import { CrmInfoPanelComponent } from '../crm-info-panel/crm-info-panel.component';

import { CrmService } from '../../../services/crm.service';
import { EchoService } from '../../../services/echo.service';
import { AudioFfmpegService } from '../../../core/audio-ffmpeg.service';
import { ChatMessage } from '../message-bubble/message-bubble.component';

export interface NewMessageEventPayload {
  message: {
    id: number;
    sender_type: 'customer' | 'agent' | 'system';
    content: string | null;
    message_type: string;
    media_url: string | null;
    mime_type?: string | null;
    agent_signature?: string | null;
    is_forwarded?: boolean;
    created_at: string;
  };
}

@Component({
  selector: 'app-chat-window',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    ChatHeaderComponent,
    MessageBubbleComponent,
    PreviewModalComponent,
    CrmInfoPanelComponent
  ],
  templateUrl: './chat-window.component.html',
  styleUrl: './chat-window.component.scss'
})
export class ChatWindowComponent implements OnChanges, OnDestroy {

  @Input() conversationId: number | null = null;
  @Output() openTransfer        = new EventEmitter<void>();
  @Output() back                = new EventEmitter<void>();
  @Output() conversationClosed  = new EventEmitter<void>();

  @ViewChild('messagesContainer') messagesContainer!: ElementRef;
  @ViewChild('docInput')  docInput!: ElementRef<HTMLInputElement>;
  @ViewChild('mediaInput') mediaInput!: ElementRef<HTMLInputElement>;

  messages: ChatMessage[] = [];

  loading  = false;
  sending  = false;
  draftMessage = '';

  private mediaStream: MediaStream | null = null;

  // ── Adjuntos ──────────────────────────────────────────────────
  fileToSend:  File | null = null;
  filePreview: File | null = null;
  previewUrl:  string | null = null;
  previewType: 'video' | 'audio' | 'document' | 'pdf' | 'office' | 'image' | null = null;

  dragging         = false;
  showAttachMenu   = false;
  isProcessingAudio = false;

  // ── Audio ─────────────────────────────────────────────────────
  isRecording          = false;
  private mediaRecorder: MediaRecorder | null = null;
  private audioChunks: BlobPart[] = [];
  recordSeconds        = 0;
  private recordTimer: any = null;
  audioPreviewUrl: string | null = null;
  recordedAudioFile: File | null = null;
  private currentConversationId: number | null = null;

  // ── UI ─────────────────────────────────────────────────────────
  previewOpen    = false;
  showInfoPanel  = false;
  botPaused = false;

  // ── Header data ───────────────────────────────────────────────
  headerData: {
    customerName:  string;
    customerPhone: string;
    status: 'open' | 'in_progress' | 'closed';
    priority?: 'low' | 'normal' | 'high';
    online?: boolean;
    agentName?: string;
  } | null = null;

  // ── Stickers ─────────────────────────────────────────────────
  showStickerPicker = false;
  stickers: any[]   = [];

  // ── Reenviar ──────────────────────────────────────────────────
  forwardingMessage: ChatMessage | null = null;
  allConversations: any[] = [];
  forwardTargets: number[] = [];

  constructor(
    private crmService: CrmService,
    private echoService: EchoService,
    private zone: NgZone,
    private audioFfmpeg: AudioFfmpegService
  ) {}

  trackByMessage(_: number, msg: any) { return msg._renderKey ?? msg.id; }

  /* ── CAMBIO DE CONVERSACIÓN ─────────────────────────────────── */
  ngOnChanges(): void {
    if (!this.conversationId) return;

    if (this.currentConversationId) {
      this.echoService.leave(`conversation.${this.currentConversationId}`);
    }

    this.currentConversationId = this.conversationId;
    this.showInfoPanel = false;
    this.loadMessages(this.conversationId);
    this.loadStickers();

    const echo = this.echoService.instance;
    if (!echo) return;

    echo
      .private(`conversation.${this.conversationId}`)
      .listen('.message.new', (e: NewMessageEventPayload) => {
        this.zone.run(() => {
          const pendingIndex = this.messages.findIndex(
            m => m.pending === true && m.from === 'agent' && m.content === e.message.content
          );

          if (pendingIndex !== -1) {
            const prev = this.messages[pendingIndex];
            const updated = [...this.messages];
            updated[pendingIndex] = {
              id:           e.message.id,
              from:         e.message.sender_type,
              content:      e.message.content,
              message_type: (e.message.message_type ?? (e.message.media_url ? 'image' : prev.message_type)) as any,
              media_url:    e.message.media_url ?? prev.media_url ?? null,
              at:           e.message.created_at,
              pending:      false,
              agent_signature: e.message.agent_signature ?? null,
              is_forwarded: e.message.is_forwarded ?? false,
              _renderKey:   Date.now()
            };
            this.messages = updated;
          } else {
            this.messages = [
              ...this.messages,
              {
                id:           e.message.id,
                from:         e.message.sender_type,
                content:      e.message.content,
                message_type: (e.message.message_type ?? (e.message.media_url ? 'image' : 'text')) as any,
                media_url:    e.message.media_url ?? null,
                mime_type:    e.message.mime_type ?? null,
                at:           e.message.created_at,
                agent_signature: e.message.agent_signature ?? null,
                is_forwarded: e.message.is_forwarded ?? false,
                pending:      false,
                _renderKey:   Date.now()
              }
            ];
          }

          this.scrollToBottom();
        });
      });
  }

  /* ── PREVIEW ────────────────────────────────────────────────── */
  openPreview(e: { url: string; type: 'image' | 'pdf' | 'office' }): void {
    this.previewUrl  = e.url;
    this.previewType = e.type;
    this.previewOpen = true;
  }

  closePreview(): void {
    this.previewOpen = false;
    this.previewUrl  = null;
    this.previewType = null;
  }

  /* ── SCROLL ─────────────────────────────────────────────────── */
  private scrollToBottom(): void {
    setTimeout(() => {
      if (this.messagesContainer) {
        this.messagesContainer.nativeElement.scrollTop =
          this.messagesContainer.nativeElement.scrollHeight;
      }
    }, 0);
  }

  /* ── CLEANUP ────────────────────────────────────────────────── */
  ngOnDestroy(): void {
    if (this.currentConversationId) {
      this.echoService.leave(`conversation.${this.currentConversationId}`);
    }
    this.mediaStream?.getTracks().forEach(t => t.stop());
    this.mediaStream = null;
    this.revokePreviewUrl();
  }

  private revokePreviewUrl(): void {
    if (this.previewUrl) URL.revokeObjectURL(this.previewUrl);
  }

  normalizeStatus(status: string): 'open' | 'in_progress' | 'closed' {
    return status === 'new' ? 'open' : status as any;
  }

  /* ── CARGA MENSAJES ─────────────────────────────────────────── */
  loadMessages(conversationId: number): void {
    this.loading = true;
    this.crmService.getMessages(conversationId).subscribe({
      next: res => {
        const payload = res.data;
        this.messages = (payload?.data ?? []).map((m: any) => ({
          id:             m.id,
          from:           m.sender_type,
          content:        m.content,
          message_type:   m.message_type ?? 'text',
          media_url:      m.media_url ?? null,
          mime_type:      m.mime_type,
          at:             m.created_at,
          agent_signature: m.agent_signature ?? null,
          is_forwarded:   !!m.is_forwarded,
          is_note:        !!m.is_note,
        }));

        this.headerData = {
          customerName:  payload?.conversation?.customer_name || 'Cliente',
          customerPhone: payload?.conversation?.phone || '',
          status:        this.normalizeStatus(payload?.conversation?.status),
          priority:      payload?.conversation?.priority || 'normal',
          online:        true,
          agentName:     payload?.conversation?.agent_name ?? null,
        };
        this.botPaused = !!payload?.conversation?.bot_paused;

        this.loading = false;
        this.scrollToBottom();
      },
      error: () => this.loading = false
    });
  }

  toggleBotPause(): void {
    if (!this.conversationId) return;
    this.crmService.setBotPaused(this.conversationId, !this.botPaused).subscribe({ next: res => this.botPaused = !!res.paused });
  }

  /* ── ATTACH MENU ────────────────────────────────────────────── */
  toggleAttachMenu(): void { this.showAttachMenu = !this.showAttachMenu; }
  closeAttachMenu(): void  { this.showAttachMenu = false; }

  openPicker(type: 'document' | 'media'): void {
    this.showAttachMenu = false;
    if (type === 'document') this.docInput.nativeElement.click();
    if (type === 'media')    this.mediaInput.nativeElement.click();
  }

  /* ── DRAG & DROP ────────────────────────────────────────────── */
  onDragOver(event: DragEvent): void  { event.preventDefault(); this.dragging = true; }
  onDragLeave(event: DragEvent): void { event.preventDefault(); this.dragging = false; }

  onDrop(event: DragEvent): void {
    event.preventDefault();
    this.dragging = false;
    if (!event.dataTransfer?.files.length) return;
    this.setFile(event.dataTransfer.files[0]);
  }

  /* ── FILE INPUT ─────────────────────────────────────────────── */
  onFileSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    if (!input.files?.length) return;
    this.setFile(input.files[0]);
    input.value = '';
  }

  setFile(file: File): void {
    this.fileToSend  = file;
    this.filePreview = file;
    this.revokePreviewUrl();
    this.previewType = this.detectMediaType(file);
    this.previewUrl  = URL.createObjectURL(file);
  }

  clearFile(): void {
    this.fileToSend  = null;
    this.filePreview = null;
    this.previewType = null;
    this.revokePreviewUrl();
    this.previewUrl  = null;
  }

  detectMediaType(file: File): 'image' | 'video' | 'audio' | 'document' {
    if (file.type.startsWith('image/')) return 'image';
    if (file.type.startsWith('video/')) return 'video';
    if (file.type.startsWith('audio/')) return 'audio';
    return 'document';
  }

  /* ── ENVÍO ──────────────────────────────────────────────────── */
  sendMessage(value: string): void {
    if (this.fileToSend) { this.sendMedia(); return; }

    const text = (value ?? '').trim();
    if (!text || this.sending || !this.conversationId) return;

    this.sending = true;
    this.draftMessage = '';

    const tempId = Date.now();
    this.messages.push({
      id: tempId, from: 'agent', content: text,
      message_type: 'text', media_url: null,
      at: new Date().toISOString(), pending: true
    });
    this.scrollToBottom();

    this.crmService.sendMessage(this.conversationId, { message: text, type: 'text' })
      .subscribe({ next: () => this.sending = false, error: () => this.sending = false });
  }

  sendMedia(): void {
    if (!this.fileToSend || !this.conversationId || this.sending) return;

    const file = this.fileToSend;
    const type = this.detectMediaType(file);

    this.messages.push({
      id: Date.now(), from: 'agent', content: file.name,
      message_type: type, media_url: null,
      at: new Date().toISOString(), pending: true
    });
    this.scrollToBottom();
    this.sending = true;

    const formData = new FormData();
    formData.append('file', file);
    formData.append('type', type);

    this.crmService.sendMedia(this.conversationId, formData)
      .subscribe({
        next:  () => { this.clearFile(); this.sending = false; },
        error: () => this.sending = false
      });
  }

  /* ── STICKERS ───────────────────────────────────────────────── */
  loadStickers(): void {
    this.crmService.getStickers().subscribe({ next: res => this.stickers = res.data ?? [] });
  }

  toggleStickerPicker(): void {
    this.showStickerPicker = !this.showStickerPicker;
    this.showAttachMenu    = false;
  }

  sendSticker(sticker: any): void {
    if (!this.conversationId || this.sending) return;

    this.showStickerPicker = false;
    this.sending = true;

    this.messages.push({
      id: Date.now(), from: 'agent', content: null,
      message_type: 'sticker', media_url: sticker.media_url,
      at: new Date().toISOString(), pending: true
    });
    this.scrollToBottom();

    // Enviar como imagen al backend (WhatsApp acepta stickers como imagen webp)
    const formData = new FormData();
    formData.append('sticker_url', sticker.media_url);
    formData.append('type', 'sticker');

    this.crmService.sendMessage(this.conversationId, {
      message: sticker.media_url,
      type: 'sticker'
    }).subscribe({
      next:  () => this.sending = false,
      error: () => this.sending = false
    });
  }

  saveStickerFromMessage(mediaUrl: string): void {
    if (!mediaUrl) return;
    this.crmService.saveSticker(mediaUrl, 'Sticker guardado').subscribe({
      next: res => {
        this.stickers.push(res.data);
        alert('✅ Sticker guardado en tu colección');
      }
    });
  }

  /* ── REENVIAR ───────────────────────────────────────────────── */
  onForwardMessage(msg: ChatMessage): void {
    this.forwardingMessage = msg;
    this.forwardTargets    = [];
    // Cargar conversaciones disponibles
    this.crmService.getInbox({ status: 'in_progress' }).subscribe({
      next: res => this.allConversations = (res.data ?? []).filter((c: any) => c.id !== this.conversationId)
    });
  }

  toggleForwardTarget(id: number): void {
    const idx = this.forwardTargets.indexOf(id);
    if (idx === -1) this.forwardTargets.push(id);
    else this.forwardTargets.splice(idx, 1);
  }

  submitForward(): void {
    if (!this.forwardingMessage || !this.forwardTargets.length) return;

    this.crmService.forwardMessage(this.forwardingMessage.id, this.forwardTargets)
      .subscribe(() => {
        this.forwardingMessage = null;
        this.forwardTargets    = [];
      });
  }

  /* ── AUDIO ──────────────────────────────────────────────────── */
  async startRecording(): Promise<void> {
    if (this.isRecording || this.sending) return;
    this.clearFile();

    try {
      this.mediaStream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const stream = this.mediaStream;
      this.audioChunks = [];

      const formats = [
        { mime: 'audio/ogg; codecs=opus', ext: 'ogg' },
        { mime: 'audio/ogg', ext: 'ogg' },
        { mime: 'audio/webm; codecs=opus', ext: 'webm' },
        { mime: 'audio/webm', ext: 'webm' },
        { mime: 'audio/mp4', ext: 'm4a' },
      ];

      const supported = formats.filter(f => MediaRecorder.isTypeSupported(f.mime));
      let selectedFormat = supported[0] ?? { mime: '', ext: 'webm' };

      this.mediaRecorder = selectedFormat.mime
        ? new MediaRecorder(stream, { mimeType: selectedFormat.mime, audioBitsPerSecond: 128000 })
        : new MediaRecorder(stream);

      selectedFormat = {
        mime: this.mediaRecorder.mimeType || 'audio/webm',
        ext:  this.mediaRecorder.mimeType?.includes('ogg') ? 'ogg' : 'webm'
      };

      this.mediaRecorder.ondataavailable = e => {
        if (e.data.size > 0) this.audioChunks.push(e.data);
      };

      this.mediaRecorder.onstop = () => {
        this.zone.run(() => {
          clearInterval(this.recordTimer);
          const blob = new Blob(this.audioChunks, { type: selectedFormat.mime });
          this.recordedAudioFile = new File([blob], `voice_${Date.now()}.${selectedFormat.ext}`, { type: selectedFormat.mime });
          this.audioPreviewUrl   = URL.createObjectURL(blob);
          this.isRecording       = false;
          this.isProcessingAudio = false;
          this.mediaStream?.getTracks().forEach(t => t.stop());
          this.mediaStream = null;
        });
      };

      this.mediaRecorder.start();
      this.isRecording    = true;
      this.recordSeconds  = 0;
      this.recordTimer    = setInterval(() => {
        this.zone.run(() => {
          this.recordSeconds++;
          if (this.recordSeconds >= 300) this.stopRecording();
        });
      }, 1000);

    } catch (error: any) {
      this.zone.run(() => {
        alert(error.name === 'NotAllowedError'
          ? 'Permiso de micrófono denegado.'
          : 'No se pudo acceder al micrófono.');
        this.mediaStream?.getTracks().forEach(t => t.stop());
        this.mediaStream = null;
      });
    }
  }

  stopRecording(): void {
    if (!this.mediaRecorder || this.mediaRecorder.state === 'inactive') return;
    this.isProcessingAudio = true;
    this.mediaRecorder.stop();
  }

  async sendRecordedAudio(): Promise<void> {
    if (!this.conversationId || !this.recordedAudioFile || this.sending) return;

    this.sending = true;
    this.messages.push({
      id: Date.now(), from: 'agent', content: 'Audio',
      message_type: 'audio', media_url: null,
      at: new Date().toISOString(), pending: true
    });

    const formData = new FormData();
    formData.append('file', this.recordedAudioFile);
    formData.append('type', 'audio');

    this.crmService.sendMedia(this.conversationId, formData).subscribe({
      next:  () => { this.cancelAudio(); this.sending = false; },
      error: () => this.sending = false
    });
  }

  cancelAudio(): void {
    this.mediaStream?.getTracks().forEach(t => t.stop());
    this.mediaStream = null;
    this.zone.run(() => this.resetAudioState());
  }

  private resetAudioState(): void {
    if (this.audioPreviewUrl) URL.revokeObjectURL(this.audioPreviewUrl);
    this.audioPreviewUrl   = null;
    this.recordedAudioFile = null;
    this.audioChunks       = [];
    this.recordSeconds     = 0;
    this.isRecording       = false;
  }

  /* ── AUTO RESIZE TEXTAREA ───────────────────────────────────── */
  autoResize(textarea: HTMLTextAreaElement): void {
    textarea.style.height = 'auto';
    textarea.style.height = textarea.scrollHeight + 'px';
  }

  handleKeydown(event: KeyboardEvent): void {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      this.sendMessage(this.draftMessage);
    }
  }

  /* ── CERRAR CONVERSACIÓN ────────────────────────────────────── */
  finishConversation(): void {
    if (!this.conversationId) return;
    if (!confirm('¿Finalizar conversación?')) return;

    this.crmService.closeConversation(this.conversationId).subscribe(() => {
      this.messages = [];
      this.conversationClosed.emit();
    });
  }

  /* ── INFO PANEL ─────────────────────────────────────────────── */
  toggleInfoPanel(): void { this.showInfoPanel = !this.showInfoPanel; }

  onPriorityChanged(p: 'low' | 'normal' | 'high'): void {
    if (this.headerData) this.headerData.priority = p;
  }
}
