/** WebRTC answerer used by the pairing plugin.
 *
 * This module deliberately accepts only STUN configuration: TURN would put
 * user payload back onto server infrastructure and violates the direct-only
 * product contract. All werift details stay behind one offer/answer interface.
 */
import { RTCPeerConnection } from 'werift';
function assertStunOnly(servers) {
    for (const server of servers) {
        const urls = Array.isArray(server.urls) ? server.urls : [server.urls];
        for (const url of urls) {
            if (!url.toLowerCase().startsWith('stun:')) {
                throw new Error('TURN is not allowed: direct WebRTC accepts STUN URLs only');
            }
        }
    }
}
/** Accept one browser offer and expose its direct ordered DataChannel. */
export async function acceptDirectOffer(offer, options = {}) {
    const iceServers = options.iceServers ?? [{ urls: 'stun:stun.l.google.com:19302' }];
    assertStunOnly(iceServers);
    if (offer.type !== 'offer' || offer.sdp.length === 0)
        throw new Error('direct WebRTC requires a non-empty offer');
    const peer = new RTCPeerConnection({ iceServers, maxMessageSize: 60 * 1024 });
    let resolveChannel;
    let rejectChannel;
    const channel = new Promise((resolve, reject) => {
        resolveChannel = resolve;
        rejectChannel = reject;
    });
    peer.onDataChannel.subscribe((dataChannel) => {
        if (dataChannel.label !== 'dsh-tunnel') {
            dataChannel.close();
            return;
        }
        resolveChannel(dataChannel);
    });
    peer.connectionStateChange.subscribe((state) => {
        if (state === 'failed' || state === 'closed')
            rejectChannel(new Error('direct WebRTC connection ' + state));
    });
    try {
        await peer.setRemoteDescription(offer);
        await peer.setLocalDescription(await peer.createAnswer());
        const local = peer.localDescription;
        if (local === null)
            throw new Error('direct WebRTC failed to create an answer');
        return {
            answer: { type: 'answer', sdp: local.sdp },
            channel,
            close: async () => { await peer.close(); },
        };
    }
    catch (error) {
        await peer.close();
        throw error;
    }
}
