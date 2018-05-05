<a name="2.0.0"></a>
# [2.0.0](https://github.com/benbria/node-amqp-connection-manager/compare/v1.4.2...v2.0.0) (2018-05-05)


### Code Refactoring

* Rewrite all source in javascript. ([377d01d](https://github.com/benbria/node-amqp-connection-manager/commit/377d01d))


### BREAKING CHANGES

* Officially dropping support for node v4.x.x.

# 1.4.0

* Add 'blocked' and 'unblocked' events (#25).

# 1.3.7

* Fix bug where we would stop sending messages if remote gracefully closes connection.

# 1.3.6

* Fix bug where ChannelWrapper would expect setup function to return a Promise
  and not accept a callback if channel was already connected.
