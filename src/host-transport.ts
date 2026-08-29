/**
 * Transport-neutral frame carrier for the host tunnel endpoint — the seam
 * between the wire and the tunnel session mux in tunnel-server.ts.
 *
 * A HostFrameTransport carries opaque frames both ways. Post-handshake every
 * frame is a sealed session message — nonce(24B) || box(json, peerPub,
 * ownSec); the relay path additionally passes handshake frames and the host's
 * plaintext handshake-phase error frames through the same pipe. A string
 * frame is delivered as a string so the session layer can reject it (text
 * frames are a protocol violation, close 4400).
 *
 * Contract (mirrors the client-side FrameTransport in e2e-tunnel, small on
 * purpose — this is the whole interface a host-side carrier must satisfy):
 *  - send(): one frame, queued in order behind earlier sends.
 *  - onFrame(): single-slot handler; frames arrive in send order.
 *  - onClose(): single-slot; fires once. No frames arrive afterwards.
 *  - close(): initiates close. Code/reason are advisory — carriers without
 *    close codes (RTCDataChannel) ignore them.
 *
 * Adapters: WsRelayTransport (relay room WebSocket, the M3 path; constructed
 * by attachRelaySocket). It shares the Client codec so large sealed frames
 * cross the Relay as bounded messages and reassemble behind this interface.
 * A direct WebRTC DataChannel is attached through attachAuthenticatedTransport
 * with any object satisfying HostFrameTransport.
 */
import { fragmentRelayFrame, RelayFrameReassembler } from '@dsh-mobile/e2e-tunnel'
import type WebSocket from 'ws'

/** The frame pipe a host tunnel session (or relay gate) rides. See the module header for the contract. */
export interface HostFrameTransport {
  send(frame: Uint8Array | string): void
  onFrame(cb: (frame: Uint8Array | string) => void): void
  onClose(cb: () => void): void
  close(code?: number, reason?: string): void
}

/** Relay-room WebSocket adapter (the M3 wire). Construct once the socket is connected. */
export class WsRelayTransport implements HostFrameTransport {
  private frameHandler: ((frame: Uint8Array | string) => void) | null = null
  private closeHandler: (() => void) | null = null
  private readonly socket: WebSocket
  private readonly reassembler = new RelayFrameReassembler()
  private nextFrameId = 0

  constructor(socket: WebSocket) {
    this.socket = socket
    socket.on('message', (data: Buffer, isBinary: boolean) => {
      if (!isBinary) {
        this.frameHandler?.(data.toString('utf8'))
        return
      }
      try {
        const frame = this.reassembler.push(new Uint8Array(data))
        if (frame !== null) this.frameHandler?.(frame)
      } catch {
        this.close(1008, 'bad Relay fragment')
      }
    })
    socket.on('close', () => this.closeHandler?.())
    socket.on('error', () => {}) // close always follows; the close handler owns the bookkeeping
  }

  send(frame: Uint8Array | string): void {
    if (typeof frame === 'string') {
      this.socket.send(frame)
      return
    }
    const messages = fragmentRelayFrame(frame, this.nextFrameId)
    if (messages.length > 1) this.nextFrameId = (this.nextFrameId + 1) & 0xffff
    for (const message of messages) this.socket.send(message)
  }

  onFrame(cb: (frame: Uint8Array | string) => void): void {
    this.frameHandler = cb
  }

  onClose(cb: () => void): void {
    this.closeHandler = cb
  }

  close(code?: number, reason?: string): void {
    this.socket.close(code, reason)
  }
}
