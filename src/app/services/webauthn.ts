/**
 * La conversación con el navegador para crear y usar passkeys.
 *
 * WebAuthn habla en `ArrayBuffer` y el servidor en base64url, así que todo lo
 * que cruza hay que traducirlo. Está aquí, en un solo lugar, porque
 * equivocarse en una de esas conversiones da un error críptico del navegador
 * que no dice nada útil.
 */

/** ¿Este navegador puede usar passkeys? */
export function hayPasskeys(): boolean {
  return typeof window !== 'undefined'
    && typeof (window as any).PublicKeyCredential === 'function'
    && !!navigator.credentials;
}

/**
 * ¿Hay alguna passkey usable en este dispositivo?
 *
 * Sirve para no ofrecer el botón en una computadora donde no hay ninguna: es
 * peor un botón que siempre falla que no tenerlo.
 */
export async function hayAlgunaGuardada(): Promise<boolean> {
  if (!hayPasskeys()) return false;

  try {
    const pk: any = (window as any).PublicKeyCredential;
    if (typeof pk.isUserVerifyingPlatformAuthenticatorAvailable !== 'function') return true;
    return await pk.isUserVerifyingPlatformAuthenticatorAvailable();
  } catch {
    // Ante la duda se ofrece: una llave física externa no aparece aquí.
    return true;
  }
}

const deBase64Url = (texto: string): ArrayBuffer => {
  const base64 = texto.replace(/-/g, '+').replace(/_/g, '/');
  const relleno = base64.padEnd(base64.length + ((4 - (base64.length % 4)) % 4), '=');
  const binario = atob(relleno);
  const bytes = new Uint8Array(binario.length);

  for (let i = 0; i < binario.length; i++) bytes[i] = binario.charCodeAt(i);

  return bytes.buffer;
};

const aBase64Url = (buffer: ArrayBuffer): string => {
  const bytes = new Uint8Array(buffer);
  let binario = '';

  for (const b of bytes) binario += String.fromCharCode(b);

  return btoa(binario).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
};

/** Crea la passkey. Devuelve lo que hay que mandarle al servidor. */
export async function crearPasskey(opciones: any): Promise<string> {
  const pedido: any = {
    ...opciones,
    challenge: deBase64Url(opciones.challenge),
    user: { ...opciones.user, id: deBase64Url(opciones.user.id) },
    excludeCredentials: (opciones.excludeCredentials ?? []).map((c: any) => ({
      ...c, id: deBase64Url(c.id),
    })),
  };

  const credencial = await navigator.credentials.create({ publicKey: pedido }) as PublicKeyCredential | null;

  if (!credencial) throw new Error('El navegador no creó la passkey.');

  const r = credencial.response as AuthenticatorAttestationResponse;

  return JSON.stringify({
    id: credencial.id,
    rawId: aBase64Url(credencial.rawId),
    type: credencial.type,
    response: {
      clientDataJSON: aBase64Url(r.clientDataJSON),
      attestationObject: aBase64Url(r.attestationObject),
    },
    clientExtensionResults: credencial.getClientExtensionResults(),
  });
}

/** Pide al navegador que firme el desafío con una passkey ya guardada. */
export async function usarPasskey(opciones: any): Promise<string> {
  const pedido: any = {
    ...opciones,
    challenge: deBase64Url(opciones.challenge),
    allowCredentials: (opciones.allowCredentials ?? []).map((c: any) => ({
      ...c, id: deBase64Url(c.id),
    })),
  };

  const credencial = await navigator.credentials.get({ publicKey: pedido }) as PublicKeyCredential | null;

  if (!credencial) throw new Error('No se eligió ninguna passkey.');

  const r = credencial.response as AuthenticatorAssertionResponse;

  return JSON.stringify({
    id: credencial.id,
    rawId: aBase64Url(credencial.rawId),
    type: credencial.type,
    response: {
      clientDataJSON: aBase64Url(r.clientDataJSON),
      authenticatorData: aBase64Url(r.authenticatorData),
      signature: aBase64Url(r.signature),
      userHandle: r.userHandle ? aBase64Url(r.userHandle) : null,
    },
    clientExtensionResults: credencial.getClientExtensionResults(),
  });
}

/**
 * El reclamo del navegador, en palabras.
 *
 * Los errores de WebAuthn son crípticos —«NotAllowedError» tanto si canceló
 * como si se venció el tiempo— y dejarlos tal cual sólo confunde.
 */
export function porQueFallo(e: any): string {
  const nombre = String(e?.name ?? '');

  if (nombre === 'NotAllowedError') return 'Se canceló o se agotó el tiempo. Pruebe de nuevo.';
  if (nombre === 'InvalidStateError') return 'Este dispositivo ya tiene una passkey para esta cuenta.';
  if (nombre === 'NotSupportedError') return 'Este navegador o dispositivo no admite passkeys.';
  if (nombre === 'SecurityError') return 'El navegador no permitió la passkey en esta dirección. Tiene que ser https y el dominio de la consola.';

  return e?.message || 'No se pudo usar la passkey.';
}
