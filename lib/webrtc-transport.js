import { DataChannelTransport } from '@dsh-mobile/e2e-tunnel';
function adaptWeriftChannel(channel) {
    return {
        binaryType: 'arraybuffer',
        send(data) { channel.send(Buffer.from(data instanceof ArrayBuffer ? new Uint8Array(data) : data)); },
        close() { channel.close(); },
        addEventListener(type, cb) {
            if (type === 'message') {
                channel.onMessage.subscribe(data => cb({ data }));
            }
            else if (type === 'close') {
                channel.stateChanged.subscribe(state => {
                    if (state === 'closed')
                        cb({});
                });
            }
            // werift reports transport failure through the same closed state.
        },
    };
}
/** Uses the exact client codec; no WebRTC message can exceed 60 KiB. */
export class WeriftDataChannelTransport {
    channel;
    transport;
    constructor(channel) {
        this.channel = channel;
        this.transport = new DataChannelTransport(adaptWeriftChannel(channel));
    }
    send(frame) {
        if (typeof frame === 'string')
            this.channel.send(frame);
        else
            this.transport.send(frame);
    }
    onFrame(cb) { this.transport.onFrame(cb); }
    onClose(cb) { this.transport.onClose(cb); }
    close() { this.transport.close(); }
}
