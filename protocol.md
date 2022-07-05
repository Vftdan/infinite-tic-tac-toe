Client sends single object messages to server. Server sends array of objects messages to client.

Each object contains field `method` and method-dependent fields.

For network transmission messages are encoded as JSON and sent via text WebSocket frames.

## Client to server

### `newGame`

### `placeSymbol`

When sending this event, field ui should be locked from placing new symbols by user.

 * `x`
 * `y`

## Server to client

### `clearField`

### `placeSymbol`

 * `symbol`: `1` for crosses, `2` for noughts
 * `x`
 * `y`

### `setLocalPlayer`

Sets the player of the target client.

 * `player`: `1` for crosses, `2` for noughts

### `setCurrentPlayer`

Sets the player that is currently placing the symbol.

 * `player`: `1` for crosses, `2` for noughts

### `waitSymbol`

Unlocks field ui. Exactly one `placeSymbol` message is expected after this.
Is expected to be sent with `setCurrentPlayer` equal to local player.

### `showError`

 * `text`: string

### `winGame`

Sent when any player wins the game.

 * `player`: `1` for crosses, `2` for noughts
 * `start`: first point of winning line
   * x
   * y
 * `end`: last point of winning line
   * x
   * y
