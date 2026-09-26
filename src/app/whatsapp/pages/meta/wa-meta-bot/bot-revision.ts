import { Bloque, Flujo, META, FICHAS } from './bot-modelo';

/**
 * Lo que está mal en un flujo, antes de que lo descubra un cliente.
 *
 * Un flujo roto no se nota al dibujarlo: se nota cuando alguien escribe por
 * WhatsApp y el bot se queda mudo porque un botón no llevaba a ninguna parte.
 * Aquí se revisa lo que de verdad rompe la conversación y lo que Meta rechaza.
 */

export interface Aviso {
  nivel: 'error' | 'aviso';
  /** El bloque al que se refiere, para poder ir a arreglarlo. */
  bloque?: string;
  texto: string;
}

/** A qué bloques apunta alguien. */
function apuntados(pasos: Bloque[]): Set<string> {
  const vistos = new Set<string>();

  for (const b of pasos) {
    for (const campo of ['next_step', 'true_step', 'false_step', 'error_step'] as const) {
      const v = b[campo];
      if (v) vistos.add(String(v));
    }
    for (const x of b.buttons ?? []) if (x.next_step) vistos.add(String(x.next_step));
    for (const s of b.sections ?? []) for (const f of s.rows ?? []) if (f.next_step) vistos.add(String(f.next_step));
  }

  return vistos;
}

/** Por dónde arranca el flujo: el marcado, o el único al que nadie apunta. */
export function bloqueDeArranque(flujo: Flujo): Bloque | null {
  const marcado = flujo.steps.find(b => b.is_start);
  if (marcado) return marcado;

  const llegan = apuntados(flujo.steps);
  return flujo.steps.find(b => !llegan.has(b.id)) ?? flujo.steps[0] ?? null;
}

