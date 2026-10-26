export function createBridge(transport, handlers) {
  const emit = (type, payload = {}) => transport.postMessage({ version: 1, kind: 'event', type, payload });
  const receive = async ({ data: message }) => {
    if (!message || message.version !== 1 || message.kind !== 'request' ||
        typeof message.id !== 'string' || typeof message.type !== 'string') return;
    try {
      if (!Object.hasOwn(handlers, message.type)) throw new Error(`Comando non supportato: ${message.type}`);
      const payload = await handlers[message.type](message.payload ?? {});
      transport.postMessage({ version: 1, kind: 'response', id: message.id, ok: true, payload: payload ?? {} });
    } catch (error) {
      transport.postMessage({ version: 1, kind: 'response', id: message.id, ok: false,
        error: error?.message ?? String(error) });
    }
  };
  transport.addEventListener('message', receive);
  return { emit, dispose: () => transport.removeEventListener('message', receive) };
}
