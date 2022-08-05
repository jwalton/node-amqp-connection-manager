## [4.1.4](https://github.com/jwalton/node-amqp-connection-manager/compare/v4.1.3...v4.1.4) (2022-08-05)

### Bug Fixes

- import of promise breaker ([d873885](https://github.com/jwalton/node-amqp-connection-manager/commit/d87388550d85e8326f6d91b6f86819809e1401ae)), closes [#234](https://github.com/jwalton/node-amqp-connection-manager/issues/234)

## [4.1.3](https://github.com/jwalton/node-amqp-connection-manager/compare/v4.1.2...v4.1.3) (2022-05-04)

### Bug Fixes

- accept 0 for heartbeatIntervalInSeconds ([208af68](https://github.com/jwalton/node-amqp-connection-manager/commit/208af6875bacda01b5a75be52f631bd71b4eafcd))

## [4.1.2](https://github.com/jwalton/node-amqp-connection-manager/compare/v4.1.1...v4.1.2) (2022-04-13)

### Bug Fixes

- **types:** Export PublishOptions type. ([6d20252](https://github.com/jwalton/node-amqp-connection-manager/commit/6d2025204d3adc050f916c2c116c9ac8db36114c))

## [4.1.1](https://github.com/jwalton/node-amqp-connection-manager/compare/v4.1.0...v4.1.1) (2022-02-05)

### Bug Fixes

- process unable to exit after connect ([8d572b1](https://github.com/jwalton/node-amqp-connection-manager/commit/8d572b1899f3739bb887104dd992aff6722f137a))

# [4.1.0](https://github.com/jwalton/node-amqp-connection-manager/compare/v4.0.1...v4.1.0) (2022-02-01)

### Features

- cancel specific consumer ([5f3b2eb](https://github.com/jwalton/node-amqp-connection-manager/commit/5f3b2eb1ab20d2fc63054192632a80d78a7934a2))

## [4.0.1](https://github.com/jwalton/node-amqp-connection-manager/compare/v4.0.0...v4.0.1) (2022-01-21)

### Bug Fixes

- accept type of amqplib.credentials.external() ([1db3b2d](https://github.com/jwalton/node-amqp-connection-manager/commit/1db3b2d5339387124c9b7b43192b7d93db7b1702))

# [4.0.0](https://github.com/jwalton/node-amqp-connection-manager/compare/v3.9.0...v4.0.0) (2022-01-07)

### Bug Fixes

- Emit `connectFailed` on connection failure. ([0f05987](https://github.com/jwalton/node-amqp-connection-manager/commit/0f05987af16db25954fb83de4e0bed05e71121cf)), closes [#222](https://github.com/jwalton/node-amqp-connection-manager/issues/222)

### Continuous Integration

- Stop testing on node 10 and 12. ([5da9cb0](https://github.com/jwalton/node-amqp-connection-manager/commit/5da9cb034ec1f311677fd0db3931176ee2797dc2))

### BREAKING CHANGES

- No longer running unit tests on node 10 and 12, although this package may continue to work on these.
- We will no longer emit a `disconnect` event on an
  initial connection failure - instead we now emit `connectFailed` on each
  connection failure, and only emit `disconnect` when we transition from
  connected to disconnected.

# [3.9.0](https://github.com/jwalton/node-amqp-connection-manager/compare/v3.8.1...v3.9.0) (2022-01-04)

### Features

- proxying every exchange function of amqplib ([bca347c](https://github.com/jwalton/node-amqp-connection-manager/commit/bca347c437ec116249a671b4b903d7668e097cf8))

## [3.8.1](https://github.com/jwalton/node-amqp-connection-manager/compare/v3.8.0...v3.8.1) (2021-12-29)

### Bug Fixes

- batch sending stops ([6a5b589](https://github.com/jwalton/node-amqp-connection-manager/commit/6a5b5890de3e2d543e27f4c078d27dc32b8b23d9)), closes [#196](https://github.com/jwalton/node-amqp-connection-manager/issues/196)

# [3.8.0](https://github.com/jwalton/node-amqp-connection-manager/compare/v3.7.0...v3.8.0) (2021-12-29)

### Features

- plain channel ([328d31d](https://github.com/jwalton/node-amqp-connection-manager/commit/328d31d758ad32df49c8fe03d89b1f6d06a9465b))

# [3.7.0](https://github.com/jwalton/node-amqp-connection-manager/compare/v3.6.0...v3.7.0) (2021-09-21)

### Bug Fixes

- **AmqpConnectionManager:** IAmqpConnectionManager interface definition ([dedec7e](https://github.com/jwalton/node-amqp-connection-manager/commit/dedec7e24f12395e4ff2424d5f4026a5551ba064))

### Features

- add default publish timeout ([6826be2](https://github.com/jwalton/node-amqp-connection-manager/commit/6826be26ab6ed786832251ee06ff7bfc303d775c))
- expose AmqpConnectionManagerClass ([835a81f](https://github.com/jwalton/node-amqp-connection-manager/commit/835a81f0c953d5ab2a01611d277478d5b78aa8b0))
- timeout option for publish ([dee380d](https://github.com/jwalton/node-amqp-connection-manager/commit/dee380d7ed70cc801166e8859fff5e66bd6b9ece))

# [3.6.0](https://github.com/jwalton/node-amqp-connection-manager/compare/v3.5.2...v3.6.0) (2021-08-27)

### Features

- reconnect and cancelAll consumers ([fb0c00b](https://github.com/jwalton/node-amqp-connection-manager/commit/fb0c00becc224ffedd28e810cbb314187d21efdb))

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
