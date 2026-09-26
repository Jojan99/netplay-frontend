/**
 * Lo que es un flujo de bot, y qué puede hacer cada bloque.
 *
 * Vive aparte del componente porque lo comparten el lienzo, el inspector y el
 * probador, y porque los límites de Meta —3 botones, 10 filas, cuántos
 * caracteres entran— son reglas del producto, no detalles de una pantalla.
 */

export type TipoBloque =
  | 'message' | 'buttons' | 'list' | 'input' | 'cliente'
  | 'api_call' | 'condition' | 'delay' | 'image' | 'document'
  | 'link' | 'goto' | 'transfer_agent' | 'end';

/** Botón de respuesta rápida de Meta. */
export interface BotonBloque {
  id: string;
  title: string;
  /** A qué bloque va quien lo toca. */
  next_step?: string | null;
}

/** Fila de una lista desplegable de Meta. */
export interface FilaBloque {
  id: string;
  title: string;
  description?: string;
  next_step?: string | null;
}

export interface SeccionBloque {
  title: string;
  rows: FilaBloque[];
}

export interface ParClaveValor { key: string; value: string; }

export interface Bloque {
  id: string;
  type: TipoBloque;
  x: number;
  y: number;
  /** Marcado a mano como arranque del flujo. */
  is_start?: boolean;

  message?: string;
  header?: string;

  // Botones y listas
  buttons?: BotonBloque[];
  sections?: SeccionBloque[];
  button_text?: string;
  error_message?: string;

  // Pedir un dato
  variable_name?: string;
  input_type?: 'text' | 'number' | 'email' | 'phone' | 'date';
  validation_message?: string;

  // Buscar al cliente en la plataforma
  lookup_by?: 'phone' | 'dni';
  lookup_value?: string;

  // Petición HTTP
  endpoint?: string;
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH';
  params?: ParClaveValor[];
  headers?: ParClaveValor[];
  response_path?: string;
  save_response_to?: string;

  // Condición
  condition_variable?: string;
  condition_operator?: 'eq' | 'neq' | 'contains' | 'empty' | 'not_empty' | 'gt' | 'lt';
  condition_value?: string;

  delay_seconds?: number;

  media_url?: string;
  media_caption?: string;
  media_name?: string;

  url?: string;

  agent_department?: string;

  /** «Ir a otro flujo»: con qué flujo sigue la conversación. */
  flow_id?: string;

  // Rutas
  next_step?: string | null;
  true_step?: string | null;
  false_step?: string | null;
  error_step?: string | null;
}

export interface Flujo {
  id: string;
  name: string;
  description?: string;
  is_active?: boolean;
  steps: Bloque[];
}

export interface OpcionDeMenu {
  id: string;
  key?: string;
  label: string;
  description?: string;
  flow_id: string;
}

export interface ConfigBot {
  enabled: boolean;
  trigger_word: string;
  welcome_message: string;
  menu_type: 'text' | 'buttons' | 'list';
  menu_title: string;
  options: OpcionDeMenu[];
  flows: Flujo[];
  variables: { name: string; type: string; default_value?: string }[];
  settings: { fallback_message: string; max_retries: number; session_timeout_minutes: number };
}

/** Los límites de Meta, en un solo lugar. */
export const META = {
  MAX_BOTONES: 3,
  LARGO_BOTON: 20,
  MAX_FILAS: 10,
  LARGO_TITULO_FILA: 24,
  LARGO_DESC_FILA: 72,
  LARGO_CUERPO: 1024,
} as const;

export interface FichaBloque {
  label: string;
  /** Trazo SVG: los emojis se ven distintos en cada sistema y no siguen el color. */
  trazo: string;
  tono: 'verde' | 'azul' | 'violeta' | 'ambar' | 'gris' | 'rosa' | 'turquesa';
  /** Para qué sirve, en una línea. */
  para: string;
  /** Si el bloque se queda esperando que el cliente conteste. */
  espera?: boolean;
}

