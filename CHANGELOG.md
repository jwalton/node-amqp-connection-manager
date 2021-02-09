## [3.2.2](https://github.com/jwalton/node-amqp-connection-manager/compare/v3.2.1...v3.2.2) (2021-02-09)


### Bug Fixes

* When messages are acked/nacked, make sure we remove the correct message from the sent messages queue. ([c662026](https://github.com/jwalton/node-amqp-connection-manager/commit/c662026bc287e684a0f43ce2de7a44b80a88e8ff)), closes [#142](https://github.com/jwalton/node-amqp-connection-manager/issues/142)

## [3.2.1](https://github.com/jwalton/node-amqp-connection-manager/compare/v3.2.0...v3.2.1) (2020-09-12)


### Bug Fixes

* Push never resolves if error occured (courtesy @SSANSH). ([48a78f8](https://github.com/jwalton/node-amqp-connection-manager/commit/48a78f8de5d39002035b37f27fc3e0ce5015490c))
* **package:** resolve hanging retry connection timeout by introducing cancelable timeout ([e37dd1a](https://github.com/jwalton/node-amqp-connection-manager/commit/e37dd1a4e423012910d31ae8bcebf781cac6f3b5))

# [3.2.0](https://github.com/jwalton/node-amqp-connection-manager/compare/v3.1.1...v3.2.0) (2020-01-20)


### Features

* add bindQueue and assertExchange on ChannelWrapper ([879e522](https://github.com/jwalton/node-amqp-connection-manager/commit/879e522))

## [3.1.1](https://github.com/jwalton/node-amqp-connection-manager/compare/v3.1.0...v3.1.1) (2020-01-06)


### Bug Fixes

* typo ([6055b02](https://github.com/jwalton/node-amqp-connection-manager/commit/6055b02))

# [3.1.0](https://github.com/jwalton/node-amqp-connection-manager/compare/v3.0.0...v3.1.0) (2019-12-06)


### Features

* Allow using URL object to connect, same format as amqplib accepts. ([f046680](https://github.com/jwalton/node-amqp-connection-manager/commit/f046680))

# [3.0.0](https://github.com/jwalton/node-amqp-connection-manager/compare/v2.3.3...v3.0.0) (2019-07-04)


### Continuous Integration

* Stop running tests for node 6 and node 8. ([164b882](https://github.com/jwalton/node-amqp-connection-manager/commit/164b882))


### BREAKING CHANGES

* Officially drop support for node 6 and node 8 (although they will probably still
work).

## [2.3.3](https://github.com/jwalton/node-amqp-connection-manager/compare/v2.3.2...v2.3.3) (2019-06-25)


### Bug Fixes

* **package:** update promise-breaker to version 5.0.0 ([ed91042](https://github.com/jwalton/node-amqp-connection-manager/commit/ed91042))

## [2.3.2](https://github.com/jwalton/node-amqp-connection-manager/compare/v2.3.1...v2.3.2) (2019-05-21)


### Bug Fixes

* Null delta to get semantic-release to pick up [#65](https://github.com/jwalton/node-amqp-connection-manager/issues/65).  Fix [#84](https://github.com/jwalton/node-amqp-connection-manager/issues/84). ([9737135](https://github.com/jwalton/node-amqp-connection-manager/commit/9737135))

## [2.3.1](https://github.com/jwalton/node-amqp-connection-manager/compare/v2.3.0...v2.3.1) (2019-04-01)


### Bug Fixes

* prevent too many connection attempts on error ([2760ce5](https://github.com/jwalton/node-amqp-connection-manager/commit/2760ce5)), closes [#77](https://github.com/jwalton/node-amqp-connection-manager/issues/77)

# [2.3.0](https://github.com/jwalton/node-amqp-connection-manager/compare/v2.2.0...v2.3.0) (2018-11-20)


### Features

* Add ChannelWrapper.ackAll() and ChannelWrapper.nackAll(). ([0246695](https://github.com/jwalton/node-amqp-connection-manager/commit/0246695)), closes [#60](https://github.com/jwalton/node-amqp-connection-manager/issues/60)

# [2.2.0](https://github.com/jwalton/node-amqp-connection-manager/compare/v2.1.2...v2.2.0) (2018-09-25)


### Features

* Set 'this' to be the channel wrapper in the setup function. ([551200f](https://github.com/jwalton/node-amqp-connection-manager/commit/551200f))

## [2.1.2](https://github.com/jwalton/node-amqp-connection-manager/compare/v2.1.1...v2.1.2) (2018-09-13)


### Bug Fixes

* Export a default object from root module. ([78893c9](https://github.com/jwalton/node-amqp-connection-manager/commit/78893c9)), closes [#51](https://github.com/jwalton/node-amqp-connection-manager/issues/51)

## [2.1.1](https://github.com/jwalton/node-amqp-connection-manager/compare/v2.1.0...v2.1.1) (2018-09-05)


### Bug Fixes

* Remove reconnection listener when closing the connection manager. ([eeb6e2b](https://github.com/jwalton/node-amqp-connection-manager/commit/eeb6e2b))

# [2.1.0](https://github.com/jwalton/node-amqp-connection-manager/compare/v2.0.0...v2.1.0) (2018-08-09)


### Features

* Support for per URL connection options ([ec2d484](https://github.com/jwalton/node-amqp-connection-manager/commit/ec2d484)), closes [#29](https://github.com/jwalton/node-amqp-connection-manager/issues/29) [#34](https://github.com/jwalton/node-amqp-connection-manager/issues/34) [#44](https://github.com/jwalton/node-amqp-connection-manager/issues/44)

<a name="2.0.0"></a>
# [2.0.0](https://github.com/jwalton/node-amqp-connection-manager/compare/v1.4.2...v2.0.0) (2018-05-05)


### Code Refactoring

* Rewrite all source in javascript. ([377d01d](https://github.com/jwalton/node-amqp-connection-manager/commit/377d01d))


### BREAKING CHANGES

* Officially dropping support for node v4.x.x.

# 1.4.0

* Add 'blocked' and 'unblocked' events (#25).

# 1.3.7

* Fix bug where we would stop sending messages if remote gracefully closes connection.

# 1.3.6

* Fix bug where ChannelWrapper would expect setup function to return a Promise
  and not accept a callback if channel was already connected.
