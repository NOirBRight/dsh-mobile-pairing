/** Signaling-only host coordinator. No DSH application frame crosses this socket. */
import type { RTCDataChannel } from 'werift';
import { type DirectIceServer, type DirectSessionDescription } from './webrtc-host.ts';
interface SignalingSocket {
    on(type: 'message', listener: (data: unknown, isBinary: boolean) => void): unknown;
    send(data: string): void;
    close(): void;
}
export interface DirectSignalingOptions {
    iceServers: DirectIceServer[];
    onChannel(channel: RTCDataChannel): void;
    onError?: (error: Error) => void;
}
export interface DirectSignalingGate {
    close(): void;
}
export declare function encodeSignalDescription(kind: 'offer' | 'answer', description: DirectSessionDescription): string;
/** Attach one persistent host room socket; every offer replaces the prior peer. */
export declare function attachDirectSignaling(socket: SignalingSocket, options: DirectSignalingOptions): DirectSignalingGate;
export {};
