1.3.7
-----

* Fix bug where we would stop sending messages if remote gracefully closes connection.

1.3.6
-----

* Fix bug where ChannelWrapper would expect setup function to return a Promise
  and not accept a callback if channel was already connected.
