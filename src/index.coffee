AmqpConnectionManager = require './AmqpConnectionManager'

exports.connect = (urls, options) ->
    return new AmqpConnectionManager urls, options
