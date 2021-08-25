import origAmpq from 'amqplib';
import chai from 'chai';
import chaiString from 'chai-string';
import * as promiseTools from 'promise-tools';
import * as sinon from 'sinon';
import AmqpConnectionManager from '../src/AmqpConnectionManager';
import { FakeAmqp, FakeConnection } from './fixtures';

chai.use(chaiString);
const { expect } = chai;

const amqplib = new FakeAmqp();

describe('AmqpConnectionManager', function () {
    let amqp: AmqpConnectionManager | undefined;

    beforeEach(() => {
        sinon.stub(origAmpq, 'connect').callsFake(((url: string) => amqplib.connect(url)) as any);
        amqplib.reset();
    });

    afterEach(() => {
        amqp?.close();
        sinon.restore();
    });

    it('should establish a connection to a broker', () =>
        new Promise(function (resolve, reject) {
            amqp = new AmqpConnectionManager('amqp://localhost');
            return amqp.on('connect', ({ connection, url }) =>
                Promise.resolve()
                    .then(() => {
                        expect(url, 'url').to.equal('amqp://localhost');
                        expect((connection as any).url, 'connection.url').to.equal(
                            'amqp://localhost?heartbeat=5'
                        );
                    })
                    .then(resolve, reject)
            );
        }));

    it('should establish a connection to a broker, using an object as the URL', () =>
        new Promise(function (resolve, reject) {
            amqp = new AmqpConnectionManager({
                protocol: 'amqp',
                hostname: 'localhost',
            });
            return amqp.on('connect', ({ connection, url }) =>
                Promise.resolve()
                    .then(() => {
                        expect(url, 'url').to.eql({
                            protocol: 'amqp',
                            hostname: 'localhost',
                        });
                        expect((connection as any).url, 'connection.url').to.eql({
                            protocol: 'amqp',
                            hostname: 'localhost',
                            heartbeat: 5,
                        });
                    })
                    .then(resolve, reject)
            );
        }));

    it('should establish a url object based connection to a broker', () =>
        new Promise(function (resolve, reject) {
            amqp = new AmqpConnectionManager({ url: 'amqp://localhost' });
            return amqp.on('connect', ({ connection, url }) =>
                Promise.resolve()
                    .then(() => {
                        expect(url, 'url').to.equal('amqp://localhost');
                        expect((connection as any).url, 'connection.url').to.equal(
                            'amqp://localhost?heartbeat=5'
                        );
                    })
                    .then(resolve, reject)
            );
        }));

    it('should close connection to a broker', () =>
        new Promise(function (resolve, reject) {
            amqp = new AmqpConnectionManager('amqp://localhost');
            return amqp.on('connect', ({ connection, url }) =>
                Promise.resolve()
                    .then(async () => {
                        expect(url, 'url').to.equal('amqp://localhost');
                        expect((connection as any).url, 'connection.url').to.equal(
                            'amqp://localhost?heartbeat=5'
                        );
                        const conn = amqp?.connection;
                        await amqp?.close();

                        expect(amqp?.connection, 'current connection').to.be.undefined;
                        expect((conn as any)._closed, 'connection closed').to.be.true;
                    })
                    .then(resolve, reject)
            );
        }));

    /**
     * When close() was called before _connect() finished, the connection was remaining established indefinitely
     */
    it('should close pending connection to a broker', async () => {
        let closed = false;
        let connected = false;

        amqp = new AmqpConnectionManager('amqp://localhost');
        // Connection should not yet be established
        expect(amqp?.connection, 'current connection').to.equal(undefined);
        // Connection should be pending though
        expect((amqp as any)._connectPromise).to.be.an.instanceof(Promise);

        // Call close before the connection is established
        const closePromise = amqp.close().then(() => {
            closed = true;

            // Connection should not present after close
            expect(amqp?.connection, 'current connection').to.be.undefined;
            // Connection promise should not be present anymore
            expect((amqp as any)._connectPromise).to.be.undefined;
            // Connect should resolve before close
            expect(connected).to.equal(true);
        });

        // This prevents double call to close()
        expect((amqp as any)._closed).to.equal(true);

        // Wait for connect before checking amqp?.connection
        const connectPromise = new Promise((resolve, reject) => {
            // I tried to use once helper from events module but
            // does not work with babel for some reason
            amqp?.once('connect', resolve);
            amqp?.once('error', reject);
        }).then(() => {
            connected = true;

            // Connection should be present right after connect
            expect(amqp?.connection, 'current connection').to.be.an.instanceof(FakeConnection);
            // Connection promise should not be present anymore
            expect((amqp as any)._connectPromise).to.be.undefined;
            // Connect should resolve before close
            expect(closed).to.equal(false);
        });

        await Promise.all([closePromise, connectPromise]);
    });

    it('should establish a connection to a broker using findServers', () =>
        new Promise(function (resolve, reject) {
            amqp = new AmqpConnectionManager(null, {
                findServers() {
                    return Promise.resolve('amqp://localhost');
                },
            });

            return amqp.on('connect', ({ connection, url }) =>
                Promise.resolve()
                    .then(function () {
                        expect(url, 'url').to.equal('amqp://localhost');
                        expect((connection as any).url, 'connection.url').to.equal(
                            'amqp://localhost?heartbeat=5'
                        );
                    })
                    .then(resolve, reject)
            );
        }));

    it('should establish a url object based connection to a broker using findServers', () =>
        new Promise(function (resolve, reject) {
            amqp = new AmqpConnectionManager(null, {
                findServers() {
                    return Promise.resolve({ url: 'amqp://localhost' });
                },
            });

            return amqp.on('connect', ({ connection, url }) =>
                Promise.resolve()
                    .then(function () {
                        expect(url, 'url').to.equal('amqp://localhost');
                        expect((connection as any).url, 'connection.url').to.equal(
                            'amqp://localhost?heartbeat=5'
                        );
                    })
                    .then(resolve, reject)
            );
        }));

    it('should fail to connect if findServers returns no servers', () =>
        new Promise(function (resolve, reject) {
            amqp = new AmqpConnectionManager(null, {
                findServers() {
                    return Promise.resolve(null);
                },
            });
            return amqp.on('disconnect', ({ err }) =>
                Promise.resolve()
                    .then(function () {
                        expect(err.message).to.contain('No servers found');
                        return amqp?.close();
                    })
                    .then(resolve, reject)
            );
        }));

    it('should work with a URL with a query', () =>
        new Promise(function (resolve, reject) {
            amqp = new AmqpConnectionManager('amqp://localhost?frameMax=0x1000');
            return amqp.on('connect', ({ connection }) =>
                Promise.resolve()
                    .then(() =>
                        expect((connection as any).url, 'connection.url').to.equal(
                            'amqp://localhost?frameMax=0x1000&heartbeat=5'
                        )
                    )
                    .then(resolve, reject)
            );
        }));

    it('should throw an error if no url and no `findServers` option are provided', async () => {
        await expect(() => new (AmqpConnectionManager as any)()).to.throw(
            'Must supply either `urls` or `findServers`'
        );
    });

    it("should reconnect to the broker if it can't connect in the first place", () =>
        new Promise(function (resolve, reject) {
            amqplib.deadServers = ['amqp://rabbit1'];

            let disconnectEventsSeen = 0;

            // Should try to connect to rabbit1 first and be refused, and then succesfully connect to rabbit2.
            amqp = new AmqpConnectionManager(['amqp://rabbit1', 'amqp://rabbit2'], {
                heartbeatIntervalInSeconds: 0.01,
            });

            amqp.on('disconnect', function () {
                disconnectEventsSeen++;
                amqplib.failConnections = false;
            });

            return amqp.on('connect', ({ connection, url }) =>
                Promise.resolve()
                    .then(function () {
                        expect(disconnectEventsSeen).to.equal(1);

                        // Verify that we round-robined to the next server, since the first was unavilable.
                        expect(url, 'url').to.equal('amqp://rabbit2');
                        if (typeof url !== 'string') {
                            throw new Error('url is not a string');
                        }
                        expect((connection as any).url, 'connection.url').to.startWith(url);
                    })
                    .then(resolve, reject)
            );
        }));

    it('should reconnect to the broker if the broker disconnects', () =>
        new Promise(function (resolve, reject) {
            amqp = new AmqpConnectionManager('amqp://localhost', {
                heartbeatIntervalInSeconds: 0.01,
            });
            let connectsSeen = 0;
            let disconnectsSeen = 0;

            amqp.on('disconnect', () => disconnectsSeen++);

            amqp.once('connect', function () {
                connectsSeen++;
                // Murder the broker on the first connect
                amqplib.kill();

                amqp?.once('connect', function () {
                    // Make sure we connect a second time
                    connectsSeen++;
                    Promise.resolve()
                        .then(function () {
                            expect(connectsSeen).to.equal(2);
                            expect(disconnectsSeen).to.equal(1);
                        })
                        .then(resolve, reject);
                });
            });
        }));

    it('should reconnect to the broker if the broker closed connection', () =>
        new Promise(function (resolve, reject) {
            amqp = new AmqpConnectionManager('amqp://localhost', {
                heartbeatIntervalInSeconds: 0.01,
            });
            let connectsSeen = 0;
            let disconnectsSeen = 0;

            amqp.on('disconnect', () => disconnectsSeen++);

            amqp.once('connect', function () {
                connectsSeen++;
                // Close the connection nicely
                amqplib.simulateRemoteClose();

                amqp?.once('connect', function () {
                    // Make sure we connect a second time
                    connectsSeen++;
                    Promise.resolve()
                        .then(function () {
                            expect(connectsSeen).to.equal(2);
                            expect(disconnectsSeen).to.equal(1);
                        })
                        .then(resolve, reject);
                });
            });
        }));

    it('should know if it is connected or not', () =>
        new Promise(function (resolve, reject) {
            amqp = new AmqpConnectionManager('amqp://localhost');
            expect(amqp.isConnected()).to.be.false;

            return amqp.on('connect', () =>
                Promise.resolve()
                    .then(() => {
                        expect(amqp?.isConnected()).to.be.true;
                    })
                    .then(resolve, reject)
            );
        }));

    it('should create and clean up channel wrappers', async function () {
        amqp = new AmqpConnectionManager('amqp://localhost');
        const channel = amqp.createChannel({ name: 'test-chan' });

        // Channel should register with connection manager
        expect(amqp.channelCount, 'registered channels').to.equal(1);
        expect(amqp.listeners('connect').length, 'connect listners').to.equal(1);
        expect(amqp.listeners('disconnect').length, 'disconnect listners').to.equal(1);

        // Closing the channel should remove all listeners and de-register the channel
        await channel.close();

        expect(amqp.channelCount, 'registered channels after close').to.equal(0);
        expect(amqp.listeners('connect').length, 'connect listners after close').to.equal(0);
        expect(amqp.listeners('disconnect').length, 'disconnect listners after close').to.equal(0);
    });

    it('should clean up channels on close', async function () {
        amqp = new AmqpConnectionManager('amqp://localhost');
        amqp.createChannel({ name: 'test-chan' });

        // Channel should register with connection manager
        expect(amqp.channelCount, 'registered channels').to.equal(1);
        expect(amqp.listeners('connect').length, 'connect listners').to.equal(1);
        expect(amqp.listeners('disconnect').length, 'disconnect listners').to.equal(1);

        // Closing the connection should remove all listeners and de-register the channel
        await amqp.close();

        expect(amqp.channelCount, 'registered channels after close').to.equal(0);
        expect(amqp.listeners('connect').length, 'connect listners after close').to.equal(0);
        expect(amqp.listeners('disconnect').length, 'disconnect listners after close').to.equal(0);
    });

    it('should not reconnect after close', () =>
        new Promise(function (resolve, reject) {
            amqp = new AmqpConnectionManager('amqp://localhost', {
                heartbeatIntervalInSeconds: 0.01,
            });
            let connectsSeen = 0;

            amqp.on('connect', () => connectsSeen++);

            amqp.once('connect', () =>
                Promise.resolve()
                    .then(() =>
                        // Close the manager
                        amqp?.close()
                    )
                    .then(function () {
                        // Murder the broker on the first connect
                        amqplib.kill();

                        // Wait a moment
                        return promiseTools.delay(50);
                    })
                    .then(() =>
                        // Make sure didn't see a second connect
                        expect(connectsSeen).to.equal(1)
                    )
                    .then(resolve, reject)
            );
        }));

    it('should detect connection block/unblock', () =>
        new Promise(function (resolve, reject) {
            amqp = new AmqpConnectionManager('amqp://localhost');
            let connectsSeen = 0;
            let blockSeen = 0;
            let unblockSeen = 0;

            amqp.on('blocked', () => blockSeen++);

            amqp.on('unblocked', () => unblockSeen++);

            amqp.once('connect', function () {
                connectsSeen++;
                // Close the connection nicely
                amqplib.simulateRemoteBlock();
                amqplib.simulateRemoteUnblock();

                Promise.resolve()
                    .then(function () {
                        expect(connectsSeen).to.equal(1);
                        expect(blockSeen).to.equal(1);
                        expect(unblockSeen).to.equal(1);
                    })
                    .then(resolve, reject);
            });
        }));
});
