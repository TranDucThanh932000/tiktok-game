import { EventEmitter } from 'node:events';

// The contract every event source follows. The game only ever sees normalized events through 'event'
// and connection changes through 'status'; it never touches a TikTok library directly.
//   'event'  (event)                      a normalized internal event
//   'status' ({ connected, text })        connection state for the header and admin panel
//   'room'   ({ roomId })                 a (re)connection landed in a new LIVE room
export class EventAdapter extends EventEmitter {
  constructor(name) {
    super();
    this.name = name;
    this.status = { connected: false, text: '' };
  }

  start() {}

  stop() {}

  setStatus(connected, text) {
    this.status = { connected, text };
    this.emit('status', { source: this.name, ...this.status });
  }

  publish(events) {
    for (const event of events) this.emit('event', event);
  }
}
