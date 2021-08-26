## [3.5.2](https://github.com/jwalton/node-amqp-connection-manager/compare/v3.5.1...v3.5.2) (2021-08-26)

### Bug Fixes

- Fix handling of resending messages during a disconnect. ([e1457a5](https://github.com/jwalton/node-amqp-connection-manager/commit/e1457a598c6ecffca9c864036f1875f546ad5017)), closes [#152](https://github.com/jwalton/node-amqp-connection-manager/issues/152)

### Performance Improvements

- Send messages to underlying channel in synchronous batches. ([b866ef2](https://github.com/jwalton/node-amqp-connection-manager/commit/b866ef25ebe97c1cf4fe421835291584cb738f41))

## [3.5.1](https://github.com/jwalton/node-amqp-connection-manager/compare/v3.5.0...v3.5.1) (2021-08-26)

### Bug Fixes

- **types:** Make private things private. ([8b1338b](https://github.com/jwalton/node-amqp-connection-manager/commit/8b1338ba2f46267b4aedcbeeaccfdc6cb24680ec))

# [3.5.0](https://github.com/jwalton/node-amqp-connection-manager/compare/v3.4.5...v3.5.0) (2021-08-26)

### Features

- manual reconnect ([798b45f](https://github.com/jwalton/node-amqp-connection-manager/commit/798b45f52c437f35a0f89b431b872354a7a3eb0e))

## [3.4.5](https://github.com/jwalton/node-amqp-connection-manager/compare/v3.4.4...v3.4.5) (2021-08-26)

### Performance Improvements

- resolve sent messages immediately ([2349da2](https://github.com/jwalton/node-amqp-connection-manager/commit/2349da2db8d34934c6d0225983b6411509730560))

## [3.4.4](https://github.com/jwalton/node-amqp-connection-manager/compare/v3.4.3...v3.4.4) (2021-08-26)

### Bug Fixes

- **types:** Allow passing object to `connect()` in addition to strings. ([516fd9f](https://github.com/jwalton/node-amqp-connection-manager/commit/516fd9fa19a12ce6aa585f97503dfb4fa336352f))

## [3.4.3](https://github.com/jwalton/node-amqp-connection-manager/compare/v3.4.2...v3.4.3) (2021-08-25)

### Bug Fixes

- **types:** 'options' should be optional in `connect()`. ([4619149](https://github.com/jwalton/node-amqp-connection-manager/commit/4619149e702418b9e4bba6e135c675754589a8ed))
- Fix bluebird warning. ([cb2f124](https://github.com/jwalton/node-amqp-connection-manager/commit/cb2f124e10d193f6c9a3cb255636e112be2c4e53)), closes [#171](https://github.com/jwalton/node-amqp-connection-manager/issues/171)

## [3.4.3](https://github.com/jwalton/node-amqp-connection-manager/compare/v3.4.2...v3.4.3) (2021-08-25)

### Bug Fixes

- Fix bluebird warning. ([cb2f124](https://github.com/jwalton/node-amqp-connection-manager/commit/cb2f124e10d193f6c9a3cb255636e112be2c4e53)), closes [#171](https://github.com/jwalton/node-amqp-connection-manager/issues/171)

## [3.4.2](https://github.com/jwalton/node-amqp-connection-manager/compare/v3.4.1...v3.4.2) (2021-08-25)

### Bug Fixes

- **types:** Minor type fixes. ([6865613](https://github.com/jwalton/node-amqp-connection-manager/commit/68656134a13786af2b751527e5d03eff07dd72b9))

## [3.4.1](https://github.com/jwalton/node-amqp-connection-manager/compare/v3.4.0...v3.4.1) (2021-08-25)

### Bug Fixes

- Only send disconnect event on first error. ([efde3b9](https://github.com/jwalton/node-amqp-connection-manager/commit/efde3b919252f031a3edf2a06d7cfe280c06044f)), closes [#145](https://github.com/jwalton/node-amqp-connection-manager/issues/145)

# [3.4.0](https://github.com/jwalton/node-amqp-connection-manager/compare/v3.3.0...v3.4.0) (2021-08-25)

### Features

- Convert to typescript, add module exports. ([5f442b1](https://github.com/jwalton/node-amqp-connection-manager/commit/5f442b139dfe15468fef32022b87f409cd781a78))

# [3.3.0](https://github.com/jwalton/node-amqp-connection-manager/compare/v3.2.4...v3.3.0) (2021-08-24)

### Bug Fixes

- emit setup errors not caused by closed channel ([7c5fe10](https://github.com/jwalton/node-amqp-connection-manager/commit/7c5fe104c5333086a8b06bc28f451b4f22cc489d)), closes [#95](https://github.com/jwalton/node-amqp-connection-manager/issues/95)
- setup on channel/connection closing/closed ([b21bd01](https://github.com/jwalton/node-amqp-connection-manager/commit/b21bd0173dc60712cedfd398161e52b6f621bf2a))

### Features

- immediately reconnect on amqplib connect timeout ([ad06108](https://github.com/jwalton/node-amqp-connection-manager/commit/ad0610878f0aba27cc5078a6d1e61420a77b7965))

## [3.2.4](https://github.com/jwalton/node-amqp-connection-manager/compare/v3.2.3...v3.2.4) (2021-08-23)

### Bug Fixes

- connection close not awaited ([8955fe7](https://github.com/jwalton/node-amqp-connection-manager/commit/8955fe7ee8f52505b629ee091f3658dfeb425c37))

## [3.2.3](https://github.com/jwalton/node-amqp-connection-manager/compare/v3.2.2...v3.2.3) (2021-08-21)

### Bug Fixes

- fixed issue with publish ignoring 'drain' event ([e195d9b](https://github.com/jwalton/node-amqp-connection-manager/commit/e195d9bc29907de49eec5e09aea3bba0b894d965)), closes [#129](https://github.com/jwalton/node-amqp-connection-manager/issues/129)

## [3.2.2](https://github.com/jwalton/node-amqp-connection-manager/compare/v3.2.1...v3.2.2) (2021-02-09)

### Bug Fixes

- When messages are acked/nacked, make sure we remove the correct message from the sent messages queue. ([c662026](https://github.com/jwalton/node-amqp-connection-manager/commit/c662026bc287e684a0f43ce2de7a44b80a88e8ff)), closes [#142](https://github.com/jwalton/node-amqp-connection-manager/issues/142)

## [3.2.1](https://github.com/jwalton/node-amqp-connection-manager/compare/v3.2.0...v3.2.1) (2020-09-12)

### Bug Fixes

- Push never resolves if error occured (courtesy @SSANSH). ([48a78f8](https://github.com/jwalton/node-amqp-connection-manager/commit/48a78f8de5d39002035b37f27fc3e0ce5015490c))
- **package:** resolve hanging retry connection timeout by introducing cancelable timeout ([e37dd1a](https://github.com/jwalton/node-amqp-connection-manager/commit/e37dd1a4e423012910d31ae8bcebf781cac6f3b5))

# [3.2.0](https://github.com/jwalton/node-amqp-connection-manager/compare/v3.1.1...v3.2.0) (2020-01-20)

### Features

- add bindQueue and assertExchange on ChannelWrapper ([879e522](https://github.com/jwalton/node-amqp-connection-manager/commit/879e522))

## [3.1.1](https://github.com/jwalton/node-amqp-connection-manager/compare/v3.1.0...v3.1.1) (2020-01-06)

### Bug Fixes

- typo ([6055b02](https://github.com/jwalton/node-amqp-connection-manager/commit/6055b02))

# [3.1.0](https://github.com/jwalton/node-amqp-connection-manager/compare/v3.0.0...v3.1.0) (2019-12-06)

### Features

- Allow using URL object to connect, same format as amqplib accepts. ([f046680](https://github.com/jwalton/node-amqp-connection-manager/commit/f046680))

# [3.0.0](https://github.com/jwalton/node-amqp-connection-manager/compare/v2.3.3...v3.0.0) (2019-07-04)

### Continuous Integration

- Stop running tests for node 6 and node 8. ([164b882](https://github.com/jwalton/node-amqp-connection-manager/commit/164b882))

### BREAKING CHANGES

- Officially drop support for node 6 and node 8 (although they will probably still
  work).

## [2.3.3](https://github.com/jwalton/node-amqp-connection-manager/compare/v2.3.2...v2.3.3) (2019-06-25)

### Bug Fixes

- **package:** update promise-breaker to version 5.0.0 ([ed91042](https://github.com/jwalton/node-amqp-connection-manager/commit/ed91042))

## [2.3.2](https://github.com/jwalton/node-amqp-connection-manager/compare/v2.3.1...v2.3.2) (2019-05-21)

### Bug Fixes

- Null delta to get semantic-release to pick up [#65](https://github.com/jwalton/node-amqp-connection-manager/issues/65). Fix [#84](https://github.com/jwalton/node-amqp-connection-manager/issues/84). ([9737135](https://github.com/jwalton/node-amqp-connection-manager/commit/9737135))

## [2.3.1](https://github.com/jwalton/node-amqp-connection-manager/compare/v2.3.0...v2.3.1) (2019-04-01)

### Bug Fixes

- prevent too many connection attempts on error ([2760ce5](https://github.com/jwalton/node-amqp-connection-manager/commit/2760ce5)), closes [#77](https://github.com/jwalton/node-amqp-connection-manager/issues/77)

# [2.3.0](https://github.com/jwalton/node-amqp-connection-manager/compare/v2.2.0...v2.3.0) (2018-11-20)

### Features

- Add ChannelWrapper.ackAll() and ChannelWrapper.nackAll(). ([0246695](https://github.com/jwalton/node-amqp-connection-manager/commit/0246695)), closes [#60](https://github.com/jwalton/node-amqp-connection-manager/issues/60)

# [2.2.0](https://github.com/jwalton/node-amqp-connection-manager/compare/v2.1.2...v2.2.0) (2018-09-25)

### Features

- Set 'this' to be the channel wrapper in the setup function. ([551200f](https://github.com/jwalton/node-amqp-connection-manager/commit/551200f))

## [2.1.2](https://github.com/jwalton/node-amqp-connection-manager/compare/v2.1.1...v2.1.2) (2018-09-13)

### Bug Fixes

- Export a default object from root module. ([78893c9](https://github.com/jwalton/node-amqp-connection-manager/commit/78893c9)), closes [#51](https://github.com/jwalton/node-amqp-connection-manager/issues/51)

## [2.1.1](https://github.com/jwalton/node-amqp-connection-manager/compare/v2.1.0...v2.1.1) (2018-09-05)

### Bug Fixes

- Remove reconnection listener when closing the connection manager. ([eeb6e2b](https://github.com/jwalton/node-amqp-connection-manager/commit/eeb6e2b))

# [2.1.0](https://github.com/jwalton/node-amqp-connection-manager/compare/v2.0.0...v2.1.0) (2018-08-09)

### Features

- Support for per URL connection options ([ec2d484](https://github.com/jwalton/node-amqp-connection-manager/commit/ec2d484)), closes [#29](https://github.com/jwalton/node-amqp-connection-manager/issues/29) [#34](https://github.com/jwalton/node-amqp-connection-manager/issues/34) [#44](https://github.com/jwalton/node-amqp-connection-manager/issues/44)

<a name="2.0.0"></a>

# [2.0.0](https://github.com/jwalton/node-amqp-connection-manager/compare/v1.4.2...v2.0.0) (2018-05-05)

### Code Refactoring

- Rewrite all source in javascript. ([377d01d](https://github.com/jwalton/node-amqp-connection-manager/commit/377d01d))

### BREAKING CHANGES

- Officially dropping support for node v4.x.x.

# 1.4.0

- Add 'blocked' and 'unblocked' events (#25).

# 1.3.7

- Fix bug where we would stop sending messages if remote gracefully closes connection.

# 1.3.6

- Fix bug where ChannelWrapper would expect setup function to return a Promise
  and not accept a callback if channel was already connected.
