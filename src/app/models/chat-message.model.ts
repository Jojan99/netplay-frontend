export type MessageType = 'text' | 'image' | 'video' | 'audio' | 'document';

export interface ChatMessage {
  id: number;
  from: 'customer' | 'agent';
  content: string | null;
  message_type: MessageType;
  media_url?: string | null;
  at: string;
  pending?: boolean;
  _renderKey?: number;
  mime_type?: string | null; // 🔥 AGREGAR
}