export const FICHAS: Record<TipoBloque, FichaBloque> = {
  message: {
    label: 'Mensaje', tono: 'verde', para: 'Le dice algo al cliente y sigue.',
    trazo: 'M21 11.5a8.4 8.4 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.4 8.4 0 0 1-3.8-.9L3 21l1.9-5.7a8.4 8.4 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.4 8.4 0 0 1 3.8-.9h.5a8.5 8.5 0 0 1 8 8v.5Z',
  },
  buttons: {
    label: 'Botones', tono: 'azul', espera: true, para: 'Hasta 3 botones; cada uno abre su camino.',
    trazo: 'M4 6h16v5H4zM4 15h7v4H4zM13 15h7v4h-7z',
  },
  list: {
    label: 'Lista', tono: 'azul', espera: true, para: 'Hasta 10 opciones en un desplegable.',
    trazo: 'M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01',
  },
  input: {
    label: 'Pedir dato', tono: 'azul', espera: true, para: 'Pregunta algo y lo guarda en una variable.',
    trazo: 'M4 7h16v10H4zM8 12h8M12 9v6',
  },
  cliente: {
    label: 'Buscar cliente', tono: 'turquesa', para: 'Carga nombre, dirección y saldo desde la plataforma.',
    trazo: 'M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2M12 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8Z',
  },
  api_call: {
    label: 'Petición', tono: 'violeta', para: 'Consulta otro sistema y guarda la respuesta.',
    trazo: 'M13 2 3 14h9l-1 8 10-12h-9l1-8Z',
  },
  condition: {
    label: 'Condición', tono: 'ambar', para: 'Parte el camino según una variable.',
    trazo: 'M6 3v12M6 15a3 3 0 1 0 0 6 3 3 0 0 0 0-6ZM18 9a3 3 0 1 0 0-6 3 3 0 0 0 0 6ZM18 6h-4a4 4 0 0 0-4 4v1',
  },
  delay: {
    label: 'Esperar', tono: 'gris', para: 'Pausa corta para que no lleguen pegados.',
    trazo: 'M12 8v4l3 2M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Z',
  },
  image: {
    label: 'Imagen', tono: 'rosa', para: 'Manda una imagen por su dirección.',
    trazo: 'M3 5h18v14H3zM3 16l5-5 4 4 3-3 6 6M9 9.5a1 1 0 1 0 0-2 1 1 0 0 0 0 2Z',
  },
  document: {
    label: 'Documento', tono: 'rosa', para: 'Manda un PDF u otro archivo.',
    trazo: 'M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8l-5-5ZM14 3v5h5',
  },
  link: {
    label: 'Botón con enlace', tono: 'violeta', para: 'Abre una dirección dentro de WhatsApp.',
    trazo: 'M10 13a5 5 0 0 0 7 0l2-2a5 5 0 0 0-7-7l-1 1M14 11a5 5 0 0 0-7 0l-2 2a5 5 0 0 0 7 7l1-1',
  },
  goto: {
    label: 'Ir a otro flujo', tono: 'violeta', para: 'Sigue en otro flujo, para armar el bot por piezas.',
    trazo: 'M4 12h13M13 6l6 6-6 6M20 4v16',
  },
  transfer_agent: {
    label: 'Pasar a un agente', tono: 'turquesa', para: 'Calla al bot y avisa a una persona.',
    trazo: 'M17 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9.5 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8ZM17 4h5M19.5 1.5v5',
  },
  end: {
    label: 'Terminar', tono: 'gris', para: 'Cierra la conversación.',
    trazo: 'M9 12l2 2 4-4M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Z',
  },
};

/** El orden en que se ofrecen; primero lo que más se usa. */
export const PALETA: TipoBloque[] = [
  'message', 'buttons', 'list', 'input', 'cliente',
  'condition', 'api_call', 'link', 'goto', 'image', 'document',
  'delay', 'transfer_agent', 'end',
];

export function nuevoId(prefijo: string): string {
  return `${prefijo}_${Math.random().toString(36).slice(2, 9)}`;
}

/** Un bloque recién puesto, ya usable: nada que quede en blanco y falle. */
export function nuevoBloque(type: TipoBloque, x = 80, y = 80): Bloque {
  const b: Bloque = { id: nuevoId('b'), type, x, y };

  switch (type) {
    case 'message':
      b.message = 'Escriba aquí lo que le dice al cliente.';
      break;
    case 'buttons':
      b.message = '¿Qué necesita?';
      b.variable_name = 'eleccion';
      b.buttons = [
        { id: 'op1', title: 'Opción 1', next_step: null },
        { id: 'op2', title: 'Opción 2', next_step: null },
      ];
      b.error_message = 'No entendí esa opción. Toque uno de los botones, por favor.';
      break;
    case 'list':
      b.message = 'Seleccione una opción de la lista.';
      b.button_text = 'Ver opciones';
      b.variable_name = 'eleccion';
      b.sections = [{ title: 'Opciones', rows: [
        { id: 'f1', title: 'Primera opción', description: '', next_step: null },
        { id: 'f2', title: 'Segunda opción', description: '', next_step: null },
      ] }];
      b.error_message = 'No encontré esa opción. Abra la lista y seleccione una.';
      break;
    case 'input':
      b.message = '¿Me pasa su número de cédula?';
      b.variable_name = 'cedula';
      b.input_type = 'number';
      b.validation_message = 'Necesito sólo números, sin puntos ni espacios.';
      break;
    case 'cliente':
      b.lookup_by = 'dni';
      b.lookup_value = '{{cedula}}';
      b.error_message = 'No encontré esa cédula en nuestros registros.';
      break;
    case 'api_call':
      b.method = 'GET';
      b.endpoint = 'https://';
      b.params = [];
      b.headers = [];
      b.save_response_to = 'respuesta';
      b.error_message = 'No pude consultar esa información ahora. Pruebe en un rato.';
      break;
    case 'condition':
      b.condition_variable = 'saldo';
      b.condition_operator = 'gt';
      b.condition_value = '0';
      break;
    case 'delay':
      b.delay_seconds = 2;
      break;
    case 'image':
    case 'document':
      b.media_url = 'https://';
      b.media_caption = '';
      if (type === 'document') b.media_name = 'archivo.pdf';
      break;
    case 'link':
      b.message = 'Puede pagar desde aquí:';
      b.url = 'https://';
      b.button_text = 'Pagar ahora';
      break;
    case 'goto':
      b.flow_id = '';
      break;
    case 'transfer_agent':
      b.agent_department = 'soporte';
      b.message = 'Le paso con una persona del equipo. Ya le escribe.';
      break;
    case 'end':
      b.message = 'Gracias por escribirnos. Escriba *menu* cuando quieras volver.';
      break;
  }

  return b;
}

/** Un flujo nuevo que ya se puede probar: saluda, ofrece y cierra. */
export function nuevoFlujo(nombre = 'Flujo nuevo'): Flujo {
  const saludo = nuevoBloque('message', 60, 40);
  const fin = nuevoBloque('end', 60, 260);
  saludo.next_step = fin.id;
  saludo.is_start = true;

  return { id: nuevoId('flujo'), name: nombre, description: '', is_active: true, steps: [saludo, fin] };
}
