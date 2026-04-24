export interface InboxResponse {
  ok: boolean;
  data: ConversationInbox[];
}

export type MessageType =
  | 'text'
  | 'image'
  | 'video'
  | 'audio'
  | 'document'
  | 'sticker'
  | 'location'
  | 'contact'
  | 'reaction';

export interface ConversationInbox {
  id: number;
  status: string;
  priority: string;
  assigned_user_id: number | null;
  assigned_user?: { names: string; lastname: string } | null;

  customer: {
    id: number;
    name: string;
    phone: string;
  };

  last_message: {
    content: string | null;
    type: MessageType;
    media_url?: string | null;
    at: string;
  } | null;

  unread_count?: number;
  created_at: string;
}

export interface NewMessageEventPayload {
  conversationId: number;
  message: {
    id: number;
    conversation_id: number;
    content: string | null;
    sender_type: 'customer' | 'agent';
    message_type: MessageType;
    media_url?: string | null;
    mime_type?: string | null;
    agent_signature?: string | null;
    is_forwarded?: boolean;
    created_at: string;
  };
}
