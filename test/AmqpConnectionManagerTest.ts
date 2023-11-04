import origAmqp from 'amqplib';
import chai from 'chai';
import chaiString from 'chai-string';
import { once } from 'events';
import * as promiseTools from 'promise-tools';
import AmqpConnectionManager from '../src/AmqpConnectionManager';
import { FakeAmqp, FakeConnection } from './fixtures';

chai.use(chaiString);
const { expect } = chai;

const amqplib = new FakeAmqp();

describe('AmqpConnectionManager', function () {
    let amqp: AmqpConnectionManager | undefined;

    beforeEach(() => {
        jest.spyOn(origAmqp, 'connect').mockImplementation(((url: string) =>
            amqplib.connect(url)) as any);
        amqplib.reset();
    });

    afterEach(() => {
        amqp?.close();
        jest.restoreAllMocks();
    });

    it('should establish a connection to a broker', async () => {
        amqp = new AmqpConnectionManager('amqp://localhost');
        amqp.connect();
        const [{ connection, url }] = await once(amqp, 'connect');
        expect(url, 'url').to.equal('amqp://localhost');
        expect(connection.url, 'connection.url').to.equal('amqp://localhost?heartbeat=5');
    });

    it('should establish a connection to a broker, using an object as the URL', async () => {
        amqp = new AmqpConnectionManager({
            protocol: 'amqp',
            hostname: 'localhost',
        });
        amqp.connect();
        const [{ connection, url }] = await once(amqp, 'connect');
        expect(url, 'url').to.eql({
            protocol: 'amqp',
            hostname: 'localhost',
        });
        expect((connection as any).url, 'connection.url').to.eql({
            protocol: 'amqp',
            hostname: 'localhost',
            heartbeat: 5,
        });
    });

    it('should establish a url object based connection to a broker', async () => {
        amqp = new AmqpConnectionManager({ url: 'amqp://localhost' });
        amqp.connect();
        const [{ connection, url }] = await once(amqp, 'connect');
        expect(url, 'url').to.equal('amqp://localhost');
        expect(connection.url, 'connection.url').to.equal('amqp://localhost?heartbeat=5');
    });

    it('should establish a connection to a broker disabling heartbeat', async () => {
        amqp = new AmqpConnectionManager('amqp://localhost', {
            heartbeatIntervalInSeconds: 0,
        });
        amqp.connect();
        const [{ connection, url }] = await once(amqp, 'connect');
        expect(url, 'url').to.equal('amqp://localhost');
        expect(connection.url, 'connection.url').to.equal('amqp://localhost?heartbeat=0');
    });

    it('should close connection to a broker', async () => {
        amqp = new AmqpConnectionManager('amqp://localhost');
        amqp.connect();
        const [{ connection, url }] = await once(amqp, 'connect');
        expect(url, 'url').to.equal('amqp://localhost');
        expect((connection as any).url, 'connection.url').to.equal('amqp://localhost?heartbeat=5');
        const conn = amqp.connection;
        await amqp?.close();

        expect(amqp?.connection, 'current connection').to.be.undefined;
        expect((conn as any)._closed, 'connection closed').to.be.true;
    });

    // /**
    //  * When close() was called before _connect() finished, the connection was remaining established indefinitely
    //  */
    it('should close pending connection to a broker', async () => {
        let closed = false;
        let connected = false;

        amqp = new AmqpConnectionManager('amqp://localhost');
        amqp.connect();
        // Connection should not yet be established
        expect(amqp.connection, 'current connection').to.equal(undefined);
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

    it('should establish a connection to a broker using findServers', async () => {
        amqp = new AmqpConnectionManager(null, {
            findServers() {
                return Promise.resolve('amqp://localhost');
            },
        });
        amqp.connect();
        const [{ connection, url }] = await once(amqp, 'connect');
        expect(url, 'url').to.equal('amqp://localhost');
        expect(connection.url, 'connection.url').to.equal('amqp://localhost?heartbeat=5');
    });

    it('should establish a url object based connection to a broker using findServers', async () => {
        amqp = new AmqpConnectionManager(null, {
            findServers() {
                return Promise.resolve({ url: 'amqp://localhost' });
            },
        });
        amqp.connect();
        const [{ connection, url }] = await once(amqp, 'connect');
        expect(url, 'url').to.equal('amqp://localhost');
        expect(connection.url, 'connection.url').to.equal('amqp://localhost?heartbeat=5');
    });

    it('should fail to connect if findServers returns no servers', async () => {
        amqp = new AmqpConnectionManager(null, {
            findServers() {
                return Promise.resolve(null);
            },
        });

        amqp.connect();
        const [{ err }] = await once(amqp, 'connectFailed');
        expect(err.message).to.contain('No servers found');
        return amqp?.close();
    });

    it('should timeout connect', async () => {
        jest.spyOn(origAmqp, 'connect').mockImplementation((): any => {
            return promiseTools.delay(200);
        });
        amqp = new AmqpConnectionManager('amqp://localhost');
        let err;
        try {
            await amqp.connect({ timeout: 0.1 });
        } catch (error: any) {
            err = error;
        }
        expect(err.message).to.equal('amqp-connection-manager: connect timeout');
    });

    it('should work with a URL with a query', async () => {
        amqp = new AmqpConnectionManager('amqp://localhost?frameMax=0x1000');
        amqp.connect();
        const [{ connection }] = await once(amqp, 'connect');
        expect(connection.url, 'connection.url').to.equal(
            'amqp://localhost?frameMax=0x1000&heartbeat=5'
        );
    });

    it('should throw an error if no url and no `findServers` option are provided', async () => {
        expect(() => new (AmqpConnectionManager as any)()).to.throw(
            'Must supply either `urls` or `findServers`'
        );
    });

    it("should reconnect to the broker if it can't connect in the first place", async () => {
        amqplib.deadServers = ['amqp://rabbit1'];

        // Should try to connect to rabbit1 first and be refused, and then successfully connect to rabbit2.
        amqp = new AmqpConnectionManager(['amqp://rabbit1', 'amqp://rabbit2'], {
            heartbeatIntervalInSeconds: 0.01,
        });
        amqp.connect();

        let connectFailedSeen = 0;
        amqp.on('connectFailed', function () {
            connectFailedSeen++;
            amqplib.failConnections = false;
        });

        const [{ connection, url }] = await once(amqp, 'connect');
        expect(connectFailedSeen).to.equal(1);

        // Verify that we round-robined to the next server, since the first was unavailable.
        expect(url, 'url').to.equal('amqp://rabbit2');
        if (typeof url !== 'string') {
            throw new Error('url is not a string');
        }
        expect((connection as any).url, 'connection.url').to.startWith(url);
    });

    it('should reconnect to the broker if the broker disconnects', async () => {
        amqp = new AmqpConnectionManager('amqp://localhost', {
            heartbeatIntervalInSeconds: 0.01,
        });
        let disconnectsSeen = 0;
        amqp.on('disconnect', () => disconnectsSeen++);

        await amqp.connect();
        amqplib.kill();

        await amqp.connect();
        expect(disconnectsSeen).to.equal(1);
    });

    it('should reconnect to the broker if the broker closed connection', async () => {
        amqp = new AmqpConnectionManager('amqp://localhost', {
            heartbeatIntervalInSeconds: 0.01,
        });

        let disconnectsSeen = 0;
        amqp.on('disconnect', () => disconnectsSeen++);

        await amqp.connect();

        // Close the connection nicely
        amqplib.simulateRemoteClose();

        await once(amqp, 'connect');
        expect(disconnectsSeen).to.equal(1);
    });

    it('should know if it is connected or not', async () => {
        amqp = new AmqpConnectionManager('amqp://localhost');
        amqp.connect();

        expect(amqp.isConnected()).to.be.false;

        await once(amqp, 'connect');
        expect(amqp?.isConnected()).to.be.true;
    });

    it('should be able to manually reconnect', async () => {
        amqp = new AmqpConnectionManager('amqp://localhost');
        await amqp.connect();

        amqp.reconnect();
        await once(amqp, 'disconnect');
        await once(amqp, 'connect');
    });

    it('should throw on manual reconnect after close', async () => {
        amqp = new AmqpConnectionManager('amqp://localhost');
        await amqp.connect();
        await amqp.close();
        expect(amqp.reconnect).to.throw();
    });

    it('should create and clean up channel wrappers', async function () {
        amqp = new AmqpConnectionManager('amqp://localhost');
        await amqp.connect();
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

    it('should create and be able to find channel', async function () {
        amqp = new AmqpConnectionManager('amqp://localhost');
        await amqp.connect();
        const channel = amqp.createChannel({ name: 'test-chan' });
        const findChannel = amqp.findChannel('test-chan');
        // Channel should register with connection manager
        expect(amqp.channelCount, 'registered channels').to.equal(1);
        expect(channel, 'same channe').to.equal(findChannel);

        // Closing the channel should remove all listeners and de-register the channel
        await channel.close();
    });

    it('should clean up channels on close', async function () {
        amqp = new AmqpConnectionManager('amqp://localhost');
        await amqp.connect();
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

    it('should not reconnect after close', async () => {
        amqp = new AmqpConnectionManager('amqp://localhost', {
            heartbeatIntervalInSeconds: 0.01,
        });

        let connectsSeen = 0;
        amqp.on('connect', () => connectsSeen++);
        await amqp.connect();

        // Close the manager
        await amqp?.close();

        // Murder the broker on the first connect
        amqplib.kill();

        await promiseTools.delay(50);
        expect(connectsSeen).to.equal(1);
    });

    it('should detect connection block/unblock', async () => {
        amqp = new AmqpConnectionManager('amqp://localhost');

        let blockSeen = 0;
        let unblockSeen = 0;

        amqp.on('blocked', () => blockSeen++);

        amqp.on('unblocked', () => unblockSeen++);

        await amqp.connect();
        // Close the connection nicely
        amqplib.simulateRemoteBlock();
        amqplib.simulateRemoteUnblock();

        expect(blockSeen).to.equal(1);
        expect(unblockSeen).to.equal(1);
    });
});
