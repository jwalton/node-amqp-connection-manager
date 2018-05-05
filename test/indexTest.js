import chai from 'chai';
const {expect}   = chai;

import proxyquire from 'proxyquire';

class FakeAmqpConnectionManager {
    constructor(urls, options) {
        this.urls = urls;
        this.options = options;
    }
}

const index = proxyquire('../src/index', {
    './AmqpConnectionManager': {default: FakeAmqpConnectionManager}
});

describe('index', () =>
    it('should create AmqpConnectionManagers', function() {
        const amqp = index.connect(['amqp://localhost'], {option: 'hello'});
        expect(amqp.urls).to.eql(['amqp://localhost']);
        expect(amqp.options).to.eql({option: 'hello'});
    })
);
