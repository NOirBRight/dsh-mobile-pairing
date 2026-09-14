import { DataChannelTransport } from '@dsh-mobile/e2e-tunnel';
function adaptWeriftChannel(channel) {
    return {
        binaryType: 'arraybuffer',
        send(data) {
            channel.send(Buffer.from(data instanceof ArrayBuffer ? new Uint8Array(data) : data));
        },
        close() {
            channel.close();
        },
        addEventListener(type, cb) {
            if (type === 'message') {
                // Only `data` is read; the event type comes from the installed channel face.
                channel.onMessage.subscribe((data) => cb({ data }));
            }
            else if (type === 'close') {
                channel.stateChanged.subscribe((state) => {
                    if (state === 'closed')
                        cb({});
                });
            }
            // werift reports transport failure through the same closed state.
        },
    };
}
/** Uses the exact client codec; no WebRTC message can exceed 60 KiB. */
export class WeriftDataChannelTransport extends DataChannelTransport {
    /**
     * @param channel - already-open werift data channel (reliable + ordered).
     */
    constructor(channel) {
        super(adaptWeriftChannel(channel));
    }
}
