import { decodeSignal, encodeSignal } from '@dsh-mobile/e2e-tunnel';
import { acceptDirectOffer } from "./webrtc-host.js";
export function encodeSignalDescription(kind, description) {
    return encodeSignal({ kind, description });
}
function decodeOffer(raw, isBinary) {
    if (isBinary)
        throw new Error('direct signaling expected a text envelope');
    const text = typeof raw === 'string'
        ? raw
        : Array.isArray(raw)
            ? Buffer.concat(raw).toString()
            : raw instanceof ArrayBuffer
                ? Buffer.from(new Uint8Array(raw)).toString()
                : ArrayBuffer.isView(raw)
                    ? Buffer.from(raw.buffer, raw.byteOffset, raw.byteLength).toString()
                    : (() => { throw new Error('invalid direct signaling payload'); })();
    const signal = decodeSignal(text);
    if (signal === null || signal.kind !== 'offer' || signal.description.type !== 'offer') {
        throw new Error('direct signaling expected an offer');
    }
    return { type: 'offer', sdp: signal.description.sdp };
}
/** Attach one persistent host room socket; every offer replaces the prior peer. */
export function attachDirectSignaling(socket, options) {
    let closed = false;
    let generation = 0;
    let peer = null;
    const fail = (error) => {
        options.onError?.(error instanceof Error ? error : new Error(String(error)));
    };
    const negotiate = async (raw, isBinary) => {
        const ownGeneration = ++generation;
        const offer = decodeOffer(raw, isBinary);
        const next = await acceptDirectOffer(offer, { iceServers: options.iceServers });
        if (closed || ownGeneration !== generation) {
            await next.close();
            return;
        }
        const previous = peer;
        peer = next;
        if (previous !== null)
            await previous.close();
        socket.send(encodeSignalDescription('answer', next.answer));
        const channel = await next.channel;
        if (!closed && ownGeneration === generation)
            options.onChannel(channel);
    };
    socket.on('message', (data, isBinary) => { void negotiate(data, isBinary).catch(fail); });
    return {
        close() {
            if (closed)
                return;
            closed = true;
            generation++;
            socket.close();
            if (peer !== null)
                void peer.close();
            peer = null;
        },
    };
}
