# [2.2.0](https://github.com/benbria/node-amqp-connection-manager/compare/v2.1.2...v2.2.0) (2018-09-25)


### Features

* Set 'this' to be the channel wrapper in the setup function. ([551200f](https://github.com/benbria/node-amqp-connection-manager/commit/551200f))

## [2.1.2](https://github.com/benbria/node-amqp-connection-manager/compare/v2.1.1...v2.1.2) (2018-09-13)


### Bug Fixes

* Export a default object from root module. ([78893c9](https://github.com/benbria/node-amqp-connection-manager/commit/78893c9)), closes [#51](https://github.com/benbria/node-amqp-connection-manager/issues/51)

## [2.1.1](https://github.com/benbria/node-amqp-connection-manager/compare/v2.1.0...v2.1.1) (2018-09-05)


### Bug Fixes

* Remove reconnection listener when closing the connection manager. ([eeb6e2b](https://github.com/benbria/node-amqp-connection-manager/commit/eeb6e2b))

# [2.1.0](https://github.com/benbria/node-amqp-connection-manager/compare/v2.0.0...v2.1.0) (2018-08-09)


### Features

* Support for per URL connection options ([ec2d484](https://github.com/benbria/node-amqp-connection-manager/commit/ec2d484)), closes [#29](https://github.com/benbria/node-amqp-connection-manager/issues/29) [#34](https://github.com/benbria/node-amqp-connection-manager/issues/34) [#44](https://github.com/benbria/node-amqp-connection-manager/issues/44)

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
