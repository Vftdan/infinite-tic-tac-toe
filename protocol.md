Client sends single object messages to server. Server sends array of objects messages to client.

Each object contains field `method` and method-dependent fields.

For network transmission messages are encoded as JSON and sent via text WebSocket frames.

## Client to server

### `register`

### `login`

 * `id`: string
 * `token`: string

### `fetchGameState`

Request the server to send all the events needed to syncronize client with server's game state no matter what client's current state is.

### `hostGame`

Can only be sent after `hostGameAvailable` call.

### `joinRoom`

Can only be sent after `joinRoomAvailable` call.

 * `id`: string, id of the room

### `acceptJoinRoom`

 * `id`: string, id of the client

### `newGame`

### `placeSymbol`

When sending this event, field ui should be locked from placing new symbols by user.

 * `x`
 * `y`

## Server to client

### `authComlete`

### `setCredentials`

 * `id`: string
 * `token`: string

### `hostGameAvailable`

Sent by a server that implements `hostGame` method.

### `joinRoomAvailable`

Sent by a server that implements `joinRoom` method.

### `setRoomId`

 * `id`: string, id of the room

### `joinRoomRequest`

 * `id`: string, id of the client

### `clearField`

### `placeSymbol`

 * `x`
 * `y`
 * `symbol`: `0` to remove, `1` for crosses, `2` for noughts

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

### `showInfo`

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
