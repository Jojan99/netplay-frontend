export interface TicketInterface {
  id?: number;
  client?: number;
  user_id?: number;
  address?: string;
  name?: string;
  last_name?: string;
  tech_names?: string;
  tech_lastname?: string;
  technical_id?: number;
  date?: string;
  type_service?: number;
  service_id?: number;
  name_service?: string;
  priority?: number;
  priority_id?: number;
  name_priority?: string;
  status?: number;
  status_id?: number;
  name_status?: string;
  tecnichal?: number;
  created_at?: string;
  started_at?: string;
  finished_at?: string;
  closed_at?: string;
  reopened_count?: number;
  observation?: string;
  prioritys?: string;
  cedula?: string;
  phone?: string;
  isMenuOpen?: boolean;
  showDetails?: boolean;
  expanded?: boolean;
  elapsedSeconds?: number;
  timerRef?: any;
}

export interface TicketNote {
  id?: number;
  ticket_id?: number;
  user_id?: number;
  note?: string;
  photos?: string[];
  audio_path?: string;
  author_names?: string;
  author_lastname?: string;
  created_at?: string;
}

export interface TicketStats {
  total: number;
  in_progress: number;
  closed_today: number;
  reopen_pct: number;
  top_technicians: { technical_id: number; names: string; lastname: string; count: number }[];
  top_clients: { user_id: number; names: string; lastname: string; count: number }[];
}
