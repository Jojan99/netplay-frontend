import { HttpClient, HttpHeaders, HttpParams } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { environment } from '../../environments/environment';

@Injectable({ providedIn: 'root' })
export class CrmService {

  env = environment;

  constructor(private http: HttpClient) {}

  /* =====================
     HEADERS
  ====================== */
  getHeaders(json: boolean = true): HttpHeaders {
    const headers: any = {
      'Authorization': `Bearer ${this.getAuthToken()}`
    };
    if (json) {
      headers['Content-Type'] = 'application/json';
    }
    return new HttpHeaders(headers);
  }

  getAuthToken(): string | null {
    return localStorage.getItem('token');
  }

  private apiUrl(path: string): string {
    return `${this.env.rootUrl}api/management/${path}`;
  }

  /* =====================
     INBOX
  ====================== */
  getInbox(filters?: { mine?: boolean; status?: string; search?: string }) {
    let params = new HttpParams();
    if (filters) {
      Object.entries(filters).forEach(([k, v]) => {
        if (v !== undefined && v !== null && v !== '') params = params.set(k, v as any);
      });
    }
    return this.http.get<any>(this.apiUrl('inbox'), { params, headers: this.getHeaders() });
  }

  /* =====================
     MENSAJES
  ====================== */
  getMessages(conversationId: number) {
    return this.http.get<any>(this.apiUrl(`conversations/${conversationId}/messages`), {
      headers: this.getHeaders()
    });
  }

  sendMessage(conversationId: number, payload: { message: string; type?: string }) {
    return this.http.post<any>(this.apiUrl(`conversations/${conversationId}/messages`), payload, {
      headers: this.getHeaders()
    });
  }

  sendMedia(conversationId: number, data: FormData) {
    return this.http.post<any>(this.apiUrl(`conversations/${conversationId}/media`), data, {
      headers: this.getHeaders(false)
    });
  }

  /* =====================
     ACCIONES CONVERSACIÓN
  ====================== */
  closeConversation(conversationId: number) {
    return this.http.post<any>(this.apiUrl(`conversations/${conversationId}/close`), {}, {
      headers: this.getHeaders()
    });
  }

  updatePriority(conversationId: number, priority: 'low' | 'normal' | 'high') {
    return this.http.patch<any>(this.apiUrl(`conversations/${conversationId}/priority`), { priority }, {
      headers: this.getHeaders()
    });
  }

  getServiceStatus(conversationId: number) {
    return this.http.get<any>(this.apiUrl(`conversations/${conversationId}/service-status`), {
      headers: this.getHeaders()
    });
  }

  createConversation(phone: string, name: string) {
    return this.http.post<any>(this.apiUrl('conversations'), { phone, name }, {
      headers: this.getHeaders()
    });
  }

  forwardMessage(sourceMessageId: number, targetConversationIds: number[]) {
    return this.http.post<any>(this.apiUrl('messages/forward'), {
      source_message_id: sourceMessageId,
      target_conversation_ids: targetConversationIds
    }, { headers: this.getHeaders() });
  }

  /* =====================
     AGENTES / TRANSFER
  ====================== */
  getAgents() {
    return this.http.get<any>(this.apiUrl('agents'), { headers: this.getHeaders() });
  }

  transferConversation(conversationId: number, toUserId: number, reason?: string) {
    return this.http.post<any>(this.apiUrl(`conversations/${conversationId}/transfer`), {
      to_user_id: toUserId,
      reason: reason ?? null
    }, { headers: this.getHeaders() });
  }

  /* =====================
     NOTAS
  ====================== */
  getNotes(conversationId: number) {
    return this.http.get<any>(this.apiUrl(`conversations/${conversationId}/notes`), {
      headers: this.getHeaders()
    });
  }

  addNote(conversationId: number, content: string) {
    return this.http.post<any>(this.apiUrl(`conversations/${conversationId}/notes`), { content }, {
      headers: this.getHeaders()
    });
  }

  deleteNote(noteId: number) {
    return this.http.delete<any>(this.apiUrl(`notes/${noteId}`), { headers: this.getHeaders() });
  }

  /* =====================
     ETIQUETAS
  ====================== */
  getLabels() {
    return this.http.get<any>(this.apiUrl('labels'), { headers: this.getHeaders() });
  }

  createLabel(name: string, color: string) {
    return this.http.post<any>(this.apiUrl('labels'), { name, color }, { headers: this.getHeaders() });
  }

  deleteLabel(labelId: number) {
    return this.http.delete<any>(this.apiUrl(`labels/${labelId}`), { headers: this.getHeaders() });
  }

  getConversationLabels(conversationId: number) {
    return this.http.get<any>(this.apiUrl(`conversations/${conversationId}/labels`), {
      headers: this.getHeaders()
    });
  }

  addConversationLabel(conversationId: number, labelId: number) {
    return this.http.post<any>(this.apiUrl(`conversations/${conversationId}/labels`), { label_id: labelId }, {
      headers: this.getHeaders()
    });
  }

  removeConversationLabel(conversationId: number, labelId: number) {
    return this.http.delete<any>(this.apiUrl(`conversations/${conversationId}/labels/${labelId}`), {
      headers: this.getHeaders()
    });
  }

  /* =====================
     DASHBOARD
  ====================== */
  getDashboard() {
    return this.http.get<any>(this.apiUrl('crm/dashboard'), { headers: this.getHeaders() });
  }

  /* =====================
     BROADCAST
  ====================== */
  getBroadcastCustomers() {
    return this.http.get<any>(this.apiUrl('crm/broadcast/customers'), { headers: this.getHeaders() });
  }

  sendBroadcast(message: string, customerIds: number[]) {
    return this.http.post<any>(this.apiUrl('crm/broadcast'), {
      message, customer_ids: customerIds
    }, { headers: this.getHeaders() });
  }

  /* =====================
     STICKERS
  ====================== */
  getStickers() {
    return this.http.get<any>(this.apiUrl('stickers'), { headers: this.getHeaders() });
  }

  saveSticker(mediaUrl: string, name?: string) {
    return this.http.post<any>(this.apiUrl('stickers'), { media_url: mediaUrl, name }, {
      headers: this.getHeaders()
    });
  }

  deleteSticker(stickerId: number) {
    return this.http.delete<any>(this.apiUrl(`stickers/${stickerId}`), { headers: this.getHeaders() });
  }

  /* =====================
     TICKET DESDE CRM
  ====================== */
  getTicketMeta() {
    return this.http.get<any>(this.apiUrl('crm/ticket-meta'), { headers: this.getHeaders() });
  }

  createTicketFromConversation(conversationId: number, data: {
    observation: string;
    type_service: number;
    priority: number;
    tecnichal: number;
    address?: string;
    cedula?: string;
    phone?: string;
  }) {
    return this.http.post<any>(this.apiUrl(`conversations/${conversationId}/ticket`), data, {
      headers: this.getHeaders()
    });
  }

  updateCustomerName(conversationId: number, name: string) {
    return this.http.patch<any>(this.apiUrl(`conversations/${conversationId}/customer`), { name }, {
      headers: this.getHeaders()
    });
  }

  /* =====================
     FACTURAS (buscar para enviar)
  ====================== */
  getInvoicesByPhone(phone: string) {
    return this.http.get<any>(`${this.env.rootUrl}api/facturation/by-phone/${phone}`, {
      headers: this.getHeaders()
    });
  }
}
