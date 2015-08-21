chai       = require 'chai'
{expect}   = chai

proxyquire = require 'proxyquire'

class FakeAmqpConnectionManager
    constructor: (@urls, @options) ->

index = proxyquire '../src/index', {
    './AmqpConnectionManager': FakeAmqpConnectionManager
}

describe 'index', ->
    it 'should create AmqpConnectionManagers', ->
        amqp = index.connect ['amqp://localhost'], {option: 'hello'}
        expect(amqp.urls).to.eql ['amqp://localhost']
        expect(amqp.options).to.eql {option: 'hello'}