export function revisar(flujo: Flujo): Aviso[] {
  const avisos: Aviso[] = [];
  const pasos = flujo.steps ?? [];

  if (!pasos.length) {
    return [{ nivel: 'error', texto: 'El flujo no tiene bloques: el bot no tendría nada que decir.' }];
  }

  const porId = new Map(pasos.map(b => [b.id, b]));
  const llegan = apuntados(pasos);
  const arranque = bloqueDeArranque(flujo);

  // Bloques a los que nunca se llega: trabajo dibujado que nadie va a ver.
  for (const b of pasos) {
    if (b.id !== arranque?.id && !llegan.has(b.id)) {
      avisos.push({ nivel: 'aviso', bloque: b.id, texto: `«${FICHAS[b.type].label}» quedó suelto: ningún bloque lleva a él.` });
    }
  }

  for (const b of pasos) {
    const nombre = FICHAS[b.type]?.label ?? b.type;

    // Rutas que apuntan a un bloque borrado.
    for (const [campo, etiqueta] of [['next_step', 'la salida'], ['true_step', 'la rama «sí»'], ['false_step', 'la rama «no»'], ['error_step', 'la rama de error']] as const) {
      const v = (b as any)[campo];
      if (v && !porId.has(String(v))) {
        avisos.push({ nivel: 'error', bloque: b.id, texto: `En «${nombre}», ${etiqueta} apunta a un bloque que ya no existe.` });
      }
    }

    if (b.type === 'buttons') {
      const bts = b.buttons ?? [];

      if (!bts.length) {
        avisos.push({ nivel: 'error', bloque: b.id, texto: 'El bloque de botones no tiene ninguno.' });
      }
      if (bts.length > META.MAX_BOTONES) {
        avisos.push({ nivel: 'error', bloque: b.id, texto: `WhatsApp admite ${META.MAX_BOTONES} botones como máximo; hay ${bts.length}. Use una lista.` });
      }
      bts.forEach((x, i) => {
        if (!x.title?.trim()) avisos.push({ nivel: 'error', bloque: b.id, texto: `El botón ${i + 1} no tiene texto.` });
        if ((x.title ?? '').length > META.LARGO_BOTON) {
          avisos.push({ nivel: 'aviso', bloque: b.id, texto: `El botón «${x.title}» se va a cortar: WhatsApp muestra ${META.LARGO_BOTON} caracteres.` });
        }
        if (!x.next_step) avisos.push({ nivel: 'aviso', bloque: b.id, texto: `El botón «${x.title || i + 1}» no lleva a ningún bloque: ahí se corta la conversación.` });
      });
    }

    if (b.type === 'list') {
      const filas = (b.sections ?? []).flatMap(s => s.rows ?? []);

      if (!filas.length) {
        avisos.push({ nivel: 'error', bloque: b.id, texto: 'La lista no tiene opciones.' });
      }
      if (filas.length > META.MAX_FILAS) {
        avisos.push({ nivel: 'error', bloque: b.id, texto: `WhatsApp admite ${META.MAX_FILAS} opciones en una lista; hay ${filas.length}.` });
      }
      filas.forEach((f, i) => {
        if (!f.title?.trim()) avisos.push({ nivel: 'error', bloque: b.id, texto: `La opción ${i + 1} de la lista no tiene título.` });
        if ((f.title ?? '').length > META.LARGO_TITULO_FILA) {
          avisos.push({ nivel: 'aviso', bloque: b.id, texto: `«${f.title}» se va a cortar: los títulos de lista son de ${META.LARGO_TITULO_FILA} caracteres.` });
        }
        if (!f.next_step) avisos.push({ nivel: 'aviso', bloque: b.id, texto: `La opción «${f.title || i + 1}» no lleva a ningún bloque.` });
      });
    }

    if (b.type === 'input' && !b.variable_name?.trim()) {
      avisos.push({ nivel: 'error', bloque: b.id, texto: 'Falta decir en qué variable se guarda la respuesta.' });
    }

    if (b.type === 'api_call' && !/^https?:\/\/.+/i.test(b.endpoint ?? '')) {
      avisos.push({ nivel: 'error', bloque: b.id, texto: 'La petición necesita una dirección que empiece con http:// o https://' });
    }

    if (b.type === 'condition' && !b.condition_variable?.trim()) {
      avisos.push({ nivel: 'error', bloque: b.id, texto: 'La condición no dice qué variable comparar.' });
    }

    if ((b.type === 'image' || b.type === 'document') && !/^https?:\/\/.+/i.test(b.media_url ?? '')) {
      avisos.push({ nivel: 'error', bloque: b.id, texto: `«${nombre}» necesita una dirección pública del archivo.` });
    }

    if (b.type === 'goto' && !b.flow_id) {
      avisos.push({ nivel: 'error', bloque: b.id, texto: 'No dice a qué flujo hay que ir.' });
    }

    if (b.type === 'link' && !/^https?:\/\/.+/i.test(b.url ?? '')) {
      avisos.push({ nivel: 'error', bloque: b.id, texto: 'El botón con enlace necesita una dirección válida.' });
    }

    if ((b.message ?? '').length > META.LARGO_CUERPO) {
      avisos.push({ nivel: 'aviso', bloque: b.id, texto: `El texto de «${nombre}» pasa de ${META.LARGO_CUERPO} caracteres y se va a cortar.` });
    }

    // Un bloque que no espera nada y no tiene salida deja la charla colgada.
    const cierra = b.type === 'end' || b.type === 'transfer_agent' || b.type === 'goto';
    const decide = b.type === 'condition';
    const espera = FICHAS[b.type]?.espera;

    if (!cierra && !decide && !espera && !b.next_step) {
      avisos.push({ nivel: 'aviso', bloque: b.id, texto: `«${nombre}» no tiene salida: la conversación termina ahí sin despedirse.` });
    }
  }

  if (!pasos.some(b => b.type === 'end' || b.type === 'transfer_agent')) {
    avisos.push({ nivel: 'aviso', texto: 'El flujo no tiene un bloque que lo cierre («Terminar» o «Pasar a un agente»).' });
  }

  return avisos;
}

/** Las variables que el flujo deja disponibles para escribir {{asi}}. */
export function variablesDisponibles(flujos: Flujo[]): string[] {
  const set = new Set<string>([
    'telefono', 'empresa', 'nombre', 'cedula', 'direccion',
    'cliente_id', 'saldo', 'saldo_texto', 'facturas_pendientes', 'error',
  ]);

  for (const f of flujos) {
    for (const b of f.steps ?? []) {
      if (b.variable_name?.trim()) set.add(b.variable_name.trim());
      if (b.save_response_to?.trim()) set.add(b.save_response_to.trim());
    }
  }

  return [...set];
}
