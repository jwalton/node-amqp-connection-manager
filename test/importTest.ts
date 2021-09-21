import { expect } from 'chai';
import amqp, { AmqpConnectionManagerClass as AmqpConnectionManager } from '../src';

describe('import test', function () {
    it('should let you import as default (#51)', function () {
        expect(amqp).to.exist;
        expect(amqp.connect).to.exist;
    });

    it('should let you import class', function () {
        new AmqpConnectionManager('url');
    });
});
